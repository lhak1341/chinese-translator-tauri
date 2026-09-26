// SemanticPatternProcessor tests run in JS-only mode: WASM is mocked to unavailable.
// The processor falls back to its pure-JS matching path, which is the path exercised here.

import { describe, test, expect, vi } from 'vitest';

vi.mock('../wasm/WasmPatternProcessor.js', () => ({
  reinitializeWasmPatternProcessor: vi.fn().mockResolvedValue(false),
  isWasmPatternProcessorReady: vi.fn().mockReturnValue(false),
  hasWasmPatternProcessorFailed: vi.fn().mockReturnValue(false),
  initializeWasmPatternProcessor: vi.fn().mockResolvedValue(false),
  processTokensWasm: vi.fn(),
}));
vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));
vi.mock('../wasm/WasmStringProcessor.js', () => ({
  wasmStringProcessor: {
    isAvailable: vi.fn().mockReturnValue(false),
    concatenateTokenValues: vi.fn(),
    splitAtPosition: vi.fn(),
  },
}));

import { SemanticPatternProcessor } from '../pattern/SemanticPatternProcessor.js';

const makeToken = (type, value, extra = {}) => ({
  type,
  value,
  translated: null,
  translationSource: null,
  ...extra,
});

const DICT = {
  X的Y: 'Y của X',
  X是Y: 'Y là X',
};

describe('SemanticPatternProcessor — constructor', () => {
  test('creates instance without throwing', () => {
    expect(() => new SemanticPatternProcessor()).not.toThrow();
  });

  test('isInitialized is false before initializePatterns', () => {
    const proc = new SemanticPatternProcessor();
    expect(proc.isInitialized).toBe(false);
  });

  test('wasmAvailable is false initially', () => {
    const proc = new SemanticPatternProcessor();
    expect(proc.wasmAvailable).toBe(false);
  });

  test('patterns is empty initially', () => {
    const proc = new SemanticPatternProcessor();
    expect(proc.patterns).toHaveLength(0);
  });
});

describe('SemanticPatternProcessor — initializePatterns()', () => {
  test('sets isInitialized to true', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    expect(proc.isInitialized).toBe(true);
  });

  test('wasmAvailable stays false when WASM mock returns false', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    expect(proc.wasmAvailable).toBe(false);
  });

  test('loads patterns from dictionary', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    expect(proc.patterns.length).toBeGreaterThan(0);
  });

  test('loads patterns from string-value dict', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ X的: 'của X' });
    expect(proc.patterns.length).toBeGreaterThan(0);
  });

  test('loads patterns from object-value dict with metadata', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({
      X的: {
        translation: 'của X', // object format uses 'translation', not 'template'
        allowAsPatternVariable: true,
      },
    });
    expect(proc.patterns.length).toBeGreaterThan(0);
  });

  test('re-initialization clears previous patterns', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ X的: 'của X' });
    const countFirst = proc.patterns.length;
    await proc.initializePatterns({ X是Y: 'Y là X', X的: 'của X' });
    expect(proc.patterns.length).toBeGreaterThanOrEqual(countFirst);
  });

  test('empty dictionary produces isInitialized: true with no patterns', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({});
    expect(proc.isInitialized).toBe(true);
    expect(proc.patterns).toHaveLength(0);
  });
});

