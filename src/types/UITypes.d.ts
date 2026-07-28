/**
 * UI and styling types for the application
 *
 * Usage in .jsx files:
 * @typedef {import('./types/UITypes').ThrottledStreamingState} ThrottledStreamingState
 */

// =============================================================================
// Streaming Types
// =============================================================================

/**
 * Throttled streaming state for UI updates. Used by TranslatorDisplayPanels.
 * All fields from the full streaming state (useStreamingTranslation.js) are
 * included so consumers can use a single interface (TypeScript structural
 * typing means unused fields are safe).
 */
export interface ThrottledStreamingState {
  isStreaming: boolean;
  progress: number;
  partialText: string;
  completedChunks: number;
  totalChunks: number;
  batchNumber: number;
  avgTimePerChunk: number;
}

// =============================================================================
// Export all types
// =============================================================================

export {};
