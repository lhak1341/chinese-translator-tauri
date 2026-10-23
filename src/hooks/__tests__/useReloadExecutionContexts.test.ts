/**
 * Tests for useForceReloadContext — extracted from Translator.jsx's inline
 * forceReloadCtx object literal (architecture review 2026-07-29, candidate
 * #3). Covers the relocated cancelTranslations closure
 * and the dev-only input-shape guard.
 *
 * useTranslationExecutionContext used to live here too (assembly-only,
 * identical interface to implementation — no logic behind the seam) until
 * architecture review 2026-08-12 candidate #1 deleted it; its guard moved
 * into useAutoTranslateTrigger.ts (the one real consumer of the type it
 * checks), and its tests moved to useAutoTranslateTrigger.test.ts.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForceReloadContext } from '../useReloadExecutionContexts';

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function baseForceReloadParams(overrides = {}) {
  return {
    destroyEngine: vi.fn(),
    cancelAllTranslations: vi.fn(() => ({ count: 0, cleanupComplete: Promise.resolve() })),
    setIsTranslating: vi.fn(),
    setStatusMessage: vi.fn(),
    setTranslationError: vi.fn(),
    setDictionaryReloading: vi.fn(),
    clearHighlighting: vi.fn(),
    reinitializeEngine: vi.fn(async () => ({ ok: true })),
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
    const { result } = renderHook(() => useForceReloadContext(baseForceReloadParams()));

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
    const params = baseForceReloadParams();
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
      const params = baseForceReloadParams({
        cancelAllTranslations: vi.fn(() => ({ count: 0, cleanupComplete })),
      });
      const { result } = renderHook(() => useForceReloadContext(params));

      await act(async () => {
        await result.current.cancelTranslations();
      });

      expect(params.setIsTranslating).toHaveBeenCalledWith(false);
    });

    test('when count > 0: awaits cleanupComplete before resetting translating state', async () => {
      const order: string[] = [];
      const cleanupComplete = new Promise<void>((resolve) => {
        setTimeout(() => {
          order.push('cleanup-resolved');
          resolve();
        }, 0);
      });
      const params = baseForceReloadParams({
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

  describe('dev-only input-shape guard', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('throws when a required setter is missing', () => {
      const params = baseForceReloadParams({ setIsTranslating: null });
      expect(() => renderHook(() => useForceReloadContext(params))).toThrow(/setIsTranslating/);
    });

    test('throws when a required function param is missing', () => {
      const params = baseForceReloadParams({ retranslate: undefined });
      expect(() => renderHook(() => useForceReloadContext(params))).toThrow(/retranslate/);
    });

    test('does not throw in production even with a wrong-shaped param', () => {
      process.env.NODE_ENV = 'production';
      const params = baseForceReloadParams({ setIsTranslating: null });
      expect(() => renderHook(() => useForceReloadContext(params))).not.toThrow();
    });
  });
});
