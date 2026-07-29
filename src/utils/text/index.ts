/**
 * Text processing public API.
 *
 * Primary entry points:
 *   - new TextTokenizer() — character-level tokenization
 *   - createChunker()   — punctuation-based text segmentation
 *   - sanitizeDictionaryEntry() — user input sanitization
 */

// --- Tokenization ---
export type {
  GroupedToken,
  TokenGroups,
  PhraseCandidate,
  TextComplexity,
  ProcessingStrategy,
  TextAnalysis,
} from './TextTokenizer';
export { TokenType, Token, TextTokenizer } from './TextTokenizer';

// --- Chunking ---
export { TextChunk, TextChunker, createChunker } from './TextChunker';
export { ChunkPostProcessor } from './ChunkPostProcessor';
export { adaptiveChunker } from './AdaptiveChunker';
export type {
  AdaptiveBatchSizerInput,
  AdaptiveBatchSizerLogEntry,
  AdaptiveBatchSizerResult,
} from './AdaptiveBatchSizer';
export { calculateNextBatchSize } from './AdaptiveBatchSizer';

// --- Normalization ---
export {
  normalizeVietnameseText,
  normalizeVietnameseTexts,
  isNFC,
  getNormalizationStats,
} from './TextNormalizationHelpers';

// --- Sanitization ---
export { sanitizeDictionaryEntry } from './TextSanitization';

// --- Paragraph grouping ---
export type { Segment } from './ParagraphGrouping';
export { groupSegmentsIntoParagraphs } from './ParagraphGrouping';

// --- Punctuation ---
export type {
  PunctuationCategory,
  UnicodePunctuationConfig,
  CharacterInfo,
  CategoryInfo,
} from './UnicodePunctuationDetector';
export { UnicodePunctuationDetector } from './UnicodePunctuationDetector';

export type { PunctuationComponents, PunctuationDebugInfo } from './PunctuationProcessor';
export { PunctuationProcessor } from './PunctuationProcessor';

// --- Proper noun capitalization ---
export { buildProperNounCapitalizationMap } from './ProperNounCapitalizationMap';

// --- Quote handling ---
export type { QuoteTypeName, NormalizeTarget, QuoteInfo } from './QuoteProcessor';
export { QUOTE_TYPES, QUOTE_CATEGORIES, QuoteProcessor } from './QuoteProcessor';

// --- Pattern variable formatting ---
export { PATTERN_VARIABLE_COLORS, highlightPatternVariables } from './PatternTextFormatter';
