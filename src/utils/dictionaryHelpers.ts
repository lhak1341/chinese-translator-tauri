import { dictionarySorter } from './IncrementalDictionarySorter.js';
import type { DictionaryData, SortingStats } from '../types/DictionaryTypes';

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

/**
 * Sort dictionary entries by length and then alphabetically.
 * Uses IncrementalDictionarySorter for better performance on partial updates.
 *
 * Shared between DictionaryContext and LazyDictionaryContext.
 */
export const sortDictionaryEntries = (
  dictionary: DictionaryData,
  dictionaryId: string = 'unknown',
  changedKey: string | null = null,
  oldKey: string | null = null
): DictionaryData => {
  return dictionarySorter.sortDictionary(
    dictionary,
    dictionaryId,
    changedKey ?? undefined,
    oldKey ?? undefined
  ) as DictionaryData;
};

/**
 * Get performance statistics from the incremental dictionary sorter.
 * Centralised here so context files don't need a direct dictionarySorter import.
 */
export const getSortingStats = (): SortingStats => {
  return dictionarySorter.getStats() as SortingStats;
};

/**
 * Reset performance statistics on the incremental dictionary sorter.
 * Centralised here so context files don't need a direct dictionarySorter import.
 */
export const resetSortingStats = (): void => {
  dictionarySorter.resetStats();
};
