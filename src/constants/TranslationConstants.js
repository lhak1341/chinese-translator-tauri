/**
 * Translation Engine Constants
 *
 * Centralized constants for translation processing to replace magic numbers
 * and improve code maintainability.
 */

/**
 * Phrase Processing Configuration
 */
export const PHRASE_PROCESSING = {
  // Optimal batch size for concurrent phrase processing (I/O-bound operations)
  BATCH_SIZE: 5,

  // Minimum unprocessed tokens to justify parallel processing
  PARALLEL_THRESHOLD: 10,
};

/**
 * Number Processing Configuration
 * CODE REVIEW FIX (MEDIUM-8): Document magic numbers with empirical rationale
 */
export const NUMBER_PROCESSING = {
  /**
   * Maximum span for consumed number tokens
   *
   * Rationale:
   * - Longest Chinese number pattern: 8 tokens (e.g., "三千七百五十五" = 3,755)
   * - Maximum theoretical: "九千九百九十九" = 8 characters for 9,999
   * - Safety margin: 10 tokens allows for edge cases
   * - Prevents O(n) scan if corruption marks all tokens as consumed
   *
   * Pattern analysis:
   * - Simple numbers: 2-3 tokens (三十五 = 35)
   * - Hundreds: 3-5 tokens (三百五十 = 350)
   * - Thousands: 4-8 tokens (三千七百五十五 = 3,755)
   * - Ranges: 3-6 tokens (五六十 = 50-60, 一百五六十 = 150-160)
   * - Years: 5 tokens (一九四五年 = năm 1945)
   * - Percentages: 4-8 tokens (百分之三十 = 30%, 百分之五六十 = 50-60%)
   *
   * Why 10 specifically:
   * - Covers all current patterns (max 8) with safety margin
   * - Small enough to prevent performance issues on corrupted data
   * - If span exceeds 10, indicates WASM corruption (should log warning)
   *
   * If you add longer number patterns, increase this threshold accordingly.
   */
  MAX_CONSUMED_SPAN: 10,
};

/**
 * Dictionary Lookup Configuration
 */
export const DICTIONARY_LOOKUP = {
  // Minimum text length to justify building lookup index
  // Indexing overhead not worth it for short texts
  MIN_TEXT_FOR_INDEXING: 50,

  // Minimum text length for character-only Rust lookup index
  MIN_TEXT_FOR_RUST_INDEX: 50,
};

/**
 * Pattern Processing Configuration
 */
export const PATTERN_PROCESSING = {
  // Maximum pattern failures before permanent disable
  MAX_FAILURES_BEFORE_DISABLE: 3,

  // Maximum time for composite pattern detection (ms)
  MAX_COMPOSITE_DETECTION_TIME: 100,

  /**
   * Pattern variable cache cleanup threshold
   *
   * Rationale:
   * - Pattern processor caches variable resolutions to avoid recomputation
   * - Cache size grows with pattern complexity and text variation
   * - 500 entries ≈ 50-100KB memory (10-20 variables × 20-50 char strings each)
   * - Clearing at 500 prevents unbounded growth while keeping hot patterns cached
   *
   * Performance data:
   * - Cache hit rate typically 60-80% on repeated patterns
   * - Cache build time: <1ms for 500 entries
   * - Memory overhead: ~100KB at threshold (negligible vs 27K dictionary entries)
   *
   * When to adjust:
   * - Increase if pattern miss rate >40% (indicates frequent cache thrashing)
   * - Decrease if memory pressure occurs before 500 entries
   * - Monitor via: window.translationEngine.semanticPatternProcessor.variableCache.size
   */
  VARIABLE_CACHE_CLEANUP_THRESHOLD: 500,
};

/**
 * Memory Management Configuration
 */
export const MEMORY_MANAGEMENT = {
  // Maximum token stats to track (bounded collection)
  MAX_TOKEN_STATS: 500,

  // Maximum proper noun translations to cache
  MAX_PROPER_NOUN_TRANSLATIONS: 10000,
};

/**
 * CODE REVIEW FIX (LOW-3): Position Tracking Configuration
 * Extracted magic numbers for better maintainability
 */
export const POSITION_TRACKING = {
  // Maximum position entries to track for overlap detection
  // Prevents O(n²) degradation for 1000+ word translations
  MAX_TRACKING_POSITIONS: 500,

  // Eviction percentage when max reached (10% = LRU eviction of oldest 10%)
  EVICTION_PERCENTAGE: 0.1,

  // Warning threshold for logging position tracking size
  WARNING_INTERVAL: 100, // Log every 100 positions after max
};

