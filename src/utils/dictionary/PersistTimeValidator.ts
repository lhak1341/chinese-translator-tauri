/**
 * Persist-time dictionary entry validation.
 *
 * "Persist-time" means: called at the moment an entry is committed to storage,
 * inside useDictionaryCRUD's prepareMutationEntry(). Same pattern-entry rules
 * as form-time validation (DictionaryEntryValidator.ts, via PatternEntryRules.ts)
 * plus the 10 000-char DoS limit, which form-time also delegates to here.
 *
 * The three exports are the canonical home for shared validation logic:
 *   baseValidation       — length + empty check (security-critical)
 *   validatePatternEntry — pattern-entry variable rules (PatternEntryRules.ts)
 *   validatePersistEntry — dispatch by dictionaryId
 *
 * DictionaryTypes.ts imports baseValidation and validatePatternEntry to build
 * its type registry, keeping the logic in one place.
 */

import { validatePatternVariables } from './PatternEntryRules';

export const MAX_ENTRY_LENGTH = 10000;

export const baseValidation = (source: string, translation: string): string | null => {
  // SECURITY FIX: Prevent DoS via huge dictionary entries
  if (!source.trim() || !translation.trim()) {
    return 'Both source and translation are required';
  }

  if (source.length > MAX_ENTRY_LENGTH) {
    return `Source too long (max ${MAX_ENTRY_LENGTH} characters)`;
  }

  if (translation.length > MAX_ENTRY_LENGTH) {
    return `Translation too long (max ${MAX_ENTRY_LENGTH} characters)`;
  }

  return null;
};

export const validatePatternEntry = (source: string, translation: string): string | null => {
  // LOW-2 FIX: Enhanced pattern validation to catch variable mismatches
  // A pattern with zero variables (a literal, no-variable pattern) is valid —
  // it's how a pattern-dictionary entry beats a same-length variable pattern in
  // find_best_pattern_match's "fewer variables wins" tie-break (see wasm-core
  // matcher.rs). checkVariableStructure/checkVariableSymmetry are no-ops on
  // empty variable sets, so a 0-variable pattern falls through them and passes.
  const variableError = validatePatternVariables(source, translation);
  if (variableError) return variableError;

  return baseValidation(source, translation);
};

const typeValidators: Record<string, (source: string, translation: string) => string | null> = {
  patterns: validatePatternEntry,
  phrases: baseValidation,
  characters: baseValidation,
  punctuation: baseValidation,
  conversion: baseValidation,
};

/**
 * Dispatches to the per-type validator for the given dictionaryId.
 *
 * Renamed from validateDictionaryEntry (DictionaryTypes.ts) to avoid the
 * 3-way name collision with DictionaryEntryValidator.ts (form-time, different
 * signature) and configValidation.ts (validateRawDictionaryEntry).
 */
export const validatePersistEntry = (
  dictionaryId: string,
  source: string,
  translation: string
): string | null => {
  if (dictionaryId.startsWith('properNouns')) {
    return baseValidation(source, translation);
  }

  if (dictionaryId.startsWith('patterns-')) {
    return validatePatternEntry(source, translation);
  }

  const validator = typeValidators[dictionaryId];
  if (!validator) {
    return 'Invalid dictionary type';
  }
  return validator(source, translation);
};
