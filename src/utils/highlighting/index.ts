/**
 * Highlighting & semantic array public API.
 *
 * Primary entry points:
 *   - OptimizedSemanticArrayBuilder — default semantic relationship tracker (use this)
 *   - SemanticArrayBuilder          — fallback (?optimized-semantics=false URL param only)
 *   - SegmentPrecomputer            — character-only mode segment pre-computation
 *   - findConflictingEntries        — duplicate dictionary entry detection
 */

// --- Semantic array builders (sibling implementations — changes must be mirrored) ---
export {
  OptimizedSemanticArrayBuilder,
  default as OptimizedSemanticArrayBuilderDefault,
} from './OptimizedSemanticArrayBuilder';
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
export {
  adaptiveBufferCalculator,
  AdaptiveBufferCalculator,
  DevicePerformanceDetector,
} from './AdaptiveVirtualScrolling';

// --- Position utilities ---
export {
  validateNonOverlappingPosition,
  validatePositionRange,
  validatePosition,
} from './PositionValidationHelpers';
export {
  tokenPositionToCharPosition,
  buildFullTextFromTokens,
  convertWasmMatchToTokenMatch,
  validatePositionMapping,
} from './PositionMappingUtils';

// --- UI responsiveness ---
export type {
  ProgressData,
  ProgressCallbacks,
  LoadingState,
  LoadingCallback,
} from './UIResponsiveness';
export {
  DebouncedProgressHandler,
  SmoothLoadingManager,
  ThrottledScrollHandler,
  smoothDOMUpdate,
  batchStateUpdates,
} from './UIResponsiveness';