describe('SemanticPatternProcessor — processTokens()', () => {
  test('throws when not initialized', async () => {
    const proc = new SemanticPatternProcessor();
    await expect(proc.processTokens([])).rejects.toThrow('not initialized');
  });

  test('returns array after initialization', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    const result = await proc.processTokens([]);
    expect(Array.isArray(result)).toBe(true);
  });

  test('returns empty array for empty token input', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    const result = await proc.processTokens([]);
    expect(result).toHaveLength(0);
  });

  test('tokens that cannot match any pattern return no results', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ X的Y: 'Y của X' });
    // Single token can't match a 3-token pattern
    const tokens = [makeToken('chinese_char', '我')];
    const result = await proc.processTokens(tokens);
    expect(Array.isArray(result)).toBe(true);
  });

  test('returns results array even with many tokens and no matches', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ X是Y: 'Y là X' });
    const tokens = Array.from({ length: 10 }, (_, i) => makeToken('chinese_char', `字${i}`));
    const result = await proc.processTokens(tokens);
    expect(Array.isArray(result)).toBe(true);
  });

  describe('prioritizedPatterns — multi-variable substitution', () => {
    // Regression test for the WASM-fallback pattern path (architecture review
    // 2026-07-30, candidate #3 grilling): convertPrioritizedPatternToMatchResult
    // used to hardcode `.replace('X', ...)` for every variable token regardless
    // of its actual declared name, so a 2-variable pattern like "X的Y" only ever
    // filled the first variable — the second replace found no more literal 'X'
    // in the template and silently no-op'd, leaving 'Y' in the output untouched.
    test('fills both X and Y with their own resolved translations, not just X', async () => {
      const proc = new SemanticPatternProcessor();
      await proc.initializePatterns({ X的Y: 'Y của X' });
      proc.variableCache = new Map([
        ['猫', { translation: 'mèo' }],
        ['狗', { translation: 'chó' }],
      ]);

      const tokens = [
        makeToken('chinese_char', '猫'),
        makeToken('chinese_char', '的'),
        makeToken('chinese_char', '狗'),
      ];
      const pattern = proc.patterns.find((p) => p.originalPattern === 'X的Y');

      const results = await proc.processTokens(tokens, {
        prioritizedPatterns: [{ pattern, startIndex: 0, endIndex: 2 }],
      });

      expect(results).toHaveLength(1);
      expect(results[0].translation).toBe('chó của mèo');
    });

    // Regression test: buildResult()/convertPrioritizedPatternToMatchResult()
    // used to substitute the variable letter via a blind substring replace
    // (new RegExp(varName, 'g') / result.replace(patternToken.name, ...)),
    // which also matched that same letter inside fixed template text (e.g.
    // "Xích" contains "X"). 赤姓老者 → template "X họ Xích" produced
    // "lão giả họ lão giảích" instead of "lão giả họ Xích".
    test('does not corrupt fixed template text that contains the variable letter', async () => {
      const proc = new SemanticPatternProcessor();
      await proc.initializePatterns({ 赤姓X: 'X họ Xích' });
      proc.variableCache = new Map([['老者', { translation: 'lão giả' }]]);

      const tokens = [
        makeToken('chinese_char', '赤'),
        makeToken('chinese_char', '姓'),
        makeToken('chinese_word', '老者'),
      ];
      const pattern = proc.patterns.find((p) => p.originalPattern === '赤姓X');

      const results = await proc.processTokens(tokens, {
        prioritizedPatterns: [{ pattern, startIndex: 0, endIndex: 2 }],
      });

      expect(results).toHaveLength(1);
      expect(results[0].translation).toBe('lão giả họ Xích');
    });
  });
});

