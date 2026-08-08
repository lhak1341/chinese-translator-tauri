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
 * See ADR-037 for why this file only validates dictionary matches today —
 * the token/pattern/lookup validators that used to live here were deleted as
 * dead code, and the live WASM wrappers (WasmPatternProcessor.js,
 * WasmTextChunker.js) currently do no structural validation of their own.
 */

/**
 * Validate WASM dictionary match result
 * @param match - Dictionary match from WASM
 * @returns Validated dictionary match
 * @throws {Error} If match structure is invalid
 */
export function validateWasmDictionaryMatch(match: unknown): Record<string, unknown> {
  if (!match || typeof match !== 'object') {
    throw new Error(`Invalid dictionary match: expected object, got ${typeof match}`);
  }
  const m = match as Record<string, unknown>;

  // Required fields
  if (typeof m.word !== 'string') {
    throw new Error(`Dictionary match missing word: expected string, got ${typeof m.word}`);
  }

  if (typeof m.translation !== 'string') {
    throw new Error(
      `Dictionary match missing translation: expected string, got ${typeof m.translation}`
    );
  }

  // Infer length from word if not provided
  const length = typeof m.length === 'number' ? m.length : (m.word as string).length;

  // Default priority if not provided
  const priority = typeof m.priority === 'number' ? m.priority : 0;

  return {
    word: m.word,
    translation: m.translation,
    startPos: m.startPos === undefined ? 0 : m.startPos,
    endPos: m.endPos === undefined ? ((m.startPos as number) ?? 0) + length : m.endPos,
    length,
    priority,
    metadata: m.metadata === undefined ? null : m.metadata,
    dictionary: m.dictionary || 'unknown',
  };
}
