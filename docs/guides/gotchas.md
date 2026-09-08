# Gotchas Reference

Pitfalls confirmed across development sessions in this repo, grouped by area. Each entry states a rule; the specific symbols under it are examples that make the rule recognisable, not the rule itself.

Deleted symbols live separately, in [deleted-symbols.md](deleted-symbols.md) — check there before recreating anything that looks missing.

## Architecture / Extraction

**After extracting Phase 1, reload broke** (2026-01-30): Removed constants still referenced. Always grep for usage before removing infrastructure.

**`HistoryOperation` type divergence — DO NOT swap** (2026-02-12): `LazyDictionaryContext.tsx` uses a local snapshot-based `HistoryOperation` (`oldData`/`newData: DictionaryData`). The canonical `src/types/DictionaryTypes.ts` version is delta-based (individual entries). These are architecturally incompatible — `LazyDictionaryContext.tsx` must keep its local definition.

## Environment / Tooling (RTK, Edit, Bash)

**Bash text output is lossy here — never verify from it.** An RTK proxy sits between the Bash tool and the real command, and it degrades output in ways that produce no error, so a result can look complete and be wrong. Verify with `Read` (or `sed -n 'N,Mp' file`) instead, and use `git ls-files | grep -i <name>` rather than `find`/`grep` to answer "does X exist". Known degradations, all silent:

- **Truncates large match sets** — a partial list, no error; the remainder lands in `~/Library/Application Support/rtk/tee/<n>_grep_*.log`.
- **Strips leading indentation** in tee-log `-A`/`-B` context — never build an `Edit` `old_string` from that whitespace.
- **Replaces long matched identifiers** (and import paths containing them) with `n`, which breaks caller-tracing.
- **Returns stale content** for recently-written files.
- **Filters `cargo test` failures** — assertion details (panicked at, left/right) only in `~/Library/Application Support/rtk/tee/<latest>_cargo_test.log`.
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

**Prefer `cargo sweep` over `cargo clean` when asked to reclaim disk space** in `src-tauri/target` or `wasm-core/target` — full clean wipes the incremental compile cache, forcing a full rebuild on the next `pnpm tauri:dev`/`tauri:build` (costly under this repo's active weekly deploy cadence). Syntax differs from every other cargo subcommand in this repo: `cargo sweep --time <days> <crate-dir>` takes a **positional path**, not `--manifest-path`. `pnpm tauri:deploy` already runs this automatically via `sweep-targets` (7-day threshold); only reach for it manually outside that flow.

**`pnpm update --latest`/`pnpm add pkg@latest` silently skip very-recently-published versions** (pnpm's built-in release-age cooldown) — bypassing it via an explicit version pin (`pnpm add pkg@x.y.z`) writes an exclude entry into `pnpm-workspace.yaml`, a shared repo-config change, not just a lockfile bump. Run `pnpm peers check` after any bulk dependency update — it catches peer-range breaks (e.g. a major bump outrunning a plugin's supported range) that a plain `pnpm add`/`update` won't warn about at all.

**`temp/` (repo root, gitignored) is this project's scratch/report-output directory** — prefer it over OS `$TMPDIR` when a skill or task generates a report/artifact file for this project (e.g. `/improve-codebase-architecture`'s saved HTML report), rather than defaulting to the skill's own OS-temp instructions unasked.

**`sed -i ''` can silently no-op** — ran with no error, changed nothing (confirmed 2026-09-07 on a variable rename across a hook file). Verify with a follow-up `grep`, or just use the Edit tool for renames — it either applies or errors, never silently does neither.

## JavaScript / TypeScript

**Synchronous WASM cannot be timed out via `Promise.race()`** (2026-02-14): `callWasmWithTimeout()` in `wasmOperationTimeout.js` uses `Promise.race([operation(), timeoutPromise])`. If `operation()` makes a synchronous WASM call, the JS thread is blocked for the full call duration — the timeout fires only _after_ WASM returns, not during it. True interruption requires a Web Worker.

