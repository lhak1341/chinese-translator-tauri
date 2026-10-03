/**
 * Text processing public API — only what other modules import through the barrel.
 * The tokenizer, chunkers, punctuation and quote processors, normalization helpers and the
 * rest of this directory are imported from their own files.
 *
 * Primary entry points:
 *   - groupSegmentsIntoParagraphs() — paragraph grouping for the clickable panels
 *   - highlightPatternVariables() / PATTERN_VARIABLE_COLORS — pattern variable formatting
 */

// --- Paragraph grouping ---
export { groupSegmentsIntoParagraphs } from './ParagraphGrouping';

// --- Pattern variable formatting ---
export { PATTERN_VARIABLE_COLORS, highlightPatternVariables } from './PatternTextFormatter';
