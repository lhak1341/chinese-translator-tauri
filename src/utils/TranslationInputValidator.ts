import { logger } from './logger';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  failedCheck?: string;
  sizeKB?: number;
  maxKB?: number;
}

/**
 * Maximum allowed text length (500KB). Prevents memory exhaustion from extremely large inputs.
 * Counted in characters (`text.length`), not bytes.
 */
const MAX_TEXT_LENGTH = 500000;

/**
 * Invalid control characters. Allows \n (0x0A), \t (0x09) and \r (0x0D); rejects the rest of
 * 0x00-0x1F (injection risk).
 */
const INVALID_CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

function checkLength(text: string): ValidationResult {
  if (text.length > MAX_TEXT_LENGTH) {
    const sizeKB = (text.length / 1024).toFixed(1);
    const maxKB = (MAX_TEXT_LENGTH / 1024).toFixed(0);
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

function checkControlCharacters(text: string): ValidationResult {
  if (INVALID_CONTROL_CHARS_REGEX.test(text)) {
    logger.warn('Validation failed: text contains invalid control characters');
    return {
      valid: false,
      error: 'Text contains invalid control characters',
    };
  }
  return { valid: true };
}

/**
 * Validates text for translation, to prevent memory exhaustion and injection. Pure: it logs but
 * never toasts, so the caller decides how to show `error`. Length is checked before control
 * characters, and `failedCheck` names the check that failed (`'length'` or `'controlCharacters'`).
 *
 * @example
 * const result = validateTranslationInput(text);
 * if (!result.valid) {
 *   toast.error(result.error, { duration: 5000 });
 *   return;
 * }
 */
export function validateTranslationInput(text: string): ValidationResult {
  const lengthResult = checkLength(text);
  if (!lengthResult.valid) {
    return { ...lengthResult, failedCheck: 'length' };
  }

  const controlCharsResult = checkControlCharacters(text);
  if (!controlCharsResult.valid) {
    return { ...controlCharsResult, failedCheck: 'controlCharacters' };
  }

  return { valid: true };
}
