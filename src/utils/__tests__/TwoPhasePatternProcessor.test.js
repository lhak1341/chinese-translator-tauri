// TwoPhasePatternProcessor is WASM-only — processTokens() throws when WASM is unavailable.
// Tests cover: construction, the WASM gate contract, the bounds filter on results, and the
// internal-profiling switch.

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../wasm/WasmPatternProcessor.js', () => ({
  processTokensWasm: vi.fn(),
  isWasmPatternProcessorReady: vi.fn().mockReturnValue(false),
}));
vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import TwoPhasePatternProcessor from '../pattern/TwoPhasePatternProcessor.js';
import { isWasmPatternProcessorReady, processTokensWasm } from '../wasm/WasmPatternProcessor.js';

beforeEach(() => {
  vi.mocked(isWasmPatternProcessorReady).mockReturnValue(false);
  vi.mocked(processTokensWasm).mockReset();
});

// Minimal valid patterns for tests
const VARIABLE_PATTERN = {
  originalPattern: 'X的',
  template: 'của X',
  allowAsPatternVariable: true,
};

describe('TwoPhasePatternProcessor — constructor', () => {
  test('creates instance without throwing', () => {
    expect(() => new TwoPhasePatternProcessor([VARIABLE_PATTERN])).not.toThrow();
  });

  test('accepts empty pattern array', () => {
    expect(() => new TwoPhasePatternProcessor([])).not.toThrow();
  });
});

describe('TwoPhasePatternProcessor — processTokens() WASM gate', () => {
  test('throws when WASM is not ready', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(false);
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    await expect(proc.processTokens([], {})).rejects.toThrow(
      'WASM Pattern Processor not available'
    );
  });

  test('delegates to processTokensWasm when WASM is ready', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: true, results: [] });

    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    const result = await proc.processTokens([], {});
    expect(processTokensWasm).toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('TwoPhasePatternProcessor — processTokens() bounds filter', () => {
  const tokens = [
    { value: '你', type: 'chinese_char', translated: null },
    { value: '好', type: 'chinese_char', translated: null },
  ];
  const options = {
    activeProperNouns: [],
    dictionaryManager: { translate: () => null, findAllMatches: () => [] },
  };
  const inBounds = { startIndex: 0, endIndex: 1, translation: 'xin chào' };
  const pastEnd = { startIndex: 5, endIndex: 6, translation: 'ngoài' };
  const reversed = { startIndex: 1, endIndex: 0, translation: 'ngược' };

  test('drops results whose indices fall outside the token array, keeps the rest', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({
      success: true,
      results: [pastEnd, inBounds, reversed],
    });

    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    const result = await proc.processTokens(tokens, options);

    expect(result).toEqual([inBounds]);
  });

  test('throws when WASM reports failure', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: false, error: 'boom' });

    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    await expect(proc.processTokens(tokens, options)).rejects.toThrow('boom');
  });
});

describe('TwoPhasePatternProcessor — internal profiling', () => {
  test('profiling disabled by default', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    const report = proc.getInternalProfilingReport();
    expect(report.enabled).toBe(false);
  });

  test('enableInternalProfiling sets enabled: true', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    proc.enableInternalProfiling();
    expect(proc.getInternalProfilingReport().enabled).toBe(true);
  });

  test('disableInternalProfiling sets enabled: false', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    proc.enableInternalProfiling();
    proc.disableInternalProfiling();
    expect(proc.getInternalProfilingReport().enabled).toBe(false);
  });

  test('resetInternalProfiling does not throw', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    proc.enableInternalProfiling();
    expect(() => proc.resetInternalProfiling()).not.toThrow();
  });
});
