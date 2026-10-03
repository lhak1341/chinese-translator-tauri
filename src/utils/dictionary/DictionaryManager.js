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
 *   DebugLevel,
 *   CacheConfiguration,
 *   DictionaryManagerOptions,
 *   DictionaryLoadOptions,
 *   LookupIndexStats,
 *   DictionaryManagerStats
 * } from '../types/DictionaryManagerTypes'
 */

import { TranslationCache } from './TranslationCache.js';
import { logger } from '../logger.js';
import { loadDictionaryWithCache } from './DictionaryTrieLoader.js';
import { DictionaryWasmLookup } from './DictionaryWasmLookup.js';
import { DictionaryMatchLookup } from './DictionaryMatchLookup.js';
import { flattenDictionaryEntries } from './DictionaryEntryFlattener.js';
import { resolveDictionaryPriority, buildTrieFromDictionary } from './DictionaryTrieBuilder.js';

// Debug logging levels
const DEBUG_LEVELS = {
  ERROR: 0, // Only errors and warnings
  INFO: 1, // Key milestones and results
  DEBUG: 2, // Detailed phase information
  VERBOSE: 3, // Ultra-detailed token-by-token logging
};

export class DictionaryManager {
  constructor(options = {}) {
    this.dictionaries = new Map(); // Map of dictionary name to DictionaryTrie
    this.flatEntries = new Map(); // Map of dictionary name to flat {chinese,vietnamese,metadata}[] — for RustLookupIndexManager, computed once at load instead of walked from the trie per translate call
    this.metadata = new Map(); // Dictionary metadata
    this.loadTime = 0;
    this.ready = false;
    this.debugLevel = DEBUG_LEVELS.INFO; // Default to INFO level

    // Initialize translation caching system
    this.cache = new TranslationCache({
      lookupCacheSize: options.lookupCacheSize || 800,
      enabled: options.cacheEnabled !== false, // Default to enabled
    });

    // Precomputed trie caching (optional, enabled by default for 5-7x faster loading)
    this.enablePrecomputedCache = options.enablePrecomputedCache !== false;
    this.tauriAPI = options.tauriAPI || null; // Required for cache file operations

    // WASM acceleration — provide wasmAdapter option to enable (omit for pure-JS / tests)
    this.wasmLookup = options.wasmAdapter
      ? new DictionaryWasmLookup(options.wasmAdapter, {
          getEntries: () => this.flatEntries,
          getPriorities: () => this._extractPriorityMap(),
        })
      : null;
    if (this.wasmLookup) {
      this.wasmLookup.startBackgroundInit({
        maxMemoryMB: 15,
        cacheSize: this.cache?.lookupCacheSize,
      });
    }

    this.matchLookup = new DictionaryMatchLookup({
      dictionaries: this.dictionaries,
      metadata: this.metadata,
      wasmLookup: this.wasmLookup,
      getDefaultSearchOrder: () => this.getDefaultSearchOrder(),
      isReady: () => this.ready,
    });
  }

  /**
   * Log message based on debug level
   * @param {number} level - Debug level required
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  log(level, message, data = null) {
    if (this.debugLevel >= level) {
      // CRITICAL ERRORS (level 0) always show, regardless of NODE_ENV
      const isCritical = level === DEBUG_LEVELS.ERROR;
      const isDevelopment = process.env.NODE_ENV === 'development';

      if (isCritical || isDevelopment) {
        if (data !== null) {
          logger.log(message, data);
        } else {
          logger.log(message);
        }
      }
    }
  }

  /**
   * Load dictionaries from dictionary objects
   * @param {Object} dictionaryData - Dictionary data {name: {source: target}}
   * @param {Object} options - Loading options
   */
  async loadDictionaries(dictionaryData, options = {}) {
    const startTime = performance.now();

    // Set debug level from options
    this.debugLevel = options.debugLevel !== undefined ? options.debugLevel : DEBUG_LEVELS.INFO;

    this.log(DEBUG_LEVELS.INFO, 'Loading dictionaries into trie structures...');

    // CODE REVIEW FIX (CRITICAL-1): Dispose existing tries before clearing to prevent memory leaks
    // Each dictionary trie contains nested Map structures that need recursive cleanup
    // Without disposal, 2-10MB per dictionary can leak on reload
    for (const [name, trie] of this.dictionaries.entries()) {
      if (trie && typeof trie.dispose === 'function') {
        try {
          trie.dispose(); // Recursively clean up trie nodes and their children Maps
          this.log(DEBUG_LEVELS.DEBUG, `🗑️ Disposed dictionary "${name}" before reload`);
        } catch (error) {
          this.log(DEBUG_LEVELS.ERROR, `Error disposing dictionary ${name}:`, error);
        }
      }
    }

    // Clear existing dictionaries
    this.dictionaries.clear();
    this.flatEntries.clear();
    this.metadata.clear();

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
        this.log(DEBUG_LEVELS.ERROR, `Skipping invalid dictionary: ${dictionaryName}`);
        continue;
      }

