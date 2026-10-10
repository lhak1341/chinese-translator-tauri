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
 *   DictionaryPriorities,
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
import { DictionaryMatchLookup } from './DictionaryMatchLookup.js';
import { flattenDictionaryEntries } from './DictionaryEntryFlattener.js';
import { resolveDictionaryPriority, buildTrieFromDictionary } from './DictionaryTrieBuilder.js';

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

    this.matchLookup = new DictionaryMatchLookup({
      dictionaries: this.dictionaries,
      metadata: this.metadata,
      getDefaultSearchOrder: () => this.getDefaultSearchOrder(),
      isReady: () => this.ready,
    });
  }

  /**
   * Load dictionaries from dictionary objects
   * @param {Object} dictionaryData - Dictionary data {name: {source: target}}
   * @param {Object} options - Loading options
   */
  async loadDictionaries(dictionaryData, options = {}) {
    const startTime = performance.now();

    this._releaseDictionaries();

    const priorities = options.priorities || {
      patterns: 2,
      phrases: 3,
      properNouns: 3, // base; f_* → 1, _* → 2 assigned below by prefix
      characters: 4,
      punctuation: 5,
      conversion: 6,
    };
    this.priorities = priorities;

    // Load every dictionary given. Which ones the engine receives is decided before this call,
    // by `filterDictionariesForEngine` in `TranslationEngine.initialize`.
    for (const [dictionaryName, dictionary] of Object.entries(dictionaryData)) {
      if (!dictionary || typeof dictionary !== 'object') {
        logger.error(`Skipping invalid dictionary: ${dictionaryName}`);
        continue;
      }

      const priority = resolveDictionaryPriority(dictionaryName, priorities);
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
        stats: trie.getStats(),
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
   * Find all possible matches for text at a position across all dictionaries.
   * Always sequential — the synchronous entry point. Delegates to
   * DictionaryMatchLookup, which owns the trie walk and dispatch internals.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Array} All possible matches sorted by priority and length
   */
  findAllMatches(text, startPos = 0, dictionaryOrder = null) {
    return this.matchLookup.findAllMatches(text, startPos, dictionaryOrder);
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
   * Get global statistics
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
      stats.totalEntries += metadata.entryCount;
      stats.totalNodes += metadata.stats.nodeCount;
      stats.dictionaries[name] = metadata;
    }

    return stats;
  }

  /**
   * Dispose every trie, then empty the dictionary Maps in place.
   * CODE REVIEW FIX (CRITICAL-1): without disposal, 2-10MB per dictionary leaks on reload —
   * each trie holds nested Map structures that need recursive cleanup.
   *
   * In place, never reassigned: `DictionaryMatchLookup` was constructed with these same Map
   * instances. Every path that drops dictionaries goes through here, so none can skip the tries.
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
   * Invalidate cache entries for a specific dictionary
   * Called when dictionary is reloaded or modified
   * @param {string} dictionaryName - Dictionary name to invalidate
   */
  invalidateCache(dictionaryName) {
    this.cache.invalidateDictionary(dictionaryName);
  }

  /**
   * Clear all translation caches
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get priority for a specific dictionary (checks loaded metadata first, then defaults)
   * @param {string} dictionaryName - Dictionary name
   * @returns {number} Priority value
   */
  getPriorityForDictionary(dictionaryName) {
    // First check if the dictionary is loaded and has metadata with priority
    const dictMetadata = this.metadata.get(dictionaryName);
    if (dictMetadata && typeof dictMetadata.priority === 'number') {
      return dictMetadata.priority;
    }

    // Fall back to the same rule loadDictionaries uses
    return resolveDictionaryPriority(dictionaryName, this.priorities || {});
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
