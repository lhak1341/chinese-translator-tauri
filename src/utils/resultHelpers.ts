/**
 * Result Helper Utilities
 *
 * REFACTOR (2026-01-28): Utilities for handling ElectronAPI result patterns.
 * Reduces boilerplate `if (result.success && result.data)` checks across 12+ call sites.
 *
 * NOTE (2026-02-13): The `ElectronResult` type is used by `configValidation.ts`.
 * The runtime functions (`throwIfFailed`, `getOrDefault`, `wrapOperation`, etc.)
 * are NOT yet integrated at the 12+ call sites — migration was prepared but not completed.
 *
 * ElectronAPI operations return results in the format:
 * { success: boolean, data?: T, error?: string }
 *
 * These utilities provide type-safe result handling with consistent error messages.
 */

import { logger } from './logger';

/**
 * ElectronAPI result structure
 */
export interface ElectronResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Throw error if result indicates failure
 *
 * Validates ElectronAPI result and throws descriptive error if failed.
 * Returns unwrapped data if successful.
 *
 * @template T - Type of data returned on success
 * @param result - ElectronAPI result object
 * @param operationName - Human-readable operation name (for error messages)
 * @returns {T} Unwrapped data from result
 * @throws {Error} If result.success is false or data is missing
 *
 * @example
 * // Before refactoring:
 * const result = await window.electronAPI.loadDictionary('characters');
 * if (result.success && result.data) {
 *   processDictionary(result.data);
 * } else {
 *   throw new Error(result.error || 'Failed');
 * }
 *
 * // After refactoring:
 * const data = throwIfFailed(
 *   await window.electronAPI.loadDictionary('characters'),
 *   'Dictionary loading'
 * );
 * processDictionary(data);
 */
export function throwIfFailed<T>(result: ElectronResult<T>, operationName: string): T {
  if (result.success && result.data !== undefined) {
    return result.data;
  }

  const errorMessage = result.error || `${operationName} failed`;
  throw new Error(errorMessage);
}

/**
 * Get data or fallback value if result indicates failure
 *
 * Returns unwrapped data on success, or fallback value on failure.
 * Does not throw - always returns a value.
 *
 * @template T - Type of data
 * @param result - ElectronAPI result object
 * @param fallback - Value to return if operation failed
 * @param operationName - Optional operation name (for logging)
 * @returns {T} Data on success, fallback on failure
 *
 * @example
 * const config = getOrDefault(
 *   await window.electronAPI.loadConfiguration(),
 *   { wasmEnabled: true, wasmMemoryLimit: 20 },
 *   'Configuration loading'
 * );
 * // Always has a valid config (from API or fallback)
 */
export function getOrDefault<T>(result: ElectronResult<T>, fallback: T, operationName?: string): T {
  if (result.success && result.data !== undefined) {
    return result.data;
  }

  if (operationName) {
    logger.warn(`${operationName} failed, using fallback:`, result.error);
  }

  return fallback;
}

/**
 * Check if result is successful (type guard)
 *
 * TypeScript type guard that narrows result.data to non-undefined.
 * Use for conditional logic without throwing.
 *
 * @template T - Type of data
 * @param result - ElectronAPI result object
 * @returns {boolean} True if success and data present
 *
 * @example
 * const result = await window.electronAPI.loadDictionary('characters');
 *
 * if (isSuccess(result)) {
 *   // TypeScript knows result.data is T (not T | undefined)
 *   processDictionary(result.data);
 * } else {
 *   showError(result.error);
 * }
 */
export function isSuccess<T>(result: ElectronResult<T>): result is ElectronResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Wrap async operation with standardized error handling
 *
 * Executes async operation and converts thrown errors into ElectronResult format.
 * Useful for wrapping operations that may throw.
 *
 * @template T - Type of data returned on success
 * @param operation - Async operation to execute
 * @param operationName - Operation name for error messages
 * @returns {Promise<ElectronResult<T>>} Result object
 *
 * @example
 * const result = await wrapOperation(
 *   async () => {
 *     const data = await someRiskyOperation();
 *     return processData(data);
 *   },
 *   'Data processing'
 * );
 *
 * if (isSuccess(result)) {
 *   useData(result.data);
 * } else {
 *   showError(result.error);
 * }
 */
export async function wrapOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<ElectronResult<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${operationName} failed:`, error);
    return {
      success: false,
      error: `${operationName} failed: ${errorMessage}`,
    };
  }
}

/**
 * Transform result data without unwrapping
 *
 * Applies transformation function to result.data if present.
 * Preserves error state if result failed.
 *
 * @template T - Input data type
 * @template U - Output data type
 * @param result - ElectronAPI result object
 * @param transform - Transformation function
 * @returns {ElectronResult<U>} Transformed result
 *
 * @example
 * const dictResult = await window.electronAPI.loadDictionary('characters');
 * const entryCount = mapResult(dictResult, dict => dict.entries.length);
 *
 * if (isSuccess(entryCount)) {
 *   console.log('Dictionary has', entryCount.data, 'entries');
 * }
 */
export function mapResult<T, U>(
  result: ElectronResult<T>,
  transform: (data: T) => U
): ElectronResult<U> {
  if (isSuccess(result)) {
    try {
      const transformed = transform(result.data);
      return { success: true, data: transformed };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Transformation failed: ${errorMessage}` };
    }
  }

  return { success: false, error: result.error };
}
