# Domain Glossary

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

## DictionaryTrie

The per-dictionary lookup structure. A prefix trie where each node owns `children: Map<char, TrieNode>`, `isEndOfWord`, `translation`, and `metadata`. Core operations: `insert`, `get`, `getWithMetadata`, `findMatches` (all prefix matches from a position), `findLongestMatch`, `getWithPrefix` (DFS collect).

Owns its own structural health: `validateIntegrity()` detects circular references, orphaned nodes, missing translations, and size mismatches; `repair()` fixes size mismatches and removes orphans; `getHealthScore()` produces an A–F grade. `dispose()` is mandatory before discarding an instance — recursively nullifies all node references for GC.

`TrieNode` is exported from the same file so `DictionaryTrieLoader` can reconstruct cached tries without passing constructor references at the call site.

Entry point: `src/utils/dictionary/DictionaryTrie.js`. Consumed by `DictionaryManager` (one `DictionaryTrie` per loaded dictionary) and `DictionaryTrieLoader` (cache hit/miss reconstruction).

## VocabularyWarmup

The warmup strategy for novel-specific vocabulary. Owns three pure concerns: (1) `extractHighFrequencyVocabulary(dictionary, dictionaryName)` — DFS traversal of a `DictionaryTrie` root, collecting up to 50 entries sorted by word length (shorter = higher priority); (2) `generateCharacterCombinations(vocabularyEntries)` — cross-products each short proper-noun character with the top 5 function words (`的 了 在 说 看`), capped at 30 pairs; (3) `warmNovelSpecificVocabulary(dictionaryManager, activeProperNouns, limits, cache)` — orchestrates (1) and (2) per dictionary, writes results into `cache` via `setCharacter` and `setPhrase`.

No cache state owned — `warmNovelSpecificVocabulary` receives `cache` as an injected dependency. Testable by passing a stub `{ setCharacter, setPhrase }` object without constructing a real `TranslationCache`.

Entry point: `src/utils/dictionary/VocabularyWarmup.js`. Called from `TranslationCache.preWarmNovelSpecificVocabulary` (which now delegates entirely). Also exported from `src/utils/dictionary/index.ts` for direct use.

## DictionaryBackend

The IO module for dictionary persistence. Owns the load protocol: parallel batch load via `loadDictionariesParallel` → serial retry for cold-launch failures (file lock, Rayon thread pool warmup, OS read pressure) → classification of still-failed IDs. Returns raw (unsorted) data; callers own sorting, toasting, and React state.

Interface: `loadAllDictionaries(dictionaryIds: string[]): Promise<BatchLoadResult>` where `BatchLoadResult` carries `loadedDictionaries` (all IDs present; failed IDs initialized to `{}`), `stillFailedIds`, and `total`.

No React, no toast, no sorting. Testable as a plain async function — stub `window.electronAPI` and verify retry+classification behavior directly without mounting the provider.

Entry point: `src/utils/dictionary/DictionaryBackend.ts`. Called exclusively from `loadInitialState` in `DictionaryContext.tsx`.
