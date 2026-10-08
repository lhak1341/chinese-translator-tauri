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
// Translation run outcome
// =============================================================================

/** Why `translateText` ran nothing. It has already told the user (toast or log). */
export type TranslateTextSkipReason =
  'invalid' | 'reloading' | 'loading' | 'not-ready' | 'preempted' | 'refused' | 'overflow';

/**
 * What `translateText` resolves. A timeout or a cancel by a newer run still rejects.
 * `done.text` is the translated text; `skipped` carries no text, so a caller cannot stream a
 * refusal as if it were a translation.
 */
export type TranslateTextOutcome =
  { status: 'done'; text: string } | { status: 'skipped'; reason: TranslateTextSkipReason };

// =============================================================================
// Export all types
// =============================================================================

export {};
