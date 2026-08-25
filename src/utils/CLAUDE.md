# src/utils — Gotchas

Six properties generate almost every trap in this directory. Read the rule, then the instances under it.

---

## 1. These APIs do not validate their arguments — a wrong one degrades silently

No throw, no warning, no error. The wrong value produces plausible-looking output with a piece missing, which is why these keep recurring. Check the signature at the call site.

| Call                                       | Wrong argument                                                    | What silently happens                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addUnit(…, source, …)`                    | `'patterns'`, `'numbers'`, `'passthrough'`, or `match.dictionary` | `getSourcePriority` returns 999, below the character fallback. Correct: `'pattern'`, `'number_conversion'`, `'characters'`, `'phrases'` — pass `match.dictionary` as arg 6 instead                                                                                                                                                                                                                                        |
| `addUnit`                                  | fewer than all 6 args                                             | Provenance fields land `null` for every entry. Signature: `(originalText, translatedText, source, tokenIndex, phase, dictionary)`                                                                                                                                                                                                                                                                                         |
| `addUnit(…, phase, …)`                     | a number instead of a string label                                | Wrong provenance recorded, no error. Arg 5 is `'pattern'` / `'phrases'` / etc.                                                                                                                                                                                                                                                                                                                                            |
| `engine.initialize(options)`               | omitted `options.activeProperNouns`                               | Falls back to `options.activeProperNouns \|\| ['properNouns']`, `getFilteredDictionaries` drops every `properNouns-*` novel dict, names go un-capitalized. Never reads config from disk — the caller supplies it. Both call sites are in `useTranslatorEngine.js`: initial load passes `activeProperNounsFromConfig` state, force reload uses `reinitialize(forceConfigReload: true)` which reads fresh config internally |
| `getSemanticTokens(x)`                     | a string (e.g. `chunk.content`)                                   | Returns `[]`. For chunk token counts use `this.tokenizer.tokenize(chunk.content).length`; the wrong call zeros all cross-chunk offsets and breaks same-translated-text disambiguation                                                                                                                                                                                                                                     |
| `validatePhasePriority(p)`                 | `PHASE_PRIORITIES.patterns` / `.properNouns` / `.numbers`         | All three are `undefined` — those keys are `translationSource` strings, not phase-group labels. Pass a literal `1\|2\|3\|4\|5`                                                                                                                                                                                                                                                                                            |
| `SemanticPatternProcessor.processTokens()` | return value ignored                                              | Drops every JS pattern translation; tokens fall through to phases 4/5. Callers must capture and pass to `applyHierarchicalResults(tokens, results, options)`                                                                                                                                                                                                                                                              |

Same shape, different mechanism: **a caller-supplied numeric limit defaulted with `||` treats a legitimate `0` as absent.** `VocabularyWarmup.warmNovelSpecificVocabulary` uses `??` for `maxCharacters`/`maxPhrases` because `TranslationCache.js:545` can legitimately pass `0` once the common-character pre-warm fills its budget; `0 || 50` would over-warm past the cache budget. `WasmMemoryPoolManager`'s `initialPoolSize`/`shrinkThreshold` had the identical bug. Grep for `|| 50` / `|| 30` style defaults before assuming `0` is impossible.

`validateConsumedTokenContract` detects consumed sources via `.includes('_consumed')` — this predicate must match `getSourcePriority`'s check exactly.

---

## 2. Code that looks redundant here is load-bearing — each of these was already removed once, and broke something

Treat this list as the answer to "why is this checked twice?" The second check is not the same check.

- **`resolveMatchConflicts` (Phase 2) vs `resolveGlobalConflicts` (Phase 4)** — patterns beat phrases at equal length in Phase 2; phrases beat patterns at equal length in Phase 4, because Phase 1 pattern tokens are already consumed by then. The inversion is architectural. Do not harmonize.
- **`applyHierarchicalResults` has no overlap check** — `select_optimal_results` in `wasm-core/src/pattern_processor/two_phase.rs` already guarantees non-overlapping results. A JS-side dedupe would mask WASM selection bugs instead of surfacing them.
- **`applyMatchToTokens`'s orphan-release loop** — when Phase 2+ overwrites a Phase 1 leader, it scans forward from `startIndex + tokenSpan` and resets orphaned `*_consumed` followers to unprocessed. Without it, Phase 2's skip guard and `postProcess` silently drop those tokens, violating the never-omit-content contract.
- **`postProcess`'s `else if (token.translationSource)` orphan safety net** — recovers consumed Chinese tokens whose `groupLeader === null` (released by orphan-release) or whose leader has `translated === null`, via char dict fallback. Do not collapse to `continue`.
- **`WordSegmentMatcher.matchWordSegments` pass 2 reuses pass 1's `foundWords[i].position`** — given pass 1's global pairwise non-overlap guarantee and pass 2's strict left-to-right walk, an independent `indexOf` re-search can mathematically never diverge. It is not a safety net; it cannot catch anything.
- **`SegmentPrecomputer.ts`'s two scan loops are not unification candidates** — `precomputeOriginalSegments` (Chinese panel) does raw exact `startsWith` with grapheme-cluster indexing; the deleted `precomputeSegments` (Vietnamese panel) did punctuation-skip and case/whitespace-normalized matching. Genuinely different matching problems. See ADR-036.
- **`buildVariableCache`'s `shouldInclude` needs its `hasUnconstrainedPatterns` guard** — `requiredTypes` filtering is only correct when every pattern is constrained; one unconstrained pattern accepts any type, so filtering would exclude entries it needs. `if (!requiredTypes || hasUnconstrainedPatterns) return true;`
- **`cleanupFormatting`'s `^` capitalization needs `!options.isParallelChunk`** — each parallel chunk runs with `useChunking: false`, so without the guard the rule capitalizes every chunk's first letter independently and overrides `applySmartCapitalization` context.
- **`createOptimalPhraseGroups` (Phase 4) checks only `enableTwoPhasePatterns`, not `patterns?.length`** — phrase processing is pure JS and runs whether or not structural patterns are loaded. Do not re-add a `patterns?.length > 0` guard.
- **Segment cleanup's synchronous hard ceiling** — `MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER` (75) is idle-deferred and `SmartMemoryCoordinator`'s backstop is pressure-reactive (10s sampling); neither bounds `translationSegments.length` deterministically. `SEGMENT_CLEANUP_HARD_CEILING` (100) trims synchronously at the push site. `Translator.jsx` had a caller-side watchdog for this exact gap, deleted 2026-07-24. If segments ever exceed 100 the bug is in the engine's own cleanup — do not patch it from `Translator.jsx`.
- **Do not wire `SemanticArrayMetadata.translatedStart`/`.translatedEnd` validity into `checkSemanticArrayCorruption`.** Both initialize to `-1` in `addUnit` and stay `-1` until `postProcess`'s position-tracking loop runs, _after_ all 5 phases. The corruption check fires _during_ each phase, so it would see `-1` on every entry of every translation — 100% false positive, not an edge case. Shipped and reverted same-day, 2026-08-16.

---

## 3. Three implementations must move together

Changing the algorithm in one and not the others produces divergence that no test catches at the seam.

| Rule                | Lives in                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conflict resolution | `resolveMatchConflicts` (JS), `resolveGlobalConflicts` (JS, delegates to `WasmConflictResolution.js`), `wasm-core/src/conflict_resolution.rs::run_conflict_resolution`                                                                             |
| Spacing (9 rules)   | `wasm-core/src/text_assembly.rs::needs_space()`, `src/utils/wasm/WasmTextAssembler.js::needsSpace()`. Parity spec: `src/utils/__tests__/TranslationEngine.textAssembly.test.js`                                                                    |
| Quote categories    | `QUOTE_CATEGORIES.OPENING/CLOSING` auto-cascades to `PunctuationProcessor.OPENING_PUNCT/CLOSING_PUNCT`; manually update `TranslationEngine.js capitalizationRules` and **both** `ChunkPostProcessor.js startsWithClosingElement` regex occurrences |

---

## 4. Position arithmetic in `postProcess` has three independent traps

- **`token.start` is a byte offset, not a char offset.** Chinese chars are 3 bytes, so it runs ~3× too large for char arithmetic. Use cumulative `tokenCharPositions[i] = sum of tokens[0..i-1].value.length`.
- **The `tokenCharPositions` loop must read `originalValue ?? value`.** Phrase processing sets `tokens[K].originalValue = tokens[K].value` (`"部"`) then mutates `.value` to the full word (`"部分"`). Reading `.value` double-counts and shifts every subsequent `originalStart` by the consumed-token count.
- **Whitespace regexes must preserve `\n`.** Any `replace()` on `cleanedFinalResult`, the `wordSegments` rebuild, or `applyFinalCleanup` uses `[ \t]+` or `[^\S\r\n]+`, never bare `\s+` — `\s` matches `\n`/`\r` and silently drops paragraph breaks next to quotes and punctuation.

---

## 5. The WASM wrappers share one binary, so failure is always collective

All 7 wrappers (PatternProcessor, TextAssembler, TextChunker, DictionaryManager, ConflictResolution, StringProcessor, TextTokenizer) import the same `translation_wasm_core.js`. Any panic corrupts the shared `dlmalloc` linear memory permanently, so a panic anywhere must retire everything.

- **Retire on panic, never retry.** Every `catch` around a WASM call sets `this.obj = null; this.initialized = false; this.initializationFailed = true`, and `initialize()` guards `if (this.initializationFailed) return false`. Once `panic = "abort"` fires, `borrow_mut_count` is stuck — retrying yields "recursive use" forever.
- **Cascade only through `src/utils/wasm/WasmCascadeRegistry.js`.** Each wrapper calls `registerCascadeHandler(fn)` once at module load; each panic catch calls `fireCascadeRetire()`, which invokes every handler including its own. Never import a sibling wrapper to call its retire function directly — all wrappers are statically imported from `TranslationEngine.js`, so all are registered before any translation runs, making a direct call redundant rather than a safety net. Four wrappers did this anyway until 2026-08-08 and it was the sole cause of the only import cycle this repo's static analysis ever flagged. Retire functions stay module-private; a bare `export` on one is itself the smell.
- **`__destroy_into_raw()` before every `instance = null`.** Otherwise FinalizationRegistry stays active, and the stale callback fires when dlmalloc reuses the freed Rc address — the next method call panics in `alloc/rc.rs`. Use `__destroy_into_raw()` (JS-only, safe post-panic), never `.free()` (calls into WASM, unsafe after `panic = "abort"`).
- **Singletons trigger background init at module bottom** with `.initialize().catch(warn)`; missing it forces every first caller onto the slow JS path.
- **`new URL(path, import.meta.url)` needs a hard-coded string literal.** Template literals defeat Vite's asset URL transform — resolves in dev, breaks in production. Applies to every `fetchWasmBinary` call site.

Wrappers that deviate, and why:

- `WasmConflictResolution.js` — module-level singleton, no class: retire is bare `initialized = false; initializationFailed = true`, no `this.*`. Fires at two pipeline points (Phase 2 before NumberProcessor, Phase 4 after DictionaryManager).
- `WasmPatternProcessor.js`, `WasmStringProcessor.js`, `WasmTextChunker.js`, `WasmTextTokenizer.js` — use `WasmProcessorLifecycle`: on a runtime panic call `lifecycle.permanentlyFail()`, **not** `lifecycle.reset()`, which clears `_hasFailed` and allows re-init from the corrupted binary.
- `WasmPatternProcessor.js` — exports functions rather than a singleton; its module-bottom prewarm is a self-calling IIFE that only warms the ES module cache.
- `WasmTextTokenizer.js` — holds no owned struct (`tokenizeText`/`getTokenizerStats` are free wasm-bindgen functions), so retire is a bare `permanentlyFail()` with no `__destroy_into_raw()`.

`translation_wasm_core.d.ts` is auto-generated and the linter reverts manual edits — `__destroy_into_raw` is absent from it, so suppress TS2339 with `// @ts-ignore` on the call line rather than editing the `.d.ts`.

