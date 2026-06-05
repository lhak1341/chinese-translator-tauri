import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';
import { ScrollPositionRecovery } from '../utils/ui/ScrollPositionRecovery';

/**
 * Try to restore scroll positions to the given DOM refs.
 * Returns true when refs were ready and positions were applied; false to retry.
 *
 * @param {{ original, translation, characterOnly }} refs - DOM refs
 * @param {import('../utils/ui/ScrollPositionRecovery').ScrollPositions} positions
 * @returns {boolean}
 */
function tryRestoreScrollPositions(refs, positions) {
  const allRefsReady =
    (!positions.original || (refs.original.current && refs.original.current.scrollHeight > 0)) &&
    (!positions.translation ||
      (refs.translation.current && refs.translation.current.scrollHeight > 0)) &&
    (!positions.characterOnly ||
      (refs.characterOnly.current && refs.characterOnly.current.scrollHeight > 0));

  if (!allRefsReady) return false;

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
      refs.original.current.scrollTop = Math.min(positions.original.scrollTop, maxScrollTop);
      refs.original.current.scrollLeft = Math.min(positions.original.scrollLeft, maxScrollLeft);
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
      refs.translation.current.scrollTop = Math.min(positions.translation.scrollTop, maxScrollTop);
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

  return true;
}

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
 *
 * @returns {Object} Scroll position management interface
 * @returns {Object|null} returns.savedPositions - Currently saved scroll positions
 * @returns {Function} returns.savePositions - Save current scroll positions
 * @returns {Function} returns.restorePositions - Restore saved scroll positions
 * @returns {Function} returns.cleanup - Cancel any pending restoration
 *
 * @see docs/guides/development.md#scroll-position-management
 */
export function useScrollPositionManager(refs, options = {}) {
  const { maxRetryAttempts = 10, maxRetryDelay = 1000, initialAttemptDelay = 50 } = options;

  const [savedScrollPositions, setSavedScrollPositions] = useState(null);

  // "Latest ref" pattern: recovery instance is stable; closure always reads current refs.
  const refsRef = useRef(refs);
  useEffect(() => {
    refsRef.current = refs;
  });

  const recoveryRef = useRef(
    new ScrollPositionRecovery((positions) => tryRestoreScrollPositions(refsRef.current, positions))
  );

  const cleanup = useCallback(() => {
    recoveryRef.current.cancel();
  }, []);

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

  const restorePositions = useCallback(
    (positions) => {
      if (!positions) {
        logger.warn('📍 restoreScrollPositions called without positions');
        return Promise.resolve();
      }

      logger.log('📍 Attempting to restore positions:', positions);
      return recoveryRef.current.restore(positions, {
        maxRetryAttempts,
        maxRetryDelay,
        initialAttemptDelay,
      });
    },
    [maxRetryAttempts, maxRetryDelay, initialAttemptDelay]
  );

  useEffect(() => {
    return () => {
      recoveryRef.current.cancel();
    };
  }, []);

  return {
    savedPositions: savedScrollPositions,
    savePositions,
    restorePositions,
    cleanup,
  };
}
