/**
 * Dictionary subsystem public API.
 *
 * Primary entry points:
 *   - loadDictionaryWithCache()  — trie loading with caching
 */

// --- Dictionary manager ---
export { DictionaryTrie, DictionaryManager } from './DictionaryManager';

// --- Loading ---
export { loadDictionaryWithCache, getCacheStats } from './DictionaryTrieLoader';
export { parallelDictionaryLoader } from './ParallelDictionaryLoader';

// --- Sorting ---
export { dictionarySorter } from './IncrementalDictionarySorter';

// --- Caching ---
export { TranslationCache } from './TranslationCache';
export { translationSegmentCache } from './TranslationSegmentCache';

// --- Duplicate detection ---
export type { DuplicateRow } from './DuplicateAnalyzer';
export { findConflictingEntries, createDuplicateKey, parseDuplicateKey } from './DuplicateAnalyzer';
