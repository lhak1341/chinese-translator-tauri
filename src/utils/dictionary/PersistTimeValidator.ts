/**
 * Persist-time dictionary entry validation.
 *
 * "Persist-time" means: called at the moment an entry is committed to storage,
 * inside useDictionaryCRUD's prepareMutationEntry(). Stricter than form-time
 * validation (DictionaryEntryValidator.ts) — enforces the 10 000-char DoS
 * limit and the full X/Y/Z variable-symmetry rule.
 *
 * The three exports are the canonical home for shared validation logic:
 *   baseValidation       — length + empty check (security-critical)
 *   validatePatternEntry — X/Y/Z variable-symmetry rule
 *   validatePersistEntry — dispatch by dictionaryId
 *
 * DictionaryTypes.ts imports baseValidation and validatePatternEntry to build
 * its type registry, keeping the logic in one place.
 */

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
  const sourceVars = new Set(source.match(/[XYZ]/g) || []);
  const translationVars = new Set(translation.match(/[XYZ]/g) || []);

  if (sourceVars.size === 0) {
    return 'Pattern must contain at least one variable (X, Y, or Z)';
  }

  for (const variable of sourceVars) {
    if (!translationVars.has(variable)) {
      return `Translation must use variable ${variable} from the pattern`;
    }
  }

  for (const variable of translationVars) {
    if (!sourceVars.has(variable)) {
      return `Translation cannot use variable ${variable} not present in source pattern`;
    }
  }

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
