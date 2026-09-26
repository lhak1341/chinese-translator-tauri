import { isPatternsDict, isFictionPatternsId } from './dictionary/DictionaryIdClassifier';

/**
 * Converts a dictionary ID to a human-readable label.
 *
 * @example
 * getDictionaryLabel('properNouns') // 'Proper Nouns'
 * getDictionaryLabel('properNouns-HarryPotter') // 'Harry Potter'
 * getDictionaryLabel('characters') // 'Characters'
 */
export function getDictionaryLabel(dictionaryId: string): string {
  if (dictionaryId === 'properNouns') {
    return 'Proper Nouns';
  }
  if (dictionaryId.startsWith('properNouns-')) {
    return dictionaryId.replace('properNouns-', '');
  }
  return dictionaryId.charAt(0).toUpperCase() + dictionaryId.slice(1);
}

/**
 * Converts a dictionary ID to a human-readable label for move/bulk-move dialogs.
 * Uses "(Base)" suffix for the root properNouns dictionary to distinguish it from
 * novel-specific proper noun dictionaries in dropdown lists.
 *
 * @example
 * getDictionaryDropdownLabel('properNouns') // 'Proper Nouns (Base)'
 * getDictionaryDropdownLabel('properNouns-HarryPotter') // 'Proper Nouns - HarryPotter'
 * getDictionaryDropdownLabel('patterns-f_DuongThan') // 'Patterns - f_DuongThan'
 * getDictionaryDropdownLabel('characters') // 'Characters'
 */
export function getDictionaryDropdownLabel(dictionaryId: string): string {
  if (dictionaryId === 'properNouns') {
    return 'Proper Nouns (Base)';
  }
  if (dictionaryId.startsWith('properNouns-')) {
    return `Proper Nouns - ${dictionaryId.replace('properNouns-', '')}`;
  }
  if (isPatternsDict(dictionaryId)) {
    return isFictionPatternsId(dictionaryId)
      ? `Patterns - ${dictionaryId.slice('patterns-'.length)}`
      : 'Patterns (Base)';
  }
  return dictionaryId.charAt(0).toUpperCase() + dictionaryId.slice(1);
}

/**
 * Comparator for sorting dictionary lists in move/bulk-move dialogs.
 * Puts the base dictionaries ('patterns', 'phrases', 'properNouns') first — the usual move
 * targets — then sorts remaining dictionaries alphabetically by ID.
 */
const BASE_DICTIONARY_ORDER = ['properNouns', 'phrases', 'patterns'];
export function compareDictionaryOrder(a: { id: string }, b: { id: string }): number {
  const rankA = BASE_DICTIONARY_ORDER.indexOf(a.id);
  const rankB = BASE_DICTIONARY_ORDER.indexOf(b.id);
  if (rankA !== -1 || rankB !== -1) {
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  }
  return a.id.localeCompare(b.id);
}
