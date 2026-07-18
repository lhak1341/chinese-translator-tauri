import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslationController } from '../useTranslationController';

describe('useTranslationController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('createController', () => {
    test('returns controller and timeoutId', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(bundle).toHaveProperty('controller');
      expect(bundle).toHaveProperty('timeoutId');
      expect(bundle.controller.signal).toBeDefined();
      expect(bundle.controller).toBeInstanceOf(AbortController);
      expect(bundle.timeoutId).toBeDefined();
    });

    test('cancels previous translation when cancelPreviousOnNew is true', () => {
      const { result } = renderHook(() => useTranslationController({ cancelPreviousOnNew: true }));

      let controller1, controller2;
      act(() => {
        controller1 = result.current.createController();
      });

      const abortSpy = vi.spyOn(controller1.controller, 'abort');

      act(() => {
        controller2 = result.current.createController();
      });

      expect(abortSpy).toHaveBeenCalled();
      expect(controller1.controller.signal.aborted).toBe(true);
      expect(controller2.controller.signal.aborted).toBe(false);
      expect(result.current.getActiveCount()).toBe(1);
    });

    test('does not cancel previous when cancelPreviousOnNew is false', () => {
      const { result } = renderHook(() => useTranslationController({ cancelPreviousOnNew: false }));

      let controller1, controller2;
      act(() => {
        controller1 = result.current.createController();
        controller2 = result.current.createController();
      });

      // Both should not be aborted (second doesn't cancel first)
      expect(controller1.controller.signal.aborted).toBe(false);
      expect(controller2.controller.signal.aborted).toBe(false);
    });
  });

  describe('cleanup', () => {
    test('clears active controller', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(result.current.getActiveCount()).toBe(1);

      act(() => {
        result.current.cleanup(bundle.timeoutId);
      });

      expect(result.current.getActiveCount()).toBe(0);
    });

    test('clears timeout when cleaning up', () => {
      const { result } = renderHook(() => useTranslationController({ timeout: 1000 }));

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      act(() => {
        result.current.cleanup(bundle.timeoutId);
      });

      expect(clearTimeoutSpy).toHaveBeenCalledWith(bundle.timeoutId);
    });

    test('handles cleanup when no controller active', () => {
      const { result } = renderHook(() => useTranslationController());

      expect(() => {
        act(() => {
          result.current.cleanup(99999);
        });
      }).not.toThrow();
    });
  });

  describe('cancelAll', () => {
    test('cancels active translation', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(result.current.getActiveCount()).toBe(1);

      let cancelledCount;
      act(() => {
        const { count } = result.current.cancelAll();
        cancelledCount = count;
      });

      expect(cancelledCount).toBe(1);
      expect(result.current.getActiveCount()).toBe(0);
      expect(bundle.controller.signal.aborted).toBe(true);
    });

    test('returns 0 when no active translations', () => {
      const { result } = renderHook(() => useTranslationController());

      let count;
      act(() => {
        const { count: cancelledCount } = result.current.cancelAll();
        count = cancelledCount;
      });

      expect(count).toBe(0);
    });

    test('clears timeout when cancelling', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      act(() => {
        result.current.cancelAll();
      });

      expect(clearTimeoutSpy).toHaveBeenCalledWith(bundle.timeoutId);
    });

    test('returns cleanupComplete promise', async () => {
      const { result } = renderHook(() => useTranslationController());

      act(() => {
        result.current.createController();
      });

      let cleanupComplete;
      act(() => {
        ({ cleanupComplete } = result.current.cancelAll());
      });

      await expect(cleanupComplete).resolves.toBeUndefined();
    });
  });

  describe('automatic timeout', () => {
    test('aborts controller after timeout', () => {
      const { result } = renderHook(() => useTranslationController({ timeout: 1000 }));

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(bundle.controller.signal.aborted).toBe(false);
      expect(result.current.getActiveCount()).toBe(1);

      act(() => {
        vi.advanceTimersByTime(1001);
      });

      expect(bundle.controller.signal.aborted).toBe(true);
      expect(result.current.getActiveCount()).toBe(0);
    });

    test('does not timeout if cleaned up before timeout', () => {
      const { result } = renderHook(() => useTranslationController({ timeout: 1000 }));

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      act(() => {
        result.current.cleanup(bundle.timeoutId);
      });

      act(() => {
        vi.advanceTimersByTime(1001);
      });

      expect(result.current.getActiveCount()).toBe(0);
    });
  });

  describe('getActiveCount', () => {
    test('returns correct active count', () => {
      const { result } = renderHook(() => useTranslationController());

      expect(result.current.getActiveCount()).toBe(0);

      act(() => {
        result.current.createController();
      });
      expect(result.current.getActiveCount()).toBe(1);

      act(() => {
        result.current.cancelAll();
      });
      expect(result.current.getActiveCount()).toBe(0);
    });
  });

  describe('unmount cleanup', () => {
    test('cleans up active controller on unmount', () => {
      const { result, unmount } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(result.current.getActiveCount()).toBe(1);

      unmount();

      expect(bundle.controller.signal.aborted).toBe(true);
    });

    test('does not throw on unmount with no active controller', () => {
      const { unmount } = renderHook(() => useTranslationController());

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('custom timeout configuration', () => {
    test('respects custom timeout value', () => {
      const { result } = renderHook(() => useTranslationController({ timeout: 500 }));

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(bundle.controller.signal.aborted).toBe(false);

      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(bundle.controller.signal.aborted).toBe(true);
    });
  });

  describe('error handling', () => {
    test('handles abort errors gracefully in cancelAll', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      vi.spyOn(bundle.controller, 'abort').mockImplementation(() => {
        throw new Error('Abort failed');
      });

      expect(() => {
        act(() => {
          result.current.cancelAll();
        });
      }).not.toThrow();
    });
  });
});
