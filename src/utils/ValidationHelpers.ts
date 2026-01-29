/**
 * Validation Helper Functions
 *
 * Pure utility functions for common validation patterns.
 * Extracted from TranslationEngine.js and other files (Priority 1 extraction).
 *
 * WHY EXTRACTABLE:
 * - Pure functions with zero `this.*` references
 * - No side effects or state modification
 * - Takes all data as parameters
 * - Returns boolean validation results
 * - Reusable across the entire application
 *
 * USAGE:
 * ```typescript
 * import { isEmptyString, isEmptyArray, isValidNumber } from './ValidationHelpers.js';
 *
 * if (isEmptyString(text)) {
 *   return 'Text is required';
 * }
 *
 * if (!isEmptyArray(results)) {
 *   processResults(results);
 * }
 * ```
 */

/**
 * Check if a string is empty or contains only whitespace
 *
 * @param value - Value to check
 * @returns True if empty or whitespace-only
 *
 * @example
 * isEmptyString('') // true
 * isEmptyString('   ') // true
 * isEmptyString('hello') // false
 * isEmptyString(null) // true
 * isEmptyString(undefined) // true
 */
export function isEmptyString(value: unknown): boolean {
  return !value || (typeof value === 'string' && value.trim() === '');
}

/**
 * Check if a value is a non-empty string
 * Inverse of isEmptyString, useful for validation
 *
 * @param value - Value to check
 * @returns True if non-empty string
 *
 * @example
 * isNonEmptyString('hello') // true
 * isNonEmptyString('') // false
 * isNonEmptyString('   ') // false
 * isNonEmptyString(null) // false
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Check if an array is empty or null/undefined
 *
 * @param value - Value to check
 * @returns True if empty, null, undefined, or not an array
 *
 * @example
 * isEmptyArray([]) // true
 * isEmptyArray(null) // true
 * isEmptyArray([1, 2, 3]) // false
 * isEmptyArray('not array') // true
 */
export function isEmptyArray(value: unknown): boolean {
  return !value || !Array.isArray(value) || value.length === 0;
}

/**
 * Check if a value is a non-empty array
 * Inverse of isEmptyArray
 *
 * @param value - Value to check
 * @returns True if non-empty array
 *
 * @example
 * isNonEmptyArray([1, 2, 3]) // true
 * isNonEmptyArray([]) // false
 * isNonEmptyArray(null) // false
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if a value is null or undefined
 *
 * @param value - Value to check
 * @returns True if null or undefined
 *
 * @example
 * isNullOrUndefined(null) // true
 * isNullOrUndefined(undefined) // true
 * isNullOrUndefined(0) // false
 * isNullOrUndefined('') // false
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if a value is defined (not null and not undefined)
 * Inverse of isNullOrUndefined
 *
 * @param value - Value to check
 * @returns True if defined (not null/undefined)
 *
 * @example
 * isDefined(0) // true
 * isDefined('') // true
 * isDefined(null) // false
 * isDefined(undefined) // false
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Check if a value is a valid number (not NaN, not Infinity)
 *
 * @param value - Value to check
 * @returns True if valid finite number
 *
 * @example
 * isValidNumber(42) // true
 * isValidNumber(3.14) // true
 * isValidNumber(NaN) // false
 * isValidNumber(Infinity) // false
 * isValidNumber('42') // false (string, not number)
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Check if a value is a positive number (> 0)
 *
 * @param value - Value to check
 * @returns True if positive number
 *
 * @example
 * isPositiveNumber(42) // true
 * isPositiveNumber(0) // false
 * isPositiveNumber(-5) // false
 * isPositiveNumber('42') // false
 */
export function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value > 0;
}

/**
 * Check if a value is a non-negative number (>= 0)
 *
 * @param value - Value to check
 * @returns True if non-negative number
 *
 * @example
 * isNonNegativeNumber(0) // true
 * isNonNegativeNumber(42) // true
 * isNonNegativeNumber(-5) // false
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isValidNumber(value) && value >= 0;
}

/**
 * Check if a value is an integer
 *
 * @param value - Value to check
 * @returns True if integer
 *
 * @example
 * isInteger(42) // true
 * isInteger(3.14) // false
 * isInteger('42') // false
 */
export function isInteger(value: unknown): value is number {
  return isValidNumber(value) && Number.isInteger(value);
}

/**
 * Check if a value is a plain object (not array, not null)
 *
 * @param value - Value to check
 * @returns True if plain object
 *
 * @example
 * isPlainObject({}) // true
 * isPlainObject({ a: 1 }) // true
 * isPlainObject([]) // false
 * isPlainObject(null) // false
 * isPlainObject(new Date()) // false
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Check if an object has a specific property with a non-null/undefined value
 *
 * @param obj - Object to check
 * @param prop - Property name
 * @returns True if property exists and is defined
 *
 * @example
 * hasDefinedProperty({ a: 1 }, 'a') // true
 * hasDefinedProperty({ a: null }, 'a') // false
 * hasDefinedProperty({ a: undefined }, 'a') // false
 * hasDefinedProperty({}, 'a') // false
 */
