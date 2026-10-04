/**
 * @file WasmBoundaryValidation.ts
 * WASM Type Validation and Boundary Safety
 *
 * Provides runtime validation for data crossing the WASM-JavaScript boundary.
 * TypeScript types only provide compile-time safety - these functions enforce
 * runtime correctness to prevent Rust serialization issues from corrupting state.
 *
 * CODE REVIEW FIX (HIGH-5): Implement validation functions for consistent boundary checks
 *
 * CRITICAL SAFETY RULES:
 * 1. undefined → null conversion (Rust Option::None serializes to undefined)
 * 2. Array length preservation (WASM must not insert/delete)
 * 3. In-place modification (don't replace arrays)
 * 4. Consumed token pattern (translated: null + translationSource: "X_consumed")
 * 5. Two-phase validation (validate before modifying)
 * 6. Error propagation (fail fast on invalid data)
 *
 * See ADR-037 for why the token/pattern/lookup validators that used to live here were
 * deleted as dead code (`validateWasmDictionaryMatch` went with the WASM dictionary tier,
 * 2026-10-04), and the live WASM wrappers (WasmPatternProcessor.js, WasmTextChunker.js)
 * did no structural validation of their own until
 * `isPatternMatchInBounds`/`areChunksInBounds` closed that gap (2026-09-09,
 * architecture review candidate #2 grilling). Both Rust result structs
 * (`PatternProcessingResult`, `TextChunkResult`) guarantee field presence/type
 * via serde — the one thing serde can't guarantee is a semantically-wrong-but
 * -correctly-typed index from a Rust-side arithmetic bug, so these two check
 * index bounds only, not general field shape.
 */

/**
 * Bounds-check a WASM pattern-match result before it's applied to a `tokens` array.
 *
 * Rust's `PatternProcessingResult.start_index`/`end_index` are non-Optional `usize` —
 * serde guarantees they're present and non-negative. This guards the one thing serde
 * can't: a semantically out-of-range index from a Rust-side arithmetic bug (this
 * codebase's recurring position-arithmetic bug class, see root CLAUDE.md).
 *
 * @param result - One entry from processTokensWasm's parsed results array
 * @param tokensLength - Length of the ORIGINAL tokens array the result indexes into
 *   (not the filtered semanticTokens array processTokensWasm was called with)
 */
export function isPatternMatchInBounds(result: unknown, tokensLength: number): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  const start = r.startIndex;
  const end = r.endIndex;
  return (
    typeof start === 'number' &&
    typeof end === 'number' &&
    start >= 0 &&
    start < tokensLength &&
    end >= start
  );
}

/**
 * Bounds-check a WASM chunk array before it's converted to TextChunk objects.
 *
 * Rejects the whole array on any violation — chunks partition the whole text, so a
 * single bad chunk can't be dropped in isolation without losing content, unlike a
 * pattern match (see `isPatternMatchInBounds`).
 */
export function areChunksInBounds(chunks: unknown): boolean {
  if (!Array.isArray(chunks)) return false;
  let lastStart = -1;
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') return false;
    const start = (chunk as Record<string, unknown>).startIndex;
    if (typeof start !== 'number' || start < 0 || start < lastStart) return false;
    lastStart = start;
  }
  return true;
}
