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
 * Extract semantic tokens from token array — the one definition
 * `TwoPhasePatternProcessor` and the Rust matcher agree on.
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
 * Non-semantic tokens between matched ones (the space in "墨 子") are inside the span, so
 * the caller claims them too; counting only the matched tokens left the last one unclaimed.
 *
 * @param tokens - Array of tokens
 * @param startIndex - Starting token index
 * @param text - Text to match
 * @returns Number of tokens from startIndex through the last matched token
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
        span = i - startIndex + 1;
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
 * Builds text starting from startIndex out of the semantic tokens (`isSemanticTokenType`:
 * Chinese, Latin words, numbers), skipping whitespace and stopping at the first punctuation
 * boundary. Digits and Latin letters stay in the text, so a key holding them (`绝对战警2`)
 * can match and a key without them (`王五`) never matches across them (`王5五`).
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

    if (isSemanticTokenType(token.type)) {
      result.push(token.value);
    }
  }
  return result.join('');
}
