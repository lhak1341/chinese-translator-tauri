import { useReducer, useCallback, useEffect } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import {
  highlightingReducer,
  INITIAL_HIGHLIGHTING_STATE,
} from '../reducers/highlightingReducer.js';
import { MAX_SAFE_SEGMENTS } from '../utils/highlighting';
import type { SemanticArrays } from '../types/SemanticTypes';

export interface HighlightingState {
  unitIndex: number;
  translationUnitIndex: number;
  characterOnlyUnitIndex: number | number[];
  isCharacterOnlyClick: boolean;
}

export interface UseHighlightingStateResult {
  highlighting: HighlightingState;
  highlightOriginal: (unitIndex: number) => void;
  highlightTranslation: (unitIndex: number) => void;
  highlightBoth: (unitIndex: number) => void;
  highlightFromCharacterOnly: (unitIndex: number) => void;
  setCharacterOnlyIndex: (unitIndex: number | number[]) => void;
  clearHighlighting: () => void;
  validateSemanticArraySize: (arrays: SemanticArrays | null | undefined, context: string) => void;
}

/**
 * Owns highlighting reducer state, the stale-clear invariant, and the overflow guard.
 *
 * Invariant: whenever semanticArrays transitions from null to a value (new translation
 * complete), all highlighting indices are reset so stale indices from the previous
 * translation cannot cause out-of-bounds errors on the new arrays.
 */
export function useHighlightingState(
  semanticArrays: SemanticArrays | null
): UseHighlightingStateResult {
  const [highlighting, dispatch] = useReducer(highlightingReducer, INITIAL_HIGHLIGHTING_STATE);

  const highlightOriginal = useCallback((unitIndex: number) => {
    dispatch({ type: 'HIGHLIGHT_ORIGINAL', unitIndex });
  }, []);

  const highlightTranslation = useCallback((unitIndex: number) => {
    dispatch({ type: 'HIGHLIGHT_TRANSLATION', unitIndex });
  }, []);

  const highlightBoth = useCallback((unitIndex: number) => {
    dispatch({ type: 'HIGHLIGHT_BOTH', unitIndex });
  }, []);

  const highlightFromCharacterOnly = useCallback((unitIndex: number) => {
    dispatch({ type: 'HIGHLIGHT_FROM_CHARACTER_ONLY', unitIndex });
  }, []);

  // SET_CHARACTER_ONLY_INDEX accepts number[] at runtime for multi-word segments;
  // reducer JSDoc simplifies unitIndex as number — cast required.
  // -1 (or array of -1) is the conventional "clear" value.
  const setCharacterOnlyIndex = useCallback((unitIndex: number | number[]) => {
    (dispatch as React.Dispatch<{ type: string; unitIndex?: number | number[] }>)({
      type: 'SET_CHARACTER_ONLY_INDEX',
      unitIndex,
    });
  }, []);

  const clearHighlighting = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  useEffect(() => {
    if (semanticArrays !== null) {
      clearHighlighting();
    }
  }, [semanticArrays, clearHighlighting]);

  const validateSemanticArraySize = useCallback(
    (arrays: SemanticArrays | null | undefined, context: string) => {
      if (!arrays?.original) return;
      const arrayLength = arrays.original.length;
      if (arrayLength > MAX_SAFE_SEGMENTS) {
        const error = new Error(
          `Document too large for ${context}: ${arrayLength.toLocaleString()} segments exceeds maximum ${MAX_SAFE_SEGMENTS.toLocaleString()}`
        );
        logger.error(error.message);
        toast.error(
          `Document too large: ${arrayLength.toLocaleString()} segments (max: ${MAX_SAFE_SEGMENTS.toLocaleString()})`
        );
        throw error;
      }
    },
    []
  );

  return {
    highlighting,
    highlightOriginal,
    highlightTranslation,
    highlightBoth,
    highlightFromCharacterOnly,
    setCharacterOnlyIndex,
    clearHighlighting,
    validateSemanticArraySize,
  };
}
