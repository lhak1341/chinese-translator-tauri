import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';

/**
 * Scroll Position Manager Hook
 *
 * Manages saving, restoring, and cleaning up scroll positions across multiple refs.
 * Handles edge cases like content not ready, bounds checking, and automatic cleanup.
 *
 * @param {Object} refs - Object containing DOM refs to manage
 * @param {React.RefObject} refs.original - Original text panel ref
 * @param {React.RefObject} refs.translation - Translation panel ref
 * @param {React.RefObject} refs.characterOnly - Character-only panel ref
 * @param {Object} options - Configuration options
 * @param {number} [options.maxRetryAttempts=10] - Maximum retry attempts for restoration
 * @param {number} [options.maxRetryDelay=1000] - Maximum delay between retries (ms)
 * @param {number} [options.initialAttemptDelay=50] - Initial retry delay (ms)
 * @param {number} [options.postReloadDelay=100] - Delay after reload before restoration (ms)
 * @param {number} [options.cleanupDelay=200] - Delay before cleanup after restoration (ms)
 *
 * @returns {Object} Scroll position management interface
 * @returns {Object|null} returns.savedPositions - Currently saved scroll positions
 * @returns {Function} returns.savePositions - Save current scroll positions
 * @returns {Function} returns.restorePositions - Restore saved scroll positions
 * @returns {Function} returns.cleanup - Cleanup timers and RAF
 *
 * @example
 * const { savePositions, restorePositions } = useScrollPositionManager({
 *   original: originalTextRef,
 *   translation: translationTextRef,
 *   characterOnly: characterOnlyTextRef
 * });
 *
 * // Save before dictionary reload
 * const positions = savePositions();
 *
 * // Restore after reload
 * await restorePositions(positions);
 *
 * @see docs/guides/development.md#scroll-position-management
 */
