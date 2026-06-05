/**
 * Dictionary subsystem public API.
 *
 * Primary entry points:
 *   - loadDictionaryWithCache()  — trie loading with caching
 */

// --- Dictionary trie + manager ---
export { DictionaryTrie } from './DictionaryTrie';
export { DictionaryManager } from './DictionaryManager';
export { DictionaryHealthMonitor } from './DictionaryHealthMonitor';

// --- Loading ---
export { loadDictionaryWithCache, getCacheStats } from './DictionaryTrieLoader';
export { parallelDictionaryLoader } from './ParallelDictionaryLoader';

// --- Sorting ---
export { dictionarySorter } from './IncrementalDictionarySorter';

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
