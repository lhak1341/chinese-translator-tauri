# Handoff: Shared WASM Module Panic Cascade

**Date:** 2026-05-23 (updated 2026-05-30)
**Status:** Cascade-retire complete — OOB in NumberProcessor still fires on first call (debug WASM only)
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

### Root cause hypothesis: WASM shadow stack exhaustion

`cargo test` passes (191 Rust tests, including NP unit tests) → bug is WASM-specific.

Diagnosis per `wasm-core/CLAUDE.md`:

> Typically debug shadow stack exhaustion from unoptimized code. Fix by reducing work before touching expensive lazy statics (e.g. pre-check before `PATTERNS.iter()`).

In `wasm-core/src/number_processor.rs:385`:

```rust
for pattern in PATTERNS.iter() {   // ← fires PATTERNS lazy_static on first call
```

`PATTERNS` is a `lazy_static!` defined at line 90 — a `Vec<ConversionPattern>` of 16 compiled regex patterns. The first call to `processTokens` triggers:

1. `serde_json::from_str(tokens_json)` — recursive JSON parse of a full token array (deep stack in debug)
2. `PATTERNS` lazy_static init — `create_conversion_patterns()` compiles 16 regexes (deep stack in debug)
3. Per-token: `for pattern in PATTERNS.iter()` — 16 × N iterations with regex matching

Combined stack depth in unoptimized (`--dev`) WASM exceeds the 1MB WASM shadow stack. Release WASM (`pnpm build-wasm`) eliminates this via inlining and optimization.

### Fix options

**Option A (quick, no code change):** Use release WASM in development.

```bash
pnpm build-wasm   # release profile — stack depth drops 5-10x
```

Downside: slower rebuild, no debug info.

**Option B (code fix):** Add an early-return pre-check in `process_tokens` before the lazy_static fires.
In `number_processor.rs` around line 385, before `for pattern in PATTERNS.iter()`:

```rust
// Pre-check: skip number pattern matching if token has no numeric content
if !token.value.chars().any(|c| c.is_numeric() || "一二两三四五六七八九十百千万亿".contains(c)) {
    i += 1;
    continue;
}
for pattern in PATTERNS.iter() {
```

This avoids touching `PATTERNS` on non-numeric tokens, reducing hot-path stack pressure. It also makes `PATTERNS` init lazy beyond the first actual numeric token (deferring the expensive init past the initial serde_json parse stack frame).

**Option C (architectural):** Warm up `PATTERNS` via a dedicated `warmup()` function called during NP initialization, before `processTokens` is ever called. The warmup call stack is shallower (no serde_json parse active). This separates the two deep-stack triggers.

---

## Key Files

| File                                           | Role                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/utils/wasm/WasmCascadeRegistry.js`        | **New (session 44)** — dep-free cascade registry; all wrappers register + fire here    |
| `src/utils/wasm/WasmNumberProcessor.js`        | Cascade + permanentlyFail; primary OOB source                                          |
| `src/utils/wasm/WasmPatternProcessor.js`       | Cascade + permanentlyFail                                                              |
| `src/utils/wasm/WasmTextAssembler.js`          | `retireOnSharedModulePanic()` method, self-retires in own catch                        |
| `src/utils/wasm/WasmTextChunker.js`            | Cascade fixed; imports DM (DM cannot import TC back — use WasmCascadeRegistry instead) |
| `src/utils/wasm/WasmDictionaryManager.js`      | `_sharedModuleCorrupted` flag + `getDictionaryCount`/`getTotalEntries` guard fixed     |
| `src/utils/wasm/WasmConflictResolution.js`     | `retireWasmConflictResolutionOnSharedPanic()` export; cascades TA/TC/DM                |
| `src/utils/wasm/WasmStringProcessor.js`        | **Updated (session 44)** — cascade registered; buildCache error handling added         |
| `src/utils/wasm/WasmProcessorLifecycle.js`     | `permanentlyFail()` method                                                             |
| `src/utils/highlighting/SegmentPrecomputer.ts` | **Fixed (session 44)** — infinite loop at boundary pos 0                               |
| `wasm-core/src/number_processor.rs:385`        | `PATTERNS.iter()` — lazy_static that triggers shadow stack OOB on first WASM call      |
| `wasm-core/src/number_processor.rs:70,90`      | Two `lazy_static!` blocks — `CHINESE_NUMBER_CHARS` and `PATTERNS`                      |
