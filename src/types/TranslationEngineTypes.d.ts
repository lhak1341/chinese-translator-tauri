/**
 * Translation Engine Type Definitions
 *
 * Comprehensive type definitions for TranslationEngine.js and Translator.jsx
 * covering engine configuration, translation options, progress tracking, and
 * performance monitoring.
 *
 * Part of Phase 6: JSDoc Integration & Extended Type Definitions
 *
 * @file TranslationEngineTypes.d.ts
 */

import { SemanticArrays } from './SemanticTypes';
import { TextPositionMapping } from './ViewportTypes';

// ============================================================================
// Translation Source Strings
// ============================================================================

/** Phase 1 leader source strings (JS adapter + WASM paths) */
export type TranslationPhase1Source =
  'pattern' | 'hierarchical_pattern' | 'hierarchical_patterns' | 'hierarchical_patterns_composite';

/** Phase 3 number conversion source strings */
export type TranslationPhase3Source = 'number_conversion' | 'number_plus_liang_fix';

/** Phase 4 phrase source string */
export type TranslationPhase4Source = 'phrases';

/** Phase 5 character source string */
export type TranslationPhase5Source = 'characters';

/**
 * Phase 2: dynamic proper-noun dictionary name, e.g. 'properNouns-MyNovel'.
 * The template literal enforces the required prefix at the type level.
 */
export type ProperNounSource = `properNouns-${string}`;

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
export type TranslationConsumedSource =
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
// Debug and Logging Configuration
// ============================================================================

/**
 * Debug levels for translation engine logging
 */
export const DEBUG_LEVELS: {
  ERROR: 0;
  INFO: 1;
  DEBUG: 2;
  VERBOSE: 3;
};

export type DebugLevel = (typeof DEBUG_LEVELS)[keyof typeof DEBUG_LEVELS];

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

/**
 * Configuration for EnhancedDictionaryManager
 */
export interface DictionaryManagerConfig {
  /** Enable dictionary result caching */
  cacheEnabled?: boolean;
  /** Enable WASM acceleration for dictionary operations */
  enableWasm?: boolean;
  /** WASM memory limit in MB */
  wasmMemoryLimit?: number;
}

// ============================================================================
// Memory Management Configuration
// ============================================================================

/**
 * Smart memory pressure detection thresholds
 */
export interface MemoryPressureThresholds {
  /** Low memory pressure threshold (0-1) - default 0.6 */
  lowPressure: number;
  /** Medium memory pressure threshold (0-1) - default 0.75 */
  mediumPressure: number;
  /** High memory pressure threshold (0-1) - default 0.85 */
  highPressure: number;
  /** Critical memory pressure threshold (0-1) - default 0.95 */
  criticalPressure: number;
  /** Memory sampling interval in milliseconds - default 10000 */
  samplingInterval: number;
  /** Memory growth rate threshold in MB/minute - default 15 */
  growthThreshold: number;
}

/**
 * Memory cleanup urgency levels
 */
export type MemoryCleanupUrgency = 'low' | 'medium' | 'high' | 'critical' | 'emergency';

/**
 * Memory cleanup event data
 */
export interface MemoryCleanupEvent {
  /** Cleanup urgency level */
  urgency: MemoryCleanupUrgency;
  /** Current memory pressure state */
  pressure: {
    level: 'low' | 'medium' | 'high' | 'critical';
    ratio: number;
  };
  /** Memory growth rate in MB/minute */
  growthRate: number;
}

/**
 * Memory tracker snapshot data
 */
export interface MemorySnapshot {
  /** Snapshot timestamp */
  timestamp: number;
  /** Heap used in bytes */
  heapUsed: number;
  /** Heap total in bytes */
  heapTotal: number;
  /** Heap limit in bytes */
  heapLimit: number;
  /** Memory usage ratio (0-1) */
  ratio: number;
  /** Additional metadata */
  metadata?: {
    phase?: string;
    batchSize?: number;
    processedChunks?: number;
    [key: string]: any;
  };
}

// ============================================================================
// Translation Engine Configuration
// ============================================================================

