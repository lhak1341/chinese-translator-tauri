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
