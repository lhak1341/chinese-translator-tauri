# src/utils — Gotchas

## TranslationEngine Internals

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

### Duplicate-Word Highlighting Requires `tokenIndex` Ordering in Three Places

All three stem from the same root cause — `processChunksInParallel` assigns semantic array indices by chunk completion order, not text order:

1. **Full Translation word-level builder** (`TranslationEngine.js` ~line 6644): sort `candidateWords` by `tokenIndex` ascending for same-length ties.
2. **Full Translation → Char-only bridge** (`CharacterOnlyBridge.ts`): count `occurrenceInSource` using `metadata[i].tokenIndex < clickedTokenIndex`, not `i < activeIndex`.
3. **Original Chinese panel** (`SegmentPrecomputer.ts` ~line 724): sort `firstCharIndex` candidate lists by `tokenIndex` ascending after building them.

Any new greedy scan or occurrence counter over the semantic array must use `tokenIndex` order.

### `getSemanticTokens` Requires `TextToken[]`, Not a String

`getSemanticTokens(chunk.content)` silently returns `[]` because `chunk.content` is a string. When computing chunk token counts for `chunkOffset` in `processChunksInParallel`/`translateWithChunking`, always call `this.tokenizer.tokenize(chunk.content).length`. Using the wrong call zeros all cross-chunk token offsets, breaking same-translated-text disambiguation.

### `tokenCharPositions` Must Use `originalValue` for Phrase Leaders

In `postProcess`, the `tokenCharPositions` loop must use `tokens[i].originalValue ?? tokens[i].value` — phrase processing sets `tokens[K].originalValue = tokens[K].value` (e.g., `"部"`) then mutates `tokens[K].value` to the full word (`"部分"`). Using `.value` double-counts and shifts all subsequent `originalStart` positions by the consumed-token count.

### `token.start` Is a Byte Offset, Not a Char Offset

Chinese chars are 3 bytes each, making `token.start` ~3× too large for char-position arithmetic. In `postProcess`, use cumulative `tokenCharPositions`: `tokenCharPositions[i] = sum of tokens[0..i-1].value.length`.

### `buildSegmentsFromPositions` Fires Only When ALL `metadata[].originalStart >= 0`

Since the parallel merge loop drops `originalStart`, this path never activates for multi-chunk translations — only for single-chunk (short) texts. Fixing the merge loop can trigger "no highlighting" regression if the path has latent bugs — test both short and long texts separately before enabling.

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

### `cleanupFormatting` Else-Branch `^` Capitalization Requires `!isParallelChunk` Guard

When `isParallelChunk: true` (each parallel chunk runs with `useChunking: false`), the `^` rule capitalizes every chunk's first letter independently — overrides `applySmartCapitalization` context. Guard: `if (!options.isParallelChunk)` wraps the `^` replace. Do not remove this guard.

### WASM vs JS TextChunker: Different Chunk Structures for Consecutive Punctuation

