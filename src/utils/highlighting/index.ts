/**
 * Highlighting & semantic array public API.
 *
 * Primary entry points:
 *   - SemanticArrayBuilder      — semantic relationship tracker
 *   - precomputeOriginalSegments — original Chinese text segment pre-computation
 */

export { SemanticArrayBuilder } from './SemanticArrayBuilder';
export type { SemanticArrayMetadata, SemanticArraySnapshot } from './SemanticArrayBuilder';
export { SemanticArrayValidator, semanticArrayValidator } from './SemanticArrayValidator';

// --- Segment pre-computation (character-only mode) ---
export type { SemanticArrays, Segment } from './SegmentPrecomputer';
export { precomputeOriginalSegments, emptySemanticArrays } from './SegmentPrecomputer';
export { buildSegmentsFromPositions } from './PositionBasedSegmentBuilder';
export { segmentFromPositionMetadata } from './PositionMetadataSegmenter';

// --- Character-Only bridge scoring ---
export { findCharacterOnlyMatch } from './CharacterOnlyBridge';

// --- Shared Clickable* highlight predicate ---
export { isUnitHighlighted } from './UnitHighlightPredicate';

// --- Scroll ---
export { scrollToHighlightedElement, scheduleHighlightScroll } from './ScrollHelpers';

// --- Position utilities ---
export { compareByTokenIndex, resolveTokenIndex } from './TextPositionMapper';

// --- Overflow guard constants (shared with TranslationEngine and Translator) ---
export { MAX_SAFE_SEGMENTS, HIGHLIGHT_SCROLL_DELAY_MS } from './semanticArrayConstants';

// --- Word-position matching (progressive translation) ---
export type { WordSegment, WordSegmentSemanticArrays } from './WordSegmentMatcher';
export { matchWordSegments } from './WordSegmentMatcher';
