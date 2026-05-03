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
   * Used in critical memory situations.
   * CODE REVIEW FIX (HIGH-4): Raised from 3 → 10. Keeping only 3 segments after
   * emergency cleanup wiped essentially all clickable highlighting (expected max ≤35).
   * 10 preserves a minimal but functional set of highlights even under pressure.
   */
  EMERGENCY_CLEANUP_THRESHOLD: 10,

  /**
   * Critical memory cleanup threshold
   * Used when memory pressure is detected.
   * CODE REVIEW FIX (HIGH-4): Raised from 5 → 20. Keeping only 5 segments after
   * critical cleanup was almost as destructive as emergency. 20 keeps reasonable
   * highlighting coverage while still aggressively reducing segment count.
   */
  CRITICAL_CLEANUP_THRESHOLD: 20,
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
   * Prevents streaming UI from appearing for very short texts
   * 10 chunks ≈ 200-400 characters (~1 paragraph)
   */
  STREAMING_MIN_CHUNKS: 10,
} as const;