`WasmMemoryPool.getCurrentMemoryUsage()` is `private` and not part of `WasmBufferAllocator` — external callers use `getStats().totalMemoryUsage`.

---

## 6. State has one owner — do not re-add a local copy

Each of these was previously duplicated on the engine or a caller, and the copies drifted.

| Concern                         | Owner                                                                                                                                                                                                                         | Do not                                                                                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine teardown                 | `destroy()` — stops `memoryCoordinator` intervals, clears `processedBatchCache`, `semanticArrayBuilder`, `semanticPatternProcessor.variableCache`, `dictionaryManager` caches. `useForceReload` is the sole production caller | Re-introduce manual cache clearing in reload paths                                                                                                                                                                                                                     |
| Semantic array construction     | `src/utils/highlighting/SemanticArrayBuilder.ts` — the only implementation since the sibling pair was deleted (Session 39). Add fields to `SemanticArrayMetadata`, init in `addUnit()`, handle in `setPositionByMatch()`      | Look for a field-sync requirement; none exists                                                                                                                                                                                                                         |
| Semantic array validation       | `semanticArrayValidator.hasValidPositions(meta)` / `.validateAllPositions(builder.getSnapshot())` in `SemanticArrayValidator.ts`. The builder's private `validateArrays()` delegates here                                     | Re-duplicate the capacity/sync check inline on the builder                                                                                                                                                                                                             |
| Memory coordination             | `this.memoryCoordinator`, re-constructed per `translateWithProgressiveBatches` call (not at engine init), shut down in `destroy()`                                                                                            | Reach for the former `smartMemoryDetector` / `backgroundCleanup` / `memoryProfiler` trinity                                                                                                                                                                            |
| Pattern failure state           | `src/utils/pattern/PatternFailureTracker.js` owns `_count`, `_lastSuccessTime`, `_warningShown`                                                                                                                               | Add `patternFailureCount` / `lastPatternSuccessTime` to the engine. The engine's `_wasmInitWarningShown` is separate — it guards the init-failure toast, not retry warnings                                                                                            |
| Pattern processor readiness     | `isWasmPatternProcessorReady()` from `wasm/WasmPatternProcessor.js`                                                                                                                                                           | Compose `isWasmPatternProcessorAvailable() && !hasWasmPatternProcessorFailed()` at call sites                                                                                                                                                                          |
| Variable cache lookup stages    | `src/utils/pattern/PatternVariableCache.js` — both `SemanticPatternProcessor` and `TwoPhasePatternProcessor` delegate the four shared stages                                                                                  | Mirror phrase-type or full-text-scan changes into the adapters                                                                                                                                                                                                         |
| Phrase consumption marking      | `markPhraseFollowersConsumed` in `src/utils/pattern/PhraseConsumptionMarker.ts` — used by `createPhraseGroups`, `processRemainingPhrasesSequential`, `processRemainingPhrasesParallel`                                        | Hand-roll a mark-as-consumed loop at a new phrase call site                                                                                                                                                                                                            |
| Token ordering by text position | `compareByTokenIndex(a, b)` / `resolveTokenIndex(tokenIndex)` in `src/utils/highlighting/TextPositionMapper.ts` (barrel-exported); missing/negative `tokenIndex` sorts last                                                   | Hand-roll a comparator — one already caused an intransitive-comparator bug (see the CRITICAL FIX comment above `candidateWords.sort`), and a second copy disagreed with it on the missing-`tokenIndex` fallback (`?? 0` vs `?? Number.MAX_SAFE_INTEGER`) until unified |
| Dev console globals             | `installDevConsole(engine)` in `src/utils/__devtools__/DevConsole.js`, called from Translator.jsx's engine-ready effect                                                                                                       | Add debug utilities in App.jsx or Translator.jsx                                                                                                                                                                                                                       |

