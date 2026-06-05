# Handoff: Shared WASM Module Panic Cascade

**Date:** 2026-05-23 (updated 2026-06-05)
**Status:** FIXED — cascade-retire complete + NP OOB resolved (session 46) + NP lazy_static borrow-window fix (session 47) + NP regex Pool&lt;Cache&gt; pre-warm fix (session 48) + JS FinalizationRegistry stale-callback fix (session 50)
**Priority:** Low (WASM falls back to JS gracefully; correctness unaffected)

---

## Problem Summary

All 6 WASM wrappers import `init` from the same binary (`src/wasm/translation_wasm_core.js`). Any Rust panic (`panic = "abort"`) corrupts the shared `dlmalloc` state permanently. Subsequent calls to any WASM struct trigger `alloc/src/rc.rs: hint::assert_unchecked` (Rust 1.84+ UB precondition check, previously silent UB).

Wrappers affected: WasmNumberProcessor, WasmPatternProcessor, WasmTextAssembler, WasmTextChunker, WasmDictionaryManager, WasmConflictResolution, WasmStringProcessor.

---

## What Is Fixed (2026-05-23 → 2026-05-30)

### Session 44 (2026-05-30): `serde_wasm_bindgen` → `serde_json` + `WasmCascadeRegistry`

**Root cause of Rc borrow violation (now fixed):** All WASM structs previously used `serde_wasm_bindgen::from_value(JsValue)` / `serde_wasm_bindgen::to_value(&T)` inside `#[wasm_bindgen]` methods. This calls `__wbindgen_malloc` while the wasm-bindgen `RcRefMut` borrow is live. In Rust 1.84+ debug builds, `alloc/rc.rs` fires `hint::assert_unchecked` when the allocator touches the RC count during an active borrow — causing the OOB trap.

**Fix applied:** Changed all WASM boundary calls to `serde_json`:

- Rust side: `&str` params + `String` returns; `serde_json::from_str` / `serde_json::to_string`
- JS side: `JSON.stringify(data)` before call; `JSON.parse(result)` after
- Affected: `number_processor.rs`, `segment_matcher.rs`, `string_processor.rs`, `text_chunker.rs`, `lib.rs` (`load_dictionary`, `load_dictionaries_batch`), `pattern_processor/wasm_wrapper.rs`

**WasmCascadeRegistry.js (new file):**

Centralized registry replacing per-wrapper manual imports:

```js
registerCascadeHandler(fn); // called once at module load by each wrapper
fireCascadeRetire(); // called in every panic catch block
```

No circular-dep risk — `WasmCascadeRegistry.js` imports nothing. All 6 wrappers (+ WasmStringProcessor) now register + fire through it.

**Other fixes in this session:**

- `WasmStringProcessor.js` — added cascade registration, error handling in `buildCache`, `retireOnSharedModulePanic()` method
- `WasmDictionaryManager.js` — `getDictionaryCount()` + `getTotalEntries()` now check `_sharedModuleCorrupted` (was: `initialized` only)
- `WasmConflictResolution.js` — both catch blocks replaced manual `initialized=false` with `retireWasmConflictResolutionOnSharedPanic()` (was: missing `initializationPromise = null`)
- `SegmentPrecomputer.ts:728` — `nextBoundaryMatch === 0` now advances 1 instead of skipping `remainingText.length` (was: infinite loop at position 0 boundary)

### Sessions 23–27 (2026-05-23): Cascade-retire wired across all 6 wrappers

Every panic catch now retires all sibling wrappers atomically (via WasmCascadeRegistry as of session 44):

| Primary panic                                        | Retires                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| WasmPatternProcessor                                 | TextAssembler, TextChunker, DictionaryManager, ConflictResolution |
| WasmNumberProcessor                                  | TextAssembler, TextChunker, DictionaryManager, ConflictResolution |
| WasmTextChunker                                      | TextAssembler, DictionaryManager, ConflictResolution              |
| WasmDictionaryManager (findMatches/findLongestMatch) | TextAssembler + self via `_sharedModuleCorrupted`                 |
| WasmConflictResolution (Phase 2 + Phase 4)           | TextAssembler, TextChunker, DictionaryManager                     |
| WasmTextAssembler                                    | self-retires in own catch                                         |
| WasmStringProcessor                                  | TextAssembler, TextChunker, DictionaryManager, ConflictResolution |

Circular dep constraint: `WasmTextChunker` imports `WasmDictionaryManager`; therefore `WasmDictionaryManager` cannot import `WasmTextChunker` (TC→DM→TC circular). DM cascade omits TC — acceptable since TC fires before DM in the pipeline. `WasmCascadeRegistry` breaks this by providing a dep-free fire point.

### `lifecycle.permanentlyFail()` replaces `lifecycle.reset()` for panic paths

`WasmProcessorLifecycle.reset()` clears `_hasFailed = false`, allowing re-init from the same corrupted binary. `permanentlyFail()` sets `_hasFailed = true` permanently. NP and PP call it in their panic catch blocks.

---

## Session 46: NP OOB Fixed (2026-05-30) — See History Below

