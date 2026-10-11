# ADR-101: Delete the JS Pattern Matcher; WASM Is the Only Matcher

**Status:** Decided
**Date:** 2026-10-11
**Supersedes:** the "JS path takes over" clause of ADR-007 (the rest of ADR-007 stands)

## Context

Phase 1 ran through one of two matchers: `TwoPhasePatternProcessor` over the Rust matcher, and a pure-JS matcher in `SemanticPatternProcessor` (1,156 lines, plus `PatternPriorityCalculator` and `PrecomputedTokenStrings`). The JS matcher ran only when WASM failed to initialize, or after `PATTERN_FAILURE_DETECTION.MAX_FAILURES` WASM failures switched `enableTwoPhasePatterns` off. ADR-096 measured the two producing different final text in 91 of 248 real windows (the JS matcher is single-pass with no composition) and called it "only a safety net". Its prioritized-pattern entry (`extractPrioritizedPatterns`, `convertPrioritizedPatternToMatchResult`) was unreachable: nothing in production wrote `token.prioritizedPattern`. Four rules had to be kept identical in JS and Rust by hand (`src/utils/CLAUDE.md` §3), and two real bugs (`build_result`, `resolve_variable_with_lookahead`) were found independently on both sides.

## Decision

Rust is the only pattern matcher. When it cannot run, Phase 1 is skipped and the user is told; Phases 2 to 5 still run.

- **WASM unavailable at init** (patterns loaded, `wasmAvailable` false): `enableTwoPhasePatterns` is set to `false` and `TranslationEngine.initialize` shows a `toast.error` telling the user to reload dictionaries (Cmd+R).
- **Repeated runtime failures:** unchanged counting (`PatternFailureTracker`, 3 failures in 5 minutes); the disable toast now says patterns are skipped, not that they continue on a slower path.
- **`SemanticPatternProcessor` becomes `PatternStore`** (`src/utils/pattern/PatternStore.js`): it parses the patterns dictionary into the entries `TwoPhasePatternProcessor` and the variable cache read (`originalPattern`, `template`, `allowAsPatternVariable`) and owns `reinitializeWasmPatternProcessor`. No matching. The engine field is `patternStore`.
- **Deleted:** the JS matcher (`testPatternMatch`, `findBestPatternMatch`, `buildResult`, `parsePattern`, `processTokens`, `buildVariableCache`), `PatternPriorityCalculator.ts`, `PrecomputedTokenStrings.js`, `jsPatternFailureTracker`, the JS branch of `applyPatterns`, `extractPrioritizedPatterns`, and their tests.
- **Parity pins:** `PatternBuildResult.parity.test.js` is retired; `build-result-parity.json` stays because `matcher.rs` still asserts it. `PatternVariable.parity.test.js` stays (validator and `isVariableChar` against Rust's `is_variable_at`). The `src/utils/CLAUDE.md` §3 rows for `build_result`, trailing-variable span and number-fills-only-`#` lose their JS side.
- **Tests:** the failure tests inject a throwing `TwoPhasePatternProcessor` (the engine's seam) and assert Phase 1 is skipped and the toast; `TranslationEngine.phase1.test.js` keeps the real binary.

## What was not measured

How often the JS path ran in production. There is no telemetry, and none was added: this is a failure-behaviour decision, not a speed one. The cost is real: a user whose WASM fails now loses patterns for the session (quality drop on structural phrases) where before they got a single-pass approximation. If WASM init failures prove common, the remedy is retrying `reinitializeWasmPatternProcessor`, not restoring a second matcher.

## Consequences

- One matcher: a pattern bug is fixed once. About 1,700 lines and one failure tracker go.
- ADR-007's "do not add `WasmPatternBridge`" stands, but the seam at `TwoPhasePatternProcessor` now has two test adapters (the real binary and a throwing fake).
- ADR-096's "keep the tier" decision stands; its fallback paragraph is superseded here.
- `PatternVariableCache.buildPatternVariableCache` now has one production caller (`TwoPhasePatternProcessor`); its `initialCache` parameter has none outside its own test.

## Addendum 2026-10-11: the JS pattern analysis went too

`TwoPhasePatternProcessor` still ran `PatternAnalyzer.analyzePatterns` in its constructor, which stamped `hasVariables`, `hasXVariable`, `hasYVariable`, `isMultiVariable`, `compositeEligible` and `variableCount` on every pattern. The only readers were `categorizePatterns`, `getStatistics` and `validateSetup`, all inside the same file and its tests; no production code called the last two. It was analysis for the JS matcher's composite stage, left behind when the matcher went.

Deleted: `PatternAnalyzer.js`, `categorizePatterns` (and `variablePatterns`, `compositeEligiblePatterns`, `allPatterns`), `getStatistics`, `validateSetup`, their tests, the unused pattern-structure types in `PatternProcessingTypes.d.ts` (`SemanticPattern`, `PatternMatchResult`, `PhaseAResult` and the types only they used), `buildPatternVariableCache`'s `initialCache` parameter, `DictionaryManagerConfig` and `TranslationEngineInitOptions.dictionaryManager` (nothing read it; the engine hard-codes the cache settings). The class keeps its name: Rust still runs two phases (`two_phase.rs`). It now does five things: gate on WASM readiness, extract semantic tokens, build the variable cache, make the one WASM call, bounds-filter the results. The bounds filter has a test through `processTokens`. The internal-profiling methods stay (ADR-021).
