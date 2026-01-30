import { logger } from './logger';

/**
 * Translation Input Validator
 *
 * Validates text input for translation to prevent memory exhaustion and security issues.
 * Pure utility class with static methods - no side effects (no toast calls).
 *
 * Security validations:
 * - Text length limits (prevents memory exhaustion)
 * - Control character detection (prevents injection attacks)
 *
 * @example
 * const result = TranslationInputValidator.validateInput(text);
 * if (!result.valid) {
 *   toast.error(result.error, { duration: 5000 });
 *   return;
 * }
 */
export class TranslationInputValidator {
  /**
   * Maximum allowed text length (500KB)
   * Prevents memory exhaustion from extremely large inputs
   */
  static MAX_TEXT_LENGTH = 500000;

  /**
   * Regex for detecting invalid control characters
   * Allows: \n (0x0A), \t (0x09), \r (0x0D)
   * Rejects: Other control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
   */
  static INVALID_CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

  /**
   * Validate text length
   *
   * @param {string} text - Text to validate
   * @returns {Object} Validation result
   * @returns {boolean} returns.valid - Whether validation passed
   * @returns {string} [returns.error] - Error message if validation failed
   * @returns {number} [returns.sizeKB] - Text size in KB (for error reporting)
   * @returns {number} [returns.maxKB] - Maximum allowed size in KB (for error reporting)
   */
  static validateLength(text) {
    if (text.length > this.MAX_TEXT_LENGTH) {
      const sizeKB = (text.length / 1024).toFixed(1);
      const maxKB = (this.MAX_TEXT_LENGTH / 1024).toFixed(0);
      logger.warn(`Validation failed: text size ${sizeKB}KB exceeds ${maxKB}KB limit`);
      return {
        valid: false,
        error: `Text too large: ${sizeKB}KB. Maximum allowed: ${maxKB}KB`,
        sizeKB: parseFloat(sizeKB),
        maxKB: parseInt(maxKB, 10),
      };
    }
    return { valid: true };
  }

  /**
   * Validate text for invalid control characters
   *
   * @param {string} text - Text to validate
   * @returns {Object} Validation result
   * @returns {boolean} returns.valid - Whether validation passed
   * @returns {string} [returns.error] - Error message if validation failed
   */
  static validateControlCharacters(text) {
    if (this.INVALID_CONTROL_CHARS_REGEX.test(text)) {
      logger.warn('Validation failed: text contains invalid control characters');
      return {
        valid: false,
        error: 'Text contains invalid control characters',
      };
    }
    return { valid: true };
  }

  /**
   * Comprehensive input validation
   * Runs all validation checks and returns first failure
   *
   * @param {string} text - Text to validate
   * @returns {Object} Validation result
   * @returns {boolean} returns.valid - Whether all validations passed
   * @returns {string} [returns.error] - Error message if validation failed
   * @returns {string} [returns.failedCheck] - Which validation check failed
   */
  static validateInput(text) {
    // Validation #1: Check text length
    const lengthResult = this.validateLength(text);
    if (!lengthResult.valid) {
      return {
        ...lengthResult,
        failedCheck: 'length',
      };
    }

    // Validation #2: Check for control characters (security)
    const controlCharsResult = this.validateControlCharacters(text);
    if (!controlCharsResult.valid) {
      return {
        ...controlCharsResult,
        failedCheck: 'controlCharacters',
      };
    }

    // All validations passed
    return { valid: true };
  }

  /**
   * Sanitize input text by removing invalid control characters
   * Use with caution - validation is preferred over sanitization
   *
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text with invalid control characters removed
   */
  static sanitizeInput(text) {
    // Use global flag to replace all occurrences
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /**
   * Get validation statistics for a text
   * Useful for debugging and monitoring
   *
   * @param {string} text - Text to analyze
   * @returns {Object} Validation statistics
   * @returns {number} returns.length - Text length in characters
   * @returns {number} returns.sizeKB - Text size in KB
   * @returns {boolean} returns.hasInvalidControlChars - Whether text contains invalid control characters
   * @returns {boolean} returns.exceedsMaxLength - Whether text exceeds maximum length
   */
  static getValidationStats(text) {
    return {
      length: text.length,
      sizeKB: parseFloat((text.length / 1024).toFixed(1)),
      hasInvalidControlChars: this.INVALID_CONTROL_CHARS_REGEX.test(text),
      exceedsMaxLength: text.length > this.MAX_TEXT_LENGTH,
    };
  }
}
