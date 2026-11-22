/**
 * Tests for Token Helper Utilities
 *
 * Tests pure utility functions for token manipulation and text extraction.
 */

import {
  getSemanticTokens,
  isSemanticTokenType,
  reconstructChineseText,
  readLookupText,
  tokenLengthOf,
} from '../TokenHelpers.js';
import { TokenType } from '../text/TextTokenizer.js';

// Helper to create test tokens
function createToken(type, value, start = 0, options = {}) {
  return {
    type,
    value,
    start,
    end: start + value.length,
    translated: null,
    isGrouped: options.isGrouped || false,
    groupedWith: options.groupedWith || [],
    groupLeader: options.groupLeader !== undefined ? options.groupLeader : null,
    originalValue: options.originalValue,
  };
}

describe('getSemanticTokens', () => {
  test('should extract Chinese words and characters', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_WORD, '魔帅', 2),
      createToken(TokenType.PUNCTUATION, '。', 4),
    ];

    const semanticTokens = getSemanticTokens(tokens);

    expect(semanticTokens).toHaveLength(3);
    expect(semanticTokens[0].value).toBe('在');
    expect(semanticTokens[0].originalIndex).toBe(0);
    expect(semanticTokens[1].value).toBe('那');
    expect(semanticTokens[1].originalIndex).toBe(1);
    expect(semanticTokens[2].value).toBe('魔帅');
    expect(semanticTokens[2].originalIndex).toBe(2);
  });

  test('should exclude punctuation and whitespace', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.WHITESPACE, ' ', 1),
      createToken(TokenType.CHINESE_CHAR, '那', 2),
      createToken(TokenType.PUNCTUATION, '，', 3),
      createToken(TokenType.CHINESE_CHAR, '里', 4),
    ];

    const semanticTokens = getSemanticTokens(tokens);

    expect(semanticTokens).toHaveLength(3);
    expect(semanticTokens.map((t) => t.value)).toEqual(['在', '那', '里']);
  });

  test('should skip grouped followers', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '魔', 0),
      createToken(TokenType.CHINESE_CHAR, '帅', 1, { isGrouped: true, groupLeader: 0 }),
      createToken(TokenType.CHINESE_CHAR, '那', 2),
    ];

    const semanticTokens = getSemanticTokens(tokens);

    expect(semanticTokens).toHaveLength(2);
    expect(semanticTokens[0].value).toBe('魔');
    expect(semanticTokens[1].value).toBe('那');
  });

  test('should include grouped leaders', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '魔', 0, { isGrouped: true, groupedWith: [1] }),
      createToken(TokenType.CHINESE_CHAR, '帅', 1, { isGrouped: true, groupLeader: 0 }),
    ];

    const semanticTokens = getSemanticTokens(tokens);

    expect(semanticTokens).toHaveLength(1);
    expect(semanticTokens[0].value).toBe('魔');
  });

  test('should handle empty token array', () => {
    const semanticTokens = getSemanticTokens([]);
    expect(semanticTokens).toEqual([]);
  });

  test('includes latin words and numbers', () => {
    const tokens = [
      createToken(TokenType.LATIN_WORD, 'yuan', 0),
      createToken(TokenType.CHINESE_WORD, '主厨', 4),
      createToken(TokenType.NUMBER, '三', 6),
    ];

    expect(getSemanticTokens(tokens).map((t) => t.value)).toEqual(['yuan', '主厨', '三']);
  });

  test('preserves originalIndex from the input array', () => {
    const tokens = [
      createToken(TokenType.PUNCTUATION, '「', 0),
      createToken(TokenType.CHINESE_CHAR, '我', 1),
      createToken(TokenType.PUNCTUATION, '」', 2),
      createToken(TokenType.CHINESE_WORD, '手套', 3),
    ];

    expect(getSemanticTokens(tokens).map((t) => t.originalIndex)).toEqual([1, 3]);
  });

  test('does not mutate the input tokens', () => {
    const tokens = [createToken(TokenType.CHINESE_CHAR, '我', 0)];
    getSemanticTokens(tokens);
    expect(tokens[0]).not.toHaveProperty('originalIndex');
    expect(tokens[0]).not.toHaveProperty('hasPrecedingBoundary');
  });

  describe('hasPrecedingBoundary', () => {
    test('is false between adjacent semantic tokens', () => {
      const tokens = [
        createToken(TokenType.CHINESE_CHAR, '在', 0),
        createToken(TokenType.CHINESE_CHAR, '那', 1),
      ];
      expect(getSemanticTokens(tokens).map((t) => t.hasPrecedingBoundary)).toEqual([false, false]);
    });

    test('is true after punctuation or whitespace between semantic tokens', () => {
      const tokens = [
        createToken(TokenType.CHINESE_CHAR, '在', 0),
        createToken(TokenType.PUNCTUATION, '，', 1),
        createToken(TokenType.CHINESE_CHAR, '那', 2),
        createToken(TokenType.WHITESPACE, ' ', 3),
        createToken(TokenType.CHINESE_CHAR, '里', 4),
      ];
      expect(getSemanticTokens(tokens).map((t) => t.hasPrecedingBoundary)).toEqual([
        false,
        true,
        true,
      ]);
    });

    test('is false for the first token even after leading punctuation', () => {
      const tokens = [
        createToken(TokenType.PUNCTUATION, '「', 0),
        createToken(TokenType.CHINESE_CHAR, '我', 1),
      ];
      expect(getSemanticTokens(tokens)[0].hasPrecedingBoundary).toBe(false);
    });

    test('a grouped follower sets no boundary', () => {
      const tokens = [
        createToken(TokenType.CHINESE_CHAR, '魔', 0),
        createToken(TokenType.CHINESE_CHAR, '帅', 1, { isGrouped: true, groupLeader: 0 }),
        createToken(TokenType.CHINESE_CHAR, '那', 2),
      ];
      expect(getSemanticTokens(tokens).map((t) => t.hasPrecedingBoundary)).toEqual([false, false]);
    });
  });
});