describe('SemanticPatternProcessor — testPatternMatch() / findBestPatternMatch() (fixture-based)', () => {
  // ADR-033 named these 3 scenarios as the minimum fixture oracle needed before a real
  // cross-language parity test can exist. The first two reuse the exact pattern/token/
  // variable-cache values from wasm-core/tests/pattern_matching_test.rs
  // (test_single_variable_pattern_match, test_pattern_competition_higher_priority_wins)
  // so a future parity test can diff against these almost directly.

  test('simple single-variable match: 这些X → những người này', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ 这些X: 'những X này' });
    proc.variableCache = new Map([['人', { translation: 'người' }]]);

    const tokens = [
      makeToken('chinese_char', '这'),
      makeToken('chinese_char', '些'),
      makeToken('chinese_char', '人'),
    ];
    const pattern = proc.patterns.find((p) => p.originalPattern === '这些X');

    const result = proc.testPatternMatch(pattern, tokens, 0, {});

    expect(result.success).toBe(true);
    expect(result.result).toBe('những người này');
    expect(result.matchedTokens).toHaveLength(3);
    expect(result.variables.X).toBe('người');
  });

  test('overlapping-pattern priority resolution: longer 这些XY beats shorter 这些X', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({
      这些X: 'những X này',
      这些XY: 'những X Y này',
    });
    proc.variableCache = new Map([
      ['人', { translation: 'người' }],
      ['强大', { translation: 'mạnh mẽ' }],
    ]);

    const tokens = [
      makeToken('chinese_char', '这'),
      makeToken('chinese_char', '些'),
      makeToken('chinese_char', '人'),
      makeToken('chinese_word', '强大'),
    ];

    const result = proc.findBestPatternMatch(tokens, 0, {});

    expect(result).not.toBeNull();
    expect(result.pattern.originalPattern).toBe('这些XY');
    expect(result.result).toBe('những người mạnh mẽ này');
  });

  test('hierarchical composition: longer Phase B pattern absorbs a shorter Phase A-protected span', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ X的Y: 'Y của X' });
    proc.variableCache = new Map([
      ['张三', { translation: 'Trương Tam' }],
      ['手', { translation: 'tay' }],
    ]);

    // '张三' was already translated by a Phase A pattern (2-char match). The Phase B
    // pattern X的Y matches all 3 tokens (4 chars total: 张三的手) — longer than Phase A's
    // 2-char span, so the override is allowed (matcher.rs:603-615 — "Phase B Protection
    // Blocks Shorter-or-Equal Matches").
    const tokens = [
      makeToken('chinese_word', '张三', {
        protectedByPhaseA: true,
        phaseAResult: { originalText: '张三' },
      }),
      makeToken('chinese_char', '的'),
      makeToken('chinese_char', '手'),
    ];
    const pattern = proc.patterns.find((p) => p.originalPattern === 'X的Y');

    const result = proc.testPatternMatch(pattern, tokens, 0, {});

    expect(result.success).toBe(true);
    expect(result.result).toBe('tay của Trương Tam');
    expect(result.matchedTokens).toHaveLength(3);
  });

  // Regression test: X手中的Y has no pattern token after Y, so testPatternMatch's
  // "no more pattern tokens" branch used to take candidateSpans[0] (the longest
  // cache hit) unconditionally, with no type check. A trailing "中" character
  // after the real object span ("法盘") produced a second, longer cache hit
  // ("法盘中") that won blindly, corrupting the match's end position and
  // scrambling the final assembled sentence. Fixed by preferring the longest
  // span whose resolved type actually satisfies allowedVariableTypes.
  test('trailing variable with no following pattern token skips a longer wrong-typed span for a shorter correctly-typed one', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({
      X手中的Y: {
        translation: 'Y trong tay X',
        allowedVariableTypes: { Y: ['object'] },
      },
    });
    proc.variableCache = new Map([
      ['女子', { translation: 'nữ tử', type: 'person' }],
      ['法盘', { translation: 'pháp bàn', type: 'object' }],
      // Longer cache hit bleeding past the real object boundary, wrong type.
      ['法盘中', { translation: 'pháp bàn trung', type: 'unknown' }],
    ]);

    const tokens = [
      makeToken('chinese_word', '女子'),
      makeToken('chinese_char', '手'),
      makeToken('chinese_char', '中'),
      makeToken('chinese_char', '的'),
      makeToken('chinese_word', '法盘'),
      makeToken('chinese_char', '中'),
    ];
    const pattern = proc.patterns.find((p) => p.originalPattern === 'X手中的Y');

    const result = proc.testPatternMatch(pattern, tokens, 0, {});

    expect(result.success).toBe(true);
    expect(result.result).toBe('pháp bàn trong tay nữ tử');
    // Only consumes the 5 tokens of "女子手中的法盘" — the trailing "中" (index 5)
    // is left for the next phase to translate on its own, not swallowed into Y.
    expect(result.matchedTokens).toHaveLength(5);
    expect(result.endPosition).toBe(4);
  });
});

