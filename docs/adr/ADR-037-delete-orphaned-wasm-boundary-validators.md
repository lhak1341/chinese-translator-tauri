# ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`

**Status:** Decided
**Date:** 2026-08-08

## Context

An architecture review round (candidate #3) flagged two parallel "validate data crossing the WASM boundary" implementations as production-dead:

- `src/utils/wasm/WasmBoundaryValidation.ts` — `validateWasmToken`, `copyWasmTokens`, `validateWasmPatternMatch`, `validateRustLookupMatch`, `isMetadataSizeValid`, `MAX_WASM_METADATA_SIZE`, plus a live export `validateWasmDictionaryMatch`.
- `types/WasmTypes.ts` — a stray file at the repo root (outside `src/`), duplicating `validateWasmToken`/`copyWasmTokens` with a genuinely reversed `copyWasmTokens` parameter order, plus its own copy of `validateWasmDictionaryMatch`.
- `src/types/WasmTypes.d.ts` — a `WasmToken` type declaration, type-only-imported by `WasmBoundaryValidation.ts` and by nothing else.

Investigation during grilling found this was more than a simple dead-export prune:

1. **`copyWasmTokens`/`validateWasmToken` were real production code for ~5 months, not dead-on-arrival.** `git log -S copyWasmTokens` traces their sole production call site to `TranslationEngine.js`'s Phase 3 (WASM NumberProcessor boundary copy), removed in `b1dd912` (2026-06-20) when Phase 3 moved to pure JS. They regressed to dead code as a side effect of an unrelated, deliberate architecture decision — not because the validation approach itself was rejected.
2. **`validateWasmPatternMatch`, `validateRustLookupMatch`, `isMetadataSizeValid`, `MAX_WASM_METADATA_SIZE`** show no pickaxe hits for ever being imported by production code — these were dead-on-arrival, written for boundaries (pattern matching, Rust lookup) that never got wired in.
3. **`types/WasmTypes.ts`'s copy of `validateWasmDictionaryMatch` had drifted from the real one**: it required `m.dictionary` to be a string (throwing if absent), while the production version in `WasmBoundaryValidation.ts` (used by `src/utils/dictionary/DictionaryWasmLookup.js`) has no such requirement. `WasmBoundaryEdgeCases.test.js` tested the drifted copy, not the real one — giving false confidence about production behavior. The real `validateWasmDictionaryMatch` was already correctly covered by `WasmBoundaryValidation.test.ts`.
4. **The live WASM wrappers that remain do zero structural validation today.** `WasmPatternProcessor.js`'s `processTokensWasm` and `WasmTextChunker.js`'s `chunkText` both `JSON.parse` the WASM output and return/use it directly — no per-field validation, no undefined→null conversion, no array-length check. This is a real, currently-open gap, distinct from the dead code being removed here.

## Decision

- Deleted `types/WasmTypes.ts`, its dedicated test `WasmTypes.test.ts`, `WasmBoundaryEdgeCases.test.js` (all 13 describe blocks covered either dead functions or the drifted `validateWasmDictionaryMatch` copy), and `src/types/WasmTypes.d.ts` (orphaned once its sole type-only importer was removed).
- Removed `validateWasmToken`, `copyWasmTokens`, `validateWasmPatternMatch`, `validateRustLookupMatch`, `isMetadataSizeValid`, `MAX_WASM_METADATA_SIZE` from `WasmBoundaryValidation.ts`. Kept `validateWasmDictionaryMatch` — it is live, called by `DictionaryWasmLookup.js`.
- Trimmed `WasmBoundaryValidation.test.ts` to only the surviving `validateWasmDictionaryMatch` describe block.

## Reasoning

**The deletion test passes cleanly for everything removed.** Nothing downstream referenced any of the deleted runtime exports outside their own now-deleted tests; the type-only `WasmToken` import had exactly one consumer (the file being pruned).

**Not a rejection of the validation approach — a side effect of a different, already-settled decision.** `copyWasmTokens`/`validateWasmToken` dying with the WASM NumberProcessor doesn't mean two-phase boundary validation was found wanting; it means the boundary it protected no longer exists. Re-litigating "should WASM output be validated" is a live question (see below), but it's independent of whether this specific dead code should be deleted.

**Do not re-wire `copyWasmTokens`/`validateWasmToken` into `WasmPatternProcessor.js`/`WasmTextChunker.js` as part of this cleanup.** Their shape (`WasmToken[]` with `value`/`translated`/`translationSource`) doesn't match what those wrappers actually pass across the boundary (semantic tokens JSON for patterns, chunk objects for the chunker) — retrofitting would require a real design pass on the validator's shape, not a quick import. This is flagged as a genuine open gap, not resolved here, so a future review doesn't either (a) silently rediscover "WASM output isn't validated" as if it were new, or (b) assume this ADR settled that question when it only settled the dead-code question.
