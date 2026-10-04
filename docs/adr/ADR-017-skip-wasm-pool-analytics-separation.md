# ADR-017: Skip WasmMemoryPool Analytics Separation

**Status:** Superseded (2026-10-04) — the pool was deleted  
**Date:** 2026-06-05

## Context

`WasmMemoryPoolManager.ts` (693 LOC) contains `WasmMemoryPool`, a class that owns buffer allocation/deallocation, pool sizing, memory pressure handling, and analytics (`getStats()`, `generateOptimizationRecommendations()`). A candidate proposed extracting the analytics concern into a separate module.

## Decision

Do not extract pool analytics from `WasmMemoryPool`.

## Reasoning

**Private-field coupling blocks clean extraction.** `getStats()` and `generateOptimizationRecommendations()` read `this.stats.*`, `this.pools.*`, and `this.getCurrentMemoryPressure()` — all private fields. Extracting them requires either passing the full pool-state object as a parameter (fragile, large interface) or making those fields public (degrades encapsulation). Neither path produces a deep module.

**Deletion test fails.** Deleting `getStats()` doesn't concentrate complexity into a new module — it reappears across callers who now need raw pool state directly. The method earns its place by encapsulating internal field access behind a single call.

**One external caller.** `SystemPerformanceMonitor.js` is the sole external consumer (`collectMetrics: () => wasmMemoryPoolManager.getStats()`). With one call site there is no real seam — no second adapter is plausible, and no new test surface opens.

**Marginal LOC savings.** Analytics methods are ~70 LOC in a 693-line class. The size reduction does not justify the coupling introduced.

**Introspection legitimately needs allocation internals.** Pool analytics is a read-only view of allocation state — the two concerns are not accidentally co-located; they share the same data model by design.

## Consequence

Future architecture reviews should not re-propose extracting `getStats()` or `generateOptimizationRecommendations()` from `WasmMemoryPool`. If a second analytics consumer is ever added that requires a different view of pool state, revisit — divergent read paths would justify a seam.
