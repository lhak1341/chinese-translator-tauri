import { useReducer, useCallback } from 'react';
import { useThrottledValue } from './useThrottledValue';

/**
 * @import { SemanticArrays, ProgressData } from '../types/SemanticTypes'
 */

/**
 * Streaming translation state structure
 * @typedef {Object} StreamingTranslationState
 * @property {string} partialText - Partial translated text
 * @property {number} progress - Progress percentage (0-100)
 * @property {boolean} isStreaming - Whether streaming is active
 * @property {number} completedChunks - Number of completed chunks
 * @property {number} totalChunks - Total number of chunks
 * @property {number} batchNumber - Current batch number
 * @property {number} avgTimePerChunk - Average time per chunk in ms
 */

/** @type {StreamingTranslationState} */
export const INITIAL_STREAMING = {
  partialText: '',
  progress: 0,
  isStreaming: false,
  completedChunks: 0,
  totalChunks: 0,
  batchNumber: 0,
  avgTimePerChunk: 0,
};

export const INITIAL_STATE = {
  progressInfo: /** @type {ProgressData | null} */ (null),
  streamingTranslation: INITIAL_STREAMING,
  partialSemanticArrays: /** @type {SemanticArrays | null} */ (null),
};

/**
 * @param {typeof INITIAL_STATE} state
 * @param {{ type: string; payload?: any }} action
 * @returns {typeof INITIAL_STATE}
 */
export function streamingReducer(state, action) {
  switch (action.type) {
    case 'UPDATE_STREAMING':
      return {
        ...state,
        streamingTranslation: { ...state.streamingTranslation, ...action.payload },
      };
    case 'SET_PROGRESS_INFO':
      return { ...state, progressInfo: action.payload };
    case 'SET_PARTIAL_ARRAYS':
      return { ...state, partialSemanticArrays: action.payload };
    case 'RESET':
      return INITIAL_STATE;
    default:
      return state;
  }
}

/**
 * Streaming translation hook.
 *
 * Manages streaming translation state for progressive translation with incremental UI updates.
 * Includes built-in throttling to prevent UI flooding during rapid updates.
 * Uses a single reducer so RESET atomically clears all three state pieces in one dispatch —
 * the invariant is structural rather than enforced by convention across three separate setters.
 *
 * @param {number} [throttleMs=100] - Throttle delay for streaming state updates (default: 100ms)
 * @returns {{
 *   progressInfo: ProgressData | null,
 *   partialSemanticArrays: SemanticArrays | null,
 *   throttledStreamingState: StreamingTranslationState,
 *   updateStreaming: (data: Partial<StreamingTranslationState>) => void,
 *   setProgressInfo: (info: ProgressData | null) => void,
 *   setPartialSemanticArrays: (arrays: SemanticArrays | null) => void,
 *   resetStreaming: () => void
 * }}
 */
export function useStreamingTranslation(throttleMs = 100) {
  const [state, dispatch] = useReducer(streamingReducer, INITIAL_STATE);

  const throttledStreamingState = useThrottledValue(state.streamingTranslation, throttleMs);

  const updateStreaming = useCallback((data) => {
    dispatch({ type: 'UPDATE_STREAMING', payload: data });
  }, []);

  const setProgressInfo = useCallback((info) => {
    dispatch({ type: 'SET_PROGRESS_INFO', payload: info });
  }, []);

  const setPartialSemanticArrays = useCallback((arrays) => {
    dispatch({ type: 'SET_PARTIAL_ARRAYS', payload: arrays });
  }, []);

  const resetStreaming = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    progressInfo: state.progressInfo,
    partialSemanticArrays: state.partialSemanticArrays,
    throttledStreamingState,
    updateStreaming,
    setProgressInfo,
    setPartialSemanticArrays,
    resetStreaming,
  };
}
