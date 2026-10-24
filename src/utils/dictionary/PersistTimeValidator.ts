/**
 * Dictionary entry validation — the one home for "is this entry valid for this dictionary".
 *
 * The Add/Edit form and the persist path (`planAdd`/`planUpdate` in `DictionaryEdit.ts`, which
 * add, update, patch and rename all pass through; a move writes no new value) call the same
 * `checkEntry`. The form
 * reads the per-rule results to drive its live flags; the persist path takes the first error.
 * The rules, in the order their errors win:
 *   base      — empty check + 10 000-char DoS limit, and an unknown dictionary id
 *   character — a `characters` source is at most one character (a code point, not a UTF-16 unit)
 *   pattern   — pattern-entry variable rules (PatternEntryRules.ts)
 */

import { isPatternsDict, isProperNounsDict } from './DictionaryIdClassifier';
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

const CHARACTER_ENTRY_ERROR = 'Character dictionary entries must be exactly 1 character long';

const KNOWN_FIXED_DICTIONARIES = new Set(['phrases', 'characters', 'punctuation', 'conversion']);

function isKnownDictionary(dictionaryId: string): boolean {
  return (
    isProperNounsDict(dictionaryId) ||
    isPatternsDict(dictionaryId) ||
    KNOWN_FIXED_DICTIONARIES.has(dictionaryId)
  );
}

/** One error message per rule, null where that rule passes. Rules are independent of each other. */
export interface EntryCheck {
  base: string | null;
  character: string | null;
  pattern: string | null;
}

export const checkEntry = (
  dictionaryId: string,
  source: string,
  translation: string
): EntryCheck => ({
  base: isKnownDictionary(dictionaryId)
    ? baseValidation(source, translation)
    : 'Invalid dictionary type',
  // Spread counts code points, so a single supplementary-plane Han character passes.
  character:
    dictionaryId === 'characters' && [...source.trim()].length > 1 ? CHARACTER_ENTRY_ERROR : null,
  pattern: isPatternsDict(dictionaryId) ? validatePatternVariables(source, translation) : null,
});

/** The error that wins when several rules fail, or null when the entry is valid. */
export const firstEntryError = (check: EntryCheck): string | null =>
  check.base ?? check.character ?? check.pattern;

export const validatePersistEntry = (
  dictionaryId: string,
  source: string,
  translation: string
): string | null => firstEntryError(checkEntry(dictionaryId, source, translation));
