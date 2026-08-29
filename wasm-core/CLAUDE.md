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
If scores tie exactly, also check `calculate_priority` (`pattern.rs`) — it tie-breaks fewer-variables-wins
(matching `find_best_pattern_match`'s rule), but was inverted until 2026-08-29 (silently favored a longer,
more-variable pattern over a shorter, more-specific one waiting to compose — e.g. `这位X` losing to `X的Y`).
`.priority`'s only real consumers are `find_best_pattern_match` and this tie-break; `trie.rs` has an unrelated
same-named field (dictionary trie metadata) — don't let a bare `.priority` grep pull it in.

**Test coverage:** `test_phase_a_composite_bonus_wins_over_larger_own_span` (`tests/two_phase_test.rs`) covers the
trailing-bonus path (`estimate_trailing_bonus`) end-to-end, via `process_tokens`. `estimate_leading_bonus` has
direct unit coverage (architecture review 2026-07-29, candidate #5) in `two_phase.rs`'s inline
`mod tests::estimate_leading_bonus` — 5 tests, including the critical case that the two functions are NOT mirror
images: trailing scans forward from `var_idx+1` and `break`s at the next variable; leading scans forward through
`tokens[..var_idx]` and `.clear()`s on hitting a variable, keeping only the LAST contiguous literal run before
`var_idx` (verified: a `[Lit, Var, Lit, Lit, Var]`-shaped pattern correctly discards the literal run before the
earlier variable). A passing trailing test gives no confidence about leading correctness — they're genuinely
different code shapes, not symmetric halves of one algorithm.

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

**`pub(crate)` functions (e.g. `tokenize_text_core`) are unreachable from `wasm-core/tests/*.rs`** — integration test files only see the crate's public API. Tests against a `pub(crate)` function must live inside that source file's own `#[cfg(test)] mod tests` (nest a submodule there if it needs its own file-like organization — see `text_tokenizer.rs`'s `mod tests::parity`).

**Removing/renaming a `parse_pattern`/`SemanticPattern` positional field:** grep under-counts call sites that pass it as a bare positional value (no field name to match). `two_phase.rs`, `index.rs`, and `mod.rs` each have their own inline `#[cfg(test)] mod tests` with `parse_pattern(...)` calls — easy to miss since they're not in `wasm-core/tests/`. Use `cargo build --tests` (not `cargo build`) as the completeness check; the compiler enumerates every call site. **`benches/*.rs` is NOT covered by `--tests`** — it silently bit-rots (found 2026-08-20: `pattern_matching.rs` had a stale `parse_pattern` call and a stale `find_best_pattern_match` call, broken across an unknown number of prior signature changes). Periodically run `cargo check --benches` too.

## `trie.rs` Is Not the Translation-Speed Hot Path

For any real translation text ≥50 chars (essentially all real usage), dictionary-lookup matching goes through a _separate_ native Rust trie in `src-tauri/src/lookup_index_engine.rs` (one Tauri IPC call, rayon-parallel across positions), not this file. Before benchmarking or optimizing `trie.rs` for "translation speed," trace the real call path — see ADR-040 for the full investigation and why an aho-corasick swap of the _actual_ hot path (the `src-tauri` trie, not this one) was evaluated and rejected.

## `number_processor.rs` Is Rust Spec Only — No WASM Export

`#[wasm_bindgen]` removed from `NumberProcessor` struct and impl. File kept as the spec/test suite for JS `NumberProcessor.js` (37 tests as of 2026-08-25 — previous "155" figure here was stale). Do NOT add `#[wasm_bindgen]` back.

**Not run in CI until 2026-08-25.** `wasm-core`'s `cargo test` was never wired into `.github/workflows/ci.yml` — only `pnpm test -- --run` (JS/Vitest) ran. A drift check that date found `b1dd912`'s 一千零六→1,006 fix had been correctly mirrored to Rust, but two other JS regression cases had no Rust equivalent (`二零二四年→năm 2024`, `百分之两百→200%`), and the existing percentage test discarded its result (`let _ = ...`) instead of asserting on it — structurally unable to fail. All three fixed same date; `cargo test --manifest-path wasm-core/Cargo.toml` now runs in CI. Independently-written parity tests (this codebase's general convention, see ADR-033) only hold if something actually runs them — treat this as the standing reminder to re-check for silent no-op assertions (`let _ = ...` on an assertion-shaped call) when adding to any Rust "spec/parity" test file.

**`parse_chinese_number`'s internal `THOUSANDS_RE`/`HUNDREDS_RE` use a bare `(.*)` remainder catch-all, not an enumerated alternation — this is the correct shape, keep it that way if porting logic here.** JS's `NumberProcessor.js` used to hand-write a second, narrower enumerated regex for the same internal remainder match, independent from (and missing several branches of) its own top-level `CONVERSION_PATTERNS` regex — e.g. no bare-`十`-with-no-leading-digit branch, so a three-magnitude compound like 三千二百十五 silently truncated to 3200 (the outer thousands regex matched fine; the inner recursive `parseChineseNumber` call on the hundreds remainder "二百十五" is where "十五" vanished). Fixed 2026-08-29 by making JS's internal regex match this file's `(.*)`-catch-all shape instead of unifying two enumerated lists. If `parse_chinese_number` is ever rewritten to an enumerated alternation for some reason, check whether JS's top-level `CONVERSION_PATTERNS` entries (which must stay enumerated — they decide how many characters to consume) have grown branches this file's internal matcher lacks.

## CI Compiles With `-D warnings`; Local `cargo test` Does Not

`.github/workflows/ci.yml` runs a plain `cargo test --manifest-path wasm-core/Cargo.toml` with no lint flags, but `actions-rust-lang/setup-rust-toolchain@v1` exports `RUSTFLAGS: -D warnings` by default. Every warning is therefore a hard CI failure, while the identical command passes locally — nothing in the repo records this, so the divergence looks inexplicable from the failure message alone.

Reproduce before pushing any Rust change: `RUSTFLAGS="-D warnings" cargo test --manifest-path wasm-core/Cargo.toml`.

Both failures found this way (2026-08-26) were latent for weeks and neither was a real defect: an unconstructed enum variant in `conflict_resolution_parity_test.rs` and an unnecessary `mut` in `string_processor.rs`'s tests. That is the shape to expect — dead-code and unused-binding lints in **test** code, which normal local runs never surface. Prefer closing the gap the lint points at over `#[allow(...)]`: the unconstructed `MatchType::Other` marked a genuine parity hole, since it mirrors the else-branch of the JS ternary at `WasmConflictResolution.js:74` that `literal`, `semantic`, `structural_pattern`, and `composite` matches all reach in production.

## Checking Module Liveness Before a Deep Call-Site Grep

`lib.rs`'s header comment (`// ✅ ACTIVE SYSTEMS`) lists only the modules considered live (NumberProcessor, DictionaryEngine as of 2026-08). A `pub mod` not listed there, with no `wasm-core/CLAUDE.md` note explaining deliberate retention (like `number_processor.rs`'s "spec only" note above), is a strong signal of abandoned work — check this before a full grep sweep for callers. Confirmed true in the 2026-07-17b review (`memory_management.rs`, `wasm_boundary.rs`, both absent from the list and dead) and again 2026-08-06 — this time inverted: `position_mapper.rs` WAS listed as active ("Used in `setPositionByMatch` for clickable highlighting"), but the claim was stale. `setPositionByMatch` (`SemanticArrayBuilder.ts`) takes precomputed `startPos`/`endPos` as arguments — an O(1) tokenIndex match, no string search, no WASM call. The real position-finding algorithm is `TextPositionMapper.ts`'s pure-JS `mapToPositions` (see root `CONTEXT.md`), which never called into `PositionMapper`. Git history: `"feat: add WASM Position Mapper foundation (Task #4 - partial)"` — built, never wired in, comment never corrected. **Presence in the list is also not sufficient** — pair every liveness check with a real caller-grep, not just the list, in either direction.

**Caveat (2026-07-18):** absence from the list is necessary but not sufficient — confirmed-live modules (`text_assembly`, `text_chunker`, `conflict_resolution`, `pattern_processor`, `string_processor`) are ALSO absent from the literal enumerated bullets (only NumberProcessor/DictionaryEngine are named there by design). Always pair the absence-check with a real caller-grep before concluding a module is dead — that's what actually settled all confirmed-dead cases so far, not the list absence alone.

## Deleting a Module — Check Cargo.toml Too

Before finishing a `pub mod` deletion, grep the crate for any dependency only that module used (e.g. `bincode` was `wasm_boundary.rs`'s sole consumer, removed alongside it) and drop it from `Cargo.toml` — an unused compiled dependency is the same shallow-surface problem as the dead code itself.

## `text_tokenizer.rs` Punctuation Classification Is a Catch-All, Not an Enumerated List

`tokenize_text_core`'s final `else` branch classifies **any** character that isn't `is_chinese_char`/`is_latin_letter`/`is_digit`/whitespace as `TokenType::Punctuation` — mirroring JS `TextTokenizer.ts`'s regex catch-all group (`[^\w\s一-鿿]+`). Do NOT reintroduce a finite `is_punctuation()` char-list here: the prior enumerated version (deleted 2026-07-17c) was missing 20 of the 41 characters in the production `punctuation.json` dictionary — including `…` and the corner brackets `「」『』` used constantly in Chinese-fiction dialogue — causing those chars to fall through to `unknown` in WASM while JS correctly typed them `punctuation`. This divergence had already caused one confirmed production bug (a spacing rule in `TranslationEngine.js` needed an allowlist workaround specifically because WASM gave `'…'` type `unknown`). `Token`/`TokenType` still derive `Deserialize`/`Serialize` matching the JS-side shape; `TokenType::Unknown` remains in the enum for wire-format parity but `tokenize_text_core` no longer constructs it (a finite Rust char list would always be one dictionary addition away from reopening this gap — the catch-all can't drift). Consequence for spacing: non-ASCII/non-CJK letters (Greek `α`, Cyrillic, accented Latin `é`) land in this same catch-all rather than `latin_word` (`is_latin_letter` is ASCII-only) — `needs_space()`/`needsSpace()` gained Rule 11 (2026-08-29) so a punctuation-typed token starting with `\p{L}` still gets spaced against an adjacent Chinese char, and `TranslationEngine.js`'s char-only inline spacing block got the matching check.

Token-count parity (grouping consecutive punctuation into one token vs. one token per char) is a separate, deliberately unfixed divergence: JS's `tokenizeJS` groups runs (`"……"` → 1 token), Rust emits one token per char (`"……"` → 2 tokens). Left as-is because the punctuation dictionary is single-char-keyed only — per-char tokens are safer against the dictionary-translate-prefix-match truncation risk documented in the root `CLAUDE.md`'s `cleanupFormatting` note. See `text_tokenizer.rs`'s `mod tests` (`punctuation_run_produces_one_token_per_character`) and `TextTokenizer.test.ts` (`groups a run of punctuation into one token`) for the characterization tests documenting both sides.

**Cross-language parity contract (architecture review 2026-07-29, candidate #6):** `../test-fixtures/tokenizer-parity.json` (repo root) is now the single shared source of truth for this divergence and the other 3 documented ones (CJK Extension A, Compatibility Ideographs, underscore, BOM) plus 6 agreement spot-checks. `text_tokenizer.rs`'s `mod tests::parity::tokenize_text_core_matches_the_shared_fixture` reads it via `include_str!` + `serde_json` and asserts `tokenize_text_core`'s real output against it; the JS mirror is `src/utils/__tests__/TextTokenizer.parity.test.ts`. `tokenize_text_core` is `pub(crate)` — this had to live inside `text_tokenizer.rs`'s own test module, not a separate `wasm-core/tests/*.rs` integration file. Adding a new documented divergence, or fixing an existing one: update the fixture first, both sides' tests will then tell you if the real implementation doesn't match what you just wrote.

## `cargo fmt` Has Never Been Run on This Crate — Don't Treat Drift as Your Regression, Don't Mass-Reformat

`rustfmt --check src/*.rs` (2026-08-17) shows formatting drift in every file in `wasm-core/src/` — `lib.rs`, `matcher.rs`, `index.rs`, `number_processor.rs` (20+ hunks), `text_assembly.rs`, `trie.rs`, `text_tokenizer.rs`, `text_chunker.rs`, the whole `pattern_processor/` dir. No `rustfmt.toml`/`.rustfmt.toml` exists anywhere in the repo to explain it as intentional non-default style — this is the crate simply never having been run through `cargo fmt`, not drift from a formatted baseline. No CI gate or pre-commit hook enforces it either.

When `rustfmt --check` flags a file you're editing, verify the specific lines are ones your own diff touched before treating it as something to fix — same discipline as the root `CLAUDE.md`'s `pnpm lint`/`||`-vs-`??` entries for JS/TS.

**Do not run a crate-wide `cargo fmt` pass as a drive-by fix.** It's pure mechanical churn with zero architectural value (formatting doesn't touch module depth/interface/locality) and a real cost: it buries `git blame`/`git log -p` history under a reformat-only commit spanning nearly every line in the crate — exactly the kind of archaeology this file's own entries above (e.g. `position_mapper.rs`'s stale-liveness-claim discovery, `text_chunker.rs`'s wasm32-gate root-cause trace) depend on staying legible. If formatting consistency ever becomes a real problem (merge conflicts, reviewer friction), add `rustfmt.toml` + a pre-commit hook to stop new drift going forward — don't retroactively reformat the existing crate.

**Scoping `rustfmt --check` to one file:** `cargo fmt --manifest-path wasm-core/Cargo.toml -- --check <path>` ignores the path and checks the whole crate. Run `rustfmt --check <path>` directly from inside `wasm-core/` instead.

## `text_chunker.rs`'s wasm32 Gate Was Vestigial — Verify a `cfg(target_arch)` Gate's Origin Before Trusting It

`is_punctuation_separator`/`chunk_text` were gated since commit `75ab043` to protect `chunk_text`'s then-return type `Result<js_sys::Array, JsValue>` (`js_sys::Array` is genuinely wasm-only). A later refactor (`4edb513`, `145824a`) rewrote `chunk_text` to return `Result<String, JsValue>` via pure-Rust `serde_json::to_string` — `js_sys::Array` is gone from the file entirely, but the gate was never revisited (architecture review 2026-08-17, candidate #4). `unicode_properties` (the crate the Unicode-category branch needs) was never wasm-only either — plain, untargeted `Cargo.toml` dependency. Confirmed via `git log -p -- <file>` tracing the origin commit, then a live native `cargo test` with the gates stripped (compiled and passed) before ungating for real. Before trusting any `#[cfg(target_arch = "wasm32")]` gate in this crate is still load-bearing, check whether the wasm-only dependency it was protecting is still actually used.