/**
 * Pattern processing settings
 */
export interface PatternProcessingSettings {
  /** Enable two-phase hierarchical pattern processing */
  enableTwoPhasePatterns: boolean;
  /** Maximum time for composite pattern detection in milliseconds */
  maxCompositeDetectionTime: number;
  /** Fallback to single-phase processing if two-phase fails */
  fallbackToSinglePhase: boolean;
}

/**
 * Semantic array builder configuration
 */
export interface SemanticArrayBuilderConfig {
  /** Use optimized semantic array builder */
  useOptimized?: boolean;
  /** Initial capacity for arrays */
  initialCapacity?: number;
  /** Enable capacity auto-growth */
  enableAutoGrowth?: boolean;
}

/**
 * Translation engine initialization options
 */
export interface TranslationEngineInitOptions {
  /** Dictionary priorities for 5-phase processing */
  priorities?: DictionaryPriorities;
  /** Active proper noun dictionary names */
  activeProperNouns?: string[];
  /** Debug logging level */
  debugLevel?: DebugLevel;
  /** Dictionary manager configuration */
  dictionaryManager?: DictionaryManagerConfig;
  /** Memory pressure thresholds */
  memoryPressure?: MemoryPressureThresholds;
  /** Pattern processing settings */
  patternSettings?: PatternProcessingSettings;
  /** Semantic array builder configuration */
  semanticBuilder?: SemanticArrayBuilderConfig;
}

// ============================================================================
// Translation Options
// ============================================================================

/**
 * Translation mode types
 */
export type TranslationMode =
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

  /** Use shared lookup index for optimization */
  useSharedLookupIndex?: boolean;

  /** Pre-computed lookup index for character dictionary */
  lookupIndex?: any;

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
 * Translation segment for clickable highlighting
 */
export interface TranslationSegment {
  /** Original text segment */
  originalSegment: string;
  /** Translated text segment */
  translatedSegment: string;
  /** Source dictionary/phase name */
  source: string;
  /** Start position in original text */
  originalStart: number;
  /** End position in original text */
  originalEnd: number;
  /** Start position in translated text */
  translatedStart: number;
  /** End position in translated text */
  translatedEnd: number;
  /** Segment metadata */
  metadata?: {
    phase?: string;
    dictionaryName?: string;
    confidence?: number;
    [key: string]: any;
  };
}

/**
 * Translation statistics and metrics
 */
export interface TranslationStats {
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
  /** Translation segments for clickable highlighting */
  segments: TranslationSegment[];
  /** Semantic arrays for UI rendering */
  semanticArrays: SemanticArrays;
  /** Pre-built segments for instant rendering */
  prebuiltSegments?: TranslationSegment[];
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
  prebuiltSegments: TranslationSegment[];
}

// ============================================================================
// Performance Monitoring
// ============================================================================

/**
 * Engine performance statistics
 */
export interface EngineStats {
  /** Total translations performed */
  totalTranslations: number;
  /** Average translation time in milliseconds */
  averageTime: number;
  /** Fastest translation time */
  minTime: number;
  /** Slowest translation time */
  maxTime: number;
  /** Cache statistics */
  cacheStats?: {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
  };
  /** Dictionary statistics */
  dictionaryStats?: {
    [dictionaryName: string]: {
      entries: number;
      lookups: number;
      hitRate: number;
    };
  };
  /** Memory statistics */
  memoryStats?: {
    currentUsage: number;
    peakUsage: number;
    averageUsage: number;
  };
}

/**
 * Batch performance metrics
 */
export interface BatchPerformanceMetrics {
  /** Batch index */
  batchIndex: number;
  /** Batch size (number of chunks) */
  batchSize: number;
  /** Total batch processing time */
  totalTime: number;
  /** Average time per chunk */
  avgTimePerChunk: number;
  /** Memory snapshot before processing */
  memoryBefore: number;
  /** Memory snapshot after processing */
  memoryAfter: number;
  /** Memory delta (growth) */
  memoryDelta: number;
}

