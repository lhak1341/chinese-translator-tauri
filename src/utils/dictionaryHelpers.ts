import { dictionarySorter } from './IncrementalDictionarySorter.js';
import type { DictionaryData } from '../types/DictionaryTypes';

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