describe('isSemanticTokenType', () => {
  test.each([
    TokenType.CHINESE_CHAR,
    TokenType.CHINESE_WORD,
    TokenType.LATIN_WORD,
    TokenType.NUMBER,
  ])('%s is semantic', (type) => {
    expect(isSemanticTokenType(type)).toBe(true);
  });

  test.each([TokenType.PUNCTUATION, TokenType.WHITESPACE])('%s is not semantic', (type) => {
    expect(isSemanticTokenType(type)).toBe(false);
  });
});

describe('reconstructChineseText', () => {
  test('should reconstruct text from Chinese tokens only', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_WORD, '魔帅', 2),
      createToken(TokenType.CHINESE_CHAR, '眼', 4),
      createToken(TokenType.CHINESE_CHAR, '中', 5),
    ];

    const text = reconstructChineseText(tokens);
    expect(text).toBe('在那魔帅眼中');
  });

  test('should exclude punctuation and whitespace', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.PUNCTUATION, '，', 1),
      createToken(TokenType.CHINESE_CHAR, '那', 2),
      createToken(TokenType.WHITESPACE, ' ', 3),
      createToken(TokenType.CHINESE_CHAR, '里', 4),
    ];

    const text = reconstructChineseText(tokens);
    expect(text).toBe('在那里');
  });

  test('should exclude latin words and numbers', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.LATIN_WORD, 'ABC', 1),
      createToken(TokenType.CHINESE_CHAR, '那', 4),
      createToken(TokenType.NUMBER, '123', 5),
      createToken(TokenType.CHINESE_CHAR, '里', 8),
    ];

    const text = reconstructChineseText(tokens);
    expect(text).toBe('在那里');
  });

  test('should handle empty token array', () => {
    const text = reconstructChineseText([]);
    expect(text).toBe('');
  });

  test('should handle array with no Chinese tokens', () => {
    const tokens = [
      createToken(TokenType.PUNCTUATION, '。', 0),
      createToken(TokenType.WHITESPACE, ' ', 1),
      createToken(TokenType.LATIN_WORD, 'Hello', 2),
    ];

    const text = reconstructChineseText(tokens);
    expect(text).toBe('');
  });
});

