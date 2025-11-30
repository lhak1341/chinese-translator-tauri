/**
 * TypeScript type definitions for Web Worker management and position mapping
 *
 * Defines interfaces for worker lifecycle, task queuing, position mapping acceleration,
 * position tracking, and WASM validation used throughout the translation system.
 */

// ============================================================================
// Web Worker Management (SegmentWorkerManager)
// ============================================================================

/**
 * Segment worker manager configuration
 * Used by SegmentWorkerManager constructor
 */
export interface SegmentWorkerManagerOptions {
  /** Path to worker script (default: '/src/workers/SegmentPositionWorker.js') */
  workerPath?: string;

  /** Worker initialization timeout in milliseconds (default: 5000) */
  initTimeout?: number;

  /** Enable fallback to main thread if worker fails (default: true) */
  enableFallback?: boolean;

  /** Enable performance tracking (default: true) */
  trackPerformance?: boolean;

  /** Maximum concurrent tasks (default: unlimited) */
  maxConcurrentTasks?: number;
}

/**
 * Worker performance statistics
 * Tracks worker vs fallback usage and performance
 */
export interface WorkerStats {
  /** Total tasks executed via worker */
  workerTasks: number;

  /** Total tasks executed via fallback */
  fallbackTasks: number;

  /** Total time spent in worker operations (ms) */
  totalWorkerTime: number;

  /** Total time spent in fallback operations (ms) */
  totalFallbackTime: number;

  /** Total errors encountered */
  errors: number;

  /** Average worker time per task */
  avgWorkerTime?: number;

  /** Average fallback time per task */
  avgFallbackTime?: number;
}

/**
 * Pending task tracking
 * Tracks tasks waiting for worker response
 */
export interface PendingTask {
  /** Promise resolve function */
  resolve: (value: any) => void;

  /** Promise reject function */
  reject: (error: Error) => void;

  /** Task start time (performance.now()) */
  startTime: number;

  /** Task type for debugging */
  type?: string;

  /** Task data snapshot */
  data?: any;
}

/**
 * Worker message data (outgoing to worker)
 * Message format sent to worker
 */
export interface WorkerMessageData {
  /** Message type */
  type: 'CREATE_POSITION_MAPPING' | 'COMPUTE_SEGMENTS' | 'PING';

  /** Unique task ID */
  id: number;

  /** Task data */
  data: {
    /** Full translated text */
    text?: string;

    /** Semantic arrays from translation */
    semanticArrays?: any;

    /** Pre-computed semantic range map */
    semanticRangeMap?: TextPositionMapping;

    /** Start character position */
    textStart?: number;

    /** End character position */
    textEnd?: number;
  };
}

/**
 * Worker response data (incoming from worker)
 * Message format received from worker
 */
export interface WorkerResponseData {
  /** Response type */
  type: 'READY' | 'SUCCESS' | 'ERROR';

  /** Task ID (matches request) */
  id?: number;

  /** Result data on success */
  result?: any;

  /** Error information on failure */
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Segment worker manager interface
 * Manages Web Worker lifecycle and task distribution
 */
export interface SegmentWorkerManager {
  /** Worker instance */
  worker: Worker | null;

  /** Whether worker is initialized */
  isInitialized: boolean;

  /** Pending tasks awaiting response */
  pendingTasks: Map<number, PendingTask>;

  /** Task ID counter */
  taskIdCounter: number;

  /** Initialization promise (singleton) */
  initializationPromise: Promise<boolean> | null;

  /** Whether in fallback mode (worker failed) */
  fallbackMode: boolean;

  /** Performance statistics */
  stats: WorkerStats;

  /**
   * Initialize the worker
   * @returns Promise resolving to true if worker initialized
   */
  initialize(): Promise<boolean>;

  /**
   * Create text position mapping via worker or fallback
   * @param text - Full translated text
   * @param semanticArrays - Semantic arrays from translation
   * @returns Position mapping result
   */
  createTextPositionMapping(text: string, semanticArrays: any): Promise<TextPositionMapping>;

  /**
   * Compute segments for text range via worker or fallback
   * @param semanticRangeMap - Pre-computed position mapping
   * @param textStart - Start position in text
   * @param textEnd - End position in text
   * @returns Segment computation result
   */
  computeSegmentsForTextRange(
    semanticRangeMap: TextPositionMapping,
    textStart: number,
    textEnd: number
  ): Promise<SegmentComputationResult>;

  /**
   * Terminate the worker
   */
  terminate(): void;

