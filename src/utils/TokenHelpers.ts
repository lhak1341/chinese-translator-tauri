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

import { TokenType, Token } from './text/TextTokenizer.js';

/**
 * Token structure from TextTokenizer (re-exported for convenience)
 */
export type TextToken = Token & {
  /** Original index in token array (added by getSemanticTokens) */
  originalIndex?: number;
  /** True when a non-semantic token (punctuation, whitespace) sits between this token and the
   * previous semantic one (added by getSemanticTokens; consumed by the Rust pattern matcher) */
  hasPrecedingBoundary?: boolean;
};

/**
 * Legacy interface maintained for backward compatibility
 * @deprecated Use Token from TextTokenizer instead
 */
export interface LegacyTextToken {
  /** Token type identifier */
  type: string;

  /** Token text value */
  value: string;

  /** Start position in original text */
  start: number;

  /** End position in original text */
  end: number;

  /** Translation result (null if not translated) */
  translated: string | null;

  /** Whether this token is part of a semantic group */
  isGrouped: boolean;

  /** Array of token indices grouped with this token */
  groupedWith: number[];

  /** Index of the token that leads this group (null if this is the leader) */
  groupLeader: number | null;

  /** Original value before grouping (optional) */
  originalValue?: string;

  /** Original index in token array (added by getSemanticTokens) */
  originalIndex?: number;
}

/**
 * Whether a token type takes part in pattern matching and token-span counting.
 *
 * Latin words and numbers count so that patterns can handle mixed Chinese/Latin text
 * like "yuan主厨". This is the one list: add a type here, not at a call site.
 */
export function isSemanticTokenType(type: string): boolean {
  return (
    type === TokenType.CHINESE_WORD ||
    type === TokenType.CHINESE_CHAR ||
    type === TokenType.LATIN_WORD ||
    type === TokenType.NUMBER
  );
}

/**
 * Extract semantic tokens from token array — the one definition both pattern adapters
 * (TwoPhasePatternProcessor) and the Rust matcher agree on.
 *
 * Keeps tokens whose type passes `isSemanticTokenType`, drops grouped followers
 * (`isGrouped && groupLeader !== null`), and tags each kept token with its position in the
 * input (`originalIndex`) and whether a non-semantic token separates it from the previous
 * semantic token (`hasPrecedingBoundary`). Leading non-semantic tokens set no boundary.
 * Grouped followers never set one either.
 *
 * @param tokens - Array of tokens
 * @returns Copies of the semantic tokens with originalIndex and hasPrecedingBoundary
 *
 * @example
 * const semanticTokens = getSemanticTokens(tokens);
 * // Returns: Chinese/Latin/number tokens with originalIndex preserved
 */
export function getSemanticTokens(tokens: TextToken[]): TextToken[] {
  const semanticTokens: TextToken[] = [];
  let pendingBoundary = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.isGrouped && token.groupLeader !== null) {
      continue;
    }

    if (isSemanticTokenType(token.type)) {
      semanticTokens.push({
        ...token,
        originalIndex: i,
        hasPrecedingBoundary: pendingBoundary,
      });
      pendingBoundary = false;
    } else if (semanticTokens.length > 0) {
      pendingBoundary = true;
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
 * @param tokens - Array of tokens
 * @param startIndex - Starting token index
 * @param text - Text to match
 * @returns Number of tokens that match the text
 *
 * @example
 * const span = getTokenSpanForText(tokens, 5, "在那些");
 * // Returns: 3 (if tokens 5-7 match "在那些")
 */
export function getTokenSpanForText(tokens: TextToken[], startIndex: number, text: string): number {
  let remainingText = text;
  let span = 0;

  for (let i = startIndex; i < tokens.length && remainingText.length > 0; i++) {
    const token = tokens[i];

    if (isSemanticTokenType(token.type)) {
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
 * @param tokens - Array of tokens
 * @returns Reconstructed Chinese text
 *
 * @example
 * const chinese = reconstructChineseText(tokens);
 * // Returns: "在那些魔帅眼中" (without punctuation/spaces)
 */
export function reconstructChineseText(tokens: TextToken[]): string {
  return tokens
    .filter((t) => t.type === TokenType.CHINESE_WORD || t.type === TokenType.CHINESE_CHAR)
    .map((t) => t.value)
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
 * @param tokens - Array of tokens
 * @param startIndex - Starting index
 * @returns Reconstructed text segment
 *
 * @example
 * const segment = reconstructTextFromIndex(tokens, 3);
 * // Returns: "魔帅眼中" (stops before next punctuation)
 */
export function reconstructTextFromIndex(tokens: TextToken[], startIndex: number): string {
  const result: string[] = [];
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
 * @param tokens - Array of tokens
 * @returns Complete reconstructed text
 *
 * @example
 * const fullText = getTextFromTokens(tokens);
 * // Returns: "在那些魔帅眼中，" (includes punctuation)
 */
export function getTextFromTokens(tokens: TextToken[]): string {
  return tokens
    .filter((token) => !(token.isGrouped && token.groupLeader !== null)) // Skip phrase followers only (not pattern-consumed tokens)
    .map((token) => token.value)
    .join('');
}

/**
 * Get text position for token index
 *
 * Returns the character position in the original text where the token starts.
 * Uses cached position from tokenizer if available, falls back to calculation.
 *
 * @param tokens - Array of tokens
 * @param tokenIndex - Index of the token
 * @returns Character position in original text
 *
 * @example
 * const position = getTextPositionForTokenIndex(tokens, 5);
 * // Returns: 12 (if token 5 starts at character 12)
 */
export function getTextPositionForTokenIndex(tokens: TextToken[], tokenIndex: number): number {
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
