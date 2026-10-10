/**
 * Lookup memo for multi-dictionary translations.
 *
 * `DictionaryManager.translate` is the only reader: it keys a result by the word plus
 * the dictionary search order. A miss is memoized too (as `null`). Each entry remembers the
 * dictionaries it searched, so invalidating one drops every lookup that searched it by scanning
 * the (bounded) LRU: edits are rare, and a separate key index would outlive the evictions that
 * make its keys stale.
 */

import { LRUCache } from '../caching/LRUCache.js';
import { logger } from '../logger.js';

export class TranslationCache {
  constructor(options = {}) {
    this.lookupCacheSize = options.lookupCacheSize || 800;
    this.lookupCache = new LRUCache(this.lookupCacheSize);

    this.isEnabled = options.enabled !== false; // Default to enabled
  }

  /**
   * Generate cache key for multi-dictionary lookup.
   * Caches the joined dictionary key to avoid repeated Array.join() allocations
   * when the dictionary set hasn't changed between calls.
   *
   * Fast-path: same array reference → skip entirely.
   * Slow-path: different reference → element-wise comparison before deciding
   * whether to re-join. Avoids join() when callers create a new array each time
   * but the contents are identical (common pattern).
   *
   * @param {string} text - Text to translate
   * @param {Array} dictionaryNames - Array of dictionary names
   * @returns {string} Cache key
   */
  generateMultiLookupKey(text, dictionaryNames) {
    if (dictionaryNames !== this._lastDictNames) {
      // Reference changed — check whether the contents actually differ
      // before paying for join(). With 3-7 dictionaries this loop is
      // cheaper than a string allocation.
      let changed = !this._lastDictNames || dictionaryNames.length !== this._lastDictNames.length;
      if (!changed) {
        for (let i = 0; i < dictionaryNames.length; i++) {
          if (dictionaryNames[i] !== this._lastDictNames[i]) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        this._lastDictKey = dictionaryNames.join(',');
      }
      this._lastDictNames = dictionaryNames;
    }
    return `${this._lastDictKey}:${text}`;
  }

  /**
   * Get cached multi-dictionary lookup result
   * @param {string} text - Text to translate
   * @param {Array} dictionaryNames - Array of dictionary names
   * @returns {*} Cached result or undefined
   */
  getLookup(text, dictionaryNames) {
    if (!this.isEnabled) return undefined;
    return this.lookupCache.get(this.generateMultiLookupKey(text, dictionaryNames))?.result;
  }

  /**
   * Cache multi-dictionary lookup result, remembering every dictionary searched
   * @param {string} text - Text translated
   * @param {Array} dictionaryNames - Array of dictionary names
   * @param {*} result - Translation result
   */
  setLookup(text, dictionaryNames, result) {
    if (!this.isEnabled) return;

    const cacheKey = this.generateMultiLookupKey(text, dictionaryNames);
    this.lookupCache.set(cacheKey, { result, dictionaryNames: [...dictionaryNames] });
  }

  /**
   * Drop every memoized lookup that searched this dictionary, even when the key's
   * other dictionaries are unchanged.
   * @param {string} dictionaryName - Dictionary name to invalidate
   */
  invalidateDictionary(dictionaryName) {
    for (const [key, entry] of this.lookupCache.entries()) {
      if (entry.dictionaryNames.includes(dictionaryName)) this.lookupCache.delete(key);
    }
  }

  /** Clear the memo */
  clear() {
    this.lookupCache.clear();
  }

  /**
   * Release all cache resources. Safe to call multiple times (idempotent).
   * Called before discarding the instance so GC can reclaim memory.
   */
  dispose() {
    if (this.lookupCache === null) {
      return; // Already disposed
    }

    this.clear();

    // Disable caching to prevent new entries
    this.isEnabled = false;

    this.lookupCache = null;

    logger.log('🗑️ TranslationCache disposed');
  }

  /**
   * Enable or disable caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }
}