describe('readLookupText', () => {
  test('should reconstruct text from start index until punctuation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
      createToken(TokenType.PUNCTUATION, '，', 3),
      createToken(TokenType.CHINESE_CHAR, '魔', 4),
    ];

    const text = readLookupText(tokens, 0).text;
    expect(text).toBe('在那些');
  });

  test('should start from specified index', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
      createToken(TokenType.PUNCTUATION, '。', 3),
    ];

    const text = readLookupText(tokens, 1).text;
    expect(text).toBe('那些');
  });

  test('should stop at first punctuation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.PUNCTUATION, '，', 2),
      createToken(TokenType.CHINESE_CHAR, '些', 3),
      createToken(TokenType.PUNCTUATION, '。', 4),
    ];

    const text = readLookupText(tokens, 0).text;
    expect(text).toBe('在那');
  });

  test('should include all tokens if no punctuation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
    ];

    const text = readLookupText(tokens, 0).text;
    expect(text).toBe('在那些');
  });

  test('skips whitespace but keeps numbers and Latin words', () => {
    // Keeping them lets a key like 绝对战警2 match and stops 王五 matching across 王5五
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.WHITESPACE, ' ', 1),
      createToken(TokenType.CHINESE_CHAR, '那', 2),
      createToken(TokenType.NUMBER, '123', 3),
      createToken(TokenType.LATIN_WORD, 'abc', 6),
      createToken(TokenType.CHINESE_CHAR, '里', 9),
    ];

    const text = readLookupText(tokens, 0).text;
    expect(text).toBe('在那123abc里');
  });

  test('should return empty string if starting at punctuation', () => {
    const tokens = [
      createToken(TokenType.PUNCTUATION, '，', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
    ];

    const text = readLookupText(tokens, 0).text;
    expect(text).toBe('');
  });

  test('should handle start index beyond array length', () => {
    const tokens = [createToken(TokenType.CHINESE_CHAR, '在', 0)];

    const text = readLookupText(tokens, 5).text;
    expect(text).toBe('');
  });

  test("reads a grouped leader's own text, not the grouped text its followers repeat", () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '降', 0),
      createToken(TokenType.CHINESE_CHAR, '魔杖', 1, { originalValue: '魔' }),
      createToken(TokenType.CHINESE_CHAR, '杖', 2, { originalValue: '杖' }),
    ];

    expect(readLookupText(tokens, 0).text).toBe('降魔杖');
  });

  test('records where each token it read ends, skipping whitespace', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '墨', 0),
      createToken(TokenType.WHITESPACE, ' ', 1),
      createToken(TokenType.CHINESE_CHAR, '子', 2),
      createToken(TokenType.LATIN_WORD, 'XY', 3),
    ];

    expect(readLookupText(tokens, 0).tokenEnds).toEqual([
      { tokenIndex: 0, end: 1 },
      { tokenIndex: 2, end: 2 },
      { tokenIndex: 3, end: 4 },
    ]);
  });

  test('reads through punctuation while the text is shorter than throughPunctuation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '乔', 0),
      createToken(TokenType.CHINESE_CHAR, '斯', 1),
      createToken(TokenType.PUNCTUATION, '-', 2),
      createToken(TokenType.CHINESE_CHAR, '韦', 3),
      createToken(TokenType.PUNCTUATION, '。', 4),
      createToken(TokenType.CHINESE_CHAR, '登', 5),
    ];

    expect(readLookupText(tokens, 0, 4).text).toBe('乔斯-韦');
  });
});

describe('tokenLengthOf', () => {
  const tokens = [
    createToken(TokenType.CHINESE_CHAR, '墨', 0),
    createToken(TokenType.WHITESPACE, ' ', 1),
    createToken(TokenType.CHINESE_CHAR, '子', 2),
    createToken(TokenType.WHITESPACE, ' ', 3),
    createToken(TokenType.LATIN_WORD, 'XY', 4),
  ];
  const lookup = readLookupText(tokens, 0);

  test('counts from the start through the last token the match covers, spaces between included', () => {
    expect(tokenLengthOf(lookup, 0, 1)).toBe(1);
    expect(tokenLengthOf(lookup, 0, 2)).toBe(3);
    expect(tokenLengthOf(lookup, 0, 4)).toBe(5);
  });

  test('is 0 for a match ending partway through a token, or past the text', () => {
    expect(tokenLengthOf(lookup, 0, 3)).toBe(0);
    expect(tokenLengthOf(lookup, 0, 5)).toBe(0);
  });

  test('counts from a start in the middle of the array', () => {
    const tail = readLookupText(tokens, 2);
    expect(tokenLengthOf(tail, 2, 1)).toBe(1);
    expect(tokenLengthOf(tail, 2, 3)).toBe(3);
  });
});
