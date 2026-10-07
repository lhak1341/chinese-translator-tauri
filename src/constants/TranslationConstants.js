/**
 * Translation Engine Constants
 *
 * Centralized constants for translation processing to replace magic numbers
 * and improve code maintainability.
 */

/**
 * Dictionary Lookup Configuration
 */
export const DICTIONARY_LOOKUP = {
  // Minimum text length (characters) for the Rust lookup index. MatchSource checks it before the
  // IPC call and sends it to Rust, so the two sides gate on one number.
  MIN_TEXT_FOR_RUST_INDEX: 50,
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
