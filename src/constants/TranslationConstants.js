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
 * The most tokens one translateDirectly call accepts; a larger chunk throws "Input too large".
 * A fixed limit: the app runs in WKWebView, which has no performance.memory to scale it by.
 */
export const MAX_INPUT_TOKENS = 15000;

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
