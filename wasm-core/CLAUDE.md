# wasm-core Pattern Processor

## Variable span limits

`DEFAULT_MAX_VARIABLE_SPAN = 6` (`matcher.rs`) caps variable resolution in **Phase A and static dict lookups only**.
Phase B overrides it: `max(6, max_phase_a_key_chars)` computed once per invocation in `two_phase.rs::process_phase_b`.

**Debugging composite failures:** If a Phase B pattern doesn't absorb a Phase A result, the Phase A result's token count was likely > 6 (pre-fix). The fix is in place — verify Phase B span logic in `process_phase_b` if regression.

## Test locations

- `tests/two_phase_test.rs` — two-phase + hierarchical composite tests
- `tests/pattern_matching_test.rs` — `find_best_pattern_match` + `PatternMatcher` unit tests
- `tests/pattern_semantic_type_test.rs` — semantic type propagation Phase A → Phase B
