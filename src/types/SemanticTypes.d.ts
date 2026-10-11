/**
 * TypeScript type definitions for semantic translation structures
 *
 * These types define the core data structures used throughout the translation system
 * for semantic array processing, position mapping, and clickable highlighting.
 */

/**
 * Consumer map (architecture review 2026-07-30, candidate #5 grilling — corrected from
 * the original "shared dual-consumer contract" framing, which overstated how much of this
 * type both highlighting paths actually touch: verified via direct grep of real readers,
 * most fields are char-only-exclusive, not shared). See src/utils/CLAUDE.md's
 * `buildSegmentsFromPositions`, `addUnit`, and duplicate-word-highlighting gotchas for the
 * specific behavioral failure modes behind originalStart/originalEnd and tokenIndex respectively.
 */
export interface SemanticArrayMetadata {
  index: number; // Internal array-position bookkeeping — not consumed by either UI path
  source: string; // Consumed by: char-only (ClickableOriginalSemantic.tsx, ClickableTranslationSemantic.tsx) AND full-translation (ClickableTranslationOptimized.tsx)
  tokenIndex: number; // Consumed by: BOTH paths, via compareByTokenIndex tie-breaking (TextPositionMapper.ts)
  translatedStart: number; // Consumed by: char-only only (PositionMetadataSegmenter.ts, characterOnlySemanticBuilder setup)
  translatedEnd: number; // Consumed by: char-only only (see translatedStart)
  originalStart: number; // Character position in original Chinese text (-1 if not set). Set by Full Translation's postProcess for the first chunk only (later chunks pass chunk-local tokenIndex, so setPositionByMatch finds no unit); character-only never sets it. Read by precomputeOriginalSegments → buildSegmentsFromPositions
  originalEnd: number; // End position in original Chinese text (-1 if not set). Set and read as originalStart is
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
  metadata: SemanticArrayMetadata[];
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
