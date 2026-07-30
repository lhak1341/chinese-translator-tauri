# src/utils — Gotchas

## TranslationEngine Internals

### `destroy()` Is Canonical Engine Teardown — Call Before Nulling `engineRef.current`

Stops `memoryCoordinator` intervals, clears `processedBatchCache`, `semanticArrayBuilder`, `semanticPatternProcessor.variableCache`, and `dictionaryManager` caches. `useForceReload` is the sole production caller. Do not re-introduce manual cache clearing in reload paths — route through `destroy()` instead.

### Segment Cleanup Has a Synchronous Hard Ceiling — Do Not Re-Add a Caller-Side Watchdog

`MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER` (75) cleanup is idle-deferred (`requestIdleCallback`/`setTimeout`) and `SmartMemoryCoordinator`'s backstop is pressure-reactive (10s sampling) — neither deterministically bounds `translationSegments.length`. `SEGMENT_CLEANUP_HARD_CEILING` (100) closes the gap: the push site trims synchronously once crossed, no idle wait. `Translator.jsx` had a caller-side watchdog reaching into `engineRef.current.translationSegments` with hardcoded 100/35 to cover this exact gap — deleted 2026-07-24 now that the engine enforces its own invariant. Do not re-add it; if segments are ever observed exceeding 100, the bug is in the engine's own cleanup, not something to patch from Translator.jsx.

### `engine.initialize()` Requires `options.activeProperNouns` from Caller

Does NOT read config from disk — uses `options.activeProperNouns || ['properNouns']`. If caller omits it, silently falls back to `['properNouns']` and `getFilteredDictionaries` drops all `properNouns-*` novel dicts — names go un-capitalized with no error. Both call sites are inside `useTranslatorEngine.js`: initial load passes `activeProperNounsFromConfig` state; force reload uses `reinitialize(forceConfigReload: true)` which reads fresh config internally.

### `addUnit` Third Arg Must Be a Valid `PHASE_PRIORITIES` Key

Common wrong values (all silently return priority 999 — below the character fallback):

- `'patterns'` (plural) — correct is `'pattern'` (singular)
- `'numbers'` — correct is `'number_conversion'`
- `'passthrough'` — pass-through NUMBER/LATIN_WORD tokens use `'characters'`
- `match.dictionary` (at phrase call sites) — correct is `'phrases'`; pass `match.dictionary` as arg 6 (the `dictionary` metadata field)

`validateConsumedTokenContract` detects consumed sources with `.includes('_consumed')` — this predicate must match `getSourcePriority`'s check exactly.

### `SemanticArrayBuilder` Is the Single Builder — No Sync Required

`src/utils/highlighting/SemanticArrayBuilder.ts` is the only implementation. The old `SemanticArrayBuilder` / `OptimizedSemanticArrayBuilder` sibling pair was deleted (Session 39). No field-sync requirement exists. Add fields to `SemanticArrayMetadata`, initialize in `addUnit()`, handle in `setPositionByMatch()` — done.

### `addUnit` Requires All 6 Args at Every Call Site

Signature: `addUnit(originalText, translatedText, source, tokenIndex, phase, dictionary)`. The `phase` and `dictionary` args (5 and 6) are metadata — they don't affect priority, but omitting them silently leaves provenance fields `null` for every entry, making debugging and future priority-aware scans unreliable.

- **Direct call sites** (hierarchical, phrase, number phases): pass `phase` and `dictionary` explicitly.
- **`processChunksInParallel` merge loop** (~line 7023): correctly passes all 6 args from `isolatedArrays.metadata?.[j]`. After adding a new field to `addUnit`, propagate it through this merge loop too.
- The `phase` arg (5th) is a **string label** (`'pattern'`, `'phrases'`, etc.), not a number — passing a number silently records wrong provenance with no error.

