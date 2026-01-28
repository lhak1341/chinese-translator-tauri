import { logger } from '../utils/logger';

/**
 * Centralized performance thresholds and configuration constants
 *
 * These values control memory management, rendering optimization, and
 * WASM acceleration activation throughout the translation system.
 *
 * ⚠️ WARNING: Changing these values can significantly impact performance
 * and system behavior. Consult CLAUDE.md before modifying.
 */

/**
 * Memory management threshold configuration
 */
interface MemoryThresholds {
  /** Trigger cleanup when segment count exceeds this value */
  readonly SEGMENT_CLEANUP_TRIGGER: number;
  /** Keep this many segments after cleanup */
  readonly SEGMENT_CLEANUP_KEEP: number;
  /** Emergency cleanup threshold (rarely hit) */
  readonly EMERGENCY_CLEANUP_THRESHOLD: number;
  /** Critical memory cleanup threshold */
  readonly CRITICAL_CLEANUP_THRESHOLD: number;
}

/**
 * Rendering and virtualization threshold configuration
 */
interface RenderingThresholds {
  /** Enable virtualized scrolling for segment counts above this threshold */
  readonly VIRTUALIZATION_THRESHOLD: number;
  /** Use optimized rendering for segment counts above this threshold */
  readonly OPTIMIZED_RENDERING_THRESHOLD: number;
  /** Composite detection time threshold (ms) */
  readonly COMPOSITE_DETECTION_TIME_MS: number;
}

/**
 * WASM acceleration activation threshold configuration
 */
interface AccelerationThresholds {
  /** Activate WASM acceleration for texts longer than this (characters) */
  readonly WASM_TEXT_LENGTH_CHARS: number;
  /** Activate WASM acceleration for semantic unit counts above this */
  readonly WASM_SEMANTIC_UNITS: number;
  /** Use Web Workers for position mapping above this text length */
  readonly WORKER_TEXT_LENGTH_CHARS: number;
}

/**
 * Cache configuration threshold settings
 */
interface CacheThresholds {
  /** Maximum cache size for translation segments */
  readonly MAX_TRANSLATION_CACHE_SIZE: number;
  /** Maximum cache size for position mappings */
  readonly MAX_POSITION_CACHE_SIZE: number;
  /** Cache hit rate warning threshold (percentage) */
  readonly CACHE_HIT_RATE_WARNING: number;
}

/**
 * Chunking and parallel processing threshold configuration
 */
interface ChunkingThresholds {
  /** Default chunk size for parallel processing (characters) */
  readonly DEFAULT_CHUNK_SIZE_CHARS: number;
  /** Maximum parallel chunks to process simultaneously */
  readonly MAX_PARALLEL_CHUNKS: number;
  /** Minimum text length to enable chunking (characters) */
  readonly MIN_TEXT_LENGTH_FOR_CHUNKING: number;
}

/**
 * Progress callback and UI update threshold configuration
 */
interface UIUpdateThresholds {
  /** Debounce progress callbacks to this interval (ms) */
  readonly PROGRESS_DEBOUNCE_MS: number;
  /** Minimum time between UI updates (ms) */
  readonly MIN_UI_UPDATE_INTERVAL_MS: number;
  /** Minimum chunks before showing streaming translation UI */
  readonly STREAMING_MIN_CHUNKS: number;
}

/**
 * Performance monitoring threshold configuration
 */
interface MonitoringThresholds {
  /** Pattern bottleneck detection threshold (ms average) */
  readonly PATTERN_BOTTLENECK_AVG_MS: number;
  /** Minimum match count before considering bottleneck status */
  readonly PATTERN_BOTTLENECK_MIN_MATCHES: number;
  /** Performance degradation warning threshold (multiplier) */
  readonly DEGRADATION_WARNING_MULTIPLIER: number;
  /** Performance degradation critical threshold (multiplier) */
  readonly DEGRADATION_CRITICAL_MULTIPLIER: number;
}

/**
 * All threshold configurations combined
 */
