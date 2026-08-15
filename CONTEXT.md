# Domain Glossary

## ChunkPostProcessor

Phase 5 post-processing over `TextChunk[]` arrays: punctuation translation and text reconstruction. Separated from `TextChunker` so that post-processing bugs have a single locality and the methods are testable with a `TextChunk[]` fixture without constructing a `TextChunker`.

Owns: `translatePunctuation(chunks, dict)` (delegates to `translatePunctuationNormally` + `fixAngleQuotePositioning`), `reconstructText(chunks)` (char-only path, returns string), `reconstructTextWithSegments(chunks, semanticArrays?)` (full translation path, returns `{text, segments}`). Internally owns a `PunctuationProcessor` instance (constructed with no args; no injection needed — only one implementation exists).

JS/WASM divergence: `fixAngleQuotePositioning` handles the JS chunker's empty-chunk representation of `《` only. WASM accumulates `《` into the preceding chunk's `punctuation` field; `applySmartCapitalization` in `TranslationEngine` handles that path. `「` (U+300C) is also skipped by `fixAngleQuotePositioning` — `QuoteProcessor.isOpeningQuote('「')` returns false; the fallback in `applySmartCapitalization` covers it.

`TranslationEngine` holds `this.chunkPostProcessor = new ChunkPostProcessor()` alongside `this.textChunker`. All 3 `translatePunctuation` call sites and 4 `reconstruct*` call sites go through `this.chunkPostProcessor`.

Entry point: `src/utils/text/ChunkPostProcessor.js`, re-exported from `src/utils/text/index.ts`.

## TextPositionMapper

The greedy longest-match algorithm that maps each character position in a text string to the index of the semantic unit covering it. Produces an `Int32Array` of length `text.length`; positions not covered by any unit are `-1`.

Algorithm: builds a first-grapheme index (Map&lt;grapheme, unitIndices[]&gt;) for O(1) candidate lookup per position, then walks the text left-to-right, greedily selecting the longest unused unit that matches at each position.

Two modes: **case-sensitive** (original Chinese text) and **case-insensitive** (Vietnamese translated text — handles capitalization differences from `updateWithCapitalizedText`).

Interface: `mapToPositions(text, units, count, caseInsensitive?): Int32Array`. `units` is the raw pre-allocated array from `SemanticArrayBuilder`; `count` is the number of valid entries (avoids slice allocation).

Bug history encoded in the implementation: CRITICAL-1 (skip empty units), MEDIUM-2 (grapheme-aware first-char extraction for Vietnamese combining diacritics), CRITICAL-5 (explicit bounds check before inner comparison loop).

Replaces two near-identical private methods (`buildOriginalMapping`, `buildTranslatedMapping`) that previously lived in `SemanticArrayBuilder`. `SemanticArrayBuilder.buildPositionMappings` now delegates both passes to this function.

Also owns the single Chinese-text-order comparator: `resolveTokenIndex(tokenIndex)` (missing/negative sorts last, `Number.MAX_SAFE_INTEGER`) and `compareByTokenIndex(a, b)`. Was independently reimplemented with disagreeing missing-tokenIndex fallbacks (`?? 0` vs `?? Number.MAX_SAFE_INTEGER`) at 2 sort sites in `SegmentPrecomputer.ts` and as part of a two-key sort in `TranslationEngine.js`'s word-level builder before being unified. `CharacterOnlyBridge.ts`'s occurrence-counting scan is a different shape (linear scan, not a sort) and does not use this comparator.

Entry point: `src/utils/highlighting/TextPositionMapper.ts`, re-exported from `src/utils/highlighting/index.ts`.

## PhraseConsumptionMarker

The shared "mark phrase followers as consumed" operation: sets `isGrouped`, `groupLeader`, `translated: null`, `translationSource: 'phrases_consumed'` on each follower token and records the follower indices on the leader's `groupedWith` list. Was hand-written 3x in `TranslationEngine.js` (`createPhraseGroups`, `processRemainingPhrasesSequential`, `processRemainingPhrasesParallel`) before being unified — one site (`processRemainingPhrasesParallel`) had silently drifted to skip `groupedWith`.

Interface: `markPhraseFollowersConsumed(tokens, leaderIndex, tokenSpan): void`. Pure mutation of the passed `tokens` array; no `this`, no engine state — testable standalone.

Entry point: `src/utils/pattern/PhraseConsumptionMarker.ts`. Not barrel-exported — all 3 callers live inside `TranslationEngine.js`, which imports it directly (matching how it already imports sibling `pattern/` modules).

## UnitHighlightPredicate

