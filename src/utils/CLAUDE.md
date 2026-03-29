# src/utils — Gotchas

## TranslationEngine Internals

### `addUnit` Third Arg Must Be a Valid `PHASE_PRIORITIES` Key

Common wrong values (all silently return priority 999 — below the character fallback):

- `'patterns'` (plural) — correct is `'pattern'` (singular)
- `'numbers'` — correct is `'number_conversion'`
- `'passthrough'` — pass-through NUMBER/LATIN_WORD tokens use `'characters'`
- `match.dictionary` (at phrase call sites) — correct is `'phrases'`; pass `match.dictionary` as arg 6 (the `dictionary` metadata field)

`validateConsumedTokenContract` detects consumed sources with `.includes('_consumed')` — this predicate must match `getSourcePriority`'s check exactly.

### `SemanticArrayBuilder` ↔ `OptimizedSemanticArrayBuilder` Must Stay Field-Synchronized

`OptimizedSemanticArrayBuilder.ts` is the default production builder (`TranslationEngine.js` line 348). Any field added to `SemanticArrayMetadata` in `SemanticArrayBuilder.ts` must also be added to `OptimizedSemanticMetadata`, initialized to its default in `addUnit()`, and handled in `setPositionByMatch()`. Omitting this makes the field always `-1`/`null` in production while appearing to work with `?optimized-semantics=false`. Also applies to method algorithms: `updateWithCapitalizedText` must use the same fast-path + `indexOf` algorithm in both builders (not regex-based).

### `addUnit` Requires All 6 Args at Every Call Site

Signature: `addUnit(originalText, translatedText, source, tokenIndex, phase, dictionary)`. The `phase` and `dictionary` args (5 and 6) are metadata — they don't affect priority, but omitting them silently leaves provenance fields `null` for every entry, making debugging and future priority-aware scans unreliable.

- **Direct call sites** (hierarchical, phrase, number phases): pass `phase` and `dictionary` explicitly.
- **`processChunksInParallel` merge loop** (~line 7023): correctly passes all 6 args from `isolatedArrays.metadata?.[j]`. After adding a new field to `addUnit`, propagate it through this merge loop too.

### Duplicate-Word Highlighting Requires `tokenIndex` Ordering in Three Places

All three stem from the same root cause — `processChunksInParallel` assigns semantic array indices by chunk completion order, not text order:

1. **Full Translation word-level builder** (`TranslationEngine.js` ~line 6644): sort `candidateWords` by `tokenIndex` ascending for same-length ties.
2. **Full Translation → Char-only bridge** (`Translator.jsx` ~line 1127): count `occurrenceInFullTranslation` using `metadata[i].tokenIndex < clickedTokenIndex`, not `i < activeIndex`.
3. **Original Chinese panel** (`SegmentPrecomputer.ts` ~line 724): sort `firstCharIndex` candidate lists by `tokenIndex` ascending after building them.

Any new greedy scan or occurrence counter over the semantic array must use `tokenIndex` order.

### `getSemanticTokens` Requires `TextToken[]`, Not a String

`getSemanticTokens(chunk.content)` silently returns `[]` because `chunk.content` is a string. When computing chunk token counts for `chunkOffset` in `processChunksInParallel`/`translateWithChunking`, always call `this.tokenizer.tokenize(chunk.content).length`. Using the wrong call zeros all cross-chunk token offsets, breaking same-translated-text disambiguation.

### `token.start` Is a Byte Offset, Not a Char Offset

Chinese chars are 3 bytes each, making `token.start` ~3× too large for char-position arithmetic. In `postProcess`, use cumulative `tokenCharPositions`: `tokenCharPositions[i] = sum of tokens[0..i-1].value.length`.

### `buildSegmentsFromPositions` Fires Only When ALL `metadata[].originalStart >= 0`

Since the parallel merge loop drops `originalStart`, this path never activates for multi-chunk translations — only for single-chunk (short) texts. Fixing the merge loop can trigger "no highlighting" regression if the path has latent bugs — test both short and long texts separately before enabling.

