import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';
import { ScrollPositionRecovery } from '../utils/ui/ScrollPositionRecovery';

const PANELS = ['original', 'translation', 'characterOnly'];

/**
 * Try to restore scroll positions to the given DOM refs.
 * Returns true when refs were ready and positions were applied; false to retry.
 *
 * Ready means every SAVED panel is mounted and has layout (`scrollHeight > 0`); a panel that
 * was not saved is not waited for. Each write is clamped to what the panel can scroll now,
 * since the content may have shrunk across the reload.
 *
 * @param {{ original, translation, characterOnly }} refs - DOM refs
 * @param {import('../utils/ui/ScrollPositionRecovery').ScrollPositions} positions
 * @returns {boolean}
 */
export function tryRestoreScrollPositions(refs, positions) {
  const saved = PANELS.filter((name) => positions[name]);
  const allRefsReady = saved.every(
    (name) => refs[name].current && refs[name].current.scrollHeight > 0
  );

  if (!allRefsReady) return false;

  try {
    for (const name of saved) {
      const element = refs[name].current;
      const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      element.scrollTop = Math.min(positions[name].scrollTop, maxScrollTop);
      element.scrollLeft = Math.min(positions[name].scrollLeft, maxScrollLeft);
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
    // recoveryRef.current is set once by useRef's initializer and never reassigned
    const recovery = recoveryRef.current;
    return () => {
      recovery.cancel();
    };
  }, []);

  return {
    savedPositions: savedScrollPositions,
    savePositions,
    restorePositions,
    cleanup,
  };
}
