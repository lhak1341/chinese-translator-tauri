# ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation

**Status**: Accepted
**Date**: 2026-05-03
**Decision Makers**: Development Team
**Affected Components**: `SemanticPatternProcessor.js`, `TwoPhasePatternProcessor.js`, `TranslationEngine.js`

## Context and Problem Statement

Phase 1 (structural patterns) can execute via two adapters — a pure-JS adapter
(`SemanticPatternProcessor`) and a WASM adapter (`TwoPhasePatternProcessor`). The
selection happens once in `applyPatterns()` at runtime. For `applyHierarchicalResults()`
to apply either adapter's output without branching on adapter type, both adapters must
return the same shape.

The original `SemanticPatternProcessor` mutated tokens directly and exposed an
`applyPatternMatch()` method that callers invoked per-result. This meant:

- Callers had to know how to apply results — a leaky interface
- WASM results had a different application path — no shared `applyHierarchicalResults`
- `applyPatternMatch` mixed application logic into the processor, preventing clean testing

## Decision Drivers

- **Uniform interface**: `applyPatterns()` must not branch on which adapter is active
- **Locality**: application logic (token mutation, consumed-source derivation) belongs in one place
- **Testability**: processors should be testable without a live token array

## Alternatives Considered

### Alternative 1: Keep inline mutation per adapter ✗ Rejected

Each adapter mutates tokens directly. `applyPatterns()` calls different code paths
for JS and WASM. Callers must handle both shapes. Rejected because it prevents a
single `applyHierarchicalResults()` and makes the two adapters independently driftable.

### Alternative 2: Return results, single apply site ✅ Selected

Both adapters return `PatternProcessorResult[]` from `processTokens()`. Neither mutates
tokens. `applyHierarchicalResults(tokens, results, options)` is the single apply site.

## Decision

`processTokens()` returns `Promise<PatternProcessorResult[]>`. Both adapters satisfy
the `@typedef PatternProcessor` contract defined in `TranslationEngine.js:276`.
`applyPatternMatch` is deleted — `applyHierarchicalResults()` is the sole mutation site.

## Interface Contract

```javascript
// @typedef PatternProcessor
// processTokens(tokens: TextToken[], options: Object) => Promise<PatternProcessorResult[]>

// @typedef PatternProcessorResult
// startIndex: number       — leader index in tokens[]
// endIndex:   number       — last consumed token index
// originalText: string     — concatenated source values
// translation: string      — output translation
// translationSource: TranslationSource — 'pattern' (JS) | 'hierarchical_patterns' (WASM)
// semanticType: string|null
// pattern: Object          — exposes .originalPattern for debug
// type: 'simple'|'composite'|'hierarchical'
// components?: Array       — only for type === 'composite'
```

**Consumed-source derivation** (in `applyHierarchicalResults`):

```javascript
`${result.translationSource}_consumed`;
// JS adapter leader: 'pattern' → consumed: 'pattern_consumed'
// WASM adapter leader: 'hierarchical_patterns' → consumed: 'hierarchical_patterns_consumed'
```

## Critical Invariants

- **Callers must capture the return value.** `processTokens()` returns results — ignoring the return silently drops all JS pattern translations (no error, tokens fall through to Phases 4/5).
- **`applyHierarchicalResults` has no overlap check and must not get one.** `select_optimal_results` in `wasm-core/src/pattern_processor/two_phase.rs` guarantees non-overlapping results before they reach JS. Adding JS-side dedupe masks WASM bugs.
- **`createOptimalPhraseGroups` (Phase 4) checks only `enableTwoPhasePatterns`**, not `patterns?.length`. Do not re-add a `patterns?.length > 0` guard — phrase processing is pure JS and independent of structural patterns.

## Consequences

### Positive

- ✅ Single `applyHierarchicalResults()` handles both adapters — no branching at call site
- ✅ Processors testable in isolation (return value, no live token array needed)
- ✅ Consumed-source derivation centralized — one place to fix if the convention changes

### Negative

- ❌ Every `processTokens()` call site must capture and pass results — silent if forgotten
- ❌ WASM and JS adapters must stay shape-compatible across future changes

### Neutral

- 🔄 Adding a third adapter only requires satisfying the `PatternProcessor` typedef

## References

- Typedef: `src/utils/TranslationEngine.js:255–278` (`PatternProcessorResult`, `PatternProcessor`)
- Apply site: `src/utils/TranslationEngine.js` — `applyHierarchicalResults()`
- JS adapter: `src/utils/pattern/SemanticPatternProcessor.js`
- WASM adapter: `src/utils/pattern/TwoPhasePatternProcessor.js`
- Overlap guarantee: `wasm-core/src/pattern_processor/two_phase.rs::select_optimal_results()`
- CLAUDE.md note: `src/utils/CLAUDE.md` — "`SemanticPatternProcessor.processTokens()` Returns Results — Do Not Ignore"

## Related ADRs

- ADR-003: TypeScript Hybrid Architecture (JS adapters intentionally stay JavaScript)
- ADR-004: 5-Phase Processing Order (Phase 1 context)

## Addendum (2026-10-12, architecture review round 32, candidate #4)

The `createOptimalPhraseGroups` bullet under the Decision is out of date. That method and `createOptimalPhraseGroupsHierarchical` are deleted. Both branches of the `enableTwoPhasePatterns` check called `processRemainingPhrases`, so the flag changed only the error text: a phrase failure was rethrown as "Two-phase pattern processing failed …". `translateSinglePass` now calls `processRemainingPhrases` as Phase 4, which reads no pattern setting. A phrase failure reaches the Phase 4 `catch` with its own message, which is recorded in `lastPhaseFailures`. The intent is unchanged: phrases run whether or not patterns load. `TranslationEngine.pipeline.test.js` now pins it, with the flag off.
