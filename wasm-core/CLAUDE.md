# wasm-core Pattern Processor

## Variable span limits

`DEFAULT_MAX_VARIABLE_SPAN = 6` (`matcher.rs`) caps variable resolution in **Phase A and static dict lookups only**.
Phase B overrides it: `max(6, max_phase_a_key_chars)` computed once per invocation in `two_phase.rs::process_phase_b`.

**Debugging composite failures:** If a Phase B pattern doesn't absorb a Phase A result, the Phase A result's token count was likely > 6 (pre-fix). The fix is in place — verify Phase B span logic in `process_phase_b` if regression.

## PatternIndex Key Is First Char — Lookup Must Match

`get_index_key` (`index.rs`) stores patterns under the **first char** of first literal (e.g. `"传"` for `传奇级X`).
Any lookup in `process_phase_a`/`process_phase_b` must use `first_char = token.value.chars().next()`, NOT the full token value.
Compound tokens (e.g. `"传奇"`) silently return no patterns otherwise — no error, pattern just never fires.

## WASM Failure Disables Two-Phase for the Session

`applyPatterns` catch block sets `this.settings.enableTwoPhasePatterns = false` after 3 failures (TranslationEngine.js ~line 2941).
JS fallback then runs silently. If a rebuilt WASM binary seems to have no effect: old binary likely caused 3 failures → failure flag is set.
Fix: Vite HMR on any JS file resets the engine instance, clearing the flag. Or do a full WebView reload.

## Build Profile

`npm run build-wasm-dev` (`wasm-pack build --dev`) = debug WASM — `overflow-checks = true`, `debug_assertions = true`, unoptimized. A panic in `tauri:dev` may not reproduce in production (`build-wasm` uses release: `overflow-checks = false`, `opt-level = 3`). When debugging a WASM panic, verify whether it is debug-only before assuming a logic error.

## Test locations

- `tests/two_phase_test.rs` — two-phase + hierarchical composite tests
- `tests/pattern_matching_test.rs` — `find_best_pattern_match` + `PatternMatcher` unit tests
- `tests/pattern_semantic_type_test.rs` — semantic type propagation Phase A → Phase B
