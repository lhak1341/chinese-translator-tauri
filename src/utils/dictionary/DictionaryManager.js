/**
 * Efficient Dictionary Manager with Trie-based lookups
 * Optimizes dictionary operations for fast translation
 * Features intelligent caching for improved performance
 *
 * @import {
 *   TrieNode,
 *   DictionaryEntryMetadata,
 *   TrieMatch,
 *   TrieStats,
 *   DictionaryEntry,
 *   DictionaryData,
 *   DictionaryMetadata,
 *   DictionarySearchOrder,
 *   TranslationResult,
 *   DictionaryMatchResult,
 *   CacheConfiguration,
 *   DictionaryManagerOptions,
 *   DictionaryLoadOptions,
 *   LookupIndexStats,
 *   DictionaryManagerStats
 * } from '../types/DictionaryManagerTypes'
 */

import { TranslationCache } from './TranslationCache.js';
import { logger } from '../logger.js';
import { compareMatchesBySpecificityThenPriority } from './MatchComparator.js';
import { flattenDictionaryEntries } from './DictionaryEntryFlattener.js';
import { buildTrieFromDictionary } from './DictionaryTrieBuilder.js';
import { priorityOf } from './DictionaryIdClassifier.js';

export class DictionaryManager {
  constructor(options = {}) {
    this.dictionaries = new Map(); // Map of dictionary name to DictionaryTrie
    this.flatEntries = new Map(); // Map of dictionary name to flat {chinese,vietnamese,metadata}[] — for the Rust lookup-index build, computed once at load instead of walked from the trie per translate call
    this.metadata = new Map(); // Dictionary metadata
    this.loadTime = 0;
    this.ready = false;

    // Initialize translation caching system
    this.cache = new TranslationCache({
      lookupCacheSize: options.lookupCacheSize || 800,
      enabled: options.cacheEnabled !== false, // Default to enabled
    });
  }

  /**
   * Load dictionaries from dictionary objects
   * @param {Object} dictionaryData - Dictionary data {name: {source: target}}
   */
  async loadDictionaries(dictionaryData) {
    const startTime = performance.now();

    this._releaseDictionaries();

    // Load every dictionary given. Which ones the engine receives is decided before this call,
    // by `filterDictionariesForEngine` in `TranslationEngine.initialize`.
    for (const [dictionaryName, dictionary] of Object.entries(dictionaryData)) {
      if (!dictionary || typeof dictionary !== 'object') {
        logger.error(`Skipping invalid dictionary: ${dictionaryName}`);
        continue;
      }

      const priority = priorityOf(dictionaryName);
      const { trie, entryCount, invalidSources } = buildTrieFromDictionary(dictionary);
      for (const invalidSource of invalidSources) {
        logger.error(
          `Invalid entry format for "${invalidSource}" in dictionary "${dictionaryName}"`
        );
      }

      // Phase 5 looks a token up whole, so a multi-character key here would never match (ADR-087).
      // PersistTimeValidator refuses one on every write; a hand-edited file is the way in.
      if (dictionaryName === 'characters') {
        const multiCharacterKeys = Object.keys(dictionary).filter((key) => [...key].length > 1);
        if (multiCharacterKeys.length > 0) {
          logger.warn(
            `"characters" has ${multiCharacterKeys.length} multi-character key(s) that Phase 5 will not match, e.g. "${multiCharacterKeys[0]}"`
          );
        }
      }

      this.dictionaries.set(dictionaryName, trie);
      this.flatEntries.set(dictionaryName, flattenDictionaryEntries(dictionary));

      this.metadata.set(dictionaryName, {
        name: dictionaryName,
        entryCount,
        priority,
      });
    }

    this.loadTime = performance.now() - startTime;
    this.ready = true;
  }

  /**
   * Find translation for a word across all dictionaries
   * @param {string} word - Word to translate
   * @param {Array} dictionaryOrder - Specific order of dictionaries to check
   * @returns {Object|null} Translation result with metadata
   */
  translate(word, dictionaryOrder = null) {
    if (!this.ready) {
      logger.error('Dictionary manager not ready');
      return null;
    }

    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();

    // Check cache first for multi-dictionary lookup
    // `undefined` is a miss; a cached `null` is a known absence and is served too
    const cachedResult = this.cache.getLookup(word, searchOrder);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    // MEDIUM-9 FIX: Remove per-dictionary cache checks to eliminate duplicate lookups
    // Multi-dictionary cache check above is sufficient
    const translationResult = this._findInDictionaries(word, searchOrder);

    if (translationResult) {
      this.cache.setLookup(word, searchOrder, translationResult);

      return translationResult;
    }

    // Cache negative result to avoid repeated failed lookups
    this.cache.setLookup(word, searchOrder, null);
    return null;
  }

