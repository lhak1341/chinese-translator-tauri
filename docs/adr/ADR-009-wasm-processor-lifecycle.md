# ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors

**Status**: Accepted
**Date**: 2026-05-17
**Decision Makers**: Development Team
**Affected Components**: `WasmPatternProcessor.js`, `WasmNumberProcessor.js`, `WasmDictionaryManager.js`, `WasmProcessorLifecycle.js`

## Context and Problem Statement

Three WASM processors (Pattern, Number, Dictionary) each initialize a WASM instance before use.
All three must run the same invariant sequence:

1. Fetch WASM binary
2. SHA-256 integrity verification
3. Initialize the WASM module with the binary
4. Create the processor instance
5. Verify the instance has expected methods
6. Retry the sequence on transient failures with exponential backoff

Prior to this ADR, each processor reimplemented this sequence manually:

- `WasmPatternProcessor.js`: 98 lines of init boilerplate (retry wrapper, binary fetch,
  integrity check, instance verification, state vars, cooldown logic)
- `WasmNumberProcessor.js`: ~80 lines of the same boilerplate
- `WasmDictionaryManager.js`: retry wrapper only — binary integrity and instance verification
  were missing entirely

The divergence meant:

- Dictionary engine could start with a corrupted WASM binary (no SHA-256 check)
- `DictionaryEngine` instance was never validated for expected methods
- Bugs fixed in one processor's init path required manual propagation to the others
- `initializationFailed`, `initializationPromise`, `retryAllowedAfter`, `RETRY_COOLDOWN_MS`
  were copy-pasted module-level variables across all three files

## Decision Drivers

- **Locality**: the init sequence is one concept — it should live in one place
- **Parity**: Dictionary's missing integrity + instance verification was a security gap
- **Shallow extraction test**: deleting the boilerplate from each processor concentrates
  complexity into `WasmProcessorLifecycle`, not scatter it
- **ADR-007 distinction**: ADR-007 rejected `WasmPatternBridge` (wraps one function call,
  depth ≈ 0). `WasmProcessorLifecycle` wraps the entire initialization lifecycle across
  three processors — meaningfully deeper, not a renamed bridge

## Alternatives Considered

### Alternative 1: Copy-fix across all three processors ✗ Rejected

Add the missing integrity + instance checks to `WasmDictionaryManager` without extracting
a shared module. Fixes the parity gap but leaves the init sequence triplicated.

**Rejected because**: the next processor-specific bug fix would again require manual
propagation. Three copies of the same invariant sequence is the root problem.

### Alternative 2: Base class / mixin for WASM processors ✗ Rejected

`WasmPatternProcessor` and `WasmNumberProcessor` are currently module-level function
exports, not classes. Converting them to classes to share a base class would be a larger
refactor than the init problem warrants.

### Alternative 3: WasmProcessorLifecycle class ✅ Selected

A standalone class that owns the init sequence. Processor modules create one instance
and delegate `initialize()` to it, passing an `instantiateFn(wasmBinary)` that covers
the processor-specific steps (module loading, instance creation, domain setup like
loading pattern dictionaries).

## Decision

`WasmProcessorLifecycle` is a class in `src/utils/wasm/WasmProcessorLifecycle.js`.

**Interface:**

```javascript
class WasmProcessorLifecycle {
  constructor({ name, wasmFileName, wasmBinaryUrl, expectedMethods })

  // fetch binary → verify integrity → instantiateFn(binary) → verify instance → retry transients
  async initialize(instantiateFn)  // instantiateFn: async (binary: ArrayBuffer) => instance

  reset()        // clears state for re-init; returns false if still in cooldown
  get isReady()  // boolean
  get hasFailed() // boolean
  getStatus()    // { name, isReady, hasFailed, failureCount, inCooldown }
}
```

**Responsibility split:**

