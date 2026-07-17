/**
 * Tests for useEngineReinitializer — extracted from Translator.jsx's forceReloadCtx
 * (2026-07-17c) so this logic (previously zero test coverage, mocked wholesale by
 * useForceReload.test.js) gets exercised directly.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEngineReinitializer } from '../useEngineReinitializer.js';

const mockToastError = vi.fn();
vi.mock('../../utils/toast', () => ({
  default: { error: (...args) => mockToastError(...args) },
}));
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../constants/toastConfig', () => ({
  TOAST_DURATIONS: { CACHE_WARNING: 1234 },
}));

function makeEngineRef(overrides = {}) {
  return {
    current: {
      isReady: () => true,
      dictionaryManager: {
        wasmInitialized: true,
        validateWasmFallback: vi.fn().mockReturnValue({ status: 'PASSED' }),
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe('useEngineReinitializer', () => {
  test('calls reinitialize with the given dicts and opts', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({ phrases: {} }, { forceConfigReload: true, debugLevel: 'error' });
    });

    expect(reinitialize).toHaveBeenCalledWith(
      { phrases: {} },
      { forceConfigReload: true, debugLevel: 'error' }
    );
  });

  test('returns false when engine is not ready after reinitialize', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef({ isReady: () => false });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    let outcome;
    await act(async () => {
      outcome = await result.current({}, {});
    });

    expect(outcome).toBe(false);
  });

  test('returns true immediately without waiting for the fire-and-forget WASM validation', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    let outcome;
    await act(async () => {
      outcome = await result.current({}, {});
    });

    expect(outcome).toBe(true);
    // Validation runs on a 100ms setTimeout — hasn't fired yet.
    expect(engineRef.current.dictionaryManager.validateWasmFallback).not.toHaveBeenCalled();
  });

  test('skips WASM validation when dictionaryManager.wasmInitialized is falsy', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef({
      dictionaryManager: { wasmInitialized: false, validateWasmFallback: vi.fn() },
    });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({}, {});
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(engineRef.current.dictionaryManager.validateWasmFallback).not.toHaveBeenCalled();
  });

  test('skips WASM validation when validateWasmFallback is not a function', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef({
      dictionaryManager: { wasmInitialized: true, validateWasmFallback: undefined },
    });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({}, {});
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockToastError).not.toHaveBeenCalled();
  });

  test('FAILED status with differences toasts a mismatch-count error with CACHE_WARNING duration', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    engineRef.current.dictionaryManager.validateWasmFallback.mockReturnValue({
      status: 'FAILED',
      results: { failed: 3, wasmErrors: 0, jsErrors: 0 },
    });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({}, {});
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('3 mismatches'),
      expect.objectContaining({ duration: 1234 })
    );
  });

  test('FAILED status with wasmErrors toasts a generic error with CACHE_WARNING duration', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    engineRef.current.dictionaryManager.validateWasmFallback.mockReturnValue({
      status: 'FAILED',
      results: { failed: 0, wasmErrors: 2, jsErrors: 0 },
    });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({}, {});
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('WASM sync errors'),
      expect.objectContaining({ duration: 1234 })
    );
  });

  test('PASSED and SKIPPED statuses do not toast', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    engineRef.current.dictionaryManager.validateWasmFallback.mockReturnValue({
      status: 'SKIPPED',
      reason: 'no dictionaries synced',
    });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({}, {});
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockToastError).not.toHaveBeenCalled();
  });

  test('null syncStatus (engine gone by validation time) does not throw or toast', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    engineRef.current.dictionaryManager.validateWasmFallback.mockReturnValue(null);
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await act(async () => {
      await result.current({}, {});
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(mockToastError).not.toHaveBeenCalled();
  });

  test('validateWasmFallback throwing is caught and does not propagate', async () => {
    const reinitialize = vi.fn().mockResolvedValue(undefined);
    const engineRef = makeEngineRef();
    engineRef.current.dictionaryManager.validateWasmFallback.mockImplementation(() => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useEngineReinitializer(reinitialize, engineRef));

    await expect(
      act(async () => {
        await result.current({}, {});
        await vi.advanceTimersByTimeAsync(150);
      })
    ).resolves.not.toThrow();
  });
});
