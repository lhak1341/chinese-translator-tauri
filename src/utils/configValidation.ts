/**
 * Configuration Validation Utilities
 *
 * Validates configuration and dictionary data loaded from files to prevent
 * crashes from malformed or malicious input. All external data should be
 * validated before use.
 *
 * Security: Prevents code injection, type confusion, and unexpected crashes
 * from corrupted or tampered configuration files.
 */

import { logger } from './logger';
import { ValidationError } from './errors';
import type { ApiResult } from './resultHelpers';
export type { ApiResult as ElectronAPIResult } from './resultHelpers';

/**
 * Validate electronAPI result structure
 *
 * @param result - Raw result from electronAPI call
 * @param operation - Operation name for error messages
 * @returns Validated result
 * @throws ValidationError if structure is invalid
 */
export function validateApiResult<T>(result: unknown, operation: string): ApiResult<T> {
  if (!result || typeof result !== 'object') {
    throw new ValidationError(
      `${operation} returned invalid result: expected object, got ${typeof result}`,
      'result',
      result
    );
  }

  const obj = result as Record<string, unknown>;

  // success field is required and must be boolean
  if (typeof obj.success !== 'boolean') {
    throw new ValidationError(
      `${operation} result missing or invalid 'success' field`,
      'success',
      obj.success
    );
  }

  // If success=true, data should be present
  if (obj.success && obj.data === undefined) {
    logger.warn(`${operation} succeeded but returned no data`);
  }

  // If success=false, error message should be present
  if (!obj.success && typeof obj.error !== 'string') {
    logger.warn(`${operation} failed but provided no error message`);
  }

  // At this point we know obj has a boolean 'success' field, so it's safe to cast
  return obj as unknown as ApiResult<T>;
}

/**
 * Sanitize string to prevent injection attacks
 *
 * @param str - Raw string
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string
 */
export function sanitizeString(str: unknown, maxLength: number = 1000): string {
  if (typeof str !== 'string') {
    return '';
  }

  // Remove control characters and limit length
  const sanitized = str
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .slice(0, maxLength);

  return sanitized;
}
