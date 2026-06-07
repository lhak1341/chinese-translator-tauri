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
 * getDictionaryDropdownLabel('characters') // 'Characters'
 */
export function getDictionaryDropdownLabel(dictionaryId: string): string {
  if (dictionaryId === 'properNouns') {
    return 'Proper Nouns (Base)';
  }
  if (dictionaryId.startsWith('properNouns-')) {
    return `Proper Nouns - ${dictionaryId.replace('properNouns-', '')}`;
  }
  return dictionaryId.charAt(0).toUpperCase() + dictionaryId.slice(1);
}

/**
 * Comparator for sorting dictionary lists in move/bulk-move dialogs.
 * Puts 'properNouns' first, then sorts remaining dictionaries alphabetically by ID.
 */
export function compareDictionaryOrder(a: { id: string }, b: { id: string }): number {
  if (a.id === 'properNouns') return -1;
  if (b.id === 'properNouns') return 1;
  return a.id.localeCompare(b.id);
}
