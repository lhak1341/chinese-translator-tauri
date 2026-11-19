/**
 * Tests for useForceReloadContext: the cancelTranslations closure it builds and the
 * ForceReloadContext it returns.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
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
});
