/**
 * Error Helper Utilities
 *
 * REFACTOR (2026-01-28): Provides consistent error message formatting across the codebase.
 * Eliminates inconsistent error message patterns like:
 * - "Failed to load: " + message
 * - `Save failed: ${error}`
 * - "Could not add: " + msg
 *
 * Benefits:
 * - Consistent error format for user-facing messages
 * - Type-safe error extraction from unknown types
 * - Centralized error logging patterns
 */

import { logger } from './logger';

/**
 * Format error message with consistent pattern
 *
 * Creates user-friendly error messages with consistent format:
 * "{Operation} failed: {error message}"
 *
 * Safely extracts error message from various error types:
 * - Error objects → error.message
 * - Strings → as-is
 * - Other types → String(error)
 *
 * @param operation - Human-readable operation name (e.g., "Dictionary loading", "Configuration save")
 * @param error - Error of any type (Error object, string, unknown)
 * @returns {string} Formatted error message
 *
 * @example
 * // Before refactoring:
 * catch (error) {
 *   setError('Failed to load dictionaries: ' + (error as Error).message);
 * }
 *
 * // After refactoring:
 * catch (error) {
 *   setError(formatErrorMessage('Dictionary loading', error));
 * }
 */
export function formatErrorMessage(operation: string, error: unknown): string {
  const message = extractErrorMessage(error);
  return `${operation} failed: ${message}`;
}

/**
 * Extract error message from unknown error type
 *
 * Safely extracts human-readable message from various error types.
 * Handles Error objects, strings, objects with message property, and other types.
 *
 * @param error - Error of any type
 * @returns {string} Error message
 *
 * @example
 * extractErrorMessage(new Error('Connection timeout')); // "Connection timeout"
 * extractErrorMessage('Invalid input'); // "Invalid input"
 * extractErrorMessage({ message: 'Parse error' }); // "Parse error"
 * extractErrorMessage(404); // "404"
 * extractErrorMessage(null); // "Unknown error"
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  if (error === null || error === undefined) {
    return 'Unknown error';
  }

  return String(error);
}

/**
 * Format error with detailed context
 *
 * Creates error message with additional context for debugging.
 * Includes operation, error message, and optional context details.
 *
 * @param operation - Operation that failed
 * @param error - Error object
 * @param context - Optional context object (e.g., { dictionaryId: 'characters', entryCount: 1234 })
 * @returns {string} Formatted error message with context
 *
 * @example
 * catch (error) {
 *   const msg = formatErrorWithContext(
 *     'Dictionary save',
 *     error,
 *     { dictionaryId: 'characters', entries: 1234 }
 *   );
 *   logger.error(msg);
 *   // "Dictionary save failed: Permission denied (dictionaryId: characters, entries: 1234)"
 * }
 */
export function formatErrorWithContext(
  operation: string,
  error: unknown,
  context?: Record<string, unknown>
): string {
  const baseMessage = formatErrorMessage(operation, error);

  if (!context || Object.keys(context).length === 0) {
    return baseMessage;
  }

  const contextStr = Object.entries(context)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  return `${baseMessage} (${contextStr})`;
}

/**
 * Log and format error (convenience function)
 *
 * Logs error to console and returns formatted message.
 * Useful for error handling where you need both logging and user message.
 *
 * @param operation - Operation that failed
 * @param error - Error object
 * @param context - Optional context for logging
 * @returns {string} Formatted error message
 *
 * @example
 * catch (error) {
 *   const message = logAndFormatError('Configuration save', error, { configSize: 1024 });
 *   toast.error(message); // Show to user
 *   // Error is already logged to console
 * }
 */
export function logAndFormatError(
  operation: string,
  error: unknown,
  context?: Record<string, unknown>
): string {
  const message = context
    ? formatErrorWithContext(operation, error, context)
    : formatErrorMessage(operation, error);

  logger.error(message, error);

  return message;
}

/**
 * Create error handler function with operation name
 *
 * Returns a reusable error handler for consistent error formatting.
 * Useful for creating operation-specific error handlers.
 *
 * @param operation - Operation name
 * @returns {Function} Error handler function
 *
 * @example
 * const handleLoadError = createErrorHandler('Dictionary loading');
 *
 * try {
 *   await loadDictionary();
 * } catch (error) {
 *   const message = handleLoadError(error);
 *   toast.error(message);
 * }
 */
export function createErrorHandler(operation: string): (error: unknown) => string {
  return (error: unknown) => formatErrorMessage(operation, error);
}

/**
 * Safe error message for user display
 *
 * Creates user-friendly error message, filtering sensitive information.
 * Removes stack traces, file paths, and other technical details.
 *
 * @param operation - Operation that failed
 * @param error - Error object
 * @param fallbackMessage - Optional fallback if error has no message
 * @returns {string} Sanitized error message
 *
 * @example
 * catch (error) {
 *   // Error: "ENOENT: no such file or directory, open '/Users/...'"
 *   const safeMsg = safeErrorMessage('File loading', error, 'File not found');
 *   // "File loading failed: File not found"
 * }
 */
export function safeErrorMessage(
  operation: string,
  error: unknown,
  fallbackMessage?: string
): string {
  let message = extractErrorMessage(error);

  // Remove technical details (file paths, stack traces)
  if (message.includes('ENOENT')) {
    message = fallbackMessage || 'File not found';
  } else if (message.includes('EACCES')) {
    message = fallbackMessage || 'Permission denied';
  } else if (message.includes('ETIMEDOUT')) {
    message = fallbackMessage || 'Operation timed out';
  } else if (message.length > 200) {
    // Truncate very long error messages
    message = message.substring(0, 200) + '...';
  }

  return `${operation} failed: ${message}`;
}

/**
 * Check if error is specific type
 *
 * Type guard for checking error types safely.
 *
 * @param error - Error to check
 * @param errorType - Error constructor to check against
 * @returns {boolean} True if error is instance of errorType
 *
 * @example
 * catch (error) {
 *   if (isErrorType(error, TypeError)) {
 *     console.log('Type error:', error.message);
 *   }
 * }
 */
export function isErrorType<T extends Error>(
  error: unknown,
  errorType: new (...args: any[]) => T
): error is T {
  return error instanceof errorType;
}