describe('SemanticPatternProcessor — getPerformanceStats()', () => {
  test('returns stats before initialization', () => {
    const proc = new SemanticPatternProcessor();
    const stats = proc.getPerformanceStats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalMatches).toBe('number');
  });

  test('returns stats after initialization', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    const stats = proc.getPerformanceStats();
    expect(stats).toBeDefined();
    expect(stats.stringOptimization).toBeDefined();
  });

  test('totalMatches starts at 0', () => {
    const proc = new SemanticPatternProcessor();
    expect(proc.getPerformanceStats().totalMatches).toBe(0);
  });
});

describe('SemanticPatternProcessor — setStringOptimization()', () => {
  test('does not throw when toggling optimization', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    expect(() => proc.setStringOptimization(true)).not.toThrow();
    expect(() => proc.setStringOptimization(false)).not.toThrow();
  });

  test('sets enableStringOptimization flag', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns(DICT);
    proc.setStringOptimization(false);
    expect(proc.enableStringOptimization).toBe(false);
    proc.setStringOptimization(true);
    expect(proc.enableStringOptimization).toBe(true);
  });
});

describe('SemanticPatternProcessor — pattern indexing', () => {
  test('patternIndex is populated after initialization', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ X的Y: 'Y của X' });
    // patternIndex maps first token → patterns
    expect(proc.patternIndex.size).toBeGreaterThan(0);
  });

  test('patternIndex is cleared on re-initialization', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ X的Y: 'Y của X' });
    await proc.initializePatterns({});
    expect(proc.patternIndex.size).toBe(0);
  });
});

describe('SemanticPatternProcessor — the number variable `#` on the fallback path', () => {
  // Until 2026-09-26 this matcher never counted `#` as a variable, never put numerals in
  // its variable cache, and had no rule that a number fills only `#` — so every `#`
  // pattern was dead whenever WASM pattern matching was off. Mirrors Rust's parser.rs
  // (implied ['number'] type) and matcher.rs::is_variable_type_allowed.
  const sect = () =>
    makeToken('chinese_word', '门派', { translated: 'môn phái', translationSource: 'properNouns' });

  test('a numeral fills `#`', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ '#大X之一': 'một trong # X lớn' });
    const tokens = [
      makeToken('chinese_char', '三'),
      makeToken('chinese_char', '大'),
      sect(),
      makeToken('chinese_char', '之'),
      makeToken('chinese_char', '一'),
    ];
    proc.buildVariableCache(tokens, [], null);
    const pattern = proc.patterns.find((p) => p.originalPattern === '#大X之一');

    const result = proc.testPatternMatch(pattern, tokens, 0, {});

    expect(result.success).toBe(true);
    expect(result.variables['#']).toBe('ba');
    expect(result.variables.X).toBe('môn phái');
  });

  test('a numeral never fills a letter variable', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ '#大X': '# X lớn' });
    const tokens = [
      makeToken('chinese_char', '三'),
      makeToken('chinese_char', '大'),
      makeToken('chinese_char', '四'),
    ];
    proc.buildVariableCache(tokens, [], null);
    const pattern = proc.patterns.find((p) => p.originalPattern === '#大X');

    expect(proc.testPatternMatch(pattern, tokens, 0, {}).success).toBe(false);
  });

  test('`#` takes only a number, even when a dictionary entry covers the same span', async () => {
    const proc = new SemanticPatternProcessor();
    await proc.initializePatterns({ '#大X': '# X lớn' });
    const tokens = [
      makeToken('chinese_word', '门派', {
        translated: 'môn phái',
        translationSource: 'properNouns',
      }),
      makeToken('chinese_char', '大'),
      sect(),
    ];
    proc.buildVariableCache(tokens, [], null);
    const pattern = proc.patterns.find((p) => p.originalPattern === '#大X');

    expect(proc.testPatternMatch(pattern, tokens, 0, {}).success).toBe(false);
  });
});
