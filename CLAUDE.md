# Chinese-Vietnamese Translation App

React/Tauri desktop app translating Chinese novels to Vietnamese via 5-phase token consumption with WASM acceleration.

---

## Essential Commands

```bash
cargo check --manifest-path src-tauri/Cargo.toml  # NOT cd + cargo — zoxide breaks it
cargo check --manifest-path wasm-core/Cargo.toml   # separate crate — check both when touching Rust
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1
pnpm build-wasm-dev  # after any wasm-core change — binary is gitignored, stays stale otherwise
pnpm tauri:dev
pnpm test -- --run
pnpm type-check  # 0 errors expected
```

---

## Architecture

### 5-Phase Pipeline (order is immutable)

1. **Pattern** — `translationSource`: `'pattern'`, `'hierarchical_pattern'`, `'hierarchical_patterns'`, `'hierarchical_patterns_composite'`
2. **Proper Noun** — `translationSource` equals `match.dictionary` (e.g. `'properNouns-MyNovel'`)
3. **Number** — `'number_conversion'` (JS), `'number_plus_liang_fix'` (fixup)
4. **Phrase** — `'phrases'`
5. **Character** — `'characters'`

`getSourcePriority()` returns 999 for any unrecognized string — silently corrupts output.

**Consumed token contract:** `*_consumed` → `translated` must be `null`; non-`*_consumed` → `translated` must NOT be `null`. Validated by `validateConsumedTokenContract()`.

### Dual-Path Architecture

- **Character-only**: `src/components/char-only/ClickableTranslationSemantic.tsx` + `ClickableOriginalSemantic.tsx` → `PositionMetadataSegmenter.ts` (sync; `SegmentPrecomputer.ts` is sync JS, named exports)
- **Full Translation**: `src/components/full-translation/ClickableTranslationOptimized.tsx` → `TranslationEngine.js`

Completely separate code paths. Debug the right one. Both subdirectories have an `index.ts` entry point.

---

## Critical Constraints

**DO NOT extract** from `TranslationEngine.js`:

- `translateSinglePass()` — shared token state across all 5 phases
- `findAllMatchesWithSemanticCache()` — timing-sensitive cache invalidation
- `postProcess()` — position precision requires exact assembly order

