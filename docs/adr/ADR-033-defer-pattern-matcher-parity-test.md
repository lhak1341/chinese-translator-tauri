# ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage

**Status:** Resolved (2026-09-08) — see Update below
**Date:** 2026-07-28

## Update (2026-09-08)

`wasm-core/tests/pattern_matcher_parity_test.rs` now exists — the real cross-language
parity test this ADR's Consequence section named as still-missing. It calls
`matcher.rs::test_pattern_match`/`find_best_pattern_match` (plain `pub fn`s, no
`wasm_bindgen` boundary) directly against the same 3 fixtures the 2026-08-25 update
named: `fixture_1_simple_single_variable_match`, `fixture_2_overlapping_pattern_priority_resolution`
(both migrated from `pattern_matching_test.rs`'s `test_single_variable_pattern_match`/
`test_pattern_competition_higher_priority_wins`, which are now deleted from that file),
and `fixture_3_hierarchical_composition_absorbs_phase_a_protected_span` (new — the
hierarchical-composition scenario had no prior Rust counterpart at `matcher.rs`'s level).
All 3 fixtures passed on first run — Rust and JS agree on all three scenarios named as
the minimum oracle. This closes the ADR's original decision, not just the prerequisite.

## Update (2026-08-25)

The JS-side fixture oracle this ADR's Consequence section named as the blocking prerequisite now exists: `src/utils/__tests__/SemanticPatternProcessor.test.js`'s `testPatternMatch() / findBestPatternMatch() (fixture-based)` describe block covers the three named minimum scenarios — simple single-variable match, overlapping-pattern priority resolution, and hierarchical composition (Phase A result absorbed into a Phase B pattern) — asserting exact `translation`/`variables`/`matchedTokens` output directly against `testPatternMatch`/`findBestPatternMatch`, not just `processTokens()` shape. The first two reuse the exact pattern/token/variable-cache values from `wasm-core/tests/pattern_matching_test.rs`'s `test_single_variable_pattern_match`/`test_pattern_competition_higher_priority_wins` so a future cross-language parity test has a near-trivial diff to build from. The hierarchical-composition scenario has no Rust counterpart in `pattern_matching_test.rs` (that coverage lives in `wasm-core/tests/two_phase_test.rs`, a different scope — `TwoPhasePatternProcessor`'s two-phase logic, not `matcher.rs`'s plain functions) and was written JS-native.

A real cross-language parity test (Rust calling the same fixtures via `matcher.rs`'s plain `pub fn`s) is still not built — this update closes the prerequisite, not the ADR's original decision.

## Context

A 2026-07-27 architecture review flagged the lack of a parity test between the two production implementations of pattern matching: `SemanticPatternProcessor.testPatternMatch()` (JS) and `wasm-core/src/pattern_processor/matcher.rs` (Rust). Per ADR-007, these are real production adapters — `applyPatterns()` switches from the WASM adapter to `SemanticPatternProcessor` after 3 consecutive WASM failures within 5 minutes — so divergence between them is a real, production-reachable risk, not hypothetical. This codebase has already shipped one confirmed production bug from exactly this failure class (`TextTokenizer`'s Rust punctuation classifier silently missing 20 of 41 characters JS classified correctly — see CLAUDE.md).

Investigation found parity tooling already existed — `src/utils/__benchmarks__/PatternParityTest.js`, `window.runPatternParityTests` (wired into `DevConsole.js`), and a standalone `test-pattern-parity.html` — all from the original Rust migration commit (`e49f655`, 2026-01-03). It had been broken since the moment it was created, in two independent ways:

1. That same commit removed `TwoPhasePatternProcessor`'s 283-line internal JS fallback ("JavaScript fallback removed after parity verification"), but the parity tool's mechanism depended on toggling `processor.options.enableWasm = false` to get "JS results" from the same class. `processTokens()` has thrown `WASM Pattern Processor not available` on that path ever since — the tool never worked post-creation.
2. Independently, `DevConsole.js`'s wiring read `engine.twoPhasePatternProcessor`, a property `TranslationEngine` never had at any point in its history. The guard (`if (!processor) return`) made the command a silent no-op regardless of bug (1).

The tool was also comparing the wrong things even in principle: `TwoPhasePatternProcessor` toggled to fake-JS-mode versus itself, not the two real adapters (`SemanticPatternProcessor` vs `TwoPhasePatternProcessor`) `applyPatterns()` actually switches between.

Before building a replacement, we checked whether either side has fixture-based tests asserting concrete matched output (translation string, indices, winning pattern) for the core matching decision — the ground truth a real parity test would compare against. Neither does. `SemanticPatternProcessor.test.js`'s `processTokens()` tests only assert array shape (`Array.isArray(result)`, `toHaveLength(0)`); none assert a specific match's translation or position. `matcher.rs`'s own `mod tests` only covers `build_result` (template substitution), not `test_pattern_match`/`find_best_pattern_match` — the actual matching-decision functions.

## Decision

Delete the broken tooling: `PatternParityTest.js`, its `DevConsole.js` wiring, and `test-pattern-parity.html`. Do not build a replacement parity test in this pass.

## Reasoning

**A parity test needs a trusted oracle on at least one side.** This codebase's established parity-test pattern (`wasm-core/tests/conflict_resolution_parity_test.rs`) validates an independent Rust re-implementation against documented JS test vectors. That pattern presupposes the JS side already has well-tested, concrete expected outputs to mirror. For `testPatternMatch`, that oracle doesn't exist — building "parity" now would mean inventing expected behavior for hierarchical composition, priority/`lowPriority` resolution, and variable-type validation on both languages simultaneously, with no independent reference to check against. That isn't verifying parity; it's guessing twice and calling agreement verification.

**The broken tooling is worse than no tooling.** A dev-console command or HTML page that appears to test parity but has silently no-op'd or thrown for 7 months is a false-confidence hazard — the same locality-gap shape found elsewhere in this review round (`WasmDictionaryManager.errorHandling.test.js` testing `handleFailure()` directly instead of the real catch-block wiring). Deleting it is unambiguously correct regardless of what happens with real parity coverage.

**The risk is real, so this is a deferral, not a dismissal.** Unlike `DictionaryManager.validateIntegrity()` (ADR-034 candidate, rejected outright — no evidence anyone needed it, zero callers anywhere in the trie-level health-check subsystem), the JS/WASM pattern-matcher pair is a demonstrated risk class in this exact codebase. The gap here is groundwork, not need.

## Consequence

Before a future review re-proposes a `pattern_matcher_parity_test.rs`, the JS side needs real fixture-based tests for `testPatternMatch()` first — concrete input/token fixtures asserting exact `translation`/`startIndex`/`endIndex`/winning-pattern output, covering at minimum: a simple single-variable match, an overlapping-pattern priority resolution, and a hierarchical-composition case (Phase A result absorbed into a Phase B pattern). Once that oracle exists, `matcher.rs::find_best_pattern_match`/`test_pattern_match` are plain `pub fn` reachable directly from `wasm-core/tests/*.rs` (no `wasm_bindgen` boundary, unlike `conflict_resolution.rs`'s flat-array production API) — the Rust test can call the real production function directly against the same fixtures rather than hand-porting a shadow implementation.

The archived migration docs (`docs/archive/pattern-matching-migration/`) remain as historical record of the original one-time verification effort; `docs/PATTERN_MATCHING_RUST_MIGRATION_COMPLETE.md` was moved there alongside its sibling guide as part of this cleanup.
