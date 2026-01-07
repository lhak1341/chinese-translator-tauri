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
  /** Cache size for character dictionary lookups */
  characterCacheSize?: number;
  /** Cache size for phrase dictionary lookups */
  phraseCacheSize?: number;
  /** Cache size for pattern dictionary lookups */
  patternCacheSize?: number;
  /** Enable parallel dictionary lookups for performance */
  enableParallelLookups?: boolean;
  /** Enable WASM acceleration for dictionary operations */
  enableWasm?: boolean;
  /** WASM memory limit in MB */
  wasmMemoryLimit?: number;
}

/**
 * Filter configuration for active dictionaries
 */
export interface DictionaryFilter {
  /** Names of active proper noun dictionaries (e.g., "properNouns-TuChanTheGioi") */
  activeProperNouns: string[];
  /** Include base dictionaries (characters, phrases, patterns, etc.) */
  includeBaseDictionaries?: boolean;
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

/**
 * Memory leak detector configuration
 */
export interface MemoryLeakDetectorConfig {
  /** Enable automatic memory leak detection */
  enabled?: boolean;
  /** Snapshots to retain for analysis */
  maxSnapshots?: number;
  /** Growth rate threshold for leak detection (MB/minute) */
  leakThreshold?: number;
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
  /** Pre-warm translation caches on initialization */
  preWarmCache?: boolean;
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

// ============================================================================
// WASM Integration
// ============================================================================

/**
 * WASM engine status
 */
export interface WasmStatus {
  /** WASM engine initialized successfully */
  initialized: boolean;
  /** Running in fallback mode (JavaScript) */
  fallbackMode: boolean;
  /** Total dictionary entries loaded in WASM */
  totalEntries: number;
  /** WASM memory usage in bytes */
  memoryUsage?: number;
  /** WASM version string */
  wasmVersion?: string;
}

/**
 * WASM acceleration configuration
 */
export interface WasmAccelerationConfig {
  /** Enable WASM for dictionary lookups */
  enableDictionaryLookups?: boolean;
  /** Enable WASM for number processing (Phase 3) */
  enableNumberProcessing?: boolean;
  /** Enable WASM for pattern matching */
  enablePatternMatching?: boolean;
  /** WASM memory pool size in MB */
  memoryPoolSize?: number;
  /** Enable memory pool recycling */
  enableMemoryPooling?: boolean;
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
 * Performance regression health status
 */
export interface RegressionHealthStatus {
  /** Overall health status */
  status: 'healthy' | 'warning' | 'critical';
  /** Number of established baselines */
  totalBaselines: number;
  /** Number of recent alerts */
  recentAlerts: number;
  /** Number of critical alerts */
  criticalAlerts: number;
  /** Number of warning alerts */
  warningAlerts: number;
  /** Optimization recommendations */
  recommendations: string[];
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

/**
 * Advanced performance statistics (detailed)
 */
export interface AdvancedPerformanceStats {
  // Cache details
  cacheHits: number;
  cacheMisses: number;
  cacheSize: number;

  // Memory pool details
  poolEnabled: boolean;
  poolReuseRate: number;
  poolSavedTime: number;
  poolWastedMemory: number;

  // Semantic array details
  semanticEnabled: boolean;
  semanticEfficiency: number;
  semanticUnits: number;
  semanticRegexHitRate: number;

  // Performance details
  totalTime: number;
  opsPerSec: number;
  minTime: number;
  maxTime: number;
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

/**
 * Segment click payload for interactive highlighting
 */
export interface SegmentClickPayload {
  /** Unit index in semantic arrays */
  unitIndex: number;
  /** Click direction */
  direction: 'original-to-translation' | 'translation-to-original' | 'character-only-to-original';
  /** Original text segment */
  originalText: string;
  /** Translated text segment */
  translatedText: string;
  /** Translation source (phase name) */
  source?: string;
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

  // Core Translation Methods
  translate(text: string, options?: TranslationOptions): Promise<string>;
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

  // WASM Integration (number processing only)
  wasmManager: any;

  // Internal State
  translationSegments: TranslationSegment[];
  semanticArrayBuilder: any;
  useOptimizedSemanticBuilder: boolean;

  // Logging
  log(level: DebugLevel, ...args: any[]): void;
}

// ============================================================================
// Configuration File Types
// ============================================================================

/**
 * Saved configuration structure
 */
export interface TranslatorConfiguration {
  /** Active proper noun dictionaries */
  activeProperNouns: string[];
  /** Last used translation mode */
  lastTranslationMode?: TranslationMode;
  /** UI preferences */
  uiPreferences?: {
    textSize?: TextSizeCategory;
    showAdvancedStats?: boolean;
  };
  /** Performance preferences */
  performancePreferences?: {
    enableWasm?: boolean;
    enableWorkers?: boolean;
    maxParallelChunks?: number;
  };
}

/**
 * Configuration load result
 */
export interface ConfigurationLoadResult {
  success: boolean;
  data?: TranslatorConfiguration;
  error?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Token span result for text matching
 */
export interface TokenSpanResult {
  /** Number of tokens consumed */
  consumed: number;
  /** Matched text */
  matchedText?: string;
  /** Match confidence (0-1) */
  confidence?: number;
}

/**
 * Dictionary match result
 */
export interface DictionaryMatch {
  /** Matched word/phrase */
  word: string;
  /** Translation */
  translation: string;
  /** Dictionary name */
  dictionary?: string;
  /** Match length in characters */
  length: number;
  /** Match confidence (0-1) */
  confidence?: number;
}

/**
 * Position mapping builder result
 */
export interface PositionMappingBuilderResult {
  /** Position mapping for viewport optimization */
  mapping: TextPositionMapping;
  /** Build time in milliseconds */
  buildTime: number;
  /** Whether the mapping was cached */
  cached: boolean;
}
