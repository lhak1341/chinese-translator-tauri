/**
 * Dictionary subsystem public API.
 *
 * Primary entry points:
 *   - loadDictionaryWithCache()  — trie loading with caching
 *   - sortDictionaryEntries()    — sort a dict by length then alphabetically
 */

import { dictionarySorter } from './IncrementalDictionarySorter';
import type { DictionaryData, SortingStats } from '../../types/DictionaryTypes';

// --- Dictionary trie + manager ---
export { DictionaryTrie } from './DictionaryTrie';
export { DictionaryManager } from './DictionaryManager';
export { DictionaryWasmLookup } from './DictionaryWasmLookup';
export { DictionaryHealthMonitor } from './DictionaryHealthMonitor';

// --- Loading ---
export { loadDictionaryWithCache, getCacheStats } from './DictionaryTrieLoader';
export { parallelDictionaryLoader } from './ParallelDictionaryLoader';

// --- Sorting ---
export { dictionarySorter };
export const sortDictionaryEntries = (
  dictionary: DictionaryData,
  dictionaryId = 'unknown',
  changedKey: string | null = null,
  oldKey: string | null = null
): DictionaryData =>
  dictionarySorter.sortDictionary(
    dictionary,
    dictionaryId,
    changedKey ?? undefined,
    oldKey ?? undefined
  ) as DictionaryData;
export const getSortingStats = (): SortingStats => dictionarySorter.getStats() as SortingStats;
export const resetSortingStats = (): void => dictionarySorter.resetStats();

// --- Caching ---
export { TranslationCache } from './TranslationCache';

// --- Vocabulary warmup ---
export {
  extractHighFrequencyVocabulary,
  generateCharacterCombinations,
  warmNovelSpecificVocabulary,
} from './VocabularyWarmup';

// --- Duplicate detection ---
export type { DuplicateRow } from './DuplicateAnalyzer';
export { findConflictingEntries, createDuplicateKey, parseDuplicateKey } from './DuplicateAnalyzer';

// --- Entry validation ---
export type { ValidationResult } from './DictionaryEntryValidator';
export {
  isCharacterSourceValid,
  isPatternValid,
  validateDictionaryEntry,
} from './DictionaryEntryValidator';

// --- Backend IO ---
export type { BatchLoadResult } from './DictionaryBackend';
export { loadAllDictionaries } from './DictionaryBackend';
