import { useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';

/**
 * Manages a single AbortController for translation cancellation and timeout handling.
 *
 * cancelPreviousOnNew:true guarantees at most one active translation at a time —
 * Maps are unnecessary; single refs suffice.
 *
 * @param {Object} options
 * @param {number} [options.timeout=60000] - Translation timeout in milliseconds
 * @param {boolean} [options.cancelPreviousOnNew=true] - Cancel previous translation when starting new one
 *
 * @returns {{ createController, cleanup, cancelAll, getActiveCount }}
 */
export function useTranslationController(options = {}) {
  const { timeout = 60000, cancelPreviousOnNew = true } = options;

  const activeController = useRef(null); // { controller, timeoutId } | null
  const cleanupPromise = useRef(null); // CRITICAL-3: track async cleanup for force-reload coordination

  function _abort() {
    if (!activeController.current) return;
    const { controller, timeoutId } = activeController.current;
    try {
      controller.abort();
    } catch (e) {
      logger.warn('Error aborting controller:', e);
    }
    clearTimeout(timeoutId);
    activeController.current = null;
  }

  const createController = useCallback(() => {
    if (cancelPreviousOnNew && activeController.current) {
      logger.log('🛑 Cancelling previous translation to start new one');
      _abort();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (activeController.current?.controller === controller) {
        logger.warn(`⏰ Translation timed out after ${timeout}ms`);
        _abort();
      }
    }, timeout);

    activeController.current = { controller, timeoutId };
    return { controller, timeoutId, translationId: 'single' };
  }, [timeout, cancelPreviousOnNew]);

  /**
   * @param {string} _translationId - Ignored (single-at-a-time semantics)
   * @param {number} timeoutId - Timeout ID to clear
   * @param {Promise} [promise] - Optional async cleanup work (CRITICAL-3)
   */
  const cleanup = useCallback((_translationId, timeoutId, promise = null) => {
    clearTimeout(timeoutId);
    activeController.current = null;

    if (promise instanceof Promise) {
      cleanupPromise.current = promise;
      promise.finally(() => {
        cleanupPromise.current = null;
      });
    }

    logger.log('🧹 Cleaned up translation controller');
    return promise ?? Promise.resolve();
  }, []);

  /**
   * @returns {{ count: number, cleanupComplete: Promise<void> }}
   */
  const cancelAll = useCallback(() => {
    const count = activeController.current ? 1 : 0;
    if (count > 0) {
      logger.log('🛑 Cancelling active translation');
      _abort();
    }

    const pending = cleanupPromise.current ? [cleanupPromise.current] : [];
    const cleanupComplete =
      pending.length > 0
        ? Promise.all(pending).then(() => {
            logger.log('✅ Translation cleanup completed');
          })
        : Promise.resolve();

    return { count, cleanupComplete };
  }, []);

  const getActiveCount = useCallback(() => (activeController.current ? 1 : 0), []);

  useEffect(() => {
    return () => {
      if (activeController.current) {
        logger.log('🧹 Component unmounting - cleaning up active translation');
        _abort();
      }
    };
  }, []);

  return { createController, cleanup, cancelAll, getActiveCount };
}
