/**
 * Text Tokenizer for efficient translation processing
 * Segments text into meaningful units for optimized translation
 */

export const TokenType = {
  CHINESE_CHAR: 'chinese_char',
  CHINESE_WORD: 'chinese_word',
  LATIN_WORD: 'latin_word',
  NUMBER: 'number',
  PUNCTUATION: 'punctuation',
  WHITESPACE: 'whitespace',
  UNKNOWN: 'unknown',
};

export class Token {
  constructor(type, value, start, end) {
    this.type = type;
    this.value = value;
    this.start = start;
    this.end = end;
    this.translated = null; // Will hold translation result
    this.isGrouped = false; // Whether this token is part of a semantic group
    this.groupedWith = []; // Array of token indices that are grouped with this token
    this.groupLeader = null; // Index of the token that leads this group (null if this is the leader)
  }

  toString() {
    const groupInfo = this.isGrouped ? ` grouped:${this.groupedWith.length}` : '';
    return `Token(${this.type}: "${this.value}", ${this.start}-${this.end}${groupInfo})`;
  }
}

export class TextTokenizer {
  constructor() {
    // Regex patterns for different token types
    this.patterns = {
      chineseChar: /[\u4e00-\u9fff]/,
      latinWord: /[A-Za-z]+/,
      number: /\d+/,
      punctuation: /[^\w\s\u4e00-\u9fff]/,
      whitespace: /\s+/,
    };

    // Compiled regex for efficient matching - capture individual Chinese characters
    this.tokenRegex = new RegExp(
      `([\u4e00-\u9fff])|([A-Za-z]+)|(\\d+)|([^\\w\\s\u4e00-\u9fff]+)|(\\s+)`,
      'g'
    );
  }

  /**
   * Tokenize text into meaningful segments
   * @param {string} text - Input text to tokenize
   * @returns {Token[]} Array of tokens
   */
  tokenize(text) {
    if (!text) return [];

    const tokens = [];
    let match;
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
      let tokenType;
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

    return this.postProcessTokens(tokens);
  }

  /**
   * Post-process tokens to merge related segments
   * @param {Token[]} tokens - Raw tokens
   * @returns {Token[]} Processed tokens
   */
  postProcessTokens(tokens) {
    const processed = [];
    let i = 0;

    while (i < tokens.length) {
      const current = tokens[i];

      // DON'T merge Chinese characters - keep them separate for better dictionary matching
      // This allows partial phrase matching (e.g., "第一" from "第一百三十五节")
      processed.push(current);
      i++;
    }

    return processed;
  }

  /**
   * Group tokens for efficient batch processing
   * @param {Token[]} tokens - Input tokens
   * @returns {Object} Grouped tokens by type
   */
  groupTokensByType(tokens) {
    const groups = {
      [TokenType.CHINESE_CHAR]: [],
      [TokenType.CHINESE_WORD]: [],
      [TokenType.LATIN_WORD]: [],
      [TokenType.NUMBER]: [],
      [TokenType.PUNCTUATION]: [],
      [TokenType.WHITESPACE]: [],
      [TokenType.UNKNOWN]: [],
    };

    tokens.forEach((token, index) => {
      groups[token.type].push({ token, index });
    });

    return groups;
  }

  /**
   * Reconstruct text from tokens
   * @param {Token[]} tokens - Tokens to reconstruct
   * @returns {string} Reconstructed text
   */
  reconstruct(tokens) {
    return tokens.map((token) => token.translated || token.value).join('');
  }

  /**
   * Find potential phrase boundaries for dictionary lookup optimization
   * @param {Token[]} tokens - Input tokens
   * @returns {Array} Phrase candidates with start/end indices
   */
  findPhraseCandidates(tokens, maxPhraseLength = 10) {
    const candidates = [];

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
   * @param {string} text - Input text
   * @returns {Object} Analysis results
   */
  analyzeText(text) {
    const tokens = this.tokenize(text);
    const groups = this.groupTokensByType(tokens);

    const analysis = {
      totalLength: text.length,
      tokenCount: tokens.length,
      composition: {},
      complexity: 'simple',
    };

    // Calculate composition percentages
    Object.entries(groups).forEach(([type, tokenList]) => {
      const charCount = tokenList.reduce((sum, { token }) => sum + token.value.length, 0);
      analysis.composition[type] = {
        tokens: tokenList.length,
        characters: charCount,
        percentage: ((charCount / text.length) * 100).toFixed(1),
      };
    });

    // Determine complexity
    const chineseRatio =
      parseFloat(analysis.composition[TokenType.CHINESE_WORD]?.percentage || 0) +
      parseFloat(analysis.composition[TokenType.CHINESE_CHAR]?.percentage || 0);

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
export const createTokenizer = () => new TextTokenizer();

export const tokenTypeToString = (type) => {
  const typeNames = {
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