/**
 * CODE REVIEW FIX (MEDIUM-2): Adaptive segment cleanup threshold based on device memory
 * Returns appropriate max segments based on available device memory
 * @returns {number} Maximum segments to keep
 */
export function getAdaptiveMaxSegments() {
  // Use Device Memory API if available (Chrome, Edge)
  // Falls back to conservative default (4GB) for browsers that don't support it
  const deviceMemoryGB = navigator.deviceMemory || 4;

  // Adaptive thresholds based on memory:
  // - ≤2GB (low memory): 10 segments (conservative)
  // - ≤4GB (medium memory): 20 segments (balanced)
  // - >4GB (high memory): 35 segments (original default)
  if (deviceMemoryGB <= 2) {
    return 10; // Low memory devices - aggressive cleanup
  } else if (deviceMemoryGB <= 4) {
    return 20; // Medium memory devices - moderate cleanup
  } else {
    return 35; // High memory devices - original threshold
  }
}

/**
 * WASM Number Processing Thresholds
 * CODE REVIEW FIX (MEDIUM-8): Document magic numbers with empirical rationale
 *
 * These thresholds balance WASM performance benefits against serialization overhead.
 * Updated: 2026-01-27 (based on profiling analysis)
 */
export const WASM_NUMBER_THRESHOLDS = {
  /**
   * Stop counting candidates after this many (optimization - we know we'll use WASM anyway)
   *
   * Rationale:
   * - Counting candidates is O(n) but cheap (simple loop)
   * - At 50+ candidates, WASM speedup (5-10x) always exceeds serialization cost
   * - Early exit saves 0.1-0.3ms on large texts (1000+ tokens)
   * - Threshold chosen to be conservative (WASM beneficial at 20+ candidates)
   *
   * Performance data:
   * - 10 candidates: JS ~1.5ms, WASM ~1.3ms (comparable)
   * - 50 candidates: JS ~7.5ms, WASM ~2.0ms (WASM 3.7x faster)
   * - 100 candidates: JS ~15ms, WASM ~2.5ms (WASM 6x faster)
   */
  MAX_CANDIDATE_COUNT_CHECK: 50,

  /**
   * Minimum candidates to justify WASM serialization overhead
   * Below this threshold, JavaScript is faster due to serialization cost
   *
   * Rationale:
   * - WASM serialization: ~0.5-0.8ms fixed cost (serde_wasm_bindgen)
   * - JavaScript processing: ~0.15ms per candidate
   * - Break-even point: ~5-7 candidates (0.75ms JS vs 0.8ms WASM+serialization)
   * - Safety margin: Set to 10 to account for variance
   *
   * Performance data (2026-01-27):
   * - 0-5 candidates: JS 0.0-0.8ms, WASM 1.0-1.2ms (JS faster)
   * - 10 candidates: JS 1.5ms, WASM 1.3ms (comparable, WASM slightly faster)
   * - 20 candidates: JS 3.0ms, WASM 1.5ms (WASM 2x faster)
   *
   * Note: Use window.performanceDashboard.recordMetric() to collect real-world data
   * for threshold tuning. Adjust if actual breakeven differs from profiling.
   */
  MIN_CANDIDATES_FOR_WASM: 10,
};

/**
 * LOW-2 FIX: Phase Timeout Configuration
 * Maximum execution time for each translation phase (milliseconds)
 *
 * Rationale (based on profiling 2026-01-27):
 * - Pattern matching: 30s for 5000+ patterns × 2000+ char texts
 * - Proper nouns: 10s for trie lookups (O(k), fast even for 100K+ entries)
 * - Numbers: 5s for WASM-accelerated processing (<100 candidates typical)
 * - Phrases: 20s for sequential matching (1000+ phrases common)
 * - Characters: 60s for fallback processing (can be 1000+ remaining chars)
 *
 * These timeouts protect against:
 * - Malicious/corrupted input causing infinite loops
 * - Performance regressions (detected when timing approaches timeout)
 * - Hanging translations on edge cases
 *
 * Note: Promise.race timeouts can't kill ongoing work, only stop waiting.
 * Actual execution continues but translation gracefully degrades to next phase.
 */
