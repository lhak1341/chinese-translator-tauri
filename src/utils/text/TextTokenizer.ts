/**
 * Text Tokenizer for efficient translation processing
 * Segments text into meaningful units for optimized translation
 *
 * WASM Acceleration: Uses Rust-based direct character classification for 3-8x speedup
 * Fallback: JavaScript regex-based tokenization if WASM unavailable
 */

import { WasmTextTokenizer } from '../wasm/WasmTextTokenizer.js';

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
  | 'prioritize_phrase_matching'
  | 'balanced_processing'
  | 'minimal_processing';

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
  private wasmTokenizer: WasmTextTokenizer | null = null;
  private wasmInitialized: boolean = false;

  constructor() {
    // Compiled regex for efficient matching - capture individual Chinese characters
    this.tokenRegex = new RegExp(
      `([\u4e00-\u9fff])|([A-Za-z]+)|(\\d+)|([^\\w\\s\u4e00-\u9fff]+)|(\\s+)`,
      'g'
    );

    // Initialize WASM tokenizer (async, don't block constructor)
    this.initializeWasm();
  }

  /**
   * Initialize WASM tokenizer asynchronously
   */
  private async initializeWasm(): Promise<void> {
    try {
      this.wasmTokenizer = new WasmTextTokenizer();
      this.wasmInitialized = await this.wasmTokenizer.initialize();
    } catch (error) {
      // WASM initialization failed, will use JavaScript fallback
      this.wasmInitialized = false;
    }
  }

  /**
   * Tokenize text into meaningful segments
   *
   * WASM Acceleration: Tries WASM tokenizer first (3-8x faster), falls back to JavaScript
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

    // Try WASM tokenizer first
    if (this.wasmInitialized && this.wasmTokenizer) {
      const wasmTokens = this.wasmTokenizer.tokenize(text);
      if (wasmTokens !== null) {
        // Convert WASM tokens to Token instances
        return wasmTokens.map((t: any) => new Token(t.type, t.value, t.start, t.end));
      }
    }

    // Fallback to JavaScript regex tokenization
    return this.tokenizeJS(text);
  }

  /**
   * JavaScript regex-based tokenization (fallback)
   *
   * @param text - Input text to tokenize
   * @returns Array of tokens
   */
  private tokenizeJS(text: string): Token[] {
    const tokens: Token[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    // Reset regex
    this.tokenRegex.lastIndex = 0;

    while ((match = this.tokenRegex.exec(text)) !== null) {
      const [fullMatch, chinese, latin, number, punct, whitespace] = match;
      const start = match.index;
      const end = start + fullMatch.length;

      // Handle gap between matches (shouldn't happen with our regex, but safety check)
      if (start > lastIndex) {
        const unknownText = text.slice(lastIndex, start);
        tokens.push(new Token(TokenType.UNKNOWN, unknownText, lastIndex, start));
      }

      // Determine token type and create token
      let tokenType: string;
      if (chinese) {
        // Always treat as individual characters for better dictionary matching
        tokenType = TokenType.CHINESE_CHAR;
      } else if (latin) {
        tokenType = TokenType.LATIN_WORD;
      } else if (number) {
        tokenType = TokenType.NUMBER;
      } else if (punct) {
        tokenType = TokenType.PUNCTUATION;
      } else if (whitespace) {
        tokenType = TokenType.WHITESPACE;
      } else {
        tokenType = TokenType.UNKNOWN;
      }

      tokens.push(new Token(tokenType, fullMatch, start, end));
      lastIndex = end;
    }

    // Handle any remaining text
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      tokens.push(new Token(TokenType.UNKNOWN, remainingText, lastIndex, text.length));
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

// Utility functions

/**
 * Create a new tokenizer instance
 *
 * @returns New TextTokenizer instance
 */
export const createTokenizer = (): TextTokenizer => new TextTokenizer();

/**
 * Convert token type to human-readable string
 *
 * @param type - Token type
 * @returns Human-readable type name
 *
 * @example
 * tokenTypeToString(TokenType.CHINESE_CHAR); // "Chinese Character"
 */
export const tokenTypeToString = (type: string): string => {
  const typeNames: Record<string, string> = {
    [TokenType.CHINESE_CHAR]: 'Chinese Character',
    [TokenType.CHINESE_WORD]: 'Chinese Word',
    [TokenType.LATIN_WORD]: 'Latin Word',
    [TokenType.NUMBER]: 'Number',
    [TokenType.PUNCTUATION]: 'Punctuation',
    [TokenType.WHITESPACE]: 'Whitespace',
    [TokenType.UNKNOWN]: 'Unknown',
  };
  return typeNames[type] || 'Unknown';
};
