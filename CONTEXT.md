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

## PerformanceHealth

Unified gateway for performance monitoring concerns — the single import callers need for both writing timing data and reading health status.

**Write:** `recordTranslation(operationTimeMs)` — records a completed translation into `globalPerformanceMonitor`. Callers don't construct synthetic timers or import `globalPerformanceMonitor` directly.

**Read:** `getReport(cacheHitRate)` — combines `globalPerformanceMonitor` (timing metrics) and `systemPerformanceMonitor` (baseline regression tracking) into one `HealthReport`: `{ operations, avgTime, cacheHitRate, status, criticalAlerts, warningAlerts, baselines, verdict, wasm }`. `verdict` synthesizes `status` into `'ok'` (healthy), `'degraded'` (warning), `'critical'`. `wasm` aggregates WASM processor availability: `{ pattern: { available, failed }, number: { available }, anyFailed, allAvailable }` — the single place to ask "is WASM the cause of degraded performance?" without importing from individual processor modules.

Health is assessed at action time — after translate or after reload — not on a polling interval.

Entry point: `src/utils/performance/PerformanceHealth.js`, re-exported from `src/utils/performance/index.ts`.

## SystemPerformanceMonitor

The background regression detector that owns the periodic integration of all subsystem metrics into `PerformanceBaselineTracker`. Owns: four integration adapters (global performance monitor, position cache, virtual scrolling, WASM memory pool), metric collection loop, memory inspection, and `getSystemHealthReport()`. Delegates baseline storage to `PerformanceBaselineTracker` — callers use `systemPerformanceMonitor.recordPerformance(operationType, metrics)` rather than reaching through `.baselineTracker`.

Entry point: `src/utils/performance/SystemPerformanceMonitor.js`.

## PerformanceBaselineTracker

Owns the statistical baseline and trend state for all operation types. Manages: `performanceHistory[]`, `baselines` Map (LRU, cap 100), `trends` Map (LRU, cap 200), `alerts[]` (cap 50). Public API: `recordPerformance(operationType, metrics)`, `getHealthSummary()`, `exportData()`, `destroy()`, `reset()`. Has no dependency on any other monitoring module — only imports `logger`.

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

## DictionaryHealthMonitor

Diagnostic tool for trie structural health. Wraps the `validateIntegrity()`, `getHealthScore()`, and `repair()` methods of every loaded `DictionaryTrie` into four aggregate operations: `validateAllDictionaries()`, `repairAllDictionaries()`, `getDictionaryHealthReport()`, and `monitorDictionaryHealth(name, frequency)`. Never called in production — dev/diagnostic import only.

Injected dependencies: `getDictionary(name) → DictionaryTrie|null`, `getDictionaryNames() → IterableIterator<string>`. Both are satisfied by the two same-named accessors on `DictionaryManager`.

Entry point: `src/utils/dictionary/DictionaryHealthMonitor.js`. Not wired into any production dependency graph — import directly when diagnosing trie corruption.

## DictionaryTrie

The per-dictionary lookup structure. A prefix trie where each node owns `children: Map<char, TrieNode>`, `isEndOfWord`, `translation`, and `metadata`. Core operations: `insert`, `get`, `getWithMetadata`, `findMatches` (all prefix matches from a position), `findLongestMatch`, `getWithPrefix` (DFS collect).

Owns its own structural health: `validateIntegrity()` detects circular references, orphaned nodes, missing translations, and size mismatches; `repair()` fixes size mismatches and removes orphans; `getHealthScore()` produces an A–F grade. `dispose()` is mandatory before discarding an instance — recursively nullifies all node references for GC.

`TrieNode` is exported from the same file so `DictionaryTrieLoader` can reconstruct cached tries without passing constructor references at the call site.

Entry point: `src/utils/dictionary/DictionaryTrie.js`. Consumed by `DictionaryManager` (one `DictionaryTrie` per loaded dictionary) and `DictionaryTrieLoader` (cache hit/miss reconstruction).

## DictionaryEntryFlattener

Converts raw dictionary JSON directly into the flat `{chinese, vietnamese, metadata}[]` shape `RustLookupIndexManager` sends to the Rust lookup-index builder (`build_lookup_index` in `src-tauri/src/dictionary_commands.rs`, which builds its own `lookup_index_engine::TrieNode` from the flat entries — a third, distinct trie type from both `DictionaryTrie` and `wasm-core::trie::TrieNode`).