WASM accumulates consecutive punctuation into one field — `道：「说` gives the `道` chunk `punctuation="：«"`, and `说` gets `startedBy="：«"` (colon already present). JS TextChunker creates a separate empty chunk between them: `{content:"", punctuation:"«", startedBy:"："}`; `说` gets `startedBy="«"`. `applySmartCapitalization` handles both: WASM output is caught by the multi-char `includes("："`)`check; JS output is caught by the fallback that checks`chunks[i-1].content.trim() === ""`.

### `「` (U+300C) Is Not an Opening Quote — `fixAngleQuotePositioning` Skips It

`QuoteProcessor.isOpeningQuote('「')` returns false. `fixAngleQuotePositioning` only fires for `《` and curly quotes (`“`, `‘`, etc.). A JS-chunker empty chunk with `punctuation="「"` is silently skipped — colon context in its `startedBy` is NOT propagated to the content chunk by this function. The fallback block in `applySmartCapitalization` (checking `chunks[i-1].content.trim() === ""`) handles this instead.

### `checkSemanticArrayCorruption` Uses `corruptionToastShown`

A translation-scoped `let corruptionToastShown = false` guards `toast.error` to at most once per translation. `isCorrupted` is sticky across all 5 phase checks. Any new call site that toasts on `isCorrupted` must reuse this flag.

### `buildVariableCache` Delegates to `PatternVariableCache.buildPatternVariableCache`

`SemanticPatternProcessor.buildVariableCache` and `TwoPhasePatternProcessor.buildVariableCache` both delegate the four shared lookup stages (proper noun tokens, phrase lookups, proper noun single-token, full-text scan) to `src/utils/pattern/PatternVariableCache.js`. Changes to phrase type handling or the full-text scan guard go in `PatternVariableCache.js` only — no mirroring required.

Adapter-specific logic that stays in each file: Semantic's Phase A result injection (seeded as lowest-priority `initialCache`); TwoPhase's step-1b pattern-translated tokens (`patternSemanticType`, runs AFTER shared stages so it overrides stage-1 proper-noun entries for the same word); type resolution strategy (`classifyVariableType` for Semantic vs `metadata?.semanticType` defaults for TwoPhase). Canonical phrase type fallback: `metadata?.semanticType || 'concept'` (NOT `'phrase'`). Semantic token types: `chinese_char`, `chinese_word`, `latin_word`, `number`.

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

### `DictionaryManager._findAllMatchesWasm` Has Independent Sort

WASM parallel path in `DictionaryManager`. Maintains its own sort (length desc then priority), separate from the JS `findAllMatchesParallel` path. Any change to match-ordering in `findAllMatchesParallel` or `findAllMatchesSequential` must be mirrored in `_findAllMatchesWasm`.

### `.trie.json` Files Are JS Map Cache, Not WASM

`*.trie.json` in the dictionaries folder are written by `PrecomputedTrieCache.js` — they cache the JS Map-based trie, not anything WASM-related. Do not delete them; they speed up cold starts.

### `applyHierarchicalResults` Has No Overlap Check — Do Not Add One

`applyHierarchicalResults` applies WASM results directly without deduplication. Do NOT add overlap checking there — `select_optimal_results` in `wasm-core/src/pattern_processor/two_phase.rs` guarantees non-overlapping results before they reach JS. Adding a JS-side dedupe would mask WASM selection bugs instead of surfacing them.

### `applyHierarchicalResults` (Phase 1) Does Not Set `isGrouped` or `groupedWith`

Phase 1 marks `translationSource`, `translated`, and `groupLeader` on tokens. `isGrouped` stays `false`; `groupedWith` stays `[]`. Detecting a Phase 1 leader: `translated !== null && translationSource && !translationSource.endsWith('_consumed')`. Do NOT use `isGrouped` or `groupedWith.length` — they are always `false`/`0` for Phase 1 output.

### `applyMatchToTokens` Orphan-Release Loop Must Not Be Removed

When Phase 2+ overwrites a Phase 1 leader token, the orphan-release code in `applyMatchToTokens` (immediately before marking followers `*_consumed`) scans forward from `startIndex + tokenSpan` and resets consecutive orphaned `*_consumed` followers to unprocessed state. Without it, Phase 2's skip guard and `postProcess` silently drop those tokens — violating the hard "never omit content" contract.

### `postProcess` Orphan Safety Net Must Not Be Collapsed to `continue`

The `else if (token.translationSource)` branch contains an orphan-recovery path: consumed Chinese tokens whose `groupLeader === null` (released by orphan-release) or whose leader has `translated === null` are recovered via char dict fallback instead of skipped. Do NOT replace with `continue`. **Every phase must set `groupLeader = startIndex` on consumed tokens at the mark site** — `=== undefined` (never set) also triggers char-fallback, silently corrupting every multi-token match from that phase. `applyMatchToTokens` (Phase 2/4), `applyHierarchicalResults` (Phase 1), and `NumberProcessor.applyConversionResult` (Phase 3 JS) all set it. `copyWasmTokens` does NOT copy `groupLeader` — WASM-path phases need a post-`copyWasmTokens` sweep.

### WASM Wrapper Retire-After-Panic

Any `Wasm*.js` `catch` block for a WASM call must immediately do `this.obj = null; this.initialized = false; this.initializationFailed = true`, and `initialize()` must guard `if (this.initializationFailed) return false`. Once `panic = "abort"` fires, the WASM object's `borrow_mut_count` is permanently stuck — silently retrying it produces "recursive use" on every subsequent call. **Exception**: `WasmConflictResolution.js` is a module-level singleton (no class) — retire uses bare `initialized = false; initializationFailed = true` (no `this.*`). **Exception**: `WasmNumberProcessor.js` and `WasmPatternProcessor.js` use `WasmProcessorLifecycle` — on a runtime panic call `lifecycle.permanentlyFail()`, NOT `lifecycle.reset()`. `reset()` clears `_hasFailed`, allowing re-init from the same corrupted binary; `permanentlyFail()` blocks it permanently.

**`instance = null` without `.__destroy_into_raw()` first leaves FinalizationRegistry active.** Stale callback fires when dlmalloc reuses the freed Rc address for a new instance → next method call panics (`alloc/rc.rs hint::assert_unchecked(strong != 0)`). Always `instance?.__destroy_into_raw()` before every `instance = null` in any `Wasm*.js` wrapper. Use `__destroy_into_raw()` (JS-only cleanup, safe post-panic), NOT `.free()` (calls into WASM, unsafe after `panic = "abort"`).

**`translation_wasm_core.d.ts` is auto-generated** — the linter reverts manual additions on next format. `__destroy_into_raw` is absent from the generated types; suppress TS2339 with `// @ts-ignore` on the call line, not by editing the `.d.ts`.

