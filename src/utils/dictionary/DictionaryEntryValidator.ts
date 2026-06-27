import { MAX_ENTRY_LENGTH } from './PersistTimeValidator';

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Returns true when source is valid for a 'characters' dictionary entry.
 * A character entry must be exactly 1 character (after trimming).
 */
export function isCharacterSourceValid(source: string): boolean {
  return source.trim().length <= 1;
}

/**
 * Returns true when source/translation satisfy 'patterns' dictionary constraints:
 * - source contains exactly one X
 * - if translation is non-empty, it must contain X
 * - if source contains Y, translation must also contain Y
 */
export function isPatternValid(source: string, translation?: string): boolean {
  const trimmedSource = source.trim();
  const xCount = (trimmedSource.match(/X/g) || []).length;
  if (xCount !== 1) return false;

  if (translation !== undefined && translation.trim().length > 0) {
    const trimmedTranslation = translation.trim();
    if (!(trimmedTranslation.match(/X/g) || []).length) return false;
    if (
      (trimmedSource.match(/Y/g) || []).length > 0 &&
      !(trimmedTranslation.match(/Y/g) || []).length
    )
      return false;
  }

  return true;
}

/**
 * Validates a dictionary entry for submission.
 * Returns the first failing constraint with its error message, or valid=true.
 *
 * Does not produce UI side effects — callers own setting showCharacterValidation
 * and showPatternValidation display state.
 */
export function validateDictionaryEntry(
  source: string,
  translation: string,
  dictionaryId: string
): ValidationResult {
  if (!source.trim() || !translation.trim()) {
    return { valid: false, error: 'Both source text and translation are required' };
  }

  if (source.length > MAX_ENTRY_LENGTH) {
    return { valid: false, error: `Source too long (max ${MAX_ENTRY_LENGTH} characters)` };
  }

  if (translation.length > MAX_ENTRY_LENGTH) {
    return { valid: false, error: `Translation too long (max ${MAX_ENTRY_LENGTH} characters)` };
  }

  if (dictionaryId === 'characters' && !isCharacterSourceValid(source)) {
    return {
      valid: false,
      error: 'Character dictionary entries must be exactly 1 character long',
    };
  }

  if (dictionaryId.startsWith('patterns') && !isPatternValid(source, translation)) {
    return {
      valid: false,
      error:
        'Pattern entry invalid — source needs exactly one X, translation must contain X (and Y if source has Y)',
    };
  }

  return { valid: true, error: null };
}
