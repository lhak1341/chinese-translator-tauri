# System Architecture

What the source can't tell you quickly: which code path runs, and the contracts that cross the WASM boundary. The 5-phase order and the consumed-token contract are in the root `CLAUDE.md` and ADR-004; the WASM modules are described in `wasm-core/CLAUDE.md` and `src/utils/wasm/CLAUDE.md`. Number processing is pure JS (`NumberProcessor.js`); the Rust `number_processor.rs` is a parity spec only (ADR-041).

---

## Execution Paths (Full Translation vs Character-only)

Know which path runs before adding a debug log.

| Aspect                  | Full Translation                | Character-only                         |
| ----------------------- | ------------------------------- | -------------------------------------- |
| **TextChunker**         | WASM (Rust)                     | JavaScript                             |
| **Text Reconstruction** | `reconstructTextWithSegments()` | `reconstructText()`                    |
| **Semantic Arrays**     | Built during reconstruction     | Built separately by SegmentPrecomputer |
| **Parallel Processing** | `processChunksInParallel()`     | Simpler sequential path                |

**Log where every content type arrives.** `postProcess()` runs only for content a phase translated. A number already in Arabic digits (`23/30`), Latin text and punctuation skip it, so a log there never fires for them. `applyFinalCleanup()` runs on all translated text in both modes, so put it there (a `(23/30)` spacing bug was chased through `postProcess()` for exactly this reason).

**A `/` stays inside a fraction.** The chunker config excludes it from chunk separators (`excludedCharacters` in `TranslationEngine.js`; regression test `TranslationEngine.regression.test.js`, `cleanup('(23/30)')`).

---

## WASM/JS Lookup Parity

**4-layer state synchronization** (React → JS → WASM → Rust) can diverge if WASM sync fails silently.

**Parity validation** (replaces the January 2025 runtime check, ADR-058): the runtime post-reload check never ran and is deleted. The WASM dictionary lookup tier it compared against was itself deleted 2026-10-04 (ADR-073), along with the Rust trie; `src/utils/__tests__/DictionaryManager.exactLookup.test.js` keeps the exact-lookup cases for the JS path.

---

## Semantic Arrays (Clickable Highlighting)

Positions are recorded during `postProcess()` text assembly and mapped by `SemanticArrayBuilder` (`src/utils/highlighting/`), not searched for afterwards. Translation and original text must stay in exact sync for click highlighting; every translation mode has to preserve the semantic array structure.

Highlighting has two separate code paths (ADR-002):

- **Character-only:** `ClickableTranslationSemantic.tsx` computes segments on demand with `SegmentPrecomputer` (`src/utils/highlighting/`).
- **Full Translation:** `ClickableTranslationOptimized.tsx` uses the segments `TranslationEngine.js` prebuilds during `translateWithProgressiveBatches()` and hands over with the result (`setFullResult(text, arrays, segs)` in `useTranslationResults.js`), **not** `SegmentPrecomputer`.

Find which mode has the bug first, then log in that mode's segment creation.

---

## Token Processing Contracts (WASM-JavaScript Boundaries)

**Rust `Option<String>` serializes to JavaScript `undefined`, not `null`.** Copying it straight over displays the literal text "undefined".

```javascript
// ❌ WRONG: copies undefined
tokens[i].translated = processedTokens[i].translated;

// ✅ CORRECT: explicit null for consumed tokens
if (processed.translationSource?.includes('consumed')) {
  tokens[i].translated = null;
} else if (processed.translated !== undefined) {
  tokens[i].translated = processed.translated;
}
```

Every token processor, WASM or JavaScript, must keep the token array's length (no insert or delete), modify tokens in place, and use explicit `null` for optional fields. `postProcess()` relies on it: a consumed token (`translated: null` plus a `translationSource`) is skipped, and one with `translated` set is processed instead.

Only `validateWasmDictionaryMatch()` survives in `src/utils/wasm/WasmBoundaryValidation.ts` (ADR-037); its test is `WasmBoundaryValidation.test.ts`.

---

## Related Guides

- [Development Guide](./development.md) - Development guidelines, logging, testing
- [Performance Guide](./performance.md) - Performance monitoring and optimization
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
- `docs/archive/pattern-optimization/` - WASM optimization history
