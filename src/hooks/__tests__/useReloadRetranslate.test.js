/**
 * Tests for useReloadRetranslate — extracted from Translator.jsx's forceReloadCtx
 * (2026-07-17c) so this logic (previously zero test coverage, mocked wholesale by
 * useForceReload.test.js) gets exercised directly.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReloadRetranslate } from '../useReloadRetranslate.js';

const mockToastSuccess = vi.fn();
vi.mock('../../utils/toast', () => ({
  default: { success: (...args) => mockToastSuccess(...args) },
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeDeps(overrides = {}) {
  return {
    engineRef: { current: { isReady: () => true } },
    validateSemanticArraySize: vi.fn(),
    setDualResults: vi.fn(),
    refreshReport: vi.fn(),
    translateText: vi.fn().mockResolvedValue('sequential result'),
    translateCharacterOnly: vi.fn().mockResolvedValue(undefined),
    setStreamingText: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe('useReloadRetranslate', () => {
  test('dual-mode path: validates both semantic arrays, sets dual results, refreshes report', async () => {
    const dualResults = {
      fullResult: { semanticArrays: 'full-arrays' },
      characterResult: { semanticArrays: 'char-arrays' },
    };
    const deps = makeDeps({
      engineRef: {
        current: {
          isReady: () => true,
          translateDualModeOptimized: vi.fn().mockResolvedValue(dualResults),
        },
      },
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    await act(async () => {
      const p = result.current('hello');
      await vi.advanceTimersByTimeAsync(150);
      await p;
    });

    expect(deps.validateSemanticArraySize).toHaveBeenCalledWith('full-arrays', 'full translation');
    expect(deps.validateSemanticArraySize).toHaveBeenCalledWith(
      'char-arrays',
      'character-only translation'
    );
    expect(deps.setDualResults).toHaveBeenCalledWith(
      dualResults.fullResult,
      dualResults.characterResult
    );
    expect(deps.refreshReport).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Dictionary reloaded and text retranslated');
  });

  test('resolves silently when semantic array validation throws (already toasted upstream)', async () => {
    const dualResults = {
      fullResult: { semanticArrays: 'full-arrays' },
      characterResult: { semanticArrays: 'char-arrays' },
    };
    const deps = makeDeps({
      engineRef: {
        current: {
          isReady: () => true,
          translateDualModeOptimized: vi.fn().mockResolvedValue(dualResults),
        },
      },
      validateSemanticArraySize: vi.fn().mockImplementation(() => {
        throw new Error('array too large');
      }),
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    await act(async () => {
      const p = result.current('hello');
      await vi.advanceTimersByTimeAsync(150);
      await p;
    });

    expect(deps.setDualResults).not.toHaveBeenCalled();
    expect(deps.refreshReport).not.toHaveBeenCalled();
    // Still resolves without throwing, and does NOT show the success toast for
    // a validation failure that's already been handled upstream.
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  test('falls back to sequential translate when translateDualModeOptimized throws', async () => {
    const deps = makeDeps({
      engineRef: {
        current: {
          isReady: () => true,
          translateDualModeOptimized: vi.fn().mockRejectedValue(new Error('optimized failed')),
        },
      },
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    await act(async () => {
      const p = result.current('hello');
      await vi.advanceTimersByTimeAsync(150);
      await p;
    });

    expect(deps.translateText).toHaveBeenCalledWith('hello');
    expect(deps.setStreamingText).toHaveBeenCalledWith('sequential result');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(deps.translateCharacterOnly).toHaveBeenCalledWith('hello');
    expect(mockToastSuccess).toHaveBeenCalledWith('Dictionary reloaded and text retranslated');
  });

  test('falls back to sequential translate when translateDualModeOptimized is unavailable', async () => {
    const deps = makeDeps({
      engineRef: { current: { isReady: () => true } }, // no translateDualModeOptimized
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    await act(async () => {
      const p = result.current('hello');
      await vi.advanceTimersByTimeAsync(150);
      await p;
    });

    expect(deps.translateText).toHaveBeenCalledWith('hello');
    expect(deps.setStreamingText).toHaveBeenCalledWith('sequential result');
  });

  test('waits an extra 500ms when the engine is not ready after the initial 100ms', async () => {
    let ready = false;
    const deps = makeDeps({
      engineRef: {
        current: {
          isReady: () => ready,
        },
      },
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    const p = act(async () => {
      const inner = result.current('hello');
      await vi.advanceTimersByTimeAsync(100);
      // Right after the first wait, engine still not ready — becomes ready
      // during the extra 500ms wait.
      ready = true;
      await vi.advanceTimersByTimeAsync(500);
      await inner;
    });

    await p;

    expect(deps.translateText).toHaveBeenCalledWith('hello');
  });
});
