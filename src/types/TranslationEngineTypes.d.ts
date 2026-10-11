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
// Dictionary Configuration
// ============================================================================

/**
 * Dictionary priorities for 5-phase translation processing
 * Lower numbers = higher priority
 */
export interface DictionaryPriorities {
  /** Phase 2: Proper noun translation */
  properNouns: number;
  /** Phase 1: Pattern-based translation */
  patterns: number;
  /** Phase 4: Common phrase translation */
  phrases: number;
  /** Phase 5: Character-level translation */
  characters: number;
  /** Punctuation and symbol translation */
  punctuation: number;
  /** Text conversion (traditional/simplified) */
  conversion: number;
}

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
  /** Dictionary priorities for 5-phase processing */
  priorities?: DictionaryPriorities;
  /** Active proper noun dictionary names */
  activeProperNouns?: string[];
  /** Pattern processing settings */
  patternSettings?: PatternProcessingSettings;
}

// ============================================================================
// Translation Options
// ============================================================================

/**
 * Translation mode types
 */
type TranslationMode =
  | 'full' // All 5 phases
  | 'character-only' // Phase 5 only
  | 'patterns-only' // Phase 1 only
  | 'proper-nouns-only'; // Phase 2 only

/**
 * Progress callback data structure
 */
export interface TranslationProgressData {
  /** Current progress percentage (0-100) */
  percentage: number;
  /** Number of chunks processed */
  processedChunks: number;
  /** Total chunks to process */
  totalChunks: number;
  /** Current partial translation text */
  currentText: string;
  /** Partial semantic arrays (streaming translation) */
  partialSemanticArrays?: SemanticArrays;
  /** Current batch number */
  batchNumber?: number;
  /** Time elapsed in milliseconds */
  elapsedTime?: number;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/**
 * Translation operation options
 */
export interface TranslationOptions {
  /** Translation mode - defaults to 'full' */
  translationMode?: TranslationMode;

  /** Enable chunk-based progressive translation - default true */
  useChunking?: boolean;

  /** Force JavaScript fallback (disable WASM acceleration) */
  forceJavaScript?: boolean;

  /** Enable progressive batch processing with streaming results */
  progressive?: boolean;

  /** Progress callback for streaming translation */
  onProgress?: (progress: TranslationProgressData) => void;

  /** Disable translation result caching */
  disableCache?: boolean;

  /** Custom dictionary priorities override */
  customPriorities?: Partial<DictionaryPriorities>;

  /** Enable/disable specific phases */
  enabledPhases?: {
    patterns?: boolean;
    properNouns?: boolean;
    numbers?: boolean;
    phrases?: boolean;
    characters?: boolean;
  };

  /** Maximum parallel chunks to process */
  maxParallelChunks?: number;

  /** Memory cleanup threshold in MB */
  memoryCleanupThreshold?: number;
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
