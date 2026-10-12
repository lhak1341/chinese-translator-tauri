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
  /** Minimum time between UI updates (ms) */
  readonly MIN_UI_UPDATE_INTERVAL_MS: number;
}

/**
 * Progress callback and UI update thresholds
 */
export const UI_UPDATE_THRESHOLDS: UIUpdateThresholds = {
  /**
   * Minimum time between UI updates (ms)
   * Prevents UI thrashing during rapid translations
   */
  MIN_UI_UPDATE_INTERVAL_MS: 100,
} as const;