Adapter-specific logic that legitimately stays split: Semantic's Phase A result injection (seeded as lowest-priority `initialCache`); TwoPhase's step-1b pattern-translated tokens (`patternSemanticType`, runs after the shared stages so it overrides stage-1 proper-noun entries for the same word); and type resolution (Semantic imports `classifyVariableType` from `VariableTypeClassifier.ts`, TwoPhase uses `metadata?.semanticType` with an inline fallback). Canonical phrase type fallback is `metadata?.semanticType || 'concept'`, **not** `'phrase'`.

Ordering matters here because `processChunksInParallel` assigns semantic array indices by chunk **completion** order, not text order. Two sites sort through `compareByTokenIndex`: the Full Translation word-level builder (`TranslationEngine.js`, `candidateWords.sort` — tiebreak for same-length candidates) and the Original Chinese panel (`SegmentPrecomputer.ts`, `precomputeOriginalSegments` — sorts `firstCharIndex` candidate lists, and the word-level `filteredUnits` sort earlier in the same file). **`CharacterOnlyBridge.ts`'s `occurrenceInSource` count is not a sort** — it is a linear scan with its own dual-sided fallback (`i < sourceIndex` when `tokenIndex` is missing on either side). Different shape; do not force it through the shared comparator.

Dev console commands are never automatically tested and rot silently — confirmed twice, once via a guard property that stopped existing (ADR-019) and once via `window.runPatternParityTests` referencing a property that never existed at all. Invoke any new command manually once to confirm its guard passes.

