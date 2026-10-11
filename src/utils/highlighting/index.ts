/**
 * Highlighting & semantic array public API.
 *
 * Primary entry points:
 *   - SemanticArrayBuilder      — semantic relationship tracker
 *   - precomputeOriginalSegments — original Chinese text segment pre-computation
 */

export { SemanticArrayBuilder } from './SemanticArrayBuilder';
export type { SemanticArraySnapshot } from './SemanticArrayBuilder';
export type { SemanticArrayMetadata, SemanticArrays, Segment } from '../../types/SemanticTypes';
export { SemanticArrayValidator, semanticArrayValidator } from './SemanticArrayValidator';

// --- Segment pre-computation (character-only mode) ---
export { precomputeOriginalSegments, emptySemanticArrays } from './SegmentPrecomputer';
export { buildSegmentsFromPositions } from './PositionBasedSegmentBuilder';
export { segmentFromPositionMetadata } from './PositionMetadataSegmenter';

// --- Character-Only bridge scoring ---
export { findCharacterOnlyMatch } from './CharacterOnlyBridge';

// --- Which units are lit, from one lit unit ---
export { resolveHighlights } from './HighlightResolver';
export type { LitUnit, ResolvedHighlights } from './HighlightResolver';

// --- Shared Clickable* highlight predicate ---
export { isUnitHighlighted } from './UnitHighlightPredicate';

// --- Scroll ---
export { scrollToHighlightedElement, scheduleHighlightScroll } from './ScrollHelpers';

// --- Position utilities ---
export { compareByTokenIndex, resolveTokenIndex } from './TextPositionMapper';

// --- Overflow guard constants (shared with TranslationEngine and Translator) ---
export { MAX_SAFE_SEGMENTS, HIGHLIGHT_SCROLL_DELAY_MS } from './semanticArrayConstants';
export { validateSemanticArraySize } from './SemanticArraySizeGuard';

// --- Word-position matching (progressive translation) ---
export type { WordSegment, WordSegmentSemanticArrays } from './WordSegmentMatcher';
export { matchWordSegments } from './WordSegmentMatcher';
