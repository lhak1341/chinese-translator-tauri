/**
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
 */

import { logger } from './logger';
import type { WasmToken } from '../types/WasmTypes';

export type { WasmToken };

/**
 * Validate and sanitize a WASM token
 * @param token - Token from WASM
 * @returns Validated token
 * @throws {Error} If token structure is invalid
 */
export function validateWasmToken(token: unknown): WasmToken {
  if (!token || typeof token !== 'object') {
    throw new Error(`Invalid token: expected object, got ${typeof token}`);
  }
  const t = token as Record<string, unknown>;

  // Required fields
  if (typeof t.value !== 'string') {
    throw new Error(`Invalid token.value: expected string, got ${typeof t.value}`);
  }

  // CRITICAL: Convert undefined to null (Rust Option::None → undefined in JS)
  const translated = t.translated === undefined ? null : t.translated;
  const translationSource = t.translationSource === undefined ? null : t.translationSource;

  // Validate translated type (must be null or string)
  if (translated !== null && typeof translated !== 'string') {
    logger.warn(`⚠️ Token has invalid translated type: ${typeof translated}, converting to null`);
    return {
      ...t,
      translated: null,
      translationSource,
    } as WasmToken;
  }

  // Validate translationSource type (must be null or string)
  if (translationSource !== null && typeof translationSource !== 'string') {
    logger.warn(
      `⚠️ Token has invalid translationSource type: ${typeof translationSource}, converting to null`
    );
    return {
      ...t,
      translated,
      translationSource: null,
    } as WasmToken;
  }

  return {
    ...t,
    translated,
    translationSource,
  } as WasmToken;
}

/**
 * Validate and copy WASM tokens array
 * Two-phase validation prevents partial corruption
 *
 * PARAM ORDER (CLAUDE.md critical): param1 = JS destination (modified in-place),
 *                                   param2 = WASM source (read-only).
 * Swapping silently loses data. The name `jsTokens` makes the destination role explicit.
 *
 * @param jsTokens - JS token array (DESTINATION — modified in-place)
 * @param wasmTokens - Tokens from WASM (SOURCE — read-only)
 * @returns jsTokens after applying validated WASM results
 * @throws {Error} If validation fails
 */
export function copyWasmTokens(
  jsTokens: Record<string, unknown>[],
  wasmTokens: unknown[]
): Record<string, unknown>[] {
  // Phase 1: Validate structure before modifying
  if (!Array.isArray(jsTokens)) {
    throw new Error('Source tokens must be an array');
  }

  if (!Array.isArray(wasmTokens)) {
    throw new Error('WASM tokens must be an array');
  }

  // CRITICAL: Array length must be preserved
  if (jsTokens.length !== wasmTokens.length) {
    throw new Error(
      `Token array length mismatch: source=${jsTokens.length}, target=${wasmTokens.length}`
    );
  }

  // Pre-validate all tokens (fail fast before any modification)
  const validatedTokens: WasmToken[] = [];
  for (let i = 0; i < wasmTokens.length; i++) {
    try {
      validatedTokens.push(validateWasmToken(wasmTokens[i]));
    } catch (error) {
      throw new Error(`Token validation failed at index ${i}: ${(error as Error).message}`);
    }
  }

  // Phase 2: Apply validated changes in-place
  for (let i = 0; i < jsTokens.length; i++) {
    jsTokens[i].translated = validatedTokens[i].translated;
    jsTokens[i].translationSource = validatedTokens[i].translationSource;

    // Preserve other fields that might have been set by JavaScript
    if (validatedTokens[i].type) {
      jsTokens[i].type = validatedTokens[i].type;
    }
  }

  return jsTokens;
}

/**
 * Validate WASM pattern match result
 * @param match - Pattern match from WASM
 * @returns Validated pattern match
 * @throws {Error} If match structure is invalid
 */
export function validateWasmPatternMatch(match: unknown): Record<string, unknown> {
  if (!match || typeof match !== 'object') {
    throw new Error(`Invalid pattern match: expected object, got ${typeof match}`);
  }
  const m = match as Record<string, unknown>;

  // Required fields
  if (typeof m.originalText !== 'string') {
    throw new Error(
      `Pattern match missing originalText: expected string, got ${typeof m.originalText}`
    );
  }

  if (typeof m.translation !== 'string') {
    throw new Error(
      `Pattern match missing translation: expected string, got ${typeof m.translation}`
    );
  }

  if (typeof m.startIndex !== 'number') {
    throw new Error(
      `Pattern match missing startIndex: expected number, got ${typeof m.startIndex}`
    );
  }

  if (typeof m.endIndex !== 'number') {
    throw new Error(`Pattern match missing endIndex: expected number, got ${typeof m.endIndex}`);
  }

  // Convert undefined to null
  return {
    originalText: m.originalText,
    translation: m.translation,
    startIndex: m.startIndex,
    endIndex: m.endIndex,
    pattern: m.pattern === undefined ? null : m.pattern,
    variables: m.variables === undefined ? null : m.variables,
    source: m.source || 'pattern',
    translationSource: m.translationSource === undefined ? null : m.translationSource,
  };
}

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

/**
 * Validate Rust lookup match result
 * @param match - Lookup match from Rust backend
 * @returns Validated lookup match
 * @throws {Error} If match structure is invalid
 */
export function validateRustLookupMatch(match: unknown): Record<string, unknown> {
  if (!match || typeof match !== 'object') {
    throw new Error(`Invalid lookup match: expected object, got ${typeof match}`);
  }
  const m = match as Record<string, unknown>;

  // Required fields
  if (typeof m.character !== 'string') {
    throw new Error(`Lookup match missing character: expected string, got ${typeof m.character}`);
  }

  if (typeof m.translation !== 'string') {
    throw new Error(
      `Lookup match missing translation: expected string, got ${typeof m.translation}`
    );
  }

  // Infer length from character if not provided
  const length = typeof m.length === 'number' ? m.length : (m.character as string).length;

  return {
    character: m.character,
    translation: m.translation,
    length,
    dictionary: m.dictionary || 'characters',
    metadata: m.metadata === undefined ? null : m.metadata,
  };
}

/**
 * Maximum metadata size (10KB)
 * CODE REVIEW FIX (MEDIUM-6): Document metadata limit
 */
export const MAX_WASM_METADATA_SIZE = 10240;

/**
 * Validate metadata size
 * @param metadataString - Serialized metadata
 * @returns True if within size limit
 */
export function isMetadataSizeValid(metadataString: string | null | undefined): boolean {
  if (!metadataString) return true;
  return metadataString.length <= MAX_WASM_METADATA_SIZE;
}
