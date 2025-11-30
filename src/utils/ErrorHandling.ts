/**
 * Centralized error handling patterns for the translation system
 *
 * Provides consistent error handling strategies across the codebase:
 * - User-facing operations: Throw with context
 * - Fallback operations: Log warning + return fallback
 * - Silent recovery: Minimal logging + compute
 *
 * This eliminates the current inconsistency where some errors crash the app,
 * some are silently swallowed, and some provide helpful context.
 */

/**
 * Error context for additional information
 */
export type ErrorContext = Record<string, any>;

/**
 * Custom error class for translation-specific errors
 * Provides structured error information for debugging
 */
export class TranslationError extends Error {
  public readonly context: ErrorContext;
  public readonly timestamp: string;

  constructor(message: string, context: ErrorContext = {}) {
    super(message);
    this.name = 'TranslationError';
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Capture stack trace (V8-specific but works in most modern engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TranslationError);
    }
  }

  /**
   * Get formatted error message with context
   */
  getDetailedMessage(): string {
    const contextStr = Object.entries(this.context)
      .map(([key, value]) => {
        // Truncate long values
        const valStr = typeof value === 'string' && value.length > 100
          ? value.substring(0, 100) + '...'
          : JSON.stringify(value);
        return `${key}: ${valStr}`;
      })
      .join(', ');

    return `${this.message} (${contextStr})`;
  }
}

/**
 * Error handling strategies enumeration
 */
export const ErrorStrategy = {
  /** Throw error - for user-facing operations that should fail visibly */
  THROW: 'throw',

  /** Log warning + fallback - for operations with alternative approaches */
  FALLBACK: 'fallback',

  /** Silent recovery - for non-critical operations */
  SILENT: 'silent',
} as const;

/**
 * Type for error strategy values
 */
export type ErrorStrategyValue = typeof ErrorStrategy[keyof typeof ErrorStrategy];

/**
 * Error callback function type
 */
export type ErrorCallback = (error: Error, operation: string, context: ErrorContext) => void;

/**
 * Options for error handling
 */
export interface ErrorOptions<T = any> {
  /** Value to return for FALLBACK/SILENT strategies */
  fallbackValue?: T;

  /** Additional context for error reporting */
  context?: ErrorContext;

  /** Custom error callback */
  onError?: ErrorCallback;
}

/**
 * Handle errors according to specified strategy
 *
 * @param error - The error to handle
 * @param operation - Name of the operation that failed
 * @param strategy - Error handling strategy from ErrorStrategy
 * @param options - Additional options
 * @returns Fallback value if strategy is FALLBACK/SILENT, otherwise throws
 *
 * @example
 * ```ts
 * // User-facing operation
 * try {
 *   return await translate(text);
 * } catch (error) {
 *   handleError(error, 'translate', ErrorStrategy.THROW, {
 *     context: { textLength: text.length }
 *   });
 * }
 * ```
 *
 * @example
 * ```ts
 * // WASM fallback operation
 * try {
 *   return await wasmDictionary.load();
 * } catch (error) {
 *   return handleError(error, 'wasmDictionary.load', ErrorStrategy.FALLBACK, {
 *     fallbackValue: await jsDictionary.load()
 *   });
 * }
 * ```
 *
 * @example
 * ```ts
 * // Silent recovery
 * try {
 *   return cache.get(key);
 * } catch (error) {
 *   return handleError(error, 'cache.get', ErrorStrategy.SILENT, {
 *     fallbackValue: computeValue(key)
 *   });
 * }
 * ```
 */
