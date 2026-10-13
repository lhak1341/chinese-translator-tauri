/**
 * Tests for Token Helper Utilities
 *
 * Tests pure utility functions for token manipulation and text extraction.
 */

import {
  getSemanticTokens,
  isSemanticTokenType,
  getTokenSpanForText,
  reconstructChineseText,
  reconstructTextFromIndex,
  getTextFromTokens,
  getTextPositionForTokenIndex,
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

describe('getTokenSpanForText', () => {
  test('should calculate span for matching text', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
      createToken(TokenType.CHINESE_CHAR, '魔', 3),
    ];

    const span = getTokenSpanForText(tokens, 0, '在那些');
    expect(span).toBe(3);
  });

  test('should stop when text no longer matches', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '里', 2),
    ];

    const span = getTokenSpanForText(tokens, 0, '在那些');
    expect(span).toBe(2); // Stops at '那' because next token is '里' not '些'
  });

  test('should handle originalValue for grouped tokens', () => {
    const tokens = [
      createToken(TokenType.CHINESE_WORD, '魔帅', 0, { originalValue: '魔帅' }),
      createToken(TokenType.CHINESE_CHAR, '眼', 2),
    ];

    const span = getTokenSpanForText(tokens, 0, '魔帅眼');
    expect(span).toBe(2);
  });

  test('should return 0 for non-matching text', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
    ];

    const span = getTokenSpanForText(tokens, 0, '魔帅');
    expect(span).toBe(0);
  });

  test('should handle startIndex in middle of array', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
      createToken(TokenType.CHINESE_CHAR, '魔', 3),
    ];

    const span = getTokenSpanForText(tokens, 2, '些魔');
    expect(span).toBe(2);
  });

  test('should handle empty remaining text', () => {
    const tokens = [createToken(TokenType.CHINESE_CHAR, '在', 0)];

    const span = getTokenSpanForText(tokens, 0, '');
    expect(span).toBe(0);
  });

  test('should skip non-Chinese tokens (punctuation, whitespace)', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.PUNCTUATION, '，', 1),
      createToken(TokenType.CHINESE_CHAR, '那', 2),
    ];

    // The skipped token is inside the span: a caller claiming `span` tokens from the start
    // must reach the last matched one ("墨 子" claimed 2 of 3 tokens and left 子 untranslated).
    const span = getTokenSpanForText(tokens, 0, '在那');
    expect(span).toBe(3);
  });

  test('should not count non-Chinese tokens after the last matched token', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '墨', 0),
      createToken(TokenType.WHITESPACE, ' ', 1),
      createToken(TokenType.CHINESE_CHAR, '子', 2),
      createToken(TokenType.WHITESPACE, ' ', 3),
    ];

    expect(getTokenSpanForText(tokens, 0, '墨子')).toBe(3);
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

describe('reconstructTextFromIndex', () => {
  test('should reconstruct text from start index until punctuation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
      createToken(TokenType.PUNCTUATION, '，', 3),
      createToken(TokenType.CHINESE_CHAR, '魔', 4),
    ];

    const text = reconstructTextFromIndex(tokens, 0);
    expect(text).toBe('在那些');
  });

  test('should start from specified index', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
      createToken(TokenType.PUNCTUATION, '。', 3),
    ];

    const text = reconstructTextFromIndex(tokens, 1);
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

    const text = reconstructTextFromIndex(tokens, 0);
    expect(text).toBe('在那');
  });

  test('should include all tokens if no punctuation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
    ];

    const text = reconstructTextFromIndex(tokens, 0);
    expect(text).toBe('在那些');
  });

  test('should skip non-Chinese tokens (except punctuation)', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.WHITESPACE, ' ', 1),
      createToken(TokenType.CHINESE_CHAR, '那', 2),
      createToken(TokenType.NUMBER, '123', 3),
      createToken(TokenType.CHINESE_CHAR, '里', 6),
    ];

    const text = reconstructTextFromIndex(tokens, 0);
    expect(text).toBe('在那里');
  });

  test('should return empty string if starting at punctuation', () => {
    const tokens = [
      createToken(TokenType.PUNCTUATION, '，', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
    ];

    const text = reconstructTextFromIndex(tokens, 0);
    expect(text).toBe('');
  });

  test('should handle start index beyond array length', () => {
    const tokens = [createToken(TokenType.CHINESE_CHAR, '在', 0)];

    const text = reconstructTextFromIndex(tokens, 5);
    expect(text).toBe('');
  });
});