### All 6 WASM Wrappers Share One Binary — Cascade-Retire Required

All 6 wrappers (NumberProcessor, PatternProcessor, TextAssembler, TextChunker, DictionaryManager, ConflictResolution) share `translation_wasm_core.js`. Any panic permanently corrupts the shared linear memory (`dlmalloc` state). Every primary panic catch must cascade-retire all other wrappers before returning. WasmConflictResolution fires at TWO pipeline points: Phase 2 (before NumberProcessor) and Phase 4 (after DictionaryManager) — it must appear in every cascade. Circular dep constraint: `WasmTextChunker` imports `WasmDictionaryManager`; `WasmDictionaryManager` therefore cannot import `WasmTextChunker` (TC→DM→TC circular).

### WASM Singleton Modules Must Call `.initialize().catch(warn)` at Module Bottom

Any `src/utils/wasm/Wasm*.js` that exports a singleton must trigger background init at import time. Missing this forces every first caller onto the slow JS fallback path. **Exception — `WasmPatternProcessor.js`**: exports functions, not a singleton; its module-bottom prewarm is a self-calling IIFE that only warms the ES module cache via `fetchWasmBinary`.

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

- `AppConfiguration`: import from `src/types/ComponentTypes`, NOT `configValidation`
- `getDictionaryLabel`/`compareDictionaryOrder`: import from `dictionaryHelpers` directly (re-export through `DuplicateAnalyzer` removed)
- `vi.doMock` for `translation_wasm_core.js`: path resolves from the _source_ file's directory, not the test file's
- Pipeline phases testable in jsdom: **2** (proper nouns), **4** (phrases), **5** (chars) — pure JS trie lookup. Phases **1** (WASM patterns) and **3** (WASM numbers) require the binary — covered in wasm-core Rust tests.
- Simulate Phase 1 output in jsdom tests: pre-mark tokens with `{ translated: 'X', translationSource: 'pattern' }` — subsequent phases skip pre-marked tokens, so Phase 4/5 guards can be tested without WASM.
- `DictionaryManager` tests loading `properNouns-f_*`/`properNouns-_*` dicts: pass `{ activeProperNouns: ['properNouns-f_test', 'properNouns'] }` as second arg — default is `['properNouns']` only, silently excludes all prefixed dicts with no error.
- `WasmProcessorLifecycle` in WASM module tests: mock the entire class — `initialize` calls `fetchWasmBinary` internally and throws in jsdom. Mock pattern: `vi.mock('../wasm/WasmProcessorLifecycle', () => ({ WasmProcessorLifecycle: vi.fn(function() { return { initialize: vi.fn(async (fn) => { await fn(new ArrayBuffer(0)); return true; }), hasFailed: false, pendingInit: null }; }) }))`.
- `SemanticPatternProcessor.initializePatterns` object-format dict: key is `translation`, not `template` — `{ 'X的': { translation: 'của X', allowAsPatternVariable: true } }`
- `vi.useFakeTimers()` + `requestAnimationFrame`: RAF fires at ~16ms, not 0ms — use `vi.advanceTimersByTimeAsync(20)` to advance past it before asserting retry/cancel behavior.
- `WasmPatternProcessor` mock instances must include `__destroy_into_raw: vi.fn()` — catch blocks in `processTokensWasm` and `reinitializeWasmPatternProcessor` call `instance?.__destroy_into_raw()`, throwing "not a function" if absent.
- `src/utils/highlighting` barrel: never use `vi.importActual` — the barrel re-exports WASM modules that crash the worker process. Mock minimally: `vi.mock('…/highlighting', () => ({ SegmentPrecomputer: { precomputeSegments: vi.fn() } }))`.
- `vi.mock` factory is hoisted before module-level `const` declarations — use bare `vi.fn()` in the factory body and set return values in `beforeEach`.
- `renderHook` hook dep objects must be stable `const` defined outside the callback — `makeArrays()` inline creates a new reference each render, triggers the effect dep, and causes OOM via infinite re-render loop.

📖 [Full testing gotchas](docs/guides/development.md#testing-gotchas)