export function hasDefinedProperty(obj: unknown, prop: string): boolean {
  return isPlainObject(obj) && isDefined(obj[prop]);
}

/**
 * Check if a value is a function
 *
 * @param value - Value to check
 * @returns True if function
 *
 * @example
 * isFunction(() => {}) // true
 * isFunction(function() {}) // true
 * isFunction(async () => {}) // true
 * isFunction('not a function') // false
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Check if arrays have the same length
 *
 * @param arr1 - First array
 * @param arr2 - Second array
 * @returns True if both are arrays with same length
 *
 * @example
 * haveSameLength([1, 2], [3, 4]) // true
 * haveSameLength([1], [2, 3]) // false
 * haveSameLength([], null) // false
 */
export function haveSameLength(arr1: unknown, arr2: unknown): boolean {
  return Array.isArray(arr1) && Array.isArray(arr2) && arr1.length === arr2.length;
}

/**
 * Validate that a value is within a range (inclusive)
 *
 * @param value - Value to check
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns True if value is within range
 *
 * @example
 * isInRange(5, 1, 10) // true
 * isInRange(1, 1, 10) // true (inclusive)
 * isInRange(10, 1, 10) // true (inclusive)
 * isInRange(0, 1, 10) // false
 * isInRange(11, 1, 10) // false
 */
export function isInRange(value: unknown, min: number, max: number): boolean {
  return isValidNumber(value) && value >= min && value <= max;
}

/**
 * Validate that a string matches a pattern (regex or exact match)
 *
 * @param value - String to check
 * @param pattern - Pattern to match against
 * @returns True if string matches pattern
 *
 * @example
 * matchesPattern('hello', /^h/) // true
 * matchesPattern('hello', 'hello') // true
 * matchesPattern('hello', 'world') // false
 */
export function matchesPattern(value: unknown, pattern: string | RegExp): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  if (pattern instanceof RegExp) {
    return pattern.test(value);
  }

  if (typeof pattern === 'string') {
    return value === pattern;
  }

  return false;
}

/**
 * Validate that an object has all required properties
 *
 * @param obj - Object to validate
 * @param requiredProps - Array of required property names
 * @returns True if all properties exist and are defined
 *
 * @example
 * hasRequiredProperties({ a: 1, b: 2 }, ['a', 'b']) // true
 * hasRequiredProperties({ a: 1 }, ['a', 'b']) // false
 * hasRequiredProperties({ a: null, b: 2 }, ['a', 'b']) // false
 */
export function hasRequiredProperties(obj: unknown, requiredProps: string[]): boolean {
  if (!isPlainObject(obj) || !isNonEmptyArray<string>(requiredProps)) {
    return false;
  }

  return requiredProps.every((prop) => hasDefinedProperty(obj, prop));
}

/**
 * Token structure for validation
 */
export interface ValidatableToken {
  type: string;
  value: string;
  translated: string | null;
  [key: string]: unknown;
}

/**
 * Validate token object structure
 * Ensures token has required fields for translation processing
 *
 * @param token - Token to validate
 * @returns True if valid token structure
 *
 * @example
 * isValidToken({ type: 'chinese_char', value: '在', translated: null }) // true
 * isValidToken({ value: '在' }) // false (missing type)
 * isValidToken(null) // false
 */
export function isValidToken(token: unknown): token is ValidatableToken {
  return (
    isPlainObject(token) &&
    isNonEmptyString(token.type) &&
    isNonEmptyString(token.value) &&
    (token.translated === null || typeof token.translated === 'string')
  );
}

/**
 * Semantic arrays structure for validation
 */
export interface SemanticArrays {
  original: unknown[];
  translated: unknown[];
  metadata: unknown[];
  [key: string]: unknown;
}

/**
 * Validate semantic array structure
 * Ensures semantic arrays have matching lengths and valid data
 *
 * @param semanticArrays - Semantic arrays to validate
 * @returns True if valid semantic array structure
 *
 * @example
 * isValidSemanticArrays({
 *   original: ['在'],
 *   translated: ['ở'],
 *   metadata: [{ source: 'character' }]
 * }) // true
 *
 * isValidSemanticArrays({
 *   original: ['在'],
 *   translated: [] // length mismatch
 * }) // false
 */
export function isValidSemanticArrays(semanticArrays: unknown): semanticArrays is SemanticArrays {
  if (
    !isPlainObject(semanticArrays) ||
    !isNonEmptyArray(semanticArrays.original) ||
    !isNonEmptyArray(semanticArrays.translated) ||
    !isNonEmptyArray(semanticArrays.metadata)
  ) {
    return false;
  }

  const length = semanticArrays.original.length;
  return semanticArrays.translated.length === length && semanticArrays.metadata.length === length;
}
