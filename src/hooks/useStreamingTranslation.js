import { useState, useCallback } from 'react';
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

/**
 * Streaming translation hook
 *
 * Manages streaming translation state for progressive translation with incremental UI updates.
 * Includes built-in throttling to prevent UI flooding during rapid updates.
 * Updated only via translation callbacks, with no reverse dependencies.
 *
 * @param {number} [throttleMs=100] - Throttle delay for streaming state updates (default: 100ms)
 * @returns {{
 *   streamingTranslation: StreamingTranslationState,
 *   progressInfo: ProgressData | null,
 *   partialSemanticArrays: SemanticArrays | null,
 *   throttledStreamingState: StreamingTranslationState,
 *   updateStreaming: (data: Partial<StreamingTranslationState>) => void,
 *   setProgress: (info: ProgressData | null) => void,
 *   setPartialArrays: (arrays: SemanticArrays | null) => void,
 *   resetStreaming: () => void
 * }} Streaming translation state and update functions
 */
export function useStreamingTranslation(throttleMs = 100) {
  // Progressive translation state
  const [progressInfo, setProgressInfo] = useState(null);

  // Streaming translation state for incremental UI updates
  const [streamingTranslation, setStreamingTranslation] = useState({
    partialText: '',
    progress: 0,
    isStreaming: false,
    completedChunks: 0,
    totalChunks: 0,
    batchNumber: 0,
    avgTimePerChunk: 0,
  });

  // Partial semantic arrays for streaming highlighting
  const [partialSemanticArrays, setPartialSemanticArrays] = useState(null);

  const throttledStreamingState = useThrottledValue(streamingTranslation, throttleMs);

  /**
   * Update streaming translation state
   * @param {Object} data - Partial state to update
   */
  const updateStreaming = useCallback((data) => {
    setStreamingTranslation((prev) => ({
      ...prev,
      ...data,
    }));
  }, []);

  /**
   * Set partial semantic arrays
   * @param {Object} arrays - Partial semantic arrays
   */
  const setPartialArrays = useCallback((arrays) => {
    setPartialSemanticArrays(arrays);
  }, []);

  /**
   * Reset all streaming state
   */
  const resetStreaming = useCallback(() => {
    setProgressInfo(null);
    setStreamingTranslation({
      partialText: '',
      progress: 0,
      isStreaming: false,
      completedChunks: 0,
      totalChunks: 0,
      batchNumber: 0,
      avgTimePerChunk: 0,
    });
    setPartialSemanticArrays(null);
  }, []);

  return {
    streamingTranslation,
    progressInfo,
    partialSemanticArrays,
    throttledStreamingState,
    updateStreaming,
    setProgress: setProgressInfo,
    setPartialArrays,
    resetStreaming,
  };
}
