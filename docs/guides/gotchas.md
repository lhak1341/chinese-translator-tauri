# Gotchas Reference

Pitfalls confirmed across development sessions in this repo, grouped by area. Each entry states a rule; the specific symbols under it are examples that make the rule recognisable, not the rule itself.

Deleted symbols live separately, in [deleted-symbols.md](deleted-symbols.md) — check there before recreating anything that looks missing.

## Architecture / Extraction

**After extracting Phase 1, reload broke** (2026-01-30): Removed constants still referenced. Always grep for usage before removing infrastructure.

## Environment / Tooling (RTK, Edit, Bash)

**Bash text output is lossy here — never verify from it.** An RTK proxy sits between the Bash tool and the real command, and it degrades output in ways that produce no error, so a result can look complete and be wrong. Verify with `Read` (or `sed -n 'N,Mp' file`) instead, and use `git ls-files | grep -i <name>` rather than `find`/`grep` to answer "does X exist". Known degradations, all silent:

- **Truncates large match sets** — a partial list, no error; the remainder lands in `~/Library/Application Support/rtk/tee/<n>_grep_*.log`.
- **Strips leading indentation** in tee-log `-A`/`-B` context — never build an `Edit` `old_string` from that whitespace.
- **Replaces long matched identifiers** (and import paths containing them) with `n`, which breaks caller-tracing.
- **Returns stale content** for recently-written files.
- **Filters `cargo test` failures** — assertion details (panicked at, left/right) only in `~/Library/Application Support/rtk/tee/<latest>_cargo_test.log`.
- **`bun run test --run` reported `1 failed` twice with no test name** through `| tail`/`| grep` (2026-10-06); `bunx vitest --run --reporter=verbose > file`, then grep the file, passed all 247 files. Cause not isolated — don't trust a piped summary for the name of a failure.
- **False negatives on existence checks** — confirmed on git-tracked files being actively Read the same session.
- **Rejects `find` compound predicates** (`-not`, `-exec`) outright: `rtk find does not support compound predicates or actions`. Use `/usr/bin/find` directly.

**`grep` is aliased to `rg`, so grep flag syntax silently misbehaves.** Prefer the Grep tool. When it must be bash: multi-pattern needs `-e 'A' -e 'B'` (`'A\\|B'` matches a literal backslash-pipe and returns nothing); `--include` is not a valid flag, use `-g '*.js'`; an unquoted `--include=*.ext` gets zsh-glob-expanded first, giving `no matches found` rather than a grep error; and `-g` occasionally reaches real BSD `grep` instead of the alias (`usage: grep`), in which case drop it and rerun plain recursive `grep`.

**Edit fails by doing less than asked, not by erroring** — verify the result rather than trusting the call. Three known cases, none of which report a problem:

- **Vietnamese diacritics** (`à`, `ở`) in `old_string` can fail to match even when `Read` shows byte-identical content, and survive the tool's own unicode-escape-swap retry. Don't attempt a third Edit.
- **`replace_all` matches exact whitespace**, so near-identical blocks differing only in indentation (this codebase's copy-pasted JSX, duplicated row/cell markup) get skipped. Grep-verify the replacement count afterward.
- **Blocks over ~100 lines** in `old_string` fail outright.

The fallback for all three is a `python3` line-index rewrite, which sidesteps string matching entirely: `python3 -c "with open(p) as f: lines=f.readlines(); open(p,'w').writelines(lines[:N]+lines[M:])"` removes line range N–M (0-indexed).

**No `timeout` command on this machine** (macOS, no GNU coreutils) — use the Bash tool's own `timeout` parameter instead of shell `timeout <cmd>` wrapping.

**`git diff HEAD`/`git diff <ref>` omits untracked new files** — when reviewing or diffing a session that created files, also pass their paths for direct `Read`, don't rely on the diff alone.

**`cargo-outdated` isn't installed** (installing it costs several minutes to compile) — for a quick "what would update" signal instead, use `cargo update --dry-run --manifest-path <crate>/Cargo.toml`; this repo's `Cargo.toml`s use loose version constraints, so the dry-run's semver-compatible bumps usually cover what you need.

**Prefer `cargo sweep` over `cargo clean` when asked to reclaim disk space** in `src-tauri/target` or `wasm-core/target` — full clean wipes the incremental compile cache, forcing a full rebuild on the next `bun run tauri:dev`/`tauri:build` (costly under this repo's active weekly deploy cadence). Syntax differs from every other cargo subcommand in this repo: `cargo sweep --time <days> <crate-dir>` takes a **positional path**, not `--manifest-path`. `bun run deploy` already runs this automatically via `sweep-targets` (7-day threshold); only reach for it manually outside that flow.

**Repo-wide search: use `git grep` (add `-- ':!graphify-out' ':!docs/archive'`), never `grep -r` from the root** — it descends into `wasm-core/target` and `src-tauri/target` (gigabytes) and ran past the 120 s timeout; `git grep` also skips the gitignored `src/wasm/` output, so name that path explicitly when you need it. The same two paths poison other sweeps: `prettier --check docs` fails on 20 unformatted `docs/archive` files, so check the files you touched by name.

**Bun does not hold back very-recently-published versions by default.** This repo never configured a cooldown under pnpm either — `minimumReleaseAge` was unset, and the `lucide-react@1.33.0` entry in the old `pnpm-workspace.yaml` was the residue of one explicit version pin, not a policy. To introduce one, set `minimumReleaseAge` in `bunfig.toml`; it takes **seconds**, where pnpm's took minutes, and per-package exemptions go in `minimumReleaseAgeExcludes` — note the plural, pnpm spelled it `minimumReleaseAgeExclude`. There is no `bun peers check`: `bun install` reports peer-range breaks inline as `warn: incorrect peer dependency "<pkg>@<version>"`, which is easy to scroll past — read the install output after any bulk dependency update rather than trusting its exit code. `bun pm scan` audits the lockfile for known vulnerabilities.

**`temp/` (repo root, gitignored) is this project's scratch/report-output directory** — prefer it over OS `$TMPDIR` when a skill or task generates a report/artifact file for this project (e.g. `/improve-codebase-architecture`'s saved HTML report), rather than defaulting to the skill's own OS-temp instructions unasked.

**`sed -i ''` can silently no-op** — ran with no error, changed nothing (confirmed 2026-09-07 on a variable rename across a hook file). Verify with a follow-up `grep`, or just use the Edit tool for renames — it either applies or errors, never silently does neither.

**Before treating a `bun run lint` ratchet failure as caused by your change, verify against a clean checkout** (`git stash -u && bun run lint`) — the `.lint-baseline.json` count can already be exceeded on `main` itself, independent of any edit.

**Ad-hoc scripts that import `src/` modules (benchmarks, importer scans): run them with `bun script.mjs`, not `node`** — src imports use `.js` specifiers for `.ts` files (`../logger.js` is `logger.ts`), so node dies with `ERR_MODULE_NOT_FOUND`. Put the script in the scratchpad, not the repo.

**To prove an engine change behaviour-preserving, diff its output before and after.** `bun script.mjs` cannot run the engine's WASM path; a throwaway vitest can, if it undoes the suite's WASM mock the way `TranslationEngine.phase1.test.js` does (`importOriginal` for `translation_wasm_core.js`, and a `WasmSharedModule` that reads the `.wasm` bytes), so it covers phase 1 too. Write one that dumps `[value, translated, translationSource]` per token to the scratchpad, run it, edit, run it again, `diff` the dumps, and delete the test. Production dictionaries read fine in the default sandbox (verified 2026-10-10: `ls`, `python3`, vitest `fs`); reach for `dangerouslyDisableSandbox` only after an EPERM.

**Comparing two WASM builds, or timing a `wasm-core` change:** use the `corpus-ab` skill (`.claude/skills/corpus-ab/`).

**A commit in a fresh `git worktree` (prototype and research branches) fails the pre-commit hook with `ENOENT` on `eslint`/`prettier`**: lint-staged resolves its binaries from the working tree's own `node_modules`, and a worktree has none. `ln -s <main checkout>/node_modules <worktree>/node_modules` before committing (the hook then also prettier-reformats the file), and `rm` the symlink before `git worktree remove`; do not reach for `--no-verify`.

- **Expected `bun run deploy` output, none of it an error:** the PostCSS "did not pass the `from` option" warning (no PostCSS config in the repo, so it comes from Vite or a dependency); "chunks larger than 500 kB" (desktop app loaded from disk; the knob is `build.chunkSizeWarningLimit`); two `INEFFECTIVE_DYNAMIC_IMPORT` notes (`WasmPatternProcessor.js` is also imported statically elsewhere). `import.meta.dirname` replaced `__dirname` in both Vite configs 2026-10-03, so the `configLoader: 'native'` warning should be gone; if it returns, a new `__dirname` crept in.

**Stay on TypeScript 6 — `bun outdated` lists 7.0.2 as Latest and it breaks two things (2026-11-08).** `typescript-eslint` refuses TS 7 (`bun run lint` crashes while loading the config), and `TranslationEngine.addUnitCallSites.test.js` reads the TS 6 compiler API (`ts.ScriptTarget` is `undefined` under 7). TS 7 also rejects Closure-style JSDoc types such as `function(): T` (use `() => T`). Revisit once `typescript-eslint` supports 7.1+; `^6.0.3` stays in `package.json`.

## JavaScript / TypeScript

**Synchronous WASM cannot be timed out via `Promise.race()`** (2026-02-14): `Promise.race([operation(), timeoutPromise])` with a synchronous WASM `operation()` blocks the JS thread for the whole call, and the value settles first, so the timeout never fires. True interruption requires a Web Worker. A `wasmOperationTimeout.js` wrapper around `processTokens` was deleted 2026-10-06 for this reason; do not re-add one.

**Idle-callback index loop — always snapshot queue length before loop** (2026-02-14): When using an index-based while loop over a queue inside a `requestIdleCallback` handler, capture `const initialQueueLength = this.cleanupQueue.length` _before_ the loop. If the catch block pushes retry tasks, `cleanupQueue.length` grows and the loop re-executes the retry task in the same callback — defeating deferred-retry intent. `BackgroundCleanupManager.processQueue` (`MemoryManagementRefinements.ts`) is the canonical fix.

**`EMERGENCY_CLEANUP_THRESHOLD = 10`, `CRITICAL_CLEANUP_THRESHOLD = 20`** (2026-02-13): Raised from 3/5 — keeping only 3–5 segments after cleanup wiped almost all clickable highlighting (expected max ≤35). Regression test at `src/utils/__tests__/TranslationEngine.regression.test.js:247` hardcodes these values; update both together if they ever change.

**Adjacent variable tokens in WASM patterns are unreliable — avoid in pattern authoring** (2026-02-14): `wasm-core/src/pattern_processor/matcher.rs:638-651` uses a greedy shortest-span heuristic when two consecutive variable tokens appear in a pattern (no backtracking). Patterns with a single variable token, or variables separated by at least one literal token, work reliably.

**JSX in utils:** `src/utils/` files returning JSX must use `.tsx` extension — TypeScript gives misleading parse errors (`')' expected`, not "JSX not supported") otherwise. Do NOT include `.tsx` in import paths; `allowImportingTsExtensions` is off.

**Dynamic JSON imports:** Never use `import(path, { assert: { type: 'json' } })` — Rolldown silently fails to rewrite the path in production. Use a static `import data from '...json'` at the top of the file.

**A regex character class cannot express Unicode intent — it matches code units, and the gap is silent.** Two instances, both corrupting text with no error:

- **Line terminators**: LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR (U+2029) are ECMAScript line terminators; stored as literal characters in a JS/TS file they break the regex literal itself. Write them as `\u2028`/`\u2029` escapes in character classes.
- **Surrogate pairs**: `[\uD800-\uDFFF]` matches every UTF-16 surrogate code unit, including both halves of a valid pair, so a plain char-class sanitizer deletes emoji and astral-plane characters from anything it touches. Paired and unpaired are indistinguishable without lookaround — use `[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]`. Found in `TextSanitization.ts::sanitizeForJson` (2026-07-17), where every dictionary entry containing an emoji was corrupted on save.

Check what a non-ASCII character-class range matches against a real fixture before shipping it, rather than reasoning about the range.

**`||` and `??` are not interchangeable wherever a legitimate falsy value can reach the operator** — this bug class has now produced three distinct variants here, so treat any swap as a change in behavior rather than a style fix. The two directions fail differently:

- **`||` where `0` is meaningful** — a caller-supplied numeric limit of `0` gets silently replaced by the default. `VocabularyWarmup`'s `maxCharacters`/`maxPhrases` had this (and the deleted `WasmMemoryPoolManager`'s `initialPoolSize`/`shrinkThreshold`); grep for `|| 50` / `|| 30` style defaults before assuming `0` is impossible.
- **`??` applied to a `cond && value` expression** — when `cond` fails, `&&` returns the literal falsy left-hand value (e.g. `false`), not `undefined`, so `??` treats it as non-nullish and stops, skipping the fallback `||` would have reached. Rewrite to `cond ? value : undefined` first, then swap. Found in `useDictionaryEntryForm.ts` (2026-08-12).

The general test before either swap: enumerate which falsy values can actually arrive at that operator, and check whether the two behave the same on each.

**`catch (_)`/unused catch bindings trigger lint warnings here.** `eslint.config.js` sets no `caughtErrorsIgnorePattern` — `varsIgnorePattern: '^_'`/`argsIgnorePattern: '^_'` cover vars and args, not catch clauses. Use bare `catch {}` (optional catch binding) when the error is unused, not `catch (_) {}`.