      let trie;
      let entryCount = 0;
      let fromCache = false;

      // Try loading from precomputed cache if enabled
      if (this.enablePrecomputedCache && this.tauriAPI) {
        try {
          const cacheResult = await loadDictionaryWithCache(
            dictionaryName,
            dictionary,
            this.tauriAPI
          );

          if (cacheResult) {
            trie = cacheResult.trie;
            fromCache = cacheResult.fromCache;
            entryCount = trie.size;

            if (fromCache) {
              this.log(
                DEBUG_LEVELS.INFO,
                `⚡ Loaded ${dictionaryName} from cache (${entryCount} entries, ${cacheResult.loadTime.toFixed(2)}ms)`
              );
            }
          }
        } catch (cacheError) {
          this.log(
            DEBUG_LEVELS.DEBUG,
            `Cache load failed for ${dictionaryName}, building from dictionary:`,
            cacheError
          );
        }
      }

      // Fallback: build trie from dictionary if cache didn't work
      const priority = resolveDictionaryPriority(dictionaryName, priorities);
      if (!trie) {
        const built = buildTrieFromDictionary(dictionary, priority);
        trie = built.trie;
        entryCount = built.entryCount;
        for (const invalidSource of built.invalidSources) {
          this.log(
            DEBUG_LEVELS.ERROR,
            `Invalid entry format for "${invalidSource}" in dictionary "${dictionaryName}"`
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

      this.log(DEBUG_LEVELS.DEBUG, `Loaded ${dictionaryName}: ${entryCount} entries`);
    }

    this.loadTime = performance.now() - startTime;
    this.ready = true;

    this.log(DEBUG_LEVELS.INFO, `✅ Dictionary loading completed in ${this.loadTime.toFixed(2)}ms`);
    this.log(DEBUG_LEVELS.DEBUG, '📊 Dictionary stats:', this.getGlobalStats());

    if (this.wasmLookup?.isReady()) {
      try {
        await this.syncDictionariesToWasm();
      } catch (error) {
        this.log(1, '⚠️ WASM sync failed, continuing with JavaScript only:', error);
      }
    }
  }

  /**
   * Find translation for a word across all dictionaries
   * @param {string} word - Word to translate
   * @param {Array} dictionaryOrder - Specific order of dictionaries to check
   * @returns {Object|null} Translation result with metadata
   */
  translate(word, dictionaryOrder = null) {
    if (!this.ready) {
      this.log(DEBUG_LEVELS.ERROR, 'Dictionary manager not ready');
      return null;
    }

    if (this.wasmLookup?.isReady()) {
      try {
        return this.wasmLookup.translate(word, dictionaryOrder || this.getDefaultSearchOrder());
      } catch (error) {
        this.log(1, '⚠️ WASM translate failed, falling back to JavaScript:', error);
      }
    }

    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();

    // Check cache first for multi-dictionary lookup
    const cachedResult = this.cache.getLookup(word, searchOrder);
    if (cachedResult) {
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
   * Pure search-order trie walk — no cache reads/writes, no WASM dispatch. Used by
   * translate()'s JS-fallback path (which layers caching on top of the result) and as
   * the cache-free JS oracle for the WASM/JS lookup parity tests — a cache hit would
   * mask a live WASM/JS divergence instead of surfacing it.
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
   * Find all possible matches with automatic parallel/sequential selection
   * (WASM-first, JS fallback). Delegates to DictionaryMatchLookup.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Promise<Array>} All possible matches sorted by priority and length
   */
  async findAllMatchesAsync(text, startPos = 0, dictionaryOrder = null) {
    return this.matchLookup.findAllMatchesAsync(text, startPos, dictionaryOrder);
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
   * Clear all dictionaries
   */
  clear() {
    this.dictionaries.clear();
    this.flatEntries.clear();
    this.metadata.clear();
    this.ready = false;
    this.loadTime = 0;
    this.cache.clear(); // Clear translation cache
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

    // Dispose each dictionary trie properly
    for (const [name, trie] of this.dictionaries.entries()) {
      if (trie && typeof trie.dispose === 'function') {
        try {
          trie.dispose(); // Let trie clean up its internal structures
        } catch (error) {
          this.log(DEBUG_LEVELS.ERROR, `Error disposing dictionary ${name}:`, error);
        }
      }
    }

    // Clear and nullify all references for GC
    this.dictionaries.clear();
    this.dictionaries = null;

    this.flatEntries.clear();
    this.flatEntries = null;

    this.metadata.clear();
    this.metadata = null;

    // Dispose cache
    if (this.cache) {
      // CODE REVIEW FIX (MEDIUM-1): Use dispose() method for proper cleanup
      if (typeof this.cache.dispose === 'function') {
        this.cache.dispose();
      } else {
        this.cache.clear(); // Fallback for older implementations
      }
      this.cache = null;
    }

    // Cleanup WASM lookup
    this.wasmLookup?.dispose();
    this.wasmLookup = null;

    // Reset state flags
    this.ready = false;
    this.loadTime = 0;

    this.log(DEBUG_LEVELS.INFO, '🧹 DictionaryManager disposed successfully');
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

  // ─── WASM Acceleration ────────────────────────────────────────────────────

  /**
   * Push dictionary entries into the WASM engine.
   *
   * @param {string} [dictionaryName] - Sync only this dictionary. Omit to sync all.
   *
   * Scoped by name wherever the caller knows it, because this is not cheap: a sync
   * serializes every entry of every named dictionary to JSON, hands the string to Rust to
   * deserialize, and rebuilds the trie on the other side. The characters dictionary alone
   * is 27,000+ entries. Editing one entry used to re-upload all of them — and the editor
   * calls `invalidateDictionaryCaches(dictionaryName)` after *every* add, so adding twenty
   * entries in a reading session paid that twenty times over.
   *
   * An unknown name syncs nothing rather than falling back to everything: a silent full
   * sync is exactly the cost this parameter exists to avoid, and a typo that quietly still
   * works is a typo that never gets fixed.
   */
  async syncDictionariesToWasm(dictionaryName) {
    if (!this.wasmLookup?.isReady()) return;

    if (dictionaryName !== undefined && dictionaryName !== null) {
      const entries = this.flatEntries.get(dictionaryName);
      if (entries === undefined) {
        this.log(
          DEBUG_LEVELS.DEBUG,
          `Skipping WASM sync for unknown dictionary: ${dictionaryName}`
        );
        return;
      }
      return this.wasmLookup.sync(new Map([[dictionaryName, entries]]), this._extractPriorityMap());
    }

    return this.wasmLookup.sync(this.flatEntries, this._extractPriorityMap());
  }

  _extractPriorityMap() {
    const result = new Map();
    for (const [name, meta] of this.metadata) {
      result.set(name, meta.priority ?? 999);
    }
    return result;
  }

  getWasmStatus() {
    return (
      this.wasmLookup?.getStatus() ?? {
        initialized: false,
        ready: false,
        hasAdapter: false,
      }
    );
  }

  getMemoryUsage() {
    return {
      dictionaries: this.dictionaries?.size ?? 0,
      cacheEnabled: !!this.cache,
      wasmMemory: this.wasmLookup?.getTimingStats()?.memoryUsage ?? null,
    };
  }
}
