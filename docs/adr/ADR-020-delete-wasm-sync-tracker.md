# ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting

**Status:** Superseded (2026-10-04) — the WASM dictionary tier was deleted (ADR-073)  
**Date:** 2026-06-14

## Context

`WasmDictionaryManager` contained a sync reliability tracking subsystem (~150 LOC):

- `syncFailureTracking` object — counters, timestamps, two pre-allocated circular buffers (10 failure reasons, 20 history entries)
- `failureReasonsIndex` / `syncHistoryIndex` — circular buffer cursors
- `_recordSyncSuccess(method)` / `_recordSyncFailure(reason, method)` — pure state mutations, ~10 call sites
- `getSyncMetrics()` — aggregates buffer contents + adds `fallbackHandler` status fields

The architecture review (2026-06-13) proposed extracting this to `WasmSyncTracker.ts` for testability: the circular buffer eviction logic was invisible behind the WASM constructor, making it impossible to unit-test without a full WASM binary.

## Decision

Delete the subsystem entirely. Do not extract.

## Reason

`getSyncMetrics()` had **zero external callers**. The method was defined but never consumed — no performance dashboard, no adapter delegation, no test. The `// ARCHITECTURAL FIX: Track sync failures for performance dashboard` comment described intent that was never wired up.

The deletion test passed completely: removing the subsystem concentrated zero complexity on callers (there were none). This is the opposite signal from an extraction candidate — it is pure dead code.

Additionally, `getSyncMetrics()` read `this.fallbackHandler.isInFallbackMode()` and `this.fallbackHandler.getFailureCount()`, so `WasmSyncTracker` could not have been purely stateless without injecting `fallbackHandler` or splitting the method. That coupling was a further argument against extraction.

## If a Performance Dashboard Is Built

Restore the subsystem as `WasmSyncTracker.ts` with this interface:

```ts
type SyncMode = 'batch' | 'sequential' | 'sequential_fallback' | 'unknown';

class WasmSyncTracker {
  recordAttempt(mode: SyncMode): void; // called at method entry, before outcome
  recordSuccess(mode: SyncMode): void;
  recordFailure(reason: string, mode: SyncMode): void;
  getStats(): SyncStats; // pure tracker state only
}
```

`WasmDictionaryManager.getSyncMetrics()` composes `this.syncTracker.getStats()` with `fallbackHandler` status fields — tracker never sees `fallbackHandler`. The `_skipMetrics` parameter on `loadDictionary` (needed to prevent double-counting when called as batch fallback) becomes `tracker.recordAttempt(mode)` gated on a caller flag.
