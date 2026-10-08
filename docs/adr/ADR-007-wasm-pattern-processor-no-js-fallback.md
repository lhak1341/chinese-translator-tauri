# ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error

**Status**: Accepted
**Date**: 2026-05-16
**Decision Makers**: Development Team
**Affected Components**: `TwoPhasePatternProcessor.js`, `WasmPatternProcessor.js`, `TranslationEngine.js`

## Context and Problem Statement

Phase 1 (structural patterns) runs through one of two adapters:

- `SemanticPatternProcessor` — pure-JS adapter, always available
- `TwoPhasePatternProcessor` — WASM adapter, selected when `enableTwoPhasePatterns` is true and WASM is available

`TwoPhasePatternProcessor` previously had a JS fallback path that was removed after WASM/JS output parity was verified. The question of whether to restore a fallback — or extract a `WasmPatternBridge` for testability — was revisited in Session 39.

Two related questions arose:

1. Should `TwoPhasePatternProcessor` fall back to `SemanticPatternProcessor` when WASM fails?
2. Should WASM invocation be extracted into an injectable `WasmPatternBridge` seam for unit testing?

## Decision Drivers

- **Failure visibility**: A silent `return []` on `{ success: false }` bypasses `applyPatterns()`'s failure counter and permanent-disable logic, hiding real WASM failures.
- **Seam depth**: `WasmPatternBridge` would wrap exactly one function call (`processTokensWasm`). One adapter → hypothetical seam only.
- **Test coverage**: WASM failure paths are already covered by wasm-core Rust tests. JS tests simulate Phase 1 output by pre-marking tokens; they do not need to invoke `TwoPhasePatternProcessor`.
- **Parity**: The JS fallback was removed intentionally after parity verification. Restoring it would re-introduce dual-maintenance burden.

## Alternatives Considered

### Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected

When WASM fails, fall back to `SemanticPatternProcessor.processTokens()`.

**Rejected because**:

- `SemanticPatternProcessor` is already wired as the non-WASM path in `applyPatterns()`. If WASM is enabled and fails, `applyPatterns()` already disables it after 3 failures and the JS path takes over on the next call.
- Inlining the fallback inside `TwoPhasePatternProcessor` would bypass the failure counter, giving the engine no signal that WASM is degraded.

### Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected

Wrap `processTokensWasm` in an injectable bridge so tests can mock WASM invocation.

**Rejected because**:

- The seam wraps exactly one function call — depth is essentially zero.
- `applyPatterns()` already detects WASM failure via `hasWasmPatternProcessorFailed()` and shows a user-facing toast with the failure counter.
- Adding the bridge adds a new file + injection wiring for no improvement to locality or leverage.

### Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected

When `processTokensWasm` returns `{ success: false }`, throw an `Error` instead of silently returning `[]`.

## Decision

`TwoPhasePatternProcessor.processTokens()` throws on `{ success: false }`. The existing `catch` block logs the error and rethrows to `applyPatterns()`, which:

1. Logs `logger.error`
2. Increments `patternFailureCount`
3. After 3 consecutive failures within 5 minutes: disables `enableTwoPhasePatterns` and shows a `toast.error`

No `WasmPatternBridge` is extracted. No JS fallback is restored inside `TwoPhasePatternProcessor`.

## Critical Invariants

- **`TwoPhasePatternProcessor` has no internal JS fallback.** WASM failures propagate as thrown errors.
- **`applyPatterns()` owns the fallback.** After 3 failures it sets `enableTwoPhasePatterns = false`; subsequent calls use `SemanticPatternProcessor`.
- **Do not add `WasmPatternBridge`.** The seam is hypothetical (one concrete class). Add it only if a second concrete adapter exists.
- **Do not add a `catch` inside `processTokens` that returns `[]`.** Silent returns bypass `patternFailureCount` and hide WASM regressions.

## Consequences

### Positive

- ✅ WASM runtime failures now surface through the same failure-tracking machinery as other errors
- ✅ Repeated WASM failures trigger the permanent-disable path and user-facing toast
- ✅ No new file or injection wiring

### Negative

- ❌ A single WASM failure increments the failure counter — transient one-off failures count against the 3-failure threshold
- ❌ No unit test for the `{ success: false }` → throw path without real WASM (accepted; covered by Rust tests)

## References

- `TwoPhasePatternProcessor.processTokens()`: `src/utils/pattern/TwoPhasePatternProcessor.js`
- Failure counter + permanent-disable logic: `TranslationEngine.js::applyPatterns()` catch block (~line 2923)
- WASM availability: `src/utils/wasm/WasmPatternProcessor.js::hasWasmPatternProcessorFailed()`
- Related: ADR-006 (PatternProcessor interface), ADR-003 (TypeScript hybrid — WASM boundaries)

## Addendum — 2026-10-09

`applyPatterns()` no longer checks `hasWasmPatternProcessorFailed()` after a successful `processTokens()` (the toast, `_wasmInitWarningShown` and the engine's import of both readiness checks are gone): `processTokens()` throws up front unless the lifecycle is ready, and a failure reaches the failure counter through that throw. The counter now covers the WASM path only; a JS-path failure feeds a second tracker that only warns. The decision above is unchanged.

Two more changes the same day make "the JS path takes over" hold when WASM never worked. `PatternFailureTracker` measures its window from the first failure of a run of failures, not from the last success: with no success ever (WASM failed to initialize), the third failure used to `reset` instead of `disable`, so Phase 1 was skipped for every chunk and the JS path never took over. And `TranslationEngine.initialize` sets `enableTwoPhasePatterns = false` right after `initializePatterns` when patterns are loaded and `SemanticPatternProcessor.wasmAvailable` is false, with a `logger.warn` and no toast (the JS path gives the same output, slower), so the first chunks do not pay for three failures.
