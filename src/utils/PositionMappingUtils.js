// @ts-check
import { logger } from './logger';

/**
 * Position Mapping Utilities for Dictionary Trie Integration
 *
 * Provides bidirectional mapping between token positions (array indices)
 * and character positions (string offsets) to bridge JavaScript token-based
 * processing with WASM character-based dictionary lookups.
 *
 * Background:
 * - JavaScript code: Works with token arrays, uses token indices
 * - WASM Dictionary Trie: Works with full text strings, uses character positions
 * - Need: Efficient conversion between these two representations
 *
 * Performance:
 * - tokenPositionToCharPosition: O(n) where n = token position
 * - charLengthToTokenCount: O(n) where n = token count in range
 * - Optimized for sequential access (Phase 5 processes left-to-right)
 *
 * Unicode Handling:
 * - Correctly handles multi-byte UTF-16 characters (surrogate pairs)
 * - Handles combining diacritical marks
 * - Character position = JavaScript string index (NOT byte offset)
 *
 * @module PositionMappingUtils
 */

/**
 * Convert token position to character position
 *
 * Maps from token array index to character offset in the full text string.
 * Useful for converting token positions to WASM trie API parameters.
 *
 * Example:
 *   tokens = [{value: "我"}, {value: "爱"}, {value: "你"}]
 *   tokenPositionToCharPosition(tokens, 0) → 0
 *   tokenPositionToCharPosition(tokens, 1) → 1
 *   tokenPositionToCharPosition(tokens, 2) → 2
 *
 * Example with multi-char tokens:
 *   tokens = [{value: "今天"}, {value: "天气"}, {value: "好"}]
 *   tokenPositionToCharPosition(tokens, 0) → 0
 *   tokenPositionToCharPosition(tokens, 1) → 2  (skip "今天")
 *   tokenPositionToCharPosition(tokens, 2) → 4  (skip "今天" + "天气")
 *
 * @param {Array<{value: string}>} tokens - Token array
 * @param {number} tokenPos - Token position (0-based index)
 * @returns {number} Character position in full text
 * @throws {Error} If tokenPos is out of bounds or tokens invalid
 */
export function tokenPositionToCharPosition(tokens, tokenPos) {
  // Input validation
  if (!Array.isArray(tokens)) {
    throw new Error('tokens must be an array');
  }

  if (!Number.isInteger(tokenPos) || tokenPos < 0) {
    throw new Error(`tokenPos must be a non-negative integer, got: ${tokenPos}`);
  }

  if (tokenPos > tokens.length) {
    throw new Error(`tokenPos ${tokenPos} is out of bounds (tokens.length = ${tokens.length})`);
  }

  // Special case: position at end of tokens
  if (tokenPos === tokens.length) {
    return tokens.reduce((sum, token) => sum + (token.value?.length || 0), 0);
  }

  // Calculate character position by summing token lengths
  let charPos = 0;
  for (let i = 0; i < tokenPos; i++) {
    const token = tokens[i];
    if (!token || typeof token.value !== 'string') {
      logger.warn(`Invalid token at position ${i}:`, token);
      continue;
    }
    charPos += token.value.length;
  }

  return charPos;
}

/**
 * Convert character length to token count
 *
 * Given a starting token position and a character length, returns how many
 * tokens are needed to cover that many characters.
 *
 * Useful for converting WASM match results (character-based) back to token
 * positions for applying translations.
 *
 * Example:
 *   tokens = [{value: "我"}, {value: "爱"}, {value: "你"}]
 *   charLengthToTokenCount(tokens, 0, 1) → 1  (1 char = 1 token)
 *   charLengthToTokenCount(tokens, 0, 2) → 2  (2 chars = 2 tokens)
 *   charLengthToTokenCount(tokens, 0, 3) → 3  (3 chars = 3 tokens)
 *
 * Example with multi-char tokens:
 *   tokens = [{value: "今天"}, {value: "天气"}, {value: "好"}]
 *   charLengthToTokenCount(tokens, 0, 2) → 1  ("今天" = 1 token)
 *   charLengthToTokenCount(tokens, 0, 4) → 2  ("今天天气" = 2 tokens)
 *   charLengthToTokenCount(tokens, 1, 2) → 1  ("天气" = 1 token starting from pos 1)
 *
 * Edge cases:
 *   - If charLength falls in middle of token, returns token count up to that token
 *   - If charLength exceeds available text, returns max possible token count
 *
 * @param {Array<{value: string}>} tokens - Token array
 * @param {number} startTokenPos - Starting token position
 * @param {number} charLength - Number of characters to cover
 * @returns {number} Number of tokens needed
 * @throws {Error} If parameters are invalid
 */
