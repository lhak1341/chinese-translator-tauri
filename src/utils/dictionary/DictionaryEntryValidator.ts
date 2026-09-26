import { isPatternsDict } from './DictionaryIdClassifier';
import { baseValidation } from './PersistTimeValidator';
import { validatePatternVariables } from './PatternEntryRules';

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
 * Returns true when source/translation satisfy 'patterns' dictionary constraints
 * (see PatternEntryRules.ts — the same rules PersistTimeValidator enforces):
 * - no X/Y/Z variable repeats within source (zero variables is allowed — a
 *   literal, no-variable pattern)
 * - variables must be introduced in order: Y requires X, Z requires Y
 * - once translation is non-empty, source and translation variable sets must
 *   match exactly in both directions
 */
export function isPatternValid(source: string, translation?: string): boolean {
  return validatePatternVariables(source, translation) === null;
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
  const baseError = baseValidation(source, translation);
  if (baseError) {
    return { valid: false, error: baseError };
  }

  if (dictionaryId === 'characters' && !isCharacterSourceValid(source)) {
    return {
      valid: false,
      error: 'Character dictionary entries must be exactly 1 character long',
    };
  }

  if (isPatternsDict(dictionaryId) && !isPatternValid(source, translation)) {
    return {
      valid: false,
      error:
        'Pattern entry invalid — variables must be introduced in order (X, then Y, then Z), no repeats, and translation must use exactly the variables in the source',
    };
  }

  return { valid: true, error: null };
}
