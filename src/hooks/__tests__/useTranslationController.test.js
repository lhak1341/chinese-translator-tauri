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
    test('creates new controller with unique ID', () => {
      const { result } = renderHook(() => useTranslationController());

      let controller1, controller2;
      act(() => {
        controller1 = result.current.createController();
        controller2 = result.current.createController();
      });

      expect(controller1.controller).toBeInstanceOf(AbortController);
      expect(controller2.controller).toBeInstanceOf(AbortController);
      expect(controller1.translationId).not.toBe(controller2.translationId);
      expect(controller1.timeoutId).toBeDefined();
      expect(controller2.timeoutId).toBeDefined();
    });

    test('returns controller, timeoutId, and translationId', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(bundle).toHaveProperty('controller');
      expect(bundle).toHaveProperty('timeoutId');
      expect(bundle).toHaveProperty('translationId');
      expect(bundle.controller.signal).toBeDefined();
    });

    test('cancels previous translations when cancelPreviousOnNew is true', () => {
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
    });

    test('does not cancel previous when cancelPreviousOnNew is false', () => {
      const { result } = renderHook(() => useTranslationController({ cancelPreviousOnNew: false }));

      let controller1, controller2;
      act(() => {
        controller1 = result.current.createController();
        controller2 = result.current.createController();
      });

      expect(controller1.controller.signal.aborted).toBe(false);
      expect(result.current.getActiveCount()).toBe(2);
    });
  });

  describe('cleanup', () => {
    test('cleans up specific controller', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(result.current.getActiveCount()).toBe(1);

      act(() => {
        result.current.cleanup(bundle.translationId, bundle.timeoutId);
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
        result.current.cleanup(bundle.translationId, bundle.timeoutId);
      });

      expect(clearTimeoutSpy).toHaveBeenCalledWith(bundle.timeoutId);
    });

    test('handles cleanup of non-existent controller gracefully', () => {
      const { result } = renderHook(() => useTranslationController());

      expect(() => {
        act(() => {
          result.current.cleanup(99999, 99999);
        });
      }).not.toThrow();
    });
  });

  describe('cancelAll', () => {
    test('cancels all active translations', () => {
      const { result } = renderHook(() => useTranslationController({ cancelPreviousOnNew: false }));

      let controllers;
      act(() => {
        controllers = [
          result.current.createController(),
          result.current.createController(),
          result.current.createController(),
        ];
      });

      expect(result.current.getActiveCount()).toBe(3);

      let cancelledCount;
      act(() => {
        const { count } = result.current.cancelAll();
        cancelledCount = count;
      });

      expect(cancelledCount).toBe(3);
      expect(result.current.getActiveCount()).toBe(0);
      expect(controllers[0].controller.signal.aborted).toBe(true);
      expect(controllers[1].controller.signal.aborted).toBe(true);
      expect(controllers[2].controller.signal.aborted).toBe(true);
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

    test('clears all timeouts when cancelling all', () => {
      const { result } = renderHook(() => useTranslationController({ cancelPreviousOnNew: false }));

      let bundles;
      act(() => {
        bundles = [result.current.createController(), result.current.createController()];
      });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      act(() => {
        result.current.cancelAll();
      });

      expect(clearTimeoutSpy).toHaveBeenCalledWith(bundles[0].timeoutId);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(bundles[1].timeoutId);
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

      // Fast-forward past timeout
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

      // Cleanup before timeout
      act(() => {
        result.current.cleanup(bundle.translationId, bundle.timeoutId);
      });

      // Fast-forward past timeout
      act(() => {
        vi.advanceTimersByTime(1001);
      });

      // Should still be not aborted (cleaned up normally, not by timeout)
      expect(result.current.getActiveCount()).toBe(0);
    });
  });

  describe('getActiveCount', () => {
    test('returns correct active count', () => {
      const { result } = renderHook(() => useTranslationController({ cancelPreviousOnNew: false }));

      expect(result.current.getActiveCount()).toBe(0);

      act(() => {
        result.current.createController();
      });
      expect(result.current.getActiveCount()).toBe(1);

      act(() => {
        result.current.createController();
      });
      expect(result.current.getActiveCount()).toBe(2);

      act(() => {
        result.current.cancelAll();
      });
      expect(result.current.getActiveCount()).toBe(0);
    });
  });

  describe('forceCleanup', () => {
    test('aborts and cleans up specific controller', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      expect(result.current.getActiveCount()).toBe(1);

      act(() => {
        result.current.forceCleanup(bundle.translationId);
      });

      expect(bundle.controller.signal.aborted).toBe(true);
      expect(result.current.getActiveCount()).toBe(0);
    });

    test('handles force cleanup of non-existent controller', () => {
      const { result } = renderHook(() => useTranslationController());

      expect(() => {
        act(() => {
          result.current.forceCleanup(99999);
        });
      }).not.toThrow();
    });
  });

  describe('unmount cleanup', () => {
    test('cleans up all controllers on unmount', () => {
      const { result, unmount } = renderHook(() =>
        useTranslationController({ cancelPreviousOnNew: false })
      );

      let controllers;
      act(() => {
        controllers = [result.current.createController(), result.current.createController()];
      });

      expect(result.current.getActiveCount()).toBe(2);

      unmount();

      // Controllers should be aborted
      expect(controllers[0].controller.signal.aborted).toBe(true);
      expect(controllers[1].controller.signal.aborted).toBe(true);
    });

    test('does not throw on unmount with no active controllers', () => {
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

      // Before timeout
      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(bundle.controller.signal.aborted).toBe(false);

      // After timeout
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(bundle.controller.signal.aborted).toBe(true);
    });
  });

  describe('error handling', () => {
    test('handles abort errors gracefully in cancelAll', () => {
      const { result } = renderHook(() => useTranslationController({ cancelPreviousOnNew: false }));

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      // Mock abort to throw error
      vi.spyOn(bundle.controller, 'abort').mockImplementation(() => {
        throw new Error('Abort failed');
      });

      // Should not throw
      expect(() => {
        act(() => {
          result.current.cancelAll();
        });
      }).not.toThrow();
    });

    test('handles abort errors gracefully in forceCleanup', () => {
      const { result } = renderHook(() => useTranslationController());

      let bundle;
      act(() => {
        bundle = result.current.createController();
      });

      // Mock abort to throw error
      vi.spyOn(bundle.controller, 'abort').mockImplementation(() => {
        throw new Error('Abort failed');
      });

      // Should not throw
      expect(() => {
        act(() => {
          result.current.forceCleanup(bundle.translationId);
        });
      }).not.toThrow();
    });
  });
});
