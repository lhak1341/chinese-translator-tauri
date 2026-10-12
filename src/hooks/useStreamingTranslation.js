import { useReducer, useCallback, useRef } from 'react';
import { useThrottledValue } from './useThrottledValue';

/**
 * Streaming translation state structure
 * @typedef {Object} StreamingTranslationState
 * @property {string} partialText - Partial translated text
 * @property {number} progress - Progress percentage (0-100), derived from the chunk counts
 * @property {boolean} isStreaming - Whether streaming is active
 * @property {number} completedChunks - Number of completed chunks
 * @property {number} totalChunks - Total number of chunks
 * @property {number} batchNumber - Current batch number
 * @property {number} avgTimePerChunk - Average time per chunk in ms
 */

/** @type {StreamingTranslationState} */
const INITIAL_STREAMING = {
  partialText: '',
  progress: 0,
  isStreaming: false,
  completedChunks: 0,
  totalChunks: 0,
  batchNumber: 0,
  avgTimePerChunk: 0,
};

/**
 * @param {number} completedChunks
 * @param {number} totalChunks
 * @returns {number} 0-100, one decimal
 */
function progressOf(completedChunks, totalChunks) {
  if (totalChunks <= 0) return 0;
  return Math.round(Math.min(100, (completedChunks / totalChunks) * 100) * 10) / 10;
}

/**
 * @param {StreamingTranslationState} state
 * @param {{ type: string; payload?: any }} action
 * @returns {StreamingTranslationState}
 */
function streamingReducer(state, action) {
  switch (action.type) {
    case 'UPDATE_STREAMING': {
      const next = { ...state, ...action.payload };
      return { ...next, progress: progressOf(next.completedChunks, next.totalChunks) };
    }
    case 'RESET':
      return INITIAL_STREAMING;
    default:
      return state;
  }
}

/**
 * Streaming translation hook.
 *
 * Holds the state of a progressive translation, fed by the engine's one batch event
 * (ADR-105). Throttling lives here and only here: the engine sends every batch, and the UI
 * reads `throttledStreamingState`. `progress` is derived from the chunk counts, never set.
 *
 * `latestPartialText()` returns the last text written, unthrottled, so a run that ends early
 * (Reader preempt, timeout, engine error) can leave its partial text on screen.
 *
 * @param {number} [throttleMs=100] - Throttle delay for streaming state updates (default: 100ms)
 * @returns {{
 *   throttledStreamingState: StreamingTranslationState,
 *   updateStreaming: (data: Partial<Omit<StreamingTranslationState, 'progress'>>) => void,
 *   latestPartialText: () => string,
 *   resetStreaming: () => void
 * }}
 */
export function useStreamingTranslation(throttleMs = 100) {
  const [state, dispatch] = useReducer(streamingReducer, INITIAL_STREAMING);
  const partialTextRef = useRef('');

  const throttledStreamingState = useThrottledValue(state, throttleMs);

  const updateStreaming = useCallback((data) => {
    if (data.partialText !== undefined) partialTextRef.current = data.partialText;
    dispatch({ type: 'UPDATE_STREAMING', payload: data });
  }, []);

  const latestPartialText = useCallback(() => partialTextRef.current, []);

  const resetStreaming = useCallback(() => {
    partialTextRef.current = '';
    dispatch({ type: 'RESET' });
  }, []);

  return {
    throttledStreamingState,
    updateStreaming,
    latestPartialText,
    resetStreaming,
  };
}