export function handleError<T = any>(
  error: unknown,
  operation: string,
  strategy: ErrorStrategyValue,
  options: ErrorOptions<T> = {}
): T | never {
  const {
    fallbackValue = null as T,
    context = {},
    onError = null
  } = options;

  const err = error instanceof Error ? error : new Error(String(error));

  // Call custom error callback if provided
  if (onError) {
    try {
      onError(err, operation, context);
    } catch (callbackError) {
      console.error('Error in custom error callback:', callbackError);
    }
  }

  switch (strategy) {
    case ErrorStrategy.THROW: {
      // User-facing operations: throw with full context
      const translationError = err instanceof TranslationError
        ? err
        : new TranslationError(
            `Operation '${operation}' failed: ${err.message}`,
            { ...context, originalError: err.name }
          );

      console.error(`❌ ${operation} failed:`, translationError.getDetailedMessage());
      throw translationError;
    }

    case ErrorStrategy.FALLBACK: {
      // Fallback operations: warn and return alternative
      console.warn(
        `⚠️ ${operation} failed, using fallback:`,
        err.message,
        context
      );
      return fallbackValue;
    }

    case ErrorStrategy.SILENT: {
      // Silent recovery: minimal logging in development only
      if (process.env.NODE_ENV === 'development') {
        console.debug(`ℹ️ ${operation} failed silently:`, err.message);
      }
      return fallbackValue;
    }

    default: {
      console.error(`Unknown error strategy: ${strategy}, defaulting to THROW`);
      throw err;
    }
  }
}

/**
 * Wrap an async operation with consistent error handling
 *
 * @param operation - Async function to execute
 * @param operationName - Name for error reporting
 * @param strategy - Error handling strategy
 * @param options - Additional options (same as handleError)
 * @returns Result or fallback value
 *
 * @example
 * ```ts
 * const result = await withErrorHandling(
 *   () => wasmAccelerator.process(text),
 *   'wasmAccelerator.process',
 *   ErrorStrategy.FALLBACK,
 *   { fallbackValue: jsAccelerator.process(text) }
 * );
 * ```
 */
export async function withErrorHandling<T = any>(
  operation: () => Promise<T>,
  operationName: string,
  strategy: ErrorStrategyValue,
  options: ErrorOptions<T> = {}
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return handleError(error, operationName, strategy, options);
  }
}

/**
 * Wrap a synchronous operation with consistent error handling
 *
 * @param operation - Synchronous function to execute
 * @param operationName - Name for error reporting
 * @param strategy - Error handling strategy
 * @param options - Additional options (same as handleError)
 * @returns Result or fallback value
 */
export function withErrorHandlingSync<T = any>(
  operation: () => T,
  operationName: string,
  strategy: ErrorStrategyValue,
  options: ErrorOptions<T> = {}
): T {
  try {
    return operation();
  } catch (error) {
    return handleError(error, operationName, strategy, options);
  }
}

/**
 * Options for retry operations
 */
export interface RetryOptions {
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;

  /** Delay between retries in ms (default: 100) */
  delayMs?: number;

  /** Predicate to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Create a retry wrapper for operations that may fail transiently
 *
 * @param operation - Async operation to retry
 * @param options - Retry configuration
 * @returns Result of operation
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetchDictionary(url),
 *   {
 *     maxRetries: 3,
 *     delayMs: 1000,
 *     shouldRetry: (error) => error.message.includes('ECONNRESET')
 *   }
 * );
 * ```
 */
export async function withRetry<T = any>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 100,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Check if we should retry this error
      if (!shouldRetry(err)) {
        throw err;
      }

      // Don't delay after last attempt
      if (attempt < maxRetries) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries exhausted
  throw new TranslationError(
    `Operation failed after ${maxRetries} retries`,
    { lastError: lastError?.message }
  );
}

/**
 * Validation error - for input validation failures
 */
export class ValidationError extends TranslationError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, context);
    this.name = 'ValidationError';
  }
}

/**
 * Dictionary error - for dictionary loading/lookup failures
 */
export class DictionaryError extends TranslationError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, context);
    this.name = 'DictionaryError';
  }
}

/**
 * WASM error - for WASM-specific failures
 */
export class WasmError extends TranslationError {
  constructor(message: string, context: ErrorContext = {}) {
    super(message, context);
    this.name = 'WasmError';
  }
}

/**
 * Validate input and throw ValidationError if invalid
 *
 * @param condition - Condition that should be true
 * @param message - Error message if condition is false
 * @param context - Additional context
 *
 * @example
 * ```ts
 * validate(text && text.length > 0, 'Text cannot be empty', { textLength: text?.length });
 * ```
 */
export function validate(condition: boolean, message: string, context: ErrorContext = {}): asserts condition {
  if (!condition) {
    throw new ValidationError(message, context);
  }
}
