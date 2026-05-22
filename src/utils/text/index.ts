/**
 * Text processing public API.
 *
 * Primary entry points:
 *   - createTokenizer() — character-level tokenization
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
export {
  TokenType,
  Token,
  TextTokenizer,
  createTokenizer,
  tokenTypeToString,
} from './TextTokenizer';

// --- Chunking ---
export { TextChunk, TextChunker, createChunker } from './TextChunker';
export { adaptiveChunker } from './AdaptiveChunker';

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
