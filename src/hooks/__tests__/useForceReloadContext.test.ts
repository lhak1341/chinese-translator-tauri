/**
 * Tests for useForceReloadContext — extracted from Translator.jsx's inline
 * forceReloadCtx object literal (architecture review 2026-07-29, candidate #3).
 * Covers the 2 relocated closures (cancelTranslations, destroyEngine) and the
 * dev-only input-shape guard that replaces the untyped assembly.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForceReloadContext } from '../useForceReloadContext';

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function baseParams(overrides = {}) {
  return {
    engineRef: { current: { destroy: vi.fn() } },
    cancelAllTranslations: vi.fn(() => ({ count: 0, cleanupComplete: Promise.resolve() })),
    isTranslatingRef: { current: false },
    setIsTranslating: vi.fn(),
    setProgressInfo: vi.fn(),
    setStatusMessage: vi.fn(),
    setTranslationError: vi.fn(),
    setDictionaryReloading: vi.fn(),
    clearHighlighting: vi.fn(),
    reinitializeEngine: vi.fn(async () => true),
    retranslate: vi.fn(async () => {}),
    saveScrollPositions: vi.fn(() => ({ top: 0 })),
    restoreScrollPositions: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useForceReloadContext', () => {
  test('assembles all 10 ForceReloadContext fields', () => {
    const { result } = renderHook(() => useForceReloadContext(baseParams()));

    expect(result.current).toEqual(
      expect.objectContaining({
        cancelTranslations: expect.any(Function),
        destroyEngine: expect.any(Function),
        setStatus: expect.any(Function),
        setReloadError: expect.any(Function),
        setReloading: expect.any(Function),
        clearHighlighting: expect.any(Function),
        reinitializeEngine: expect.any(Function),
        retranslate: expect.any(Function),
        saveScrollPositions: expect.any(Function),
        restoreScrollPositions: expect.any(Function),
      })
    );
  });

  test('setStatus/setReloadError/setReloading forward to the given setters', () => {
    const params = baseParams();
    const { result } = renderHook(() => useForceReloadContext(params));

    result.current.setStatus('hi');
    result.current.setReloadError('err');
    result.current.setReloading(true);

    expect(params.setStatusMessage).toHaveBeenCalledWith('hi');
    expect(params.setTranslationError).toHaveBeenCalledWith('err');
    expect(params.setDictionaryReloading).toHaveBeenCalledWith(true);
  });

  describe('cancelTranslations', () => {
    test('when count is 0: does not await cleanupComplete, still resets translating state', async () => {
      const cleanupComplete = vi.fn();
      const params = baseParams({
        cancelAllTranslations: vi.fn(() => ({ count: 0, cleanupComplete })),
        isTranslatingRef: { current: true },
      });
      const { result } = renderHook(() => useForceReloadContext(params));

      await act(async () => {
        await result.current.cancelTranslations();
      });

      expect(params.isTranslatingRef.current).toBe(false);
      expect(params.setIsTranslating).toHaveBeenCalledWith(false);
      expect(params.setProgressInfo).toHaveBeenCalledWith(null);
    });

    test('when count > 0: awaits cleanupComplete before resetting translating state', async () => {
      const order: string[] = [];
      const cleanupComplete = new Promise<void>((resolve) => {
        setTimeout(() => {
          order.push('cleanup-resolved');
          resolve();
        }, 0);
      });
      const params = baseParams({
        cancelAllTranslations: vi.fn(() => ({ count: 2, cleanupComplete })),
        setIsTranslating: vi.fn(() => order.push('setIsTranslating')),
      });
      const { result } = renderHook(() => useForceReloadContext(params));

      await act(async () => {
        await result.current.cancelTranslations();
      });

      expect(order).toEqual(['cleanup-resolved', 'setIsTranslating']);
    });
  });

  describe('destroyEngine', () => {
    test('calls destroy() then nulls engineRef.current', () => {
      const destroy = vi.fn();
      const params = baseParams({ engineRef: { current: { destroy } } });
      const { result } = renderHook(() => useForceReloadContext(params));

      result.current.destroyEngine();

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(params.engineRef.current).toBeNull();
    });

    test('is a no-op when engineRef.current is already null', () => {
      const params = baseParams({ engineRef: { current: null } });
      const { result } = renderHook(() => useForceReloadContext(params));

      expect(() => result.current.destroyEngine()).not.toThrow();
    });

    test('when destroy() throws: catches it (does not rethrow) and leaves engineRef.current untouched', () => {
      const destroy = vi.fn(() => {
        throw new Error('boom');
      });
      const engineInstance = { destroy };
      const params = baseParams({ engineRef: { current: engineInstance } });
      const { result } = renderHook(() => useForceReloadContext(params));

      expect(() => result.current.destroyEngine()).not.toThrow();
      // The null-assignment never runs — it's after destroy() in the try block.
      expect(params.engineRef.current).toBe(engineInstance);
    });
  });

  describe('dev-only input-shape guard', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('throws when engineRef is not ref-shaped', () => {
      const params = baseParams({ engineRef: null });
      expect(() => renderHook(() => useForceReloadContext(params))).toThrow(/engineRef/);
    });

    test('throws when a required function param is missing', () => {
      const params = baseParams({ retranslate: undefined });
      expect(() => renderHook(() => useForceReloadContext(params))).toThrow(/retranslate/);
    });

    test('does not throw in production even with a wrong-shaped param', () => {
      process.env.NODE_ENV = 'production';
      const params = baseParams({ engineRef: null });
      expect(() => renderHook(() => useForceReloadContext(params))).not.toThrow();
    });
  });
});