**Idle-callback index loop — always snapshot queue length before loop** (2026-02-14): When using an index-based while loop over a queue inside a `requestIdleCallback` handler, capture `const initialQueueLength = this.cleanupQueue.length` _before_ the loop. If the catch block pushes retry tasks, `cleanupQueue.length` grows and the loop re-executes the retry task in the same callback — defeating deferred-retry intent. `BackgroundCleanupManager.processQueue` (`MemoryManagementRefinements.ts`) is the canonical fix.

**`EMERGENCY_CLEANUP_THRESHOLD = 10`, `CRITICAL_CLEANUP_THRESHOLD = 20`** (2026-02-13): Raised from 3/5 — keeping only 3–5 segments after cleanup wiped almost all clickable highlighting (expected max ≤35). Regression test at `src/utils/__tests__/TranslationEngine.regression.test.js:247` hardcodes these values; update both together if they ever change.

**Adjacent variable tokens in WASM patterns are unreliable — avoid in pattern authoring** (2026-02-14): `wasm-core/src/pattern_processor/matcher.rs:638-651` uses a greedy shortest-span heuristic when two consecutive variable tokens appear in a pattern (no backtracking). Patterns with a single variable token, or variables separated by at least one literal token, work reliably.

**`AdaptiveBufferCalculator` non-integer `bufferSize` corrupts virtual scroll** (`EnhancedVirtualizedDictionaryTable.tsx`): Medium tier used to return `visibleItems * 1.5` (e.g. `15 * 1.5 = 22.5`). Fixed at source in `AdaptiveVirtualScrolling.js:271` with `Math.floor(visibleItems * 1.5)`. Consumer `visibleRange` also floors defensively — keep both.

**JSX in utils:** `src/utils/` files returning JSX must use `.tsx` extension — TypeScript gives misleading parse errors (`')' expected`, not "JSX not supported") otherwise. Do NOT include `.tsx` in import paths; `allowImportingTsExtensions` is off.

**Dynamic JSON imports:** Never use `import(path, { assert: { type: 'json' } })` — Rolldown silently fails to rewrite the path in production. Use a static `import data from '...json'` at the top of the file.

**A regex character class cannot express Unicode intent — it matches code units, and the gap is silent.** Two instances, both corrupting text with no error:

- **Line terminators**: LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR (U+2029) are ECMAScript line terminators; stored as literal characters in a JS/TS file they break the regex literal itself. Write them as `\u2028`/`\u2029` escapes in character classes.
- **Surrogate pairs**: `[\uD800-\uDFFF]` matches every UTF-16 surrogate code unit, including both halves of a valid pair, so a plain char-class sanitizer deletes emoji and astral-plane characters from anything it touches. Paired and unpaired are indistinguishable without lookaround — use `[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]`. Found in `TextSanitization.ts::sanitizeForJson` (2026-07-17), where every dictionary entry containing an emoji was corrupted on save.

Check what a non-ASCII character-class range matches against a real fixture before shipping it, rather than reasoning about the range.

**`||` and `??` are not interchangeable wherever a legitimate falsy value can reach the operator** — this bug class has now produced three distinct variants here, so treat any swap as a change in behavior rather than a style fix. The two directions fail differently:

- **`||` where `0` is meaningful** — a caller-supplied numeric limit of `0` gets silently replaced by the default. `WasmMemoryPoolManager`'s `initialPoolSize`/`shrinkThreshold` and `VocabularyWarmup`'s `maxCharacters`/`maxPhrases` both had this; grep for `|| 50` / `|| 30` style defaults before assuming `0` is impossible.
- **`??` applied to a `cond && value` expression** — when `cond` fails, `&&` returns the literal falsy left-hand value (e.g. `false`), not `undefined`, so `??` treats it as non-nullish and stops, skipping the fallback `||` would have reached. Rewrite to `cond ? value : undefined` first, then swap. Found in `useDictionaryEntryForm.ts` (2026-08-12).

