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
 */
export const NUMBER_PROCESSING = {
  // Maximum span for consumed number tokens
  // Chinese numbers rarely exceed 10 digits (e.g., "一千二百三十四" = 4 chars)
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
};

/**
 * Memory Management Configuration
 */
export const MEMORY_MANAGEMENT = {
  // Maximum translation segments to keep in memory
  MAX_SEGMENTS: 35,

  // Maximum token stats to track (bounded collection)
  MAX_TOKEN_STATS: 500,

  // Maximum proper noun translations to cache
  MAX_PROPER_NOUN_TRANSLATIONS: 10000,
};

/**
 * WASM Number Processing Thresholds
 */
export const WASM_NUMBER_THRESHOLDS = {
  // Stop counting candidates after this many (optimization - we know we'll use WASM anyway)
  MAX_CANDIDATE_COUNT_CHECK: 50,

  // Minimum candidates to justify WASM serialization overhead
  // Below this threshold, JavaScript is faster due to serialization cost
  MIN_CANDIDATES_FOR_WASM: 10,
};