  /**
   * Get performance statistics
   * @returns Worker stats
   */
  getStats(): WorkerStats;
}

// ============================================================================
// Position Mapping Results (Worker & Main Thread)
// ============================================================================

/**
 * Semantic range mapping
 * Maps text positions to semantic units
 */
export interface SemanticRange {
  /** Start character position in translated text */
  startPos: number;

  /** End character position in translated text */
  endPos: number;

  /** Index in semantic arrays */
  unitIndex: number;

  /** Original Chinese text */
  originalText: string;

  /** Translated Vietnamese text */
  translatedText: string;

  /** Translation source (pattern, properNoun, phrase, character) */
  source: string;

  /** Translation metadata */
  metadata?: any;
}

/**
 * Text position mapping result
 * Result from position mapping computation
 */
export interface TextPositionMapping {
  /** Total text length */
  textLength: number;

  /** Semantic ranges mapping positions */
  semanticRanges: SemanticRange[];

  /** Full translated text */
  fullText?: string;

  /** Computation statistics */
  stats?: {
    /** Time to compute (ms) */
    computeTime: number;

    /** Number of ranges created */
    rangeCount: number;
  };

  /** Acceleration metadata */
  accelerationInfo?: AccelerationInfo;

  /** Validation metadata */
  validationInfo?: ValidationInfo;
}

/**
 * Match result from unit search
 * Result from finding semantic unit in text
 */
export interface MatchResult {
  /** Whether unit was found */
  found: boolean;

  /** Character offset where found */
  offset: number;

  /** Match confidence (for fuzzy matching) */
  confidence?: number;
}

/**
 * Segment computation result
 * Result from computing segments for viewport
 */
export interface SegmentComputationResult {
  /** Computed segments */
  segments: DisplaySegment[];

  /** Computation statistics */
  stats: {
    /** Time to compute (ms) */
    computeTime: number;

    /** Number of segments */
    segmentCount: number;

    /** Number of ranges examined */
    rangesExamined?: number;
  };
}

/**
 * Display segment for viewport
 * Segment ready for UI rendering
 */
export interface DisplaySegment {
  /** Segment type */
  type: 'semantic' | 'punctuation' | 'spacing' | 'linebreak';

  /** Start position in text */
  start: number;

  /** End position in text */
  end: number;

  /** Display text */
  text: string;

  /** Whether clickable */
  isClickable: boolean;

  /** Unit index (if semantic) */
  unitIndex?: number;

  /** Original text (if semantic) */
  originalText?: string;

  /** Translated text (if semantic) */
  translatedText?: string;

  /** Translation source (if semantic) */
  source?: string;

  /** Translation metadata (if semantic) */
  metadata?: any;
}

// ============================================================================
// Worker Implementation (SegmentPositionWorker)
// ============================================================================

/**
 * Worker cache statistics
 * Tracks cache performance in worker
 */
export interface WorkerCacheStats {
  /** Cache hits */
  hits: number;

  /** Cache misses */
  misses: number;

  /** Total computations performed */
  computations: number;

  /** Hit rate */
  hitRate?: number;
}

/**
 * Segment position worker interface
 * Worker implementation for position mapping
 */
export interface SegmentPositionWorker {
  /** Cache statistics */
  cacheStats: WorkerCacheStats;

  /**
   * Create text position mapping
   * @param text - Full translated text
   * @param semanticArrays - Semantic arrays from translation
   * @returns Position mapping result
   */
  createTextPositionMapping(text: string, semanticArrays: any): TextPositionMapping;

  /**
   * Find semantic unit in text
   * @param searchText - Text to search
   * @param unit - Semantic unit to find
   * @returns Match result
   */
  findUnitInText(searchText: string, unit: string): MatchResult;

  /**
   * Normalize text for matching
   * @param text - Text to normalize
   * @returns Normalized text
   */
  normalizeText(text: string): string;

  /**
   * Compute segments for text range
   * @param semanticRangeMap - Position mapping
   * @param textStart - Start position
   * @param textEnd - End position
   * @returns Segments array
   */
  computeSegmentsForTextRange(
    semanticRangeMap: TextPositionMapping,
    textStart: number,
    textEnd: number
  ): DisplaySegment[];
}

// ============================================================================
// Accelerated Position Mapper (WASM + Workers unified interface)
// ============================================================================

/**
 * Accelerated position mapper configuration
 * Configuration for position mapping acceleration
 */
export interface AcceleratedPositionMapperOptions {
  /** Enable WASM acceleration (default: true) */
  useWasm?: boolean;

  /** Enable Web Worker acceleration (default: true) */
  useWorkers?: boolean;

  /** Text length threshold for WASM (default: 2000) */
  wasmThreshold?: number;