The general test before either swap: enumerate which falsy values can actually arrive at that operator, and check whether the two behave the same on each.

**`catch (_)`/unused catch bindings trigger lint warnings here.** `eslint.config.js` sets no `caughtErrorsIgnorePattern` — `varsIgnorePattern: '^_'`/`argsIgnorePattern: '^_'` cover vars and args, not catch clauses. Use bare `catch {}` (optional catch binding) when the error is unused, not `catch (_) {}`.

## Types / Imports

**`types/WasmTypes.ts` (project root) deleted 2026-08-08 (ADR-037)** — it was a test-only twin of `src/utils/wasm/WasmBoundaryValidation.ts` with a reversed `copyWasmTokens` param order, plus a drifted copy of `validateWasmDictionaryMatch` that its own tests were silently validating instead of the real one. `copyWasmTokens`/`validateWasmToken`/`validateWasmPatternMatch`/`validateRustLookupMatch`/`isMetadataSizeValid` are gone from `WasmBoundaryValidation.ts` too — their sole production caller (WASM NumberProcessor) was already deleted when Phase 3 moved to pure JS. Only `validateWasmDictionaryMatch` survives, called by `DictionaryWasmLookup.js`. Do not recreate either file's dead functions without a concrete new caller — see ADR-037.

**`validateDictionaryEntry` renamed — DO NOT revert** (2026-02-14): `configValidation.ts` exports `validateRawDictionaryEntry` (raw JSON structural validation). The name `validateDictionaryEntry` belongs to `src/components/dictionary/DictionaryTypes.ts` (dictionary-type-specific rules, different signature). Same name was a maintenance collision.