### `resolveGlobalConflicts` and `resolveMatchConflicts` Are Siblings With Intentionally Inverted Priority

`resolveMatchConflicts` (Phase 2, ~line 2383): patterns beat regular phrases at equal length. `resolveGlobalConflicts` (Phase 4, ~line 2686): phrases beat patterns at equal length (Phase 1 pattern tokens are already consumed by Phase 4). Do NOT harmonize them — the inversion is architectural. Algorithm changes must be mirrored in all three: `resolveMatchConflicts` JS, `resolveGlobalConflicts` JS body (delegates to `WasmConflictResolution.js`), and `wasm-core/src/conflict_resolution.rs::run_conflict_resolution`.

### `cleanupFormatting()` Has Two Branches and Cannot Be Migrated to WASM

Always does 27-char dictionary-lookup punctuation translation first (calls `this.dictionaryManager.translate()`). Then branches: `options.useChunking !== false` → simple spacing fix + early return; `else` → also applies space-after-punctuation rules and colon-quote handling. The dictionary loop is the blocking constraint. Do not duplicate this logic elsewhere — it is the single authoritative post-assembly cleanup step in `postProcess()`.

### `checkSemanticArrayCorruption` Uses `corruptionToastShown`

A translation-scoped `let corruptionToastShown = false` guards `toast.error` to at most once per translation. `isCorrupted` is sticky across all 5 phase checks. Any new call site that toasts on `isCorrupted` must reuse this flag.

### `SemanticPatternProcessor` ↔ `TwoPhasePatternProcessor` Variable Caches Must Stay in Sync

Both have parallel `buildVariableCache` implementations. Changes to phrase type handling, token type filtering (`getSemanticTokens`/`extractSemanticTokens`), or `classifyVariableType` fallbacks in one must be mirrored in the other. Canonical phrase fallback: `metadata?.semanticType || 'concept'` (NOT `'phrase'`). Semantic token types: `chinese_char`, `chinese_word`, `latin_word`, `number`.

### `buildVariableCache` `shouldInclude` Requires `hasUnconstrainedPatterns` Guard

`requiredTypes` collects all types in any pattern's `allowedVariableTypes`. Filtering by `requiredTypes` is only correct when ALL patterns are constrained — any unconstrained pattern accepts any type, so filtering would silently exclude entries it needs. Guard: `if (!requiredTypes || hasUnconstrainedPatterns) return true;`.

### WASM Singleton Modules Must Call `.initialize().catch(warn)` at Module Bottom

Any `src/utils/wasm/Wasm*.js` that exports a singleton must trigger background init at import time. Missing this forces every first caller onto the slow JS fallback path. **Exception — `WasmPatternProcessor.js`**: exports functions, not a singleton; its module-bottom prewarm is a self-calling IIFE that only warms the ES module cache via `fetchWasmBinary`.

### `new URL(path, import.meta.url)` Requires a Static String Literal

Template literals prevent Vite's asset URL transform — the URL resolves in dev but breaks in production. Always write: `new URL('../../wasm/name.wasm', import.meta.url)` with a hard-coded string. Applies to every `fetchWasmBinary` call site and the prewarm IIFE in `WasmPatternProcessor.js`.

### `needs_space()` / `needsSpace()` Are the Canonical Spacing Rules

9 spacing rules in `wasm-core/src/text_assembly.rs::needs_space()` (Rust) and `src/utils/wasm/WasmTextAssembler.js::needsSpace()` (JS fallback) must stay in sync. Parity spec: `src/utils/__tests__/TranslationEngine.textAssembly.test.js`.

### `validatePhasePriority` Must Use Literal Priority Numbers

`PHASE_PRIORITIES` keys are `translationSource` strings — not phase-group labels. `PHASE_PRIORITIES.patterns` / `.properNouns` / `.numbers` are all `undefined`. Always pass a literal `1|2|3|4|5`.

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

📖 [Full testing gotchas](docs/guides/development.md#testing-gotchas)
