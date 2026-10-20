/**
 * Translation Engine Type Definitions
 *
 * Comprehensive type definitions for TranslationEngine.js and Translator.jsx
 * covering engine configuration, translation options and progress tracking.
 *
 * Part of Phase 6: JSDoc Integration & Extended Type Definitions
 *
 * @file TranslationEngineTypes.d.ts
 */

import { SemanticArrays } from './SemanticTypes';
import type { WordSegment } from '../utils/highlighting';

// ============================================================================
// Translation Source Strings
// ============================================================================

/** Phase 1 leader source strings (JS adapter + WASM paths) */
type TranslationPhase1Source =
  'pattern' | 'hierarchical_pattern' | 'hierarchical_patterns' | 'hierarchical_patterns_composite';

/** Phase 3 number conversion source strings */
type TranslationPhase3Source = 'number_conversion' | 'number_plus_liang_fix';

/** Phase 4 phrase source string */
type TranslationPhase4Source = 'phrases';

/** Phase 5 character source string */
type TranslationPhase5Source = 'characters';

/**
 * Phase 2: dynamic proper-noun dictionary name, e.g. 'properNouns-MyNovel'.
 * The template literal enforces the required prefix at the type level.
 */
type ProperNounSource = `properNouns-${string}`;

/**
 * All valid leader (non-consumed) translation source strings.
 *
 * INVARIANT: getSourcePriority() returns 999 for any string not matching
 * this type — silently deprioritizing below character-level fallback with
 * no error. Always use this type at translationSource assignment sites.
 */
export type TranslationLeaderSource =
  | TranslationPhase1Source
  | TranslationPhase3Source
  | TranslationPhase4Source
  | TranslationPhase5Source
  | ProperNounSource;

/**
 * All valid consumed-token translation source strings.
 * Consumed tokens have translated === null and source ends with '_consumed'.
 */
type TranslationConsumedSource =
  | `${TranslationPhase1Source}_consumed`
  | `${TranslationPhase3Source}_consumed`
  | `${TranslationPhase4Source}_consumed`
  | `properNouns-${string}_consumed`;

/**
 * All valid translationSource values for pipeline tokens.
 * Use this anywhere a token's translationSource is written or read.
 */
export type TranslationSource = TranslationLeaderSource | TranslationConsumedSource;

// ============================================================================
// Translation Engine Configuration
// ============================================================================

/**
 * Pattern processing settings
 */
export interface PatternProcessingSettings {
  /**
   * Enable two-phase hierarchical pattern processing (Phase 1). `false` skips Phase 1; the engine
   * sets it when WASM pattern matching is unavailable at init or fails repeatedly (ADR-101).
   * (`maxCompositeDetectionTime` and `fallbackToSinglePhase` were removed 2026-10-05: nothing read
   * them. The init option is merged by spread, so a stale key passed in is stored and ignored.)
   */
  enableTwoPhasePatterns: boolean;
}

/**
 * Translation engine initialization options
 */
export interface TranslationEngineInitOptions {
  /** Active proper noun dictionary names */
  activeProperNouns?: string[];
  /** Pattern processing settings */
  patternSettings?: PatternProcessingSettings;
}

// ============================================================================
// Translation Options
// ============================================================================

/**
 * One finished batch of a progressive translation (ADR-105). The engine sends one per batch,
 * unthrottled; text and counts only, never semantic arrays.
 */
export interface BatchCompleteEvent {
  /** The translated text so far, including this batch */
  partialText: string;
  /** Chunks translated so far */
  completedChunks: number;
  /** Translatable chunks in the whole text */
  totalChunks: number;
  /** 1-based batch number */
  batchNumber: number;
  /** Average time per chunk in this batch, ms */
  avgTimePerChunk: number;
}

/**
 * Translation operation options. Only what the engine reads.
 */
export interface TranslationOptions {
  /** Chunk-level formatting switch, set per chunk by the batch loop */
  useChunking?: boolean;

  /** Called once per finished batch */
  onBatchComplete?: (event: BatchCompleteEvent) => void;

  /** Cancels the run between batches */
  abortSignal?: AbortSignal;
}

// ============================================================================
// Translation Results
// ============================================================================

/**
 * Translation statistics and metrics
 */
interface TranslationStats {
  /** Total processing time in milliseconds */
  totalTime: number;
  /** Time per phase in milliseconds */
  phaseTimings?: {
    patterns?: number;
    properNouns?: number;
    numbers?: number;
    phrases?: number;
    characters?: number;
  };
  /** Number of tokens processed */
  tokenCount: number;
  /** Cache hit rate (0-1) */
  cacheHitRate?: number;
  /** WASM acceleration used */
  usedWasm?: boolean;
  /** Memory usage in MB */
  memoryUsed?: number;
}

/**
 * Enhanced translation result with segments
 */
export interface TranslationResult {
  /** Original input text */
  originalText: string;
  /** Final translated text */
  translatedText: string;
  /** Semantic arrays for UI rendering */
  semanticArrays: SemanticArrays;
  /** Pre-built segments for instant rendering */
  prebuiltSegments?: WordSegment[];
  /** Translation statistics */
  stats?: TranslationStats;
}

/**
 * Character-only translation result
 */
export interface CharacterOnlyResult {
  /** Translated text using only character dictionary */
  translatedText: string;
  /** Semantic arrays for character-only translation */
  semanticArrays: SemanticArrays;
  /** Pre-built segments (usually empty for character-only) */
  prebuiltSegments: WordSegment[];
}

// ============================================================================
// Translation Engine Instance Interface
// ============================================================================

/**
 * What callers outside `TranslationEngine.js` use of it — nothing more. The class stays
 * JavaScript, so this is hand-written; `engineConformance.ts` makes `tsc` check it against
 * the class.
 */
export interface TranslationEngine {
  // Initialization
  initialize(
    dictionaries: Record<string, any>,
    options?: TranslationEngineInitOptions
  ): Promise<void>;
  /** Initialized *and* holding usable dictionaries — the gate every call site checks. */
  isReady(): boolean;
  /** Releases tries and WASM handles. Exactly one engine may be live at a time, so the
   * outgoing one is destroyed before its replacement is constructed. */
  destroy(): void;

  // Core Translation Methods
  translateWithSegments(text: string, options?: TranslationOptions): Promise<TranslationResult>;
  translateWithCharactersOnly(
    text: string,
    options?: TranslationOptions
  ): Promise<CharacterOnlyResult>;
}