  /**
   * Pure search-order trie walk — no cache reads or writes. translate() layers the lookup
   * cache on top of it.
   * @param {string} word
   * @param {Array<string>} searchOrder - Already-resolved dictionary search order.
   * @returns {Object|null} {word, translation, dictionary, metadata} or null
   */
  _findInDictionaries(word, searchOrder) {
    for (const dictionaryName of searchOrder) {
      const dictionary = this.dictionaries.get(dictionaryName);
      if (!dictionary) continue;

      const result = dictionary.getWithMetadata(word);
      if (result) {
        return {
          word,
          translation: result.translation,
          dictionary: dictionaryName,
          metadata: result.metadata,
        };
      }
    }
    return null;
  }

  /**
   * Every match starting at `startPos`, from the dictionaries in `dictionaryOrder`, longest
   * first, lower priority number on a tie. Synchronous: PatternVariableCache's per-position
   * loop cannot await. A dictionary whose walk throws is logged and skipped.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {DictionarySearchOrder} dictionaryOrder - Dictionaries to search
   * @returns {DictionaryMatchResult[]} All matches sorted by specificity, then priority
   */
  findAllMatches(text, startPos, dictionaryOrder) {
    if (!this.ready) return [];

    const allMatches = [];
    for (const dictionaryName of dictionaryOrder) {
      const dictionary = this.dictionaries.get(dictionaryName);
      if (!dictionary) continue;

      try {
        const matches = dictionary.findMatches(text, startPos);
        const { priority } = this.metadata.get(dictionaryName);
        for (const match of matches) {
          match.dictionary = dictionaryName;
          match.priority = priority;
        }
        allMatches.push(...matches);
      } catch (error) {
        logger.error(`Dictionary ${dictionaryName} lookup failed:`, error);
      }
    }

    return allMatches.sort(compareMatchesBySpecificityThenPriority);
  }

  /**
   * Get default search order based on dictionary priorities
   * @returns {Array} Dictionary names in search order
   */
  getDefaultSearchOrder() {
    return Array.from(this.metadata.entries())
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([name]) => name);
  }

  /**
   * Check if manager is ready
   * @returns {boolean} Ready state
   */
  isReady() {
    return this.ready;
  }

  /**
   * Get global statistics (a devtools console read). Each trie is walked here, on demand: four
   * full walks per dictionary, about a third of the time `loadDictionaries` spends building them.
   * @returns {Object} Global stats
   */
  getGlobalStats() {
    const stats = {
      dictionaryCount: this.dictionaries.size,
      totalEntries: 0,
      totalNodes: 0,
      loadTime: this.loadTime,
      dictionaries: {},
    };

    for (const [name, metadata] of this.metadata.entries()) {
      const trieStats = this.dictionaries.get(name).getStats();
      stats.totalEntries += metadata.entryCount;
      stats.totalNodes += trieStats.nodeCount;
      stats.dictionaries[name] = { ...metadata, stats: trieStats };
    }

    return stats;
  }

  /**
   * Dispose every trie, then empty the dictionary Maps in place.
   * CODE REVIEW FIX (CRITICAL-1): without disposal, 2-10MB per dictionary leaks on reload —
   * each trie holds nested Map structures that need recursive cleanup.
   *
   * Every path that drops dictionaries goes through here, so none can skip the tries.
   */
  _releaseDictionaries() {
    for (const [name, trie] of this.dictionaries.entries()) {
      try {
        trie.dispose(); // Let trie clean up its internal structures
      } catch (error) {
        logger.error(`Error disposing dictionary ${name}:`, error);
      }
    }
    this.dictionaries.clear();
    this.flatEntries.clear();
    this.metadata.clear();
  }

  /**
   * Properly dispose of all dictionary resources to prevent memory leaks
   * CODE REVIEW FIX (CRITICAL-1): Added comprehensive disposal method
   *
   * CRITICAL: Call this before reloading dictionaries or discarding the manager
   * to prevent 2-10MB memory leaks per reload.
   *
   * Usage:
   *   await manager.loadDictionaries({...});
   *   // ... use dictionaries ...
   *   manager.dispose();  // Proper cleanup before reload
   *   await manager.loadDictionaries({...});  // Load new dictionaries
   */
  dispose() {
    // Clear all caches first
    this.clearCache();

    this._releaseDictionaries();

    // Nullify all references for GC
    this.dictionaries = null;
    this.flatEntries = null;
    this.metadata = null;

    // Dispose cache
    if (this.cache) {
      this.cache.dispose();
      this.cache = null;
    }

    // Reset state flags
    this.ready = false;
    this.loadTime = 0;
  }

  /**
   * Clear all translation caches
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get priority for a specific dictionary, loaded or not (`priorityOf`, the one ladder)
   * @param {string} dictionaryName - Dictionary name
   * @returns {number} Priority value
   */
  getPriorityForDictionary(dictionaryName) {
    return priorityOf(dictionaryName);
  }

  getDictionary(name) {
    return this.dictionaries.get(name) ?? null;
  }

  getMemoryUsage() {
    return {
      dictionaries: this.dictionaries?.size ?? 0,
      cacheEnabled: !!this.cache,
    };
  }
}