The `RuntimeError: Out of bounds memory access` in `numberprocessor_processTokens` was fixed in session 46 by emptying `NumberProcessor` struct and moving `number_map` to `lazy_static! { static ref NUMBER_MAP }`, pre-initialized in `new()`. Full investigation notes retained below.

**WASM binary hash after session 46: `2a61115456695c49`**

---

## Session 47: NP Intermittent `alloc/rc.rs:3743` Fixed (2026-05-31)

### Error

```
panicked at /...alloc/src/rc.rs:3743:13:
unsafe precondition(s) violated: hint::assert_unchecked must never be called when the condition is false
  numberprocessor_processTokens multivalue shim
  processTokens (translation_wasm_core.js:777)
  processNumbersWasm (WasmNumberProcessor.js:127)
```

### Root cause

Session 46 pre-initialized `NUMBER_MAP` in `new()` but NOT the 6 parsing regexes (`THOUSANDS_RE`, `HUNDREDS_ZERO_RE`, `HUNDREDS_RE`, `ZERO_TENS_RE`, `TENS_RE`, `IMPLICIT_TENS_PARSE_RE`) or `PATTERNS` (16 conversion Regex objects).

The first `processTokens` call that processes compound Chinese numbers (thousands, hundreds) triggers `parse_chinese_number`, which accesses `THOUSANDS_RE` and friends. `PATTERNS.iter()` is also accessed on every call. Both lazy_static initializations fire **while the wasm-bindgen `RcRefMut<NumberProcessor>` borrow is live**, causing Rust 1.84 debug builds to fire `hint::assert_unchecked` at `alloc/rc.rs:3743`.

**Why intermittent:** lazy_static initializes once — only the first translation containing compound numbers triggers it. Subsequent calls (or input with only simple/no numbers) do not.

### Fix (session 47)

Pre-initialize ALL lazy_statics in `new()`:

```rust
let _ = &*NUMBER_MAP;
let _ = &*PATTERNS;
let _ = &*THOUSANDS_RE;
let _ = &*HUNDREDS_ZERO_RE;
let _ = &*HUNDREDS_RE;
let _ = &*ZERO_TENS_RE;
let _ = &*TENS_RE;
let _ = &*IMPLICIT_TENS_PARSE_RE;
```

- 191 Rust tests pass
- **WASM binary hash: `fe547c8d43918889`** (2026-05-31)

### General rule

**Any `#[wasm_bindgen]` method that accesses a lazy_static on its first call will violate the Rc borrow-window invariant in Rust 1.84+ debug builds.** Pre-initialize ALL lazy_statics in the constructor, outside the `&self` borrow window.

---

## Session 48: NP `rt/mod.rs:287` Subtract-Overflow Fixed (2026-06-05)

### Error

```
panicked at /...wasm-bindgen-0.2.100/src/rt/mod.rs:287:25:
attempt to subtract with overflow
  numberprocessor_processTokens multivalue shim
  processTokens (translation_wasm_core.js:777)
  processNumbersWasm (WasmNumberProcessor.js:127)
  processNumbers (NumberProcessingAdapter.js:37)
  TranslationEngine.js:6005
```

### Root cause

`regex 1.11.2` / `regex-automata 0.4.10`'s `Pool<Cache, F>` (in `pool.rs`) allocates its `Cache` lazily on the **first search call** — not at `Regex::new()` time. `Pool::get_slow` (line 562) calls `(self.create)()` (heap alloc) when the thread-local `THREAD_ID` doesn't match `owner`. This fires during the first `process_tokens` call that exercises number patterns, **inside the `WasmRefCell<NumberProcessor>` borrow window**.

The `Drop for Ref<'_, T>` impl at `rt/mod.rs:287` does `self.borrow.set(self.borrow.get() - 1)`. When the borrow count has been corrupted to 0 mid-call (by the alloc inside the borrow window), drop subtracts from 0 → unsigned overflow → panic. This is a **different mechanism from session 47** (`alloc/rc.rs:3743` fired from `std::sync::Once` inside lazy_static), but the same borrow-window root category.

**Why different from s47:** s47 fixed lazy_static initialization (one-time `std::sync::Once`). The regex `Pool<Cache>` allocates its per-thread cache separately from the static initialization — pre-touching `&*PATTERNS` does not warm the `Pool`. Only calling `.find()` / `.captures()` does.

### Fix (session 48)

Added regex DFA cache pre-warming block in `new()`, after the existing lazy_static pre-inits:

```rust
// Pre-warm regex-automata Pool<Cache> (regex 1.11 / regex-automata 0.4.x).
// Regex::new() builds the NFA/DFA but each Regex owns a Pool<Cache, F> whose
// Cache is allocated lazily by Pool::get_slow on the FIRST search call — not at
// construction time. That allocation fires inside process_tokens (inside the
// WasmRefCell<NumberProcessor> &self borrow window), corrupting the borrow count
// and causing Drop for Ref<'_, T> to panic with "attempt to subtract with overflow"
// at rt/mod.rs:287. Running a dummy find("") here forces Pool::get_slow to run
// before any &self borrow window exists.
let dummy = "";
for pattern in PATTERNS.iter() {
    let _ = pattern.regex.find(dummy);
}
let _ = THOUSANDS_RE.find(dummy);
let _ = HUNDREDS_ZERO_RE.find(dummy);
let _ = HUNDREDS_RE.find(dummy);
let _ = ZERO_TENS_RE.find(dummy);
let _ = TENS_RE.find(dummy);
let _ = IMPLICIT_TENS_PARSE_RE.find(dummy);
```

