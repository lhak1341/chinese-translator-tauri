import {
  bareNameOf,
  isPairedPatternsId,
  isPatternsDict,
  isProperNounsDict,
  tierOf,
} from './DictionaryIdClassifier';

/**
 * What a dictionary is called on each screen. The four names differ on purpose, because what
 * stands next to them differs, so each screen asks for its own and none strips an id by hand:
 *
 * - `getDictionaryLabel` — the short name in a provenance column (duplicate rows, rule
 *   matches), where the column already says what it is.
 * - `getDictionaryDropdownLabel` — the move dialogs, where the root dictionary needs "(Base)"
 *   to stay apart from a novel's.
 * - `dictionarySelectorLabel` — the Dictionary tab's selector.
 * - `configurationDictionaryName` — the Configuration screen's rows and headings.
 */

function capitalized(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * @example
 * getDictionaryLabel('properNouns') // 'Proper Nouns'
 * getDictionaryLabel('properNouns-HarryPotter') // 'HarryPotter'
 * getDictionaryLabel('characters') // 'Characters'
 */
export function getDictionaryLabel(dictionaryId: string): string {
  if (dictionaryId === 'properNouns') return 'Proper Nouns';
  if (isProperNounsDict(dictionaryId) && tierOf(dictionaryId) !== 'root') {
    return bareNameOf(dictionaryId);
  }
  return capitalized(dictionaryId);
}

/**
 * @example
 * getDictionaryDropdownLabel('properNouns') // 'Proper Nouns (Base)'
 * getDictionaryDropdownLabel('properNouns-HarryPotter') // 'Proper Nouns - HarryPotter'
 * getDictionaryDropdownLabel('patterns-f_DuongThan') // 'Patterns - f_DuongThan'
 * getDictionaryDropdownLabel('characters') // 'Characters'
 */
export function getDictionaryDropdownLabel(dictionaryId: string): string {
  if (dictionaryId === 'properNouns') return 'Proper Nouns (Base)';
  if (isProperNounsDict(dictionaryId) && tierOf(dictionaryId) !== 'root') {
    return `Proper Nouns - ${bareNameOf(dictionaryId)}`;
  }
  if (isPatternsDict(dictionaryId)) {
    return isPairedPatternsId(dictionaryId)
      ? `Patterns - ${bareNameOf(dictionaryId)}`
      : 'Patterns (Base)';
  }
  return capitalized(dictionaryId);
}

/**
 * The Dictionary tab's selector, for the proper-nouns dictionaries and the paired patterns
 * ones it builds at runtime (the fixed ones carry their own label in `DICTIONARY_TYPES`).
 *
 * @example
 * dictionarySelectorLabel('properNouns') // 'Proper Nouns'
 * dictionarySelectorLabel('properNouns-f_X') // 'Proper Nouns - f_X'
 * dictionarySelectorLabel('patterns-f_X') // 'Patterns - f_X'
 */
export function dictionarySelectorLabel(dictionaryId: string): string {
  if (dictionaryId === 'properNouns') return 'Proper Nouns';
  if (isPatternsDict(dictionaryId)) {
    return isPairedPatternsId(dictionaryId) ? `Patterns - ${bareNameOf(dictionaryId)}` : 'Patterns';
  }
  return `Proper Nouns - ${bareNameOf(dictionaryId)}`;
}

/**
 * The Configuration screen's name for a proper-nouns dictionary.
 *
 * @example
 * configurationDictionaryName('properNouns') // 'General Purpose Dictionary'
 * configurationDictionaryName('properNouns-f_X') // 'f_X'
 */
export function configurationDictionaryName(dictionaryId: string): string {
  return dictionaryId === 'properNouns' ? 'General Purpose Dictionary' : bareNameOf(dictionaryId);
}
