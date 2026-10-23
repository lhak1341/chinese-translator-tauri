/**
 * Tests for TwoPhasePatternProcessor's internal profiling subsystem
 * (enableInternalProfiling / disableInternalProfiling / resetInternalProfiling /
 * getInternalProfilingReport / printInternalProfilingReport).
 *
 * Kept per ADR-021 addendum (2026-07-18) as a legitimate dev-console diagnostic —
 * this file closes the zero-test-coverage gap found during that review, it does
 * not argue for keeping or deleting the feature itself.
 *
 * APPROACH: construct with an empty patterns array and mock the WASM boundary, so the
 * processTokens()-driven timers (extractSemanticTokens, buildVariableCache, processTokensWasm) run.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../wasm/WasmPatternProcessor.js', () => ({
  processTokensWasm: vi.fn(),
  isWasmPatternProcessorReady: vi.fn().mockReturnValue(false),
}));
vi.mock('../logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), table: vi.fn() },
}));

import { isWasmPatternProcessorReady, processTokensWasm } from '../wasm/WasmPatternProcessor.js';
import { logger } from '../logger.js';

async function makeProcessor() {
  const mod = await import('../pattern/TwoPhasePatternProcessor.js');
  const TwoPhasePatternProcessor = mod.default;
  return new TwoPhasePatternProcessor([]);
}

function makeNoopDictionaryManager() {
  return {
    translate: () => null,
    findAllMatches: () => [],
  };
}

beforeEach(() => {
  vi.mocked(isWasmPatternProcessorReady).mockReturnValue(false);
  vi.mocked(processTokensWasm).mockReset();
  vi.mocked(logger.log).mockClear();
});

describe('TwoPhasePatternProcessor internal profiling', () => {
  test('disabled by default', async () => {
    const processor = await makeProcessor();
    expect(processor.internalProfiling.enabled).toBe(false);
  });

  test('getInternalProfilingReport reports disabled state before enabling', async () => {
    const processor = await makeProcessor();
    const report = processor.getInternalProfilingReport();
    expect(report).toEqual({
      enabled: false,
      message: 'Internal profiling not enabled. Call enableInternalProfiling() first.',
    });
  });

  test('enableInternalProfiling turns profiling on', async () => {
    const processor = await makeProcessor();
    processor.enableInternalProfiling();
    expect(processor.internalProfiling.enabled).toBe(true);
  });

  test('disableInternalProfiling turns profiling back off', async () => {
    const processor = await makeProcessor();
    processor.enableInternalProfiling();
    processor.disableInternalProfiling();
    expect(processor.internalProfiling.enabled).toBe(false);
  });

  test('the variable cache timer increments only when profiling is enabled', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: true, results: [] });
    const processor = await makeProcessor();
    const tokens = [{ value: '你', type: 'chinese_char' }];
    const options = { dictionaryManager: makeNoopDictionaryManager() };

    await processor.processTokens(tokens, options);
    expect(processor.internalProfiling.buildVariableCache.calls).toBe(0);

    processor.enableInternalProfiling();
    await processor.processTokens(tokens, options);
    expect(processor.internalProfiling.buildVariableCache.calls).toBe(1);
    expect(processor.internalProfiling.buildVariableCache.time).toBeGreaterThanOrEqual(0);
  });

  test('resetInternalProfiling zeroes time/calls but preserves the enabled flag', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: true, results: [] });
    const processor = await makeProcessor();
    const tokens = [{ value: '你', type: 'chinese_char' }];
    const options = { dictionaryManager: makeNoopDictionaryManager() };

    processor.enableInternalProfiling();
    await processor.processTokens(tokens, options);
    expect(processor.internalProfiling.buildVariableCache.calls).toBe(1);

    processor.resetInternalProfiling();

    expect(processor.internalProfiling.enabled).toBe(true);
    expect(processor.internalProfiling.buildVariableCache.calls).toBe(0);
    expect(processor.internalProfiling.buildVariableCache.time).toBe(0);
    expect(processor.internalProfiling.extractSemanticTokens.calls).toBe(0);
    expect(processor.internalProfiling.processTokensWasm.calls).toBe(0);
  });

  test('resetInternalProfiling leaves disabled state as disabled', async () => {
    const processor = await makeProcessor();
    processor.resetInternalProfiling();
    expect(processor.internalProfiling.enabled).toBe(false);
  });

  test('processTokens increments extractSemanticTokens and processTokensWasm timers when enabled', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: true, results: [] });

    const processor = await makeProcessor();
    processor.enableInternalProfiling();

    const tokens = [{ value: '你', type: 'chinese_char' }];
    await processor.processTokens(tokens, { dictionaryManager: makeNoopDictionaryManager() });

    expect(processor.internalProfiling.extractSemanticTokens.calls).toBe(1);
    expect(processor.internalProfiling.processTokensWasm.calls).toBe(1);
    expect(processor.internalProfiling.buildVariableCache.calls).toBe(1);
  });

  test('processTokens does not increment timers when profiling is disabled', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: true, results: [] });

    const processor = await makeProcessor();
    const tokens = [{ value: '你', type: 'chinese_char' }];
    await processor.processTokens(tokens, { dictionaryManager: makeNoopDictionaryManager() });

    expect(processor.internalProfiling.extractSemanticTokens.calls).toBe(0);
    expect(processor.internalProfiling.processTokensWasm.calls).toBe(0);
  });

  test('getInternalProfilingReport returns a populated breakdown once enabled and run', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: true, results: [] });

    const processor = await makeProcessor();
    processor.enableInternalProfiling();
    const tokens = [{ value: '你', type: 'chinese_char' }];
    await processor.processTokens(tokens, { dictionaryManager: makeNoopDictionaryManager() });

    const report = processor.getInternalProfilingReport();

    expect(report.enabled).toBe(true);
    expect(report.totalCalls).toBe(1);
    expect(report.breakdown).toHaveLength(3);
    const phases = report.breakdown.map((entry) => entry.phase);
    expect(phases).toEqual([
      'Extract Semantic Tokens',
      'Build Variable Cache (TOTAL)',
      'Process Tokens (WASM)',
    ]);
    report.breakdown.forEach((entry) => {
      expect(entry.calls).toBe(1);
      expect(entry.percentage.endsWith('%')).toBe(true);
    });
  });

  test('printInternalProfilingReport logs the disabled message without throwing', async () => {
    const processor = await makeProcessor();
    expect(() => processor.printInternalProfilingReport()).not.toThrow();
    expect(logger.log).toHaveBeenCalledWith(
      'Internal profiling not enabled. Call enableInternalProfiling() first.'
    );
  });

  test('printInternalProfilingReport logs a breakdown without throwing once enabled and run', async () => {
    vi.mocked(isWasmPatternProcessorReady).mockReturnValue(true);
    vi.mocked(processTokensWasm).mockResolvedValue({ success: true, results: [] });

    const processor = await makeProcessor();
    processor.enableInternalProfiling();
    const tokens = [{ value: '你', type: 'chinese_char' }];
    await processor.processTokens(tokens, { dictionaryManager: makeNoopDictionaryManager() });

    expect(() => processor.printInternalProfilingReport()).not.toThrow();
    expect(logger.log).toHaveBeenCalled();
  });
});
