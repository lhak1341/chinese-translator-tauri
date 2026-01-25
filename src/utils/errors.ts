/**
 * Custom error classes for typed error handling
 * Replaces brittle string matching patterns with type-safe error checking
 */

/**
 * Base class for dictionary-related errors
 */
export class DictionaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DictionaryError';
  }
}

/**
 * Error thrown when dictionary entry validation fails
 * Used to distinguish validation errors from other errors for toast notification control
 */
export class ValidationError extends DictionaryError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when dictionary save operation fails
 */
export class SaveError extends DictionaryError {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Type guard to check if error is a SaveError
 */
export function isSaveError(error: unknown): error is SaveError {
  return error instanceof SaveError;
}

/**
 * Type guard to check if error is any DictionaryError
 */
export function isDictionaryError(error: unknown): error is DictionaryError {
  return error instanceof DictionaryError;
}