interface AllThresholds {
  readonly MEMORY: MemoryThresholds;
  readonly RENDERING: RenderingThresholds;
  readonly ACCELERATION: AccelerationThresholds;
  readonly CACHE: CacheThresholds;
  readonly CHUNKING: ChunkingThresholds;
  readonly UI_UPDATE: UIUpdateThresholds;
  readonly MONITORING: MonitoringThresholds;
}

/**
 * Memory management thresholds for translation segments
 *
 * Background: Translation segments accumulate during operation and cause
 * 100x performance degradation when unbounded. These thresholds prevent
 * memory leaks while preserving clickable highlighting functionality.
 *
 * Technical reasoning:
 * - Each segment adds O(n) complexity to position calculations
 * - At 75 segments: ~5-10ms position lookup overhead per interaction
 * - At 35 segments: ~1-2ms overhead (negligible for real-time UI)
 */
export const MEMORY_THRESHOLDS: MemoryThresholds = {
  /**
   * Trigger cleanup when segment count exceeds this value
   * Based on regression detection: 2.5x baseline degradation at 75 segments
   */
  SEGMENT_CLEANUP_TRIGGER: 75,

  /**
   * Keep this many segments after cleanup
   * Balances memory usage with clickable highlighting coverage
   */
  SEGMENT_CLEANUP_KEEP: 35,

  /**
   * Emergency cleanup threshold (rarely hit)
   * Used in critical memory situations
   */
  EMERGENCY_CLEANUP_THRESHOLD: 3,

  /**
   * Critical memory cleanup threshold
   * Used when memory pressure is detected
   */
  CRITICAL_CLEANUP_THRESHOLD: 5,
} as const;

/**
 * Rendering and virtualization thresholds
 *
 * Controls when to switch to optimized rendering modes for large texts.
 */
export const RENDERING_THRESHOLDS: RenderingThresholds = {
  /**
   * Enable virtualized scrolling for segment counts above this threshold
   * Prevents UI blocking with large translation results
   */
  VIRTUALIZATION_THRESHOLD: 200,

  /**
   * Use optimized rendering for segment counts above this threshold
   * Trades some visual fidelity for performance
   */
  OPTIMIZED_RENDERING_THRESHOLD: 100,

  /**
   * Composite detection time threshold (ms)
   * Determines when to use accelerated position mapping
   */
  COMPOSITE_DETECTION_TIME_MS: 100,
} as const;

/**
 * WASM acceleration activation thresholds
 *
 * Determines when to activate WASM acceleration vs JavaScript fallback.
 * WASM provides 15-30x speedup but has initialization overhead.
 */
export const ACCELERATION_THRESHOLDS: AccelerationThresholds = {
  /**
   * Activate WASM acceleration for texts longer than this (characters)
   * Below this threshold, JavaScript is faster due to WASM overhead
   */
  WASM_TEXT_LENGTH_CHARS: 2000,

  /**
   * Activate WASM acceleration for semantic unit counts above this
   * Sliding window search becomes beneficial at this complexity
   */
  WASM_SEMANTIC_UNITS: 100,

  /**
   * Use Web Workers for position mapping above this text length
   * Prevents UI blocking during position calculations
   */
  WORKER_TEXT_LENGTH_CHARS: 1000,
} as const;

/**
 * Cache configuration thresholds
 */
export const CACHE_THRESHOLDS: CacheThresholds = {
  /**
   * Maximum cache size for translation segments
   */
  MAX_TRANSLATION_CACHE_SIZE: 1000,

  /**
   * Maximum cache size for position mappings
   */
  MAX_POSITION_CACHE_SIZE: 500,

  /**
   * Cache hit rate warning threshold (percentage)
   * Log warning if cache hit rate drops below this
   */
  CACHE_HIT_RATE_WARNING: 70,
} as const;

/**
 * Chunking and parallel processing thresholds
 */
