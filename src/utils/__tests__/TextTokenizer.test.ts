import { describe, test, expect } from 'vitest';
import { TextTokenizer, Token, TokenType } from '../text/TextTokenizer';

describe('TextTokenizer', () => {
  describe('tokenize()', () => {
    test('classifies Chinese characters individually', () => {
      const tokenizer = new TextTokenizer();

      const tokens = tokenizer.tokenize('你好');

      expect(tokens.map((t) => t.value)).toEqual(['你', '好']);
      expect(tokens.map((t) => t.type)).toEqual([TokenType.CHINESE_CHAR, TokenType.CHINESE_CHAR]);
    });

    test('emits one token per punctuation character, never a run', () => {
      const tokenizer = new TextTokenizer();

      const tokens = tokenizer.tokenize('他说……好：“');

      expect(tokens.map((t) => t.value)).toEqual(['他', '说', '…', '…', '好', '：', '“']);
      expect(tokens[2].type).toBe(TokenType.PUNCTUATION);
    });

    test('underscore is punctuation', () => {
      const tokens = new TextTokenizer().tokenize('他__好');

      expect(tokens.map((t) => t.value)).toEqual(['他', '_', '_', '好']);
      expect(tokens[1].type).toBe(TokenType.PUNCTUATION);
    });

    test('CJK Extension A and Compatibility Ideographs classify as chinese_char', () => {
      const tokenizer = new TextTokenizer();

      expect(tokenizer.tokenize('\u{3400}')[0].type).toBe(TokenType.CHINESE_CHAR);
      // U+F900 NFC-normalizes to U+8C48, so assert the type, not the value
      expect(tokenizer.tokenize('\u{F900}')[0].type).toBe(TokenType.CHINESE_CHAR);
    });

    test('BOM (U+FEFF) is punctuation, not whitespace', () => {
      // Unicode White_Space does not include U+FEFF (ECMAScript's \s does), and the
      // tokenizer follows White_Space.
      expect(new TextTokenizer().tokenize('\u{FEFF}')[0].type).toBe(TokenType.PUNCTUATION);
    });

    test('an astral character is one token, indexed in UTF-16 units', () => {
      const tokens = new TextTokenizer().tokenize('a\u{20000}b');

      expect(tokens.map((t) => t.value)).toEqual(['a', '\u{20000}', 'b']);
      expect(tokens.map((t) => [t.start, t.end])).toEqual([
        [0, 1],
        [1, 3],
        [3, 4],
      ]);
    });

    test('text is NFC-normalized before tokenizing', () => {
      const tokens = new TextTokenizer().tokenize('e\u0301');

      expect(tokens.map((t) => t.value)).toEqual(['\u00e9']);
    });

    test('consumes entire Latin word and number as single tokens', () => {
      const tokenizer = new TextTokenizer();

      expect(tokenizer.tokenize('hello').map((t) => t.value)).toEqual(['hello']);
      expect(tokenizer.tokenize('12345').map((t) => t.value)).toEqual(['12345']);
    });

    test('decimal point splits a number into two number tokens', () => {
      const tokenizer = new TextTokenizer();

      const tokens = tokenizer.tokenize('100.99');

      expect(tokens.map((t) => t.value)).toEqual(['100', '.', '99']);
      expect(tokens.map((t) => t.type)).toEqual([
        TokenType.NUMBER,
        TokenType.PUNCTUATION,
        TokenType.NUMBER,
      ]);
    });

    test('empty string returns no tokens', () => {
      const tokenizer = new TextTokenizer();

      expect(tokenizer.tokenize('')).toEqual([]);
    });
  });

  describe('groupTokensByType', () => {
    test('groups tokens by type with index preserved', () => {
      const tokenizer = new TextTokenizer();
      const tokens = [
        new Token(TokenType.CHINESE_CHAR, '你', 0, 1),
        new Token(TokenType.LATIN_WORD, 'hi', 1, 3),
        new Token(TokenType.CHINESE_CHAR, '好', 3, 4),
      ];

      const groups = tokenizer.groupTokensByType(tokens);

      expect(groups[TokenType.CHINESE_CHAR].map((g) => g.index)).toEqual([0, 2]);
      expect(groups[TokenType.LATIN_WORD].map((g) => g.index)).toEqual([1]);
    });
  });

  describe('reconstruct', () => {
    test('uses translated value when present, falls back to original value', () => {
      const tokenizer = new TextTokenizer();
      const a = new Token(TokenType.CHINESE_CHAR, '你', 0, 1);
      a.translated = 'you';
      const b = new Token(TokenType.CHINESE_CHAR, '好', 1, 2);

      expect(tokenizer.reconstruct([a, b])).toBe('you好');
    });
  });

  describe('findPhraseCandidates', () => {
    test('generates candidates of increasing length from consecutive Chinese tokens', () => {
      const tokenizer = new TextTokenizer();
      const tokens = [
        new Token(TokenType.CHINESE_CHAR, '你', 0, 1),
        new Token(TokenType.CHINESE_CHAR, '好', 1, 2),
      ];

      const candidates = tokenizer.findPhraseCandidates(tokens, 5);

      expect(candidates.map((c) => c.phrase)).toContain('你好');
      expect(candidates.map((c) => c.phrase)).toContain('你');
      expect(candidates.map((c) => c.phrase)).toContain('好');
      // Sorted longest-first for greedy matching
      expect(candidates[0].phrase).toBe('你好');
    });

    test('stops a candidate at a non-Chinese token', () => {
      const tokenizer = new TextTokenizer();
      const tokens = [
        new Token(TokenType.CHINESE_CHAR, '你', 0, 1),
        new Token(TokenType.LATIN_WORD, 'hi', 1, 3),
        new Token(TokenType.CHINESE_CHAR, '好', 3, 4),
      ];

      const candidates = tokenizer.findPhraseCandidates(tokens, 5);

      expect(candidates.map((c) => c.phrase)).not.toContain('你好');
    });
  });

  describe('analyzeText', () => {
    test('classifies Chinese-heavy text and suggests phrase-matching strategy', () => {
      const tokenizer = new TextTokenizer();

      const analysis = tokenizer.analyzeText('你好世界啊');

      expect(analysis.complexity).toBe('chinese_heavy');
      expect(analysis.strategy).toBe('prioritize_phrase_matching');
    });

    test('classifies Latin-heavy text and suggests minimal processing', () => {
      const tokenizer = new TextTokenizer();

      const analysis = tokenizer.analyzeText('hello world');

      expect(analysis.complexity).toBe('latin_heavy');
      expect(analysis.strategy).toBe('minimal_processing');
    });
  });
});
