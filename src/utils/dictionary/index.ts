/**
 * Dictionary subsystem public API.
 *
 * Primary entry points:
 *   - createDictionaryManager() — standard dictionary manager factory
 *   - loadDictionaryWithCache()  — trie loading with caching
 *   - parallelDictionaryLoader   — multi-dictionary parallel loading
 *   - dictionarySorter           — incremental entry sorting
 */

// --- Dictionary manager ---
export { DictionaryTrie, DictionaryManager, createDictionaryManager } from './DictionaryManager';
export { EnhancedDictionaryManager } from './EnhancedDictionaryManager';

// --- Loading ---
export {
  loadDictionaryWithCache,
  invalidateDictionaryCache,
  getCacheStats,
} from './DictionaryTrieLoader';
export {
  ParallelDictionaryLoader,
  loadDictionariesInChunks,
  parallelDictionaryLoader,
} from './ParallelDictionaryLoader';

// --- Sorting ---
export { IncrementalDictionarySorter, dictionarySorter } from './IncrementalDictionarySorter';

// --- Caching ---
export { TranslationCache } from './TranslationCache';
export type { TranslationSegmentCacheOptions } from './TranslationSegmentCache';
export { TranslationSegmentCache, translationSegmentCache } from './TranslationSegmentCache';