**DO NOT modify dictionaries** without permission. Production: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`

**Large files are intentional.** `TranslationEngine.js` and `Translator.jsx` coordinate state that can't be extracted. Can extract: pure functions → `src/utils/`; single-concern hooks → `src/hooks/`. Cannot extract: anything using `this.*`, `setState`, refs, or requiring 10+ parameters.

**Intentionally JavaScript (never TypeScript):** `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`

`src/utils/` has 9 concern-based subdirectories with `index.ts`: `dictionary/` · `text/` · `pattern/` · `highlighting/` · `performance/` · `caching/` · `ui/` · `memory/` — `wasm/` has no barrel, import directly.

---

## Development

**Environment:** `grep` is aliased to `rg` — flags behave differently. Always use the Grep tool. For **post-edit verification**, use `Read` or `sed -n 'N,Mp' file` — Bash+grep goes through RTK which may return stale file content for recently-written files. RTK also replaces long matched identifiers (and import paths containing them) with `n` in search output — use Read for accurate caller-tracing, not bash rg. In shell scripts, multi-pattern rg requires `-e 'A' -e 'B'`; `'A\\|B'` matches a literal backslash-pipe and silently returns nothing. `--include` is not a valid flag; use `-g '*.js'` glob syntax.

**Single test file:** `pnpm exec vitest run src/path/to/test.ts` — `pnpm test -- --testPathPattern` does not reliably filter to one file.

**Test file placement in `src/utils/`:** goes flat in `src/utils/__tests__/`, even for modules living in a subdirectory (`dictionary/`, `pattern/`, `highlighting/`, etc.) — NOT in a nested `src/utils/<subdir>/__tests__/`. `src/utils/ui/__tests__/` is the one pre-existing exception. Check `ls src/utils/__tests__/ | grep <ModuleName>` before creating a new test file.

**RTK filters `cargo test` failure output** — full assertion details (panicked at, left/right values) are in `~/Library/Application Support/rtk/tee/<latest>_cargo_test.log`; grep the test name there when a Rust test fails with no detail shown in terminal.

**Large file edits:** Edit tool old_string fails for blocks >~100 lines. Use `python3 -c "with open(p) as f: lines=f.readlines(); open(p,'w').writelines(lines[:N]+lines[M:])"` to remove line range N–M (0-indexed).

**JSX in utils:** `src/utils/` files returning JSX must use `.tsx` extension — TypeScript gives misleading parse errors (`')' expected`, not "JSX not supported") otherwise. Do NOT include `.tsx` in import paths; `allowImportingTsExtensions` is off.

**Dynamic JSON imports:** Never use `import(path, { assert: { type: 'json' } })` — Rolldown silently fails to rewrite the path in production. Use a static `import data from '...json'` at the top of the file.

**Unicode line terminators in regex:** `\u2028` (LINE SEPARATOR) and `\u2029` (PARAGRAPH SEPARATOR) are ECMAScript line terminators — stored as actual Unicode characters in a JS/TS file they break a regex literal. Always use `\u2028\u2029` escape sequences in regex character classes.

**Testing:** `src/test/setup.ts` must stay — referenced by `vitest.config.ts:10`.

**Report-generating skills** (e.g. `/improve-codebase-architecture`): save output to this repo's `temp/` folder, not the OS temp default — established convention across many sessions.

**Deleted symbols — do not recreate:**

- `dispatchHighlighting` from `useHighlightingState` — replaced by `highlightOriginal`, `highlightTranslation`, `highlightBoth`, `highlightFromCharacterOnly`, `setCharacterOnlyIndex`; do NOT add `dispatchHighlighting` back
- `MAX_SAFE_SEGMENTS`, `HIGHLIGHT_SCROLL_DELAY_MS` from `useHighlightingState` — moved to `src/utils/highlighting/semanticArrayConstants.ts`; import from there (or highlighting barrel)
- `DictionaryTable.tsx` / `VirtualizedDictionaryTable.tsx` → use `EnhancedVirtualizedDictionaryTable`
- `LegacySystemFlags.js` and all its exports — permanently removed
- `createReadonlyTokens` from `ReadonlyOptimizationUtils.js` — only `scanTokens` exported
- `OptimizedSemanticArrayBuilder` — entire class deleted; renamed to `SemanticArrayBuilder` (do not import old name)
- `V8OptimizationUtils.js`, `PatternParityTest.js`, `OptimizationBenchmarks.js` — in `src/utils/__benchmarks__/` (dev/debug only); `OptimizationBenchmarks.js` is dynamically imported in `src/utils/__devtools__/DevConsole.js` — not in the production bundle
- `SemanticPatternProcessor.applyPatternMatch` — deleted; `processTokens()` now returns `PatternProcessorResult[]`, apply via `applyHierarchicalResults(tokens, results, options)`
- `useDictionaryConfig.js` — deleted; use `useDictionaryModals` from `src/hooks/useDictionaryModals.js`
- `useTranslationController.forceCleanup` — removed (unused); hook returns only `{createController, cleanup, cancelAll, getActiveCount}`
- `WasmDictionaryTrieWrapper` from `wasm/WasmDictionaryTrie.js`, `validateWasmDictionaryTrie` from `WasmDictionaryTrieValidator.js` — deleted; WASM trie is 2x slower than JS Map at current dictionary size (benchmarked 2026-01-31)
- `WasmRetryManager.js` / `wasmRetryManager` — absorbed into `WasmProcessorLifecycle`; retry logic is now private (`_retryWithBackoff`, `_isTransientError`, `_calculateDelay`)
- `WasmTextChunker.initialize(useUnicodeProperties, timeoutMs)` — removed; init is module-private `_initializeTextChunker()`; background init fires at module bottom; `wasmTextChunker` singleton still exported
- `MemoryManagementRefinements.ts` from `wasm/` — split into `src/utils/memory/` (`SmartMemoryPressureDetector.ts`, `BackgroundCleanupManager.ts`, `ComponentMemoryProfiler.ts`)
- `EnhancedDictionaryManager` from `dictionary/EnhancedDictionaryManager.js` — merged into `DictionaryManager` via injected `WasmDictionaryAdapter`; use `new DictionaryManager({ wasmAdapter: new WasmDictionaryAdapter() })`
- `TranslationSegmentCache` class + `translationSegmentCache` singleton from `utils/dictionary` — deleted (cache was removed from engine; hit rate permanently 0)
- `SegmentPrecomputer.createRenderSegments`, `.getSegmentClassName`, `.getSegmentStyles`, `.getVisibleSegments` — deleted (dead, zero callers); `RenderSegment` interface also removed from highlighting barrel
- `SegmentPrecomputer` class — declassed to named exports `precomputeSegments`, `precomputeOriginalSegments`, `findUnitMatch`, `normalizeText` from same file; `precomputeSegmentsWasm`, `convertMatchesToSegments`, `addNonSemanticSegments` deleted (dead WASM path, `WasmSegmentMatcher` was never globally defined)
- `PerformanceProfiler.recordParallelPerformance`, `.recordParallelFallback`, `.getParallelPerformanceReport`, `.generateParallelRecommendations` — deleted (dead, zero callers)
- `DictionaryManager._wasmAdapter`, `._wasmInitialized`, `._wasmInitPromise`, `._wasmValidationCallCount`, `.performanceComparison` — extracted to `DictionaryWasmLookup`; use `this.wasmLookup` (set in constructor if `options.wasmAdapter` provided)
- `DictionaryManager._translateWasm`, `._findAllMatchesWasm`, `._validateWasmSync`, `._syncDictionariesToWasmSequential`, `._initializeWasm` — extracted to `DictionaryWasmLookup` as `translate()`, `findAllMatches()`, `_validate()`, `sync()`, `_doInit()`
- `DictionaryManager._initializeWasmBackground` — deleted; init→sync sequence now in `DictionaryWasmLookup.startBackgroundInit(config)`; DWL constructor accepts `{ getEntries, getPriorities }` callbacks for the post-init sync
- `EVDT` inline scroll state (`scrollTop`, `containerHeight`, `isScrolling`, `scrollVelocity`), refs (`scrollRef`, `scrollTimeoutRef`, `lastScrollTop`, `lastScrollTime`, `resizeObserverRef`), and callbacks (`scrollRefCallback`, `handleScroll`, `scrollToTop`, `scrollToBottom`, `visibleRange` memo, `scrollRestore` RAF effect) — extracted to `useVirtualScrollRange` in `src/hooks/useVirtualScrollRange.ts`; EVDT uses `const scroll = useVirtualScrollRange(totalItems, { itemHeight, isActive, scrollRestore, onScrollSave })`. Hook exposes `scroll.scrollRef` (for `useEntrySelection` + restore effect) and `scroll.setScrollTop` (state-only sync). `bufferSize` is internal to the hook (self-optimizing via `adaptiveBufferCalculator`, debounced 100ms); do NOT pass it as a param.
- `DictionaryEntryFilters` interface from `useDictionaryEntryFilter` — deleted; filter state now owned by the hook; 4th param is `showDuplicatesMode: boolean` (not a filters object)
- `SemanticArrayBuilder.buildOriginalMapping`, `.buildTranslatedMapping` (private methods) — extracted to `mapToPositions(text, units, count, caseInsensitive?)` in `src/utils/highlighting/TextPositionMapper.ts`; `buildPositionMappings` now delegates both passes to this function
- `SemanticPatternProcessor.classifyVariableType`, `.getHeuristicType` — extracted to `src/utils/pattern/VariableTypeClassifier.ts`; `classifyVariableType` exported (pure fn), `getHeuristicType` module-private; `properNouns-f_HarryPotter`/`DuongThan` name hardcode deleted
- `DictionaryManager.isDictionaryType`, `.getIndexedMatches` — extracted to `src/utils/dictionary/LookupIndexUtils.ts`
- `WasmDictionaryManager.syncFailureTracking`, `._recordSyncSuccess`, `._recordSyncFailure`, `.getSyncMetrics`, `.failureReasonsIndex`, `.syncHistoryIndex`, `loadDictionary._skipMetrics` param — deleted (zero callers on `getSyncMetrics`; see ADR-020 for restoration shape if perf dashboard is built); use `isDictionaryCategory(name, cat)` (imported into DM internally) and `getIndexedMatches(index, pos, cat)` (imported directly in `TranslationEngine.js`, no longer on DM's interface). `DictionaryManager.metadata.type` was never written — the `metadata.type === 'X'` branches in `isDictionaryType` were dead code; do not recreate them.
- `TextChunker.translatePunctuation`, `.translatePunctuationNormally`, `.fixAngleQuotePositioning`, `.reconstructText`, `.reconstructTextWithSegments` — extracted to `ChunkPostProcessor` (`src/utils/text/ChunkPostProcessor.js`); `TranslationEngine` holds `this.chunkPostProcessor = new ChunkPostProcessor()` alongside `this.textChunker`. `TextChunker.testChunking` method and `testChunker` module export also deleted (dev-only, zero callers).
- `TranslationEngine.initializeSmartMemoryManagement`, `.handleSmartCleanup`, `.performEmergencyCleanup`, `.performHighPriorityCleanup`, `.queueBackgroundCleanup`, `.cleanupOldPerformanceData`, `.optimizeMemoryStructures`, `.startMemoryProfiling`, `.completeMemoryProfiling`, `.getSmartMemoryStats`, `.shutdownSmartMemoryManagement` — all extracted to `SmartMemoryCoordinator` in `utils/memory/SmartMemoryCoordinator.ts`; engine accesses via `this.memoryCoordinator`
- `prevIsDictionaryReloadingRef` in `Translator.jsx` — absorbed into `useDictionaryReloadGuard` (`src/hooks/useDictionaryReloadGuard.ts`); do not recreate the inline ref-update pattern in `loadAndTranslate`
- `isClipboardBusy` ref, `isClipboardTranslation` state, `setIsClipboardTranslation`, inline `handleTranslateFromClipboard` in `Translator.jsx` — extracted to `useClipboardTranslation` (`src/hooks/useClipboardTranslation.ts`); Translator uses `const { isClipboardTranslationRef, resetClipboardFlag, handleTranslateFromClipboard } = useClipboardTranslation(...)`. `isClipboardTranslation` is now a ref (not state) — never drives JSX; `loadAndTranslate` reads `.current` and calls `resetClipboardFlag()` (no dep-omission needed)
- `highlightingComputationRef` in `Translator.jsx` — private to `useCharacterOnlyBridge`; inline bridge useEffects `:623`+`:699` extracted to `src/hooks/useCharacterOnlyBridge.ts` (guards, bounds check, `findCharacterOnlyMatch` call, `setCharacterOnlyIndex` dispatch, 10ms scroll)
- inline `loadAndTranslate` `useEffect` in `Translator.jsx` — extracted to `useAutoTranslateTrigger` (`src/hooks/useAutoTranslateTrigger.ts`); owns "when to re-translate" policy: reload guards (`consumeReloadTransition` first, then `isDictionaryReloading`), charOnly after main (`setTimeout 0`), clipboard scroll (`setTimeout 100ms`), `isTranslating` lifecycle. Dep array: `[inputText, isLoading, isDictionaryReloading, translateCharacterOnly, translateText]`. Stable params (9) grouped into `ctx: TranslationExecutionContext` (exported from same file) — do not flatten back to top-level params.
- `handleForceReload` inline `useCallback` in `Translator.jsx` — extracted to `useForceReload` (`src/hooks/useForceReload.js`); owns 5-step reload protocol (cancel→clear→load→reinit→retranslate→scroll restore). CRITICAL-3 invariant (`await cleanupComplete` before touching `engineRef.current`) is the primary documented invariant. Stable refs/callbacks (19) grouped into `forceReloadCtx` in Translator.jsx — excluded from dep array (same pattern as `TranslationExecutionContext`). Dep array: `[isDictionaryReloading, inputText, isLoading, dictionaries]`.
- `HealthReport.cacheHitRate` — deleted (`TranslationSegmentCache` removed; field was always 0 in UI); `performanceHealth.getReport()` now takes no arguments
- `MemoryLeakDetector`, `getPerformanceMetric`, `releasePerformanceMetric` from `performance/index.ts` barrel — removed (zero prod barrel callers); import directly from their files if needed
- `WasmNumberProcessor.js` / `isWasmNumberProcessorAvailable` — deleted; Phase 3 is now pure JS (`NumberProcessor.js`); `this.numberProcessor.processTokens()` is the sole Phase 3 call site in `TranslationEngine.js`
- `NumberProcessingAdapter.js` / `processNumbers` — deleted alongside `WasmNumberProcessor.js`
- `WASM_NUMBER_THRESHOLDS` from `TranslationConstants.js` — deleted (was WASM/JS dispatch threshold)
- `INITIAL_STREAMING`, `INITIAL_STATE`, `streamingReducer` from `useStreamingTranslation` — module-private (intentionally unexported session 78); only `useStreamingTranslation` is exported
- `useSegmentComputation` from `src/hooks/useSegmentComputation` — split into `useCharacterOnlySegments` (char-only sync, `segmentFromPositionMetadata`) and `useFullTranslationSegments` (async, `precomputeSegments` + cancellation guard)
- `validateDictionaryEntry` from `src/components/dictionary/DictionaryTypes.ts` — extracted and renamed; use `validatePersistEntry` from `src/utils/dictionary/PersistTimeValidator` (or `utils/dictionary` barrel). Distinct from form-time `validateDictionaryEntry` in `DictionaryEntryValidator.ts` (different signature: `(source, translation, dictionaryId) → ValidationResult`).
- `useDictionaryCRUD` from `src/components/dictionary/` — moved to `src/hooks/useDictionaryCRUD.ts`; ADR-026 superseded 2026-06-27
- `RustLookupIndexManager.extractEntriesFromTrie` — deleted; DFS-walked a `DictionaryTrie` back into flat entries on every translate call. Replaced by `DictionaryManager.flatEntries` (built once at load time via `flattenDictionaryEntries` in `src/utils/dictionary/DictionaryEntryFlattener.ts`, directly from raw dictionary JSON, never from a trie). `RustLookupIndexManager.buildLookupIndex`'s 2nd param is now "Map of dictionary name → flat entries," not "→ trie" — callers pass `dictionaryManager.flatEntries`, not `dictionaryManager.dictionaries`.
- `toPatternsId`/`toProperNounsId` (`src/utils/dictionary/DictionaryIdClassifier.ts`) — canonical ADR-027 fiction dict-ID pairing derivation. Do NOT hand-roll `'patterns-' + id.slice('properNouns-'.length)` again; grep for `slice('properNouns-'.length)` before adding a new fiction-pairing call site.
- `resolveDefaultProperNounTarget`/`resolveStructuralPatternQuickAddTarget` (`src/utils/dictionary/QuickAddTargetResolver.ts`) — Cmd-5/Cmd-6 quick-add target resolution, shared by `TabbedInterface.tsx` and `useDictionaryModals.js`.
- `filterDictionariesForEngine` — moved from `useTranslatorEngine.js` to `src/utils/dictionary/FictionDictionaryFilter.ts` (barrel-exported). The hook now calls the imported version.
- `onAddEntry` from `HotkeyHandlerOptions` (`useHotkeyHandler.ts`) — removed, was dead (no `HotkeyAction` variant ever dispatched to it). `DictionaryManager.tsx`'s "+" button already calls `setShowAddEntry(true)` directly.
- `useHotkeyHandler(options)` now takes one options object (not destructured) mirrored into a single `optionsRef` — do not reintroduce per-prop `useRef` pairs; add new callbacks to `HotkeyHandlerOptions` and read via `optionsRef.current.X`.
- `enable_matcher_profiling`/`disable_matcher_profiling`/`reset_matcher_profiling`/`print_matcher_profiling_report` (wasm-core `matcher.rs` + `lib.rs` wasm_bindgen wrappers) + `MatcherProfilingData`/`PROFILING_DATA`/`PROFILING_ENABLED` — deleted 2026-07-17; grepped zero JS callers (dev-console-only, never wired into production). Do not recreate without a concrete profiling need — see git history for the removed implementation if one arises.

**Non-obvious contracts:**

- **Dev `window.*` globals:** all installed via `installDevConsole(engine)` in `src/utils/__devtools__/DevConsole.js` — called from Translator.jsx engine-ready useEffect. Add new debug utilities there, not in App.jsx or Translator.jsx.
- **Hotkey architecture:** `useHotkeyHandler` has two call sites — `TabbedInterface.tsx` (tab switching + Dictionary-tab shortcuts) and `Translator.jsx` via `<HotkeyHandler>` component (Translator-tab shortcuts). Add Dictionary-tab hotkeys to `TabbedInterface`, Translator-tab hotkeys to `HotkeyHandler` props. Key→action dispatch table lives in `src/utils/ui/HotkeyDispatchTable.ts` (`matchHotkey`) — add/change shortcuts there, not in the hook body.
- **Config reads:** Use `loadAppConfig()` from `utils/appConfig.ts` — caches after first load, returns typed `AppConfig` with defaults applied. In force-reload paths, call `invalidateAppConfig()` first. Never call `window.electronAPI.loadConfiguration()` directly — returns raw unvalidated data with absent/wrong-typed defaults.
- `src/utils/wasm/WasmBoundaryValidation.ts` — `copyWasmTokens`: param1=JS dest, param2=WASM src
- `types/WasmTypes.ts` (root-level, tests only) — `copyWasmTokens`: param1=WASM src, param2=JS dest (**reversed**)
- `ThrottledStreamingState` canonical home: `src/types/UITypes.d.ts`
- **`SemanticArrayBuilder` validation:** `validateArrays`/`validateAllPositions`/`hasValidPositions` are NOT on the builder — use `semanticArrayValidator.validateArrays(builder.getSnapshot())` from `utils/highlighting/SemanticArrayValidator.ts`. Builder's `validateArrays` is `private` (called only by `addUnit` internally).
- **`this.memoryCoordinator`**: re-constructed each call to `translateWithProgressiveBatches` (not at engine init); shut down in `destroy()`; replaces the former `this.smartMemoryDetector`, `this.backgroundCleanup`, `this.memoryProfiler` trinity
- **`useDictionaryReloadGuard`**: `consumeReloadTransition()` must be called ONCE at the TOP of `loadAndTranslate` before any early returns — reads prev reload state, updates internal ref, and returns `justFinishedReloading` atomically. Calling it after any early return skips the ref update and breaks reload-skip detection.

**Dead-code cleanup with fallow:** Has multiple blind spots (dynamic imports, CSS `composes`, class vs singleton, test-only). See [Fallow Protocol](docs/guides/development.md#fallow-dead-code-analysis) before deleting anything.

**Explore subagent verification:** Explore subagents fabricate specific technical details (method names, usage counts, file paths). Always verify any specific claim with a direct `Grep` or `Read` before acting on it — especially before deleting or refactoring based on "unused" or "nonexistent" reports.

📖 [Architecture](docs/guides/architecture.md) · [Development](docs/guides/development.md) · [Troubleshooting](docs/guides/troubleshooting.md) · [Hotkeys](docs/HOTKEYS.md) · [ADRs](docs/adr/)

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
