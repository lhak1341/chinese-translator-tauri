# ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors

**Status**: Accepted (single-holder stack, kept generic on purpose: ADR-083) — `WasmDictionaryManager.js` was deleted 2026-10-04 (ADR-073) and `WasmStringProcessor.js` 2026-10-05 (ADR-078), so five wrappers hold a lifecycle, not seven
**Date**: 2026-05-17
**Decision Makers**: Development Team
**Affected Components**: `WasmProcessorLifecycle.js`, `WasmSharedModule.js`, and the one wrapper that holds a lifecycle: `WasmPatternProcessor.js` (`WasmConflictResolution.js` went with ADR-083, `WasmDictionaryManager.js` went with ADR-073, `WasmStringProcessor.js` with ADR-078, `WasmTextChunker.js`, `WasmTextAssembler.js` and `WasmTextTokenizer.js` with ADR-079)

## Current state (2026-10-03)

This ADR was written against three processors (Pattern, Number, Dictionary). The sections below, down to "Consequences", describe that original decision and are kept as written; this section is what is true now. Where the two disagree, this one wins.

**Processors.** `WasmNumberProcessor.js` was deleted (2026-06-20); Phase 3 is pure JS in `NumberProcessor.js`. One wrapper holds a `WasmProcessorLifecycle` (the `new WasmProcessorLifecycle(` call site): `WasmPatternProcessor.js`. (It was seven until 2026-10-07: `WasmDictionaryManager.js` was deleted with ADR-073, `WasmStringProcessor.js` with ADR-078, `WasmTextChunker.js`, `WasmTextAssembler.js` and `WasmTextTokenizer.js` with ADR-079, and `WasmConflictResolution.js` with ADR-083.) The last two moved on 2026-10-03: they had kept their own `initialized`/`initializationFailed` flags and made one load attempt, so a single transient fetch error sent Phase 4 assembly and conflict resolution to the JS fallback for the whole session while the other five retried. They now retry transient failures with backoff and verify the instance's expected method; failure after the retries or a panic stays permanent (`permanentlyFail()`, no `reset()`), and init stays eager at import outside tests. `WasmCascadeDiscipline.test.js` fails if a wrapper in its list stops constructing a lifecycle. That more processors converged than the ADR scoped is the "fourth WASM processor needs only `new WasmProcessorLifecycle({...})`" consequence it predicted.

**Instantiation is no longer the processors' job.** The lifecycle verified the binary, and then each processor called the generated `init` itself, which reopened the gap this ADR set out to close. `init` does not guard concurrent first calls (three concurrent calls instantiated the module three times, measured 2026-10-03), and two wrappers called a bare `init()` with no verified binary at import, before the lifecycle wrappers had finished fetching, so verification depended on call order. Every `instantiateFn` now calls `loadSharedWasmModule()` (`src/utils/wasm/WasmSharedModule.js`) instead of `init`: fetch, verify, instantiate once, one shared in-flight promise, and retired for good by the panic cascade. The loader has no retry or cooldown of its own; each lifecycle retries its whole sequence and calls the loader each time. `WasmCascadeDiscipline.test.js` fails on a bare `init(` or `.default(` anywhere but the loader. Each lifecycle still fetches and verifies the binary before calling the loader, which is redundant but harmless. `instantiateFn` therefore no longer needs the binary it is handed, except Pattern, which still imports the module itself to run `verifyWasmModule` first.

**Corrections to the original text.** There is no `wasmRetryManager`: the retry lives in the lifecycle's own `_retryWithBackoff`. The lifecycle also has `permanentlyFail()` (a panic marks it failed with no re-init, unlike `reset()`). `getStatus()` (listed in the interface block below) was deleted 2026-10-08, and `pendingInit` (an unread getter for the in-flight init promise) 2026-10-11.

**Timeout wrapper deleted (2026-10-06).** `wasmOperationTimeout.js` wrapped Pattern's synchronous `processTokens` call; the value settles before the timer, so the 8 s timeout never fired. Pattern now calls `processTokens` directly. The "Timeout measurement" row in the table below no longer applies.

**Binary integrity check deleted (2026-10-06, ADR-080).** The lifecycle no longer fetches the binary or hashes it: `instantiateFn()` takes no argument and `WasmSharedModule` is the only loader. The lifecycle keeps retry, cooldown and `verifyWasmInstance` (now `wasmInstanceCheck.js`). The "SHA-256 integrity" steps and rows below, and `verifyWasmModule`, no longer apply.

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
| Retry + exponential backoff                   | `WasmProcessorLifecycle.initialize()` (`_retryWithBackoff`)    |
| Instance method verification                  | `WasmProcessorLifecycle.initialize()` via `verifyWasmInstance` |
| Init state (`isReady`, `hasFailed`, cooldown) | `WasmProcessorLifecycle`                                       |
| Instantiating the shared module               | `loadSharedWasmModule()` (`WasmSharedModule.js`), once         |
| Importing the processor's own bindings        | `instantiateFn` in processor module                            |
| Module-level structural verification          | `instantiateFn` in processor module (Pattern only)             |
| Domain setup (e.g. loading pattern dicts)     | `instantiateFn` in processor module                            |
| Runtime error handling (toasts, fallback)     | Processor module                                               |

**WasmDictionaryManager parity fix** (original change): `_doInitialize` passed the WASM binary
to `init(wasmBinary)` and added `verifyWasmInstance` for `DictionaryEngine`. Previously it
called `await init()` with no binary — the WASM module was initialized without SHA-256
verification or instance method validation. (It now calls `loadSharedWasmModule()`; see
"Current state".)

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
- ✅ Adding another WASM processor requires only `new WasmProcessorLifecycle({...})` + an `instantiateFn` that calls `loadSharedWasmModule()` (five do today)

### Negative

- ❌ `instantiateFn` captures module-level state (e.g., `wasmPatternProcessor = instance`)
  — the lifecycle does not own the instance reference, so two sources of truth exist
  during init. Callers must ensure their reference is set inside `instantiateFn`.
- ❌ Module-level structural verification (`verifyWasmModule`) stays in Pattern's
  `instantiateFn` — not covered by the lifecycle since it requires a dynamic import
  unavailable to the lifecycle

### Neutral

- 🔄 `wasmOperationTimeout` stayed standalone (timeout is a measurement tool, not init policy)
  until it was deleted 2026-10-06: ADR-007 Q2 found it cannot interrupt synchronous WASM, and
  its timer could never fire.

## References

- Lifecycle: `src/utils/wasm/WasmProcessorLifecycle.js`
- Pattern processor: `src/utils/wasm/WasmPatternProcessor.js`
- Shared loader: `src/utils/wasm/WasmSharedModule.js`
- Dictionary manager: deleted 2026-10-04 (`WasmDictionaryManager.js`, ADR-073)
- String processor: deleted 2026-10-05 (`WasmStringProcessor.js`, ADR-078)
- Other lifecycle holder: none left (`WasmConflictResolution.js` was deleted 2026-10-07, ADR-083)
- Number processor: deleted 2026-06-20 (`WasmNumberProcessor.js`)
- GLOSSARY.md: `WasmProcessorLifecycle` entry
- ADR-007: No JS fallback, no `WasmPatternBridge` (still applies to runtime call sites)
- ADR-008: Dictionary cache invalidation stays in `handleForceReload` (unchanged)
