# Code Review: Pure Computation Migration to wasm-core

**Date**: 2026-02-19
**Scope**: `TranslationEngine.js` (10,854 lines) + supporting utilities
**Goal**: Identify pure computation currently in JS that could be moved to the existing `wasm-core` crate
**Status**: Research / Decision Record — Candidate 1 implemented (2026-02-20)

---

## Executive Summary

The codebase already has an exceptionally mature WASM integration. 11 distinct Rust modules are in production (number processing, pattern matching, dictionary trie, position mapping, string processing, text assembly, text chunking, segment matching, tokenizer, regex utils, boundary optimizer). The hard lesson — already documented in the constructor comments — is that **WASM boundary crossing overhead (15–20ms for 1,700+ calls) dominates over algorithmic gains for per-call operations**. The WASM Dictionary Trie was disabled precisely because it was 2× slower than `Map.get()` due to this.

The most actionable finding is **not a new migration, but an incomplete one**: `TextAssembler` was built in Rust, benchmarked at 30–50% faster, but never connected to `TranslationEngine.js::postProcess()`. That is the highest-value opportunity. Everything else is either already covered, too small to matter, or architecturally coupled.

---

## What Is Already in WASM (Do Not Duplicate)

| Rust Module                                 | JS Counterpart                 | Status                                                                       |
| ------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| `number_processor.rs`                       | `WasmNumberProcessor.js`       | ✅ Active (5–10× speedup)                                                    |
| `pattern_processor/` (two-phase)            | `WasmPatternProcessor.js`      | ✅ Active (10–50× for 2000+ chars)                                           |
| `position_mapper.rs` (Boyer-Moore-Horspool) | Used in `semanticArrayBuilder` | ✅ Active (3–5× speedup)                                                     |
| `text_assembly.rs`                          | `WasmTextAssembler.js`         | ✅ Active — `assembleWithSpacing()` powers postProcess() Step 2 (2026-02-20) |
| `dictionary_trie.rs`                        | `WasmDictionaryTrie.js`        | ⚠️ Built, disabled (2× slower due to boundary overhead)                      |
| `string_processor.rs`                       | `WasmStringProcessor.js`       | ✅ Active (token cache)                                                      |
| `text_tokenizer.rs`                         | `WasmTextTokenizer.js`         | ✅ Active                                                                    |
| `text_chunker.rs`                           | `WasmTextChunker.js`           | ✅ Active                                                                    |
| `segment_matcher.rs`                        | Used via `SegmentMatcher`      | ✅ Active                                                                    |
| `wasm_boundary.rs`                          | `BoundaryOptimizer`            | ✅ Active                                                                    |
| `regex_utils.rs`                            | `WasmRegexUtils.js`            | ✅ Active                                                                    |

---

## Migration Candidates

### Candidate 1 — Wire `TextAssembler` into `postProcess()` (HIGHEST PRIORITY)

**Function**: The text assembly loop inside `postProcess()`, lines ~4458–4641
**What it does**: Iterates over translated `segments[]`, joins them with spacing logic (9 spacing rules), tracks `currentPosition` for semantic array position recording, then calls `cleanupFormatting()`

**Why it's a WASM candidate**:

- `TextAssembler` in `text_assembly.rs` already exists and is proven 30–50% faster at string building (pre-allocated `String::with_capacity`, zero reallocations)
- `WasmTextAssembler.js` already wraps it with a production-ready JS API
- The wrapper is imported in `OptimizationBenchmarks.js` but **never imported in `TranslationEngine.js`**

**Status: COMPLETED (2026-02-20)**

`assemble_with_spacing()` added to `TextAssembler` (Rust) with all 9 spacing rules via `needs_space()`. `WasmTextAssembler.js::assembleWithSpacing()` wraps it with JS fallback. `TranslationEngine.js` imports and calls it; the ~148-line Step 2 loop is replaced. Parity tests: `src/utils/__tests__/TranslationEngine.textAssembly.test.js` (36 tests).

**Historical note — what the blocker was**:
The original `postProcess()` assembly loop interweaved three concerns in one pass:

