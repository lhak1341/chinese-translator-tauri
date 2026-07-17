/**
 * Viewport & Position Mapping Type Definitions
 *
 * Type definitions for viewport optimization and position mapping systems:
 * - ViewportSegmentComputer: Basic viewport-based segment computation (50ms vs 6800ms)
 * - ViewportSegmentComputerEnhanced: Web Worker acceleration (~20ms with workers)
 *
 * Performance Impact: 98.5% faster initial rendering through viewport optimization
 *
 * These types enable JSDoc integration for full IDE support without migrating performance-critical code.
 */

import type { SemanticArrays, SemanticMetadata } from './SemanticTypes';

// =============================================================================
// Core Position Mapping Types
// =============================================================================

/**
 * Semantic range for position mapping
 * Lightweight representation of semantic units in text
 */
export interface SemanticRange {
  /** Start position in translated text */
  startPos: number;
  /** End position in translated text */
  endPos: number;
  /** Unit index in semantic arrays */
  unitIndex: number;
  /** Original Chinese text */
  originalText: string;
  /** Translated Vietnamese text */
  translatedText: string;
  /** Translation source (pattern, phrase, character, etc.) */
  source: string;
  /** Full semantic metadata */
  metadata: SemanticMetadata;
}

/**
 * Text position mapping result
 * Fast mapping structure for viewport-based rendering
 */
export interface TextPositionMapping {
  /** Total text length */
  textLength: number;
  /** Semantic ranges for position lookup */
  semanticRanges: SemanticRange[];
  /** Full translated text */
  fullText: string;
  /** Computation statistics */
  stats: PositionMappingStats;
  /** Acceleration information (if accelerated) */
  accelerationInfo?: AccelerationInfo;
}

/**
 * Position mapping computation statistics
 */
export interface PositionMappingStats {
  /** Time to compute position mapping (ms) */
  computeTime: number;
  /** Number of semantic ranges computed */
  rangeCount: number;
  /** Whether Web Worker was used */
  usedWorker?: boolean;
  /** Worker communication overhead (ms) */
  workerTime?: number;
  /** Fallback reason if strategy failed */
  fallbackReason?: string;
  /** Reason for skipping optimization */
  skipReason?: string;
}

/**
 * Acceleration information for position mapping
 */
export interface AccelerationInfo {
  /** Strategy used for acceleration */
  strategy: 'wasm' | 'worker' | 'main_thread' | 'fallback';
  /** Reason for choosing this strategy */
  reason: string;
  /** Input text length */
  textLength: number;
  /** Number of ranges computed */
  rangeCount: number;
  /** Time spent on computation (ms) */
  computeTime?: number;
  /** Total time including overhead (ms) */
  totalTime?: number;
  /** Validation result (if strict validation enabled) */
  validationResult?: ValidationResult;
}

// =============================================================================
// Viewport Segment Types
// =============================================================================

/**
 * Segment computed for viewport rendering
 * Can be clickable semantic segment or non-clickable text
 */
export interface ViewportSegment {
  /** Segment type */
  type: 'semantic' | 'text';
  /** Text content of segment */
  text: string;
  /** Start position in full text */
  start: number;
  /** End position in full text */
  end: number;
  /** Unit index (-1 for non-semantic) */
  unitIndex: number;
  /** Whether this segment is clickable */
  isClickable: boolean;
  /** Original text (for clickable segments) */
  originalText?: string;
  /** Translated text (for clickable segments) */
  translatedText?: string;
  /** Translation source (for clickable segments) */
  source?: string;
  /** Semantic metadata (for clickable segments) */
  metadata?: SemanticMetadata;
}

/**
 * Text range for viewport computation
 */
export interface TextRange {
  /** Start character position */
  textStart: number;
  /** End character position */
  textEnd: number;
  /** Start line index (optional) */
  startLineIndex?: number;
  /** End line index (optional) */
  endLineIndex?: number;
}

/**
 * Unit match result from text search
 */
export interface UnitMatchResult {
  /** Whether unit was found */
  found: boolean;
  /** Offset position if found */
  offset: number;
}

// =============================================================================
// Cache Statistics Types
// =============================================================================

/**
 * Viewport segment cache statistics
 */
export interface ViewportCacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of computations performed */
  computations: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Current cache size */
  cacheSize: number;
  /** Worker cache hits (enhanced only) */
  workerHits?: number;
  /** Main thread cache hits (enhanced only) */
  mainThreadHits?: number;
}

/**
 * Content-aware cache statistics
 */
export interface ContentAwareCacheStats {
  /** Exact content hash hits */
  exactHits: number;
  /** Similarity-based hits (disabled in v3) */
  similarityHits: number;
  /** Cache misses */
  misses: number;
  /** Number of stores */
  stores: number;
  /** Total lookups */
  totalLookups: number;
  /** Overall hit rate (percentage) */
  hitRate: number;
  /** Average compute time saved per hit (ms) */
  avgComputeTimeSaved: number;
  /** Total hits (exact + similarity) */
  totalHits: number;
  /** Exact hit rate (percentage) */
  exactHitRate: number;
  /** Similarity hit rate (percentage) */
  similarityHitRate: number;
  /** Main cache size */
  cacheSize: number;
  /** Similarity cache size */
  similarityCacheSize: number;
  /** Estimated total time saved (ms) */
  estimatedTimeSaved: number;
}

