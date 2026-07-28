# ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline

**Status**: Superseded (2026-07-28) — extraction happened, correctly
**Date**: 2026-06-03
**Decision Makers**: Development Team
**Affected Components**: `src/utils/pattern/SemanticPatternProcessor.js`

## Supersession Note (2026-07-28)

This ADR's own "Consequences" section named the exact condition that would justify reopening it: "a second caller emerges." One did. `PrecomputedTokenStrings` now lives in its own file, `src/utils/pattern/PrecomputedTokenStrings.js`, exported as a class and imported by two real callers: `SemanticPatternProcessor.js` (the original site) and `src/utils/wasm/StringProcessingAdapter.js` (the JS fallback path when the WASM string processor is unavailable or fails). The extraction was correct once the second caller existed — this is the "two adapters = real seam" principle from this same ADR's own reasoning, now satisfied.

No action needed on the code — it's already in the right shape. This note exists so a future review doesn't find the class in its own file, assume the extraction contradicts this ADR, and waste time reconciling a non-conflict.

## Context and Problem Statement

`PrecomputedTokenStrings` is a class defined inline at the top of `SemanticPatternProcessor.js`. It pre-computes all token substring combinations (pos×span → joined string) into a `Map` to eliminate `slice().map().join()` operations during pattern variable resolution — a 5-10× speedup in the JS fallback path. It has its own constructor, stats tracking, and `enabled` flag (~85 lines).

An extraction to `src/utils/pattern/TokenStringCache.ts` was proposed, with injection via `SemanticPatternProcessor` constructor (`cache?: TokenStringCache`).

## Decision Drivers

- **One caller = hypothetical seam**: `PrecomputedTokenStrings` is used only inside `SemanticPatternProcessor`. Per the "two adapters = real seam" principle, one caller produces a hypothetical seam with no leverage gain.
- **Static method coupling**: `PrecomputedTokenStrings.generateDynamic(semanticTokens, pos, span)` is a static fallback called at the lookup site (line ~1191). If extracted, either the static method must be imported back, or callers must duplicate the fallback logic — adding indirection without removing coupling.
- **Direct stats access**: Line ~842 reads `.stats.totalPrecomputed` directly, bypassing `getStats()`. Extraction would require either exposing the field or fixing the access pattern — complexity added purely for tidiness.
- **WASM is the primary path**: `PrecomputedTokenStrings` runs only when the WASM string processor fails or is unavailable. The claimed 5-10× speedup applies to the JS fallback path, not the hot path. The class is not a performance bottleneck worth isolating.
- **85 lines is not a burden**: The class does not make `SemanticPatternProcessor.js` harder to navigate. Deletion test: removing it would collapse the two call sites to `generateDynamic(...)` inline — complexity disappears rather than scattering, which is the opposite signal from a module earning its keep.

## Alternatives Considered

### Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected

`SemanticPatternProcessor(patterns, cache?: TokenStringCache)` — cache either injected or instantiated internally. Enables unit-testing the cache independently of the processor.

Rejected: DI adds a construction site with no new seam; the cache is tightly coupled to `semanticTokens` which are owned and created by the processor anyway. Test value is marginal — the cache is a `Map` with a loop, not logic worth exercising in isolation.

### Alternative 2: Keep inline ✓ Accepted

No change. The 85-line class stays at the top of `SemanticPatternProcessor.js`. If the optimization logic grows substantially, or a second caller emerges, revisit.

## Consequences

- `SemanticPatternProcessor.js` stays at ~1600 lines; `PrecomputedTokenStrings` remains a module-private implementation detail.
- No new file, no new import, no DI parameter added.
- Future architecture reviews should not re-propose this extraction unless: (a) a second caller emerges, or (b) the cache logic grows complex enough to warrant independent testing.
