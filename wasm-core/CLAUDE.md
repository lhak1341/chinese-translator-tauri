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

**Dev binary path:** `pnpm build-wasm-dev` outputs to `src/wasm/translation_wasm_core_bg.wasm` — that is what the dev server serves. `public/wasm/` is updated only by production builds (`pnpm build`) and can be months stale without breaking dev. When diagnosing a stale-binary bug, check `src/wasm/`, not `public/wasm/`.

**WASM-side console logging:** Add `#[cfg(target_arch = "wasm32")] { web_sys::console::log_1(&format!("...").into()); }` inside any Rust function — `web-sys` with `"console"` feature is already a dep. Use to trace Phase A/B results or variable cache hits without rebuilding the whole JS stack. Remove before commit.

**WASM debug panic diagnosis:** If `cargo test` passes, bug is WASM-specific debug build. Four confirmed Rust-side causes + one JS-side cause: (1) shadow stack exhaustion (deep opt-level=0 chains) — split work across separate WASM calls; (2) heap-allocated fields on a `#[wasm_bindgen]` struct accessed via raw `__wbg_ptr` (HashMap, Vec, etc.) — move such fields to `lazy_static!` and pre-initialize in constructor outside the `&self` borrow window; (3) lazy_static not pre-initialized — first method call that hits an uninitialized lazy_static inits it while the wasm-bindgen `RcRefMut` borrow is live → `alloc/rc.rs hint::assert_unchecked` (not OOB, intermittent, input-dependent) — fix: pre-initialize ALL lazy_statics in the constructor; (4) `regex::Regex` first `.find()`/`.captures()` call inside a struct method allocates a per-thread `Pool<Cache>` via `regex-automata 0.4.x` `Pool::get_slow` — same borrow-window category as (3) but panics at `rt/mod.rs:287:25` "attempt to subtract with overflow" in `Drop for Ref` — fix: run `.find("")` on every `Regex` in the constructor before any `&self` borrow window; (5) JS-side: FinalizationRegistry stale callback — if JS nulls the wrapper variable without calling `.__destroy_into_raw()` first, the GC callback stays registered; if dlmalloc reuses the freed Rc address for a new instance, the stale callback fires and decrements the new Rc's count to 0 → next method call: `Rc::increment_strong_count` reads count=0 → `alloc/rc.rs hint::assert_unchecked` fires (line shifts with Rust version: 3743 in 1.84, 3753 in 1.96 — same check). Fix is in the JS wrapper, not Rust: call `instance?.__destroy_into_raw()` before every `instance = null`. Narrow OOB location with `web_sys::console::log_1` checkpoints at key statements.

## Phase A Composite-Coverage Scoring

`select_non_overlapping_phase_a` scores candidates as `own_chars + composite_bonus`.
`composite_bonus` = verified literal chars a Phase B pattern would add if this candidate were its variable
(trailing after candidate, or leading before it). Shorter candidate wins if it enables a longer composite.
**Debugging:** if Phase A picks the wrong candidate, check whether the losing candidate's semantic type
passes `allowedVariableTypes` of the intended wrapping Phase B pattern — that's what the bonus check gates on.

**Test coverage:** `test_phase_a_composite_bonus_wins_over_larger_own_span` (`tests/two_phase_test.rs`) covers the
trailing-bonus path (`estimate_trailing_bonus`) — literal chars after the candidate. The mirror-image leading-bonus
path (`estimate_leading_bonus` — literal chars before the candidate) has zero test coverage, direct or indirect.
Verify it by hand before trusting a leading-bonus-dependent fix.

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

## `number_processor.rs` Is Rust Spec Only — No WASM Export

`#[wasm_bindgen]` removed from `NumberProcessor` struct and impl. File kept as the spec/test suite for JS `NumberProcessor.js` (155 tests validate parity). Do NOT add `#[wasm_bindgen]` back.

## Checking Module Liveness Before a Deep Call-Site Grep

`lib.rs`'s header comment (`// ✅ ACTIVE SYSTEMS`) lists only the modules considered live (NumberProcessor, DictionaryEngine, PositionMapper as of 2026-07). A `pub mod` not listed there, with no `wasm-core/CLAUDE.md` note explaining deliberate retention (like `number_processor.rs`'s "spec only" note above), is a strong signal of abandoned work — check this before a full grep sweep for callers. Confirmed true both times in the 2026-07-17b review: `memory_management.rs` and `wasm_boundary.rs` were absent from the list and both were dead.

**Caveat (2026-07-18):** absence from the list is necessary but not sufficient — confirmed-live modules (`text_assembly`, `text_chunker`, `conflict_resolution`, `pattern_processor`, `string_processor`) are ALSO absent from the literal enumerated bullets (only NumberProcessor/DictionaryEngine/PositionMapper are named there by design). Always pair the absence-check with a real caller-grep before concluding a module is dead — that's what actually settled all confirmed-dead cases so far, not the list absence alone.

## Deleting a Module — Check Cargo.toml Too

Before finishing a `pub mod` deletion, grep the crate for any dependency only that module used (e.g. `bincode` was `wasm_boundary.rs`'s sole consumer, removed alongside it) and drop it from `Cargo.toml` — an unused compiled dependency is the same shallow-surface problem as the dead code itself.

## `text_tokenizer.rs` Punctuation Classification Is a Catch-All, Not an Enumerated List

`tokenize_text_core`'s final `else` branch classifies **any** character that isn't `is_chinese_char`/`is_latin_letter`/`is_digit`/whitespace as `TokenType::Punctuation` — mirroring JS `TextTokenizer.ts`'s regex catch-all group (`[^\w\s一-鿿]+`). Do NOT reintroduce a finite `is_punctuation()` char-list here: the prior enumerated version (deleted 2026-07-17c) was missing 20 of the 41 characters in the production `punctuation.json` dictionary — including `…` and the corner brackets `「」『』` used constantly in Chinese-fiction dialogue — causing those chars to fall through to `unknown` in WASM while JS correctly typed them `punctuation`. This divergence had already caused one confirmed production bug (a spacing rule in `TranslationEngine.js` needed an allowlist workaround specifically because WASM gave `'…'` type `unknown`). `Token`/`TokenType` still derive `Deserialize`/`Serialize` matching the JS-side shape; `TokenType::Unknown` remains in the enum for wire-format parity but `tokenize_text_core` no longer constructs it (a finite Rust char list would always be one dictionary addition away from reopening this gap — the catch-all can't drift).

Token-count parity (grouping consecutive punctuation into one token vs. one token per char) is a separate, deliberately unfixed divergence: JS's `tokenizeJS` groups runs (`"……"` → 1 token), Rust emits one token per char (`"……"` → 2 tokens). Left as-is because the punctuation dictionary is single-char-keyed only — per-char tokens are safer against the dictionary-translate-prefix-match truncation risk documented in the root `CLAUDE.md`'s `cleanupFormatting` note. See `text_tokenizer.rs`'s `mod tests` (`punctuation_run_produces_one_token_per_character`) and `TextTokenizer.test.ts` (`groups a run of punctuation into one token`) for the characterization tests documenting both sides.
