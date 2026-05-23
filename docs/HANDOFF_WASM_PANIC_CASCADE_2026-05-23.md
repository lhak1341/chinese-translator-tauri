# Handoff: Shared WASM Module Panic Cascade

**Date:** 2026-05-23  
**Status:** Partially fixed — cascade-retire and root-cause work deferred  
**Priority:** Medium (translations degrade to JS fallback; correctness unaffected)

---

## Problem Summary

`WasmNumberProcessor` and `WasmTextAssembler` both import `init` from the **same** WASM module (`src/wasm/translation_wasm_core.js`). They share one WASM instance.

When `NumberProcessor.processTokens()` panics inside WASM (Rust `panic = "abort"`):

1. Rust abort fires — all `Drop` impls are **skipped**
2. wasm-bindgen's internal `Rc<RefCell<NumberProcessor>>` borrow count stays stuck at 1
3. The shared WASM module's linear memory / global state is now partially corrupted

On the **next** call to `WasmTextAssembler.assembleWithSpacing()`:

1. Triggers `alloc/src/rc.rs:3743` — a Rust 1.84+ debug precondition check:  
   `"hint::assert_unchecked must never be called when the condition is false"`
2. This was previously **silent undefined behavior** — made visible by the Rust 1.95 upgrade

Console log that surfaces the bug:

```
[Error] panicked at alloc/src/rc.rs:3743:13:
unsafe precondition(s) violated: hint::assert_unchecked must never be called when the condition is false
...
assembleWithSpacing (WasmTextAssembler.js:166)
postProcess (TranslationEngine.js:3272:107)
translateDirectly (TranslationEngine.js:5570)

[Error] WASM assembleWithSpacing failed, retiring instance: RuntimeError: Unreachable code should not be executed
```

---

## What Was Fixed This Session

All three files already committed. Summary:

### `src/utils/wasm/WasmNumberProcessor.js`

- **Retire-after-panic**: catch block now sets `wasmNumberProcessor = null; lifecycle.reset()` — previously the broken instance stayed alive, causing "recursive use" errors silently on every subsequent translation
- **Lifecycle sync**: `lifecycle.reset()` required alongside nulling the processor — without it, `lifecycle._isReady` stays `true`, `initialize()` returns immediately without re-init, and `wasmNumberProcessor` stays null with silent fallthrough
- **Dead null guard removed**: `if (!wasmNumberProcessor) return tokens` at line 130 was unreachable

### `src/utils/wasm/wasmErrorHandler.js`

- Added `message.includes('recursive use')` to the `WASM_RUNTIME` detection branch — "recursive use of an object detected which would lead to unsafe aliasing in rust" (the post-panic wasm-bindgen message) did not match "wasm" or "module", falling through to UNKNOWN

---

## What Still Needs Doing

### 1. Cascade-Retire Fix (small, ~10 lines)

**Files:** `src/utils/wasm/WasmTextAssembler.js`, `src/utils/wasm/WasmNumberProcessor.js`

When NumberProcessor panics, `WasmTextAssembler` is **already corrupted** (shared WASM module). Currently:

1. NumberProcessor panics → retires itself ✓
2. Next translation → TextAssembler calls corrupted WASM → panics → retires → console error
3. JS fallback takes over

Step 2 is avoidable. Plan:

1. Add a `retireOnSharedModulePanic()` method to `WasmTextAssemblerWrapper` in `WasmTextAssembler.js`:
   ```js
   retireOnSharedModulePanic() {
     this.assembler = null;
     this.initialized = false;
     this.initializationFailed = true;
   }
   ```
2. Export the singleton: `export { wasmTextAssembler }` (it's already exported, check current export)
3. In `WasmNumberProcessor.js` catch block, after `wasmNumberProcessor = null; lifecycle.reset();`, add:
   ```js
   import { wasmTextAssembler } from './WasmTextAssembler';
   // ...
   wasmTextAssembler.retireOnSharedModulePanic();
   ```

Watch for: circular imports. If `WasmTextAssembler` already imports anything from `WasmNumberProcessor`, use a shared `SharedWasmModuleState.js` singleton instead.

### 2. Root-Cause Investigation (larger, needs reproducer)

**Goal:** Find what input to `NumberProcessor.processTokens()` triggers the first Rust panic.

**Files:** `wasm-core/src/number_processor.rs`, `wasm-core/src/` (full crate)

**Approach:**

1. Add logging in `WasmNumberProcessor.js` to capture `JSON.stringify(tokens)` before the WASM call — log at DEBUG level only
2. Reproduce the panic with dev server, capture the input
3. Write a Rust unit test in `wasm-core/tests/` with that input
4. Run `cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1` with `RUST_BACKTRACE=1`
5. The panic location in Rust source will identify the root cause

**Known context from `assemble_with_spacing` inspection:**  
`wasm-core/src/text_assembly.rs::assemble_with_spacing` itself is clean (no Rc, pure string ops + serde_json). The panic originates from wasm-bindgen's internal Rc wrapping of exported structs, triggered by a prior panic in the NumberProcessor leaving borrow_mut_count stuck. The ROOT cause is whatever triggers the NumberProcessor panic — not the TextAssembler itself.

**Hypothesis:** Specific input token shapes (e.g., tokens with null fields, very large arrays, or unusual Unicode) may trigger a Rust panic inside `number_processor.rs`. Check `wasm-core/src/number_processor.rs` for `.unwrap()` / `expect()` / integer arithmetic that could panic.

---

## Key Files

| File                                       | Role                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `src/utils/wasm/WasmNumberProcessor.js`    | JS wrapper — fixed this session                                      |
| `src/utils/wasm/WasmTextAssembler.js`      | JS wrapper — handles its own panic correctly; needs proactive retire |
| `src/utils/wasm/wasmErrorHandler.js`       | Error categorization — fixed this session                            |
| `src/wasm/translation_wasm_core.js`        | wasm-bindgen generated — shared module both processors import from   |
| `wasm-core/src/text_assembly.rs`           | Rust TextAssembler — clean, no Rc                                    |
| `wasm-core/src/number_processor.rs`        | Rust NumberProcessor — unknown panic trigger                         |
| `src/utils/wasm/WasmProcessorLifecycle.js` | Init lifecycle shared by WasmNumberProcessor                         |

---

## Constraints

- Per `CLAUDE.md`: every `Wasm*.js` catch block must retire (`this.obj = null; this.initialized = false; this.initializationFailed = true`). Module-level singletons use bare vars instead of `this.*`.
- `WasmTextAssembler` uses class-based singleton (`wasmTextAssembler` instance). Retire sets `this.assembler = null; this.initialized = false; this.initializationFailed = true`.
- `WasmNumberProcessor` uses module-level vars. Retire sets `wasmNumberProcessor = null; lifecycle.reset()`.
- `lifecycle.reset()` is safe to call after a runtime panic (not an init failure) because `_retryAllowedAfter` is 0 — no cooldown was set.

---

## Suggested Skills

- `/review` — review the cascade-retire change after implementation
- `/commit` — after cascade-retire fix lands