  /** Text length threshold for Workers (default: 1000) */
  workerThreshold?: number;

  /** Enable strict validation in development (default: true in dev) */
  strictValidation?: boolean;

  /** Enable caching (default: true) */
  enableCaching?: boolean;
}

/**
 * Acceleration strategy type
 * Strategy selected for position mapping
 */
export type StrategyType = 'wasm' | 'worker' | 'main_thread' | 'fallback';

/**
 * Acceleration strategy
 * Selected strategy with reasoning
 */
export interface AccelerationStrategy {
  /** Strategy type */
  type: StrategyType;

  /** Reason for selection */
  reason: string;

  /** Text length that influenced decision */
  textLength?: number;

  /** Semantic unit count that influenced decision */
  unitCount?: number;

  /** Available acceleration methods */
  available?: {
    wasm: boolean;
    workers: boolean;
  };
}

/**
 * Acceleration information
 * Metadata about acceleration used
 */
export interface AccelerationInfo {
  /** Strategy used */
  strategy: StrategyType;

  /** Reason for strategy selection */
  reason: string;

  /** Text length */
  textLength: number;

  /** Number of semantic ranges */
  rangeCount: number;

  /** Time to compute (ms) */
  computeTime?: number;

  /** Total time including overhead (ms) */
  totalTime?: number;

  /** Whether cache was used */
  cacheUsed?: boolean;

  /** Cache key */
  cacheKey?: string;
}

/**
 * Accelerated mapper performance statistics
 * Tracks acceleration performance
 */
export interface AcceleratedMapperStats {
  /** Total operations */
  totalOperations: number;

  /** Operations using WASM */
  wasmOperations: number;

  /** Operations using Workers */
  workerOperations: number;

  /** Operations on main thread */
  mainThreadOperations: number;

  /** Total time (ms) */
  totalTime: number;

  /** Average time per operation (ms) */
  averageTime: number;

  /** WASM speedup factor vs main thread */
  wasmSpeedup?: number;

  /** Worker speedup factor vs main thread */
  workerSpeedup?: number;
}

/**
 * Accelerated position mapper interface
 * Unified interface for WASM + Worker acceleration
 */
export interface AcceleratedPositionMapper {
  /** WASM engine reference */
  wasmEngine: any | null;

  /** Fallback computer for main thread */
  fallbackComputer: any;

  /** WASM threshold (chars) */
  wasmThreshold: number;

  /** Worker threshold (chars) */
  workerThreshold: number;

  /** Whether WASM is enabled */
  useWasm: boolean;

  /** Whether workers are enabled */
  useWorkers: boolean;

  /** Whether strict validation is enabled */
  strictValidation: boolean;

  /** Performance statistics */
  performanceStats: AcceleratedMapperStats;

  /**
   * Create accelerated position mapping
   * @param text - Full translated text
   * @param semanticArrays - Semantic arrays
   * @returns Position mapping with acceleration metadata
   */
  createPositionMapping(text: string, semanticArrays: any): Promise<TextPositionMapping>;

  /**
   * Select optimal acceleration strategy
   * @param text - Text to process
   * @param semanticArrays - Semantic arrays
   * @returns Selected strategy
   */
  selectOptimalStrategy(text: string, semanticArrays: any): AccelerationStrategy;

  /**
   * Get WASM engine dynamically
   * @returns WASM engine or null
   */
  getWasmEngine(): Promise<any | null>;

  /**
   * Get performance statistics
   * @returns Performance stats
   */
  getStats(): AcceleratedMapperStats;
}

// ============================================================================
// Position Tracker (translation-time position tracking)
// ============================================================================

/**
 * Tracked segment during translation
 * Segment tracked as translation progresses
 */
export interface TrackedSegment {
  /** Segment type */
  type: 'semantic' | 'punctuation' | 'spacing' | 'linebreak';

  /** Start position in text */
  start: number;

  /** End position in text */
  end: number;

  /** Display text */
  text: string;

  /** Whether clickable */
  isClickable: boolean;

  /** Unit index (if semantic) */
  unitIndex?: number;

  /** Original text (if semantic) */
  originalText?: string;

  /** Translated text (if semantic) */
  translatedText?: string;

  /** Translation source (if semantic) */
  source?: string;

  /** Translation metadata (if semantic) */
  metadata?: any;
}

/**
 * Tracking summary
 * Summary of position tracking results
 */
export interface TrackingSummary {
  /** Total segments tracked */
  totalSegments: number;

  /** Clickable segments */
  clickableSegments: number;

  /** Non-clickable segments */
  nonClickableSegments: number;

  /** Total length of tracked text */
  totalLength: number;