describe('getTextFromTokens', () => {
  test('should reconstruct complete text with all token types', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.PUNCTUATION, '，', 2),
      createToken(TokenType.WHITESPACE, ' ', 3),
      createToken(TokenType.CHINESE_CHAR, '里', 4),
    ];

    const text = getTextFromTokens(tokens);
    expect(text).toBe('在那， 里');
  });

  test('should exclude grouped followers', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '魔', 0, { isGrouped: true, groupedWith: [1] }),
      createToken(TokenType.CHINESE_CHAR, '帅', 1, { isGrouped: true, groupLeader: 0 }),
      createToken(TokenType.CHINESE_CHAR, '那', 2),
    ];

    const text = getTextFromTokens(tokens);
    expect(text).toBe('魔那');
  });

  test('should handle tokens with null groupLeader', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
    ];

    const text = getTextFromTokens(tokens);
    expect(text).toBe('在那');
  });

  test('should handle tokens with undefined groupLeader', () => {
    const tokens = [
      { type: TokenType.CHINESE_CHAR, value: '在', groupLeader: undefined },
      { type: TokenType.CHINESE_CHAR, value: '那', groupLeader: undefined },
    ];

    const text = getTextFromTokens(tokens);
    expect(text).toBe('在那');
  });

  test('should handle empty token array', () => {
    const text = getTextFromTokens([]);
    expect(text).toBe('');
  });

  test('should preserve whitespace and punctuation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '你', 0),
      createToken(TokenType.CHINESE_CHAR, '好', 1),
      createToken(TokenType.PUNCTUATION, '，', 2),
      createToken(TokenType.WHITESPACE, ' ', 3),
      createToken(TokenType.CHINESE_CHAR, '世', 4),
      createToken(TokenType.CHINESE_CHAR, '界', 5),
      createToken(TokenType.PUNCTUATION, '！', 6),
    ];

    const text = getTextFromTokens(tokens);
    expect(text).toBe('你好， 世界！');
  });
});

describe('getTextPositionForTokenIndex', () => {
  test('should return cached position from tokenizer', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
      createToken(TokenType.CHINESE_CHAR, '些', 2),
    ];

    expect(getTextPositionForTokenIndex(tokens, 0)).toBe(0);
    expect(getTextPositionForTokenIndex(tokens, 1)).toBe(1);
    expect(getTextPositionForTokenIndex(tokens, 2)).toBe(2);
  });

  test('should fallback to calculation if start position missing', () => {
    const tokens = [
      { type: TokenType.CHINESE_CHAR, value: '在' }, // No start property
      { type: TokenType.CHINESE_CHAR, value: '那' },
      { type: TokenType.CHINESE_CHAR, value: '些' },
    ];

    expect(getTextPositionForTokenIndex(tokens, 0)).toBe(0);
    expect(getTextPositionForTokenIndex(tokens, 1)).toBe(1);
    expect(getTextPositionForTokenIndex(tokens, 2)).toBe(2);
  });

  test('should handle multi-character tokens in fallback', () => {
    const tokens = [
      { type: TokenType.CHINESE_WORD, value: '魔帅' },
      { type: TokenType.CHINESE_CHAR, value: '那' },
      { type: TokenType.CHINESE_WORD, value: '眼中' },
    ];

    expect(getTextPositionForTokenIndex(tokens, 0)).toBe(0);
    expect(getTextPositionForTokenIndex(tokens, 1)).toBe(2); // After '魔帅'
    expect(getTextPositionForTokenIndex(tokens, 2)).toBe(3); // After '魔帅那'
  });

  test('should handle negative index', () => {
    const tokens = [createToken(TokenType.CHINESE_CHAR, '在', 0)];

    const position = getTextPositionForTokenIndex(tokens, -1);
    expect(position).toBe(0);
  });

  test('should handle index beyond array length', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 0),
      createToken(TokenType.CHINESE_CHAR, '那', 1),
    ];

    // Should calculate position up to array length
    const position = getTextPositionForTokenIndex(tokens, 5);
    expect(position).toBe(2); // Length of all tokens
  });

  test('should handle empty token array', () => {
    const position = getTextPositionForTokenIndex([], 0);
    expect(position).toBe(0);
  });

  test('should prefer cached start position over calculation', () => {
    const tokens = [
      createToken(TokenType.CHINESE_CHAR, '在', 10), // Unusual start position
      createToken(TokenType.CHINESE_CHAR, '那', 15),
    ];

    // Should use cached position (10), not calculate from beginning (0)
    expect(getTextPositionForTokenIndex(tokens, 0)).toBe(10);
    expect(getTextPositionForTokenIndex(tokens, 1)).toBe(15);
  });
});