---

## Token and phase semantics

- **`isGrouped` discriminates phrase followers from pattern-consumed tokens.** Both set `groupLeader`. Phrase follower: `isGrouped = true`, `translationSource = 'phrases_consumed'`. Pattern-consumed: `isGrouped` unset, `translationSource = '*_consumed'`. Filtering by `groupLeader` alone conflates them — `getTextFromTokens` and `getSemanticTokens` use `isGrouped && groupLeader !== null` to exclude only phrase followers. Pattern-consumed tokens must stay in `getTextFromTokens` output so text aligns with tokenizer-cached `.start` positions; stripping them shifts phrase lookup offsets for every later token.
- **Every phase must set `groupLeader = startIndex` on consumed tokens at the mark site.** `=== undefined` triggers char-fallback exactly like `null` does, silently corrupting every multi-token match from that phase. `applyMatchToTokens` (Phase 2/4), `applyHierarchicalResults` (Phase 1), and `NumberProcessor.applyConversionResult` (Phase 3 JS) all set it. **`copyWasmTokens` does not copy `groupLeader`** — WASM-path phases need a post-`copyWasmTokens` sweep.
- **Phase 1 output has no `isGrouped`/`groupedWith`.** `applyHierarchicalResults` marks only `translationSource`, `translated`, `groupLeader`. Detect a Phase 1 leader via `translated !== null && translationSource && !translationSource.endsWith('_consumed')`, never via `isGrouped` or `groupedWith.length` — always `false`/`0` there.
- **Phase 2 proper noun lookahead:** `applyDictionaryTranslation` defers a match at position i if any j ∈ [i+1, i+tokenSpan) has a **strictly longer** match — stops "日元" (2 chars at i=1) consuming the 元 that "元始圣人" (4 chars at i=2) needs. Same-length matches at a later position do not defer; earlier start wins (孔宣 beats 宣兄). Applies to shared-index and fallback paths alike.
- **`find_best_pattern_match` / `findBestPatternMatch` tie-break order:** longer match wins, then fewer variables (more literal chars = more specific), then higher priority. Without rule 2, a 2-variable `X的Y上` silently beats a 1-variable `X的手腕上` at equal length. Do not reorder.
- **`checkSemanticArrayCorruption` toasts at most once per translation** via a translation-scoped `let corruptionToastShown = false`; `isCorrupted` is sticky across all 5 phase checks. Any new site that toasts on `isCorrupted` must reuse the flag.
- **`allowedVariableTypes` / `SemanticType` filtering is pure JS** — zero mirror in `wasm-core/src/`. Adding, removing, or renaming a `SemanticType` value in `src/constants/SemanticTypes.ts` never requires a Rust change. Semantic token types: `chinese_char`, `chinese_word`, `latin_word`, `number`. Fiction dicts (`properNouns-f_*`) contain all `SemanticType` values — `metadata.semanticType` is authoritative and the heuristic fires only when it is absent.
- **Never fake per-call isolation by swapping a `this.*` field.** `this.<field> = perCallValue` around an `await` does not isolate calls dispatched via `.map()`/`Promise.all` — async functions run synchronously to their first `await`, so `.map()` executes every call's synchronous prefix, including the swap, before any does real async work. This was the confirmed root cause of the deleted `isolatedSemanticBuilder` mechanism (2026-08-18): every call past the first captured and restored the wrong value. Parallel chunks now write straight to the shared `this.semanticArrayBuilder`. If per-call isolation is genuinely needed, pass the value as a parameter or closure.

