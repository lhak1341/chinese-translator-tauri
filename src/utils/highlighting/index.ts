/**
 * Highlighting & semantic array public API.
 *
 * Primary entry points:
 *   - SemanticArrayBuilder  — semantic relationship tracker
 *   - SegmentPrecomputer    — character-only mode segment pre-computation
 */

export { SemanticArrayBuilder } from './SemanticArrayBuilder';
export type { SemanticArrayMetadata, SemanticArraySnapshot } from './SemanticArrayBuilder';
export { SemanticArrayValidator, semanticArrayValidator } from './SemanticArrayValidator';

// --- Segment pre-computation (character-only mode) ---
export type { SegmentPrecomputerOptions, SemanticArrays, Segment } from './SegmentPrecomputer';
export { SegmentPrecomputer } from './SegmentPrecomputer';

// --- Scroll ---
export { scrollToHighlightedElement } from './ScrollHelpers';

// --- Position utilities ---
export {
  tokenPositionToCharPosition,
  buildFullTextFromTokens,
  convertWasmMatchToTokenMatch,
} from './PositionMappingUtils';
