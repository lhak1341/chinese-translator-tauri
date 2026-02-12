import { logger } from './logger';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  failedCheck?: string;
  sizeKB?: number;
  maxKB?: number;
}

export interface ValidationStats {
  length: number;
  sizeKB: number;
  hasInvalidControlChars: boolean;
  exceedsMaxLength: boolean;
}

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

  static validateLength(text: string): ValidationResult {
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

  static validateControlCharacters(text: string): ValidationResult {
    if (this.INVALID_CONTROL_CHARS_REGEX.test(text)) {
      logger.warn('Validation failed: text contains invalid control characters');
      return {
        valid: false,
        error: 'Text contains invalid control characters',
      };
    }
    return { valid: true };
  }

  static validateInput(text: string): ValidationResult {
    const lengthResult = this.validateLength(text);
    if (!lengthResult.valid) {
      return { ...lengthResult, failedCheck: 'length' };
    }

    const controlCharsResult = this.validateControlCharacters(text);
    if (!controlCharsResult.valid) {
      return { ...controlCharsResult, failedCheck: 'controlCharacters' };
    }

    return { valid: true };
  }

  static sanitizeInput(text: string): string {
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  static getValidationStats(text: string): ValidationStats {
    return {
      length: text.length,
      sizeKB: parseFloat((text.length / 1024).toFixed(1)),
      hasInvalidControlChars: this.INVALID_CONTROL_CHARS_REGEX.test(text),
      exceedsMaxLength: text.length > this.MAX_TEXT_LENGTH,
    };
  }
}
