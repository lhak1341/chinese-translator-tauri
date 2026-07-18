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
 * Throttled streaming state for UI updates.
 * Shared between TranslatorControls and TranslatorDisplayPanels.
 * All fields from the full streaming state are included so both components
 * can use a single interface (TypeScript structural typing means unused fields
 * are safe).
 */
export interface ThrottledStreamingState {
  isStreaming: boolean;
  progress: number;
  partialText: string;
  completedChunks: number;
  totalChunks: number;
}

// =============================================================================
// Export all types
// =============================================================================

export {};