- 191 Rust tests pass (4 ignored)
- **WASM binary hash: `1fb09d60bb1916a7`** (2026-06-05)

### Updated general rule

Any `#[wasm_bindgen]` struct method that touches a lazy_static OR calls `.find()`/`.captures()` on a `regex::Regex` for the first time will violate the wasm-bindgen borrow-window invariant in Rust 1.84+ debug builds. Four known Rust-side categories + one JS-side category:

1. **`serde_wasm_bindgen` inside method** — calls `__wbindgen_malloc` (s44 fix: use `serde_json` strings)
2. **`lazy_static!` first access inside method** — `std::sync::Once` init allocates (s47 fix: pre-touch all statics in `new()`)
3. **`regex::Regex::find/captures` first call inside method** — `regex-automata Pool<Cache>` lazy-allocates thread-local cache (s48 fix: run `.find("")` on all Regexes in `new()`)
4. **JS FinalizationRegistry stale callback** — JS-side category, not Rust borrow-window. When a `#[wasm_bindgen]` struct's JS wrapper is nulled without calling `.free()`, the FinalizationRegistry callback stays registered. If dlmalloc reuses the freed Rc address for a new instance, the stale callback fires and decrements the NEW instance's Rc strong count to 0. Next method call: `Rc::increment_strong_count` reads count=0 → `inc_strong` fires `hint::assert_unchecked` at `alloc/rc.rs` (line 3743 in Rust 1.84, 3753 in Rust 1.96 — same check, line shifted by toolchain update). Fix: call `instance.__destroy_into_raw()` (not `.free()`) before nulling — unregisters FinalizationRegistry without calling into possibly-corrupted WASM.

---

## Session 46 Investigation Notes (OOB)

### Error

```
[Error] ❌ WASM number processing wasm_runtime error:
RuntimeError: Out of bounds memory access
  (evaluating 'wasm.numberprocessor_processTokens(this.__wbg_ptr, ptr0, len0)')
  processNumbersWasm (WasmNumberProcessor.js:144)
  processNumbers (NumberProcessingAdapter.js:37)
  (anonymous function) (TranslationEngine.js:5998)
```

The `ptr0, len0` signature confirms the `serde_json` fix is applied. NP panicked on its own first call. Cascade correctly retired siblings.

**Root cause:** `self.number_map` was a heap-allocated `HashMap<char, u32>` field. Dereferencing through `this.__wbg_ptr → struct → HashMap ctrl → bucket array` caused the OOB. Fix: emptied `NumberProcessor` struct; moved `number_map` to `lazy_static! { static ref NUMBER_MAP }` pre-initialized in `new()`.

**Cleanup done (session 46):**

- Removed 4 `[NP]` diagnostic `console::log_1` calls from `process_tokens`
- Removed `warmup()` method (was no-op, not called from JS)
- Removed `'warmup'` from `expectedMethods` in `WasmNumberProcessor.js`
- Binary rebuilt: `2a61115456695c49`

---

## Key Files

| File                                           | Role                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/utils/wasm/WasmCascadeRegistry.js`        | **New (session 44)** — dep-free cascade registry; all wrappers register + fire here               |
| `src/utils/wasm/WasmNumberProcessor.js`        | Cascade + permanentlyFail; OOB fixed (s46), lazy_static borrow-window fixed (s47)                 |
| `src/utils/wasm/WasmPatternProcessor.js`       | Cascade + permanentlyFail                                                                         |
| `src/utils/wasm/WasmTextAssembler.js`          | `retireOnSharedModulePanic()` method, self-retires in own catch                                   |
| `src/utils/wasm/WasmTextChunker.js`            | Cascade fixed; imports DM (DM cannot import TC back — use WasmCascadeRegistry instead)            |
| `src/utils/wasm/WasmDictionaryManager.js`      | `_sharedModuleCorrupted` flag + `getDictionaryCount`/`getTotalEntries` guard fixed                |
| `src/utils/wasm/WasmConflictResolution.js`     | `retireWasmConflictResolutionOnSharedPanic()` export; cascades TA/TC/DM                           |
| `src/utils/wasm/WasmStringProcessor.js`        | **Updated (session 44)** — cascade registered; buildCache error handling added                    |
| `src/utils/wasm/WasmProcessorLifecycle.js`     | `permanentlyFail()` method                                                                        |
| `src/utils/highlighting/SegmentPrecomputer.ts` | **Fixed (session 44)** — infinite loop at boundary pos 0                                          |
| `wasm-core/src/number_processor.rs`            | **Updated (session 48)** — all 8 lazy_statics + all regex Pool&lt;Cache&gt; pre-warmed in `new()` |
