/**
 * TypeScript type definitions for semantic translation structures
 *
 * These types define the core data structures used throughout the translation system
 * for semantic array processing, position mapping, and clickable highlighting.
 */

/**
 * Metadata for a single semantic unit in the translation
 */
export interface SemanticMetadata {
  /** Source of the translation: 'pattern', 'proper-noun', 'phrase', 'character', etc. */
  source: string;

  /** Translation phase that produced this unit: 1-5 corresponding to 5-phase architecture */
  phase?: number;

  /** Dictionary that provided the translation */
  dictionary?: string;

  /** Original token index in the source text */
  tokenIndex?: number;

  /** Confidence score for the translation (0-1) */
  confidence?: number;

  /** Pattern information if translated via semantic pattern */
  pattern?: string;

  /** Variable assignments if this is part of a pattern match */
  variables?: Record<string, string>;

  /** Whether this unit is protected by Phase A (hierarchical pattern) */
  protectedByPhaseA?: boolean;

  /** Phase A result if this token was matched in Phase A */
  phaseAResult?: {
    originalText: string;
    pattern?: {
      originalPattern: string;
    };
  };

  /** Position mapping: Start position in translated text (set by setPositionByMatch) */
  translatedStart?: number;

  /** Position mapping: End position in translated text (set by setPositionByMatch) */
  translatedEnd?: number;
}

/**
 * Complete semantic arrays structure used throughout the translation system
 *
 * These arrays must always maintain synchronized lengths for proper position mapping
 * and clickable highlighting. Any mismatch will break bidirectional highlighting.
 */
export interface SemanticArrays {
  /** Array of original text segments (Chinese) */
  original: string[];

  /** Array of translated text segments (Vietnamese) */
  translated: string[];

  /** Array of metadata for each semantic unit */
  metadata: SemanticMetadata[];
}

/**
 * Translation options passed through the 5-phase translation pipeline
 */
export interface TranslationOptions {
  /** Active proper noun dictionary names to use */
  activeProperNouns?: string[];

  /** Debug verbosity level: 0=off, 1=errors, 2=warnings, 3=info, 4=debug */
  debugLevel?: 0 | 1 | 2 | 3 | 4;

  /** Enable text chunking for large texts */
  useChunking?: boolean;

  /** Enable progressive translation with streaming results */
  progressive?: boolean;

  /** Progress callback for streaming translation updates */
  onProgress?: (data: ProgressData) => void;

  /** Force JavaScript engine instead of WASM acceleration */
  forceJavaScript?: boolean;

  /** Disable all caching mechanisms */
  disableCache?: boolean;

  /** Character offset for chunked translation (internal) */
  chunkOffset?: number;

  /** Chunk index for parallel processing (internal) */
  chunkIndex?: number;

  /** Whether this is a parallel chunk processing call (internal) */
  isParallelChunk?: boolean;

  /** Enable profiling and performance tracking */
  enableProfiling?: boolean;
}

/**
 * Progress data structure for streaming translation callbacks
 */
export interface ProgressData {
  /** Current translation result (may be partial) */
  translatedText: string;

  /** Current semantic arrays (may be incomplete) */
  semanticArrays: SemanticArrays;

  /** Number of chunks processed so far */
  processedChunks: number;

  /** Total number of chunks to process */
  totalChunks: number;

  /** Current batch being processed */
  currentBatch?: number;

  /** Total number of batches */
  totalBatches?: number;

  /** Estimated completion percentage (0-100) */
  percentComplete?: number;

  /** Whether translation is complete */
  isComplete: boolean;
}

/**
 * Translation segment for clickable highlighting
 *
 * Segments map positions between original and translated text,
 * enabling bidirectional highlighting when clicking on text.
 */
export interface TranslationSegment {
  /** Unique segment identifier */
  id: string;

  /** Original Chinese text */
  originalText: string;

  /** Translated Vietnamese text */
  translatedText: string;

  /** Character start position in original text */
  originalStart: number;

  /** Character end position in original text */
  originalEnd: number;

  /** Character start position in translated text */
  translatedStart: number;

  /** Character end position in translated text */
  translatedEnd: number;

  /** Translation source: 'pattern', 'properNouns', 'phrase', 'character' */
  translationSource: string;

  /** Source dictionary name */
  sourceDict: string;

  /** Array of token indices covered by this segment */
  tokenIndices: number[];

  /** Whether this is a proper noun translation */
  isProperNoun: boolean;

  /** Additional metadata */
  metadata: Record<string, any>;

  /** Pattern information if translated via semantic pattern */
  pattern?: string;
}

/**
 * Pattern match result from semantic pattern processor
 */
export interface PatternMatchResult {
  /** Whether the pattern matched successfully */
  success: boolean;

  /** The pattern that matched */
  pattern?: {
    originalPattern: string;
    template: string;
    tokens: Array<{ type: 'literal' | 'variable'; value?: string; name?: string }>;
    metadata: {
      allowedVariableTypes?: Record<string, string[]>;
      lowPriority?: boolean;
    };
  };

  /** Variable assignments from the match */
  variables?: Record<string, string>;

  /** Translation result from applying the template */
  result?: string;

  /** Tokens that were matched */
  matchedTokens?: Array<{ value: string; protectedByPhaseA?: boolean }>;

  /** Starting position in token array */
  startPosition?: number;

  /** Ending position in token array */
  endPosition?: number;

  /** Time taken to perform the match (ms) */
  matchTime?: number;

  /** Reason for match failure */
  reason?: string;
}

/**
 * Dictionary match result
 */
export interface DictionaryMatch {
  /** Matched word/phrase */
  word: string;

  /** Translation */
  translation: string;

  /** Source dictionary name */
  dictionary: string;

  /** Match metadata */
  metadata?: {
    phase?: number;
    confidence?: number;
    pattern?: string;
  };
}

/**
 * Token structure used in translation processing
 */
export interface Token {
  /** Token text value */
  value: string;

  /** Token type: 'character', 'word', 'punctuation', etc. */
  type?: string;

  /** Character position in original text */
  position?: number;

  /** Whether this token is protected by Phase A */
  protectedByPhaseA?: boolean;

  /** Phase A result if protected */
  phaseAResult?: {
    originalText: string;
    translation: string;
    pattern?: {
      originalPattern: string;
    };
  };
}
