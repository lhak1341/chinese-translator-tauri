/**
 * Shared WASM Error Categorization and Handling
 *
 * Provides centralized error categorization for all WASM components.
 * Reduces duplicate code and ensures consistent error handling across
 * number processor, pattern processor, dictionary manager, and lookup index.
 *
 * CODE REVIEW FIX (MEDIUM-1): Extract common error categorization logic
 *
 * Usage:
 * ```javascript
 * import { categorizeWasmError, createWasmErrorHandler } from './wasmErrorHandler';
 *
 * try {
 *   await wasmOperation();
 * } catch (error) {
 *   const errorInfo = categorizeWasmError(error, 'number-processor');
 *   if (errorInfo.shouldReport) {
 *     reportToErrorTracker(error, errorInfo);
 *   }
 * }
 * ```
 */

import { logger } from './logger';

/**
 * Error categories for WASM operations
 */
export const WASM_ERROR_TYPES = {
  VALIDATION: 'validation',
  SERIALIZATION: 'serialization',
  WASM_RUNTIME: 'wasm_runtime',
  INITIALIZATION: 'initialization',
  MEMORY: 'memory',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

/**
 * Categorize WASM error for better diagnostics
 *
 * @param {Error} error - The error to categorize
 * @param {string} component - Component name (e.g., 'number-processor', 'pattern-processor')
 * @returns {Object} Error information
 * @returns {string} return.type - Error type from WASM_ERROR_TYPES
 * @returns {string} return.userMessage - User-friendly error message
 * @returns {boolean} return.shouldReport - Whether to report to error tracking
 * @returns {boolean} return.isTransient - Whether error is transient (retryable)
 * @returns {string} return.component - Component that generated the error
 */
export function categorizeWasmError(error, component = 'unknown') {
  const message = error.message?.toLowerCase() || String(error).toLowerCase();

  // Validation errors (data format issues)
  if (
    message.includes('validation') ||
    message.includes('undefined') ||
    message.includes('invalid')
  ) {
    return {
      type: WASM_ERROR_TYPES.VALIDATION,
      userMessage: `${component} data validation failed`,
      shouldReport: true,
      isTransient: false,
      component,
    };
  }

  // CODE REVIEW FIX 2026-02-01 (HIGH-2): Reorder from most specific to most general
  // This prevents unreachable conditions where specific errors are caught by general checks

  // Initialization errors (check BEFORE serialization)
  // Example: "Failed to load WASM: JSON parse error" should be initialization, not serialization
  if (message.includes('init') || message.includes('load')) {
    const isTransient = message.includes('network') || message.includes('fetch');
    return {
      type: WASM_ERROR_TYPES.INITIALIZATION,
      userMessage: `${component} initialization failed`,
      shouldReport: true,
      isTransient,
      component,
    };
  }

  // WASM runtime errors (check BEFORE serialization)
  // Ensures WASM-specific errors are categorized correctly
  if (message.includes('wasm') || message.includes('module')) {
    return {
      type: WASM_ERROR_TYPES.WASM_RUNTIME,
      userMessage: `${component} runtime error`,
      shouldReport: true,
      isTransient: false,
      component,
    };
  }

  // Serialization errors (boundary crossing issues)
  // Now checked AFTER more specific initialization/runtime errors
  if (message.includes('serialization') || message.includes('parse') || message.includes('json')) {
    const isTransient = !message.includes('format'); // Format errors are permanent
    return {
      type: WASM_ERROR_TYPES.SERIALIZATION,
      userMessage: `${component} data format error`,
      shouldReport: true,
      isTransient,
      component,
    };
  }

  // Memory errors (can be transient if due to pressure)
  if (message.includes('memory') || message.includes('allocation')) {
    return {
      type: WASM_ERROR_TYPES.MEMORY,
      userMessage: `${component} memory error`,
      shouldReport: true,
      isTransient: true, // Memory pressure might be temporary
      component,
    };
  }

  // Network errors (transient)
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return {
      type: WASM_ERROR_TYPES.NETWORK,
      userMessage: `${component} network error`,
      shouldReport: false, // Don't report network issues
      isTransient: true,
      component,
    };
  }

  // Timeout errors (transient)
  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      type: WASM_ERROR_TYPES.TIMEOUT,
      userMessage: `${component} operation timeout`,
      shouldReport: false,
      isTransient: true,
      component,
    };
  }

  // Unknown error type
  return {
    type: WASM_ERROR_TYPES.UNKNOWN,
    userMessage: `${component} error`,
    shouldReport: true,
    isTransient: false, // Assume permanent unless proven otherwise
    component,
  };
}

/**
 * Create a standardized WASM error handler
 *
 * @param {string} component - Component name
 * @param {Object} options - Handler options
 * @param {boolean} options.logErrors - Whether to log errors (default: true)
 * @param {boolean} options.reportToTracker - Whether to report to error tracker (default: true)
 * @param {Function} options.onError - Custom error callback
 * @returns {Function} Error handler function
 */
export function createWasmErrorHandler(component, options = {}) {
  const { logErrors = true, reportToTracker = true, onError } = options;

  return (error, context = {}) => {
    const errorInfo = categorizeWasmError(error, component);

    // Log error
    if (logErrors) {
      logger.error(`❌ WASM ${component} ${errorInfo.type} error:`, error.message, context);
    }

    // Report to error tracking if enabled and appropriate
    if (
      reportToTracker &&
      errorInfo.shouldReport &&
      typeof window !== 'undefined' &&
      window.errorTracker
    ) {
      window.errorTracker.captureException(error, {
        tags: {
          component: errorInfo.component,
          error_type: errorInfo.type,
          is_transient: errorInfo.isTransient,
        },
        extra: context,
      });
    }

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo, context);
    }

    return errorInfo;
  };
}

/**
 * Format error for user display
 *
 * @param {Object} errorInfo - Error information from categorizeWasmError
 * @param {boolean} includeDetails - Whether to include technical details
 * @returns {string} Formatted error message
 */
export function formatWasmError(errorInfo, includeDetails = false) {
  let message = errorInfo.userMessage;

  if (includeDetails && errorInfo.type !== WASM_ERROR_TYPES.UNKNOWN) {
    message += ` (${errorInfo.type})`;
  }

  // Add recovery suggestion for transient errors
  if (errorInfo.isTransient) {
    message += '. This may be temporary, please try again.';
  }

  return message;
}

/**
 * Check if error should trigger fallback mode
 *
 * @param {Object} errorInfo - Error information from categorizeWasmError
 * @returns {boolean} True if should enter fallback
 */
export function shouldEnterFallback(errorInfo) {
  // Transient errors should be retried, not fallen back
  if (errorInfo.isTransient) {
    return false;
  }

  // Permanent errors trigger fallback
  const permanentTypes = [
    WASM_ERROR_TYPES.VALIDATION,
    WASM_ERROR_TYPES.WASM_RUNTIME,
    WASM_ERROR_TYPES.INITIALIZATION,
  ];

  return permanentTypes.includes(errorInfo.type);
}