See `SemanticArrayMetadata` in `SemanticArrayBuilder.ts` — `phase`/`dictionary` are tagged there as provenance-only, zero real readers today (architecture review 2026-07-30, candidate #5 grilling).

### Duplicate-Word Highlighting Requires `tokenIndex` Ordering

Root cause — `processChunksInParallel` assigns semantic array indices by chunk completion order, not text order. `compareByTokenIndex(a, b)` / `resolveTokenIndex(tokenIndex)` in `src/utils/highlighting/TextPositionMapper.ts` (barrel-exported) are the single ordering rule: missing/negative tokenIndex sorts last. Three sort/tiebreak sites use it:

1. **Full Translation word-level builder** (`TranslationEngine.js`, `candidateWords.sort`): tiebreak by `compareByTokenIndex` for same-length candidates.
2. **Original Chinese panel** (`SegmentPrecomputer.ts`, `precomputeOriginalSegments`): sorts `firstCharIndex` candidate lists via `compareByTokenIndex`; also used for the word-level `filteredUnits` sort earlier in the same file.

**`CharacterOnlyBridge.ts`'s `occurrenceInSource` count is NOT a sort** — it's a linear scan with its own dual-sided fallback (`i < sourceIndex` when tokenIndex is missing on either side). Different shape, does not use `compareByTokenIndex`; do not try to force it through the shared comparator.

Any new sort over the semantic array by text position should use `compareByTokenIndex`, not a hand-rolled comparator — a prior hand-rolled version already caused an intransitive-comparator bug (see the CRITICAL FIX comment above `candidateWords.sort` in `TranslationEngine.js`), and a second hand-rolled copy in `SegmentPrecomputer.ts` disagreed with it on the missing-tokenIndex fallback (`?? 0` vs `?? Number.MAX_SAFE_INTEGER`) until unified.

See `SemanticArrayMetadata` in `SemanticArrayBuilder.ts` — `tokenIndex` is tagged there as the one field genuinely consumed by both highlighting paths (architecture review 2026-07-30, candidate #5 grilling).

### `getSemanticTokens` Requires `TextToken[]`, Not a String

`getSemanticTokens(chunk.content)` silently returns `[]` because `chunk.content` is a string. When computing chunk token counts for `chunkOffset` in `processChunksInParallel`/`translateWithChunking`, always call `this.tokenizer.tokenize(chunk.content).length`. Using the wrong call zeros all cross-chunk token offsets, breaking same-translated-text disambiguation.

### `tokenCharPositions` Must Use `originalValue` for Phrase Leaders

In `postProcess`, the `tokenCharPositions` loop must use `tokens[i].originalValue ?? tokens[i].value` — phrase processing sets `tokens[K].originalValue = tokens[K].value` (e.g., `"部"`) then mutates `tokens[K].value` to the full word (`"部分"`). Using `.value` double-counts and shifts all subsequent `originalStart` positions by the consumed-token count.

### `token.start` Is a Byte Offset, Not a Char Offset

Chinese chars are 3 bytes each, making `token.start` ~3× too large for char-position arithmetic. In `postProcess`, use cumulative `tokenCharPositions`: `tokenCharPositions[i] = sum of tokens[0..i-1].value.length`.

### `buildSegmentsFromPositions` Fires Only When ALL `metadata[].originalStart >= 0`

Since the parallel merge loop drops `originalStart`, this path never activates for multi-chunk translations — only for single-chunk (short) texts. Fixing the merge loop can trigger "no highlighting" regression if the path has latent bugs — test both short and long texts separately before enabling.

See `SemanticArrayMetadata` in `SemanticArrayBuilder.ts` — `originalStart`/`originalEnd` are tagged there as char-only-exclusive, not consumed by the full-translation path at all (architecture review 2026-07-30, candidate #5 grilling).

### Phase 2 Proper Noun Lookahead

`applyDictionaryTranslation` defers a match at position i if any position j ∈ [i+1, i+tokenSpan) has a
dictionary match that is **strictly longer** than the current match. Prevents "日元" (2 chars at i=1) from
consuming 元 needed by "元始圣人" (4 chars at i=2). Same-length matches at a later position do NOT trigger
deferral — earlier start wins (e.g. 孔宣 beats 宣兄 when both are 2 chars). Applies to both shared-index
and fallback paths.

### `resolveGlobalConflicts` and `resolveMatchConflicts` Are Siblings With Intentionally Inverted Priority

`resolveMatchConflicts` (Phase 2, ~line 2383): patterns beat regular phrases at equal length. `resolveGlobalConflicts` (Phase 4, ~line 2686): phrases beat patterns at equal length (Phase 1 pattern tokens are already consumed by Phase 4). Do NOT harmonize them — the inversion is architectural. Algorithm changes must be mirrored in all three: `resolveMatchConflicts` JS, `resolveGlobalConflicts` JS body (delegates to `WasmConflictResolution.js`), and `wasm-core/src/conflict_resolution.rs::run_conflict_resolution`.

### `cleanupFormatting()` Has Two Branches and Cannot Be Migrated to WASM

Always does 27-char dictionary-lookup punctuation translation first (calls `this.dictionaryManager.translate()`). Then branches: `options.useChunking !== false` → simple spacing fix + early return; `else` → also applies space-after-punctuation rules and colon-quote handling. The dictionary loop is the blocking constraint. Do not duplicate this logic elsewhere — it is the single authoritative post-assembly cleanup step in `postProcess()`.

### `cleanupFormatting` 27-char List — `translate()` Is Prefix-Match, Not Exact

`this.dictionaryManager.translate(key, ['punctuation'])` returns the longest prefix match, not an exact-key lookup. A multi-char entry like `'……'` that has no exact dict entry will match the 1-char prefix `'…'` and replace the 2-char string with the 1-char translation (silently dropping a char). Only add multi-char keys to the 27-char list if they exist as literal entries in the punctuation dict.

### `processCharacterOnlyTokens` Punctuation Branch — Partial-Match Guard

`findLongestMatchAtPosition` on a multi-char punctuation token (e.g. `'……'`) returns a shorter match than the token's full value. Guard before calling `applyMatchToTokens`: `match.word.length >= token.value.length`. Without this, `token.translated` gets the sub-translation and the remaining chars are lost.

### char-only Space-After-Chinese-Char Uses Allowlist (Not Denylist)

WASM tokenizer assigns type `unknown` to some chars (`…`, `》`). The space rule after `chinese_char` is allowlist-only: add space when next token is `chinese_char`, `latin_word`, `TokenType.NUMBER`, or opening-element punctuation. A denylist `!== 'punctuation' && !== 'whitespace'` treated `unknown`-typed tokens as content and added spurious spaces.

### `cleanupFormatting` Else-Branch `^` Capitalization Requires `!isParallelChunk` Guard

When `isParallelChunk: true` (each parallel chunk runs with `useChunking: false`), the `^` rule capitalizes every chunk's first letter independently — overrides `applySmartCapitalization` context. Guard: `if (!options.isParallelChunk)` wraps the `^` replace. Do not remove this guard.

### WASM vs JS TextChunker: Different Chunk Structures for Consecutive Punctuation

`WasmTextChunker.test.js`'s only content-asserting tests (`should produce same...`) are gated `skipIfNoWasm` and silently no-op if WASM fails to init in the test runner — a passing test _file_ here isn't proof the JS-only path or WASM/JS parity is actually exercised. See `TextChunker.test.js` for unconditional JS-only coverage (mocks `wasmTextChunker` out to force the JS path deterministically).

**Corrected 2026-07-29 — the previous worked example here was wrong; verified directly against `TextChunker.chunkText()` output (WASM mocked out to force the JS path), see `TextChunker.test.js`.** The JS chunker's char-loop only flushes a chunk when a content char follows accumulated punctuation, or at end-of-input — mid-text punctuation always merges onto the still-open preceding chunk, it does NOT split into a separate empty chunk. `chunker.chunkText('道：「说')` actually produces `[{content:"道", punctuation:"：「", startedBy:"start"}, {content:"说", punctuation:"", startedBy:"：「"}]` — one merged punctuation field, same shape a naive reader would expect from WASM's accumulation behavior.

The real trigger for a **separate empty-content chunk** is **leading punctuation** (punctuation with no preceding content in the current text, e.g. `《标题》内容` → first chunk is `{content:"", punctuation:"《", startedBy:"start"}`) — not mid-text consecutive punctuation. `fixAngleQuotePositioning`/`applySmartCapitalization`'s empty-chunk handling (see `ChunkPostProcessor.js` and the entry below) should be understood against this corrected trigger condition, not the old mid-text example.

### `「` (U+300C) Is Not an Opening Quote — `fixAngleQuotePositioning` Skips It

`QuoteProcessor.isOpeningQuote(‘「’)` returns false. `fixAngleQuotePositioning` fires for `《`, `〈`, and curly quotes (`”`, `’`, etc.); uses `chunk.translatedPunctuation || fallback` so Punctuation dict mappings (e.g. `《→«`, `〈→<`) survive. A JS-chunker leading-punctuation empty chunk (see corrected trigger condition above) with `punctuation="「"` is silently skipped — colon context in its `startedBy` is NOT propagated to the content chunk by this function. The fallback block in `applySmartCapitalization` (checking `chunks[i-1].content.trim() === ""`) handles this instead.

### Extending Quote Types: Cascade Points

Adding chars to `QUOTE_CATEGORIES.OPENING/CLOSING` auto-cascades to `PunctuationProcessor.OPENING_PUNCT/CLOSING_PUNCT`; manually update `TranslationEngine.js capitalizationRules` dict and both `ChunkPostProcessor.js startsWithClosingElement` regex occurrences.

### `PunctuationProcessor.processSequence` `endsWithOpeningQuote` Guard

WASM combines consecutive punctuation like `”《` into one field `’”«’`; `fixAngleQuotePositioning` skips it (not a bare single `《`). Without `!endsWithOpeningQuote` in `needsTrailingSpace`, `processSequence` appended trailing space after `«`, landing between quote and content.

### `checkSemanticArrayCorruption` Uses `corruptionToastShown`

A translation-scoped `let corruptionToastShown = false` guards `toast.error` to at most once per translation. `isCorrupted` is sticky across all 5 phase checks. Any new call site that toasts on `isCorrupted` must reuse this flag.

### `buildVariableCache` Delegates to `PatternVariableCache.buildPatternVariableCache`

`SemanticPatternProcessor.buildVariableCache` and `TwoPhasePatternProcessor.buildVariableCache` both delegate the four shared lookup stages (proper noun tokens, phrase lookups, proper noun single-token, full-text scan) to `src/utils/pattern/PatternVariableCache.js`. Changes to phrase type handling or the full-text scan guard go in `PatternVariableCache.js` only — no mirroring required.

Adapter-specific logic that stays in each file: Semantic's Phase A result injection (seeded as lowest-priority `initialCache`); TwoPhase's step-1b pattern-translated tokens (`patternSemanticType`, runs AFTER shared stages so it overrides stage-1 proper-noun entries for the same word); type resolution strategy (Semantic imports `classifyVariableType` from `VariableTypeClassifier.ts`; TwoPhase uses `metadata?.semanticType` with inline fallback). Canonical phrase type fallback: `metadata?.semanticType || 'concept'` (NOT `'phrase'`). Semantic token types: `chinese_char`, `chinese_word`, `latin_word`, `number`. Fiction dicts (`properNouns-f_*`) contain ALL SemanticType values — do not assume character-only; `metadata.semanticType` is authoritative, heuristic only fires when absent.

### `buildVariableCache` `shouldInclude` Requires `hasUnconstrainedPatterns` Guard

`requiredTypes` collects all types in any pattern's `allowedVariableTypes`. Filtering by `requiredTypes` is only correct when ALL patterns are constrained — any unconstrained pattern accepts any type, so filtering would silently exclude entries it needs. Guard: `if (!requiredTypes || hasUnconstrainedPatterns) return true;`.

### Phrase Followers vs Pattern-Consumed Tokens: `isGrouped` Is the Discriminator

Both types have `groupLeader` set, but they differ:

- **Phrase follower**: `groupLeader = N`, `isGrouped = true`, `translationSource = 'phrases_consumed'`
- **Pattern-consumed**: `groupLeader = N`, `isGrouped` unset, `translationSource = '*_consumed'`

Code filtering by `groupLeader` alone conflates both. `getTextFromTokens` and `getSemanticTokens` use `isGrouped && groupLeader !== null` to exclude only phrase followers. Pattern-consumed tokens must stay in `getTextFromTokens` output so text aligns with tokenizer-cached `.start` positions — stripping them shifts phrase lookup offsets for every token after the gap.

### `SemanticPatternProcessor.processTokens()` Returns Results — Do Not Ignore

Returns `Promise<PatternProcessorResult[]>`. Callers MUST capture the return value and pass it to `applyHierarchicalResults(tokens, results, options)`. Ignoring the return silently drops all JS pattern translations — no error, tokens fall through to phases 4/5.

Separate invariant: `createOptimalPhraseGroups` (Phase 4) checks only `enableTwoPhasePatterns`, NOT `patterns?.length` — phrase processing is pure JS and runs regardless of whether structural patterns are loaded. Do NOT re-add the `patterns?.length > 0` guard.

### `isWasmPatternProcessorReady()` Is the Canonical Pattern Processor Check

Use `isWasmPatternProcessorReady()` from `wasm/WasmPatternProcessor.js` — combines `isWasmPatternProcessorAvailable() && !hasWasmPatternProcessorFailed()` in one call. Do NOT compose the two functions at call sites.

### `PatternFailureTracker` Owns Pattern Failure State

`src/utils/pattern/PatternFailureTracker.js` owns `_count`, `_lastSuccessTime`, and retry `_warningShown`. Do NOT add `patternFailureCount` / `lastPatternSuccessTime` back to the engine. Engine's `_wasmInitWarningShown` is separate — it guards the WASM init-failure toast, not retry warnings.

### `.trie.json` Files Are JS Map Cache, Not WASM

`*.trie.json` in the dictionaries folder are written by `PrecomputedTrieCache.js` — they cache the JS Map-based trie, not anything WASM-related. Do not delete them; they speed up cold starts.

### `DictionaryManager` Trie-Node Metadata Is Not Uniform Across Load Paths

3 separate code paths build tries with 3 different per-entry `metadata` shapes: the main load loop's fallback (`DictionaryManager.js`, enriches with `priority`/`frequency`/`dictionary`), `DictionaryTrieLoader`'s internal cache-miss build (raw JSON `target` only, no enrichment), and `lazyLoadDictionary` (no metadata at all). Harmless today — grepped every reader, nothing reads per-entry `priority`/`frequency`, and Rust treats trie-node `metadata` as an opaque passthrough string — but do not assume trie-node metadata is uniform or complete across dictionaries.

### `applyHierarchicalResults` Has No Overlap Check — Do Not Add One

`applyHierarchicalResults` applies WASM results directly without deduplication. Do NOT add overlap checking there — `select_optimal_results` in `wasm-core/src/pattern_processor/two_phase.rs` guarantees non-overlapping results before they reach JS. Adding a JS-side dedupe would mask WASM selection bugs instead of surfacing them.

### `applyHierarchicalResults` (Phase 1) Does Not Set `isGrouped` or `groupedWith`

Phase 1 marks `translationSource`, `translated`, and `groupLeader` on tokens. `isGrouped` stays `false`; `groupedWith` stays `[]`. Detecting a Phase 1 leader: `translated !== null && translationSource && !translationSource.endsWith('_consumed')`. Do NOT use `isGrouped` or `groupedWith.length` — they are always `false`/`0` for Phase 1 output.

### `applyMatchToTokens` Orphan-Release Loop Must Not Be Removed

When Phase 2+ overwrites a Phase 1 leader token, the orphan-release code in `applyMatchToTokens` (immediately before marking followers `*_consumed`) scans forward from `startIndex + tokenSpan` and resets consecutive orphaned `*_consumed` followers to unprocessed state. Without it, Phase 2's skip guard and `postProcess` silently drop those tokens — violating the hard "never omit content" contract.

### `postProcess` Orphan Safety Net Must Not Be Collapsed to `continue`

The `else if (token.translationSource)` branch contains an orphan-recovery path: consumed Chinese tokens whose `groupLeader === null` (released by orphan-release) or whose leader has `translated === null` are recovered via char dict fallback instead of skipped. Do NOT replace with `continue`. **Every phase must set `groupLeader = startIndex` on consumed tokens at the mark site** — `=== undefined` (never set) also triggers char-fallback, silently corrupting every multi-token match from that phase. `applyMatchToTokens` (Phase 2/4), `applyHierarchicalResults` (Phase 1), and `NumberProcessor.applyConversionResult` (Phase 3 JS) all set it. Phrase grouping (`createPhraseGroups`, `processRemainingPhrasesSequential`, `processRemainingPhrasesParallel`) sets it via the shared `markPhraseFollowersConsumed` (`src/utils/pattern/PhraseConsumptionMarker.ts`) — do not hand-roll the mark-as-consumed loop at a new phrase call site, call this instead. `copyWasmTokens` does NOT copy `groupLeader` — WASM-path phases need a post-`copyWasmTokens` sweep.

### WASM Wrapper Retire-After-Panic

Any `Wasm*.js` `catch` block for a WASM call must immediately do `this.obj = null; this.initialized = false; this.initializationFailed = true`, and `initialize()` must guard `if (this.initializationFailed) return false`. Once `panic = "abort"` fires, the WASM object's `borrow_mut_count` is permanently stuck — silently retrying it produces "recursive use" on every subsequent call. **Exception**: `WasmConflictResolution.js` is a module-level singleton (no class) — retire uses bare `initialized = false; initializationFailed = true` (no `this.*`). **Exception**: `WasmPatternProcessor.js`, `WasmStringProcessor.js`, and `WasmTextChunker.js` use `WasmProcessorLifecycle` — on a runtime panic call `lifecycle.permanentlyFail()`, NOT `lifecycle.reset()`. `reset()` clears `_hasFailed`, allowing re-init from the same corrupted binary; `permanentlyFail()` blocks it permanently.

**`instance = null` without `.__destroy_into_raw()` first leaves FinalizationRegistry active.** Stale callback fires when dlmalloc reuses the freed Rc address for a new instance → next method call panics (`alloc/rc.rs hint::assert_unchecked(strong != 0)`). Always `instance?.__destroy_into_raw()` before every `instance = null` in any `Wasm*.js` wrapper. Use `__destroy_into_raw()` (JS-only cleanup, safe post-panic), NOT `.free()` (calls into WASM, unsafe after `panic = "abort"`).

**`translation_wasm_core.d.ts` is auto-generated** — the linter reverts manual additions on next format. `__destroy_into_raw` is absent from the generated types; suppress TS2339 with `// @ts-ignore` on the call line, not by editing the `.d.ts`.

### All 5 WASM Wrappers Share One Binary — Cascade-Retire Required

All 5 wrappers (PatternProcessor, TextAssembler, TextChunker, DictionaryManager, ConflictResolution) share `translation_wasm_core.js`. Any panic permanently corrupts the shared linear memory (`dlmalloc` state). Every primary panic catch must cascade-retire all other wrappers before returning. WasmConflictResolution fires at TWO pipeline points: Phase 2 (before NumberProcessor) and Phase 4 (after DictionaryManager) — it must appear in every cascade. Circular dep constraint: `WasmTextChunker` imports `WasmDictionaryManager`; `WasmDictionaryManager` therefore cannot import `WasmTextChunker` (TC→DM→TC circular).

### WASM Singleton Modules Must Call `.initialize().catch(warn)` at Module Bottom

Any `src/utils/wasm/Wasm*.js` that exports a singleton must trigger background init at import time. Missing this forces every first caller onto the slow JS fallback path. **Exception — `WasmPatternProcessor.js`**: exports functions, not a singleton; its module-bottom prewarm is a self-calling IIFE that only warms the ES module cache via `fetchWasmBinary`.

### `WasmMemoryPool.getCurrentMemoryUsage()` Is Private — Use `getStats().totalMemoryUsage`

`getCurrentMemoryUsage()` is `private` on `WasmMemoryPool` — callable from JS but not part of `WasmBufferAllocator`. Use `getStats().totalMemoryUsage` in any external caller. `WasmDictionaryManager` was fixed this session (was calling the private method directly).

### `new URL(path, import.meta.url)` Requires a Static String Literal

Template literals prevent Vite's asset URL transform — the URL resolves in dev but breaks in production. Always write: `new URL('../../wasm/name.wasm', import.meta.url)` with a hard-coded string. Applies to every `fetchWasmBinary` call site and the prewarm IIFE in `WasmPatternProcessor.js`.

### `needs_space()` / `needsSpace()` Are the Canonical Spacing Rules

9 spacing rules in `wasm-core/src/text_assembly.rs::needs_space()` (Rust) and `src/utils/wasm/WasmTextAssembler.js::needsSpace()` (JS fallback) must stay in sync. Parity spec: `src/utils/__tests__/TranslationEngine.textAssembly.test.js`.

### `validatePhasePriority` Must Use Literal Priority Numbers

`PHASE_PRIORITIES` keys are `translationSource` strings — not phase-group labels. `PHASE_PRIORITIES.patterns` / `.properNouns` / `.numbers` are all `undefined`. Always pass a literal `1|2|3|4|5`.

### Whitespace Regex in Post-Assembly Must Preserve `\n`

Any `replace()` on `cleanedFinalResult` / chunk-translated text in `postProcess`, `wordSegments` rebuild (`TranslationEngine.js` ~line 6740), or `applyFinalCleanup` must use `[ \t]+` or `[^\S\r\n]+` — never bare `\s+`. `\s` matches `\n`/`\r`, silently dropping paragraph breaks when whitespace sits adjacent to quotes/punctuation.

---

## `// @ts-check` Coverage

26 files have `// @ts-check` active (grep for the comment to find them). Do NOT remove without understanding they were explicitly fixed to 0 errors. 18 utils remain deferred (25–69 errors each).

When adding `// @ts-check` to a new file, common patterns required for compatibility:

- `@returns {Array}` → must include type arg: `{Array<*>}` (TS2314)
- `// @ts-ignore` suppresses only the **next single line** — collapse multi-line imports to one line before it works (e.g. WASM named exports not yet in typedefs)
- Catch bindings: `} catch (/** @type {any} */ error) {`
- `window.customProp = x` → needs `// @ts-ignore` above
- `@param {Object} options` with sub-property docs → use inline type `@param {{ x: string }} [options]`
- `constructor(options = {})` where type has required props → `// @ts-ignore` above constructor
- Module-level `let x = null` → add `/** @type {Function|null} */` above
- `const arr = []` empty init → `const arr = /** @type {Array<{...}>} */ ([])`
- Tightening a shared utility's `@param` type can break callers — grep all callers after narrowing

---

## Testing Import Gotchas

- **Temporary debug instrumentation in huge files (`TranslationEngine.js`, `SemanticPatternProcessor.js`) is easy to leave behind** — grep for `console.error`/`console.log`/any debug tag you added before considering a bug-hunt done; file size makes a stray line easy to miss on a final read-through.
- **`vi.useFakeTimers()` does not fake `performance.now()` by default** — pass `{ toFake: ['setTimeout','clearTimeout','setInterval','clearInterval','Date','performance'] }` explicitly when testing code with `performance.now()`-based thresholds or growth-rate math.
- **Testing a strict `elapsed > N` (not `>=`) time-window guard**: a fake-timer interval tick fires exactly at its scheduled boundary, not at "total time advanced" — offset the interval by 1ms (or advance one tick past N) so the check actually crosses the boundary, not just reaches it.
- `AppConfiguration`: import from `src/types/ComponentTypes`, NOT `configValidation`
- Testing anything that calls `loadAppConfig()`: mock `../../utils/appConfig` directly (`vi.mock(..., () => ({ loadAppConfig: vi.fn() }))`), not raw `window.electronAPI.loadConfiguration` — the module-level `cache` in `appConfig.ts` isn't reset between tests in the same file (no `resetModules` config), so mocking only the IPC call risks leaking a stale cached value into later tests.
- `getDictionaryLabel`/`compareDictionaryOrder`: import from `dictionaryHelpers` directly (re-export through `DuplicateAnalyzer` removed)
- `vi.doMock` for `translation_wasm_core.js`: path resolves from the _source_ file's directory, not the test file's
- Pipeline phases testable in jsdom: **2** (proper nouns), **3** (numbers), **4** (phrases), **5** (chars) — pure JS. Phase **1** (WASM patterns) requires the binary — covered in wasm-core Rust tests.
- Simulate Phase 1 output in jsdom tests: pre-mark tokens with `{ translated: 'X', translationSource: 'pattern' }` — subsequent phases skip pre-marked tokens, so Phase 4/5 guards can be tested without WASM.
- `DictionaryManager` tests loading `properNouns-f_*`/`properNouns-_*` dicts: pass `{ activeProperNouns: ['properNouns-f_test', 'properNouns'] }` as second arg — default is `['properNouns']` only, silently excludes all prefixed dicts with no error.
- Mocking a method your hook calls (e.g. `validateWasmFallback`, `getReport`): mock the shape the **real implementation** returns, not the shape the consumer code expects — if both are wrong the same way, tests stay green while the integration is broken (found: a hook's status-string check and its test's mock both used strings the real method never produces).
- `WasmProcessorLifecycle` in WASM module tests: mock the entire class — `initialize` calls `fetchWasmBinary` internally and throws in jsdom. Mock pattern: `vi.mock('../wasm/WasmProcessorLifecycle', () => ({ WasmProcessorLifecycle: vi.fn(function() { return { initialize: vi.fn(async (fn) => { await fn(new ArrayBuffer(0)); return true; }), hasFailed: false, pendingInit: null }; }) }))`.
- `WasmMemoryPoolManager` mock must satisfy `WasmBufferAllocator` — `{ getBuffer: vi.fn(() => new ArrayBuffer(1024)), returnBuffer: vi.fn(), getStats: vi.fn(() => ({ totalMemoryUsage: 0 })), cleanup: vi.fn() }`. Do NOT include `getCurrentMemoryUsage` (private, not on the interface). `WasmDictionaryManager.loadDictionary` calls `getStats()` on success; omitting it throws into the catch block.
- `SemanticPatternProcessor.initializePatterns` object-format dict: key is `translation`, not `template` — `{ 'X的': { translation: 'của X', allowAsPatternVariable: true } }`
- `vi.useFakeTimers()` + `requestAnimationFrame`: RAF fires at ~16ms, not 0ms — use `vi.advanceTimersByTimeAsync(20)` to advance past it before asserting retry/cancel behavior.
- `vi.useFakeTimers()` + `waitFor`: `waitFor` polls via internal `setTimeout` — with fake timers it never fires and tests timeout. Use `await act(async () => { vi.advanceTimersByTime(N); })` for timer-driven assertions; drop fake timers entirely for tests that only need to flush async effects (`await act(async () => {})`).
- `WasmPatternProcessor` mock instances must include `__destroy_into_raw: vi.fn()` — catch blocks in `processTokensWasm` and `reinitializeWasmPatternProcessor` call `instance?.__destroy_into_raw()`, throwing "not a function" if absent.
- `src/utils/highlighting` barrel: never use `vi.importActual` — the barrel re-exports WASM modules that crash the worker process. Mock minimally: `vi.mock('…/highlighting', () => ({ precomputeSegments: vi.fn() }))`.
- `vi.mock` factory is hoisted before module-level `const` declarations — use bare `vi.fn()` in the factory body and set return values in `beforeEach`. If the mock object itself must be referenced in assertions (not just its return value), declare it via `vi.hoisted(() => ({...}))` instead of a bare `const` — a bare `const` throws `ReferenceError` at hoist time.
- `renderHook` hook dep objects must be stable `const` defined outside the callback — `makeArrays()` inline creates a new reference each render, triggers the effect dep, and causes OOM via infinite re-render loop.
- `ResizeObserver` (and other browser APIs called with `new`) must be mocked with class syntax — `vi.fn().mockImplementation(arrow)` is not constructable; use `class MockRO { constructor(cb) {...} observe = vi.fn(); disconnect = vi.fn(); }` then `global.ResizeObserver = MockRO as unknown as typeof ResizeObserver`.
- Read-only DOM properties (`scrollHeight`, `clientHeight`, `scrollWidth`) can't be set via `Object.assign` or direct assignment — use `Object.defineProperty(node, 'scrollHeight', { get: () => 8000 })`.
- jsdom normalizes inline style values on readback, not just missing ones — hex colors become `rgb(r, g, b)` and bare numeric values like `marginBottom: '0'` become `'0px'` on `.style.X` reads. Assert against the normalized form, not the source literal.
- Testing a plain (non-component) function that returns `ReactNode`: `render(<>{someFn(...)}</>)` — wrap the call in a fragment rather than forcing it into a component. This codebase prefers plain functions over components for small JSX-returning utils (`PatternTextFormatter.tsx`, `SegmentedParagraphs.tsx`) specifically to avoid new reconciliation boundaries.
- `renderHook` + `useRef(null)`: effects that early-return on `!ref.current` never fire their body — no DOM node is attached at render time. Either move the guard inside the async callback, remove it from the top-level guard, or call the callback ref before the effect is expected to run.
- `isDictionaryCategory` uses case-sensitive `String.includes()` — dict names with uppercase midpoints (e.g. `'twoPhasePatterns'`) silently fail `includes('pattern')` (capital P). Use kebab-case in tests: `'pattern-structural'`, `'phrases-extended'`.
- **Async `await`-ordering tests** (CRITICAL-3 pattern): to prove `await foo()` precedes `bar()`, use `foo: vi.fn(() => Promise.resolve().then(() => sequence.push('foo-resolved')))` and assert `sequence.indexOf('foo-resolved') < sequence.indexOf('bar')` after full execution — if `await` is absent, `bar` fires before the microtask resolves, inverting the sequence. Run via `vi.useFakeTimers()` + `await act(async () => { vi.runAllTimersAsync(); })`.
- `logger.warn`/`logger.error` always call `console.warn`/`console.error` regardless of `NODE_ENV`; `logger.log`/`.info`/`.debug`/`.group` are dev-only no-ops in test env. Mock the logger module (`vi.mock('../logger', ...)`) in any test exercising a warning/error/alert path, or console output gets noisy.
- Singleton-exported classes (e.g. `adaptiveChunker`, `parallelDictionaryLoader`) — test with a fresh `new ClassName()` per test, not the shared singleton export. The singleton accumulates state (history, stats, caches) across tests otherwise.
- A class whose constructor starts a real timer (`setInterval`) immediately — e.g. `PerformanceBaselineTracker`'s `setupPeriodicAnalysis()` — needs `afterEach(() => instance.destroy())` in tests. Check for an existing `destroy()`/cleanup method before reaching for fake timers.
- Before writing directional assertions against a regex/heuristic-based calculation (density scores, complexity weights), verify actual fixture behavior with a quick `node -e` snippet first — CJK-range regexes are easy to misjudge (e.g. a "proper noun density" pattern that actually fires on nearly any punctuated Chinese sentence, not just proper nouns). For modules with tunable magic-number weights/thresholds, assert directional/boundary relationships (`x > y`, `below threshold N → strategy A`) rather than pinning exact float outputs — survives future re-tuning.
- `window.electronAPI.loadDictionariesParallel` (Rust IPC bridge, called from `DictionaryBackend.ts`) and `parallelDictionaryLoader.loadDictionariesParallel` (JS class in `ParallelDictionaryLoader.js`, called from `useForceReload.js`) are two unrelated implementations sharing one method name — grepping the name alone will not tell you which layer you're looking at.
- Mocking `logger` for any `print*Report()` method: also stub `table` — `TwoPhasePatternProcessor.printInternalProfilingReport()` and `TranslationProfiler.printReport()` both call `logger.table(...)`; a mock with only `log`/`warn`/`error` throws `TypeError` at call time, not import time.
- `TranslationEngine` can be constructed bare — `new TranslationEngine({debugLevel:0, enableMemoryMonitoring:false, enablePerformanceMonitoring:false})` — with no `.initialize()` and no WASM, for testing thin delegator/guard methods (e.g. the pattern-profiling delegators). Full pipeline tests still need `.initialize()` + WASM (see `TranslationEngine.integration.test.js`, `describe.skip`'d for that reason).
- **WASM wrapper failure-handling tests must trigger via the real method throwing, not by calling `handleFailure()`/`recordFailure()` directly** — direct calls only prove the notification/fallback-toast logic works, not that a real WASM error reaches it through the actual `catch` block. Found in `WasmDictionaryManager.errorHandling.test.js` (2026-07-27) — fixed by making the mocked method throw instead.

📖 [Full testing gotchas](docs/guides/development.md#testing-gotchas)

### `find_best_pattern_match` / `findBestPatternMatch` Tie-Break Order

When multiple patterns match the same token span: (1) longer match wins, (2) fewer variables wins (more literal chars = more specific), (3) higher priority wins. Without rule (2), a 2-variable pattern like `X的Y上` silently beats a 1-variable `X的手腕上` at equal length — do not change this order.