1. **String building**: `result += current.text` + conditional spacing
2. **Semantic array position recording**: `semanticArrayBuilder.setPositionByMatch(tokenIndex, text, start, end)` per segment
3. **Dictionary fallback**: `dictionaryManager.translate(token.value, ['characters'])` for untranslated Chinese tokens

The `TextAssembler` WASM module only handles concern #1 (string building + semantic arrays with positions). Concerns #2 and #3 require JavaScript-side state.

**Migration path** (two steps):

- **Step A (lower risk)**: Extract the dictionary fallback (concern #3) into a pre-pass that resolves all untranslated tokens before the assembly loop. This removes the `this.dictionaryManager` call from inside the loop. The spacing and assembly then become a clean data transformation.
- **Step B (higher risk)**: Once the loop is purely data-driven, pass the segments to `TextAssembler`. The Rust assembler already returns an `AssemblyResult` with semantic arrays and positions — this may require extending it to match the current 9-rule spacing logic.

**Migration complexity**: MEDIUM (infrastructure exists; needs spacing rules in Rust + pre-pass refactor)
**Estimated performance gain**: MEDIUM — 30–50% faster text assembly. For a 2000-char translation producing ~200 segments, this saves ~0.5–2ms per pass. Meaningful for streaming/chunked mode where `postProcess()` is called once per chunk (35 segments × postProcess = 35 calls).
**Risks**:

- The 9 spacing rules in the assembly loop are currently JS-only; they must be faithfully replicated in Rust or assembly correctness will break
- `semanticArrayBuilder.setPositionByMatch()` tracks positions for clickable highlighting — any position drift between JS and WASM assembly would break highlighting
- The spacing rules interact with `TokenType` enum values; these must stay in sync between JS and Rust

---

### Candidate 2 — `resolveGlobalConflicts()`: consolidate into Rust (MEDIUM PRIORITY)

**Function**: `resolveGlobalConflicts(allMatches, _tokens)`, line ~2709
**What it does**: Given N candidate phrase/pattern matches, sorts by length-first then type priority, then greedily selects non-overlapping matches (interval scheduling). O(n log n) sort + O(n²) worst-case selection.
**`this.*` usage**: Only `this.log()` — logging only, not state

**Status: DO NOT MIGRATE — evaluated and rejected (2026-02-20)**

**The original premise was wrong.** `find_best_pattern_match()` in `matcher.rs` is **not** a counterpart of this function. It selects the best pattern at a _single position_ during Phase 1; `resolveGlobalConflicts()` runs greedy interval scheduling across _all positions at once_ (Phase 4). The JSDoc comment claiming parity was incorrect.

**Three independent reasons WASM is not viable here**:

1. **Serialization overhead dominates**: 100–500 match objects × 70–200 bytes each = 7–100 KB JSON per call. `JSON.stringify` + `JSON.parse` alone costs 5–20 ms; the JS implementation runs in <1 ms. WASM would be 5–20× **slower**.
2. **Not a bottleneck**: Pure greedy scheduling — O(n log n) sort + one linear scan. V8 handles 500 matches in <1 ms. No algorithmic complexity advantage to move to Rust.
3. **High correctness risks**: Pattern matches lack a `length` field in production (phrases have it); WASM deserialization creates new objects, breaking object-identity semantics; `undefined` fields are silently dropped by `JSON.stringify`.

**What was done instead**: Added a test-only Rust implementation of the same greedy algorithm in `wasm-core/tests/conflict_resolution_parity_test.rs` (15 tests, no `#[wasm_bindgen]`). If anyone edits the sort comparator or selection logic in either JS version, `cargo test` catches it immediately without any production overhead.

**Real sibling**: `resolveMatchConflicts()` (~line 2381, Phase 2) uses the same greedy logic in JS. Changes to `resolveGlobalConflicts()` must be manually mirrored there.

---

### Candidate 3 — `applyFinalCleanup()` + `capitalizeFirstLetter()` + `applyLightFormatting()` as a bundled string post-processor (LOW PRIORITY)

**Status: DO NOT MIGRATE — evaluated and rejected (2026-02-20)**

**The bundling premise is false.** The three functions are on three separate execution paths and cannot share a single WASM boundary crossing:

| Function                               | Execution path                                                                      | WASM viable?                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `cleanupFormatting()` (most impactful) | `postProcess()` hot path, line 4483                                                 | ❌ Line 4917: calls `this.dictionaryManager.translate()` for 27 Chinese punctuation chars — must stay in JS |
| `applyFinalCleanup()`                  | Chunked paths only (lines 6652, 7216, 9308, 9347) — **not** in main `postProcess()` | ❌ 4 simple regexes (<0.05ms), not in hot path                                                              |
| `applyLightFormatting()`               | Character-only mode only (line 1733) — no WASM in that path at all                  | ❌ Would add WASM overhead where none exists                                                                |
| `capitalizeFirstLetter()`              | Per-chunk during smart capitalization (line 9076)                                   | ❌ Per-chunk scope, one regex, would require restructuring                                                  |

The "zero additional boundary cost" insight in the original note only holds if ALL post-processing could run inside the existing `assemble_with_spacing()` WASM call. But `cleanupFormatting()` must run in JS (dictionary lookups), so there is always a JS step between WASM assembly and any potential final WASM post-processing — negating the bundling benefit.

**Two additional issues found during investigation** (both fixed in this session):

1. **Dead code in `cleanupFormatting()` (lines 4933–4943)**: The second `if (options.useChunking !== false)` block was unreachable — the first block always `return`s early, so the condition at line 4933 was always false. Result: space-after-punctuation rules and colon-quote special cases never executed. Fixed: changed to `} else {` so these rules now apply for non-chunking mode.

2. **`applyCapitalizationToText()` was dead code (line 9287)**: Zero call sites anywhere in `src/`. Deleted.

**Original assessment** (for reference):

- Migration complexity: LOW — simple regex/string operations
- Estimated performance gain: LOW — V8 regex is fast; expected savings <0.5ms
- Note: "If `TextAssembler` (Candidate 1) is connected, `applyFinalCleanup()` could be included as a final Rust post-processing step at zero additional boundary cost" — this note was incorrect; the boundary cost is NOT zero because `cleanupFormatting()` must run in JS between assembly and any final post-processing.

---

### Candidate 4 — `findPositionOptimized()` and `buildSegmentsFromSemanticArrays()` batch position finding (LOW-MEDIUM PRIORITY)

**Functions**:

- `findPositionOptimized()` line ~10607: windowed `indexOf` with a 1000-char window + Map cache. No `this.*` state.
- `buildSegmentsFromSemanticArrays()` line ~10269: linear `indexOf` scan over semantic arrays. No `this.*` state.
  **`this.*` usage**: Only `this.log()` and `this.debugLevel`

**Why it's a WASM candidate**:
`PositionMapper` already exists in Rust (`position_mapper.rs`) using Boyer-Moore-Horspool (O(n/m) vs `indexOf`'s O(n)). The `findPositionOptimized()` function is doing effectively the same work — windowed string search — that `PositionMapper` was designed for. If position finding is called many times per translation (which it is for large texts), replacing it with a single batch call to `PositionMapper` could meaningfully reduce total time.

**Migration complexity**: MEDIUM — Requires extending the batch API of `PositionMapper` or connecting these functions to the existing `PositionMapper` WASM export.
**Estimated performance gain**: MEDIUM — For long texts with many segments, repeated `indexOf` in the 10,000+ char translated output could take 1–5ms total. BM-Horspool amortizes well across a batch.
**Risks**: The windowed cache in `findPositionOptimized()` is there to avoid re-scanning from 0 every time; the Rust implementation needs to preserve this incremental behavior.

---

### Candidate 5 — `estimateDictionaryDensity()` and `analyzeTextComplexity()` (NEGLIGIBLE)

**Functions**:

- `estimateDictionaryDensity()` line ~10696: regex-based sampling on first 500 chars. No `this.*` state.
- `analyzeTextComplexity()` line ~10650: 4-factor weighted score. Calls `this.estimateDictionaryDensity()` and `this.log()`.

**Estimated performance gain**: NEGLIGIBLE — These run once per translation to decide whether to use chunking. Single call, fast regex. Not worth WASM.

---

## Code Quality Issues Found (Not WASM-related)

These are bugs/smells independent of the WASM migration question.

### Issue 1 — ~~Hardcoded debug check for specific numbers in `cleanupFormatting()`~~ RESOLVED (already fixed before this review)

**Original concern**: `'23'`/`'30'` debug checks ran in production (no `process.env.NODE_ENV` guard).

**Actual state**: Both debug blocks ARE wrapped in `if (process.env.NODE_ENV === 'development')` (lines 4874 and 4977 in the current code). The outer guard was already present when this review was written. No action needed.

**Related fix**: The dead code issue in `cleanupFormatting()` discovered during Candidate 3 evaluation (lines 4933–4943 `else` block unreachable) WAS fixed — see Candidate 3 section.

---

### Issue 2 — `capitalizationRules` constant duplicated across two methods [LOW]

**Locations**: `applySmartCapitalization()` line ~9099 and `applySmartCapitalizationToBatch()` line ~9442

The 26-entry `capitalizationRules` object is copy-pasted verbatim in both methods. `applySmartCapitalizationToBatch()` is even marked `// DEPRECATED` in the JSDoc. This duplication means a rule change must be made in two places.

**Fix**: Hoist `capitalizationRules` to a module-level `const` outside the class. Then remove `applySmartCapitalizationToBatch()` if it's genuinely deprecated (verify with grep first).

---

### Issue 3 — `applySmartCapitalizationToBatch()` is marked deprecated but not removed [LOW]

**Location**: Line ~9434, 60+ lines

The JSDoc says `@deprecated` and the comment says "DEPRECATED". If no callers remain, this is dead code. Verify and remove.

```bash
grep -r "applySmartCapitalizationToBatch" src/
```

---

### Issue 4 — ~~`WasmTextAssembler` is dead code in production~~ RESOLVED (2026-02-20)

`assembleWithSpacing()` is now imported and called in `TranslationEngine.js::postProcess()`. The 9 spacing rules live in `needs_space()` (Rust) and `needsSpace()` (JS fallback in `WasmTextAssembler.js`).

---

### Issue 5 — ~~`resolveGlobalConflicts()` has a dual-implementation maintenance risk~~ RESOLVED (2026-02-20)

The original issue was based on a false premise: `find_best_pattern_match()` (Rust `matcher.rs`) is not a counterpart of `resolveGlobalConflicts()` — they solve different problems. The misleading JSDoc comment claiming parity has been corrected.

The real maintenance risk (algorithmic divergence between `resolveGlobalConflicts()` Phase 4 and `resolveMatchConflicts()` Phase 2, both JS) is now covered by a Rust parity validator: `wasm-core/tests/conflict_resolution_parity_test.rs` — 15 tests, catches divergence at `cargo test` time with zero production overhead.

---

### Issue 6 — `applyBatchCapitalization()` (~line 9557) may be additional dead code [LOW]

A third capitalization function exists alongside `applySmartCapitalization` and the deprecated `applySmartCapitalizationToBatch`. Verify call sites:

```bash
grep -n "applyBatchCapitalization" src/utils/TranslationEngine.js
```

---

## src/utils/ Scan: Other Pure Computation Candidates

### `ChineseNumberConverter.js`

**Status**: Already covered — `number_processor.rs` handles the same conversion patterns. `WasmNumberProcessor.js` wraps it with JS fallback. No action needed.

### `PositionMappingUtils.js` — `tokenPositionToCharPosition()`

**Status**: Pure function (token index → char offset). O(n) walk. Small, called infrequently. WASM would not help due to boundary overhead for a single call.

### `SemanticPatternProcessor.js` — `PrecomputedTokenStrings` class

**Status**: Lines 35–100+. Precomputes O(n²) token substrings to eliminate dynamic `slice().map().join()` calls in the pattern matching hot path. Pure computation, no state. This is essentially the same optimization that `StringProcessor` in `wasm-core/src/string_processor.rs` provides. Verify whether `StringProcessor` is already used for this purpose; if so, `PrecomputedTokenStrings` may be a JS fallback that's no longer needed.

---

## `Translator.jsx` Scan

No pure computation utilities found that would benefit from WASM migration. `Translator.jsx` is coordination logic — state management, UI event handling, dictionary reload orchestration. All computation is delegated to `TranslationEngine.js` or direct Tauri commands.

---

## Migration Priority Order (Top 5)

| Priority | Candidate                                                                                               | Complexity | Gain   | Rationale                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1        | ~~Wire `TextAssembler` into `postProcess()`~~ **DONE** (2026-02-20)                                     | MEDIUM     | MEDIUM | `assembleWithSpacing()` live in postProcess()                                                                             |
| 2        | ~~Consolidate `resolveGlobalConflicts()` into Rust~~ **REJECTED** (2026-02-20)                          | —          | —      | Premise wrong: `find_best_pattern_match` is a different algorithm; WASM 5–20× slower; Rust parity validator added instead |
| 3        | ~~Bundle `applyFinalCleanup`/`applyLightFormatting`/`capitalizeFirstLetter`~~ **REJECTED** (2026-02-20) | —          | —      | Functions on 3 separate paths; `cleanupFormatting` has dict-lookup blocker; dead code fixed instead                       |
| 4        | ~~Fix `cleanupFormatting()` debug log guards~~ **ALREADY FIXED** (pre-existing)                         | —          | —      | `process.env.NODE_ENV === 'development'` guard was already present                                                        |
| 5        | Hoist `capitalizationRules` + remove dead `applySmartCapitalizationToBatch`                             | LOW        | LOW    | Code quality; eliminates duplication and dead code                                                                        |

---

## What Cannot Be Migrated to WASM

| Function/Section                                                     | Lines   | Reason                                                                                                    |
| -------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `translateSinglePass()`                                              | ~7660   | Shared mutable `tokens[]` state across all 5 phases; synchronous coordination                             |
| `postProcess()` (full method)                                        | ~4308   | Calls `semanticArrayBuilder.*`, `dictionaryManager.translate()`, phase coordination                       |
| `findAllMatchesWithSemanticCache()`                                  | —       | Cache invalidation timing is phase-critical                                                               |
| All phase methods (`applyPatterns`, `processRemainingPhrases`, etc.) | Various | Phase-order-dependent token consumption                                                                   |
| `applySmartCapitalization()` (full method)                           | ~9096   | Calls `QuoteProcessor.isOpeningQuote()`, `this.isProperNounTranslation()`                                 |
| `cleanupFormatting()`                                                | ~5007   | Calls `this.dictionaryManager.translate()` for punctuation lookup                                         |
| `updateSegmentPositions()`                                           | ~4960   | Iterates `this.translationSegments` — instance state                                                      |
| `getSourcePriority()` closure                                        | ~7763   | Captures `this.activeProperNouns` — dynamic proper-noun list                                              |
| `resolveMatchConflicts()`                                            | ~2381   | Contains proper-noun compound-word rules referencing match metadata; too complex to serialize efficiently |

---

## Key Architectural Principle (Already Documented in Codebase)

From the `TranslationEngine.js` constructor comments (lines 295–314):

> "WHY SLOWER: JS↔WASM boundary crossing: ~15-20ms overhead for 1,700 calls. String marshaling: UTF-16 → UTF-8 conversion each call. Modern V8 Map is incredibly fast. Single-character lookups: Map.get() is ideal."
>
> "REACTIVATE WHEN: (1) WebAssembly Interface Types available → zero-copy string sharing; (2) Batch processing API → single WASM call for entire text; (3) Dictionary size > 50,000 entries."

The decision framework for any future WASM migration should be:

- **Batch operations over many items in a single WASM call**: favored
- **Single calls for small data**: not worth it
- **Algorithmic complexity advantage (O(n/m) vs O(n))**: favored when input is large
- **Text assembly with pre-allocated capacity**: favored (this is Candidate 1)
