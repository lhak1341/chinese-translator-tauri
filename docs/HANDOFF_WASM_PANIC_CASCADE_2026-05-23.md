# Handoff: Shared WASM Module Panic Cascade

**Date:** 2026-05-23 (updated 2026-05-27)
**Status:** Cascade-retire complete — root-cause of primary panic still unknown
**Priority:** Low (all WASM modules fall back to JS gracefully after any panic; correctness unaffected)

---

## Problem Summary

All 6 WASM wrappers import `init` from the same binary (`src/wasm/translation_wasm_core.js`). Any Rust panic (`panic = "abort"`) corrupts the shared `dlmalloc` state permanently. Subsequent calls to any WASM struct trigger `alloc/src/rc.rs: hint::assert_unchecked` (Rust 1.84+ UB precondition check, previously silent UB).

Wrappers affected: WasmNumberProcessor, WasmPatternProcessor, WasmTextAssembler, WasmTextChunker, WasmDictionaryManager, WasmConflictResolution.

---

## What Is Fixed (2026-05-23 → 2026-05-27)

### Cascade-retire wired across all 6 wrappers

Every panic catch now retires all sibling wrappers atomically:

| Primary panic                                        | Retires                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| WasmPatternProcessor                                 | TextAssembler, TextChunker, DictionaryManager, ConflictResolution |
| WasmNumberProcessor                                  | TextAssembler, TextChunker, DictionaryManager, ConflictResolution |
| WasmTextChunker                                      | TextAssembler, DictionaryManager, ConflictResolution              |
| WasmDictionaryManager (findMatches/findLongestMatch) | TextAssembler + self via `_sharedModuleCorrupted`                 |
| WasmConflictResolution (Phase 2 + Phase 4)           | TextAssembler, TextChunker, DictionaryManager                     |
| WasmTextAssembler                                    | self-retires in own catch                                         |

Circular dep constraint: `WasmTextChunker` imports `WasmDictionaryManager`; therefore `WasmDictionaryManager` cannot import `WasmTextChunker` (TC→DM→TC circular). DM cascade omits TC — acceptable since TC fires before DM in the pipeline.

### `lifecycle.permanentlyFail()` replaces `lifecycle.reset()` for panic paths

`WasmProcessorLifecycle.reset()` clears `_hasFailed = false`, allowing re-init from the same corrupted binary. `permanentlyFail()` (added 2026-05-27) sets `_hasFailed = true` permanently. Both WasmNumberProcessor and WasmPatternProcessor now call `permanentlyFail()` in their panic catch blocks.

### ConflictResolution export

`retireWasmConflictResolutionOnSharedPanic()` exported from `WasmConflictResolution.js`. Called by NP, PP, TC cascades. CR itself cascade-retires TA, TC, DM.

---

## What Still Needs Doing

### Root-Cause Investigation

**Goal:** Find what input to `NumberProcessor.processTokens()` triggers the original Rust panic.

**Context:** The primary panic source is still unknown. All the "Out of bounds memory access" and `Rc::assert_unchecked` errors observed so far are SECONDARY — they fire on a module already corrupted by a prior panic in an earlier pipeline stage.

**Approach:**

1. `logger.debug('WasmNumberProcessor input:', JSON.stringify(tokens))` at line ~134 of `WasmNumberProcessor.js` captures tokens just before the WASM call — check console in dev for this output when a panic fires
2. Write a Rust unit test in `wasm-core/tests/` with the captured input
3. Run `cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1` with `RUST_BACKTRACE=1`
4. The panic location in Rust source will identify the root cause

**Hypothesis:** Specific input token shapes (tokens with null fields, very large arrays, unusual Unicode) may trigger a Rust panic in `number_processor.rs`. Check for `.unwrap()` / `expect()` / integer arithmetic that could panic on edge-case inputs.

---

## Key Files

| File                                       | Role                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/utils/wasm/WasmNumberProcessor.js`    | JS wrapper — cascade + permanentlyFail fixed                                       |
| `src/utils/wasm/WasmPatternProcessor.js`   | JS wrapper — cascade + permanentlyFail fixed                                       |
| `src/utils/wasm/WasmTextAssembler.js`      | `retireOnSharedModulePanic()` method, self-retires in own catch                    |
| `src/utils/wasm/WasmTextChunker.js`        | Cascade-retire fixed; imports DM (DM cannot import TC back)                        |
| `src/utils/wasm/WasmDictionaryManager.js`  | `_sharedModuleCorrupted` module-level flag + `retireWasmDictionaryOnSharedPanic()` |
| `src/utils/wasm/WasmConflictResolution.js` | `retireWasmConflictResolutionOnSharedPanic()` export; cascades TA/TC/DM            |
| `src/utils/wasm/WasmProcessorLifecycle.js` | `permanentlyFail()` method added                                                   |
| `wasm-core/src/number_processor.rs`        | Rust NumberProcessor — unknown primary panic trigger                               |
