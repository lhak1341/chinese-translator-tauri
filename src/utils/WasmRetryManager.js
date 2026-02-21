/**
 * WASM Retry Manager
 *
 * Provides exponential backoff retry logic for transient WASM failures.
 * Distinguishes between transient errors (network, memory pressure) and
 * permanent failures (initialization errors, incompatible WASM).
 *
 * CODE REVIEW FIX (HIGH-4): Add retry logic before permanent fallback
 *
 * Usage:
 * ```javascript
 * const retryManager = new WasmRetryManager();
 *
 * try {
 *   const result = await retryManager.retryWithBackoff(
 *     async () => await wasmOperation(),
 *     'number-processor-init'
 *   );
 * } catch (error) {
 *   // All retries exhausted, use fallback
 * }
 * ```
 */

import { logger } from './logger';

class WasmRetryManager {
  /**
   * Create a new retry manager
   * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
   * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
   * @param {number} maxDelay - Maximum delay between retries (default: 8000)
   */
  constructor(maxRetries = 3, baseDelay = 1000, maxDelay = 8000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;

    // Track retry statistics
    this.stats = {
      totalOperations: 0,
      totalRetries: 0,
      successAfterRetry: 0,
      permanentFailures: 0,
    };
  }

  /**
   * Determine if an error is transient (worth retrying)
   * @param {Error} error - The error to categorize
   * @returns {boolean} True if error is likely transient
   */
  isTransientError(error) {
    const message = error.message?.toLowerCase() || '';

    // Network-related errors (WASM module loading)
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection')
    ) {
      return true;
    }

    // Memory-related errors (temporary pressure)
    if (message.includes('memory') || message.includes('allocation')) {
      return true;
    }

    // Resource temporarily unavailable
    if (message.includes('busy') || message.includes('locked') || message.includes('unavailable')) {
      return true;
    }

    // Serialization errors might be transient (corrupted buffer state)
    if (message.includes('serialization') && !message.includes('format')) {
      return true;
    }

    // Default: Assume non-transient
    return false;
  }

  /**
   * Calculate delay for retry attempt with exponential backoff
   * @param {number} attemptNumber - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attemptNumber) {
    const exponentialDelay = this.baseDelay * Math.pow(2, attemptNumber);
    // Add jitter (±25%) to prevent thundering herd
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delayWithJitter = Math.floor(exponentialDelay + jitter);
    // Cap at maxDelay
    return Math.min(delayWithJitter, this.maxDelay);
  }

  /**
   * Retry an operation with exponential backoff
   * @param {Function} operation - Async operation to retry
   * @param {string} context - Operation context for logging
   * @param {Object} options - Retry options
   * @param {boolean} options.onlyRetryTransient - Only retry transient errors (default: true)
   * @returns {Promise<any>} Operation result
   * @throws {Error} After all retries exhausted
   */
  async retryWithBackoff(operation, context, options = {}) {
    const { onlyRetryTransient = true } = options;

    this.stats.totalOperations++;
    let lastError;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await operation();

        // Success
        if (attempt > 0) {
          this.stats.successAfterRetry++;
          logger.log(
            `✅ WASM ${context} succeeded after ${attempt} ${attempt === 1 ? 'retry' : 'retries'}`
          );
        }

        return result;
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === this.maxRetries - 1;

        // Check if we should retry this error
        const shouldRetry = !onlyRetryTransient || this.isTransientError(error);

        if (!shouldRetry) {
          logger.warn(
            `⚠️ WASM ${context} failed with non-transient error, not retrying:`,
            error.message
          );
          this.stats.permanentFailures++;
          throw error;
        }

        if (isLastAttempt) {
          logger.error(
            `❌ WASM ${context} failed after ${this.maxRetries} attempts:`,
            error.message
          );
          this.stats.permanentFailures++;
          throw error;
        }

        // Calculate delay and retry
        this.stats.totalRetries++;
        const delay = this.calculateDelay(attempt);
        logger.log(
          `🔄 WASM ${context} failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms...`
        );
        logger.log(`   Error: ${error.message}`);

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Should never reach here, but just in case
    throw lastError;
  }

  /**
   * Get retry statistics
   * @returns {Object} Retry stats
   */
  getStats() {
    const successRate =
      this.stats.totalOperations > 0
        ? ((this.stats.totalOperations - this.stats.permanentFailures) /
            this.stats.totalOperations) *
          100
        : 0;

    const retrySuccessRate =
      this.stats.totalRetries > 0
        ? (this.stats.successAfterRetry / this.stats.totalRetries) * 100
        : 0;

    return {
      ...this.stats,
      successRate: successRate.toFixed(1) + '%',
      retrySuccessRate: retrySuccessRate.toFixed(1) + '%',
      averageRetriesPerOperation:
        this.stats.totalOperations > 0
          ? (this.stats.totalRetries / this.stats.totalOperations).toFixed(2)
          : 0,
    };
  }

  /**
   * Reset retry statistics
   */
  resetStats() {
    this.stats = {
      totalOperations: 0,
      totalRetries: 0,
      successAfterRetry: 0,
      permanentFailures: 0,
    };
  }
}

// Export singleton instance with default configuration
export const wasmRetryManager = new WasmRetryManager();

// Export class for custom configurations
export default WasmRetryManager;