**Canonical homes for shared component types** (2026-02-14): `ThrottledStreamingState` → `UITypes.d.ts`. `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `DictionaryTypes.ts`. Import from these files; do not redeclare locally in components.

**`AppConfiguration` import path**: Always import from `src/types/ComponentTypes`, NOT from `configValidation`. `configValidation.ts` does not re-export it.

**`getDictionaryLabel` / `getDictionaryDropdownLabel` / `compareDictionaryOrder`**: Import directly from `dictionaryHelpers`. The re-export through `DuplicateAnalyzer` was removed (2026-02-13).

**`useConfigurationLoader.ts` deleted (2026-02-13)**: Hook existed with no callers or tests. Imperative equivalent is `loadValidatedConfiguration()` in `configurationHelpers.ts`.

## Rust / WASM Backend

**`DictionaryCache` Rust mutex pattern** (2026-02-12): Always collect needed data while holding the `cache` lock, then `drop(cache)` explicitly before acquiring `access_order`. Nested lock (holding `cache` while locking `access_order`) is a deadlock risk. See `set()` in `dictionary_commands.rs` for the canonical pattern.

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

**Rust tests for `lookup_index_engine.rs`**: Run with `cargo test --manifest-path src-tauri/Cargo.toml lookup_index_engine`. 21 tests cover trie matching, char-vs-byte index correctness, serial/parallel parity, categorization, and `build_comprehensive_lookup_index` guards.

## Testing Gotchas

**`src/test/setup.ts` MUST NOT be deleted**: It is the Vitest setup file referenced by `vitest.config.ts:10` (`setupFiles: './src/test/setup.ts'`). The duplicate test files in `src/test/` were removed (stale copies of `src/utils/__tests__/`), but `setup.ts` was not.

**Vitest `vi.doMock` paths for non-existent WASM modules** (2026-02-13): For `translation_wasm_core.js` (virtual, doesn't exist on disk), the mock path must resolve to the same directory as the source file's import — not the test file's directory. Test in `src/test/` uses `'../wasm/translation_wasm_core.js'`; test in `src/utils/__tests__/` uses `'../../wasm/translation_wasm_core.js'` (both → `src/wasm/`).

**Vitest API — Jest-only names don't carry over silently** (2026-02-13, 2026-08-26): Vitest uses Chai, not jest-extended, for matchers — no `toEndWith`/`toStartWith`; use `.endsWith(' ')` + `.toBe(true)`, or `toMatch(/ $/)`. Same trap on the test-block API: Jest's known-broken-test marker is `test.failing(...)`; Vitest's is `test.fails(...)` — the wrong name throws `TypeError: test.failing is not a function` at collection time, not a helpful error.

**`SegmentPrecomputer.findUnitMatch` space-absorption** (2026-02-13): `normalizeText` trims leading whitespace, so `findUnitMatch(' tốt', 'tốt')` returns `{found:true, offset:0}`. Test text-reconstruction (`segments.map(s=>s.text).join('')`) rather than individual `.text` values when units follow spaces.

**`SegmentPrecomputer.precomputeSegmentsJS` — empty arrays**: Returns `[]` immediately via early-exit guard — does NOT produce non-semantic text segments for the input.

**`createRenderSegments` with `highlightedUnitIndex=-1`**: Non-semantic segments have `unitIndex=-1`; they become `isHighlighted=true` when caller passes `-1` as the highlighted index. Use `99` (or any non-matching value) in tests verifying non-semantic segments are unhighlighted.

**React Testing Library paragraph selector** (2026-02-13): `container.querySelectorAll('div > div')` matches both the component container AND paragraph children (RTL wraps everything in an extra div). Use `div > div > div` to select only paragraph-level divs inside a two-level component.

**RTL `waitFor` must throw, not return falsy** (2026-06-05): `waitFor(() => !result.current.isLoading)` resolves immediately — RTL only retries when the callback throws. Use `waitFor(() => expect(result.current.isLoading).toBe(false))` instead.

**`PunctuationProcessor.isAlreadyProperlySpaced` regex — brackets not matched** (2026-02-13): `openingQuotePattern` embedded inside another `[...]` class closes early. The regex matches opening _quotes_ but NOT literal `[`/`(` brackets. Write tests using quote chars, not bracket chars.

**`PatternMatchResult::success()` sets `pattern: None`**: The struct stores `pattern_id` (the `original_pattern` string) instead of cloning the full pattern. Tests must use `result.pattern_id.as_deref().unwrap()`, not `result.pattern.as_ref().unwrap()`.

**Removing `export` from a named export also requires cleaning its test describe blocks**: Vitest does not statically analyze — importing a non-exported named export throws `TypeError: ... is not a function` at runtime. When you un-export a function, find any `describe('functionName', ...)` blocks in the corresponding test file and remove them too.

**`vi.mock('../X')` resolves relative to the TEST FILE's own path**, not the module under test's — when stubbing a child that the component-under-test imports from elsewhere, match the component's import depth, not the test file's. Wrong relative depth silently renders the REAL child instead of the stub (no error, just confusing downstream test failures).

**Single test file:** `pnpm exec vitest run src/path/to/test.ts` — `pnpm test -- --run <path>` (positional paths) and `pnpm test -- --testPathPattern` both silently run the FULL suite instead of filtering; check the file-count in the summary line before trusting a "fast" run was actually scoped.

**Vitest `include` is `src/**/*.{test,spec}.*` only** — a scratch verification test in `/tmp` or the scratchpad dir gets "No test files found," not an error about the path. Drop throwaway tests under `src/utils/__tests__/` and delete after.

**Test a `TranslationEngine.js` method that only reads specific `this.*` fields via `TranslationEngine.prototype.method.call(fakeThis, ...)`, not full `engine.initialize()`.** Skips WASM/dictionary-loader init (no stderr noise, ~3x faster — confirmed 1.4s vs. 4.4s for one file). Check which fields the method reads first: `applyFinalCleanup` is pure (`call({}, text)`); `cleanupFormatting` needs `this.dictionaryManager.translate`/`this.log` stubbed. Precedent: `TranslationEngine.regression.test.js`'s "Bug Fix: ...spuriously spacing..." blocks.

**`pnpm test -- --run` (full suite) previously hung — root-caused and fixed 2026-08-08.** Cause: `EnhancedVirtualizedDictionaryTable.tsx`'s `refreshDuplicatesPreservingScroll` depended on the whole `scroll` object from `useVirtualScrollRange` (which returns a new object every render) instead of the one stable field it used (`scroll.getScrollTop`) — infinite render loop, only triggered by `DictionaryManager.composition.test.tsx` mounting the real composition. Full suite now runs clean in ~30s. If it hangs again, suspect the same shape: a `useCallback`/`useEffect` dep on a whole hook-return-object instead of the specific stable field it reads — check `git log -S getScrollTop -- src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` for the fix commit.

**Test file placement follows the tree it's under, and the two trees disagree** — so check the sibling convention before creating a file rather than generalizing from the other half of the repo.

- **`src/utils/`** flattens: everything goes in `src/utils/__tests__/`, including modules living in `dictionary/`, `pattern/`, `highlighting/`. Not a nested `src/utils/<subdir>/__tests__/`. `src/utils/ui/__tests__/` is the one pre-existing exception.
- **`src/components/`** nests: a component in a subdirectory puts its test there (`src/components/dictionary/__tests__/`). Only root-level components with no subdirectory of their own (`ErrorBoundary.tsx`, `TabbedInterface.tsx`, a new cross-cutting primitive) use the flat `src/components/__tests__/`.

Confirm with `ls src/utils/__tests__/ | grep <ModuleName>` before adding one.

**Cross-language (wasm-core Rust ↔ src/ TS) shared test fixtures live in `test-fixtures/` at repo root** — read via `include_str!` + `serde_json` on the Rust side, a static JSON import on the TS side (`resolveJsonModule` pulls it in even though it's outside `tsconfig.json`'s `include` globs). Established 2026-07-29 for tokenizer parity (`test-fixtures/tokenizer-parity.json`) — reuse this location for any future cross-language fixture need instead of picking a new one.

**`pnpm exec eslint <test-file>.test.ts` always prints "File ignored because no matching configuration was supplied"** — `eslint.config.js` excludes test files entirely. Not a bug; confirmed against a pre-existing test file too.

**`pnpm lint` enforces a warning ceiling, it does not list warnings.** Every rule in `eslint.config.js` except `react-hooks/rules-of-hooks` is severity `warn`, so a bare `eslint .` always exits 0. `pnpm lint` runs `scripts/lint-ratchet.mjs`, which fails when the warning count rises above `.lint-baseline.json` _and_ when it drops below (lower it with `pnpm lint:baseline`). To see the findings themselves, run `pnpm lint:full` or `pnpm exec eslint <file>`. Warnings under the ceiling are pre-existing and unswept (concentrated in `TranslationEngine.js`, `DictionaryManager.js`) — after editing a file, check whether _your_ diff touched the flagged line before treating a warning as a regression you introduced. **The RTK proxy summarizes `eslint` output into a "Top rules/Top files" count regardless of flags** — even `--format unix` doesn't return file:line detail through it. To see which line a warning is on, `grep` the source for the pattern directly (e.g. `grep -n '||' file.ts`) and inspect each hit by hand.

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

**A class whose constructor starts a real timer** — e.g. `PerformanceBaselineTracker`'s `setupPeriodicAnalysis()` — needs `afterEach(() => instance.destroy())`. Check for an existing `destroy()`/cleanup method before reaching for fake timers.

### Mock mechanics

**`vi.mock` factories are hoisted above module-level `const` declarations** — use a bare `vi.fn()` in the factory body and set return values in `beforeEach`. If the mock object itself must be referenced in assertions (not just its return value), declare it via `vi.hoisted(() => ({...}))`; a bare `const` throws `ReferenceError` at hoist time.

**Moving a file into a directory whose barrel is already separately `vi.mock()`-ed** in some test: two `vi.mock()` calls for the same module path collide. Merge them into one factory covering both sets of exports rather than adding a second call.

**`vi.resetModules()` + `vi.hoisted()` shared state**: if a test file mixes a static top-of-file import with `resetModules()`-based dynamic re-imports of a module that transitively constructs a class backed by the same `vi.hoisted()` state object, the static instance and every re-imported instance share that one object — they are not isolated. Route every production-module import in the file through the same dynamic-import-after-`resetModules()` helper, not just some (see `WasmTextChunker.test.js`'s `importFresh()`, 2026-08-12).

**Mock the shape the real implementation returns, not the shape the consumer expects.** If both are wrong the same way, tests stay green while the integration is broken — found when a hook's status-string check and its test's mock both used strings the real method never produces.

**Browser APIs called with `new` need class syntax** — `vi.fn().mockImplementation(arrow)` is not constructable. Use `class MockRO { constructor(cb) {...} observe = vi.fn(); disconnect = vi.fn(); }` then `global.ResizeObserver = MockRO as unknown as typeof ResizeObserver`.

**`vi.mock('../logger'...)` factories must cover every method any reachable code path calls, not just what the test asserts on** — a hand-listed subset throws `TypeError: logger.X is not a function` the moment something on the path reaches a missing one. Confirmed twice: `print*Report()` methods (`TwoPhasePatternProcessor`, `TranslationProfiler`) call `logger.table(...)`; `TranslationEngine.patternProfiling.test.js`'s `{log,warn,error}`-only mock broke when `SemanticArrayBuilder`'s constructor started calling `logger.debug` (2026-09-08). Prefer spreading the real module's shape over hand-listing.

**`logger.warn`/`logger.error` always reach `console`** regardless of `NODE_ENV`, while `logger.log`/`.info`/`.debug`/`.group` are dev-only no-ops in the test env. Mock the logger module in any test exercising a warning or error path, or console output gets noisy.

**Singleton-exported classes** (`adaptiveChunker`, `parallelDictionaryLoader`) — construct a fresh `new ClassName()` per test. The singleton accumulates history, stats, and caches across tests.

### WASM wrapper tests

**`WasmProcessorLifecycle` must be mocked as an entire class** — `initialize` calls `fetchWasmBinary` internally and throws in jsdom:

```js
vi.mock('../wasm/WasmProcessorLifecycle', () => ({
  WasmProcessorLifecycle: vi.fn(function () {
    return {
      initialize: vi.fn(async (fn) => {
        await fn(new ArrayBuffer(0));
        return true;
      }),
      hasFailed: false,
      pendingInit: null,
    };
  }),
}));
```

**That mock's implementation must be a plain `function`, not an arrow** — `new (vi.fn().mockImplementation(() => ({...})))()` throws `is not a constructor`. Hit while writing `WasmTextTokenizer.test.js` (2026-08-12) despite the correct pattern being documented directly above it.

**Any mocked WASM class instance whose wrapper calls `__destroy_into_raw()` on retire must include `__destroy_into_raw: vi.fn()`** — the retire path calls `instance?.__destroy_into_raw()` and throws "not a function" without it. Check this on every new WASM wrapper mock; it was found again on `WasmTextChunker.test.js` (2026-08-12) after already being documented for `WasmPatternProcessor`.

**`WasmMemoryPoolManager` mocks must satisfy `WasmBufferAllocator`**: `{ getBuffer: vi.fn(() => new ArrayBuffer(1024)), returnBuffer: vi.fn(), getStats: vi.fn(() => ({ totalMemoryUsage: 0 })), cleanup: vi.fn() }`. Do **not** include `getCurrentMemoryUsage` — it is private and not on the interface. `WasmDictionaryManager.loadDictionary` calls `getStats()` on success, so omitting it throws into the catch block.

**`WasmCascadeRegistry.fireCascadeRetire()` swallows exceptions from every registered retire callback** via a per-handler `catch (_) {}`, including a broken mock's. If a cascade-retire test does not retire the wrapper as expected, look for a swallowed exception in the retire path (a missing `__destroy_into_raw`, typically) before suspecting cascade registration.

**Failure-handling tests must trigger via the real method throwing**, not by calling `handleFailure()`/`recordFailure()` directly — a direct call only proves the notification logic works, not that a real WASM error reaches it through the actual `catch`. Found in `WasmDictionaryManager.errorHandling.test.js` (2026-07-27).

### Engine and pipeline tests

**Pipeline phases testable in jsdom: 2 (proper nouns), 3 (numbers), 4 (phrases), 5 (chars)** — all pure JS. Phase 1 (WASM patterns) needs the binary and is covered in wasm-core Rust tests.

**Simulate Phase 1 output in jsdom** by pre-marking tokens with `{ translated: 'X', translationSource: 'pattern' }` — later phases skip pre-marked tokens, so Phase 4/5 guards can be tested without WASM.

**`TranslationEngine` can be constructed bare** — `new TranslationEngine({debugLevel:0, enableMemoryMonitoring:false, enablePerformanceMonitoring:false})`, no `.initialize()` and no WASM — for testing thin delegator and guard methods. Full pipeline tests still need `.initialize()` plus WASM (see `TranslationEngine.integration.test.js`, `describe.skip`'d for that reason).

**Testing orchestration upstream of the WASM pipeline** (logic inside `translateWithChunking`/`translateWithProgressiveBatches` before `translateDirectly` is reached): bare-construct the engine, stub the one heavy call to `throw` immediately after the logic under test has run, then `await expect(...).rejects.toThrow()` and assert the side effect. See `TranslationEngine.regression.test.js`'s "parallel branch wiring" and "adaptiveChunker reset wiring" blocks (2026-08-18).

**`DictionaryManager` tests loading `properNouns-f_*`/`properNouns-_*` dicts** must pass `{ activeProperNouns: ['properNouns-f_test', 'properNouns'] }` as the second arg — the default `['properNouns']` silently excludes every prefixed dict with no error.

**`SemanticPatternProcessor.initializePatterns` object-format dicts key on `translation`, not `template`**: `{ 'X的': { translation: 'của X', allowAsPatternVariable: true } }`.

**A test file that hand-copies a production method "verbatim" is a reimplementation, not a mock** — it drifts silently. `TranslationEngine.patternSemanticType.test.js` was missing a `groupLeader` assignment and hardcoded a value the real method derives dynamically. Prefer calling the real method on a minimal stub (`EngineClass.prototype.method.call(stub, ...)`).

### jsdom and React Testing Library

**`renderHook` dep objects must be stable `const`s defined outside the callback** — an inline `makeArrays()` creates a new reference each render, retriggers the effect, and OOMs via infinite re-render.

**`renderHook` + `useRef(null)`**: effects that early-return on `!ref.current` never run their body, because no DOM node is attached at render time. Move the guard inside the async callback, drop it from the top-level guard, or call the callback ref before the effect is expected to fire.

**Read-only DOM properties (`scrollHeight`, `clientHeight`, `scrollWidth`) cannot be set** via `Object.assign` or direct assignment — use `Object.defineProperty(node, 'scrollHeight', { get: () => 8000 })`.

**jsdom normalizes inline style values on readback**, not just missing ones: hex colors read back as `rgb(r, g, b)` and `marginBottom: '0'` reads back as `'0px'`. Assert the normalized form.

**Testing a plain (non-component) function that returns `ReactNode`**: `render(<>{someFn(...)}</>)` — wrap the call in a fragment rather than forcing it into a component. This codebase deliberately prefers plain functions over components for small JSX-returning utils (`PatternTextFormatter.tsx`, `SegmentedParagraphs.tsx`) to avoid new reconciliation boundaries.

**CSS Modules resolve to real hashed class names in vitest+jsdom (not stubbed)** — `container.getElementsByClassName(styles.someClass)` works for asserting two elements share one class (e.g. header/row column-width parity), stronger than an inline-style snapshot since it fails the moment either side's className changes independently.

**Mutating a mock/fixture object in place after `render()` does not retrigger `useMemo`/derived state keyed on that object's reference** — the dependency array sees the same reference, so the mutation is invisible until a real re-render happens. Set the fixture's final state before calling `render()`, not by mutating it mid-test.

**Row-level handlers with no test id** (e.g. `onContextMenu` on a row wrapper div): `fireEvent.contextMenu(someDescendantText)` still bubbles up to trigger it — avoids brittle `.closest()`/`.parentElement` DOM traversal to find the row wrapper.

**Testing a closure passed as a hook argument** (e.g. `useInlineFieldEdit(value, onCommit)` where `onCommit` builds a component-local object): mock the hook, capture the argument in the mock factory, invoke it directly in the test. Skips simulating the hook's own edit/blur state machine (already covered by that hook's own test file) and isolates the assertion to the caller's own logic. See `VirtualRowComponent.test.tsx`.

**Firing scroll/DOM events on a manually-attached `ref` callback** (e.g. a `scrollRefCallback` from a virtual-scroll hook): capture the node via the callback itself (`scrollRefCallback: (node) => { captured = node }`) and call `fireEvent` on it directly — do not hunt for it with a `querySelector('div[style*=...]')` CSS-string match against inline styles; brittle against style-string formatting and unrelated markup changes.

### Imports and naming traps

- Anything calling `loadAppConfig()`: mock `../../utils/appConfig` directly (`vi.mock(..., () => ({ loadAppConfig: vi.fn() }))`), not raw `window.electronAPI.loadConfiguration`. The module-level `cache` in `appConfig.ts` is not reset between tests in the same file (no `resetModules` config), so mocking only the IPC call can leak a stale cached value forward.
- **Changing a module's public contract — a new export, or a changed return shape of an existing one — while it's already covered by a `vi.mock(path, () => ({...}))` factory elsewhere in the suite**: the factory keeps returning the OLD shape, so mocked tests silently diverge from the real implementation — a downstream `TypeError` for a missing export, or a wrong-shaped value flowing through with no error at all for a changed shape, until an assertion fails somewhere unrelated. Grep `vi.mock.*<module path>` across the WHOLE suite (not just `import {fn} from`) before changing a shared module's contract, and update every factory found. Two confirmed instances: adding `callRustConfigWrite` to `appConfig.ts` (`ConfigurationManager.test.tsx`'s mock didn't have it); changing `TransformRuleBackend.loadTransformRules()`'s return from `TransformRule[]` to `{rules, droppedCount}` (`useDictionaryEntryForm.test.ts`'s mock still returned the old bare array — silently `undefined` rules, no error until a full-suite run surfaced 2 unrelated-looking failures).
- `isDictionaryCategory` uses case-sensitive `String.includes()`, so names with uppercase midpoints (`'twoPhasePatterns'`) silently fail `includes('pattern')`. Use kebab-case in tests: `'pattern-structural'`, `'phrases-extended'`.
- `window.electronAPI.loadDictionariesParallel` (Rust IPC bridge, called from `DictionaryBackend.ts`) and `parallelDictionaryLoader.loadDictionariesParallel` (JS class in `ParallelDictionaryLoader.js`, called from `useForceReload.js`) are two unrelated implementations sharing one method name — grepping the name alone will not tell you which layer you are looking at.

### Before asserting

**Verify fixture behavior before writing directional assertions against a regex or heuristic calculation** (density scores, complexity weights) — a quick `node -e` snippet first. CJK-range regexes are easy to misjudge; one "proper noun density" pattern actually fired on nearly any punctuated Chinese sentence. For modules with tunable magic-number weights, assert directional or boundary relationships (`x > y`, `below threshold N → strategy A`) rather than pinning exact float outputs, so the test survives re-tuning.

**Temporary debug instrumentation in huge files (`TranslationEngine.js`, `SemanticPatternProcessor.js`) is easy to leave behind** — grep for `console.error`/`console.log`/whatever debug tag you added before considering a bug hunt finished. File size makes a stray line easy to miss on a final read-through.

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