function charLengthToTokenCount(tokens, startTokenPos, charLength) {
  // Input validation
  if (!Array.isArray(tokens)) {
    throw new Error('tokens must be an array');
  }

  if (!Number.isInteger(startTokenPos) || startTokenPos < 0) {
    throw new Error(`startTokenPos must be a non-negative integer, got: ${startTokenPos}`);
  }

  if (!Number.isInteger(charLength) || charLength < 0) {
    throw new Error(`charLength must be a non-negative integer, got: ${charLength}`);
  }

  if (startTokenPos >= tokens.length) {
    throw new Error(
      `startTokenPos ${startTokenPos} is out of bounds (tokens.length = ${tokens.length})`
    );
  }

  // Special case: zero character length
  if (charLength === 0) {
    return 0;
  }

  // Count tokens needed to cover charLength characters
  let remainingChars = charLength;
  let tokenCount = 0;

  for (let i = startTokenPos; i < tokens.length && remainingChars > 0; i++) {
    const token = tokens[i];
    if (!token || typeof token.value !== 'string') {
      logger.warn(`Invalid token at position ${i}:`, token);
      continue;
    }

    const tokenLength = token.value.length;
    remainingChars -= tokenLength;
    tokenCount++;
  }

  // If we ran out of tokens before covering all characters, warn
  if (remainingChars > 0) {
    logger.warn(
      `charLength ${charLength} exceeds available text from position ${startTokenPos}. ` +
        `Covered ${charLength - remainingChars} chars with ${tokenCount} tokens.`
    );
  }

  return tokenCount;
}

/**
 * Build full text from tokens
 *
 * Concatenates all token values into a single string for WASM processing.
 * Optimized for performance with single allocation.
 *
 * @param {Array<{value: string}>} tokens - Token array
 * @returns {string} Full text
 */
export function buildFullTextFromTokens(tokens) {
  if (!Array.isArray(tokens)) {
    throw new Error('tokens must be an array');
  }

  if (tokens.length === 0) {
    return '';
  }

  // Single allocation join (faster than repeated concatenation)
  return tokens.map((token) => token.value || '').join('');
}

/**
 * Convert WASM match result to token-based match
 *
 * Bridges WASM character-based results to JavaScript token-based format.
 * Converts character positions and lengths to token positions and counts.
 *
 * Input (WASM format):
 *   {
 *     matchedText: "今天",
 *     translation: "hôm nay",
 *     length: 2,
 *     startPos: 0,
 *     endPos: 2,
 *     priority: 5,
 *     metadata: "..."
 *   }
 *
 * Output (Token format):
 *   {
 *     word: "今天",
 *     translation: "hôm nay",
 *     tokenLength: 1,  // 1 token with 2 chars
 *     dictionary: "characters",
 *     priority: 5,
 *     metadata: "..."
 *   }
 *
 * @param {{ length: number, matchedText: string, translation: string, priority?: number, metadata?: any }} wasmMatch - WASM match result
 * @param {Array<{value: string}>} tokens - Token array
 * @param {number} startTokenPos - Starting token position
 * @param {string} dictionaryName - Dictionary name for result
 * @returns {Object|null} Token-based match object
 */
export function convertWasmMatchToTokenMatch(wasmMatch, tokens, startTokenPos, dictionaryName) {
  if (!wasmMatch) {
    return null;
  }

  // Convert character length to token count
  const tokenLength = charLengthToTokenCount(tokens, startTokenPos, wasmMatch.length);

  return {
    word: wasmMatch.matchedText,
    translation: wasmMatch.translation,
    tokenLength: tokenLength,
    dictionary: dictionaryName,
    priority: wasmMatch.priority,
    metadata: wasmMatch.metadata,
  };
}

/**
 * Validate position mapping consistency
 *
 * Development/testing utility to verify position mappings are correct.
 * Checks that converting token position → char position → token count
 * produces consistent results.
 *
 * @param {Array<{value: string}>} tokens - Token array to validate
 * @returns {boolean} True if all mappings are consistent
 */
export function validatePositionMapping(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return true;
  }

  try {
    for (let tokenPos = 0; tokenPos < tokens.length; tokenPos++) {
      const charPos = tokenPositionToCharPosition(tokens, tokenPos);
      const token = tokens[tokenPos];

      // Check round-trip: charPos should match sum of previous token lengths
      let expectedCharPos = 0;
      for (let i = 0; i < tokenPos; i++) {
        expectedCharPos += tokens[i].value.length;
      }

      if (charPos !== expectedCharPos) {
        logger.error(
          `Position mapping inconsistency at token ${tokenPos}: ` +
            `got charPos ${charPos}, expected ${expectedCharPos}`
        );
        return false;
      }

      // Check token count conversion
      const tokenLength = token.value.length;
      const computedTokenCount = charLengthToTokenCount(tokens, tokenPos, tokenLength);

      if (computedTokenCount !== 1) {
        logger.error(
          `Token count inconsistency at token ${tokenPos}: ` +
            `charLength ${tokenLength} converted to ${computedTokenCount} tokens, expected 1`
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('Position mapping validation failed:', error);
    return false;
  }
}
