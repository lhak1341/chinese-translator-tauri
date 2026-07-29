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
  /** Above this, trim synchronously instead of waiting for idle time */
  readonly SEGMENT_CLEANUP_HARD_CEILING: number;
  /** Trigger batchPerformanceHistory trim at 'background' severity above this length */
  readonly BATCH_HISTORY_TRIGGER_BACKGROUND: number;
  /** Keep this many batchPerformanceHistory entries after a 'background' trim */
  readonly BATCH_HISTORY_KEEP_BACKGROUND: number;
  /** Trigger batchPerformanceHistory trim at 'elevated' severity above this length */
  readonly BATCH_HISTORY_TRIGGER_ELEVATED: number;
  /** Keep this many batchPerformanceHistory entries after an 'elevated' trim */
  readonly BATCH_HISTORY_KEEP_ELEVATED: number;
  /** Trigger memory-snapshot trim at 'background' severity above this length */
  readonly MEMORY_SNAPSHOT_TRIGGER_BACKGROUND: number;
  /** Keep this many memory snapshots after a 'background' trim */
  readonly MEMORY_SNAPSHOT_KEEP_BACKGROUND: number;
  /** Trigger memory-snapshot trim at 'elevated' severity above this length */
  readonly MEMORY_SNAPSHOT_TRIGGER_ELEVATED: number;
  /** Keep this many memory snapshots after an 'elevated' trim */
  readonly MEMORY_SNAPSHOT_KEEP_ELEVATED: number;
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
   * Above this, the push site trims synchronously instead of deferring to
   * requestIdleCallback/setTimeout — closes the gap where a synchronous burst
   * of pushes (or idle time getting starved under load) lets the count run
   * away before the deferred cleanup ever gets to run.
   */
  SEGMENT_CLEANUP_HARD_CEILING: 100,

  /**
   * BatchMemoryCleanup thresholds (architecture review 2026-07-29, candidate #1).
   * batchPerformanceHistory and memory-tracker snapshots are the only two resources
   * with a real, safe trim operation across every severity — the values below carry
   * forward this codebase's existing per-site numbers (background = former
   * memoryCoordinator.onBackground values, elevated = former onHighPriority values).
   */
  BATCH_HISTORY_TRIGGER_BACKGROUND: 100,
  BATCH_HISTORY_KEEP_BACKGROUND: 50,
  BATCH_HISTORY_TRIGGER_ELEVATED: 50,
  BATCH_HISTORY_KEEP_ELEVATED: 20,
  MEMORY_SNAPSHOT_TRIGGER_BACKGROUND: 25,
  MEMORY_SNAPSHOT_KEEP_BACKGROUND: 15,
  MEMORY_SNAPSHOT_TRIGGER_ELEVATED: 20,
  MEMORY_SNAPSHOT_KEEP_ELEVATED: 10,
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
