/**
 * Highlighting & semantic array public API.
 *
 * Primary entry points:
 *   - SemanticArrayBuilder  — semantic relationship tracker
 *   - SegmentPrecomputer    — character-only mode segment pre-computation
 *   - findConflictingEntries — duplicate dictionary entry detection
 */

export { SemanticArrayBuilder } from './SemanticArrayBuilder';

// --- Segment pre-computation (character-only mode) ---
export type {
  SegmentPrecomputerOptions,
  SemanticArrays,
  Segment,
  RenderSegment,
} from './SegmentPrecomputer';
export { SegmentPrecomputer } from './SegmentPrecomputer';

// --- Duplicate detection ---
export type { DuplicateRow } from './DuplicateAnalyzer';
export { findConflictingEntries, createDuplicateKey, parseDuplicateKey } from './DuplicateAnalyzer';

// --- Scroll & UI ---
export { scrollToHighlightedElement } from './ScrollHelpers';
export { adaptiveBufferCalculator } from './AdaptiveVirtualScrolling';

// --- Position utilities ---
export {
  tokenPositionToCharPosition,
  buildFullTextFromTokens,
  convertWasmMatchToTokenMatch,
} from './PositionMappingUtils';

// --- UI responsiveness ---
export type {
  ProgressData,
  ProgressCallbacks,
  LoadingState,
  LoadingCallback,
} from './UIResponsiveness';
export { DebouncedProgressHandler, SmoothLoadingManager } from './UIResponsiveness';
