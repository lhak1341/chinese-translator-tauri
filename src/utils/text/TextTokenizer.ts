/**
 * Text Tokenizer for efficient translation processing
 * Segments text into meaningful units for optimized translation
 *
 * Pure JavaScript. A Rust twin (`WasmTextTokenizer` / `text_tokenizer.rs`) was deleted
 * 2026-10-06 (ADR-079): it measured about 8x slower than this code.
 */

/**
 * Token type enum for classification
 */
export enum TokenType {
  CHINESE_CHAR = 'chinese_char',
  CHINESE_WORD = 'chinese_word',
  LATIN_WORD = 'latin_word',
  NUMBER = 'number',
  PUNCTUATION = 'punctuation',
  WHITESPACE = 'whitespace',
  UNKNOWN = 'unknown',
}

/**
 * Token class representing a text segment
 */
export class Token {
  /** Token type identifier */
  type: string;

  /** Token text value */
  value: string;

  /** Start position in original text */
  start: number;

  /** End position in original text */
  end: number;

  /** Translation result (null if not translated) */
  translated: string | null = null;

  /** Whether this token is part of a semantic group */
  isGrouped: boolean = false;

  /** Array of token indices that are grouped with this token */
  groupedWith: number[] = [];

  /** Index of the token that leads this group (null if this is the leader) */
  groupLeader: number | null = null;

  /** Original value before grouping (optional) */
  originalValue?: string;

  constructor(type: string, value: string, start: number, end: number) {
    this.type = type;
    this.value = value;
    this.start = start;
    this.end = end;
  }

  toString(): string {
    const groupInfo = this.isGrouped ? ` grouped:${this.groupedWith.length}` : '';
    return `Token(${this.type}: "${this.value}", ${this.start}-${this.end}${groupInfo})`;
  }
}

/**
 * Grouped token structure
 */
export interface GroupedToken {
  token: Token;
  index: number;
}

/**
 * Token groups by type
 */
export interface TokenGroups {
  [TokenType.CHINESE_CHAR]: GroupedToken[];
  [TokenType.CHINESE_WORD]: GroupedToken[];
  [TokenType.LATIN_WORD]: GroupedToken[];
  [TokenType.NUMBER]: GroupedToken[];
  [TokenType.PUNCTUATION]: GroupedToken[];
  [TokenType.WHITESPACE]: GroupedToken[];
  [TokenType.UNKNOWN]: GroupedToken[];
}

/**
 * Phrase candidate structure
 */
export interface PhraseCandidate {
  /** The phrase text */
  phrase: string;

  /** Starting token index */
  startIndex: number;

  /** Ending token index */
  endIndex: number;

  /** Character length of phrase */
  length: number;

  /** Number of tokens in phrase */
  tokenCount: number;
}

/**
 * Text complexity levels
 */
export type TextComplexity = 'simple' | 'chinese_heavy' | 'mixed' | 'latin_heavy';

/**
 * Processing strategy
 */
export type ProcessingStrategy =
  'prioritize_phrase_matching' | 'balanced_processing' | 'minimal_processing';

/**
 * Text analysis result
 */
export interface TextAnalysis {
  /** Total character length */
  totalLength: number;

  /** Total number of tokens */
  tokenCount: number;

  /** Composition breakdown by type */
  composition: {
    [key: string]: {
      tokens: number;
      characters: number;
      percentage: string;
    };
  };

  /** Text complexity classification */
  complexity: TextComplexity;

  /** Suggested processing strategy */
  strategy?: ProcessingStrategy;
}

/**
 * Text Tokenizer class
 *
 * Segments text into meaningful units for optimized translation processing.
 * Handles Chinese characters, Latin words, numbers, punctuation, and whitespace.
 */
export class TextTokenizer {
  private tokenRegex: RegExp;

  constructor() {
    // One token per CJK ideograph (Unified, Extension A, Compatibility), per run of ASCII
    // letters, per run of ASCII digits, per run of whitespace, and per ANY OTHER code point:
    // punctuation is never grouped, so "：“" is two tokens and the punctuation dictionary's
    // single-character keys match each one. `u` makes `[\s\S]` take a whole code point.
    this.tokenRegex = new RegExp(
      `([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])|([A-Za-z]+)|([0-9]+)|(\\p{White_Space}+)|([\\s\\S])`,
      'gu'
    );
  }

  /**
   * Tokenize text into meaningful segments
   *
   * Text is NFC-normalized first, so `start`/`end` index the normalized text (UTF-16 units).
   *
   * @param text - Input text to tokenize
   * @returns Array of tokens
   *
   * @example
   * const tokenizer = new TextTokenizer();
   * const tokens = tokenizer.tokenize("在那些魔帅眼中，");
   * // Returns: [Token("在"), Token("那"), Token("些"), ...]
   */
  tokenize(text: string): Token[] {
    if (!text) return [];

    const normalized = text.normalize('NFC');
    const tokens: Token[] = [];
    let match: RegExpExecArray | null;

    this.tokenRegex.lastIndex = 0;
    while ((match = this.tokenRegex.exec(normalized)) !== null) {
      const [value, chinese, latin, number, whitespace] = match;
      const start = match.index;

      let tokenType: string;
      if (chinese) {
        tokenType = TokenType.CHINESE_CHAR;
      } else if (latin) {
        tokenType = TokenType.LATIN_WORD;
      } else if (number) {
        tokenType = TokenType.NUMBER;
      } else if (whitespace) {
        tokenType = TokenType.WHITESPACE;
      } else {
        tokenType = TokenType.PUNCTUATION;
      }

      tokens.push(new Token(tokenType, value, start, start + value.length));
    }

    return tokens;
  }

