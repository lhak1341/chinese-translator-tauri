import { describe, test, expect, vi, beforeEach } from 'vitest';
import { TextTokenizer, Token, TokenType, tokenTypeToString } from '../text/TextTokenizer';

const mockInitialize = vi.fn();
const mockTokenize = vi.fn();

vi.mock('../wasm/WasmTextTokenizer.js', () => ({
  WasmTextTokenizer: class {
    initialize = mockInitialize;
    tokenize = mockTokenize;
  },
}));

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('TextTokenizer', () => {
  beforeEach(() => {
    mockInitialize.mockReset();
    mockTokenize.mockReset();
  });

  describe('tokenize() — JS fallback path (WASM unavailable)', () => {
    beforeEach(() => {
      mockInitialize.mockResolvedValue(false);
    });

    test('classifies Chinese characters individually', async () => {
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const tokens = tokenizer.tokenize('你好');

      expect(tokens.map((t) => t.value)).toEqual(['你', '好']);
      expect(tokens.map((t) => t.type)).toEqual([TokenType.CHINESE_CHAR, TokenType.CHINESE_CHAR]);
    });

    test('groups a run of punctuation into one token', async () => {
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const tokens = tokenizer.tokenize('他说……好');

      expect(tokens.map((t) => t.value)).toEqual(['他', '说', '……', '好']);
      expect(tokens[2].type).toBe(TokenType.PUNCTUATION);
    });

    test('underscore run falls into the gap-fill UNKNOWN token', async () => {
      // KNOWN DIVERGENCE from Rust (see text_tokenizer.rs's mod tests):
      // \w excludes '_' from every capture group here (chinese/latin/digit/whitespace
      // all reject it, and the punct catch-all [^\w\s...] rejects it too since \w
      // matches '_') — so it falls into the gap-fill path and is typed UNKNOWN.
      // Rust's catch-all has no \w-shaped exclusion, so '_' becomes 'punctuation'
      // there instead. Left unreconciled — out of scope for the 2026-07-17c fix.
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const tokens = tokenizer.tokenize('他__好');

      expect(tokens.map((t) => t.value)).toEqual(['他', '__', '好']);
      expect(tokens[1].type).toBe(TokenType.UNKNOWN);
    });

    test('CJK Extension A / Compatibility Ideographs classify as punctuation, not chinese_char', async () => {
      // KNOWN DIVERGENCE from Rust (see text_tokenizer.rs's mod tests):
      // this regex's chinese group only checks 一-鿿 (CJK Unified). Rust's
      // is_chinese_char additionally covers CJK Ext A (U+3400-4DBF) and
      // Compatibility Ideographs (U+F900-FAFF), so it types these chinese_char.
      // Here they match none of chinese/latin/digit/whitespace, so they fall into
      // the punct catch-all group instead. Mirror-image of the fixed punctuation gap,
      // on rare chars — not unified.
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      expect(tokenizer.tokenize('\u{3400}')[0].type).toBe(TokenType.PUNCTUATION);
      expect(tokenizer.tokenize('\u{F900}')[0].type).toBe(TokenType.PUNCTUATION);
    });

    test('BOM (U+FEFF) classifies as whitespace, not punctuation', async () => {
      // KNOWN DIVERGENCE from Rust (see text_tokenizer.rs's mod tests): ECMAScript's
      // \s regex class matches ZERO WIDTH NO-BREAK SPACE (U+FEFF, the UTF-8 BOM) per
      // spec. Rust's char::is_whitespace() does not (U+FEFF isn't in Unicode's
      // White_Space property) — Rust's catch-all types it punctuation instead.
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      expect(tokenizer.tokenize('\u{FEFF}')[0].type).toBe(TokenType.WHITESPACE);
    });

    test('consumes entire Latin word and number as single tokens', async () => {
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      expect(tokenizer.tokenize('hello').map((t) => t.value)).toEqual(['hello']);
      expect(tokenizer.tokenize('12345').map((t) => t.value)).toEqual(['12345']);
    });

    test('decimal point splits a number into two number tokens', async () => {
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const tokens = tokenizer.tokenize('100.99');

      expect(tokens.map((t) => t.value)).toEqual(['100', '.', '99']);
      expect(tokens.map((t) => t.type)).toEqual([
        TokenType.NUMBER,
        TokenType.PUNCTUATION,
        TokenType.NUMBER,
      ]);
    });

    test('empty string returns no tokens', async () => {
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      expect(tokenizer.tokenize('')).toEqual([]);
    });
  });

  describe('tokenize() — WASM path', () => {
    test('converts WASM raw token objects into Token instances', async () => {
      mockInitialize.mockResolvedValue(true);
      mockTokenize.mockReturnValue([
        { type: 'chinese_char', value: '你', start: 0, end: 1 },
        { type: 'chinese_char', value: '好', start: 1, end: 2 },
      ]);

      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const tokens = tokenizer.tokenize('你好');

      expect(tokens[0]).toBeInstanceOf(Token);
      expect(tokens.map((t) => t.value)).toEqual(['你', '好']);
      expect(mockTokenize).toHaveBeenCalledWith('你好');
    });

    test('per-call null from WASM falls back to the JS tokenizer for that call', async () => {
      mockInitialize.mockResolvedValue(true);
      mockTokenize.mockReturnValue(null);

      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const tokens = tokenizer.tokenize('你好');

      expect(tokens.map((t) => t.value)).toEqual(['你', '好']);
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
    beforeEach(() => {
      mockInitialize.mockResolvedValue(false);
    });

    test('classifies Chinese-heavy text and suggests phrase-matching strategy', async () => {
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const analysis = tokenizer.analyzeText('你好世界啊');

      expect(analysis.complexity).toBe('chinese_heavy');
      expect(analysis.strategy).toBe('prioritize_phrase_matching');
    });

    test('classifies Latin-heavy text and suggests minimal processing', async () => {
      const tokenizer = new TextTokenizer();
      await flushMicrotasks();

      const analysis = tokenizer.analyzeText('hello world');

      expect(analysis.complexity).toBe('latin_heavy');
      expect(analysis.strategy).toBe('minimal_processing');
    });
  });

  describe('tokenTypeToString', () => {
    test('maps known types to human-readable labels', () => {
      expect(tokenTypeToString(TokenType.CHINESE_CHAR)).toBe('Chinese Character');
      expect(tokenTypeToString(TokenType.PUNCTUATION)).toBe('Punctuation');
    });

    test('falls back to Unknown for an unrecognized type string', () => {
      expect(tokenTypeToString('not_a_real_type')).toBe('Unknown');
    });
  });
});