| Concern                                       | Owner                                                          |
| --------------------------------------------- | -------------------------------------------------------------- |
| Binary fetch + SHA-256 integrity              | `WasmProcessorLifecycle.initialize()`                          |
| Retry + exponential backoff                   | `WasmProcessorLifecycle.initialize()` via `wasmRetryManager`   |
| Instance method verification                  | `WasmProcessorLifecycle.initialize()` via `verifyWasmInstance` |
| Init state (`isReady`, `hasFailed`, cooldown) | `WasmProcessorLifecycle`                                       |
| Module loading (static/dynamic import)        | `instantiateFn` in processor module                            |
| Module-level structural verification          | `instantiateFn` in processor module (Pattern only)             |
| Domain setup (e.g. loading pattern dicts)     | `instantiateFn` in processor module                            |
| Runtime error handling (toasts, fallback)     | Processor module                                               |
| Timeout measurement                           | `wasmOperationTimeout.js` (standalone, Pattern only)           |

**WasmDictionaryManager parity fix**: as part of this change, `_doInitialize` now passes
the WASM binary to `init(wasmBinary)` and adds `verifyWasmInstance` for `DictionaryEngine`.
Previously `WasmDictionaryManager` called `await init()` with no binary — the WASM module
was initialized without SHA-256 verification or instance method validation.

## Critical Invariants

- **`wasmBinaryUrl` must be a static string literal** for Vite's asset URL transform.
  Create it at module level: `new URL('../../wasm/name.wasm', import.meta.url)`.
  Never pass a computed or template-literal URL.
- **`instantiateFn` must return the WASM instance.** The lifecycle calls
  `verifyWasmInstance(instance, expectedMethods, name)` on the returned value.
  Returning `undefined` passes a bad instance to the verifier silently.
- **Cooldown blocks reset.** `lifecycle.reset()` returns `false` during the 5-second
  cooldown after a failure. Callers must check the return value before re-initializing.
- **Do not add `WasmPatternBridge`.** ADR-007 still stands — the WASM call site
  itself has no depth to extract. `WasmProcessorLifecycle` is the init lifecycle,
  not a runtime call wrapper.
- **FallbackManager stays in `WasmDictionaryManager`.** It handles runtime failures
  (repeated lookup errors) after a successful init. The lifecycle handles init failure only.

## Consequences

### Positive

- ✅ Init sequence lives in one place — fixes propagate automatically to all processors
- ✅ `WasmDictionaryManager` now has SHA-256 + instance verification (security parity)
- ✅ `initializationFailed`, `initializationPromise`, `retryAllowedAfter`, `RETRY_COOLDOWN_MS`
  removed from Pattern and Number processor modules (state concentrated in lifecycle)
- ✅ Adding a fourth WASM processor requires only `new WasmProcessorLifecycle({...})` + `instantiateFn`

### Negative

- ❌ `instantiateFn` captures module-level state (e.g., `wasmPatternProcessor = instance`)
  — the lifecycle does not own the instance reference, so two sources of truth exist
  during init. Callers must ensure their reference is set inside `instantiateFn`.
- ❌ Module-level structural verification (`verifyWasmModule`) stays in Pattern's
  `instantiateFn` — not covered by the lifecycle since it requires a dynamic import
  unavailable to the lifecycle

### Neutral

- 🔄 `wasmOperationTimeout` remains standalone — timeout is a measurement tool, not
  init policy. ADR-007 Q2 finding: cannot interrupt synchronous WASM anyway.

## References

- Lifecycle: `src/utils/wasm/WasmProcessorLifecycle.js`
- Pattern processor: `src/utils/wasm/WasmPatternProcessor.js`
- Number processor: `src/utils/wasm/WasmNumberProcessor.js`
- Dictionary manager: `src/utils/wasm/WasmDictionaryManager.js`
- CONTEXT.md: `WasmProcessorLifecycle` entry
- ADR-007: No JS fallback, no `WasmPatternBridge` (still applies to runtime call sites)
- ADR-008: Dictionary cache invalidation stays in `handleForceReload` (unchanged)
