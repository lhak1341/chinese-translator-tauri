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
 * 2026-10-04), and the live WASM wrapper (WasmPatternProcessor.js) did no structural validation
 * of its own until `isPatternMatchInBounds` closed that gap (2026-09-09, architecture review
 * candidate #2 grilling; `areChunksInBounds` went with the chunker tier, 2026-10-06). The Rust
 * result struct (`PatternProcessingResult`) guarantees field presence/type via serde — the one
 * thing serde can't guarantee is a semantically-wrong-but-correctly-typed index from a
 * Rust-side arithmetic bug, so this checks index bounds only, not general field shape.
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
