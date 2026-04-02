/**
 * Character-only path — ClickableTranslationSemantic + ClickableOriginalSemantic → SegmentPrecomputer.ts
 *
 * This path handles clickable highlighting for the char-only display mode.
 * Both components use SegmentPrecomputer for reliable segment position tracking.
 * Do NOT use groupSegmentsIntoParagraphs from ClickableTranslationOptimized — different paragraph logic.
 */
export { default as ClickableTranslationSemantic } from './ClickableTranslationSemantic';
export { default as ClickableOriginalSemantic } from './ClickableOriginalSemantic';
