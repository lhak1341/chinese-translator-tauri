/**
 * Tests for useForceReloadContext / useTranslationExecutionContext —
 * extracted from Translator.jsx's inline forceReloadCtx/executionCtx object
 * literals (architecture review 2026-07-29, candidate #3), merged into one
 * file/guard (architecture review 2026-07-30, candidate #1). Covers the 2
 * relocated closures (cancelTranslations, destroyEngine), the assembly-only
 * passthrough, and the shared dev-only input-shape guard.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useForceReloadContext,
  useTranslationExecutionContext,
} from '../useReloadExecutionContexts';

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function baseForceReloadParams(overrides = {}) {
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

function baseExecutionParams(overrides = {}) {
  return {
    consumeReloadTransition: vi.fn(() => false),
    clearHighlighting: vi.fn(),
    setIsTranslating: vi.fn(),
    isTranslatingRef: { current: false },
    setResultArrays: vi.fn(),
    setStreamingText: vi.fn(),
    isClipboardTranslationRef: { current: false },
    resetClipboardFlag: vi.fn(),
    translationTextRef: { current: null },
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

  describe('destroyEngine', () => {
    test('calls destroy() then nulls engineRef.current', () => {
      const destroy = vi.fn();
      const params = baseForceReloadParams({ engineRef: { current: { destroy } } });
      const { result } = renderHook(() => useForceReloadContext(params));

      result.current.destroyEngine();

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(params.engineRef.current).toBeNull();
    });

    test('is a no-op when engineRef.current is already null', () => {
      const params = baseForceReloadParams({ engineRef: { current: null } });
      const { result } = renderHook(() => useForceReloadContext(params));

      expect(() => result.current.destroyEngine()).not.toThrow();
    });

    test('when destroy() throws: catches it (does not rethrow) and leaves engineRef.current untouched', () => {
      const destroy = vi.fn(() => {
        throw new Error('boom');
      });
      const engineInstance = { destroy };
      const params = baseForceReloadParams({ engineRef: { current: engineInstance } });
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
      const params = baseForceReloadParams({ engineRef: null });
      expect(() => renderHook(() => useForceReloadContext(params))).toThrow(/engineRef/);
    });

    test('throws when a required function param is missing', () => {
      const params = baseForceReloadParams({ retranslate: undefined });
      expect(() => renderHook(() => useForceReloadContext(params))).toThrow(/retranslate/);
    });

    test('does not throw in production even with a wrong-shaped param', () => {
      process.env.NODE_ENV = 'production';
      const params = baseForceReloadParams({ engineRef: null });
      expect(() => renderHook(() => useForceReloadContext(params))).not.toThrow();
    });
  });
});

describe('useTranslationExecutionContext', () => {
  test('returns all 9 fields unchanged (assembly-only, no logic)', () => {
    const params = baseExecutionParams();
    const { result } = renderHook(() => useTranslationExecutionContext(params));

    expect(result.current).toEqual(params);
    expect(result.current.clearHighlighting).toBe(params.clearHighlighting);
    expect(result.current.isTranslatingRef).toBe(params.isTranslatingRef);
  });

  describe('dev-only input-shape guard', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('throws when a required ref param is not ref-shaped', () => {
      const params = baseExecutionParams({ translationTextRef: undefined });
      expect(() => renderHook(() => useTranslationExecutionContext(params))).toThrow(
        /translationTextRef/
      );
    });

    test('throws when a required function param is missing', () => {
      const params = baseExecutionParams({ resetClipboardFlag: undefined });
      expect(() => renderHook(() => useTranslationExecutionContext(params))).toThrow(
        /resetClipboardFlag/
      );
    });

    test('does not throw in production even with a wrong-shaped param', () => {
      process.env.NODE_ENV = 'production';
      const params = baseExecutionParams({ resetClipboardFlag: undefined });
      expect(() => renderHook(() => useTranslationExecutionContext(params))).not.toThrow();
    });
  });
});
