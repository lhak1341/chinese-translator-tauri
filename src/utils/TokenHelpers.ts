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

/** The text a dictionary lookup at a token reads, and where each token it read ends in it. */
export interface LookupText {
  text: string;
  /** For each token the walk appended, in order: its index and the text's length after it. */
  tokenEnds: { tokenIndex: number; end: number }[];
}

/**
 * The text a dictionary lookup at `startIndex` reads (`DictionaryManager.findMatchesAtToken`), and
 * where each token ends in it, so a match's token count comes from this same walk.
 *
 * Builds the text out of the semantic tokens (`isSemanticTokenType`: Chinese, Latin words,
 * numbers), skipping whitespace and stopping at the first punctuation token. Digits and Latin
 * letters stay in the text, so a key holding them (`绝对战警2`) can match and a key without them
 * (`王五`) never matches across them (`王5五`).
 *
 * Each token adds its own source text, `originalValue ?? value`: a grouped leader's `value` is the
 * whole grouped text, which its followers would then repeat (`降` + `魔杖` + `杖` read as
 * `降魔杖杖`).
 *
 * `throughPunctuation` is the length of the longest searched key that holds punctuation
 * (`乔斯-韦登`, `X战警：背水一战`; 0 when none does): a punctuation token met before the text is
 * that long goes into the text and the walk goes on, so such a key can match. A key without
 * punctuation still cannot match across one: its trie path has no punctuation character.
 *
 * @example
 * readLookupText(tokens, 3).text; // "魔帅眼中" (stops before the next punctuation)
 */
export function readLookupText(
  tokens: TextToken[],
  startIndex: number,
  throughPunctuation = 0
): LookupText {
  let text = '';
  const tokenEnds: LookupText['tokenEnds'] = [];
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i];
    const isPunctuation = token.type === TokenType.PUNCTUATION;
    // Stop at punctuation boundaries to prevent cross-punctuation matching, unless a key with
    // punctuation in it could still be read from here
    if (isPunctuation && text.length >= throughPunctuation) break;
    if (isPunctuation || isSemanticTokenType(token.type)) {
      text += token.originalValue ?? token.value;
      tokenEnds.push({ tokenIndex: i, end: text.length });
    }
  }
  return { text, tokenEnds };
}

/**
 * How many tokens, from `startIndex` through the last one, a match of `length` characters at the
 * start of `lookup.text` covers (whitespace between them included, so `墨 子` is 3), or 0 when it
 * ends partway through a token.
 */
export function tokenLengthOf(lookup: LookupText, startIndex: number, length: number): number {
  const last = lookup.tokenEnds.find(({ end }) => end >= length);
  return last && last.end === length ? last.tokenIndex - startIndex + 1 : 0;
}