`SemanticArrayMetadata` in `SemanticArrayBuilder.ts` tags each field by who actually reads it (architecture review 2026-07-30): `tokenIndex` is consumed by both highlighting paths; `originalStart`/`originalEnd` are char-only-exclusive; `phase`/`dictionary` are provenance-only with zero readers today. `buildSegmentsFromPositions` fires only when **all** `metadata[].originalStart >= 0`, so in practice only for single-chunk (short) texts — test short and long texts separately when changing anything upstream of it.

---

## Punctuation, quotes, and chunk boundaries

- **`cleanupFormatting()` cannot move to WASM and has two branches.** It always runs 27-char dictionary-lookup punctuation translation first (`this.dictionaryManager.translate()` — the blocking constraint), then branches: `options.useChunking !== false` gives a simple spacing fix and early return; the else branch also applies space-after-punctuation and colon-quote handling. It is the single authoritative post-assembly cleanup in `postProcess()` — do not duplicate the logic elsewhere.
- **`translate()` is prefix-match, not exact lookup.** A multi-char key like `'……'` with no exact dict entry matches the 1-char prefix `'…'` and replaces 2 chars with a 1-char translation, silently dropping one. Only add multi-char keys to the 27-char list if they exist as literal punctuation-dict entries.
- **Guard partial matches in `processCharacterOnlyTokens`.** `findLongestMatchAtPosition` on a multi-char punctuation token returns a shorter match than the token's value; check `match.word.length >= token.value.length` before `applyMatchToTokens`, or `token.translated` takes the sub-translation and the remaining chars are lost.
- **The space-after-Chinese-char rule is an allowlist.** The WASM tokenizer types some chars (`…`, `》`) as `unknown`; add a space only when the next token is `chinese_char`, `latin_word`, `TokenType.NUMBER`, or opening-element punctuation. A denylist (`!== 'punctuation' && !== 'whitespace'`) treats `unknown` as content and adds spurious spaces.
- **`「` (U+300C) is not an opening quote** — `QuoteProcessor.isOpeningQuote('「')` returns false, so `fixAngleQuotePositioning` skips it. That function fires for `《`, `〈`, and curly quotes, and uses `chunk.translatedPunctuation || fallback` so dict mappings (`《→«`, `〈→<`) survive. Colon context in a skipped chunk's `startedBy` is not propagated to the content chunk here; `applySmartCapitalization`'s fallback block (checking `chunks[i-1].content.trim() === ""`) handles that instead.
- **`PunctuationProcessor.processSequence` needs `!endsWithOpeningQuote` in `needsTrailingSpace`.** WASM combines consecutive punctuation like `”《` into one field; without the guard a trailing space lands between the quote and the content.
- **Separate empty-content chunks come from leading punctuation, not mid-text punctuation.** The JS chunker's char-loop flushes only when a content char follows accumulated punctuation, or at end of input — mid-text punctuation merges onto the still-open preceding chunk. `chunkText('道：「说')` yields `[{content:"道", punctuation:"：「", startedBy:"start"}, {content:"说", punctuation:"", startedBy:"：「"}]`. Leading punctuation (`《标题》内容`) is what produces `{content:"", punctuation:"《", startedBy:"start"}`. Verified against `TextChunker.chunkText()` with WASM mocked out; an earlier worked example here was wrong.

---

## Dictionaries

- **`*.trie.json` files are the JS Map-based trie cache**, written by `PrecomputedTrieCache.js` — nothing WASM-related. Do not delete them; they speed up cold starts.
- **Trie-node metadata is not uniform across load paths.** Three paths build tries with three per-entry `metadata` shapes: the main load loop's fallback (enriches with `priority`/`frequency`/`dictionary`), `DictionaryTrieLoader`'s cache-miss build (raw JSON `target` only), and `lazyLoadDictionary` (none at all). Harmless today — no reader touches per-entry `priority`/`frequency`, and Rust treats the field as an opaque passthrough string — but do not assume completeness.

---

## `// @ts-check` coverage

26 files have `// @ts-check` active (grep the comment to find them); they were explicitly fixed to 0 errors, so do not remove it without understanding that. 18 utils remain deferred at 25–69 errors each.

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

---

📖 Testing gotchas for this directory live in [`docs/guides/gotchas.md#testing-gotchas`](../../docs/guides/gotchas.md#testing-gotchas).