/**
 * Cache entry for position mapping
 */
export interface PositionMappingCacheEntry {
  /** Cached position mapping */
  positionMapping: TextPositionMapping;
  /** Timestamp when cached */
  timestamp: number;
  /** Text length (for validation) */
  textLength: number;
  /** Content signature (for similarity matching) */
  contentSignature?: ContentSignature;
}

/**
 * Content signature for similarity detection
 */
export interface ContentSignature {
  /** Character frequency signature */
  signature: string;
  /** Text length */
  length: number;
  /** Word count */
  wordCount: number;
  /** Average word length */
  avgWordLength: number;
}

// =============================================================================
// Performance Statistics Types
// =============================================================================

/**
 * Enhanced viewport segment computer performance stats
 */
export interface EnhancedPerformanceStats {
  /** Time spent on position mapping (ms) */
  positionMappingTime: number;
  /** Time spent on segment computation (ms) */
  segmentComputationTime: number;
  /** Time spent on cache operations (ms) */
  cacheOperationTime: number;
  /** Time spent on worker communication (ms) */
  workerCommunicationTime: number;
}

/**
 * Accelerated position mapper performance stats
 */
export interface AcceleratedPerformanceStats {
  /** Total number of operations */
  totalOperations: number;
  /** Number of WASM operations */
  wasmOperations: number;
  /** Number of worker operations */
  workerOperations: number;
  /** Number of main thread operations */
  mainThreadOperations: number;
  /** Total time spent (ms) */
  totalTime: number;
  /** Average time per operation (ms) */
  averageTime: number;
}

/**
 * Combined statistics from accelerated mapper
 */
export interface AcceleratedMapperStats {
  /** Performance statistics */
  performanceStats: AcceleratedPerformanceStats;
  /** Cache statistics */
  cacheStats: ContentAwareCacheStats;
  /** Configuration */
  configuration: AccelerationConfiguration;
  /** Optimization recommendations */
  recommendations: string[];
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * ViewportSegmentComputer options
 */
export interface ViewportSegmentComputerOptions {
  /** Maximum cache size */
  maxCacheSize?: number;
}

/**
 * ViewportSegmentComputerEnhanced options
 */
export interface ViewportSegmentComputerEnhancedOptions {
  /** Enable Web Workers */
  useWorkers?: boolean;
  /** Minimum text length for worker usage */
  workerThreshold?: number;
  /** Maximum cache size */
  maxCacheSize?: number;
}

/**
 * AcceleratedPositionMapper options
 */
export interface AcceleratedPositionMapperOptions {
  /** Enable WASM acceleration */
  useWasm?: boolean;
  /** Enable Web Workers */
  useWorkers?: boolean;
  /** Minimum text length for WASM usage */
  wasmThreshold?: number;
  /** Minimum text length for worker usage */
  workerThreshold?: number;
  /** Enable strict validation in development */
  strictValidation?: boolean;
}

/**
 * Acceleration configuration (runtime)
 */
export interface AccelerationConfiguration {
  /** Whether WASM is enabled */
  useWasm: boolean;
  /** Whether Web Workers are enabled */
  useWorkers: boolean;
  /** WASM threshold (chars) */
  wasmThreshold: number;
  /** Worker threshold (chars) */
  workerThreshold: number;
  /** Strict validation enabled */
  strictValidation: boolean;
}

// =============================================================================
// Strategy Selection Types
// =============================================================================

/**
 * Acceleration strategy for position mapping
 */
export interface AccelerationStrategy {
  /** Strategy type */
  type: 'wasm' | 'worker' | 'main_thread';
  /** Reason for selecting this strategy */
  reason: string;
  /** Estimated performance benefit */
  estimatedSpeedup?: number;
}

/**
 * Strategy selection criteria
 */
export interface StrategySelectionCriteria {
  /** Text length */
  textLength: number;
  /** Number of semantic units */
  semanticCount: number;
  /** WASM availability */
  wasmAvailable: boolean;
  /** Worker availability */
  workerAvailable: boolean;
  /** User configuration */
  config: AccelerationConfiguration;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation result for position mapping
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors (if any) */
  errors: ValidationError[];
  /** Validation warnings (if any) */
  warnings: ValidationWarning[];
  /** Time spent on validation (ms) */
  validationTime: number;
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Error type */
  type: 'missing_range' | 'incorrect_position' | 'text_mismatch' | 'metadata_error';
  /** Error message */
  message: string;
  /** Unit index where error occurred */
  unitIndex?: number;
  /** Expected value */
  expected?: any;
  /** Actual value */
  actual?: any;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Warning type */
  type: 'position_drift' | 'performance' | 'cache_inefficiency';
  /** Warning message */
  message: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
}

// =============================================================================
// Prewarming Types
// =============================================================================

/**
 * Cache prewarm position
 */
export interface PrewarmPosition {
  /** Start character position */
  start: number;
  /** End character position */
  end: number;
}

/**
 * Prewarm configuration
 */
export interface PrewarmConfiguration {
  /** Total text length */
  textLength: number;
  /** Typical viewport size (chars) */
  viewportSize: number;
  /** Positions to prewarm */
  positions: PrewarmPosition[];
}

// =============================================================================
// Worker Communication Types
// =============================================================================

/**
 * Worker message for position mapping
 */
export interface WorkerPositionMappingMessage {
  /** Message type */
  type: 'createPositionMapping' | 'computeSegments';
  /** Request ID */
  requestId: string;
  /** Input data */
  data: WorkerPositionMappingData;
}

/**
 * Worker position mapping data
 */
export interface WorkerPositionMappingData {
  /** Full translated text */
  text: string;
  /** Semantic arrays */
  semanticArrays: SemanticArrays;
  /** Text range (for segment computation) */
  textRange?: TextRange;
}

/**
 * Worker response message
 */
export interface WorkerResponseMessage {
  /** Request ID */
  requestId: string;
  /** Whether operation succeeded */
  success: boolean;
  /** Result data */
  result?: TextPositionMapping | ViewportSegment[];
  /** Error message (if failed) */
  error?: string;
  /** Computation time (ms) */
  computeTime: number;
}

// =============================================================================
// Optimization Recommendation Types
// =============================================================================

/**
 * Optimization recommendation
 */
export interface OptimizationRecommendation {
  /** Recommendation type */
  type: 'threshold' | 'cache' | 'worker' | 'wasm' | 'general';
  /** Priority level */
  priority: 'low' | 'medium' | 'high';
  /** Recommendation message */
  message: string;
  /** Suggested action */
  action?: string;
  /** Expected improvement */
  expectedImprovement?: string;
}

// =============================================================================
// Class Interface Types (for JSDoc)
// =============================================================================

/**
 * ViewportSegmentComputer class interface
 */
export interface ViewportSegmentComputerInterface {
  /** Segment cache */
  segmentCache: Map<string, ViewportSegment[]>;
  /** Semantic range map */
  semanticRangeMap: TextPositionMapping | null;
  /** Cache statistics */
  cacheStats: ViewportCacheStats;

