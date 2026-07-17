/**
 * Tests for TranslationEngine's pattern-profiling delegators
 * (enablePatternProfiling / disablePatternProfiling / resetPatternProfiling /
 * getPatternProfilingReport / printPatternProfilingReport).
 *
 * Kept per ADR-021 addendum (2026-07-18) as a legitimate dev-console diagnostic —
 * this file closes the zero-test-coverage gap found during that review. Each
 * delegator is a thin pass-through to `this.twoPhaseProcessor`, guarded by a
 * null check (twoPhaseProcessor is only constructed inside translateSinglePass,
 * so it's null before the first translation).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TranslationEngine } from '../TranslationEngine.js';
import { logger } from '../logger.js';

function makeEngine() {
  return new TranslationEngine({
    debugLevel: 0,
    enableMemoryMonitoring: false,
    enablePerformanceMonitoring: false,
  });
}

function makeProcessorStub() {
  return {
    enableInternalProfiling: vi.fn(),
    disableInternalProfiling: vi.fn(),
    resetInternalProfiling: vi.fn(),
    getInternalProfilingReport: vi.fn().mockReturnValue({ enabled: true, totalCalls: 3 }),
    printInternalProfilingReport: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(logger.log).mockClear();
  vi.mocked(logger.warn).mockClear();
});

describe('TranslationEngine pattern-profiling delegators — twoPhaseProcessor not initialized', () => {
  test('enablePatternProfiling warns instead of throwing', () => {
    const engine = makeEngine();
    expect(engine.twoPhaseProcessor).toBeFalsy();
    expect(() => engine.enablePatternProfiling()).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('disablePatternProfiling no-ops without throwing', () => {
    const engine = makeEngine();
    expect(() => engine.disablePatternProfiling()).not.toThrow();
  });

  test('resetPatternProfiling no-ops without throwing', () => {
    const engine = makeEngine();
    expect(() => engine.resetPatternProfiling()).not.toThrow();
  });

  test('getPatternProfilingReport returns a disabled/uninitialized shape', () => {
    const engine = makeEngine();
    const report = engine.getPatternProfilingReport();
    expect(report).toEqual({
      enabled: false,
      message: 'TwoPhasePatternProcessor not initialized. Translate some text first.',
    });
  });

  test('printPatternProfilingReport logs instead of throwing', () => {
    const engine = makeEngine();
    expect(() => engine.printPatternProfilingReport()).not.toThrow();
    expect(logger.log).toHaveBeenCalledWith(
      'TwoPhasePatternProcessor not initialized. Translate some text first.'
    );
  });
});

describe('TranslationEngine pattern-profiling delegators — twoPhaseProcessor present', () => {
  test('enablePatternProfiling calls through exactly once', () => {
    const engine = makeEngine();
    engine.twoPhaseProcessor = makeProcessorStub();
    engine.enablePatternProfiling();
    expect(engine.twoPhaseProcessor.enableInternalProfiling).toHaveBeenCalledTimes(1);
  });

  test('disablePatternProfiling calls through exactly once', () => {
    const engine = makeEngine();
    engine.twoPhaseProcessor = makeProcessorStub();
    engine.disablePatternProfiling();
    expect(engine.twoPhaseProcessor.disableInternalProfiling).toHaveBeenCalledTimes(1);
  });

  test('resetPatternProfiling calls through exactly once', () => {
    const engine = makeEngine();
    engine.twoPhaseProcessor = makeProcessorStub();
    engine.resetPatternProfiling();
    expect(engine.twoPhaseProcessor.resetInternalProfiling).toHaveBeenCalledTimes(1);
  });

  test('getPatternProfilingReport returns the processor report', () => {
    const engine = makeEngine();
    engine.twoPhaseProcessor = makeProcessorStub();
    const report = engine.getPatternProfilingReport();
    expect(report).toEqual({ enabled: true, totalCalls: 3 });
    expect(engine.twoPhaseProcessor.getInternalProfilingReport).toHaveBeenCalledTimes(1);
  });

  test('printPatternProfilingReport calls through exactly once', () => {
    const engine = makeEngine();
    engine.twoPhaseProcessor = makeProcessorStub();
    engine.printPatternProfilingReport();
    expect(engine.twoPhaseProcessor.printInternalProfilingReport).toHaveBeenCalledTimes(1);
  });
});
