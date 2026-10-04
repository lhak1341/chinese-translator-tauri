// @ts-check
import toast from './toast';
import { logger } from './logger';
import { TOAST_DURATIONS } from '../constants/toastConfig';

/**
 * FallbackManager - Manages failure tracking and fallback mode transitions
 *
 * Provides consistent failure handling across WASM/Rust accelerated systems.
 * Tracks consecutive failures, triggers fallback mode after threshold,
 * and shows one-time user notifications.
 *
 * EXTRACTED (2026-01-28): Eliminates 80+ lines of duplicate failure handling
 * logic from the Rust lookup-index builder (LookupIndexBuilder.ts); WasmDictionaryManager.js, its other user, was deleted 2026-10-04.
 *
 * @example
 * const fallback = new FallbackManager({
 *   systemName: 'WASM Dictionary Engine',
 *   maxFailures: 3,
 *   toastMessage: 'Dictionary system using slower fallback...',
 *   toastId: 'wasm-dict-fallback'
 * });
 *
 * try {
 *   await riskyOperation();
 *   fallback.recordSuccess(); // Reset failure counter
 * } catch (error) {
 *   fallback.recordFailure();
 *   if (fallback.isInFallbackMode()) {
 *     // Use fallback implementation
 *   }
 * }
 */
export class FallbackManager {
  /**
   * Create a new FallbackManager
   *
   * @param {{ systemName: string, maxFailures?: number, toastMessage: string, toastId: string, toastDuration?: number }} options - Configuration options
   *   systemName: Human-readable system name (for logging)
   *   maxFailures: Consecutive failures before fallback (default: 3)
   *   toastMessage: User-facing fallback notification message
   *   toastId: Unique toast ID (prevents duplicates)
   *   toastDuration: Toast display duration (default: TOAST_DURATIONS.LOAD_FAILURE)
   */
  // @ts-ignore - runtime validation (throws on missing required fields) enforces requirements
  constructor(options = {}) {
    // Validate required options
    if (!options.systemName) {
      throw new Error('FallbackManager requires systemName option');
    }
    if (!options.toastMessage) {
      throw new Error('FallbackManager requires toastMessage option');
    }
    if (!options.toastId) {
      throw new Error('FallbackManager requires toastId option');
    }

    this.systemName = options.systemName;
    this.consecutiveFailures = 0;
    this.maxFailures = options.maxFailures ?? 3;
    this.fallbackMode = false;
    this.showedFallbackWarning = false;

    // Toast configuration
    this.toastMessage = options.toastMessage;
    this.toastId = options.toastId;
    this.toastDuration = options.toastDuration ?? TOAST_DURATIONS.LOAD_FAILURE;
  }

  /**
   * Record a failure and potentially trigger fallback mode
   *
   * Increments consecutive failure counter. If threshold reached,
   * enters fallback mode and shows one-time user notification.
   *
   * @returns {boolean} True if just entered fallback mode, false otherwise
   */
  recordFailure() {
    this.consecutiveFailures++;

    logger.warn(`${this.systemName} failure (${this.consecutiveFailures}/${this.maxFailures})`);

    if (this.consecutiveFailures >= this.maxFailures && !this.fallbackMode) {
      logger.warn(`🚨 ${this.systemName} entering fallback mode after repeated failures`);
      this.fallbackMode = true;

      // Show one-time user notification
      if (!this.showedFallbackWarning) {
        toast.warning(this.toastMessage, {
          duration: this.toastDuration,
          id: this.toastId,
        });
        this.showedFallbackWarning = true;
      }

      return true; // Just entered fallback mode
    }

    return false;
  }

  /**
   * Record a successful operation
   *
   * Resets consecutive failure counter. Does NOT exit fallback mode
   * (system stays in fallback once entered).
   */
  recordSuccess() {
    if (this.consecutiveFailures > 0) {
      logger.log(`${this.systemName} recovered (resetting failure counter)`);
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Check if system is in fallback mode
   *
   * @returns {boolean} True if in fallback mode
   */
  isInFallbackMode() {
    return this.fallbackMode;
  }

  /**
   * Get current failure count
   *
   * @returns {number} Number of consecutive failures
   */
  getFailureCount() {
    return this.consecutiveFailures;
  }

  /**
   * Reset failure tracking (for testing or manual recovery)
   *
   * Resets failure counter but does NOT exit fallback mode.
   * Use exitFallbackMode() to fully reset.
   */
  reset() {
    this.consecutiveFailures = 0;
  }

  /**
   * Force exit from fallback mode (for testing or manual recovery)
   *
   * WARNING: Use with caution. System may immediately re-enter
   * fallback mode if underlying issue persists.
   */
  exitFallbackMode() {
    logger.log(`${this.systemName} manually exiting fallback mode`);
    this.fallbackMode = false;
    this.consecutiveFailures = 0;
    this.showedFallbackWarning = false;
  }

  /**
   * Get status summary (for debugging/monitoring)
   *
   * @returns {Object} Status object with failure tracking details
   */
  getStatus() {
    return {
      systemName: this.systemName,
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.maxFailures,
      fallbackMode: this.fallbackMode,
      showedFallbackWarning: this.showedFallbackWarning,
    };
  }
}
