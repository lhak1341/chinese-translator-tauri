/**
 * Centralized performance thresholds and configuration constants
 *
 * These values control rendering optimization and
 * WASM acceleration activation throughout the translation system.
 *
 * ⚠️ WARNING: Changing these values can significantly impact performance
 * and system behavior. Consult CLAUDE.md before modifying.
 */

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
