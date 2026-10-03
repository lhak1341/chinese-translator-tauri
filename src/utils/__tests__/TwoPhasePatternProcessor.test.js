// TwoPhasePatternProcessor is WASM-only — processTokens() throws when WASM is unavailable.
// Tests cover: construction, pattern categorization, semantic token extraction,
// setup validation, and the WASM gate contract.

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
const COMPOSITE_PATTERN = {
  originalPattern: 'X是Y',
  template: 'Y là X',
  allowAsPatternVariable: false,
};
const LITERAL_PATTERN = {
  originalPattern: '手套',
  template: 'găng tay',
  allowAsPatternVariable: false,
};

describe('TwoPhasePatternProcessor — constructor', () => {
  test('creates instance without throwing', () => {
    expect(() => new TwoPhasePatternProcessor([VARIABLE_PATTERN])).not.toThrow();
  });

  test('processes patterns through PatternAnalyzer on construction', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN, COMPOSITE_PATTERN]);
    // analyzePatterns adds compositeEligible, hasVariables, etc.
    expect(proc.processedPatterns).toHaveLength(2);
    expect(proc.processedPatterns[0]).toHaveProperty('hasVariables');
    expect(proc.processedPatterns[0]).toHaveProperty('compositeEligible');
  });

  test('accepts empty pattern array', () => {
    const proc = new TwoPhasePatternProcessor([]);
    expect(proc.processedPatterns).toHaveLength(0);
  });

  test('respects enableWasm option', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN], { enableWasm: false });
    expect(proc.options.enableWasm).toBe(false);
  });
});

describe('TwoPhasePatternProcessor — categorizePatterns()', () => {
  test('variablePatterns contains only allowAsPatternVariable: true patterns', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN, COMPOSITE_PATTERN]);
    expect(proc.variablePatterns).toHaveLength(1);
    expect(proc.variablePatterns[0].originalPattern).toBe('X的');
  });

  test('compositeEligiblePatterns contains X-only patterns', () => {
    // X的 has X but no Y → compositeEligible: true
    // X是Y has X and Y → compositeEligible: false
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN, COMPOSITE_PATTERN]);
    expect(proc.compositeEligiblePatterns.every((p) => p.compositeEligible)).toBe(true);
  });

  test('allPatterns contains every processed pattern', () => {
    const patterns = [VARIABLE_PATTERN, COMPOSITE_PATTERN, LITERAL_PATTERN];
    const proc = new TwoPhasePatternProcessor(patterns);
    expect(proc.allPatterns).toHaveLength(3);
  });

  test('empty input produces empty category arrays', () => {
    const proc = new TwoPhasePatternProcessor([]);
    expect(proc.variablePatterns).toHaveLength(0);
    expect(proc.compositeEligiblePatterns).toHaveLength(0);
    expect(proc.allPatterns).toHaveLength(0);
  });
});

describe('TwoPhasePatternProcessor — processTokens() WASM gate', () => {
  test('throws when WASM not ready and enableWasm: true (default)', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(false);
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    await expect(proc.processTokens([], {})).rejects.toThrow(
      'WASM Pattern Processor not available'
    );
  });

  test('throws when enableWasm: false (WASM explicitly disabled)', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN], { enableWasm: false });
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

describe('TwoPhasePatternProcessor — validateSetup()', () => {
  test('valid setup with variable and composite patterns', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN, COMPOSITE_PATTERN]);
    const { valid, issues } = proc.validateSetup();
    // VARIABLE_PATTERN has allowAsPatternVariable: true → variablePatterns non-empty
    // VARIABLE_PATTERN has X-only → compositeEligiblePatterns non-empty
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  test('no patterns → reports issue', () => {
    const proc = new TwoPhasePatternProcessor([]);
    const { valid, issues } = proc.validateSetup();
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes('No patterns'))).toBe(true);
  });

  test('no variable patterns → reports issue', () => {
    // LITERAL_PATTERN has no variables → allowAsPatternVariable: false → variablePatterns empty
    const proc = new TwoPhasePatternProcessor([LITERAL_PATTERN]);
    const { valid, issues } = proc.validateSetup();
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes('variable patterns'))).toBe(true);
  });

  test('returns { valid, issues, warnings } shape', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN, COMPOSITE_PATTERN]);
    const result = proc.validateSetup();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('warnings');
  });
});

describe('TwoPhasePatternProcessor — getStatistics()', () => {
  test('returns patterns counts and options', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN, COMPOSITE_PATTERN]);
    const stats = proc.getStatistics();
    expect(stats.patterns.total).toBe(2);
    expect(typeof stats.patterns.variablePatterns).toBe('number');
    expect(typeof stats.patterns.compositeEligible).toBe('number');
    expect(stats.options).toBeDefined();
  });

  test('includes analysis summary', () => {
    const proc = new TwoPhasePatternProcessor([VARIABLE_PATTERN]);
    const stats = proc.getStatistics();
    expect(stats.analysis).toBeDefined();
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
