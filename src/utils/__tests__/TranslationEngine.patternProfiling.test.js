/**
 * Tests for TranslationEngine's pattern-profiling delegators
 * (enablePatternProfiling / disablePatternProfiling / resetPatternProfiling /
 * getPatternProfilingReport / printPatternProfilingReport).
 *
 * Kept per ADR-021 addendum (2026-07-18) as a legitimate dev-console diagnostic —
 * this file closes the zero-test-coverage gap found during that review. Each
 * delegator is a thin pass-through to `this.patternStore.processor`, guarded by a
 * null check (the store builds the processor in initializePatterns only when
 * patterns are loaded and WASM is available).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { TranslationEngine } from '../TranslationEngine.js';
import { logger } from '../logger.js';

function makeEngine() {
  return new TranslationEngine({
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

describe('TranslationEngine pattern-profiling delegators — no processor built', () => {
  test('enablePatternProfiling warns instead of throwing', () => {
    const engine = makeEngine();
    expect(engine.patternStore.processor).toBeNull();
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
      message: 'No pattern processor: no patterns loaded or WASM unavailable.',
    });
  });

  test('printPatternProfilingReport logs instead of throwing', () => {
    const engine = makeEngine();
    expect(() => engine.printPatternProfilingReport()).not.toThrow();
    expect(logger.log).toHaveBeenCalledWith(
      'No pattern processor: no patterns loaded or WASM unavailable.'
    );
  });
});

describe('TranslationEngine pattern-profiling delegators — processor present', () => {
  test('enablePatternProfiling calls through exactly once', () => {
    const engine = makeEngine();
    engine.patternStore.processor = makeProcessorStub();
    engine.enablePatternProfiling();
    expect(engine.patternStore.processor.enableInternalProfiling).toHaveBeenCalledTimes(1);
  });

  test('disablePatternProfiling calls through exactly once', () => {
    const engine = makeEngine();
    engine.patternStore.processor = makeProcessorStub();
    engine.disablePatternProfiling();
    expect(engine.patternStore.processor.disableInternalProfiling).toHaveBeenCalledTimes(1);
  });

  test('resetPatternProfiling calls through exactly once', () => {
    const engine = makeEngine();
    engine.patternStore.processor = makeProcessorStub();
    engine.resetPatternProfiling();
    expect(engine.patternStore.processor.resetInternalProfiling).toHaveBeenCalledTimes(1);
  });

  test('getPatternProfilingReport returns the processor report', () => {
    const engine = makeEngine();
    engine.patternStore.processor = makeProcessorStub();
    const report = engine.getPatternProfilingReport();
    expect(report).toEqual({ enabled: true, totalCalls: 3 });
    expect(engine.patternStore.processor.getInternalProfilingReport).toHaveBeenCalledTimes(1);
  });

  test('printPatternProfilingReport calls through exactly once', () => {
    const engine = makeEngine();
    engine.patternStore.processor = makeProcessorStub();
    engine.printPatternProfilingReport();
    expect(engine.patternStore.processor.printInternalProfilingReport).toHaveBeenCalledTimes(1);
  });
});