export const PHASE_TIMEOUTS = {
  /** Pattern matching: Handles 5000+ patterns with variables */
  patterns: 30000, // 30 seconds

  /** Proper noun lookups: Trie-based O(k) lookups */
  properNouns: 10000, // 10 seconds

  /** Number conversion: WASM-accelerated Chinese number processing */
  numbers: 5000, // 5 seconds

  /** Phrase matching: Sequential dictionary lookups */
  phrases: 20000, // 20 seconds

  /** Character fallback: Last resort for all remaining tokens */
  characters: 60000, // 60 seconds (2x patterns due to volume)
};

/**
 * Device Memory-Based Token Limits
 * Adaptive token limits based on available device memory (RAM)
 *
 * Rationale:
 * - Low memory devices (≤2GB): Conservative 15K token limit
 * - Medium memory devices (2-4GB): Balanced 25K token limit
 * - High memory devices (4-8GB): Comfortable 40K token limit
 * - Very high memory devices (8GB+): Maximum 50K token limit
 *
 * These limits prevent memory exhaustion while maximizing performance
 * for the user's hardware capabilities.
 */
export const DEVICE_MEMORY_LIMITS = {
  /** Default fallback limit for older browsers without memory API */
  DEFAULT_MAX_TOKENS: 15000,

  /** Low memory devices (≤2GB RAM) */
  LOW_MEMORY_TOKENS: 15000,

  /** Medium memory devices (2-4GB RAM) */
  MEDIUM_MEMORY_TOKENS: 25000,

  /** High memory devices (4-8GB RAM) */
  HIGH_MEMORY_TOKENS: 40000,

  /** Very high memory devices (8GB+ RAM) */
  VERY_HIGH_MEMORY_TOKENS: 50000,

  /** Minimum token limit (safety floor) */
  MIN_TOKEN_LIMIT: 5000,

  /** Percentage of available memory to use for token storage */
  MEMORY_USAGE_PERCENTAGE: 0.3, // 30% of available memory
};

/**
 * UI and Interaction Timeouts
 * Timeout values for user notifications and background operations
 */
export const UI_TIMEOUTS = {
  /** Toast notification duration for normal messages (ms) */
  TOAST_DURATION_NORMAL: 15000, // 15 seconds

  /** Toast notification duration for validation errors (ms) */
  TOAST_DURATION_ERROR: 5000, // 5 seconds

  /** Toast notification duration for critical errors (ms) */
  TOAST_DURATION_CRITICAL: 10000, // 10 seconds

  /** Idle callback timeout for background cleanup (ms) */
  IDLE_CALLBACK_TIMEOUT: 2000, // 2 seconds

  /** WASM status check interval (ms) */
  WASM_STATUS_CHECK_INTERVAL: 1000, // 1 second

  /** Cache health check interval (ms) */
  CACHE_HEALTH_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes

  /** Retry delay for operations (ms) */
  MAX_RETRY_DELAY: 1000, // 1 second

  /** Minimum input length to show success notification (characters) */
  LARGE_TRANSLATION_THRESHOLD: 1000, // 1000 characters
};

/**
 * Pattern Processing Failure Detection
 * Configuration for detecting and recovering from pattern processing failures
 */
export const PATTERN_FAILURE_DETECTION = {
  /** Time window for tracking pattern failures (ms) */
  FAILURE_WINDOW_MS: 5 * 60 * 1000, // 5 minutes

  /** Maximum failures before disabling pattern processing */
  MAX_FAILURES: 3,
};

/**
 * Optimized Search Activation Thresholds
 * Determines when to use WASM-accelerated search for clickable highlighting
 *
 * Rationale:
 * - WASM search is 10-50x faster but has initialization overhead
 * - For texts >2000 chars AND >100 semantic units, WASM speedup outweighs overhead
 * - JavaScript O(n*m) search becomes bottleneck at this scale
 */
export const OPTIMIZED_SEARCH_THRESHOLDS = {
  /** Minimum text length to activate optimized search (characters) */
  MIN_TEXT_LENGTH: 2000,

  /** Minimum semantic units to activate optimized search */
  MIN_SEMANTIC_UNITS: 100,

  /** Average segment size threshold for cleanup warning (characters) */
  LARGE_SEGMENT_SIZE_THRESHOLD: 2000,
};

/**
 * Memory Waste Detection
 * Threshold for detecting inefficient memory usage patterns
 */
export const MEMORY_WASTE_DETECTION = {
  /** Percentage of wasted memory that triggers a warning */
  WASTE_PERCENTAGE_THRESHOLD: 0.3, // 30% waste
};