export function useScrollPositionManager(refs, options = {}) {
  // Configuration with defaults
  const {
    maxRetryAttempts = 10, // Increased from 5 for large texts (IMPORTANT-4)
    maxRetryDelay = 1000, // Increased from 500ms for large texts (IMPORTANT-4)
    initialAttemptDelay = 50, // Single DOM update cycle (16.67ms frame time)
    postReloadDelay = 100, // Allow React state updates to flush
    cleanupDelay = 200, // Ensure scroll restoration completed before clearing state
  } = options;

  // State for saved positions
  const [savedScrollPositions, setSavedScrollPositions] = useState(null);

  // Refs for tracking async operations
  const scrollRestorationTimeoutRef = useRef(null);
  const scrollRestorationRafRef = useRef(null);

  /**
   * Cleanup function to clear all pending timers and RAF
   * MEDIUM-7 FIX: Shared cleanup function to eliminate duplication
   */
  const cleanup = useCallback(() => {
    if (scrollRestorationTimeoutRef.current !== null) {
      clearTimeout(scrollRestorationTimeoutRef.current);
      scrollRestorationTimeoutRef.current = null;
    }
    if (scrollRestorationRafRef.current !== null) {
      cancelAnimationFrame(scrollRestorationRafRef.current);
      scrollRestorationRafRef.current = null;
    }
  }, []);

  /**
   * Save current scroll positions from all refs
   *
   * @returns {Object} Saved scroll positions
   */
  const savePositions = useCallback(() => {
    const positions = {
      original: {
        scrollTop: refs.original.current?.scrollTop || 0,
        scrollLeft: refs.original.current?.scrollLeft || 0,
      },
      translation: {
        scrollTop: refs.translation.current?.scrollTop || 0,
        scrollLeft: refs.translation.current?.scrollLeft || 0,
      },
      characterOnly: {
        scrollTop: refs.characterOnly.current?.scrollTop || 0,
        scrollLeft: refs.characterOnly.current?.scrollLeft || 0,
      },
    };

    setSavedScrollPositions(positions);
    logger.log('📍 Saved scroll positions:', positions);
    return positions;
  }, [refs]);

  /**
   * Restore scroll positions with retry logic and bounds checking
   * CRITICAL-2 FIX: Positions parameter is now required (no default to stale state)
   *
   * @param {Object} positions - Scroll positions to restore
   * @returns {Promise<void>} Resolves when restoration completes or fails
   */
  const restorePositions = useCallback(
    (positions) => {
      if (!positions) {
        logger.warn('📍 restoreScrollPositions called without positions');
        return Promise.resolve(); // Return resolved promise for consistency
      }

      logger.log('📍 Attempting to restore positions:', positions);

      // MEDIUM-7 FIX: Use shared cleanup function
      cleanup();

      // Return a Promise that resolves when restoration completes
      return new Promise((resolve) => {
        // Recursive retry with early termination on success
        // IMPORTANT-4 FIX: Increased max attempts (5→10) and delay (500ms→1000ms) for large texts
        const attemptRestore = (attemptsLeft = maxRetryAttempts, delay = 0) => {
          // Check if all refs are ready with content
          const allRefsReady =
            (!positions.original ||
              (refs.original.current && refs.original.current.scrollHeight > 0)) &&
            (!positions.translation ||
              (refs.translation.current && refs.translation.current.scrollHeight > 0)) &&
            (!positions.characterOnly ||
              (refs.characterOnly.current && refs.characterOnly.current.scrollHeight > 0));

          if (allRefsReady) {
            // CRITICAL-3 FIX: Wrap DOM manipulation in try-catch
            // IMPORTANT-5 FIX: Clamp scroll positions to valid bounds
            try {
              if (refs.original.current && positions.original) {
                const maxScrollTop = Math.max(
                  0,
                  refs.original.current.scrollHeight - refs.original.current.clientHeight
                );
                const maxScrollLeft = Math.max(
                  0,
                  refs.original.current.scrollWidth - refs.original.current.clientWidth
                );
                refs.original.current.scrollTop = Math.min(
                  positions.original.scrollTop,
                  maxScrollTop
                );
                refs.original.current.scrollLeft = Math.min(
                  positions.original.scrollLeft,
                  maxScrollLeft
                );
              }

              if (refs.translation.current && positions.translation) {
                const maxScrollTop = Math.max(
                  0,
                  refs.translation.current.scrollHeight - refs.translation.current.clientHeight
                );
                const maxScrollLeft = Math.max(
                  0,
                  refs.translation.current.scrollWidth - refs.translation.current.clientWidth
                );
                refs.translation.current.scrollTop = Math.min(
                  positions.translation.scrollTop,
                  maxScrollTop
                );
                refs.translation.current.scrollLeft = Math.min(
                  positions.translation.scrollLeft,
                  maxScrollLeft
                );
              }

              if (refs.characterOnly.current && positions.characterOnly) {
                const maxScrollTop = Math.max(
                  0,
                  refs.characterOnly.current.scrollHeight - refs.characterOnly.current.clientHeight
                );
                const maxScrollLeft = Math.max(
                  0,
                  refs.characterOnly.current.scrollWidth - refs.characterOnly.current.clientWidth
                );
                refs.characterOnly.current.scrollTop = Math.min(
                  positions.characterOnly.scrollTop,
                  maxScrollTop
                );
                refs.characterOnly.current.scrollLeft = Math.min(
                  positions.characterOnly.scrollLeft,
                  maxScrollLeft
                );
              }

              logger.log('📍 Scroll positions restored successfully');
            } catch (error) {
              logger.error('❌ Failed to restore scroll positions:', error);
            }

            scrollRestorationTimeoutRef.current = null;
            resolve(); // Resolve promise when restoration completes
          } else if (attemptsLeft > 0) {
            // Retry with exponential backoff (using named constants)
            const nextDelay =
              delay === 0 ? initialAttemptDelay : Math.min(delay * 2, maxRetryDelay);

            scrollRestorationTimeoutRef.current = setTimeout(
              () => attemptRestore(attemptsLeft - 1, nextDelay),
              nextDelay
            );
          } else {
            logger.warn(`📍 Failed to restore scroll positions after ${maxRetryAttempts} attempts`);
            scrollRestorationTimeoutRef.current = null;
            resolve(); // Resolve promise even if restoration failed (don't block cleanup)
          }
        };

        // Start restoration with requestAnimationFrame for immediate attempt
        // Store rAF ID to allow cancellation (MEDIUM-1 FIX)
        scrollRestorationRafRef.current = requestAnimationFrame(() => {
          scrollRestorationRafRef.current = null; // Clear after execution
          attemptRestore();
        });
      });
    },
    [refs, cleanup, maxRetryAttempts, maxRetryDelay, initialAttemptDelay]
  );

  // CRITICAL FIX: Cleanup timers on component unmount to prevent memory leaks
  // Pattern from CLAUDE.md: "All setInterval/setTimeout must have corresponding clear* in cleanup"
  // Impact: Prevents 50MB+ memory accumulation from timer leaks (documented pattern)
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    savedPositions: savedScrollPositions,
    savePositions,
    restorePositions,
    cleanup,
  };
}
