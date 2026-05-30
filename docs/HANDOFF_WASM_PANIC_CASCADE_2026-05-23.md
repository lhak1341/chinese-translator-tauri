# Handoff: Shared WASM Module Panic Cascade

**Date:** 2026-05-23 (updated 2026-05-30)
**Status:** FIXED — cascade-retire complete + NP OOB resolved (session 46)
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

## Remaining Issue: OOB in NumberProcessor (debug WASM only)

### Error

```
[Error] ❌ WASM number processing wasm_runtime error:
RuntimeError: Out of bounds memory access
  (evaluating 'wasm.numberprocessor_processTokens(this.__wbg_ptr, ptr0, len0)')
  processNumbersWasm (WasmNumberProcessor.js:144)
  processNumbers (NumberProcessingAdapter.js:37)
  (anonymous function) (TranslationEngine.js:5998)
```

### This is a PRIMARY panic (not secondary cascade)

The `ptr0, len0` signature confirms the `serde_json` fix is applied (it's passing a `&str`, not `JsValue`). NP panics on its own first call, not after being corrupted by a sibling wrapper. The cascade correctly retires all siblings after NP catches it, but NP itself has already OOB'd.

### Root cause investigation (Session 45)

**Ruled out: shadow stack exhaustion.** Session 45 verified:

- Binary has `global[0] = 4194304 (0x400000)` — shadow stack IS 4MB
- Initial memory: 76 pages = 4.86MB
- OOB persists with 4MB stack → NOT shadow stack overflow

**What was tried (ineffective):**

- Option C: `warmup()` `&self` method calling `PATTERNS.len()` — PATTERNS pre-initialized but OOB persists
- RUSTFLAGS `-C link-arg=-z -C link-arg=stack-size=4194304` in `build-wasm-dev` — shadow stack increased to 4MB, OOB persists

**Session 45 confirmed findings:**

1. **Shadow stack exhaustion hypothesis DISPROVED.** Binary inspection confirmed:
   - `global[0] = 4194304 (0x400000)` — shadow stack IS 4MB (set by RUSTFLAGS)
   - Initial memory: 76 pages = 4.86MB (heap starts at 4MB)
   - OOB persists with 4MB stack → NOT shadow stack overflow

2. **OOB is INSIDE `process_tokens` function body** (not in generated wrapper):
   - `web_sys::console::log_1` at function entry fires → OOB comes after
   - Wrapper generates correctly, self_ptr valid

3. **warmup() causes secondary heap corruption → TC failure:**
   - `instance.warmup()` calls `PATTERNS.len()` → initializes 16 regex objects (potentially 10-50MB of DFA tables)
   - These large allocations corrupt dlmalloc state for adjacent structs
   - `TextChunker.chunkText` subsequently fires `alloc/rc.rs:3743: hint::assert_unchecked` (Rc strong count = 0 = use-after-free)
   - warmup() removed from JS init — TextChunker failure should stop

4. **Two separate failures:**
   - **Primary:** NP OOBs on first `processTokens` call (exact location TBD)
   - **Secondary:** TC Rc violation on second translation (caused by heap corruption from NP's primary OOB)
   - warmup() was a THIRD problem — introduced by session 45 fix attempt — now removed from JS

**Staged log result (session 46, 2026-05-30):**

- `[NP] process_tokens entered, 1857 bytes` — fires ✓
- `[NP] deserialized 13 tokens` — fires ✓
- OOB fires before `[NP] first numeric token`

**Conclusion:** OOB is in the while loop filter condition, specifically `self.number_map.contains_key(&c)`. Accessing the heap-allocated `HashMap` through the struct raw pointer (`this.__wbg_ptr`) causes the OOB.

**Fix applied (session 46): Option D — `NumberProcessor` empty struct + `NUMBER_MAP` lazy_static**

Root cause: `self.number_map` was a heap-allocated `HashMap<char, u32>` field inside a `Box<NumberProcessor>`. Dereferencing through `this.__wbg_ptr` → struct → HashMap → ctrl (bucket array) caused the OOB. Moving to `lazy_static! { static ref NUMBER_MAP }` puts the HashMap in WASM static storage at a fixed known-valid address, eliminating the heap pointer chain.

Changes:

- `NumberProcessor` struct emptied (no fields, ZST-like)
- `NUMBER_MAP: HashMap<char, u32>` added as lazy_static (pre-initialized in `new()` outside the `&self` borrow window)
- `process_tokens` filter: `self.number_map.contains_key(&c)` → `NUMBER_MAP.contains_key(&c)`
- `get_number`: `self.number_map.get(&ch)` → `NUMBER_MAP.get(&ch)`
- All converter methods (`get_number`, `parse_chinese_number`, etc.) cascade-updated via `self.get_number()`
- 191 Rust tests pass, 0 errors
- New binary hash: `228f21fc97c58b72` (interim), `2a61115456695c49` (final, after cleanup)
- Tested: OOB gone, 3 successful `processTokens` calls confirmed in dev logs

**WASM binary hash: `2a61115456695c49`** (as of 2026-05-30, final clean build)

**Cleanup done (session 46):**

- Removed 4 `[NP]` diagnostic `console::log_1` calls from `process_tokens`
- Removed `warmup()` method (was no-op, not called from JS)
- Removed `'warmup'` from `expectedMethods` in `WasmNumberProcessor.js`
- Binary rebuilt: `2a61115456695c49`

### Fix options

**Option A (confirmed working):** Use release WASM in development.

```bash
pnpm build-wasm   # release profile — no OOB (opt-level=3 eliminates the issue)
```

Downside: slower rebuild, no debug info.

**Option B (code fix, not yet tried):** Add an early-return pre-check in `find_longest_number_match` before PATTERNS.iter(). Not expected to fix if root cause is the wrapper borrow issue.

**Option C (implemented, ineffective):** `warmup()` `&self` method to pre-initialize PATTERNS. Does not fix OOB.

**Option D (applied, session 46 — testing pending):** Emptied `NumberProcessor` struct; moved `number_map` to `lazy_static! { static ref NUMBER_MAP }` pre-initialized in `new()`. Eliminates heap pointer dereference chain `this.__wbg_ptr → struct → HashMap ctrl → bucket array`. JS interface unchanged (`instance.processTokens(json)` still works). See session 46 notes above for details.

---

## Key Files

| File                                           | Role                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/utils/wasm/WasmCascadeRegistry.js`        | **New (session 44)** — dep-free cascade registry; all wrappers register + fire here                                |
| `src/utils/wasm/WasmNumberProcessor.js`        | Cascade + permanentlyFail; primary OOB source                                                                      |
| `src/utils/wasm/WasmPatternProcessor.js`       | Cascade + permanentlyFail                                                                                          |
| `src/utils/wasm/WasmTextAssembler.js`          | `retireOnSharedModulePanic()` method, self-retires in own catch                                                    |
| `src/utils/wasm/WasmTextChunker.js`            | Cascade fixed; imports DM (DM cannot import TC back — use WasmCascadeRegistry instead)                             |
| `src/utils/wasm/WasmDictionaryManager.js`      | `_sharedModuleCorrupted` flag + `getDictionaryCount`/`getTotalEntries` guard fixed                                 |
| `src/utils/wasm/WasmConflictResolution.js`     | `retireWasmConflictResolutionOnSharedPanic()` export; cascades TA/TC/DM                                            |
| `src/utils/wasm/WasmStringProcessor.js`        | **Updated (session 44)** — cascade registered; buildCache error handling added                                     |
| `src/utils/wasm/WasmProcessorLifecycle.js`     | `permanentlyFail()` method                                                                                         |
| `src/utils/highlighting/SegmentPrecomputer.ts` | **Fixed (session 44)** — infinite loop at boundary pos 0                                                           |
| `wasm-core/src/number_processor.rs`            | **Updated (session 46)** — `NumberProcessor` now empty struct; `NUMBER_MAP` lazy_static pre-initialized in `new()` |