export const CHUNKING_THRESHOLDS: ChunkingThresholds = {
  /**
   * Default chunk size for parallel processing (characters)
   */
  DEFAULT_CHUNK_SIZE_CHARS: 200,

  /**
   * Maximum parallel chunks to process simultaneously
   */
  MAX_PARALLEL_CHUNKS: 4,

  /**
   * Minimum text length to enable chunking (characters)
   */
  MIN_TEXT_LENGTH_FOR_CHUNKING: 500,
} as const;

/**
 * Progress callback and UI update thresholds
 */
export const UI_UPDATE_THRESHOLDS: UIUpdateThresholds = {
  /**
   * Debounce progress callbacks to this interval (ms)
   * Reduces callback overhead by 60-80%
   */
  PROGRESS_DEBOUNCE_MS: 300,

  /**
   * Minimum time between UI updates (ms)
   * Prevents UI thrashing during rapid translations
   */
  MIN_UI_UPDATE_INTERVAL_MS: 100,

  /**
   * Minimum chunks before showing streaming translation UI
   * Prevents streaming UI from appearing for short texts
   * 40 chunks ≈ 800-2000 characters (2-4 paragraphs)
   */
  STREAMING_MIN_CHUNKS: 40,
} as const;

/**
 * Performance monitoring thresholds
 */
export const MONITORING_THRESHOLDS: MonitoringThresholds = {
  /**
   * Pattern bottleneck detection threshold (ms average)
   * Patterns with avg time > this are flagged as bottlenecks
   */
  PATTERN_BOTTLENECK_AVG_MS: 5,

  /**
   * Minimum match count before considering bottleneck status
   * Prevents false positives from rarely-used patterns
   */
  PATTERN_BOTTLENECK_MIN_MATCHES: 5,

  /**
   * Performance degradation warning threshold (multiplier)
   * Warn if operation takes >2x baseline
   */
  DEGRADATION_WARNING_MULTIPLIER: 2.0,

  /**
   * Performance degradation critical threshold (multiplier)
   * Alert if operation takes >5x baseline
   */
  DEGRADATION_CRITICAL_MULTIPLIER: 5.0,
} as const;

/**
 * Helper function to get all thresholds as a single object
 * Useful for debugging and configuration exports
 * @returns All threshold configurations
 */
export function getAllThresholds(): AllThresholds {
  return {
    MEMORY: MEMORY_THRESHOLDS,
    RENDERING: RENDERING_THRESHOLDS,
    ACCELERATION: ACCELERATION_THRESHOLDS,
    CACHE: CACHE_THRESHOLDS,
    CHUNKING: CHUNKING_THRESHOLDS,
    UI_UPDATE: UI_UPDATE_THRESHOLDS,
    MONITORING: MONITORING_THRESHOLDS,
  };
}

/**
 * Validate thresholds for consistency
 * Logs warnings if threshold values seem misconfigured
 * @returns True if all thresholds are valid, false if warnings exist
 */
export function validateThresholds(): boolean {
  const warnings: string[] = [];

  // Memory thresholds should be ordered
  if (MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP >= MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
    warnings.push('SEGMENT_CLEANUP_KEEP should be less than SEGMENT_CLEANUP_TRIGGER');
  }

  // WASM thresholds should be reasonable
  if (ACCELERATION_THRESHOLDS.WASM_TEXT_LENGTH_CHARS < 100) {
    warnings.push('WASM_TEXT_LENGTH_CHARS seems too low (overhead will dominate)');
  }

  // Cache hit rate should be between 0-100
  if (
    CACHE_THRESHOLDS.CACHE_HIT_RATE_WARNING < 0 ||
    CACHE_THRESHOLDS.CACHE_HIT_RATE_WARNING > 100
  ) {
    warnings.push('CACHE_HIT_RATE_WARNING should be between 0-100');
  }

  if (warnings.length > 0) {
    logger.warn('⚠️ Performance threshold validation warnings:', warnings);
  }

  return warnings.length === 0;
}

// Validate thresholds on module load in development
if (process.env.NODE_ENV === 'development') {
  validateThresholds();
}