  /** Reconstructed translated text */
  translatedText: string;
}

/**
 * Position tracker interface
 * Tracks positions during translation
 */
export interface PositionTracker {
  /** Tracked segments */
  segments: TrackedSegment[];

  /** Current position in text */
  currentPosition: number;

  /** Translated text parts */
  translatedTextParts: string[];

  /**
   * Reset tracker for new translation
   */
  reset(): void;

  /**
   * Add semantic segment
   * @param originalText - Original text
   * @param translatedText - Translated text
   * @param metadata - Translation metadata
   * @param unitIndex - Unit index
   */
  addSegment(
    originalText: string,
    translatedText: string,
    metadata: any,
    unitIndex: number
  ): void;

  /**
   * Add non-clickable content
   * @param content - Content to add
   * @param type - Content type
   */
  addNonClickableContent(content: string, type?: 'punctuation' | 'spacing' | 'linebreak'): void;

  /**
   * Get reconstructed text
   * @returns Translated text
   */
  getTranslatedText(): string;

  /**
   * Get all segments
   * @returns Segments array
   */
  getSegments(): TrackedSegment[];

  /**
   * Get current position
   * @returns Current position
   */
  getCurrentPosition(): number;

  /**
   * Get tracking summary
   * @returns Summary object
   */
  getSummary(): TrackingSummary;
}

// ============================================================================
// Position Mapping Validator (WASM vs JS accuracy validation)
// ============================================================================

/**
 * Validation statistics
 * Tracks validation performance and accuracy
 */
export interface ValidationStats {
  /** Total validations performed */
  totalValidations: number;

  /** Accuracy mismatches detected */
  accuracyMismatches: number;

  /** WASM errors encountered */
  wasmErrors: number;

  /** Times fallback was triggered */
  fallbackTriggers: number;

  /** Average WASM time (ms) */
  averageWasmTime: number;

  /** Average JavaScript time (ms) */
  averageJsTime: number;

  /** Last mismatch reason */
  lastMismatchReason: string | null;

  /** WASM speedup factor */
  speedupFactor?: number;

  /** Accuracy rate (%) */
  accuracyRate?: number;
}

/**
 * Comparison result
 * Result from comparing WASM vs JS
 */
export interface ComparisonResult {
  /** Whether results are accurate */
  isAccurate: boolean;

  /** Details about comparison */
  details: string;

  /** Specific differences found */
  differences?: Array<{
    type: 'text_length' | 'range_count' | 'position' | 'content' | 'source';
    index?: number;
    wasmValue: any;
    jsValue: any;
  }>;
}

/**
 * Validation information
 * Metadata about validation
 */
export interface ValidationInfo {
  /** Whether WASM was used */
  usedWasm: boolean;

  /** Whether validation was performed */
  validated: boolean;

  /** Reason for fallback (if applicable) */
  fallbackReason: 'accuracy' | 'error' | null;

  /** Validation result (if validated) */
  validationResult?: ComparisonResult;
}

/**
 * Position mapping validator interface
 * Validates WASM results against JavaScript
 */
export interface PositionMappingValidator {
  /** Validation statistics */
  validationStats: ValidationStats;

  /** Strict mode (validate all requests) */
  strictMode: boolean;

  /** Sample rate for validation in production (0-1) */
  sampleRate: number;

  /**
   * Validate WASM position mapping
   * @param text - Full translated text
   * @param semanticArrays - Semantic arrays
   * @param wasmFunction - WASM mapping function
   * @param jsFunction - JavaScript mapping function
   * @returns Validated position mapping
   */
  validatePositionMapping(
    text: string,
    semanticArrays: any,
    wasmFunction: (text: string, arrays: any) => Promise<TextPositionMapping>,
    jsFunction: (text: string, arrays: any) => Promise<TextPositionMapping>
  ): Promise<TextPositionMapping>;

  /**
   * Compare position mappings
   * @param wasmResult - WASM result
   * @param jsResult - JavaScript result
   * @returns Comparison result
   */
  comparePositionMappings(
    wasmResult: TextPositionMapping,
    jsResult: TextPositionMapping
  ): ComparisonResult;

  /**
   * Compare segment computation
   * @param wasmSegments - WASM segments
   * @param jsSegments - JavaScript segments
   * @returns Comparison result
   */
  compareSegmentComputation(
    wasmSegments: DisplaySegment[],
    jsSegments: DisplaySegment[]
  ): ComparisonResult;

  /**
   * Get validation statistics
   * @returns Validation stats
   */
  getStats(): ValidationStats;

  /**
   * Reset statistics
   */
  resetStats(): void;
}
