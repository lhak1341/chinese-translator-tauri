import { useReducer, useCallback, useEffect } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import {
  highlightingReducer,
  INITIAL_HIGHLIGHTING_STATE,
} from '../reducers/highlightingReducer.js';
import type { SemanticArrays } from '../types/SemanticTypes';

// Conservative overflow guard: position arithmetic multiplies segment indices by character
// positions; (MAX_SAFE_INTEGER / 1000) / 100 assumes ~100 chars per segment on average.
const MAX_POSITION_VALUE = Number.MAX_SAFE_INTEGER / 1000;
export const MAX_SAFE_SEGMENTS = Math.floor(MAX_POSITION_VALUE / 100);

// Wait for React state update to complete before scrolling to the highlighted element.
export const HIGHLIGHT_SCROLL_DELAY_MS = 10;

export interface HighlightingState {
  unitIndex: number;
  translationUnitIndex: number;
  characterOnlyUnitIndex: number | number[];
  isCharacterOnlyClick: boolean;
}

type HighlightingActionType =
  | 'HIGHLIGHT_ORIGINAL'
  | 'HIGHLIGHT_TRANSLATION'
  | 'HIGHLIGHT_FROM_CHARACTER_ONLY'
  | 'HIGHLIGHT_BOTH'
  | 'SET_CHARACTER_ONLY_INDEX'
  | 'CLEAR_ALL';

interface HighlightingAction {
  type: HighlightingActionType;
  unitIndex?: number | number[];
}

export interface UseHighlightingStateResult {
  highlighting: HighlightingState;
  dispatchHighlighting: React.Dispatch<HighlightingAction>;
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
  const [highlighting, dispatchHighlighting] = useReducer(
    highlightingReducer,
    INITIAL_HIGHLIGHTING_STATE
  );

  const clearHighlighting = useCallback(() => {
    dispatchHighlighting({ type: 'CLEAR_ALL' });
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
    // Cast needed: reducer JSDoc types unitIndex as number, but SET_CHARACTER_ONLY_INDEX
    // accepts number[] at runtime for multi-word segments. The JSDoc is a simplification.
    dispatchHighlighting: dispatchHighlighting as React.Dispatch<HighlightingAction>,
    clearHighlighting,
    validateSemanticArraySize,
  };
}
