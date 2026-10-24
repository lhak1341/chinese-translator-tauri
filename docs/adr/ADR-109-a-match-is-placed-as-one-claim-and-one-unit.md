# ADR-109: A Match Is Placed as One Claim and One Unit

**Status:** Decided
**Date:** 2026-10-24

## Context

The architecture review of 2026-10-24 (round 39, candidate #1) found that `TokenClaim` centralised only half of what a phase does with a match. The claim (`claimSpan`/`claimGroupedSpan`) was one call; the semantic unit (`semanticArrayBuilder.addUnit`) was a second, hand-written beside it at five sites: Phase 1 (`applyHierarchicalResults`), Phases 2 and 5 (`applyMatchToTokens`), Phase 4 (`processRemainingPhrases`) and Phase 3 (`NumberProcessor.applyConversionResult`). Each recomputed `startIndex + (options.chunkOffset || 0)`, and Phase 3 recorded only when an optional builder was passed.

The two halves disagreed. `applyMatchToTokens` claimed with `match.dictionary` but recorded `isProperNounMatch ? match.dictionary : 'phrases'`, so a Phase 5 character match carried `'characters'` on its token and `'phrases'` on its unit.

## Decision

`TokenClaim.ts` gains `placeSpan` (light) and `placeGroupedSpan` (grouped). Each claims the span and records the unit from the same `source` and `translated`. A `UnitSink` (`{ builder, chunkOffset }`) says where the unit goes; `builder: null` places without recording (the character-only pass), and an `undefined` builder is logged, never silently skipped. Phases 1 to 5 place through them. The two claim shapes stay two entry points.

The unit's `source` is now always the claim's `source`. A Phase 5 character unit records `'characters'`, not `'phrases'`. Nothing in `src/` compares a unit's `source` by value; it is shown as tooltip text and passed through to segments (`ClickableTranslationSemantic.tsx`, `WordSegmentMatcher.ts`, `SegmentPrecomputer.ts`).

The write-only token fields `compositePattern`, `compositeComponents` and `patternUsed` (set in `applyHierarchicalResults`, read nowhere, not in any test) are deleted, as ADR-094 did for unit provenance.

## Reasoning

**The GLOSSARY objection no longer holds.** "TokenClaim" said `addUnit` calls stay at the call sites because they differ in `recordMatches`, the builder handle and where the original text comes from. Those three are exactly the `UnitSink` and `originalText` arguments; the differences became parameters, not reasons to keep two calls.

**One source per match.** Two writers of `source` could drift, and had. One call cannot.

**The engine keeps its state.** `placeSpan` and `placeGroupedSpan` are pure functions of their arguments (tokens, a builder handle, an offset). `applyMatchToTokens` and `applyHierarchicalResults` stay on the engine, so nothing leaves `translateSinglePass`'s shared token state.

## Consequence

- A new phase places a match with one call. Do not call `addUnit` beside a claim.
- `addUnit` is still called directly where no claim exists: the Phase 5 pass-through branch (`TranslationEngine.js`) and `CharOnlyAssembly.ts`, which builds units from already-stamped tokens into a private builder.
- `TranslationEngine.addUnitCallSites.test.js` scans the literal `source` of `addUnit`, `placeSpan` and `placeGroupedSpan` calls in the engine and `NumberProcessor.js`, and the argument count of `addUnit` in the engine, `TokenClaim.ts` and `CharOnlyAssembly.ts`.
- Phase 3 no longer treats a missing `semanticArrayBuilder` as "do not record"; callers pass `null` to skip.
