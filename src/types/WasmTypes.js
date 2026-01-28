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

import { logger } from '../utils/logger';

/**
 * Validate and sanitize a WASM token
 * @param {any} token - Token from WASM
 * @returns {Object} Validated token
 * @throws {Error} If token structure is invalid
 */
export function validateWasmToken(token) {
  if (!token || typeof token !== 'object') {
    throw new Error(`Invalid token: expected object, got ${typeof token}`);
  }

  // Required fields
  if (typeof token.value !== 'string') {
    throw new Error(`Invalid token.value: expected string, got ${typeof token.value}`);
  }

  // CRITICAL: Convert undefined to null (Rust Option::None → undefined in JS)
  const translated = token.translated === undefined ? null : token.translated;
  const translationSource = token.translationSource === undefined ? null : token.translationSource;

  // Validate translated type (must be null or string)
  if (translated !== null && typeof translated !== 'string') {
    logger.warn(`⚠️ Token has invalid translated type: ${typeof translated}, converting to null`);
    return {
      ...token,
      translated: null,
      translationSource,
    };
  }

  // Validate translationSource type (must be null or string)
  if (translationSource !== null && typeof translationSource !== 'string') {
    logger.warn(
      `⚠️ Token has invalid translationSource type: ${typeof translationSource}, converting to null`
    );
    return {
      ...token,
      translated,
      translationSource: null,
    };
  }

  return {
    ...token,
    translated,
    translationSource,
  };
}

/**
 * Validate and copy WASM tokens array
 * Two-phase validation prevents partial corruption
 *
 * @param {Array} sourceTokens - Original token array
 * @param {Array} wasmTokens - Tokens from WASM
 * @returns {Array} Validated tokens
 * @throws {Error} If validation fails
 */
export function copyWasmTokens(sourceTokens, wasmTokens) {
  // Phase 1: Validate structure before modifying
  if (!Array.isArray(sourceTokens)) {
    throw new Error('Source tokens must be an array');
  }

  if (!Array.isArray(wasmTokens)) {
    throw new Error('WASM tokens must be an array');
  }

  // CRITICAL: Array length must be preserved
  if (sourceTokens.length !== wasmTokens.length) {
    throw new Error(
      `WASM violated array length invariance: ${sourceTokens.length} → ${wasmTokens.length}`
    );
  }

  // Pre-validate all tokens (fail fast before any modification)
  const validatedTokens = [];
  for (let i = 0; i < wasmTokens.length; i++) {
    try {
      validatedTokens.push(validateWasmToken(wasmTokens[i]));
    } catch (error) {
      throw new Error(`Token validation failed at index ${i}: ${error.message}`);
    }
  }

  // Phase 2: Apply validated changes in-place
  for (let i = 0; i < sourceTokens.length; i++) {
    sourceTokens[i].translated = validatedTokens[i].translated;
    sourceTokens[i].translationSource = validatedTokens[i].translationSource;

    // Preserve other fields that might have been set by JavaScript
    if (validatedTokens[i].type) {
      sourceTokens[i].type = validatedTokens[i].type;
    }
  }

  return sourceTokens;
}

/**
 * Validate WASM pattern match result
 * @param {any} match - Pattern match from WASM
 * @returns {Object} Validated pattern match
 * @throws {Error} If match structure is invalid
 */
export function validateWasmPatternMatch(match) {
  if (!match || typeof match !== 'object') {
    throw new Error(`Invalid pattern match: expected object, got ${typeof match}`);
  }

  // Required fields
  if (typeof match.originalText !== 'string') {
    throw new Error(
      `Pattern match missing originalText: expected string, got ${typeof match.originalText}`
    );
  }

  if (typeof match.translation !== 'string') {
    throw new Error(
      `Pattern match missing translation: expected string, got ${typeof match.translation}`
    );
  }

  if (typeof match.startIndex !== 'number') {
    throw new Error(
      `Pattern match missing startIndex: expected number, got ${typeof match.startIndex}`
    );
  }

  if (typeof match.endIndex !== 'number') {
    throw new Error(
      `Pattern match missing endIndex: expected number, got ${typeof match.endIndex}`
    );
  }

  // Convert undefined to null
  return {
    originalText: match.originalText,
    translation: match.translation,
    startIndex: match.startIndex,
    endIndex: match.endIndex,
    pattern: match.pattern === undefined ? null : match.pattern,
    variables: match.variables === undefined ? null : match.variables,
    source: match.source || 'pattern',
    translationSource: match.translationSource === undefined ? null : match.translationSource,
  };
}

/**
 * Validate WASM dictionary match result
 * @param {any} match - Dictionary match from WASM
 * @returns {Object} Validated dictionary match
 * @throws {Error} If match structure is invalid
 */
export function validateWasmDictionaryMatch(match) {
  if (!match || typeof match !== 'object') {
    throw new Error(`Invalid dictionary match: expected object, got ${typeof match}`);
  }

  // Required fields
  if (typeof match.word !== 'string') {
    throw new Error(`Dictionary match missing word: expected string, got ${typeof match.word}`);
  }

  if (typeof match.translation !== 'string') {
    throw new Error(
      `Dictionary match missing translation: expected string, got ${typeof match.translation}`
    );
  }

  // Infer length from word if not provided
  const length = typeof match.length === 'number' ? match.length : match.word.length;

  // Default priority if not provided
  const priority = typeof match.priority === 'number' ? match.priority : 0;

  return {
    word: match.word,
    translation: match.translation,
    startPos: match.startPos === undefined ? 0 : match.startPos,
    endPos: match.endPos === undefined ? match.startPos + length : match.endPos,
    length,
    priority,
    metadata: match.metadata === undefined ? null : match.metadata,
    dictionary: match.dictionary || 'unknown',
  };
}

/**
 * Validate Rust lookup match result
 * @param {any} match - Lookup match from Rust backend
 * @returns {Object} Validated lookup match
 * @throws {Error} If match structure is invalid
 */
export function validateRustLookupMatch(match) {
  if (!match || typeof match !== 'object') {
    throw new Error(`Invalid lookup match: expected object, got ${typeof match}`);
  }

  // Required fields
  if (typeof match.character !== 'string') {
    throw new Error(
      `Lookup match missing character: expected string, got ${typeof match.character}`
    );
  }

  if (typeof match.translation !== 'string') {
    throw new Error(
      `Lookup match missing translation: expected string, got ${typeof match.translation}`
    );
  }

  // Infer length from character if not provided
  const length = typeof match.length === 'number' ? match.length : match.character.length;

  return {
    character: match.character,
    translation: match.translation,
    length,
    dictionary: match.dictionary || 'characters',
    metadata: match.metadata === undefined ? null : match.metadata,
  };
}

/**
 * Maximum metadata size (10KB)
 * CODE REVIEW FIX (MEDIUM-6): Document metadata limit
 */
export const MAX_WASM_METADATA_SIZE = 10240;

/**
 * Validate metadata size
 * @param {string} metadataString - Serialized metadata
 * @returns {boolean} True if within size limit
 */
export function isMetadataSizeValid(metadataString) {
  if (!metadataString) return true;
  return metadataString.length <= MAX_WASM_METADATA_SIZE;
}