**Compare typed text with file-derived text only after `normalize('NFC')` on both sides (2026-11-08).** macOS stores filenames decomposed (NFD: `a` + U+0300) while keyboard input is composed, and `includes` treats them as different strings: 54 of 55 titles in `books.json` are not NFC, so the Bookshelf filter returned nothing for "Tà" against "Tào tặc" (`Bookshelf.tsx`'s `fold`). A new search box over a title or path needs the same; the Dictionary and Rules filters were not checked (inferred, unverified).

## Types / Imports

**`types/WasmTypes.ts` (project root) deleted 2026-08-08 (ADR-037)** — it was a test-only twin of `src/utils/wasm/WasmBoundaryValidation.ts` with a reversed `copyWasmTokens` param order, plus a drifted copy of `validateWasmDictionaryMatch` that its own tests were silently validating instead of the real one. `copyWasmTokens`/`validateWasmToken`/`validateWasmPatternMatch`/`validateRustLookupMatch`/`isMetadataSizeValid` are gone from `WasmBoundaryValidation.ts` too — their sole production caller (WASM NumberProcessor) was already deleted when Phase 3 moved to pure JS. `validateWasmDictionaryMatch` went too, with the WASM dictionary tier (ADR-073). Do not recreate either file's dead functions without a concrete new caller — see ADR-037.

**`validateDictionaryEntry` renamed — DO NOT revert** (2026-02-14): `configValidation.ts` exports `validateRawDictionaryEntry` (raw JSON structural validation). The name `validateDictionaryEntry` belongs to `src/components/dictionary/DictionaryTypes.ts` (dictionary-type-specific rules, different signature). Same name was a maintenance collision.

**Canonical homes for shared component types** (2026-02-14): `ThrottledStreamingState` → `UITypes.d.ts`. `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `DictionaryTypes.ts`. Import from these files; do not redeclare locally in components.

**Import from the file that _declares_ a symbol, not the file you saw using it** — a `.d.ts` or util that imports a type for its own signatures does not re-export it, and the failure (`TS2459: declares 'X' locally, but it is not exported`) arrives only after the import is written. Confirmed three times: `AppConfiguration` → `src/types/ComponentTypes`, never `configValidation`; `getDictionaryLabel`/`getDictionaryDropdownLabel`/`compareDictionaryOrder` → `dictionaryHelpers`, since the `DuplicateAnalyzer` re-export was removed 2026-02-13; `SemanticArrays` → `src/types/SemanticTypes`, not `TranslationEngineTypes` (which imports it to type `TranslationResult` and stops there). Grep for `^export .*<name>` before writing the path.

**`useConfigurationLoader.ts` deleted (2026-02-13)**: Hook existed with no callers or tests. Imperative equivalent is `loadValidatedConfiguration()` in `configurationHelpers.ts`.

## Rust / WASM Backend

**Rust `.len()` vs `.chars().count()` for Chinese text** (2026-02-13): In WASM/Rust code, always use `.chars().count()` when comparing _character_ lengths of strings that may contain Chinese or mixed-script text. `.len()` returns _byte_ count — one Chinese character is 3 bytes, so byte comparisons silently mis-rank pattern lengths. Affected: `matcher.rs` Phase A override, any length-based priority logic.

**Rust `HashMap` iteration order in template substitution** (2026-02-13): `HashMap` iteration is non-deterministic. When substituting multiple named variables into a template (e.g., `build_result` in `matcher.rs`), collect into a `Vec`, sort by key length descending, then iterate — ensures longest variable name matches first and results are deterministic across runs.

**`SegmentMatcher::find_matches` — do NOT re-add `used_indices`** (2026-02-13): Removed `HashSet<usize>` that blocked the same `unit_index` from matching at more than one text position. The same translated word (e.g., "bạn") can legitimately appear twice; `used_indices` silently dropped the second match, breaking highlight positions. The trie's length-greedy advance already prevents overlapping matches.

**`SegmentMatcher` trie: `unit_indices: Vec<usize>`, not `Option<usize>`** (2026-02-13): `TrieNode.unit_indices` is a `Vec` so multiple semantic units with the same translated text all have their index stored. Reverting to `Option<usize>` re-introduces last-writer-wins: the second `build_index` insert silently drops the first unit's click-highlighting.

**Tauri command guards are per-function, not inherited — a new command starts with none of them.** Nothing structural enforces these, so each new command silently ships unguarded until someone notices. Copy the guard set from the canonical sibling rather than writing the command fresh:

| Command shape                                         | Required guards                                                                                                                                                                                                   | Canonical example                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Writes user-supplied JSON via `fs::write`             | `json_string.len() > MAX_JSON_SIZE_BYTES` before writing                                                                                                                                                          | `save_dictionary`                |
| Iterates ZIP entries via `archive.by_index(i)`        | `\|\| filename.ends_with(".trie.json")` exclusion alongside the `.json` check, **and** `file.size() > MAX_JSON_SIZE_BYTES` before `read_to_string()` — missing either allows trie-cache pollution or ZIP-bomb DoS | `import_dictionaries`            |
| Returns dictionary IDs to the frontend, read or write | `validate_dictionary_id()` before returning — read commands are not exempt                                                                                                                                        | `list_proper_nouns_dictionaries` |

All three live in `dictionary_commands.rs`. When adding a command that matches a shape above, mirror the guard; when adding a guard to one command, check its siblings for the same shape.

**Benchmark files silently rot to compare against non-representative code** — nothing (test/type-check/lint) catches a benchmark whose baseline diverged from what production actually does now. The deleted `OptimizationBenchmarks.js`'s Benchmark #11 (2026-09-09) timed a no-spacing-rules JS loop against a no-spacing-rules WASM method, while production had moved to a spacing-rule-accurate path (`assembleWithSpacing`) months earlier. Before trusting a benchmark's numbers, check its inputs/methods still match the real call path — same discipline as this file's `trie.rs` entry above, generalized past just Rust.

## Testing Gotchas

**A lone failure in the full suite, in a file you didn't touch, is load flake** — a 5000 ms timeout or an "Unable to find an element" alike; seen in `DictionaryManager.composition` (2026-09-25, 2026-09-29) and `ReaderTab.openBook`'s palette-switch test (2026-09-29; its `['fp-1','fp-2']` mount-order test 2026-10-05), and `DictionaryScalability`'s "scale linearly" (2026-10-05 — it asserts wall-clock ratios, so it is flaky by construction), each passing alone and on the next full run. Re-run that file with `bunx vitest --run <path>` before debugging; a real failure reproduces there.

**A guard test that reads source files imports `src/test/sourceScan.ts`** (`productionSources(dir, { skipDirs, skipPaths })`, `stripComments`), never its own walker or comment regex. Five guards had five copies that disagreed (a `//` rule without the URL guard, a line-prefix filter, one guard scanning raw source). `stripComments` reads a `//` inside a string literal as a comment: fine for a scan, wrong for a parser. A new guard still needs its own liveness test (a scan that finds nothing must not look like success); `sourceScan.test.ts` covers the walker and the stripper themselves.

**`src/test/setup.ts` MUST NOT be deleted**: It is the Vitest setup file referenced by `vitest.config.ts:10` (`setupFiles: './src/test/setup.ts'`). The duplicate test files in `src/test/` were removed (stale copies of `src/utils/__tests__/`), but `setup.ts` was not.

**Vitest `vi.doMock` paths for non-existent WASM modules** (2026-02-13): For `translation_wasm_core.js` (virtual, doesn't exist on disk), the mock path must resolve to the same directory as the source file's import — not the test file's directory. Test in `src/test/` uses `'../wasm/translation_wasm_core.js'`; test in `src/utils/__tests__/` uses `'../../wasm/translation_wasm_core.js'` (both → `src/wasm/`).

**Vitest API — Jest-only names don't carry over silently** (2026-02-13, 2026-08-26): Vitest uses Chai, not jest-extended, for matchers — no `toEndWith`/`toStartWith`; use `.endsWith(' ')` + `.toBe(true)`, or `toMatch(/ $/)`. Same trap on the test-block API: Jest's known-broken-test marker is `test.failing(...)`; Vitest's is `test.fails(...)` — the wrong name throws `TypeError: test.failing is not a function` at collection time, not a helpful error.

**`SegmentPrecomputer.findUnitMatch` space-absorption** (2026-02-13): `normalizeText` trims leading whitespace, so `findUnitMatch(' tốt', 'tốt')` returns `{found:true, offset:0}`. Test text-reconstruction (`segments.map(s=>s.text).join('')`) rather than individual `.text` values when units follow spaces.

**`SegmentPrecomputer.precomputeSegmentsJS` — empty arrays**: Returns `[]` immediately via early-exit guard — does NOT produce non-semantic text segments for the input.

**`createRenderSegments` with `highlightedUnitIndex=-1`**: Non-semantic segments have `unitIndex=-1`; they become `isHighlighted=true` when caller passes `-1` as the highlighted index. Use `99` (or any non-matching value) in tests verifying non-semantic segments are unhighlighted.

**React Testing Library paragraph selector** (2026-02-13): `container.querySelectorAll('div > div')` matches both the component container AND paragraph children (RTL wraps everything in an extra div). Use `div > div > div` to select only paragraph-level divs inside a two-level component.

**A check that cannot fail is indistinguishable from no check** — it passes the same whether the behavior works or not, so verify the failure path can actually execute. Four shapes seen here: (1) RTL `waitFor(() => !result.current.isLoading)` resolves immediately — RTL only retries when the callback _throws_, so use `waitFor(() => expect(result.current.isLoading).toBe(false))`; (2) assertions nested inside an `if` on the behavior under test, or a `match`/ternary whose arms assert opposite things — both outcomes pass (3 such tests shipped in `book_loader.rs` 2026-09-16, all written because a third-party heuristic was _assumed_ rather than measured: `chardetng` keeps its multi-byte answer through a stray byte, so the branch never ran — settle such assumptions with a throwaway `eprintln!` probe test before writing the real one, and test the policy function directly rather than through the heuristic); (3) a test gated on an external fixture that returns early when it's missing — assert the fixture exists and make opting out explicit (`SKIP_READER_CORPUS_TESTS`); (4) the search-returned-nothing case already in `~/.claude/CLAUDE.md`. To prove a new regression test can fail: `/usr/bin/git stash push -q -- <implementation files only>`, run that one test file (it must fail for the reason being fixed, not an import error), then `git stash pop`.

**`PunctuationProcessor.isAlreadyProperlySpaced` regex — brackets not matched** (2026-02-13): `openingQuotePattern` embedded inside another `[...]` class closes early. The regex matches opening _quotes_ but NOT literal `[`/`(` brackets. Write tests using quote chars, not bracket chars.

**`PatternMatchResult::success()` sets `pattern: None`**: The struct stores `pattern_id` (the `original_pattern` string) instead of cloning the full pattern. Tests must use `result.pattern_id.as_deref().unwrap()`, not `result.pattern.as_ref().unwrap()`.

**Removing `export` from a named export also requires cleaning its test describe blocks**: Vitest does not statically analyze — importing a non-exported named export throws `TypeError: ... is not a function` at runtime. When you un-export a function, find any `describe('functionName', ...)` blocks in the corresponding test file and remove them too.

**`vi.mock('../X')` resolves relative to the TEST FILE's own path**, not the module under test's — when stubbing a child that the component-under-test imports from elsewhere, match the component's import depth, not the test file's. Wrong relative depth silently renders the REAL child instead of the stub (no error, just confusing downstream test failures). A path that resolves to no module at all is accepted too: `useEntrySelection.test.ts` mocked `'../components/ToastContext'` from `hooks/__tests__/`, so the mock never applied and nothing noticed because the test asserted no toast calls. When adding a mock, assert it is hit.

**Single test file:** `bun run test --run src/path/to/test.ts` — bun forwards positional paths through to vitest, so this filters correctly (verified: 1 file, 33 tests). Under pnpm the same shape silently ran the FULL suite, which is why this entry used to route around it via `bunx vitest run`; that trap is gone. `bunx vitest run <path>` works too. **Check the summary's `Test Files` count against what should have run before trusting a green** — a scoped run that ran everything and a full run that ran less both read as passes. Full suite = `find src -name '*.test.*' | wc -l` (237 on 2026-09-28); a full run started while another was still going (a 600 s foreground timeout leaves the first running in the background) reported `227 passed (227)`. Never start a second full run until the backgrounded one has reported.

**Vitest `include` is `src/**/*.{test,spec}.*` only** — a scratch verification test in `/tmp` or the scratchpad dir gets "No test files found," not an error about the path. Drop throwaway tests under `src/utils/__tests__/` and delete after.

**Test a `TranslationEngine.js` method that only reads specific `this.*` fields via `TranslationEngine.prototype.method.call(fakeThis, ...)`, not full `engine.initialize()`.** Skips WASM/dictionary-loader init (no stderr noise, ~3x faster — confirmed 1.4s vs. 4.4s for one file). Check which fields the method reads first. A method that reads none (the old `applyFinalCleanup` was one) belongs in a pure module, so test it there with plain inputs: it became `cleanFullText` in `FormattingPasses.ts`. `cleanupFormatting`, also pure now, takes the punctuation lookup as an argument; before the move it needed `this.dictionaryManager.translate`/`this.log` stubbed. Precedent: `TranslationEngine.regression.test.js`'s "Bug Fix: ...spuriously spacing..." blocks.

**`bun run test --run` (full suite) previously hung — root-caused and fixed 2026-08-08.** Cause: `EnhancedVirtualizedDictionaryTable.tsx`'s `refreshDuplicatesPreservingScroll` depended on the whole `scroll` object from `useVirtualScrollRange` (which returns a new object every render) instead of the one stable field it used (`scroll.getScrollTop`, since deleted as unread; the hook now returns six fields and still builds a new object every render, so depend on `scroll.scrollToTop` or `scroll.withScrollPreservation`, never on `scroll`) — infinite render loop, only triggered by `DictionaryManager.composition.test.tsx` mounting the real composition. Full suite now runs clean in ~30s. If it hangs again, suspect the same shape: a `useCallback`/`useEffect` dep on a whole hook-return-object instead of the specific stable field it reads — check `git log -S getScrollTop -- src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` for the fix commit.

**Run `bun run test --run > temp/x.log 2>&1; tail -c 400 temp/x.log` in the foreground — the full suite takes ~60 s.** Backgrounding it with a trailing `&` inside a `run_in_background` call completes the task when the wrapper exits, so the notification arrives while vitest still runs; poll the log for an `exit` line you echo yourself, and treat the notification as meaningless. Vitest reads source as it runs, so edit nothing (a break-check included) until the `exit` line appears.

**Test file placement follows the tree it's under, and the two trees disagree** — so check the sibling convention before creating a file rather than generalizing from the other half of the repo.

- **`src/utils/`** flattens: everything goes in `src/utils/__tests__/`, including modules living in `dictionary/`, `pattern/`, `highlighting/`. Not a nested `src/utils/<subdir>/__tests__/`. Two exceptions exist: `src/utils/ui/__tests__/` and `src/utils/reader/__tests__/` — check the siblings before generalizing.
- **`src/components/`** nests: a component in a subdirectory puts its test there (`src/components/dictionary/__tests__/`). Only root-level components with no subdirectory of their own (`ErrorBoundary.tsx`, `TabbedInterface.tsx`, a new cross-cutting primitive) use the flat `src/components/__tests__/`.

Confirm with `ls src/utils/__tests__/ | grep <ModuleName>` before adding one.

**Cross-language (wasm-core Rust ↔ src/ TS) shared test fixtures live in `test-fixtures/` at repo root** — read via `include_str!` + `serde_json` on the Rust side, a static JSON import on the TS side (`resolveJsonModule` pulls it in even though it's outside `tsconfig.json`'s `include` globs). Established 2026-07-29 for tokenizer parity (`test-fixtures/tokenizer-parity.json`, now read by JS alone) — reuse this location for any future wasm-core ↔ src fixture instead of picking a new one. **`src-tauri` ↔ `src` fixtures live in `src/test/fixtures/`** (`dictionary_id_rules.json`, ADR-060), read as `include_str!("../../src/test/fixtures/<name>.json")` from `src-tauri/src/`.

**A green `bun run type-check` only proves the call sites inside its scope agree, and this repo keeps two classes of call site outside it.** _Test files_: `tsconfig.json`'s `exclude` lists `**/*.test.ts`/`.test.tsx`/`.test.js`, and `eslint.config.js` ignores them too (`bunx eslint <test-file>.test.ts` prints "File ignored...", not a bug) — so a signature change adding a required prop/param never surfaces at a stale test file's loose object-literal call site; only running that test file catches it. _Intentionally-JS files_: `checkJs: false`, so `Translator.jsx`/`TranslationEngine.js` call sites are unchecked — copying a prop pattern out of one into a `.tsx` component can fail type-check for something the original does freely (`<HotkeyHandler activeTab={null}>` against `activeTab?: TabId`). A symbol deleted or renamed there is caught only by eslint `no-undef` and the tests, and `translateWithProgressiveBatches`'s batch loop has only its chunk-offset arithmetic pinned (`TranslationEngine.regression.test.js`), so after editing its callbacks or batch sizing run one real translation of a long text.

**Generated, gitignored inputs go stale — type-check reads `src/wasm/*.d.ts`, which only a WASM rebuild refreshes.** After changing a `#[wasm_bindgen]` signature (a constructor argument, a return type), `bun run type-check` still sees the old binding and reports `TS2554 Expected 1 arguments, but got 0` for a call that is already right; `bun run test` rebuilds stale WASM first, so run it before trusting type-check.

**`bun run lint` enforces a warning ceiling, it does not list warnings.** Every rule in `eslint.config.js` except `react-hooks/rules-of-hooks` is severity `warn`, so a bare `eslint .` always exits 0. `bun run lint` runs `scripts/lint-ratchet.mjs`, which fails when the warning count rises above `.lint-baseline.json` _and_ when it drops below (lower it with `bun run lint:baseline`). To see the findings themselves, run `bun run lint:full` or `bunx eslint <file>`. Warnings under the ceiling are pre-existing and unswept (concentrated in `TranslationEngine.js`, `DictionaryManager.js`) — after editing a file, check whether _your_ diff touched the flagged line before treating a warning as a regression you introduced. **The RTK proxy summarizes `eslint` output into a "Top rules/Top files" count regardless of flags** — even `--format unix` doesn't return file:line detail through it. To see which line a warning is on, `grep` the source for the pattern directly (e.g. `grep -n '||' file.ts`) and inspect each hit by hand. **To find the one warning your change added** (the ratchet says "+1" and names nothing), run `bunx eslint -f json` from inside a `python3` script, which bypasses the proxy: once on `git show HEAD:<file>` through `--stdin --stdin-filename <file>` and once on the working file, then `Counter`-diff the (`ruleId`, source-line text) pairs. A warning with no edited line usually means a JSDoc block now sits on a different function, so type-aware rules apply to it.

### Fake timers and async ordering

**`vi.useFakeTimers()` does not fake `performance.now()` by default** — pass `{ toFake: ['setTimeout','clearTimeout','setInterval','clearInterval','Date','performance'] }` explicitly when testing code with `performance.now()`-based thresholds or growth-rate math.

**Testing a strict `elapsed > N` (not `>=`) time-window guard**: a fake-timer interval tick fires exactly at its scheduled boundary, not at "total time advanced" — offset the interval by 1ms (or advance one tick past N) so the check crosses the boundary rather than merely reaching it.

**`requestAnimationFrame` in jsdom depends on whether fake timers are active.** Under `vi.useFakeTimers()`, RAF is fake-timer-driven — fires at simulated ~16ms ticks, no manual mock needed; advance via `vi.advanceTimersByTimeAsync(20)`/`vi.runAllTimersAsync()` before asserting retry/cancel behavior. Without fake timers, RAF never fires in jsdom at all — spy and manually invoke the captured callbacks:

```ts
const rafCalls: FrameRequestCallback[] = [];
vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
  rafCalls.push(cb);
  return 0;
});
// after act():
act(() => rafCalls.forEach((cb) => cb(0)));
vi.restoreAllMocks();
```

Applies to any hook with `requestAnimationFrame` in a `useEffect`. See `useEntryEditAndMove.test.ts` (real-timer mock) and `ScrollPositionRecovery.test.ts` (fake-timer mode).

**`vi.useFakeTimers()` + `waitFor`**: `waitFor` polls via internal `setTimeout`, which never fires under fake timers, so the test times out. Use `await act(async () => { vi.advanceTimersByTime(N); })` for timer-driven assertions, and drop fake timers entirely for tests that only need to flush async effects (`await act(async () => {})`).

**Async `await`-ordering tests**: to prove `await foo()` precedes `bar()`, use `foo: vi.fn(() => Promise.resolve().then(() => sequence.push('foo-resolved')))` and assert `sequence.indexOf('foo-resolved') < sequence.indexOf('bar')` after full execution — if the `await` is absent, `bar` fires before the microtask resolves and inverts the sequence. Run via `vi.useFakeTimers()` + `await act(async () => { vi.runAllTimersAsync(); })`.

**A class whose constructor starts a real timer** — e.g. a class with a `setInterval` in its constructor — needs `afterEach(() => instance.destroy())`. Check for an existing `destroy()`/cleanup method before reaching for fake timers.

### Mock mechanics

**`vi.clearAllMocks()` clears recorded calls, not queued implementations**: a `mockReturnValueOnce` a test never consumed is handed to the next test's first call, shifting every return after it (`useTranslatorEngine.test.js` returned the wrong engine, 2026-10-26). A `beforeEach` that sets a default on a factory mock resets it first: `vi.mocked(f).mockReset().mockReturnValue(…)`.

**`vi.mock` factories are hoisted above module-level `const` declarations** — use a bare `vi.fn()` in the factory body and set return values in `beforeEach`. If the mock object itself must be referenced in assertions (not just its return value), declare it via `vi.hoisted(() => ({...}))`; a bare `const` throws `ReferenceError` at hoist time.

**Moving a file into a directory whose barrel is already separately `vi.mock()`-ed** in some test: two `vi.mock()` calls for the same module path collide. Merge them into one factory covering both sets of exports rather than adding a second call.

**`vi.resetModules()` + `vi.hoisted()` shared state**: if a test file mixes a static top-of-file import with `resetModules()`-based dynamic re-imports of a module that transitively constructs a class backed by the same `vi.hoisted()` state object, the static instance and every re-imported instance share that one object — they are not isolated. Route every production-module import in the file through the same dynamic-import-after-`resetModules()` helper, not just some (see `WasmTextChunker.test.js`'s `importFresh()`, 2026-08-12).

**A test double must match what the real object has, not what the consumer expects** — the shape it returns and every property a gate reads. If consumer and double are wrong the same way, tests stay green while the integration is dead: a hook's status strings, and (2026-10-02) a `wasmInitialized` flag the real `DictionaryManager` never sets, so the check behind it never ran. Grep that the real class assigns a property before faking it.

**Test a hook whose output is a rendered element through a stub child that records its props, not through extra return fields** — `vi.mock` the child (e.g. `DictionaryEntry`) with a component that stores its props in a `vi.hoisted` object; assert on what the child _received_, and drive its callbacks (`onClose`, `onDictionaryChange`) from there. This tests the wiring too, and keeps a test-only `state` off the hook's interface. `useEffect(() => { mounts++ }, [])` inside the stub counts remounts (how the per-open `key` is pinned). Example: `useDictionaryModals.test.js`.

**Browser APIs called with `new` need class syntax** — `vi.fn().mockImplementation(arrow)` is not constructable. Use `class MockRO { constructor(cb) {...} observe = vi.fn(); disconnect = vi.fn(); }` then `global.ResizeObserver = MockRO as unknown as typeof ResizeObserver`.

**A test double must keep the real thing's contract: its interface in both directions, and the values and failures it produces.** Missing: a hand-listed `logger` subset must cover every method any reachable code path calls, not just what the test asserts on — it throws `TypeError: logger.X is not a function` the moment something on the path reaches a missing one. Confirmed twice: `print*Report()` methods (`TwoPhasePatternProcessor`, `TranslationProfiler`) call `logger.table(...)`; `TranslationEngine.patternProfiling.test.js`'s `{log,warn,error}`-only mock broke when `SemanticArrayBuilder`'s constructor started calling `logger.debug` (2026-09-08). Invented: `SemanticPatternProcessor.test.js` mocked `wasmStringProcessor` with `isAvailable`/`concatenateTokenValues`/`splitAtPosition`, which the class never had, so the real `buildCache` call threw into a `catch` and the tier went untested until it was deleted (ADR-078, 2026-10-05); `DictionaryMatchLookup.test.js`'s "a dictionary that throws" stub threw from a `root` getter only a deleted method read, and passed on the missing `findMatches` instead. Produced: `BookBindingStore.test.ts` stubbed `reinitializeEngine` to resolve `true` and failed it by rejecting, while the real one resolves `{ ok }` and never rejects, so the test's copy of the provider wiring dropped the `{ ok: false }` → throw mapping unseen (2026-10-20). Prefer spreading the real module's shape over hand-listing.

**`logger.warn`/`logger.error` always reach `console`** regardless of `NODE_ENV`, while `logger.log`/`.info`/`.debug`/`.group` are dev-only no-ops in the test env. Mock the logger module in any test exercising a warning or error path, or console output gets noisy.

**Module-level state survives between tests in one file** — a singleton-exported class (`globalPerformanceMonitor`: call its `reset()` in `beforeEach`, as `PerformanceMonitor.test.js` does, or `vi.resetModules()` and re-import it per test; or construct a fresh `new ClassName()` when the class is exported), or a cache. Every App File (`config`, `appearance`, `transform-rules`, `books` — `src/utils/appFile.ts`) caches its first load, so a test that stubs its IPC must call the file's own invalidate (`invalidateAppConfig`, `invalidateAppearanceConfig`, `invalidateTransformRules`, `invalidateBookRecords`) in `beforeEach`, or it silently tests the first seed. Stubbing at the IPC with that invalidate runs the real cache and lock under the test, and survives a change to the backend's own exports that a module-shaped `vi.mock` factory would freeze (see the contract-change bullet below; `useTransformRules.test.ts`'s `wireIpc`, 2026-09-29).

**`vi.mock(path, …)` replaces a module's exports for its importers, never for its own internal calls.** A function that calls a sibling export directly (not through an import) still reaches the real one, so a test that mocks the sibling passes while the real code runs. Give the function an injectable dependency and call the real function with fakes (`scanShelf(path, { scanLibrary, reconcile })`, `ReaderTab.openBook.test.tsx`), 2026-09-29.

### WASM wrapper tests

**`WasmProcessorLifecycle` must be mocked as an entire class** — a processor's `instantiateFn` calls `loadSharedWasmModule()`, which fetches the binary and throws in jsdom:

```js
vi.mock('../wasm/WasmProcessorLifecycle', () => ({
  WasmProcessorLifecycle: vi.fn(function () {
    return {
      initialize: vi.fn(async (fn) => {
        await fn(new ArrayBuffer(0));
        return true;
      }),
      hasFailed: false,
    };
  }),
}));
```

**That mock's implementation must be a plain `function`, not an arrow** — `new (vi.fn().mockImplementation(() => ({...})))()` throws `is not a constructor`. Hit while writing a text-tokenizer wrapper test (2026-08-12; the wrapper was deleted 2026-10-06) despite the correct pattern being documented directly above it.

**Any mocked WASM class instance whose wrapper calls `__destroy_into_raw()` on retire must include `__destroy_into_raw: vi.fn()`** — the retire path calls `instance?.__destroy_into_raw()` and throws "not a function" without it. Check this on every new WASM wrapper mock; it was found again on a text-chunker wrapper test (2026-08-12; the wrapper was deleted 2026-10-06) after already being documented for `WasmPatternProcessor`.

**`WasmCascadeRegistry.fireCascadeRetire()` swallows exceptions from every registered retire callback** via a per-handler `catch (_) {}`, including a broken mock's. If a cascade-retire test does not retire the wrapper as expected, look for a swallowed exception in the retire path (a missing `__destroy_into_raw`, typically) before suspecting cascade registration.

**Failure-handling tests must trigger via the real method throwing**, not by calling `handleFailure()`/`recordFailure()` directly — a direct call only proves the notification logic works, not that a real WASM error reaches it through the actual `catch`. Found in `WasmDictionaryManager.errorHandling.test.js` (2026-07-27; the file was deleted with the WASM dictionary tier, 2026-10-04).

### Engine and pipeline tests

**Pipeline phases testable in jsdom: 2 (proper nouns), 3 (numbers), 4 (phrases), 5 (chars)** — all pure JS. Phase 1 (WASM patterns) needs the binary and is covered in wasm-core Rust tests. **A green vitest run proves nothing about Phase 1**: WASM init fails with `ECONNREFUSED` in the test env, so Phase 1 does not run in most engine tests; a JS-side change near a Rust mirror can pass every JS test while the real `bun run tauri:dev` WASM path stays broken (confirmed 2026-09-10, when a JS matcher with a Rust twin still existed; ADR-101 deleted the JS side). Verify with `cargo test --manifest-path wasm-core/Cargo.toml` and a rebuilt `bun run build-wasm-dev` + manual `tauri:dev` check, not vitest alone.

**Simulate Phase 1 output in jsdom** by pre-marking tokens with `{ translated: 'X', translationSource: 'hierarchical_pattern' }` — later phases skip pre-marked tokens, so Phase 4/5 guards can be tested without WASM.

**`TranslationEngine` can be constructed bare** — `new TranslationEngine({enableMemoryMonitoring:false, enablePerformanceMonitoring:false})`, no `.initialize()` and no WASM — for testing thin delegator and guard methods. Pipeline tests need `.initialize()` and run in jsdom without WASM for phases 2–5 (`TranslationEngine.pipeline.test.js`); phase 1 patterns do nothing without the WASM binary, which `src/test/setup.ts` mocks to throw — `TranslationEngine.phase1.test.js` shows the three `vi.mock`s that load the real one from disk.

**Testing orchestration upstream of the WASM pipeline** (logic inside `processChunksInParallel`/`translateWithProgressiveBatches` before `translateDirectly` is reached): bare-construct the engine, stub `translateDirectly` (or the one heavy call, to `throw` immediately after the logic under test has run), then assert the side effect. See `TranslationEngine.regression.test.js`'s "processChunksInParallel chunkOffset wiring" block (it drove `translateWithChunking` until that was deleted 2026-10-05). The stub and the text must keep the real thing's shape or the logic under test never runs: `getTranslatableChunks` admits only Chinese content, so a Latin test text gives zero chunks and the stubbed `translateDirectly` is never called (the failure reads "expected 0 to be ≥ 2"); and a stub for a phase the pass does not `await` (`numberProcessor.processTokens`) must throw synchronously, since a rejecting async stub never reaches the phase's `catch` (`TranslationEngine.corruption.test.js`).

**`PatternStore.initializePatterns` object-format dicts key on `translation`, not `template`**: `{ 'X的': { translation: 'của X', allowAsPatternVariable: true } }`.

**A test file that hand-copies a production method "verbatim" is a reimplementation, not a mock** — it drifts silently. `TranslationEngine.patternSemanticType.test.js` (deleted 2026-10-24 with the field it tested) was missing a `groupLeader` assignment and hardcoded a value the real method derives dynamically. Prefer calling the real method on a minimal stub (`EngineClass.prototype.method.call(stub, ...)`).

**A `TextChunk[]` fixture capitalizes every chunk unless its `startedBy` says otherwise.** `applySmartCapitalization` keys on `startedBy` (`'start'` and sentence-end marks capitalize), not on position, so a lowercase expectation needs `startedBy: ','` (or similar) on every chunk after the first. Seen in `FullTextAssembly.test.ts`, 2026-10-10.

### jsdom and React Testing Library

**`renderHook` dep objects must be stable `const`s defined outside the callback** — an inline `makeArrays()` creates a new reference each render, retriggers the effect, and OOMs via infinite re-render.

**`renderHook` + `useRef(null)`**: effects that early-return on `!ref.current` never run their body, because no DOM node is attached at render time. Move the guard inside the async callback, drop it from the top-level guard, or call the callback ref before the effect is expected to fire.

**Read-only DOM properties (`scrollHeight`, `clientHeight`, `scrollWidth`) cannot be set** via `Object.assign` or direct assignment — use `Object.defineProperty(node, 'scrollHeight', { get: () => 8000 })`.

**jsdom normalizes inline style values on readback**, not just missing ones: hex colors read back as `rgb(r, g, b)`, `marginBottom: '0'` reads back as `'0px'`, and shorthand `border: 'none'` splits into `borderStyle`/`borderWidth`/`borderColor` — assert `toHaveStyle({ borderStyle: 'none' })`, not the shorthand. Assert the normalized form.

**Testing a plain (non-component) function that returns `ReactNode`**: `render(<>{someFn(...)}</>)` — wrap the call in a fragment rather than forcing it into a component. This codebase deliberately prefers plain functions over components for small JSX-returning utils (`PatternTextFormatter.tsx`, `SegmentedParagraphs.tsx`) to avoid new reconciliation boundaries.

**CSS Modules resolve to real hashed class names in vitest+jsdom (not stubbed)** — `container.getElementsByClassName(styles.someClass)` works for asserting two elements share one class (e.g. header/row column-width parity), stronger than an inline-style snapshot since it fails the moment either side's className changes independently.

**Mutating a mock/fixture object in place after `render()` does not retrigger `useMemo`/derived state keyed on that object's reference** — the dependency array sees the same reference, so the mutation is invisible until a real re-render happens. Set the fixture's final state before calling `render()`, not by mutating it mid-test.

**Row-level handlers with no test id** (e.g. `onContextMenu` on a row wrapper div): `fireEvent.contextMenu(someDescendantText)` still bubbles up to trigger it — avoids brittle `.closest()`/`.parentElement` DOM traversal to find the row wrapper.

**Testing a closure passed as a hook argument** (e.g. `useInlineFieldEdit(value, onCommit)` where `onCommit` builds a component-local object): mock the hook, capture the argument in the mock factory, invoke it directly in the test. Skips simulating the hook's own edit/blur state machine (already covered by that hook's own test file) and isolates the assertion to the caller's own logic. See `VirtualRowComponent.test.tsx`.

**Firing scroll/DOM events on a manually-attached `ref` callback** (e.g. a `scrollRefCallback` from a virtual-scroll hook): capture the node via the callback itself (`scrollRefCallback: (node) => { captured = node }`) and call `fireEvent` on it directly — do not hunt for it with a `querySelector('div[style*=...]')` CSS-string match against inline styles; brittle against style-string formatting and unrelated markup changes.

### Imports and naming traps

- **Changing a module's public contract — a new export, or a changed return shape of an existing one — while it's already covered by a `vi.mock(path, () => ({...}))` factory elsewhere in the suite**: the factory keeps returning the OLD shape, so mocked tests silently diverge from the real implementation — a downstream `TypeError` for a missing export, or a wrong-shaped value flowing through with no error at all for a changed shape, until an assertion fails somewhere unrelated. Grep `vi.mock.*<module path>` across the WHOLE suite (not just `import {fn} from`) before changing a shared module's contract, and update every factory found. Two confirmed instances: adding `callRustConfigWrite` to `appConfig.ts` (`ConfigurationManager.test.tsx`'s mock didn't have it); changing `TransformRuleBackend.loadTransformRules()`'s return from `TransformRule[]` to `{rules, droppedCount}` (`useDictionaryEntryForm.test.ts`'s mock still returned the old bare array — silently `undefined` rules, no error until a full-suite run surfaced 2 unrelated-looking failures). Third, 2026-09-26: a hand-picked `canMoveBetween` in `useDictionaryCRUD.test.ts`'s `utils/dictionary` barrel mock lacked the classifier's new exports (7 failures). Fix that stops the recurrence for a pure module: spread `...(await vi.importActual('<pure module path>'))` into the factory rather than hand-picking; and have new callers import a pure module by its path, not through a barrel tests mock.

### Before asserting

**Prove a new guard test by breaking the line it guards once** (delete the key, the `resetKey`, the in-commit read) and watching it fail; a second mechanism can make it pass anyway. The Dictionary table's switch test passed without the view's `key` until its two dictionaries shared their sources, because `useEntrySelection` prunes selected keys whose entry is gone. Mutate the exact call-site text with a uniqueness assert: a first-occurrence replace hit a doc comment and the guard test "passed" (2026-10-06). For a whole-file change, `cp` the file aside, `git show HEAD:<file> > <file>`, run the test, `cp` it back; `git stash` touches the index. A break that fails nothing may also mean the fixture never reaches the case: `《“你` merges into one chunk, so a one-hop walk passed a test written for two empty chunks; and a break that crashes (`chunks[-1]`) fails for the wrong reason (2026-10-24).

**Prove a refactor of a pure function by diffing it against `HEAD` on generated input:** `git show HEAD:<file> > <dir>/<Name>Old.ts` beside it, then a `bun` script feeding both the same output of the real producer (random strings through `TextChunker.chunkText`, not hand-built chunks), and classify every differing case before calling the change intended — the capitalization merge widened 1,943 of 300k as designed and narrowed 29 unexpectedly (2026-10-24). Delete the `Old` file afterwards.

**A pure function's test must pass the options its production caller passes, not `{}` or the defaults** — an option that selects a branch makes a test of the other branch pass for a path nobody runs. `cleanupFormatting(text, {}, …)` tests pinned the `useChunking` branch no caller took, while the live branch let `『你好。』` come out `. ’` (2026-10-24). When a function has a mode flag, grep its callers for the values they pass; a branch only tests reach is dead code, and its tests go with it.

**Before rewriting a refactored module's tests, run the old suite unchanged against the new code** — a pass is the behaviour-preserved proof, and moving cases first throws it away (the `useWindowedTranslation` suite passed against the `WindowFiller` adapter before its cases moved, 2026-09-30).

**Verify a fixture's expected value by running it, not by computing it in your head** — regexes, heuristic calculations (density scores, complexity weights), and interval arithmetic alike; a quick `node -e` snippet first. CJK-range regexes are easy to misjudge; one "proper noun density" pattern actually fired on nearly any punctuated Chinese sentence. Half-open ranges are the arithmetic case: a `countVisibleLines` fixture was asserted at 3 because one of four rows overlapping `[100, 400)` was miscounted by hand, and a keep-band test treated a chunk starting exactly at `end` as inside the band. For modules with tunable magic-number weights, assert directional or boundary relationships (`x > y`, `below threshold N → strategy A`) rather than pinning exact float outputs, so the test survives re-tuning.

**Temporary debug instrumentation in huge files (`TranslationEngine.js`, `Translator.jsx`) is easy to leave behind** — grep for `console.error`/`console.log`/whatever debug tag you added before considering a bug hunt finished. File size makes a stray line easy to miss on a final read-through.

**A throwaway probe test reports through a file, not `console.log`** — the setup swallows it (seen 2026-10-04 and 2026-10-09). `appendFileSync` the result to the scratchpad and read it back, or assert with `toEqual` and read the diff. Filter runs with `^ *Tests |^ FAIL`; `Error:` also matches logged noise from deliberate-failure tests. Name probes `Zz*` and confirm `ls src/utils/__tests__ | grep -c '^Zz'` is 0 before you finish.

## `// @ts-check` Coverage

26 files under `src/utils/` have `// @ts-check` active (grep the comment to find them); they were explicitly fixed to 0 errors, so do not remove it without understanding that. 18 utils remain deferred at 25–69 errors each.

Patterns required when adding it to a new file:

- `@returns {Array}` needs a type arg: `{Array<*>}` (TS2314)
- `// @ts-ignore` suppresses only the next single line — collapse multi-line imports to one line first
- Catch bindings: `} catch (/** @type {any} */ error) {`
- `window.customProp = x` needs `// @ts-ignore` above
- `@param {Object} options` with sub-property docs → inline type `@param {{ x: string }} [options]`
- `constructor(options = {})` where the type has required props → `// @ts-ignore` above the constructor
- Module-level `let x = null` → `/** @type {Function|null} */` above
- `const arr = []` → `const arr = /** @type {Array<{...}>} */ ([])`
- Tightening a shared utility's `@param` can break callers — grep them after narrowing

## CSS / UI Components

**`DictionaryEntry` modal layout is intentionally center-aligned**: `.modal` has `text-align: center` and `.formGroup` has `align-items: center` — labels render centered. Utility buttons (`---a`, `-aaa` etc.) require `white-space: nowrap` or they break across lines when `flex: 1` is applied.

**`EnhancedVirtualizedDictionaryTable` context menu buttons use CSS classes**: `Edit Entry`, `Move to...`, `Delete Entry` use `.contextMenuItem` / `.contextMenuItemDanger` from the CSS module with `:hover, :focus-visible` rules. Previously used JS `onMouseEnter`/`onMouseLeave` inline — do not revert.

**CSS `repeating-linear-gradient` for virtual scroll row shading: put gradient on rows container, NOT spacer** (`EnhancedVirtualizedDictionaryTable.tsx`): CSS `background` uses the element's **layout** y-position, not visual/transformed position — `translateY` is irrelevant. With gradient on the spacer, rows always see it at slice-local y (layout y=0..N), causing parity flips on every scroll. Place gradient on the rows container (direct parent of rows); use `backgroundPositionY: (startIndex % 2) * ITEM_HEIGHT + 'px'` for phase correction; set all row `backgroundColor` to `transparent`.