Replaces a former trie-walk: `RustLookupIndexManager.extractEntriesFromTrie` used to reverse-engineer this same flat shape by DFS-walking an already-built `DictionaryTrie`, carrying a `MAX_DEPTH` recursion guard and a dev-only cycle detector — defensive machinery that existed only because a live trie was being treated as untrusted structure to walk. `DictionaryManager` now builds flat entries directly from the same raw JSON it reads to build the trie, once at dictionary-load time, and retains them in `this.flatEntries` — no walk, no cycle risk, nothing to guard against.

Per-entry `metadata` intentionally omits the derived `priority`/`frequency`/`dictionary` fields `DictionaryManager`'s trie-insert loop computes for `DictionaryTrie` nodes — every reader of trie-node metadata was grepped and none read those fields; Rust treats `metadata` as an opaque passthrough string. Only whatever the source dictionary JSON itself provides (e.g. `allowAsPatternVariable`, `semanticType`) is carried through.

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

## TextTokenizer

The Phase-0 tokenization seam: splits raw input text into `Token[]` (type, value, start, end) before the 5-phase pipeline runs. Two adapters behind one interface (`tokenize(text): Token[]`): `WasmTextTokenizer` (Rust `tokenize_text_core`, direct character classification, 3-8x faster) tried first; JS regex-based `tokenizeJS` (private method) as fallback, used whenever WASM hasn't finished its async init or a WASM call returns `null`.

Both adapters classify characters into the same 7 `TokenType`s, but with one deliberate, tested divergence: **token count for runs of consecutive punctuation/unknown characters**. JS's regex catch-all (`[^\w\s一-鿿]+`) groups a run into one token (`"……"` → 1 token); Rust's classifier processes one character at a time for anything outside `is_chinese_char`/`is_latin_letter`/`is_digit`/whitespace (`"……"` → 2 tokens). Kept as one-token-per-char on the Rust side deliberately — the punctuation dictionary is single-char-keyed only, so per-char tokens avoid the dictionary-translate prefix-match truncation risk (`cleanupFormatting`'s 27-char list note). Both sides are directly tested (`text_tokenizer.rs`'s `mod tests`, `TextTokenizer.test.ts`) documenting the accepted difference, matching this codebase's existing `needsSpace()`/`needsSpace()` JS/Rust parity-by-tests-not-shared-runtime convention.

Prior to 2026-07-17c, Rust's punctuation classifier was a finite enumerated char list that was missing 20 of the 41 characters in the real `punctuation.json` dictionary (including `…` and dialogue corner brackets `「」『』`) — those chars fell through to `unknown` in WASM while JS correctly typed them `punctuation`, a type mismatch (not just a count mismatch) that had already caused one confirmed production bug (a `TranslationEngine.js` spacing rule needed an allowlist workaround specifically because of it). Fixed by replacing the enumerated list with a catch-all classifier — see `wasm-core/CLAUDE.md`.

**Residual, deliberately-uncharacterized-not-unified divergences** (JS regex/`\w` semantics vs Rust char-predicate ranges are two independent classifiers, not one shared source of truth — the catch-all fix closed the specific gap that was biting production, not every possible Unicode disagreement): (1) CJK Extension A (U+3400–4DBF) / Compatibility Ideographs (U+F900–FAFF) — Rust's `is_chinese_char` covers 3 ranges, JS's regex chinese group only checks `一-鿿` (CJK Unified), so these classify `chinese_char` in Rust vs `punctuation` in JS; (2) underscore `_` — JS's `\w` excludes it from every capture group including the punct catch-all, so it hits `tokenizeJS`'s gap-fill path and becomes `unknown`, while Rust's catch-all has no `\w`-shaped exclusion and types it `punctuation`; (3) BOM U+FEFF — ECMAScript's `\s` matches it per spec, Rust's `char::is_whitespace()` doesn't (not in Unicode `White_Space` property), so JS types it `whitespace` vs Rust's `punctuation`. All three are low-practical-risk (none appear in normal Chinese-novel text) and are characterized in tests on both sides (`text_tokenizer.rs`'s `mod tests`, `TextTokenizer.test.ts`) rather than fixed.

Entry points: `src/utils/text/TextTokenizer.ts` (JS-facing class, owns the WASM-first/JS-fallback dispatch), `src/utils/wasm/WasmTextTokenizer.js` (thin WASM wrapper), `wasm-core/src/text_tokenizer.rs` (`tokenize_text_core` — plain-Rust core, `tokenize_text` — thin `#[wasm_bindgen]` wrapper around it).

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
