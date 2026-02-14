/**
 * WASM Operation Timeout Wrapper
 *
 * Prevents long-running WASM operations from blocking the UI indefinitely.
 * Provides configurable timeouts with automatic cleanup.
 *
 * NOTE (2026-02-14): Integrated into WasmPatternProcessor.js:processTokensWasm() for the
 * highest-risk WASM call path. Because processTokens() is synchronous WASM, the timeout
 * cannot interrupt a truly hung call — it fires only after WASM returns. Protection against
 * truly blocking WASM would require a Web Worker. WasmNumberProcessor.js remains unwired.
 *
 * CODE REVIEW FIX (MEDIUM-8): Add timeout protection for WASM operations
 *
 * Usage:
 * ```javascript
 * import { callWasmWithTimeout } from './wasmOperationTimeout';
 *
 * try {
 *   const result = await callWasmWithTimeout(
 *     () => wasmProcessor.processTokens(tokens),
 *     5000, // 5 second timeout
 *     'pattern-processing'
 *   );
 * } catch (error) {
 *   if (error.name === 'TimeoutError') {
 *     // Handle timeout
 *   }
 * }
 * ```
 */

import { logger } from './logger';

/**
 * Custom timeout error
 */
export class TimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`WASM operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Default timeouts for different WASM operations (in milliseconds)
 */
export const DEFAULT_WASM_TIMEOUTS = {
  INITIALIZATION: 10000, // 10 seconds
  DICTIONARY_LOAD: 15000, // 15 seconds
  BATCH_LOAD: 30000, // 30 seconds
  TOKEN_PROCESSING: 5000, // 5 seconds
  PATTERN_MATCHING: 8000, // 8 seconds
  NUMBER_CONVERSION: 3000, // 3 seconds
  LOOKUP_INDEX: 10000, // 10 seconds
};

/**
 * Call a WASM operation with timeout protection
 *
 * @param {Function} operation - Async WASM operation
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Operation name for logging
 * @param {Object} options - Additional options
 * @param {boolean} options.logTimeout - Whether to log timeout events (default: true)
 * @param {boolean} options.throwOnTimeout - Whether to throw on timeout (default: true)
 * @param {any} options.fallbackValue - Value to return on timeout if not throwing
 * @returns {Promise<any>} Operation result or fallbackValue on timeout
 * @throws {TimeoutError} If operation times out and throwOnTimeout is true
 */
export async function callWasmWithTimeout(
  operation,
  timeoutMs,
  operationName = 'unknown',
  options = {}
) {
  const { logTimeout = true, throwOnTimeout = true, fallbackValue = null } = options;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    // Race between operation and timeout
    const result = await Promise.race([operation(), timeoutPromise]);

    // Clear timeout if operation completes first
    clearTimeout(timeoutId);

    return result;
  } catch (error) {
    // Clear timeout on error
    clearTimeout(timeoutId);

    if (error instanceof TimeoutError) {
      if (logTimeout) {
        logger.warn(`⚠️ WASM operation '${operationName}' exceeded ${timeoutMs}ms timeout`);
      }

      if (throwOnTimeout) {
        throw error;
      } else {
        logger.log(`⏱️ Returning fallback value for timed out operation: ${operationName}`);
        return fallbackValue;
      }
    }

    // Re-throw non-timeout errors
    throw error;
  }
}

/**
 * Create a timeout-wrapped version of a WASM function
 *
 * @param {Function} wasmFunction - WASM function to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Operation name for logging
 * @returns {Function} Wrapped function with timeout protection
 */
export function createTimeoutWrapper(wasmFunction, timeoutMs, operationName) {
  return async function (...args) {
    return callWasmWithTimeout(() => wasmFunction.apply(this, args), timeoutMs, operationName);
  };
}

/**
 * Timeout manager for tracking operation timeouts
 */
export class TimeoutManager {
  constructor() {
    this.stats = {
      totalOperations: 0,
      timedOutOperations: 0,
      timeoutsByOperation: new Map(),
    };
  }

  /**
   * Execute operation with timeout and track statistics
   */
  async executeWithTimeout(operation, timeoutMs, operationName) {
    this.stats.totalOperations++;

    try {
      return await callWasmWithTimeout(operation, timeoutMs, operationName, {
        logTimeout: true,
        throwOnTimeout: true,
      });
    } catch (error) {
      if (error instanceof TimeoutError) {
        this.stats.timedOutOperations++;

        const count = this.stats.timeoutsByOperation.get(operationName) || 0;
        this.stats.timeoutsByOperation.set(operationName, count + 1);
      }

      throw error;
    }
  }

  /**
   * Get timeout statistics
   */
  getStats() {
    const timeoutRate =
      this.stats.totalOperations > 0
        ? ((this.stats.timedOutOperations / this.stats.totalOperations) * 100).toFixed(2)
        : '0.00';

    return {
      ...this.stats,
      timeoutRate: `${timeoutRate}%`,
      timeoutsByOperation: Object.fromEntries(this.stats.timeoutsByOperation),
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalOperations: 0,
      timedOutOperations: 0,
      timeoutsByOperation: new Map(),
    };
  }
}

// Export singleton timeout manager
export const wasmTimeoutManager = new TimeoutManager();
