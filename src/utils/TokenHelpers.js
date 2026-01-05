/**
 * Token Helper Utilities
 *
 * Pure utility functions for token manipulation and text extraction.
 * These functions work with token arrays produced by TextTokenizer and
 * provide common operations needed throughout the translation pipeline.
 *
 * All functions are pure (no side effects) and easy to unit test.
 *
 * @module TokenHelpers
 */

import { TokenType } from './TextTokenizer.js';

/**
 * Extract semantic tokens from token array
 *
 * Filters tokens to include only Chinese words and characters,
 * excluding grouped followers (tokens that are part of another token's group).
 *
 * @param {Token[]} tokens - Array of tokens
 * @returns {Token[]} Array of semantic tokens with originalIndex property
 *
 * @example
 * const semanticTokens = getSemanticTokens(tokens);
 * // Returns: Chinese words/chars with originalIndex preserved
 */
export function getSemanticTokens(tokens) {
  const semanticTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    // Skip tokens that are grouped followers
    if (tokens[i].isGrouped && tokens[i].groupLeader !== null) {
      continue;
    }

    // Only include Chinese tokens
    if (tokens[i].type === TokenType.CHINESE_WORD || tokens[i].type === TokenType.CHINESE_CHAR) {
      semanticTokens.push({
        ...tokens[i],
        originalIndex: i
      });
    }
  }

  return semanticTokens;
}

/**
 * Calculate token span for matching text
 *
 * Determines how many tokens (starting from startIndex) are needed to
 * match the given text. Stops when text is fully matched or tokens exhausted.
 *
 * @param {Token[]} tokens - Array of tokens
 * @param {number} startIndex - Starting token index
 * @param {string} text - Text to match
 * @returns {number} Number of tokens that match the text
 *
 * @example
 * const span = getTokenSpanForText(tokens, 5, "在那些");
 * // Returns: 3 (if tokens 5-7 match "在那些")
 */
export function getTokenSpanForText(tokens, startIndex, text) {
  let remainingText = text;
  let span = 0;

  for (
    let i = startIndex;
    i < tokens.length && remainingText.length > 0;
    i++
  ) {
    const token = tokens[i];

    if (
      token.type === TokenType.CHINESE_WORD ||
      token.type === TokenType.CHINESE_CHAR
    ) {
      // Use original value if available (for grouped tokens), otherwise use current value
      const valueToCheck = token.originalValue || token.value;
      if (remainingText.startsWith(valueToCheck)) {
        remainingText = remainingText.slice(valueToCheck.length);
        span++;
      } else {
        break;
      }
    }
  }

  return span;
}

/**
 * Reconstruct Chinese text from tokens
 *
 * Extracts and concatenates only Chinese words and characters,
 * filtering out punctuation, whitespace, and other token types.
 *
 * @param {Token[]} tokens - Array of tokens
 * @returns {string} Reconstructed Chinese text
 *
 * @example
 * const chinese = reconstructChineseText(tokens);
 * // Returns: "在那些魔帅眼中" (without punctuation/spaces)
 */
export function reconstructChineseText(tokens) {
  return tokens
    .filter(
      t =>
        t.type === TokenType.CHINESE_WORD || t.type === TokenType.CHINESE_CHAR
    )
    .map(t => t.value)
    .join('');
}

/**
 * Reconstruct text from specific index until punctuation
 *
 * Builds text starting from startIndex, including only Chinese
 * words/characters, stopping at the first punctuation boundary.
 *
 * Used for context-aware dictionary matching that respects
 * punctuation boundaries.
 *
 * @param {Token[]} tokens - Array of tokens
 * @param {number} startIndex - Starting index
 * @returns {string} Reconstructed text segment
 *
 * @example
 * const segment = reconstructTextFromIndex(tokens, 3);
 * // Returns: "魔帅眼中" (stops before next punctuation)
 */
export function reconstructTextFromIndex(tokens, startIndex) {
  const result = [];
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i];

    // Stop at punctuation boundaries to prevent cross-punctuation matching
    if (token.type === TokenType.PUNCTUATION) {
      break;
    }

    // Only include Chinese characters and words
    if (token.type === TokenType.CHINESE_WORD || token.type === TokenType.CHINESE_CHAR) {
      result.push(token.value);
    }
  }
  return result.join('');
}

/**
 * Extract complete text from tokens
 *
 * Concatenates token values, excluding grouped followers.
 * Preserves all token types (Chinese, punctuation, whitespace, etc.).
 *
 * @param {Token[]} tokens - Array of tokens
 * @returns {string} Complete reconstructed text
 *
 * @example
 * const fullText = getTextFromTokens(tokens);
 * // Returns: "在那些魔帅眼中，" (includes punctuation)
 */
export function getTextFromTokens(tokens) {
  return tokens
    .filter(token => token.groupLeader === null || token.groupLeader === undefined) // Skip tokens that are part of another token group
    .map(token => token.value)
    .join('');
}

/**
 * Get text position for token index
 *
 * Returns the character position in the original text where the token starts.
 * Uses cached position from tokenizer if available, falls back to calculation.
 *
 * @param {Token[]} tokens - Array of tokens
 * @param {number} tokenIndex - Index of the token
 * @returns {number} Character position in original text
 *
 * @example
 * const position = getTextPositionForTokenIndex(tokens, 5);
 * // Returns: 12 (if token 5 starts at character 12)
 */
export function getTextPositionForTokenIndex(tokens, tokenIndex) {
  // Use cached position from tokenizer instead of recalculating
  if (tokenIndex >= 0 && tokenIndex < tokens.length && tokens[tokenIndex].start !== undefined) {
    return tokens[tokenIndex].start;
  }

  // Fallback to calculation for edge cases (should rarely be needed)
  let position = 0;
  for (let i = 0; i < tokenIndex && i < tokens.length; i++) {
    position += tokens[i].value.length;
  }
  return position;
}
