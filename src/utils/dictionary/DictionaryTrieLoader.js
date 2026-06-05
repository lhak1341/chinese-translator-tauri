// @ts-check
/**
 * Dictionary Trie Loader with Precomputed Cache Support
 *
 * Integrates precomputed trie caching into dictionary loading for 5-7x speedup.
 *
 * @module DictionaryTrieLoader
 */

import {
  tryLoadPrecomputedTrie,
  savePrecomputedTrie,
  invalidatePrecomputedTrie,
  precomputedTrieStats,
} from '../caching/PrecomputedTrieCache.js';
import { logger } from '../logger.js';
import { DictionaryTrie, TrieNode } from './DictionaryTrie.js';

/**
 * Load dictionary with precomputed trie caching
 *
 * @param {string} dictionaryName - Name of dictionary (e.g., "phrases", "characters")
 * @param {Object} dictionaryData - Dictionary key-value pairs
 * @param {{ loadDictionary: Function, saveDictionary: Function }} tauriAPI - Tauri API for file operations
 * @returns {Promise<Object>} {trie: DictionaryTrie, fromCache: boolean, loadTime: number}
 */
export async function loadDictionaryWithCache(dictionaryName, dictionaryData, tauriAPI) {
  const startTime = performance.now();

  // Helper to load cache file
  const loadCacheFile = async (/** @type {string} */ cacheFileName) => {
    try {
      // Try loading .trie.json using the same API as dictionaries
      const cacheId = cacheFileName.replace('.json', '');
      const result = await tauriAPI.loadDictionary(cacheId);
      return result.success ? result.data : null;
    } catch (error) {
      logger.debug(`[DictionaryTrieLoader] Cache file not accessible: ${cacheFileName}`);
      return null;
    }
  };

  // Try loading precomputed trie
  const cached = await tryLoadPrecomputedTrie(
    dictionaryName,
    dictionaryData,
    loadCacheFile,
    TrieNode
  );

  if (cached) {
    // Cache hit - create trie with cached data
    const trie = new DictionaryTrie();
    const cachedTrie = /** @type {{ root: any, size: number }} */ (cached);
    trie.root = cachedTrie.root;
    trie.size = cachedTrie.size;

    const loadTime = performance.now() - startTime;
    precomputedTrieStats.recordCacheHit(loadTime);

    logger.log(
      `⚡ [DictionaryTrieLoader] Loaded ${dictionaryName} from cache in ${loadTime.toFixed(2)}ms (${trie.size} entries)`
    );

    return {
      trie,
      fromCache: true,
      loadTime,
    };
  }

  // Cache miss - build trie from dictionary
  const buildStartTime = performance.now();
  const trie = new DictionaryTrie();

  for (const [source, target] of Object.entries(dictionaryData)) {
    if (typeof source === 'string') {
      let translation,
        metadata = null;

      // Handle both formats
      if (typeof target === 'string') {
        translation = target;
      } else if (typeof target === 'object' && target.translation) {
        translation = target.translation;
        // Preserve metadata if present
        metadata = target;
      } else {
        continue;
      }

      trie.insert(source, translation, metadata);
    }
  }

  const buildTime = performance.now() - buildStartTime;
  precomputedTrieStats.recordCacheMiss(buildTime);

  logger.log(
    `🔨 [DictionaryTrieLoader] Built ${dictionaryName} from dictionary in ${buildTime.toFixed(2)}ms (${trie.size} entries)`
  );

  // Save to cache asynchronously (don't wait)
  saveDictionaryCache(dictionaryName, dictionaryData, trie, tauriAPI).catch((error) => {
    logger.debug(`[DictionaryTrieLoader] Failed to save cache for ${dictionaryName}:`, error);
  });

  const totalTime = performance.now() - startTime;

  return {
    trie,
    fromCache: false,
    loadTime: totalTime,
  };
}

/**
 * Save dictionary trie cache
 *
 * @param {string} dictionaryName - Name of dictionary
 * @param {Object} dictionaryData - Dictionary data
 * @param {{ root: any, size: number }} trie - DictionaryTrie instance
 * @param {{ loadDictionary: Function, saveDictionary: Function }} tauriAPI - Tauri API
 * @returns {Promise<boolean>} Success status
 */
async function saveDictionaryCache(dictionaryName, dictionaryData, trie, tauriAPI) {
  const saveCacheFile = async (/** @type {string} */ cacheFileName, /** @type {string} */ data) => {
    try {
      // Save .trie.json using the same API as dictionaries
      const cacheId = cacheFileName.replace('.json', '');
      const result = await tauriAPI.saveDictionary(cacheId, data);

      if (result.success) {
        precomputedTrieStats.recordCacheSave();
      }

      return result.success;
    } catch (error) {
      logger.debug(`[DictionaryTrieLoader] Failed to save cache file: ${cacheFileName}`);
      return false;
    }
  };

  return await savePrecomputedTrie(dictionaryName, dictionaryData, trie, saveCacheFile);
}

/**
 * Invalidate dictionary trie cache
 *
 * Call this when dictionary is modified to force rebuild on next load
 *
 * @param {string} dictionaryName - Name of dictionary
 * @param {Object} tauriAPI - Tauri API
 * @returns {Promise<boolean>} Success status
 */
async function invalidateDictionaryCache(dictionaryName, tauriAPI) {
  const deleteCacheFile = async (/** @type {string} */ cacheFileName) => {
    try {
      // For now, just return false - deletion can be added later
      // The checksum validation will handle stale caches
      logger.debug(
        `[DictionaryTrieLoader] Cache invalidation requested for ${cacheFileName} (will rebuild on next load)`
      );
      return false;
    } catch (error) {
      return false;
    }
  };

  const result = await invalidatePrecomputedTrie(dictionaryName, deleteCacheFile);
  if (result) {
    precomputedTrieStats.recordCacheInvalidation();
  }
  return result;
}

/**
 * Get cache statistics
 *
 * @returns {Object} Cache performance statistics
 */
export function getCacheStats() {
  return precomputedTrieStats.getSummary();
}

// Expose globally for debugging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // @ts-ignore - debug convenience property
  window.dictionaryTrieLoader = {
    getCacheStats,
    invalidateCache: invalidateDictionaryCache,
  };
}