  /** Create text position mapping */
  createTextPositionMapping(text: string, semanticArrays: SemanticArrays): TextPositionMapping;
  /** Compute segments for text range */
  computeSegmentsForTextRange(textStart: number, textEnd: number): ViewportSegment[];
  /** Find unit in text */
  findUnitInText(searchText: string, unit: string): UnitMatchResult;
  /** Normalize text for matching */
  normalizeText(text: string): string;
  /** Get cache statistics */
  getCacheStats(): ViewportCacheStats;
  /** Clear cache */
  clearCache(): void;
  /** Prewarm cache */
  prewarmCache(textLength: number, viewportSize?: number): void;
}

/**
 * ViewportSegmentComputerEnhanced class interface
 */
export interface ViewportSegmentComputerEnhancedInterface extends ViewportSegmentComputerInterface {
  /** Enable/disable Web Workers */
  useWorkers: boolean;
  /** Worker threshold (chars) */
  workerThreshold: number;
  /** Performance statistics */
  performanceStats: EnhancedPerformanceStats;

  /** Create text position mapping (async for workers) */
  createTextPositionMapping(
    text: string,
    semanticArrays: SemanticArrays
  ): Promise<TextPositionMapping>;
  /** Compute segments for text range (async for workers) */
  computeSegmentsForTextRange(textStart: number, textEnd: number): Promise<ViewportSegment[]>;
  /** Set worker enabled */
  setWorkerEnabled(enabled: boolean): void;
  /** Get performance stats */
  getPerformanceStats(): EnhancedPerformanceStats;
  /** Calculate text range from viewport */
  calculateTextRangeFromViewport(
    scrollTop: number,
    containerHeight: number,
    itemHeight: number,
    bufferSize?: number
  ): TextRange;
}

/**
 * AcceleratedPositionMapper class interface
 */
export interface AcceleratedPositionMapperInterface {
  /** WASM engine instance */
  wasmEngine: any | null;
  /** Fallback computer */
  fallbackComputer: ViewportSegmentComputerEnhancedInterface;
  /** Performance statistics */
  performanceStats: AcceleratedPerformanceStats;

  /** Create accelerated position mapping */
  createPositionMapping(text: string, semanticArrays: SemanticArrays): Promise<TextPositionMapping>;
  /** Select optimal acceleration strategy */
  selectOptimalStrategy(text: string, semanticArrays: SemanticArrays): AccelerationStrategy;
  /** Get performance statistics */
  getPerformanceStats(): AcceleratedMapperStats;
  /** Configure acceleration settings */
  configure(config: Partial<AccelerationConfiguration>): void;
  /** Clear all caches */
  clearCaches(): void;
  /** Prewarm cache asynchronously */
  prewarmCache(
    mapping: TextPositionMapping,
    textLength: number,
    viewportSize: number
  ): Promise<void>;
}

// Export empty object to make this a module
export {};
