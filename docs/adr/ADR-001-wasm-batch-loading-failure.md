# ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential

**Status**: Revised — Remove Batch Attempt (was: Accepted Workaround)
**Date (original)**: 2026-01-28
**Date (revised)**: 2026-05-16
**Decision Makers**: Development Team
**Affected Components**: `src/utils/dictionary/EnhancedDictionaryManager.js`, `src/utils/wasm/WasmDictionaryManager.js`

## Context and Problem Statement

The translation system loads 12 dictionaries (27,000+ entries) into WASM memory. A
batch loading path (`loadDictionariesBatch`) was added to reduce WASM boundary crossings
from 12 to 1. It has failed 100% of the time in production.

The original ADR (2026-01-28) chose to **keep the batch attempt as a workaround** while
investigating later. This revision supersedes that decision.

## Root Cause (Identified 2026-05-16)

The original ADR listed four hypothetical causes. The actual cause is a **memory-check
asymmetry** between the batch and sequential Rust paths:

- `load_dictionary()` (singular): checks whether **one dictionary** exceeds the 15MB
  limit (`estimated_size > self.memory_limit_mb * MB`).
- `load_dictionaries_batch()`: checks whether **cumulative** loaded size exceeds 15MB
  (`memory_usage_bytes + estimated_size > memory_limit_bytes`).

With 12 dictionaries and 27,000+ entries, the cumulative estimate crosses 15MB during the
batch run. Later dictionaries get skipped → `loaded_count != total_dicts` → returns
`false` → JS falls back to sequential.

Sequential loading succeeds because each individual dictionary is under 15MB.

**Additional finding**: The Rust batch function is not parallel — it loops sequentially
internally ("We do sequential loading inside the batch to maintain memory limits"). The
only performance benefit of the batch path is **11 fewer JS→WASM boundary crossings**,
not reduced dictionary-load work.

## Why Not Fix the Root Cause

The fix would be: call `DictionaryEngine::new_with_config(50)` on the JS side to raise
the Rust-side cumulative limit, or change the batch check to mirror the per-dictionary
check. This is tractable.

However, **ADR-005 (2026-05-03) settled the startup performance question**: startup with
12 dictionaries is already fast enough; no user-facing latency problem exists. The only
benefit of fixing batch loading — 11 fewer WASM boundary crossings — targets a problem
that doesn't need solving.

Keeping the broken batch attempt costs:

- Warning log noise on every startup ("Batch loading failed, falling back")
- ~60 lines of fallback branching in `EnhancedDictionaryManager.js`
- Three separate exception-handling fallback paths (lines 160, 165, 170)
- Constant-zero metrics that convey no information (batch always fails for the same reason)

## Decision

**Remove the JS-side batch attempt. Use sequential loading as the primary path.**

The Rust `load_dictionaries_batch()` implementation remains — it is part of the compiled
WASM binary and does not need to be removed. Only the JS-side call site and fallback
logic in `EnhancedDictionaryManager.syncDictionariesToWasm()` is removed.

## Implementation

`EnhancedDictionaryManager.syncDictionariesToWasm()` should call
`syncDictionariesToWasmSequential()` directly, removing:

- Batch preparation loop (build `allDictionaries` array)
- `wasmManager.loadDictionariesBatch()` call
- Three fallback catch paths
- Batch timing/logging instrumentation

`WasmSyncMetrics` batch counters can be removed or left as dead struct fields — do not
delete `WasmDictionaryManager.loadDictionariesBatch()` itself (still compiled into WASM,
may be useful if a future startup performance problem emerges and the memory limit is
raised).

## Consequences

### Positive

- ✅ No warning log noise on startup
- ✅ ~60 lines of dead branching removed from `EnhancedDictionaryManager.js`
- ✅ Sequential path is the only path — no dual-path cognitive load
- ✅ Consistent with ADR-005: startup performance is not a problem

### Negative

- ❌ 11 WASM boundary crossings on startup instead of 1 (not a user-facing problem)
- ❌ If startup performance ever becomes a problem, the fix requires revisiting this decision

### Neutral

- 🔄 Rust `load_dictionaries_batch()` stays compiled in — recoverable from JS if needed

## If Startup Latency Becomes a Problem

1. Call `DictionaryEngine.new_with_config(50)` at WASM init to raise the Rust cumulative limit to 50MB
2. Re-add the batch call in `syncDictionariesToWasm()` (recoverable from git)
3. Verify sequential fallback still works if batch fails validation
4. Re-evaluate whether 11 fewer boundary crossings produces measurable user benefit

## Monitoring and Review

**Review Triggers**:

- Startup time measurably degrades (>200ms user-reported lag at app open)
- Dictionary count grows significantly beyond 12

## References

**Note (2026-07-28):** `EnhancedDictionaryManager.js` no longer exists — deleted in commit `2e6e863` ("replace EnhancedDictionaryManager inheritance with WasmDictionaryAdapter composition"). The decision below still holds (confirmed: `loadDictionariesBatch` has zero callers anywhere in production code today), but the file references below are dead. The real chain is now `DictionaryManager` → `this.wasmLookup` (`DictionaryWasmLookup`) → `this._adapter` (`WasmDictionaryAdapter`) → `this._inner` (`WasmDictionaryManager`). `DictionaryWasmLookup.sync()` loops calling `loadDictionary()` (singular) per dictionary — the sequential path this ADR chose, just relocated through two more layers of composition since this ADR was written.

- Batch implementation (still exists, still uncalled): `src/utils/wasm/WasmDictionaryManager.js` (`loadDictionariesBatch`)
- Rust implementation: `wasm-core/src/lib.rs` (`load_dictionaries_batch`)
- Sequential path today: `src/utils/dictionary/DictionaryWasmLookup.js::sync()` (loops `this._adapter.loadDictionary(...)`)

## Related ADRs

- ADR-005: Eager Dictionary Loading (established that startup latency is not a problem — primary justification for this revision)
- ADR-003: TypeScript Hybrid Architecture (WASM boundary type safety)
