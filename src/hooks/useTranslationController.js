import { useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';

/**
 * Translation Controller Hook
 *
 * Manages AbortController lifecycle for translation cancellation and timeout handling.
 * Provides centralized control over active translations with automatic cleanup.
 *
 * Features:
 * - Automatic timeout for stuck translations
 * - Cancel previous translations when starting new one
 * - Cleanup on component unmount
 * - Memory leak prevention
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.timeout=60000] - Translation timeout in milliseconds (default: 1 minute)
 * @param {boolean} [options.cancelPreviousOnNew=true] - Cancel previous translations when starting new one
 *
 * @returns {Object} Translation controller interface
 * @returns {Function} returns.createController - Create new controller with timeout
 * @returns {Function} returns.cleanup - Cleanup specific controller
 * @returns {Function} returns.cancelAll - Cancel all active translations
 * @returns {number} returns.activeCount - Number of active translations
 *
 * @example
 * const { createController, cleanup, cancelAll } = useTranslationController({
 *   timeout: 60000,
 *   cancelPreviousOnNew: true
 * });
 *
 * // Create controller for new translation
 * const { controller, timeoutId, translationId } = createController();
 *
 * try {
 *   await translate(text, { signal: controller.signal });
 * } finally {
 *   cleanup(translationId, timeoutId);
 * }
 */
export function useTranslationController(options = {}) {
  const { timeout = 60000, cancelPreviousOnNew = true } = options;

  // Track active translation controllers
  const activeControllers = useRef(new Map());
  const timeoutRefs = useRef(new Map());
  // CODE REVIEW FIX (CRITICAL-3): Track cleanup promises for proper async coordination
  const cleanupPromises = useRef(new Map());

  /**
   * Create new AbortController with automatic timeout
   *
   * @returns {Object} Controller bundle
   * @returns {AbortController} returns.controller - The AbortController instance
   * @returns {number} returns.timeoutId - Timeout ID for cleanup
   * @returns {number} returns.translationId - Unique translation ID
   */
  const createController = useCallback(() => {
    // Cancel previous translations if configured
    if (cancelPreviousOnNew && activeControllers.current.size > 0) {
      logger.log(
        `🛑 Cancelling ${activeControllers.current.size} previous translation(s) to start new one`
      );
      const controllers = Array.from(activeControllers.current.values());
      controllers.forEach((ctrl) => {
        try {
          ctrl.abort();
        } catch (error) {
          logger.warn('Error aborting controller:', error);
        }
      });
      activeControllers.current.clear();
      timeoutRefs.current.clear();
    }

    const translationId = `${Date.now()}-${Math.random()}`; // String concat avoids float64 precision loss
    const controller = new AbortController();

    // Register controller
    activeControllers.current.set(translationId, controller);

    // Set timeout for stuck translations
    const timeoutId = setTimeout(() => {
      if (activeControllers.current.has(translationId)) {
        logger.warn(
          `⏰ Translation ${translationId} timed out after ${timeout}ms - cleaning up controller`
        );
        controller.abort();
        activeControllers.current.delete(translationId);
        timeoutRefs.current.delete(translationId);
      }
    }, timeout);

    // Track timeout for cleanup
    timeoutRefs.current.set(translationId, timeoutId);

    return {
      controller,
      timeoutId,
      translationId,
    };
  }, [timeout, cancelPreviousOnNew]);

  /**
   * Cleanup specific translation controller
   *
   * CODE REVIEW FIX (CRITICAL-3): Now accepts cleanup promise for tracking
   *
   * @param {number} translationId - Translation ID to cleanup
   * @param {number} timeoutId - Timeout ID to clear
   * @param {Promise} [cleanupPromise] - Optional promise representing async cleanup work
   * @returns {Promise} Promise that resolves when cleanup is complete
   */
  const cleanup = useCallback((translationId, timeoutId, cleanupPromise = null) => {
    // Clear timeout
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutRefs.current.delete(translationId);
    }

    // Remove controller
    activeControllers.current.delete(translationId);

    // CODE REVIEW FIX (CRITICAL-3): Track cleanup promise for coordination
    if (cleanupPromise && cleanupPromise instanceof Promise) {
      cleanupPromises.current.set(translationId, cleanupPromise);

      // Auto-remove after completion
      cleanupPromise.finally(() => {
        cleanupPromises.current.delete(translationId);
      });
    } else {
      // No async cleanup, resolve immediately
      cleanupPromises.current.set(translationId, Promise.resolve());
      // Immediate cleanup can be removed right away
      setTimeout(() => cleanupPromises.current.delete(translationId), 0);
    }

    logger.log(`🧹 Cleaned up translation controller ${translationId}`);

    return cleanupPromises.current.get(translationId) || Promise.resolve();
  }, []);

  /**
   * Cancel all active translations
   *
   * CODE REVIEW FIX (CRITICAL-3): Now returns cleanup promises for coordination
   *
   * @returns {Object} Cancellation result
   * @returns {number} returns.count - Number of translations cancelled
   * @returns {Promise<void>} returns.cleanupComplete - Promise that resolves when all cleanups finish
   */
  const cancelAll = useCallback(() => {
    const count = activeControllers.current.size;

    if (count > 0) {
      logger.log(`🛑 Cancelling all ${count} active translation(s)`);

      // Abort all controllers
      const controllers = Array.from(activeControllers.current.values());
      controllers.forEach((ctrl) => {
        try {
          ctrl.abort();
        } catch (error) {
          logger.warn('Error aborting controller:', error);
        }
      });

      // Clear all timeouts
      timeoutRefs.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });

      // Clear maps
      activeControllers.current.clear();
      timeoutRefs.current.clear();
    }

    // CODE REVIEW FIX (CRITICAL-3): Return promise that resolves when all cleanups complete
    const pendingCleanups = Array.from(cleanupPromises.current.values());
    const cleanupComplete =
      pendingCleanups.length > 0
        ? Promise.all(pendingCleanups).then(() => {
            logger.log(`✅ All ${pendingCleanups.length} translation cleanup(s) completed`);
          })
        : Promise.resolve();

    return {
      count,
      cleanupComplete,
    };
  }, []);

  /**
   * Get number of active translations
   *
   * @returns {number} Active translation count
   */
  const getActiveCount = useCallback(() => {
    return activeControllers.current.size;
  }, []);

  /**
   * Force cleanup specific controller (for error handling)
   *
   * @param {number} translationId - Translation ID to force cleanup
   */
  const forceCleanup = useCallback((translationId) => {
    const controller = activeControllers.current.get(translationId);
    if (controller) {
      try {
        controller.abort();
      } catch (error) {
        logger.warn(`Error aborting controller ${translationId}:`, error);
      }
    }

    const timeoutId = timeoutRefs.current.get(translationId);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    activeControllers.current.delete(translationId);
    timeoutRefs.current.delete(translationId);

    logger.log(`🧹 Force cleaned up translation controller ${translationId}`);
  }, []);

  // Cleanup all controllers on unmount
  useEffect(() => {
    return () => {
      const count = activeControllers.current.size;
      if (count > 0) {
        logger.log(`🧹 Component unmounting - cleaning up ${count} active translation(s)`);

        // Abort all controllers
        activeControllers.current.forEach((ctrl) => {
          try {
            ctrl.abort();
          } catch (error) {
            // Ignore errors during unmount
          }
        });

        // Clear all timeouts
        timeoutRefs.current.forEach((timeoutId) => {
          clearTimeout(timeoutId);
        });

        activeControllers.current.clear();
        timeoutRefs.current.clear();
      }
    };
  }, []);

  return {
    createController,
    cleanup,
    cancelAll,
    getActiveCount,
    forceCleanup,
  };
}