The shared "is this unit highlighted" check for the 3 Clickable* components (`ClickableOriginalSemantic`, `ClickableTranslationSemantic`, `ClickableTranslationOptimized`). Before unification (2026-07-17c) each component independently reimplemented this — and the three were **not** identical duplicates: `ClickableOriginalSemantic` takes two scalar index props OR'd together (`highlightedUnitIndex`, `highlightedTranslationUnitIndex` — no array support, matches its actual declared prop types), `ClickableTranslationSemantic` takes one prop that's genuinely array-capable (fed by `characterOnlyUnitIndex` state, which really can be `number[]` from `findCharacterOnlyMatch`'s multi-char results), and `ClickableTranslationOptimized` takes one scalar prop but its old inline code defensively checked `Array.isArray(...)` anyway — a branch provably unreachable given its own declared prop type (`number`, never `number[]`) and its sole real caller (`TranslatorDisplayPanels.tsx`, also typed `number | null`); test-covered via an explicit `as any` cast, so deliberate future-proofing rather than an accident, not a bug to fix.

Interface: `isUnitHighlighted(unitIndex, ...highlightValues)` — variadic so it covers all three shapes (1 arg for the two single-prop components, 2 args for `ClickableOriginalSemantic`'s OR). Each `highlightValue` can be `number | number[] | null | undefined`. `-1` is treated as the codebase-wide "cleared" sentinel (see `useHighlightingState.ts`) and never matches, even in the pathological case where `unitIndex` itself were `-1`.

Entry point: `src/utils/highlighting/UnitHighlightPredicate.ts`, barrel-exported from `src/utils/highlighting/index.ts`.

## HotkeyDispatchTable

The pure dispatch table that maps (key + modifiers + app context) → `HotkeyAction | null`. No side effects, no React, no DOM. Input: a `KeyboardEvent`-shaped object (`key`, `metaKey`, `ctrlKey`, `shiftKey`) plus `MatchHotkeyContext` (`activeTab`, `canUndo`, `canRedo`, `isInputFocused`). Output: a discriminated union action tag, or `null` if no shortcut matches.

Key normalisation: `event.key.toLowerCase()` is used throughout so `Cmd+Shift+Z` (browser yields `key='Z'`) and `Cmd+Z` (`key='z'`) both land in the same branch, discriminated by `shiftKey`. `Cmd+Shift+R` returns `null` (explicit `!shift` guard on `reloadDictionary`).

`useHotkeyHandler` calls `matchHotkey`, then `event.preventDefault()`, then a `dispatch` switch that invokes the appropriate callback ref. All clipboard I/O, toast calls, and React wiring stay in the hook — they are not part of the dispatch table.

Entry point: `src/utils/ui/HotkeyDispatchTable.ts`. Called exclusively from `useHotkeyHandler`.

## AppearanceSettings (hook)

The settings persistence and CSS application layer for the Appearance tab. Owns: settings state, load from `window.electronAPI.loadAppearanceSettings()` on mount (merges with `DEFAULT_APPEARANCE` defaults), save via `window.electronAPI.saveAppearanceSettings()` on blur/reset/checkbox, and CSS custom property application to `document.documentElement` via `applyAppearanceToCssVars` (exported from `AppearanceReducer.ts`) called in `useEffect([appearance])`. Two call sites apply CSS vars: this hook (on every appearance state change) and `App.jsx` (startup bootstrap before `AppearanceManager` mounts, to prevent FOUC). `applyAppearanceToCssVars` is the single canonical list of all 13 CSS custom properties — adding a new property requires editing only that function.

`characterOnlyFollowsFullTranslation` is stored inside `AppearanceSettings` only (no separate state). When the flag is set, `handleFontChange` automatically mirrors any Full Translation property change to Character Only in the same `setAppearance` call.

All returned handlers are stable (`useCallback([], [])`); async handlers read current state via `appearanceRef` to avoid stale closures.

Entry point: `src/hooks/useAppearanceSettings.ts`. Used exclusively by `AppearanceManager` in `src/components/appearance/AppearanceManager.tsx`.

## PersistTimeValidator

The canonical home for dictionary entry validation at persist time — called by `useDictionaryCRUD`'s `prepareMutationEntry()` the moment an entry is committed to storage. Stricter than form-time validation: enforces the 10 000-char DoS limit (`MAX_ENTRY_LENGTH`) and the full X/Y/Z variable-symmetry rule (every variable in source must appear in translation and vice versa).

Three exports:

- `baseValidation(source, translation)` — empty check + length limit (SECURITY FIX; shared with `DictionaryEntryValidator.ts` via import of `MAX_ENTRY_LENGTH`)
- `validatePatternEntry(source, translation)` — X/Y/Z variable-symmetry rule; used by `baseDictionaryTypes.patterns` in `DictionaryTypes.ts`
- `validatePersistEntry(dictionaryId, source, translation) → string | null` — dispatches to the per-type validator by ID prefix (`properNouns*`, `patterns-*`) or registry lookup. Renamed from `validateDictionaryEntry` (DictionaryTypes.ts) to resolve the 3-way name collision with `DictionaryEntryValidator.ts` and `configValidation.ts`.

**Form-time vs persist-time distinction:** `validateDictionaryEntry` in `DictionaryEntryValidator.ts` (`(source, translation, dictionaryId) → ValidationResult`) is form-time — fires on each keystroke to drive UI feedback state (`showCharacterValidation`, `showPatternValidation`). `validatePersistEntry` (`(dictionaryId, source, translation) → string | null`) is persist-time — fires exactly once inside `prepareMutationEntry` before the entry is written. Different signatures, different return types, different strictness. Do NOT merge.

`DictionaryTypes.ts` imports `baseValidation` and `validatePatternEntry` from here so the logic lives in one place. `DictionaryTypes.ts` no longer exports `validateDictionaryEntry` — callers that need persist-time dispatch use `validatePersistEntry` from `utils/dictionary/`.

Entry point: `src/utils/dictionary/PersistTimeValidator.ts`, re-exported from `src/utils/dictionary/index.ts`.

## MatchComparator

The single dictionary match ordering rule (ADR-010: specificity over provenance). Longer match wins; equal-length matches tie-break on lower priority number. Was independently reimplemented at 4 sites (JS sequential, JS parallel, WASM lookup, lookup-index post-fetch sort) before being unified — one of the 4 sites carried a `?? 0` undefined-priority guard the other 3 didn't need.

Interface: `compareMatchesBySpecificityThenPriority(a, b): number`, taking `{ word: string; priority: number }`. Priority is a required field — the sole caller with a possibly-missing priority (`LookupIndexUtils.getIndexedMatches`) defaults it to `0` before calling, keeping the comparator's own contract simple.

Entry point: `src/utils/dictionary/MatchComparator.ts`. Not barrel-exported — all 4 callers live inside `src/utils/dictionary/`. Called from `DictionaryManager.findAllMatchesParallel`/`findAllMatchesSequential`, `DictionaryWasmLookup.findAllMatches`, and `LookupIndexUtils.sortMatchesByPrecedence`.

## NumberProcessingAdapter

The single adapter for Phase 3 number conversion. Provides one export: `processNumbers(tokens, options)` — always returns processed tokens. Internally tries WASM first (`WasmNumberProcessor`); if WASM is unavailable before the call or retires mid-call (panic → `lifecycle.reset()` clears `isReady`), falls back to the JS `NumberProcessor`. Callers receive a guarantee: numbers are always converted; WASM-vs-JS is invisible.

The JS fallback deliberately omits `semanticArrayBuilder` from options — the engine's post-WASM loop scans for `number_conversion` sources and adds semantic array entries for both paths, so forwarding it would double-add entries.

Entry point: `src/utils/wasm/NumberProcessingAdapter.js`. Called exclusively from `TranslationEngine.js` Phase 3 block (replaces the old direct `processNumbersWasm` call).

## AppConfig

The single module owning the app configuration lifecycle: load from disk, validate, cache, and save via read-modify-write. Entry point: `src/utils/appConfig.ts`. Exposes three typed sub-objects:

- **EngineConfig** — fields that affect translation behavior (`wasmEnabled`, `wasmMemoryLimit`, `activeProperNouns`)
- **UIConfig** — fields that affect UX only, zero translation impact (`defaultQuickAddDictionary`)
- **SessionConfig** — runtime-mutable UI persistence (`lastSelectedDictionary`)

All three are slices of the same on-disk JSON file. `loadAppConfig()` loads once and caches; `saveAppConfig(patch)` merges the patch via read-modify-write so callers only provide the fields they own.

**`saveAppConfig` is not the only writer of `config.json`.** `src-tauri/src/dictionary_commands.rs`'s `substitute_dictionary_reference` (rename, both directions) and `create_and_activate_proper_noun_file` (create) both write `activeProperNouns`/`lastSelectedDictionary`/`defaultQuickAddDictionary` straight to disk, bypassing `saveAppConfig` entirely. Found twice, same root cause, both fixed 2026-08-07 (architecture-review candidates #2 and #3 grilling):

- **#2** — `defaultQuickAddDictionary` was missing from the rename swap, so renaming a dictionary set as the Cmd-5 default silently reverted to the wrong target on next app launch.
- **#3** — dictionary creation activates the new dictionary on disk as a side effect, but `useDictionaryConfigManagement.ts`'s `handleCreateDictionary` never told React about it — the checkbox rendered unchecked for an already-active dictionary until clicked once (which then read as a redundant "activate," so a user who wanted it _inactive_ had to click twice). Fixed by having `create_proper_nouns_dictionary`/`create_fiction_dictionary_pair` re-read and return the true post-creation `activeProperNouns` list (`read_active_proper_nouns`, new `ProperNounsListResult.dictionaries`) instead of an empty `ok()` — `handleCreateDictionary` now syncs `activeDictionaries` from the response instead of assuming.

Both fixes stayed entirely on the Rust side for the actual persisted fields — in neither case does the TS handler call `saveAppConfig` to patch what Rust already wrote (see landmine below). Both handlers now call `invalidateAppConfig()` on success as the general closer: **`appConfig.ts`'s module-level `cache` is never automatically invalidated when Rust writes `config.json` directly.** A `saveAppConfig()` call from anywhere else in the app, made after a Rust-side write and before the next `invalidateAppConfig()`, would silently overwrite disk with whatever stale values the cache still holds for fields it doesn't explicitly patch — this is exactly how #2's bug could reappear through a totally unrelated code path (e.g. `handleToggleDictionary`'s existing `saveAppConfig({engine:{activeProperNouns}})` call, fired for an unrelated dictionary after a rename or create in the same session). Any new Rust command that writes `config.json` directly needs its TS caller to call `invalidateAppConfig()` on success — don't rediscover this a third time.

## WasmProcessorLifecycle

The shared initialization contract for WASM processors. Owns the invariant sequence every WASM processor must run before its instance is usable: binary fetch → SHA-256 integrity verification → `instantiateFn(binary)` → instance method verification. Wraps the sequence in exponential-backoff retry (transient errors only) and tracks initialization state (`isReady`, `hasFailed`, cooldown, failure count).

Each WASM processor (Pattern, Number, Dictionary) holds one `WasmProcessorLifecycle` instance. The processor module provides `instantiateFn`: a function that receives the verified binary and returns the configured WASM instance. Domain-specific setup (e.g., loading pattern dictionaries into the WASM instance) happens inside `instantiateFn` before it returns. Runtime error handling (toasts, fallback mode) stays in the processor module — the lifecycle only owns the init lifecycle.

Entry point: `src/utils/wasm/WasmProcessorLifecycle.js`.

## PerformanceMonitor

Sampling-based global operation stats. Owns: sample-rate gating (5% prod / 20% dev), rolling sample buffer, aggregate stats (`totalOperations`, `avgTime`, `minTime`, `maxTime`, `opsPerSecond`), `startTimer`/`endTimer`, `getMetrics()`. Also provides `log(level, message)` — a performance-aware logging channel that silences everything below error level in production to prevent console spam.

Exports `globalPerformanceMonitor` singleton. Two callers: `PerformanceHealth` (reads via `endTimer` + `getMetrics` — callers should go through `PerformanceHealth`, not import the singleton directly) and `TranslationEngine` (uses `.log()` as a debug channel — this is intentionally direct; `PerformanceHealth` does not expose a log method).

Entry point: `src/utils/performance/PerformanceMonitor.js`.

## TranslationProfiler

Per-phase profiler for the 5-phase translation pipeline. Tracks wall-clock time per phase (pattern, properNouns, numbers, phrases, characters) plus total. Interface: `enable()`, `disable()`, `profile(phase, fn)`, `recordPhaseCompletion(phase)`, `getReport()`, `printReport()`, `reset()`. Dev/debug tool — used to identify which phases to migrate to WASM.

Single caller: `TranslationEngine` (`this.profiler = new TranslationProfiler()`). Accessed via engine methods `enableProfiling()`, `disableProfiling()`, `getProfilingReport()`. Not a production monitoring path — disabled by default (`enabled = false`).

Entry point: `src/utils/performance/TranslationProfiler.js`.

## Pattern Profiling (TwoPhasePatternProcessor)

Per-operation profiler internal to `TwoPhasePatternProcessor` — tracks wall-clock time/call-count for `extractSemanticTokens`, `buildVariableCache`, `processTokensWasm` (the 3 sub-steps of `processTokens()`). Interface: `enableInternalProfiling()`, `disableInternalProfiling()`, `resetInternalProfiling()`, `getInternalProfilingReport()`, `printInternalProfilingReport()`. Dev/debug tool — used to identify which sub-step of pattern matching dominates cost. Disabled by default (`enabled = false`), zero overhead when off.

Accessed via `TranslationEngine` delegators: `enablePatternProfiling()`, `disablePatternProfiling()`, `resetPatternProfiling()`, `getPatternProfilingReport()`, `printPatternProfilingReport()`. Not a production monitoring path. See ADR-021 addendum (2026-07-18) — same protected-dev-tool reasoning as `TranslationProfiler`, decided kept.

Entry point: `src/utils/pattern/TwoPhasePatternProcessor.js`.

## PerformanceHealth

Unified gateway for performance monitoring concerns — the single import callers need for both writing timing data and reading health status.

**Write:** `recordTranslation(operationTimeMs)` — records a completed translation into `globalPerformanceMonitor`. Callers don't construct synthetic timers or import `globalPerformanceMonitor` directly.

**Read (hot path):** `getReport()` — no args. Cheap status + timing read, called on every translation: `{ status, avgTime }`. Must not build the baselines array or touch anything not read by a real caller (`TranslatorControls.tsx`, `App.jsx`).

**Read (debug):** `getDebugReport()` — the wide report, for `DevConsole.js`/`window.performanceDashboard.getDebugReport()` only, not the translation hot path: `{ operations, status, criticalAlerts, warningAlerts, baselines, verdict, wasm }`. `verdict` synthesizes `status` into `'ok'` (healthy), `'degraded'` (warning), `'critical'`. `wasm` aggregates WASM processor availability: `{ pattern: { available, failed }, anyFailed, allAvailable }` — the single place to ask "is WASM the cause of degraded performance?" without importing from individual processor modules.

Health is assessed at action time — after translate or after reload — not on a polling interval.

Entry point: `src/utils/performance/PerformanceHealth.js`, re-exported from `src/utils/performance/index.ts`.

## SystemPerformanceMonitor

The background regression detector that owns the periodic integration of all subsystem metrics into `PerformanceBaselineTracker`. Owns: three integration adapters (global performance monitor, virtual scrolling, WASM memory pool — position cache integration removed with `ContentAwarePositionCache`, 2026-07-17), metric collection loop, memory inspection, `getSystemHealthReport()` (full, builds baselines array — debug use), and `getStatus()` (cheap status-only read, delegates to `baselineTracker.getStatusSummary()` — hot-path use). Delegates baseline storage to `PerformanceBaselineTracker` — callers use `systemPerformanceMonitor.recordPerformance(operationType, metrics)`/`.getBaseline(operationType)` rather than reaching through `.baselineTracker`. `logDetailedMemoryDebug(operationType, alert)` fires automatically in dev mode on every critical alert (from `checkImmediateAlerts`), not just from manual devtool use.

Entry point: `src/utils/performance/SystemPerformanceMonitor.js`.

## PerformanceBaselineTracker

Owns the statistical baseline and trend state for all operation types. Manages: `performanceHistory[]`, `baselines` Map (LRU, cap 100), `trends` Map (LRU, cap 200), `alerts[]` (cap 50). Public API: `recordPerformance(operationType, metrics)`, `getBaseline(operationType)` (public LRU-touching accessor — replaces reaching into `.baselines` directly), `getHealthSummary()` (full, builds baselines array), `getStatusSummary()` (cheap, status only — no array build), `exportData()`, `destroy()`, `reset()`. Has no dependency on any other monitoring module — only imports `logger`. No `cacheHitRate` tracking (deleted 2026-07-24, ADR-032 — was permanently unfed, zero producers ever called `recordPerformance` with a `cacheHitRate` field).

Entry point: `src/utils/performance/PerformanceBaselineTracker.js`.

## PatternVariableCache

The shared dictionary lookup algorithm consumed by both PatternProcessor adapters. Builds a `word → {translation, source, type}` map from dictionary state; both `SemanticPatternProcessor` (JS) and `TwoPhasePatternProcessor` (WASM) pass this map to their respective matchers before executing.

Four lookup stages run in fixed order, each able to overwrite earlier entries: (1) already-translated proper noun tokens, (2) phrase entries with `allowAsPatternVariable`, (3) proper noun single-token dictionary lookups, (4) full-text scan for multi-character proper nouns. Adapters supply a `resolveType(source, word, metadata) → string|null` strategy: returning `null` force-includes an entry bypassing `allowedVariableTypes` filtering; returning a type string applies normal type-filter logic. Adapter-specific setup that runs before the shared stages: Semantic injects Phase A results as lowest-priority seed entries; TwoPhase injects prior-pass pattern-translated tokens (`patternSemanticType`) as seed entries.

Entry point: `src/utils/pattern/PatternVariableCache.js`.

## ProperNounCapitalizationMap

A `Map<string, string>` built once during engine initialization that maps `lowercase(vietnamese) → original-capitalized-vietnamese` for all active proper noun dictionaries. Used by the translation engine to restore proper-noun casing after post-processing lowercases output. Enforces a `MAX_PROPER_NOUN_TRANSLATIONS` size cap with a one-time warning on first overflow.

Entry point: `src/utils/text/ProperNounCapitalizationMap.ts` — `buildProperNounCapitalizationMap(dictionaries, activeProperNouns, limit)`. Assigned to `TranslationEngine.properNounTranslations` in `initialize()`.

## DictionaryOperationHistory

The undo/redo subsystem for dictionary CRUD operations. Owns: operation log (`HistoryOperation[]`), cursor (`currentHistoryIndex`), `MAX_HISTORY = 100` cap, `addToHistory`, and diff reversal for all 5 operation types (`add`, `update`, `delete`, `bulk_delete`, `move`/`bulk_move`).

Injected dependencies: `dictionariesRef` (ref-mirror of current dictionary state), `commitMutation` (sort → save → setDictionaries, returns `boolean`), `invalidateEngine` (clears engine caches). The cursor advances only when `commitMutation` returns `true` — the history module never touches persistence directly.

Entry point: `src/components/dictionary/useDictionaryHistory.ts`. Used exclusively by `DictionaryProvider` in `DictionaryContext.tsx`.

## DictionaryCRUD

All 6 dictionary mutation operations: `addEntry`, `updateEntry`, `deleteEntry`, `bulkDeleteEntries`, `moveEntry`, `bulkMoveEntries`. Includes `prepareMutationEntry` (sanitize → validate → build typed value for `phrases`/`patterns`/`properNouns*` vs plain string dicts).

Injected dependencies: `dictionariesRef` (reads snapshot before mutation — never closes over `dictionaries` state), `persistDictionaryMutation` (single-dict: optimistic update → save → rollback), `commitMoveOp` (two-dict: optimistic update → parallel save → partial revert), `addToHistory`, `invalidateEngine`. All 6 returned callbacks are stable — their dep arrays contain only stable injected functions.

Entry point: `src/components/dictionary/useDictionaryCRUD.ts`. Used exclusively by `DictionaryProvider` in `DictionaryContext.tsx`.

## DictionaryTrie

The per-dictionary lookup structure. A prefix trie where each node owns `children: Map<char, TrieNode>`, `isEndOfWord`, `translation`, and `metadata`. Core operations: `insert`, `get`, `getWithMetadata`, `findMatches` (all prefix matches from a position), `findLongestMatch`, `getWithPrefix` (DFS collect).

`dispose()` is mandatory before discarding an instance — recursively nullifies all node references for GC.

Formerly also owned a structural self-healing subsystem (`validateIntegrity()`/`repair()`/`getHealthScore()`) — deleted 2026-08-06 (architecture review candidate #3). Confirmed dead by `ADR-034`: `repair()`/`getHealthScore()` had zero callers anywhere, ever; `validateIntegrity()`'s only 2 callers were the other two methods, so the whole subsystem was a closed, unreachable island. Unlike `TranslationProfiler`/Pattern Profiling (ADR-021, kept as gated dev tools with a real enable/disable toggle), this had no wiring or dev-console hook — just orphaned code. The supporting `.d.ts` types (`TrieValidationResult`, `TrieRepairResult`, `TrieHealthScore`, and 5 more feeding them) were deleted alongside from `DictionaryManagerTypes.d.ts`.

`TrieNode` is exported from the same file so `DictionaryTrieLoader` can reconstruct cached tries without passing constructor references at the call site.

Entry point: `src/utils/dictionary/DictionaryTrie.js`. Consumed by `DictionaryManager` (one `DictionaryTrie` per loaded dictionary) and `DictionaryTrieLoader` (cache hit/miss reconstruction).

## DictionaryEntryFlattener

Converts raw dictionary JSON directly into the flat `{chinese, vietnamese, metadata}[]` shape both `RustLookupIndexManager` (Rust lookup-index builder, `build_lookup_index` in `src-tauri/src/dictionary_commands.rs`, which builds its own `lookup_index_engine::TrieNode` from the flat entries — a third, distinct trie type from both `DictionaryTrie` and `wasm-core::trie::TrieNode`) and `DictionaryWasmLookup`'s WASM `DictionaryEngine` sync (`syncDictionariesToWasm` → `WasmDictionaryManager.loadDictionary`) consume — the two WASM-adjacent consumers of "flat entries" share one builder as of 2026-08-07.

Replaces two former trie-walks that independently reverse-engineered this same flat shape by DFS-walking an already-built `DictionaryTrie`: `RustLookupIndexManager.extractEntriesFromTrie` (deleted earlier, carried a `MAX_DEPTH` recursion guard and dev-only cycle detector) and `DictionaryManager._extractAllEntries`/`_extractTrieEntries` (deleted 2026-08-07 architecture-review grill, unguarded — no recursion/cycle protection at all). Both were defensive/undefended machinery that existed only because a live trie was being treated as untrusted structure to walk. `DictionaryManager` now builds flat entries directly from the same raw JSON it reads to build the trie, once at dictionary-load time, and retains them in `this.flatEntries` — no walk, no cycle risk, nothing to guard against, and only one metadata shape to reason about.

Per-entry `metadata` intentionally omits the derived `priority`/`frequency`/`dictionary` fields `DictionaryManager`'s trie-insert loop computes for `DictionaryTrie` nodes — every reader of trie-node metadata was grepped and none read those fields, on either the Rust lookup-index side or the WASM `DictionaryEngine` side (`DictionaryWasmLookup.findAllMatches` supplies per-dictionary priority separately from its own `_priorityByName` map, never from per-entry metadata). Rust/WASM both treat `metadata` as an opaque passthrough string. Only whatever the source dictionary JSON itself provides (e.g. `allowAsPatternVariable`, `semanticType`) is carried through.

**`metadata` is pre-serialized (`string | null`), not a raw object** — `WasmDictionaryManager.loadDictionary` must NOT re-`JSON.stringify` it (fixed 2026-08-07; the old trie-walk path fed a raw object here, so the mapping used to stringify defensively — feeding it an already-stringified `flatEntries` value there would double-encode it). `loadDictionary`'s contract is now "metadata arrives wire-ready."

Interface: `flattenDictionaryEntries(dictionaryData): FlatDictionaryEntry[]`. Pure function of the raw JSON object — no trie, no DictionaryManager instance required.

Entry point: `src/utils/dictionary/DictionaryEntryFlattener.ts`. Called from `DictionaryManager`'s two dictionary-registration sites (main load loop, `lazyLoadDictionary`) alongside `this.dictionaries.set(...)`.

## VocabularyWarmup

The warmup strategy for novel-specific vocabulary. Owns three pure concerns: (1) `extractHighFrequencyVocabulary(dictionary, dictionaryName)` — DFS traversal of a `DictionaryTrie` root, collecting up to 50 entries sorted by word length (shorter = higher priority); (2) `generateCharacterCombinations(vocabularyEntries)` — cross-products each short proper-noun character with the top 5 function words (`的 了 在 说 看`), capped at 30 pairs; (3) `warmNovelSpecificVocabulary(dictionaryManager, activeProperNouns, limits, cache)` — orchestrates (1) and (2) per dictionary, writes results into `cache` via `setCharacter` and `setPhrase`.

No cache state owned — `warmNovelSpecificVocabulary` receives `cache` as an injected dependency. Testable by passing a stub `{ setCharacter, setPhrase }` object without constructing a real `TranslationCache`.

Entry point: `src/utils/dictionary/VocabularyWarmup.js`. Called from `TranslationCache.preWarmNovelSpecificVocabulary` (which now delegates entirely). Also exported from `src/utils/dictionary/index.ts` for direct use.

## ScrollPositionRecovery

The retry algorithm for restoring scroll positions after a dictionary reload or translation update. Owns: RAF-first attempt, exponential-backoff retry loop (up to `maxRetryAttempts`, delay doubles each miss, capped at `maxRetryDelay`), timer handle lifecycle (`cancel()`).

Does not touch the DOM. Callers inject an `AttemptFn: (positions) => boolean` — returns `true` when refs were ready and positions were written; `false` to trigger a retry. The hook adapter (`useScrollPositionManager`) supplies the concrete attempt function: DOM readiness check (`scrollHeight > 0`) + bounds-clamped write of `scrollTop`/`scrollLeft`.

Interface: `restore(positions, options?): Promise<void>` — resolves when attempt succeeds or retries are exhausted (never rejects). `cancel()` aborts any pending RAF or setTimeout; second `restore()` call implicitly cancels the first.

Entry point: `src/utils/ui/ScrollPositionRecovery.ts`, re-exported from `src/utils/ui/index.ts`. Consumed exclusively by `useScrollPositionManager` via a stable `useRef` instance.

## CharacterOnlyBridge

The occurrence-scoring algorithm that maps a highlighted unit in the Full Translation or Original panel to the correct unit index(es) in the Character-Only panel. Handles two disambiguation strategies:

- **Sequential occurrence matching** (100 pts): counts how many earlier tokenIndex-ordered entries in `sourceArrays` contain `targetSegment` to determine which Nth occurrence in the target arrays to pick. Uses `tokenIndex` from metadata — not array order — to handle cross-chunk scrambled indices.
- **Context window scoring** (up to 20 pts): checks the character immediately before and after each candidate in `targetArrays.original` against a ±2-segment immediate context string (10 pts/match) and a ±CONTEXT_WINDOW distant context string (2 pts/match).
- **Position-ratio fallback**: used when total score is still -1 (no context signal found); maps `sourceIndex / sourceArrays.length` to the proportionally closest candidate.

Returns `number[] | null`: array of Character-Only unit indices to pass to `SET_CHARACTER_ONLY_INDEX`, or `null` when no match exists. Multi-character source segments return multi-element arrays (one index per character).

Constants `MAX_MATCHES = 100` and `CONTEXT_WINDOW = 50` are exported for tests.

`findCharacterOnlyMatch(sourceIndex, sourceArrays, targetArrays)` is direction-generic — the params don't hardcode which side is "Character-Only." Two call sites use it in opposite directions: `useCharacterOnlyBridge` (`sourceArrays=semanticArrays, targetArrays=characterOnlySemanticArrays` — Full Translation/Original → Character-Only) and `Translator.jsx`'s `handleSemanticSegmentClick` `character-only-to-original` branch (`sourceArrays=characterOnlySemanticArrays, targetArrays=semanticArrays` — reverse). Unified 2026-07-17c: the reverse direction previously hand-rolled a separate, uncapped, less-accurate (position-ratio-only, no context scoring) copy of this same algorithm — deleted in favor of calling this function directly. On a total miss (`null`), the reverse-direction caller clears the highlight (`highlightFromCharacterOnly(-1)`) rather than falling back to a position-ratio guess, matching `useCharacterOnlyBridge`'s own null-handling convention.

Entry point: `src/utils/highlighting/CharacterOnlyBridge.ts`. Called from `useCharacterOnlyBridge` hook (`src/hooks/useCharacterOnlyBridge.ts`), which owns the React plumbing (guards, bounds check, dispatch, 10ms scroll), and directly from `Translator.jsx`'s `handleSemanticSegmentClick` for the reverse direction.

## DictionaryBackend

The IO module for dictionary persistence. Owns the load protocol: parallel batch load via `loadDictionariesParallel` → serial retry for cold-launch failures (file lock, Rayon thread pool warmup, OS read pressure) → classification of still-failed IDs. Returns raw (unsorted) data; callers own sorting, toasting, and React state.

Interface: `loadAllDictionaries(dictionaryIds: string[]): Promise<BatchLoadResult>` where `BatchLoadResult` carries `loadedDictionaries` (all IDs present; failed IDs initialized to `{}`), `stillFailedIds`, and `total`.

No React, no toast, no sorting. Testable as a plain async function — stub `window.electronAPI` and verify retry+classification behavior directly without mounting the provider.

Entry point: `src/utils/dictionary/DictionaryBackend.ts`. Called from `loadInitialState` (startup) and `loadDictionary` (single reload) in `DictionaryContext.tsx` — both use the same parallel+retry protocol.

## DictionaryOperationReverter

Pure diff-reversal for the undo/redo subsystem. `computeUndoMutation(op, currentDicts)` and `computeRedoMutation(op, currentDicts)` each take a `HistoryOperation` and current dict snapshot, return `MutationUpdate[] | null` (null = required dict missing). Returned entries are already sorted — pass directly to `commitMutation`. Covers all 5 op types: `add`, `update`, `delete`, `bulk_delete`, `move`/`bulk_move`.

No React, no async, no side effects. All reversal logic is testable as plain functions.

Entry point: `src/utils/dictionary/DictionaryOperationReverter.ts`. Called exclusively from `useDictionaryHistory`; the hook owns React state and wiring, this module owns all domain logic.

## DictionaryPersistence

The two write-to-disk protocols used by dictionary CRUD. `persistDictionaryMutation` — single-dict: optimistic `setDictionaries` → `saveDictionary` → rollback on failure. `commitMoveOp` — two-dict: optimistic `setDictionaries` → parallel save → partial revert (if one save succeeds and the other fails, the successful write is reverted to disk). Both returned callbacks are stable (no deps beyond `setDictionaries`).

Entry point: `src/components/dictionary/useDictionaryPersistence.ts`. Injected into `useDictionaryCRUD` by `DictionaryProvider` via `const { persistDictionaryMutation, commitMoveOp } = useDictionaryPersistence(setDictionaries)`.

## DictionaryMatchLookup

The JS match-lookup dispatch behind `DictionaryManager`'s two public lookup methods. Owns: `findMatchesThreadSafe` (single-dictionary trie walk, no shared-array state), `findAllMatchesSequential` (scans search order in order), `findAllMatchesParallel` (WASM-first via injected `wasmLookup`, catches failure and falls back to JS `Promise.all` fan-out across dictionaries, catches further failure and falls back to sequential), and `stats` (parallelCalls/sequentialCalls/averageParallelTime/averageSequentialTime/fallbackCount).

Two public methods only: `findAllMatches` (sync, always sequential — required by `PatternVariableCache`'s per-position hot loop, which cannot await) and `findAllMatchesAsync` (auto parallel/sequential, chosen by `enableParallelLookups && searchOrder.length >= dictionaryParallelThreshold`). `DictionaryManager.findAllMatches`/`.findAllMatchesAsync` are thin delegations to `this.matchLookup`; `DictionaryManager.parallelLookupStats` is a getter re-exposing `this.matchLookup.stats` so existing external readers (e.g. `TranslationEngine.js`) don't need to know the internal split exists.

Replaces 7 previously-flat methods on `DictionaryManager` (`findMatchesThreadSafe`, `findAllMatchesParallel`, `findAllMatchesSequential`, `findAllMatches`, `findAllMatchesAsync`, plus dead `findBestMatch`/`findBestMatchAsync` — deleted, zero callers). Collapsing them surfaced a shadowed dead `getDictionary` (defined twice — `|| null` version unreachable behind a later `?? null` redefinition) that had gone unnoticed while the class carried 7 near-duplicate lookup entry points.

Constructor takes injected dependencies (live `dictionaries`/`metadata` Maps, `wasmLookup`, `enableParallelLookups`, `dictionaryParallelThreshold`, `getDefaultSearchOrder` callback, `isReady` callback) — testable standalone with a stub trie and no full `DictionaryManager` construction.

Entry point: `src/utils/dictionary/DictionaryMatchLookup.js`. Constructed once in `DictionaryManager`'s constructor as `this.matchLookup`.

See `LookupIndexBuilder` for the separate, orthogonal axis (whole-text index build, chosen once per translation) that this class's `findAllMatchesSequential` is itself called by internally, and that also runs independently per-call whenever no index exists.

## LookupIndexBuilder

The whole-text lookup-index build path — pre-computes matches for every text position once per translation, so phases don't re-walk dictionary tries per-token. Orthogonal to `DictionaryMatchLookup` (which handles a single lookup call's dispatch): this axis decides IF a whole-text index gets built at all, and which tier built it.

`buildLookupIndexOrFallback(text, options, deps)` is the entry point (called from both `translateSinglePass` and `translateWithCharactersOnly` — previously duplicated verbatim between the two, with the character-only path silently missing the JS-fallback tier before unification). Gate: skips entirely (no index, traditional per-position lookup) if `text.length < DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX` (50) or `options.useSharedLookupIndex === false` or an index was already supplied.

Two tiers, NOT a graceful two-step fallback — a sharp distinction:

- **Rust tier**: tries `RustLookupIndexManager.buildLookupIndex` first. If `rustLookupIndexManager.isAvailable()` is false (WASM simply not ready), the function returns immediately with **no index built at all** — it does NOT fall through to the JS tier in this case.
- **JS tier**: only engages if the Rust _call itself throws_ (e.g. dynamic import failure, an unexpected runtime error) — the `catch` block then calls `DictionaryManager.buildComprehensiveLookupIndex(text, {...})`, which walks `DictionaryMatchLookup.findAllMatchesSequential` once per text position and categorizes results by dictionary type (patterns/properNouns/phrases/characters/numbers).

Read side: `getIndexedMatches(lookupIndex, position, category)` (`LookupIndexUtils.ts`) is how callers actually consume whichever index got built — it bridges camelCase (JS-built) vs snake_case (Rust-built, only `properNouns`→`proper_nouns` differs) field names, and re-sorts Rust's dictionary-iteration-order matches into the same specificity/priority order JS already produces.

**Rust-tier match `.priority` is the real dictionary tier (fixed 2026-08-07), not the array position in `dictionaryOrder`.** `RustLookupIndexManager.buildLookupIndex` takes a `priorityByName: Map<string, number>` param — `buildLookupIndexOrFallback` builds it via `dictionaryManager.getPriorityForDictionary(name)` per entry in `dictionaryOrder`, mirroring `DictionaryWasmLookup`'s existing `_priorityByName` pattern on the WASM path. Before this fix, `convertDictionariesToRustFormat` set `priority: idx` (loop position) — confirmed behavior-neutral at the time (Rust's per-position match collection is always in `dictionaryOrder` order regardless of the cross-position parallelism in `build_index_parallel`, and `compareMatchesBySpecificityThenPriority`'s stable sort preserves that same order on a real tie), but a latent trap for any future caller building `dictionaryOrder` without pre-sorting by real priority, or any future code reading `.priority` as an absolute value instead of a pure sort key.

See `DictionaryMatchLookup` for the separate, per-call match-dispatch axis (sequential/parallel/WASM) that this index-build path itself uses internally (via `findAllMatchesSequential`) and that also runs independently whenever no index exists.

Entry points: `src/utils/dictionary/LookupIndexBuilder.ts` (`buildLookupIndexOrFallback`), `src/utils/RustLookupIndexManager.js`, `src/utils/dictionary/LookupIndexUtils.ts` (`getIndexedMatches`), `DictionaryManager.buildComprehensiveLookupIndex` (JS fallback tier).

## TextTokenizer

The Phase-0 tokenization seam: splits raw input text into `Token[]` (type, value, start, end) before the 5-phase pipeline runs. Two adapters behind one interface (`tokenize(text): Token[]`): `WasmTextTokenizer` (Rust `tokenize_text_core`, direct character classification, 3-8x faster) tried first; JS regex-based `tokenizeJS` (private method) as fallback, used whenever WASM hasn't finished its async init or a WASM call returns `null`.

Both adapters classify characters into the same 7 `TokenType`s, but with one deliberate divergence: **token count for runs of consecutive punctuation/unknown characters**. JS's regex catch-all (`[^\w\s一-鿿]+`) groups a run into one token (`"……"` → 1 token); Rust's classifier processes one character at a time for anything outside `is_chinese_char`/`is_latin_letter`/`is_digit`/whitespace (`"……"` → 2 tokens). Kept as one-token-per-char on the Rust side deliberately — the punctuation dictionary is single-char-keyed only, so per-char tokens avoid the dictionary-translate prefix-match truncation risk (`cleanupFormatting`'s 27-char list note).

Prior to 2026-07-17c, Rust's punctuation classifier was a finite enumerated char list that was missing 20 of the 41 characters in the real `punctuation.json` dictionary (including `…` and dialogue corner brackets `「」『』`) — those chars fell through to `unknown` in WASM while JS correctly typed them `punctuation`, a type mismatch (not just a count mismatch) that had already caused one confirmed production bug (a `TranslationEngine.js` spacing rule needed an allowlist workaround specifically because of it). Fixed by replacing the enumerated list with a catch-all classifier — see `wasm-core/CLAUDE.md`.

**Residual, deliberately-unfixed divergences** (JS regex/`\w` semantics vs Rust char-predicate ranges are two independent classifiers, not one shared runtime — the catch-all fix closed the specific gap that was biting production, not every possible Unicode disagreement): (1) CJK Extension A (U+3400–4DBF) / Compatibility Ideographs (U+F900–FAFF) — Rust's `is_chinese_char` covers 3 ranges, JS's regex chinese group only checks `一-鿿` (CJK Unified), so these classify `chinese_char` in Rust vs `punctuation` in JS; (2) underscore `_` — JS's `\w` excludes it from every capture group including the punct catch-all, so it hits `tokenizeJS`'s gap-fill path and becomes `unknown`, while Rust's catch-all has no `\w`-shaped exclusion and types it `punctuation`; (3) BOM U+FEFF — ECMAScript's `\s` matches it per spec, Rust's `char::is_whitespace()` doesn't (not in Unicode `White_Space` property), so JS types it `whitespace` vs Rust's `punctuation`. All three are low-practical-risk (none appear in normal Chinese-novel text).

**Cross-language contract (architecture review 2026-07-29, candidate #6):** `test-fixtures/tokenizer-parity.json` (repo root — neither `wasm-core/` nor `src/` should reach into the other's tree) is the single shared source of truth for both the agreement cases and the divergences above, read directly by both `text_tokenizer.rs`'s `mod tests::parity` (`include_str!` + `serde_json`) and `src/utils/__tests__/TextTokenizer.parity.test.ts` (static JSON import). Each side asserts its own real tokenizer's output against the fixture — not against each other's test file by convention, which is what existed before this: two independently-hand-maintained test files that only agreed because their comments cross-referenced each other correctly by hand. A future change to either classifier that isn't also reflected in the fixture now fails a test on that side specifically, rather than silently drifting until someone notices the stale cross-reference comment. Note: this is a genuine exception to this codebase's general `needsSpace()`/`needsSpace()`-style "parity by independently-written tests, not a shared runtime" convention (see ADR-033) — that convention holds when no trusted oracle exists on either side; here, concrete fixture-based oracles already existed on both sides before this fixture was built, which is what made a real shared contract cheap and safe to add rather than "guessing twice."

Entry points: `src/utils/text/TextTokenizer.ts` (JS-facing class, owns the WASM-first/JS-fallback dispatch), `src/utils/wasm/WasmTextTokenizer.js` (thin WASM wrapper), `wasm-core/src/text_tokenizer.rs` (`tokenize_text_core` — plain-Rust core, `tokenize_text` — thin `#[wasm_bindgen]` wrapper around it), `test-fixtures/tokenizer-parity.json` (shared parity contract).

## useEngineReinitializer / useReloadRetranslate

The two capability functions `Translator.jsx` supplies as `forceReloadCtx.reinitializeEngine`/`.retranslate` for `useForceReload` (see ADR-027-era `ForceReloadContext`). Extracted 2026-07-17c: this logic previously lived inline in `Translator.jsx`'s `forceReloadCtx` object literal and had zero direct test coverage — `useForceReload.test.js` mocks both fields wholesale as bare `vi.fn()`, so the real branching (WASM validation statuses, dual-mode-optimized-to-sequential fallback) was never exercised anywhere.

**Not** absorbed into `useForceReload.js` itself — doing so would have replaced 2 composed capability functions with ~8 raw primitives (`engineRef`, `reinitialize`, `validateSemanticArraySize`, `setDualResults`, `refreshReport`, `translateText`, `translateCharacterOnly`, `setStreamingText`) as `ForceReloadContext` fields, widening that interface from 10 fields to ~16 — the opposite of deepening. Instead, two small hooks construct the same 2 composed functions `Translator.jsx` already supplied, keeping `ForceReloadContext`'s shape unchanged while moving the logic + its tests out of the 1300+-line component.

- **`useEngineReinitializer(reinitialize, engineRef)`** — `src/hooks/useEngineReinitializer.js`. Calls the real `reinitialize` (from `useTranslatorEngine`), then a fire-and-forget WASM dictionary-sync validation (`setTimeout` 100ms, non-blocking — returns `true` before validation runs). 4-branch status handling (`PASS`/`SKIPPED`/`FAIL_DIFFERENCES`/`FAIL_ERRORS`) with toasts on the failure branches.
- **`useReloadRetranslate({ engineRef, validateSemanticArraySize, setDualResults, refreshReport, translateText, translateCharacterOnly, setStreamingText })`** — `src/hooks/useReloadRetranslate.js`. Waits for engine readiness (100ms, +500ms retry if still not ready), prefers `engineRef.current.translateDualModeOptimized` (validates both semantic arrays, resolves silently if validation throws — already toasted upstream), falls back to sequential `translateText` + `translateCharacterOnly` on optimized-path failure or absence. Owns the success toast.

Both are directly unit-tested (`useEngineReinitializer.test.js`, `useReloadRetranslate.test.js`) with fake timers and mocked `engineRef`/dependencies — no `Translator.jsx` mounting required.

## DictionaryEntryForm

All form logic for creating and editing a dictionary entry: field state, clipboard auto-populate, rough-translation generation from the character dictionary, character/pattern validation, existing-entry detection across all dictionaries, and submit. `handleSubmit` returns `Promise<boolean>` — `true` means saved; the component calls `onClose()` only on `true`.

Receives `{ updateEntry, addEntry, dictionaries }` injected from the caller's `useDictionary()` call — not called internally — so tests use plain mocks without DictionaryContext. DOM refs (`sourceInputRef`, `translationInputRef`) are created inside the hook and returned; the component binds them to `<input ref={...}>` elements. The `DictionaryEntry` component retains `useDictionary()`, `onClose`, and JSX rendering only (~300 LOC).

Entry point: `src/hooks/useDictionaryEntryForm.ts`. Called from `src/components/dictionary/DictionaryEntry.tsx`.

## DictionaryTrieBuilder

The pure trie-construction fallback `DictionaryManager.loadDictionaries` calls when the precomputed-cache path (`DictionaryTrieLoader.loadDictionaryWithCache`) misses or is disabled. No `this`, no I/O, no logging — `DictionaryManager` still owns disposal, cache lookup, Map storage, and logging invalid entries; this module owns only the entry-by-entry trie insert and the priority-assignment rule.

Two exports: `resolveDictionaryPriority(dictionaryName, priorities)` — fiction (`properNouns-f_*` → 1) and generic (`properNouns-_*` → 2) prefixes always win over the caller-supplied `priorities` map; falls back to `priorities[dictionaryName] ?? (properNouns-prefixed ? 3 : 10)`. `buildTrieFromDictionary(dictionary, dictionaryName, priority, estimateFrequency)` — builds a `DictionaryTrie` from raw dictionary JSON, returns `{trie, entryCount, invalidSources}`; invalid entries (no string value, no `.translation` field) are collected rather than logged internally, so the caller decides how to surface them.

Extracted 2026-07-17d from `loadDictionaries`' 204-line body: the priority-assignment rule was previously duplicated verbatim twice per dictionary (once inside the per-entry trie-insert loop as `priority`, again after the loop as `metadataPriority` for the dictionary-level metadata Map entry) despite depending only on `dictionaryName` — the first copy was being wastefully recomputed on every single entry. `resolveDictionaryPriority` is now called once per dictionary and the same value feeds both the trie-node metadata and the dictionary metadata.

Distinct from `lazyLoadDictionary`'s separate trie-build path (no per-entry metadata at all) and its own `getDefaultPriority` scheme (different rule set, different numbering) — that divergence is pre-existing and already documented in `src/utils/CLAUDE.md`'s "DictionaryManager Trie-Node Metadata Is Not Uniform Across Load Paths" section; this extraction does not touch or unify it.

Entry point: `src/utils/dictionary/DictionaryTrieBuilder.ts`. Not barrel-exported — sole caller is `DictionaryManager.js` in the same directory (matches `MatchComparator.ts`/`PhraseConsumptionMarker.ts` convention).

## AppearanceConfig

The validation adapter for appearance-settings IPC reads/writes — the `AppConfig` discipline (`validateApiResult` + per-field `fromRaw` typecheck) applied to the previously-unvalidated appearance seam. Before this module, `useAppearanceSettings.ts` and `App.jsx`'s startup FOUC-prevention bootstrap each independently spread-merged raw IPC data into state with no per-leaf type check — a wrong-typed field (e.g. `fontSize: 123`) would reach `applyAppearanceToCssVars` unchecked. Same failure class as two prior confirmed bugs (`WasmValidationResult` status-string drift, `VocabularyWarmup`'s `??` vs `||` bug).

`fromRaw(raw)` validates per-leaf, not per-section: a bad `chineseText.fontSize` falls back to `DEFAULT_APPEARANCE.chineseText.fontSize` alone — sibling leaves in the same `FontSettings` section (a valid `fontFamily`) survive. Enum fields (`letterSpacing: 'normal'|'tight'|'wide'`, `theme: 'light'|'dark'|'auto'`) are checked by union membership, not `typeof === 'string'` — a wrong-but-string-typed value (`letterSpacing: 'super-wide'`) is rejected, not just a wrong-typed one. `customColors` (declared on `AppearanceSettings`, zero read sites anywhere) is intentionally omitted from `fromRaw`'s output, matching pre-existing behavior.

Unlike `AppConfig`, this module holds **no module-level cache** — `useAppearanceSettings`' React state is the sole cache (one caller, unlike `AppConfig`'s many non-React readers), so a second cache would just be a second source of truth to drift from. No `toRaw` either — `AppearanceSettings`' internal shape already matches the IPC wire shape (unlike `AppConfig`'s engine/ui/session regrouping).

`loadAppearanceConfig()` always returns a fully defaults-filled `AppearanceSettings` (never partial, never throws on a `success:false` envelope — only on a malformed envelope shape) — same contract as `loadAppConfig()`. `saveAppearanceConfig(settings)` throws on `success:false`.

`DEFAULT_APPEARANCE` moved here from `useAppearanceSettings.ts` (still re-exported from there for `App.jsx` and existing test imports) to avoid a circular import between the hook and this module.

Entry point: `src/utils/appearanceConfig.ts`. Called from `useAppearanceSettings.ts` (all 4 IPC call sites) and `App.jsx`'s startup bootstrap — both previously called `window.electronAPI.loadAppearanceSettings`/`saveAppearanceSettings` directly.

## DictionaryConfigManagement

The state, mount-time load/migration effect, and CRUD/rename/quick-add handlers for the Configuration screen's proper-noun dictionary list — extracted so `ConfigurationManager.tsx` stays render-only, matching the hook-extraction pattern already applied throughout `src/components/dictionary/`.

Owns: available/active dictionary lists, loading/error state, new-dictionary-modal and rename-mode state, default-quick-add-dictionary state, the mount effect (loads dictionaries, then migrates — creates any missing `patterns-f_*` dict for a pre-existing fiction proper-noun dict; migration failure is a silent `console.warn`, non-fatal by design, not surfaced to the user), and 6 handlers (`handleToggleDictionary`, `handleCreateDictionary`, `handleStartRename`, `handleCancelRename`, `handleConfirmRename`, `handleSetDefaultQuickAdd`).

Calls `useDictionary()` internally rather than taking it as an injected param — single call site, unlike the `DictionaryProvider`-composed hooks in `src/components/dictionary/` (`useDictionaryCRUD`, `useDictionaryHistory`, etc.) which need injection to share state across composition. Raw `useState` setters are exposed directly for the 3 pure-UI-state fields (`showNewDictionaryModal`, `newDictionaryName`, `renameValue`) — no invariant to protect, so no action-wrapper ceremony.

Entry point: `src/components/configuration/useDictionaryConfigManagement.ts`. Sole caller: `ConfigurationManager.tsx`.

## DictionaryListOrganizer

Pure sort + 3-way category split (Base / Generic / Fiction) for the Configuration screen's dictionary-id list. `sortDictionaries(ids)` puts `'properNouns'` first, then alphabetical. `categorizeDictionaries(ids)` buckets by the naming convention: `properNouns-f_*` → fiction, `properNouns-_*` → generic, everything else (including bare `'properNouns'`) → base.

Entry point: `src/utils/dictionary/DictionaryListOrganizer.ts`. Not barrel-exported — sole caller is `useDictionaryConfigManagement.ts`, matching `MatchComparator.ts`/`PhraseConsumptionMarker.ts`'s single-caller convention.

## SegmentedParagraphs

The shared paragraph-grouped segment renderer for the two char-only Clickable*Semantic components (`ClickableOriginalSemantic.tsx`, `ClickableTranslationSemantic.tsx`). Extracted 2026-07-29 — both had independently re-implemented an identical paragraph-wrapping loop (map paragraphs → div with conditional `marginBottom` on all but the last → inner map building a clickable/non-clickable segment) despite genuinely different title formats, highlight arity (`isUnitHighlighted` called with 1 vs 2 highlight args — see `UnitHighlightPredicate`), click directions, non-clickable className logic, and fallback/empty-state branch counts (Original has 2 branches — missing text vs empty semantic array; Translation has 1).

Interface: `renderSegmentedContent({ segments, paragraphs, getTitle, isHighlighted, onUnitClick, getNonClickableClassName, renderFallback, containerClassName, paragraphClassName, paragraphSpacingVar })`. The function owns the loop, the fallback dispatch (`segments.length === 0`), and the `<HighlightableSegment>` construction. Every piece that actually differs between the two callers is an injected callback — `renderFallback` in particular stays caller-owned specifically because the two components' empty-state branch _counts_ differ, not just their content.

Plain function, not a component — matches the pre-extraction style (both callers used plain arrow functions) and avoids introducing a new reconciliation boundary between the callers and `HighlightableSegment`'s own memoization.

Entry point: `src/components/char-only/SegmentedParagraphs.tsx`. Not barrel-exported (no `char-only/index.ts` exists) — imported directly by both callers, matching how `HighlightableSegment.tsx` is already imported.

## PositionBasedSegmentBuilder

The direct-placement fast path for `precomputeOriginalSegments` (original Chinese panel): when every semantic-array entry already has `originalStart`/`originalEnd` metadata (set during `postProcess`), walks entries sorted by `originalStart` instead of running the greedy scan. Avoids the scan's first-available tie-breaking, which can diverge from the Vietnamese panel's assignment order for duplicate translated words. Only fires for single-chunk (short) translations — the parallel merge loop drops `originalStart`, so multi-chunk translations always fall through to the scan.

Extracted from `SegmentPrecomputer.ts` 2026-08-15 (architecture review candidate #3) — self-contained, shares no state or matching logic with `precomputeSegments`/`precomputeOriginalSegments`, the two scan loops ADR-036 protects from unification. Not that pair; the split doesn't reopen ADR-036. Its existing tests (`SegmentPrecomputer.test.ts`, `describe('buildSegmentsFromPositions (fast path)')`) test it black-box through `precomputeOriginalSegments`'s routing and needed no changes — they never imported the function directly, since it wasn't exported before this extraction.

Interface: `buildSegmentsFromPositions(text, semanticArrays) → Segment[]`. Takes `Segment`/`SemanticArrays` as type-only imports from `SegmentPrecomputer.ts` (erased at compile time — no real runtime import cycle, even though `SegmentPrecomputer.ts` imports the function back).

Entry point: `src/utils/highlighting/PositionBasedSegmentBuilder.ts`, barrel-exported from `src/utils/highlighting/index.ts`. Sole caller: `precomputeOriginalSegments` in `SegmentPrecomputer.ts`, gated by the `allHavePositions` check.

## _clampInitialBatchSize

`TranslationEngine.js`'s seam-contract fix for the batch-size floor (architecture review 2026-08-15, candidate #2 — real bug, not just shallowness). `AdaptiveBatchSizer.calculateNextBatchSize`'s severe-degradation shrink guard (`currentBatchSize > MIN_BATCH_SIZE`) silently never fires below `MIN_BATCH_SIZE` (3) — reachable whenever `chunkConfig.enabled === false` (short texts, <~400 chars), which previously pinned the initial `currentBatchSize` to a hardcoded `2`, one below the floor. `_clampInitialBatchSize(chunkConfig, currentBatchSize)` now floors the disabled-chunking case at `MIN_BATCH_SIZE` instead — self-sufficient fix, since the shrink branch's own floor (`max(MIN_BATCH_SIZE, size-1)`) keeps `currentBatchSize` in range for the rest of the loop once entry respects it. `MIN_BATCH_SIZE`/`MAX_BATCH_SIZE` now exported from `AdaptiveBatchSizer.ts`.

Entry point: `src/utils/TranslationEngine.js`, private method next to `_applyBatchMemoryCleanup`. Tests: `AdaptiveBatchSizer.test.ts` (pure-function boundary behavior), `TranslationEngine.regression.test.js`'s `_clampInitialBatchSize wiring` block (real call-site invariant).

## emptySemanticArrays / _logUnpositionedSegments

Two small dedup extractions from `TranslationEngine.js` (architecture review 2026-08-15, candidate #4), both scoped file-wide rather than to a single method — neither call site is on the DO-NOT-EXTRACT list (`translateSinglePass`/`findAllMatchesWithSemanticCache`/`postProcess`).

`emptySemanticArrays()` — the `{ original: [], translated: [], metadata: [] }` fallback shape for `semanticArrayBuilder?.getArrays() || ...`. Was hand-copied at 8 sites across 5 methods (`translateWithCharactersOnly`, `translateWithSegments`, `translateWithProgressiveBatches` ×4, `translateWithChunking`, `getBatchSemanticArrays`) before being unified. Zero `this` state — a plain exported function, not a TranslationEngine method. Entry point: `src/utils/highlighting/SegmentPrecomputer.ts`, barrel-exported.

`_logUnpositionedSegments(contextSuffix)` — the `translationSegments.filter(s => s.translatedStart === -1)` + warn-if-any-found diagnostic. Was hand-copied at 3 sites across 2 methods (`translateWithSegments`, `translateWithProgressiveBatches` ×2 — "in batch processing" / "in final processing"), not the 3-sites-in-one-method the initial report card claimed (re-verified directly against the file during grilling). Needs `this.translationSegments`/`this.log` — stays a private TranslationEngine method, unlike `emptySemanticArrays`. Do NOT confuse with the single-line `if (translationSegment.translatedStart === -1)` guard elsewhere in the file (~line 4239, inside the position-assignment loop) — structurally different (a set-once guard, not a filter+warn diagnostic) and correctly left untouched.

## accumulateLoadResults

The shared accumulate-and-log step for `useForceReload.js`'s two dictionary-load branches (`parallelDictionaryLoader` primary path, manual `Promise.all` catch-fallback). Extracted 2026-07-29 — both branches independently built `freshDictionaries`/`successCount` and logged per-item ✅/❌, and the fallback branch's per-item failure logging (inline inside its `loadPromises` map) was removed in the same pass since `accumulateLoadResults` is now the sole logger for failures — the fallback branch used to double-log before this.

The two branches source result items in different shapes (`{name, success, result:{data,entryCount}, error}` vs `{dictId, data, success, entryCount, error}`) — each branch normalizes its own shape into `{id, success, data, entryCount, error}` via an inline `.map()` before calling here. The final one-line summary log (`📥 Loaded X/Y...`) stays branch-local — the two messages genuinely differ (duration vs a `(fallback)` label) and weren't worth forcing into one shape.

Interface: `accumulateLoadResults(items: NormalizedLoadResultItem[]) → {freshDictionaries, successCount}`.

Entry point: `src/hooks/useForceReload.js`, module-level, not exported — both callers live inside the same file's `handleForceReload`.

## _findInDictionaries

`DictionaryManager`'s pure search-order trie walk — no cache reads/writes, no WASM dispatch. Extracted 2026-07-29 from the true overlap between `translate()`'s JS-fallback loop and `_translateJSDirect` (previously two independent copies of the same "walk searchOrder, `dictionary.getWithMetadata(word)`, build `{word, translation, dictionary, metadata}`" loop). `translate()` calls it then layers its own caching (character/phrase split, multi-dict lookup cache, negative-cache-on-miss) on top of the result; `_translateJSDirect` is now a one-line delegation (`_findInDictionaries(word, dictionaryOrder || this.getDefaultSearchOrder())`).

The cache/WASM logic was deliberately **not** pulled into the shared piece — `_translateJSDirect` is called from `validateWasmFallback` (WASM/JS parity check), whose entire purpose requires an independent, cache-free JS computation to compare against a fresh WASM call. Calling `translate()` instead would either return a stale cached value (masking a live divergence) or, since `translate()` itself tries WASM first, could silently return a WASM result instead of a JS one — defeating the comparison either way. This independence is asserted directly in `DictionaryManager.apiContract.test.js` (`_translateJSDirect` spied against all 4 `TranslationCache` methods, asserted zero calls).

Entry point: `src/utils/dictionary/DictionaryManager.js`, private method — callers are `translate()` and `_translateJSDirect`, both in the same file.

## BatchMemoryCleanup

The trim policy for the resources `translateWithProgressiveBatches` accumulates across batches: `batchPerformanceHistory`, memory-tracker snapshots, and the pattern-processor variable cache. Extracted 2026-07-29 (architecture review candidate #1) from ~7 independently-tuned inline copies of the same trim logic that had drifted to disagree on keep-counts (3/5/10/25/50 for the same conceptual "trim history" operation, depending on which of 3 separate trigger shapes fired).

Deliberately does **not** own `translationSegments` or `semanticArrayBuilder`. `translationSegments` already has a canonical, regression-tested hard ceiling in `trackTranslationSegment` (`SEGMENT_CLEANUP_TRIGGER`/`_KEEP`/`_HARD_CEILING` in `PerformanceThresholds.ts`) — trimming it a second time here would be redundant, not a second layer of safety. `semanticArrayBuilder` has no real light-cleanup method: the pre-extraction code guarded calls to `.cleanup()`/`.clearCache()`, neither of which has ever existed on the class — confirmed dead, always-no-op guarded calls (the same pattern as `dictionaryManager.optimizeCaches()` and `translationCache.clearOldEntries()`, also found and dropped in the same pass, the latter a stale reference to the already-deleted `TranslationSegmentCache`). Its only real operation, `reset()`, was never exercised in production (the sole call site was gated behind a dev-only snapshot) and risks corrupting in-progress highlighting if called mid-batch — not ported forward without separate verification.

Interface: `cleanup(severity, resources) → { batchPerformanceHistory, memoryTrackerSnapshots }`, where `severity` is `'background' | 'elevated' | 'emergency'` and `resources` is `{ batchPerformanceHistory, memoryTrackerSnapshots, variableCache? }`. Pure per-call — no constructor-injected closures over engine state, unlike `DictionaryManager`'s constructor-time closure wiring (a shallowness finding from the same review) — callers pass current values in, get trimmed values back, and reassign. `variableCache.clear()` mutates the Map in place (no reassignment needed).

Triggered from two prod-live sources converging on the same `cleanup()` call: `memoryCoordinator`'s (`SmartMemoryCoordinator`) pressure callbacks (`onEmergency`/`onHighPriority`/`onBackground` → `'emergency'`/`'elevated'`/`'background'`), and a throttled every-5th-batch growth check inside the batch loop (`memoryTracker.detectLeaks()` → `'elevated'` on `isExcessive`). The growth check previously ran dev-only (gated on a snapshot only taken `if NODE_ENV === 'development'`) — now throttled instead of env-gated, so it's dev/prod consistent.

All 4 call sites route through one private method, `TranslationEngine.js`'s `_applyBatchMemoryCleanup(severity)` (added 2026-07-30, architecture review candidate #6) — previously each of the 4 sites hand-copied the same 3-line `cleanup()` + reassign-both-fields block. The reassignment (`this.batchPerformanceHistory`/`this.memoryTracker.snapshots` from the returned `trimmed` object) is the one thing that can regress silently — a future call site destructuring only one of the two fields — and had zero test coverage before this method existed: `BatchMemoryCleanup.test.ts` tests the pure class in isolation, never the wiring. `TranslationEngine.regression.test.js`'s `_applyBatchMemoryCleanup wiring` block now proves it on a real bare-constructed engine (`'emergency'` severity only — deterministic, doesn't need `MEMORY_THRESHOLDS` numbers; the trim policy itself stays covered by `BatchMemoryCleanup.test.ts`).

Entry point: `src/utils/memory/BatchMemoryCleanup.ts`, barrel-exported from `src/utils/memory/index.ts`. Sole caller: `TranslationEngine.js`'s `translateWithProgressiveBatches`, via `_applyBatchMemoryCleanup`.

## AdaptiveBatchSizer

The adaptive batch-size heuristic for `translateWithProgressiveBatches`: looks at the last 2 batches' `avgTimePerChunk` against the first batch's baseline, shrinks toward a floor of 3 on severe sustained degradation (>3x baseline), grows toward a ceiling of 5 when comfortably better than baseline (<0.8x) and past batch 1, logs-but-doesn't-resize on moderate degradation (2x-3x — this codebase's own history treats that range as memory-related overhead, not something batch size fixes). Extracted 2026-07-29 (architecture review candidate #1) — pure function, no engine state.

Interface: `calculateNextBatchSize({ batchPerformanceHistory, currentBatchSize, performanceBaseline, batchIndex }) → { batchSize, performanceBaseline, log }`, where `log` is `{ level, message } | null` for the caller to route through `this.log`.

Entry point: `src/utils/text/AdaptiveBatchSizer.ts`, barrel-exported from `src/utils/text/index.ts`. Sole caller: `TranslationEngine.js`'s `translateWithProgressiveBatches`.

## ProgressiveProgressReporter

Builds the `onProgress` payload for `translateWithProgressiveBatches`. Owns the debounce gate (time-since-last-update + every-3rd-batch + always-on-last-batch), metadata gap-filling with a shared frozen default object, and the deep-clone of semantic arrays / clickable segments before handing them to the caller's `onProgress`. The deep-clone is load-bearing, not decorative: React state updates receive direct references, and the next batch continues mutating the same arrays after React has already scheduled a render from them — without cloning, the clickable-highlighting UI can crash on an array-size mismatch against the text length it rendered against.

Interface: `buildProgressiveProgressUpdate(input) → { send: true, payload } | { send: false, log }`. Extracted 2026-07-29 (architecture review candidate #1) — pure function, no engine state.

Entry point: `src/utils/performance/ProgressiveProgressReporter.js`. Not barrel-exported from `src/utils/performance/index.ts` — that barrel's sole export is `performanceHealth` (ADR-030); `TranslationEngine.js` imports this module directly. Sole caller: `TranslationEngine.js`'s `translateWithProgressiveBatches`.

## WordSegmentMatcher

The greedy word-position matcher that maps each translated semantic unit onto its actual position in the final assembled output text, producing clickable word segments (`spacing` | `semantic` | `remaining`) in output order. Extracted 2026-07-29 from the tail of `translateWithProgressiveBatches` (architecture review candidate #1) — ~180 lines with its own documented bug history (an intransitive-comparator bug, fixed by sorting ALL same-length candidates by `tokenIndex`, not just same-translated-text ones) that had never had a dedicated test until this extraction.

Algorithm: build candidates from semantic-array entries with non-null translations → sort longest-first (prevents a short word matching inside a longer one), tie-broken by `compareByTokenIndex` for same-length candidates → find each candidate's first non-overlapping occurrence in the NFC-normalized, lowercased output text → re-sort by actual output position → build segments left-to-right.

Interface: `matchWordSegments(semanticArrays, outputText) → WordSegment[]`. Pure function — no engine state touched anywhere in the algorithm.

Entry point: `src/utils/highlighting/WordSegmentMatcher.ts`, barrel-exported from `src/utils/highlighting/index.ts`. Sole caller: `TranslationEngine.js`'s `translateWithProgressiveBatches`.

## useForceReloadContext / useTranslationExecutionContext

The typed-factory pair that replaces `Translator.jsx`'s two inline context object literals (`forceReloadCtx`, `executionCtx`) — architecture review 2026-07-29, candidate #3. `Translator.jsx` is intentionally JavaScript, never TypeScript (ADR-003) and carries no `@ts-check`, so `checkJs: false` means neither `ForceReloadContext` nor `TranslationExecutionContext` was ever compiler-checked at the point they were assembled, even though both interfaces already existed. Note: the architecture review's original claim that `destroyEngine` "bypasses `destroy()`" was verified false during grilling — it already called `engineRef.current.destroy()` before nulling the ref, matching the canonical teardown convention. The real gap was narrower: real shapes, unenforced assembly site.

Both hooks live in one file, **`src/hooks/useReloadExecutionContexts.ts`** (merged 2026-07-30, architecture review candidate #1 — previously two files, `useForceReloadContext.ts` and `useTranslationExecutionContext.ts`, each with its own near-duplicate guard). Merged because they're always called back-to-back from the same component for the same reason (`Translator.jsx:794`/`:826`) and were tested almost identically.

**`useForceReloadContext`** owns the `ForceReloadContext` interface (promoted here from a JSDoc `@typedef` in `useForceReload.js`, which now references it via `@typedef {import('./useReloadExecutionContexts.js').ForceReloadContext}`). Builds `cancelTranslations`/`destroyEngine` internally from primitive deps (`engineRef`, `cancelAllTranslations`, `isTranslatingRef`, `setIsTranslating`, `setProgressInfo`) — these were the only 2 fields previously hand-written as inline closures in `Translator.jsx`; every other field (`reinitializeEngine`, `retranslate`, the plain setters) is already a stable value from another hook, just passed through. Wrapping `cancelTranslations`/`destroyEngine` in `useCallback` here is a genuine stability improvement over the pre-extraction inline arrow functions (recreated every render) — `useForceReload`'s own `handleForceReload` doesn't list `ctx` in its dep array (documented "stable capability methods" convention), so this closes a latent staleness risk rather than introducing one.

**`useTranslationExecutionContext`** is assembly-only — all 9 fields of `TranslationExecutionContext` (real `interface`, owned by `useAutoTranslateTrigger.ts`, imported here) are already refs/setters from other hooks (`useDictionaryReloadGuard`, `useHighlightingState`, `useTranslationResults`, `useClipboardTranslation`). No logic to relocate; the hook just gives the assembly a checked call site. The dead `export type { TranslationExecutionContext }` re-export (zero external consumers — every real import goes straight to `useAutoTranslateTrigger.ts`) was dropped in the merge.

**Shared dev-only input-shape guard** (`createShapeGuard`, internal to the file — not exported): since `Translator.jsx`'s call sites are never type-checked, each hook validates its own inputs at the top through one generic guard factory instead of two hand-copied functions. Each hook still declares one canonical array of its expected key names (typed `satisfies readonly (keyof Params)[]` so a typo/renamed key is a compile error) — kept because checking only `Object.keys(params)` would miss a field dropped entirely from the call site, the actual failure mode this guard exists to catch. What the merge removed is the second, hand-maintained array per hook classifying each field as ref-vs-function: kind is now inferred from the `*Ref` naming suffix (both real param shapes obey it with zero exceptions). Throws in `development` on a mismatch (`process.env.NODE_ENV !== 'development'` short-circuits to a no-op in production). This is deliberately an input guard, not an output guard: the returned object's shape is already guaranteed correct by TypeScript inside the `.ts` file (it's built the same way every call), so the only real remaining risk is `Translator.jsx` passing a wrong-shaped argument — which is exactly what the guard catches.

Entry point: `src/hooks/useReloadExecutionContexts.ts`. Sole caller of both hooks: `Translator.jsx`.

## Transform Rule

A user-authored rule that auto-transforms a dictionary entry's Translation guess and stamps its `semanticType`, keyed off 1-4 leading or trailing Chinese characters of the entry's Source text. Introduced 2026-08-08 (wayfinder map "Suffix-Driven Transform Rules for Dictionary Quick-Add", ticket "Transform rule persistence and schema") to formalize a pattern the user was previously applying by hand via `WordTransformToolbar`.

Schema:

```ts
interface TransformRule {
  id: string; // stable identity — survives key edits
  matchKind: 'suffix' | 'prefix';
  key: string; // 1-4 Chinese chars, matched against the tail (suffix) or head (prefix) of Source
  charCount?: number; // optional exact total-Source-length constraint (not the key's own length)
  moveWords: number; // relocate-or-not toggle (0 = stay, >0 = relocate to opposite end) — never a literal word count, see below
  moveReplacement?: string; // if set, substitutes for the key's own glossed words instead of moving them verbatim
  capitalizeExceptN: number; // N words left lowercase
  semanticType: SemanticType; // stamped on the entry when this rule matches
  enabled: boolean;
  label?: string; // optional human note, e.g. "Nanjing-style city suffix"
}
```

`charCount` constrains the TOTAL Source text length, exact-match only — omitted means no constraint. Lets a rule target short names specifically (e.g. only 3-char sources ending in `城`) without also firing on long ones ending the same way. Distinct from `key`'s own 1-4 char cap.

**Matching precedence**: a `suffix` match always wins outright over a `prefix` match on the same entry — prefix rules are only even considered when no suffix rule matches at all. Within one `matchKind` pool, longest `key` wins on conflict. `(matchKind, key)` is unique at the persistence layer — two rules can't share both fields, but `"城"` can exist once as a suffix rule and once as a prefix rule simultaneously.

**Transform application order is fixed, not configurable**: the capitalize step always runs before the move step, on the original (pre-move) word order. This isn't an arbitrary choice — `titleCaseExceptLastN`'s "except last N" only means the intended words when applied before reordering; running it after `moveLastNWordsToBeginning` would target the wrong words. Traced from the canonical worked example: rough gloss `"nam kinh thành"` → `titleCaseExceptLastN(text, 1)` → `"Nam Kinh thành"` → `moveLastNWordsToBeginning(result, 1)` → `"thành Nam Kinh"`.

**Suffix rules reuse the existing tail-anchored helpers** (`titleCaseExceptLastN`, `moveLastNWordsToBeginning` in `src/utils/wordTransformHelpers.ts`). **Prefix rules have their own mirrored, head-anchored helpers** (`capitalizeExceptFirstN`, `moveFirstNWordsToEnd`) — `matchKind` selects which helper pair runs; the `moveWords`/`capitalizeExceptN` field pair is shared, not duplicated per direction.

**`moveWords` is always a boolean relocate/stay flag (changed 2026-08-15 — was a literal word count for plain moves before this).** The word-count actually moved (or, with `moveReplacement` set, replaced) is always `[...rule.key].length` (the key's own character count), never `rule.moveWords` directly. `moveWords > 0` relocates to the opposite end (`moveLastNWordsToBeginning`/`moveFirstNWordsToEnd`, or with `moveReplacement` set, `replaceLastNWordsWithText`/`replaceFirstNWordsWithText`); `moveWords === 0` leaves the words (or replacement text) in the key's own position (a no-op for plain moves, or `replaceLastNWordsInPlace`/`replaceFirstNWordsInPlace` with `moveReplacement` set). The Rules UI (`MoveModeToggle`) always renders a Stay/Move chip, never a numeric input — the two-mode numeric-vs-toggle UI this replaced was itself only 7 days old (added 2026-08-08 for `moveReplacement`) and confused the user into thinking it was a legacy/new-structure mismatch.

`moveReplacement` (added 2026-08-08, same session as the initial feature): substitutes custom text for the key's own glossed words instead of relocating them verbatim. Worked example: suffix key `山脉` (2 chars), gloss `"Thái Nhạc sơn mạch"`, replacement `"dãy núi"` — `moveWords: 1` (relocate) → `"dãy núi Thái Nhạc"`; `moveWords: 0` (stay) → `"Thái Nhạc dãy núi"`.

Storage: a dedicated file, Tauri-fs-synced the same way dictionaries are (own Rust read/write commands) — deliberately NOT folded into `appConfig.ts`'s `config.json`, both because Transform Rules are a growing list (closer in cardinality to dictionary entries than to `AppConfig`'s handful of scalar/short-list fields) and to sidestep `AppConfig`'s documented direct-Rust-write cache-invalidation landmine (see the `AppConfig` entry above) entirely rather than risk a third occurrence of it.

**Explicitly out of scope**: `patterns*` dictionaries. Source text there is a literal template containing an `X`/`Y` placeholder character rather than plain Chinese content, so "trailing/leading N Chinese characters" doesn't carry the same meaning — Transform Rules apply only to `phrases`/`properNouns*` entries.

**A matched rule's casing wins outright over `generateRoughTranslation`'s dictionary-type default** (title-case-all for `properNoun*`, lowercase-all otherwise), for both dictionary kinds — a rule match implies proper-noun-like content (it stamps `semanticType`) regardless of which dictionary the entry happens to be filed under. Mechanically this is moot for `properNoun*`: `titleCaseExceptLastN` unconditionally re-cases every word it touches, ignoring prior casing, so "replace" and "compose-after" produce identical output there. The real effect is on `phrases` (default lowercase-all) — a matching rule title-cases the non-suffix words there too, intentionally making a `phrases` entry read like a proper noun when a rule fires. Implementation: skip the dictionary-type-default casing step entirely when a rule matches; apply the rule's own `capitalizeExceptN` → `moveWords` sequence directly to the raw per-char gloss join instead.

**Rules tab authoring UI** (wayfinder ticket, resolved via `/prototype`): table-and-modal layout — dense sortable table (enabled toggle, up/down reorder, edit/delete per row), add/edit via modal dialog. Undo/reset for a wrong auto-applied guess belongs on the dictionary entry form itself (a revert icon next to the Translation field in `DictionaryEntry.tsx`), NOT on the Rules tab. Duplicate `(matchKind, key)` conflicts: inline form error naming the colliding rule, Save blocked until resolved. Three full variant mockups (this one plus a master-detail and a card-grid layout) are preserved on the throwaway branch `prototype/rules-tab-ui` for reference — not on `main`.

**Apply-path lives in `TransformRuleEngine.ts`, not the Quick-Add form hook** (moved 2026-08-12, architecture review grilling): `joinCharGloss`, `generateRoughTranslation`, and `computeInitialTranslation` are plain functions in that file taking `dictionaries`/`rules` as explicit params — no React dependency, same module as `findBestMatch`/`applyRule`/`findConflict`. `useDictionaryEntryForm.ts` (the Quick-Add form) is the sole caller, and loads rules via the shared `useTransformRules()` hook (the same one `RulesManager.tsx` uses) rather than a private loader — previously it hand-rolled its own `loadTransformRules()` effect, a second implementation of the same load `RulesManager` already owned.
