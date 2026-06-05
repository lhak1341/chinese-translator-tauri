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

## RUSTFLAGS for wasm32

**Scope wasm32-specific linker flags in `.cargo/config.toml` `[target.wasm32-unknown-unknown]`**, NOT inline in `package.json` scripts. Inline `RUSTFLAGS=` bleeds into host-target build scripts (`cargo install`), causing Apple `ld` to reject GNU-only flags like `-z`. Current stack-size flag lives in `/.cargo/config.toml`.

## Build Profile

`npm run build-wasm-dev` (`wasm-pack build --dev`) = debug WASM — `overflow-checks = true`, `debug_assertions = true`, unoptimized. A panic in `tauri:dev` may not reproduce in production (`build-wasm` uses release: `overflow-checks = false`, `opt-level = 3`). When debugging a WASM panic, verify whether it is debug-only before assuming a logic error.

**WASM debug panic diagnosis:** If `cargo test` passes, bug is WASM-specific debug build. Four confirmed Rust-side causes + one JS-side cause: (1) shadow stack exhaustion (deep opt-level=0 chains) — split work across separate WASM calls; (2) heap-allocated fields on a `#[wasm_bindgen]` struct accessed via raw `__wbg_ptr` (HashMap, Vec, etc.) — move such fields to `lazy_static!` and pre-initialize in constructor outside the `&self` borrow window; (3) lazy_static not pre-initialized — first method call that hits an uninitialized lazy_static inits it while the wasm-bindgen `RcRefMut` borrow is live → `alloc/rc.rs hint::assert_unchecked` (not OOB, intermittent, input-dependent) — fix: pre-initialize ALL lazy_statics in the constructor; (4) `regex::Regex` first `.find()`/`.captures()` call inside a struct method allocates a per-thread `Pool<Cache>` via `regex-automata 0.4.x` `Pool::get_slow` — same borrow-window category as (3) but panics at `rt/mod.rs:287:25` "attempt to subtract with overflow" in `Drop for Ref` — fix: run `.find("")` on every `Regex` in the constructor before any `&self` borrow window; (5) JS-side: FinalizationRegistry stale callback — if JS nulls the wrapper variable without calling `.__destroy_into_raw()` first, the GC callback stays registered; if dlmalloc reuses the freed Rc address for a new instance, the stale callback fires and decrements the new Rc's count to 0 → next method call: `Rc::increment_strong_count` reads count=0 → `alloc/rc.rs hint::assert_unchecked` fires (line shifts with Rust version: 3743 in 1.84, 3753 in 1.96 — same check). Fix is in the JS wrapper, not Rust: call `instance?.__destroy_into_raw()` before every `instance = null`. Narrow OOB location with `web_sys::console::log_1` checkpoints at key statements.

## Phase A Composite-Coverage Scoring

`select_non_overlapping_phase_a` scores candidates as `own_chars + composite_bonus`.
`composite_bonus` = verified literal chars a Phase B pattern would add if this candidate were its variable
(trailing after candidate, or leading before it). Shorter candidate wins if it enables a longer composite.
**Debugging:** if Phase A picks the wrong candidate, check whether the losing candidate's semantic type
passes `allowedVariableTypes` of the intended wrapping Phase B pattern — that's what the bonus check gates on.

## Phase B Protection Blocks Shorter-or-Equal Matches

`matcher.rs:603-615`: a Phase B match spanning Phase A protected tokens is rejected if
`match_chars <= max_phase_a_chars`. Only Phase B matches LONGER than the Phase A result pass.
This is what enables hierarchical composition — the outer pattern must cover more chars than the inner.

## `semanticType: "$X"` Resolves at Match Time

A pattern with `semanticType: "$X"` stores the resolved type (e.g., `"character"`) in
`PatternProcessingResult.semantic_type` — NOT the literal `"$X"`. Phase B enhanced cache uses
this resolved type for `allowedVariableTypes` checks. Wrong type on the Phase A result = Phase B
composite silently fails type gate.

## Two Competing `allowAsPatternVariable: true` Patterns Block Compositing

If pattern A (inner) and pattern B (outer) both have `allowAsPatternVariable: true`, they race in
Phase A. B can win by being longer, consuming tokens A needed, then Phase B can't form the composite
(Phase B is blocked by the ≤-length guard). Fix: set `allowAsPatternVariable: false` on the intended
outer pattern so only A runs in Phase A and B wraps it in Phase B.

## Test locations

- `tests/two_phase_test.rs` — two-phase + hierarchical composite tests
- `tests/pattern_matching_test.rs` — `find_best_pattern_match` + `PatternMatcher` unit tests
- `tests/pattern_semantic_type_test.rs` — semantic type propagation Phase A → Phase B