  /**
   * Group tokens for efficient batch processing
   *
   * @param tokens - Input tokens
   * @returns Grouped tokens by type
   *
   * @example
   * const groups = tokenizer.groupTokensByType(tokens);
   * console.log(groups[TokenType.CHINESE_CHAR].length); // Number of Chinese chars
   */
  groupTokensByType(tokens: Token[]): TokenGroups {
    const groups: TokenGroups = {
      [TokenType.CHINESE_CHAR]: [],
      [TokenType.CHINESE_WORD]: [],
      [TokenType.LATIN_WORD]: [],
      [TokenType.NUMBER]: [],
      [TokenType.PUNCTUATION]: [],
      [TokenType.WHITESPACE]: [],
      [TokenType.UNKNOWN]: [],
    };

    tokens.forEach((token, index) => {
      groups[token.type as TokenType].push({ token, index });
    });

    return groups;
  }

  /**
   * Reconstruct text from tokens
   *
   * @param tokens - Tokens to reconstruct
   * @returns Reconstructed text
   *
   * @example
   * const text = tokenizer.reconstruct(tokens);
   * // Returns: original or translated text
   */
  reconstruct(tokens: Token[]): string {
    return tokens.map((token) => token.translated || token.value).join('');
  }

  /**
   * Find potential phrase boundaries for dictionary lookup optimization
   *
   * @param tokens - Input tokens
   * @param maxPhraseLength - Maximum phrase length in tokens (default: 10)
   * @returns Phrase candidates sorted by length (longest first)
   *
   * @example
   * const candidates = tokenizer.findPhraseCandidates(tokens, 5);
   * // Returns: [{ phrase: "在那些魔帅眼中", startIndex: 0, ... }, ...]
   */
  findPhraseCandidates(tokens: Token[], maxPhraseLength: number = 10): PhraseCandidate[] {
    const candidates: PhraseCandidate[] = [];

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === TokenType.CHINESE_WORD || tokens[i].type === TokenType.CHINESE_CHAR) {
        // Generate phrase candidates of different lengths
        for (let length = 1; length <= maxPhraseLength && i + length <= tokens.length; length++) {
          let phrase = '';
          let isValidPhrase = true;
          let endIndex = i + length - 1;

          // Build phrase from consecutive Chinese tokens
          for (let j = i; j < i + length; j++) {
            const token = tokens[j];
            if (token.type === TokenType.CHINESE_WORD || token.type === TokenType.CHINESE_CHAR) {
              phrase += token.value;
            } else if (token.type === TokenType.WHITESPACE && j < i + length - 1) {
              // Allow whitespace within phrases but not at the end
              continue;
            } else {
              isValidPhrase = false;
              break;
            }
          }

          if (isValidPhrase && phrase.length > 0) {
            candidates.push({
              phrase,
              startIndex: i,
              endIndex,
              length: phrase.length,
              tokenCount: length,
            });
          }
        }
      }
    }

    // Sort by phrase length (longest first) for greedy matching
    return candidates.sort((a, b) => b.length - a.length);
  }

  /**
   * Analyze text composition for optimization hints
   *
   * @param text - Input text
   * @returns Analysis results with complexity and strategy suggestions
   *
   * @example
   * const analysis = tokenizer.analyzeText("在那些魔帅眼中，");
   * console.log(analysis.complexity); // "chinese_heavy"
   * console.log(analysis.strategy); // "prioritize_phrase_matching"
   */
  analyzeText(text: string): TextAnalysis {
    const tokens = this.tokenize(text);
    const groups = this.groupTokensByType(tokens);

    const analysis: TextAnalysis = {
      totalLength: text.length,
      tokenCount: tokens.length,
      composition: {},
      complexity: 'simple',
    };

    // Calculate composition percentages
    Object.entries(groups).forEach(([type, tokenList]) => {
      const charCount = tokenList.reduce(
        (sum: number, { token }: GroupedToken) => sum + token.value.length,
        0
      );
      analysis.composition[type] = {
        tokens: tokenList.length,
        characters: charCount,
        percentage: ((charCount / text.length) * 100).toFixed(1),
      };
    });

    // Determine complexity
    const chineseRatio =
      parseFloat(analysis.composition[TokenType.CHINESE_WORD]?.percentage || '0') +
      parseFloat(analysis.composition[TokenType.CHINESE_CHAR]?.percentage || '0');

    if (chineseRatio > 80) {
      analysis.complexity = 'chinese_heavy';
    } else if (chineseRatio > 20) {
      analysis.complexity = 'mixed';
    } else {
      analysis.complexity = 'latin_heavy';
    }

    // Suggest optimization strategy
    if (analysis.complexity === 'chinese_heavy') {
      analysis.strategy = 'prioritize_phrase_matching';
    } else if (analysis.complexity === 'mixed') {
      analysis.strategy = 'balanced_processing';
    } else {
      analysis.strategy = 'minimal_processing';
    }

    return analysis;
  }
}
