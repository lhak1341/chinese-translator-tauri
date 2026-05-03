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