/**
 * Performance statistics for UI display
 */
export interface PerformanceStats {
  /** Translation throughput in tokens/second */
  tokensPerSecond: number;
  /** Average translation time in milliseconds */
  averageTranslationTime: number;
  /** Cache hit rate percentage (0-100) */
  cacheHitRate: number;
  /** Memory usage in MB */
  memoryUsage: number;
  /** WASM acceleration enabled */
  wasmEnabled: boolean;
  /** Worker parallelization enabled */
  workersEnabled: boolean;
}

// ============================================================================
// UI and Interaction Types
// ============================================================================

/**
 * Text size categories for virtualization thresholds
 */
export type TextSizeCategory = 'small' | 'medium' | 'large' | 'huge';

/**
 * Virtualization threshold configuration
 */
export interface VirtualizationThresholds {
  /** Threshold for huge text (number of segments) */
  huge: number;
  /** Threshold for large text (number of segments) */
  large: number;
  /** Threshold for medium text (number of segments) */
  medium: number;
}

/**
 * Highlighting state for interactive text
 */
export interface HighlightingState {
  /** Highlighted unit index in original text */
  unitIndex: number;
  /** Highlighted unit index in translation text */
  translationUnitIndex: number;
  /** Highlighted unit index in character-only text */
  characterOnlyUnitIndex: number;
  /** Whether the click originated from character-only view */
  isCharacterOnlyClick: boolean;
}

/**
 * Highlighting reducer actions
 */
export type HighlightingAction =
  | { type: 'HIGHLIGHT_ORIGINAL'; unitIndex: number }
  | { type: 'HIGHLIGHT_TRANSLATION'; unitIndex: number }
  | { type: 'HIGHLIGHT_FROM_CHARACTER_ONLY'; unitIndex: number }
  | { type: 'HIGHLIGHT_BOTH'; unitIndex: number }
  | { type: 'SET_CHARACTER_ONLY_INDEX'; unitIndex: number | number[] }
  | { type: 'CLEAR_ALL' };

/**
 * Scroll position for preserving viewport during reloads
 */
export interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

/**
 * Saved scroll positions for all text panels
 */
export interface SavedScrollPositions {
  original: ScrollPosition;
  translation: ScrollPosition;
  characterOnly: ScrollPosition;
}

// ============================================================================
// Streaming Translation State
// ============================================================================

/**
 * Streaming translation state
 */
export interface StreamingTranslationState {
  /** Current streaming translation text */
  text: string;
  /** Is currently streaming */
  isStreaming: boolean;
  /** Stream start timestamp */
  startTime?: number;
  /** Stream progress percentage */
  progress?: number;
}

/**
 * Progress info for streaming display
 */
export interface ProgressInfo {
  /** Current progress percentage (0-100) */
  percentage: number;
  /** Chunks processed */
  processedChunks: number;
  /** Total chunks */
  totalChunks: number;
  /** Current batch being processed */
  currentBatch?: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
}

// ============================================================================
// Translation Engine Instance Interface
// ============================================================================

/**
 * Translation Engine instance interface
 * Main interface for TranslationEngine.js
 */
export interface TranslationEngine {
  // Initialization
  isInitialized: boolean;
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
  translateWithProgressiveBatches(
    text: string,
    options: TranslationOptions
  ): Promise<TranslationResult>;

  // Dictionary Management
  syncDictionaries(): Promise<void>;

  // Memory Management
  performEmergencyCleanup(): void;
  performHighPriorityCleanup(): void;
  startMemoryProfiling(operationName: string, operationId?: string): string | null;
  completeMemoryProfiling(profileId: string, metadata?: Record<string, any>): any;
  getSmartMemoryStats(): any;

  // Statistics and Monitoring
  getEngineStats(): EngineStats;

  // Configuration
  debugLevel: DebugLevel;
  settings: PatternProcessingSettings;
  activeProperNouns: string[];

  // Internal State
  translationSegments: TranslationSegment[];
  semanticArrayBuilder: any;

  // Logging
  log(level: DebugLevel, ...args: any[]): void;
}
