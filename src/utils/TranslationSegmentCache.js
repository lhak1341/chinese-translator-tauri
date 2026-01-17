/**
 * Translation Segment Cache
 * High-performance caching system for translated text segments
 *
 * Features:
 * - Persistent localStorage caching across sessions
 * - Automatic cache size management and cleanup
 * - Hash-based content addressing for cache keys
 * - Dictionary version tracking for cache invalidation
 * - Performance metrics and cache hit/miss tracking
 *
 * Cache Key Format: hash(originalText + dictionaryFingerprint + configOptions)
 * Cache Entry: { translatedText, semanticArrays, timestamp, hitCount, dictVersion }
 *
 * @import {
 *   TranslationSegmentCacheOptions,
 *   SegmentCacheEntry,
 *   CacheMetadata,
 *   TranslationSegmentCache as ITranslationSegmentCache
 * } from '../types/CacheTypes'
 */

export class TranslationSegmentCache {
  constructor(options = {}) {
    this.maxCacheSize = options.maxCacheSize || 1000; // Maximum cached segments
    this.maxCacheAge = options.maxCacheAge || 7 * 24 * 60 * 60 * 1000; // 7 days in ms

    // MEDIUM-2 FIX: Window-specific cache prefix to prevent multi-tab conflicts
    // Each browser window/tab gets unique cache namespace
    // Why: Multiple windows writing to same localStorage keys causes last-write-wins corruption
    this.windowId = `w${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.cacheKeyPrefix = `translation-cache-${this.windowId}-`;
    this.metadataKey = `translation-cache-metadata-${this.windowId}`;

    // Performance tracking
    this.stats = {
      hits: 0,
      misses: 0,
      stores: 0,
      evictions: 0,
      totalLookups: 0,
      hitRate: 0,
      averageLookupTime: 0,
    };

    // Initialize or load existing metadata
    this.metadata = this.loadMetadata();

    // MEMORY LEAK FIX: Store interval ID for cleanup
    this.cleanupIntervalId = null;

    // PERFORMANCE FIX: Incremental size tracking to avoid O(n) quota checks
    // Track approximate localStorage size in bytes (updated incrementally)
    this.approximateSize = 0;
    this.writesSinceRecalculation = 0;
    this.RECALCULATION_INTERVAL = 100; // Recalculate full size every 100 writes

    // Calculate initial size
    this._recalculateSize();

    // MEMORY LEAK FIX: Clean up orphaned cache entries from previous sessions
    this._cleanupOrphanedEntries();

    // Periodic cleanup (every 5 minutes when active)
    this.setupPeriodicCleanup();
  }

  /**
   * Generate cache key from translation parameters
   * Uses content hash + dictionary fingerprint for accurate cache addressing
   */
  generateCacheKey(originalText, dictionaryFingerprint, options = {}) {
    const startTime = performance.now();

    // SECURITY FIX: Sanitize options to prevent cache collisions from unexpected types
    const safeOptions = this.sanitizeOptions(options);

    // Simple but effective hash for cache key generation
    const hashContent =
      originalText + '|' + dictionaryFingerprint + '|' + JSON.stringify(safeOptions);
    const hash = this.simpleHash(hashContent);

    this.stats.averageLookupTime =
      (this.stats.averageLookupTime + (performance.now() - startTime)) / 2;

    return `${this.cacheKeyPrefix}${hash}`;
  }

  /**
   * Sanitize options object to prevent cache collisions from unexpected types
   * Only allows primitive string/number/boolean values
   */
  sanitizeOptions(options) {
    if (!options || typeof options !== 'object') {
      return {};
    }

    const safeOptions = {};
    for (const key of Object.keys(options)) {
      const value = options[key];
      // Only allow primitive types that serialize predictably
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safeOptions[key] = value;
      }
      // Skip functions, objects, symbols, undefined, etc.
    }
    return safeOptions;
  }

  /**
   * Fast hash function for cache key generation
   * Simple but sufficient for cache addressing
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate dictionary fingerprint for cache invalidation
   * Creates unique identifier based on dictionary content and versions
   */
  generateDictionaryFingerprint(dictionaryManager) {
    if (!dictionaryManager || !dictionaryManager.ready) {
      return 'no-dictionaries';
    }

    try {
      // Get active dictionary names and their metadata
      const activeDictionaries = dictionaryManager.getActiveDictionaryNames?.() || [];
      const dictionaryVersions = activeDictionaries
        .map((name) => {
          const dict = dictionaryManager.getDictionary?.(name);
          return `${name}:${dict?.version || dict?.size || 0}`;
        })
        .join(',');

      return this.simpleHash(dictionaryVersions);
    } catch (error) {
      console.warn('Failed to generate dictionary fingerprint:', error);
      return 'fingerprint-error';
    }
  }

  /**
   * Get cached translation result
   * Returns null if not found or expired
   */
  get(originalText, dictionaryFingerprint, options = {}) {
    const startTime = performance.now();
    this.stats.totalLookups++;

    try {
      const cacheKey = this.generateCacheKey(originalText, dictionaryFingerprint, options);
      const cachedDataStr = localStorage.getItem(cacheKey);

      if (!cachedDataStr) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      // ERROR HANDLING FIX: Validate JSON.parse to prevent cache corruption crashes
      let cachedData;
      try {
        cachedData = JSON.parse(cachedDataStr);
      } catch (parseError) {
        // Corrupted cache entry - remove and treat as miss
        console.warn(`Corrupted cache entry removed: ${cacheKey}`, parseError.message);
        this._removeEntry(cacheKey);
        this.stats.misses++;
        this.stats.evictions++;
        this.updateHitRate();
        return null;
      }

      // ERROR HANDLING FIX: Validate cached data structure
      if (
        !cachedData ||
        typeof cachedData !== 'object' ||
        !cachedData.translatedText ||
        !cachedData.semanticArrays ||
        typeof cachedData.timestamp !== 'number'
      ) {
        console.warn(`Invalid cache data structure, removing: ${cacheKey}`);
        this._removeEntry(cacheKey);
        this.stats.misses++;
        this.stats.evictions++;
        this.updateHitRate();
        return null;
      }

      const now = Date.now();

      // Check if cache entry is expired
      if (now - cachedData.timestamp > this.maxCacheAge) {
        this._removeEntry(cacheKey);
        this.stats.misses++;
        this.stats.evictions++;
        this.updateHitRate();
        return null;
      }

      // Update hit count and last access time
      try {
        cachedData.hitCount = (cachedData.hitCount || 0) + 1;
        cachedData.lastAccess = now;
        localStorage.setItem(cacheKey, JSON.stringify(cachedData));
      } catch (error) {
        // Failed to update hit count - non-critical, just log
        console.warn('Failed to update cache hit count:', error);
      }

      this.stats.hits++;
      this.updateHitRate();

      if (process.env.NODE_ENV === 'development') {
        // Use batched logging to reduce console overhead for frequent cache hits
        import('./BatchLogger.js').then(({ batchLog }) => {
          batchLog.hotVerbose(
            'cache-hits',
            `Cache HIT: ${originalText.substring(0, 30)}... (${(performance.now() - startTime).toFixed(1)}ms)`
          );
        });
      }

      return {
        translatedText: cachedData.translatedText,
        semanticArrays: cachedData.semanticArrays,
      };
    } catch (error) {
      console.warn('Cache get error:', error);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * Store translation result in cache
   * Implements LRU eviction when cache is full
   */
  set(originalText, translatedText, semanticArrays, dictionaryFingerprint, options = {}) {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(originalText, dictionaryFingerprint, options);
    const now = Date.now();

    const cacheEntry = {
      originalText:
        originalText.length > 100 ? originalText.substring(0, 100) + '...' : originalText, // Store partial for debugging
      translatedText,
      semanticArrays,
      timestamp: now,
      lastAccess: now,
      hitCount: 0,
      dictFingerprint: dictionaryFingerprint,
    };

    try {
      // MEMORY PROFILING FIX: Proactive quota monitoring to prevent quota exceeded errors
      // Check quota before storing to avoid delays from reactive cleanup
      if (this.isApproachingQuota()) {
        this.proactiveCleanup();
      }

      // Check if we need to evict old entries before storing
      this.ensureCacheSpace();

      const serializedEntry = JSON.stringify(cacheEntry);
      localStorage.setItem(cacheKey, serializedEntry);
      this.addToMetadata(cacheKey, now);

      // PERFORMANCE FIX: Track size incrementally
      this.approximateSize += this._estimateEntrySize(cacheKey, serializedEntry);
      this.writesSinceRecalculation++;

      this.stats.stores++;

      if (process.env.NODE_ENV === 'development') {
        // Use batched logging to reduce console overhead for frequent cache stores
        import('./BatchLogger.js').then(({ batchLog }) => {
          batchLog.hotVerbose(
            'cache-stores',
            `Cache STORE: ${originalText.substring(0, 30)}... (${(performance.now() - startTime).toFixed(1)}ms)`
          );
        });
      }
    } catch (error) {
      // Handle localStorage quota exceeded
      if (error.name === 'QuotaExceededError') {
        console.warn('Cache storage quota exceeded, cleaning up old entries');
        this.aggressiveCleanup();
        // Retry once after cleanup
        try {
          const serializedEntry = JSON.stringify(cacheEntry);
          localStorage.setItem(cacheKey, serializedEntry);
          this.addToMetadata(cacheKey, now);

          // PERFORMANCE FIX: Track size incrementally on retry too
          this.approximateSize += this._estimateEntrySize(cacheKey, serializedEntry);
          this.writesSinceRecalculation++;

          this.stats.stores++;
        } catch (retryError) {
          console.warn('Cache store failed after cleanup:', retryError);
        }
      } else {
        console.warn('Cache set error:', error);
      }
    }
  }

  /**
   * Ensure cache doesn't exceed size limits
   * Implements LRU eviction strategy
   */
  ensureCacheSpace() {
    const cacheKeys = this.metadata.keys || [];

    if (cacheKeys.length >= this.maxCacheSize) {
      // Sort by last access time (ascending) to find LRU entries
      const keyStats = cacheKeys.map((key) => {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          return {
            key,
            lastAccess: data.lastAccess || 0,
            hitCount: data.hitCount || 0,
          };
        } catch (_error) {
          return { key, lastAccess: 0, hitCount: 0 };
        }
      });

      // Sort by last access time (oldest first), then by hit count (least used first)
      keyStats.sort((a, b) => {
        if (a.lastAccess !== b.lastAccess) {
          return a.lastAccess - b.lastAccess;
        }
        return a.hitCount - b.hitCount;
      });

      // Remove oldest 20% of entries to make room
      const entriesToRemove = Math.max(1, Math.floor(this.maxCacheSize * 0.2));

      for (let i = 0; i < entriesToRemove; i++) {
        if (keyStats[i]) {
          this._removeEntry(keyStats[i].key);
          this.stats.evictions++;
        }
      }

      if (process.env.NODE_ENV === 'development') {
        // Use immediate logging for cache eviction (infrequent but important)
        import('./BatchLogger.js').then(({ batchLog }) => {
          batchLog.immediate('INFO', `Cache evicted ${entriesToRemove} LRU entries`);
        });
      }
    }
  }

  /**
   * MEMORY PROFILING FIX: Check if localStorage is approaching quota limit
   * @returns {boolean} True if localStorage usage > 80% of typical 5MB quota
   */
  /**
   * PERFORMANCE FIX: Recalculate actual localStorage size
   * Only called periodically (every 100 writes) to correct drift
   */
  _recalculateSize() {
    try {
      let totalBytes = 0;
      const cacheKeys = this.metadata.keys || [];

      for (const key of cacheKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          // Each character is ~2 bytes in UTF-16
          totalBytes += (key.length + value.length) * 2;
        }
      }

      // Also count metadata
      const metadataStr = localStorage.getItem(this.metadataKey);
      if (metadataStr) {
        totalBytes += (this.metadataKey.length + metadataStr.length) * 2;
      }

      this.approximateSize = totalBytes;
      return totalBytes;
    } catch (error) {
      console.warn('Failed to recalculate localStorage size:', error);
      return this.approximateSize; // Keep current approximation on error
    }
  }

  /**
   * PERFORMANCE FIX: Estimate entry size for incremental tracking
   */
  _estimateEntrySize(key, value) {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    return (key.length + valueStr.length) * 2; // UTF-16 encoding
  }

  isApproachingQuota() {
    try {
      // PERFORMANCE FIX: Use incremental size tracking instead of O(n) loop
      // Periodically recalculate to correct drift
      if (this.writesSinceRecalculation >= this.RECALCULATION_INTERVAL) {
        this._recalculateSize();
        this.writesSinceRecalculation = 0;
      }

      const totalMB = this.approximateSize / 1024 / 1024;
      const quotaLimitMB = 4; // 80% of typical 5MB quota

      if (totalMB > quotaLimitMB) {
        console.warn(
          `⚠️ localStorage approaching quota: ${totalMB.toFixed(2)}MB / 5MB (${((totalMB / 5) * 100).toFixed(1)}%) [${this.writesSinceRecalculation === 0 ? 'exact' : 'approximate'}]`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.warn('Failed to check localStorage quota:', error);
      return false; // Don't trigger cleanup on errors
    }
  }

  /**
   * MEMORY LEAK FIX: Clean up orphaned cache entries from previous sessions
   * Removes entries with different window IDs that were created in previous app runs
   */
  _cleanupOrphanedEntries() {
    try {
      let removedCount = 0;
      const currentPrefix = this.cacheKeyPrefix;
      const currentMetadataKey = this.metadataKey;

      // Scan all localStorage keys for translation cache entries
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        // Check if it's a translation cache key but not from current session
        if (key.startsWith('translation-cache-') && !key.startsWith(currentPrefix)) {
          // Skip metadata keys from other sessions (will be cleaned with their entries)
          if (key.includes('-metadata-')) {
            localStorage.removeItem(key);
            removedCount++;
            continue;
          }

          // It's an orphaned cache entry from a previous session
          localStorage.removeItem(key);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`🧹 Cleaned up ${removedCount} orphaned cache entries from previous sessions`);
      }
    } catch (error) {
      console.warn('Failed to clean up orphaned cache entries:', error);
    }
  }

  /**
   * MEMORY PROFILING FIX: Proactive cleanup to prevent quota exceeded errors
   * More aggressive than reactive cleanup - removes entries older than 3 days
   */
  proactiveCleanup() {
    const now = Date.now();
    const cacheKeys = this.metadata.keys || [];
    let removedCount = 0;

    // Remove entries older than 3 days (less aggressive than 1-day reactive cleanup)
    cacheKeys.forEach((key) => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (now - (data.timestamp || 0) > 3 * 24 * 60 * 60 * 1000) {
          // 3 days
          this._removeEntry(key);
          removedCount++;
        }
      } catch (_error) {
        // Remove corrupted entries
        this._removeEntry(key);
        removedCount++;
      }
    });

    if (removedCount > 0) {
      console.log(`🧹 Proactive quota cleanup removed ${removedCount} entries older than 3 days`);
    }
  }

  /**
   * Aggressive cleanup when storage quota exceeded
   */
  aggressiveCleanup() {
    const now = Date.now();
    const cacheKeys = this.metadata.keys || [];
    let removedCount = 0;

    // Remove all entries older than 1 day
    cacheKeys.forEach((key) => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (now - (data.timestamp || 0) > 24 * 60 * 60 * 1000) {
          // 1 day
          this._removeEntry(key);
          removedCount++;
        }
      } catch (_error) {
        // Remove corrupted entries
        this._removeEntry(key);
        removedCount++;
      }
    });

    console.log(`🔥 Aggressive cleanup removed ${removedCount} old cache entries`);
  }

  /**
   * Load or initialize cache metadata
   */
  loadMetadata() {
    try {
      const metadataStr = localStorage.getItem(this.metadataKey);
      if (metadataStr) {
        return JSON.parse(metadataStr);
      }
    } catch (error) {
      console.warn('Failed to load cache metadata:', error);
    }

    return {
      keys: [],
      created: Date.now(),
      lastCleanup: Date.now(),
    };
  }

  /**
   * Save cache metadata
   */
  saveMetadata() {
    try {
      localStorage.setItem(this.metadataKey, JSON.stringify(this.metadata));
    } catch (error) {
      console.warn('Failed to save cache metadata:', error);
    }
  }

  /**
   * Add key to metadata tracking
   */
  addToMetadata(key, _timestamp) {
    if (!this.metadata.keys.includes(key)) {
      this.metadata.keys.push(key);
      this.saveMetadata();
    }
  }

  /**
   * Remove key from metadata tracking
   */
  removeFromMetadata(key) {
    this.metadata.keys = this.metadata.keys.filter((k) => k !== key);
    this.saveMetadata();
  }

  /**
   * PERFORMANCE FIX: Remove cache entry and update size tracking
   * Helper to ensure size tracking stays in sync with removals
   */
  _removeEntry(key) {
    try {
      // Get entry size before removing
      const value = localStorage.getItem(key);
      if (value) {
        const entrySize = this._estimateEntrySize(key, value);
        localStorage.removeItem(key);
        this.removeFromMetadata(key);

        // Update approximate size
        this.approximateSize = Math.max(0, this.approximateSize - entrySize);
      } else {
        // Entry doesn't exist, just clean up metadata
        this.removeFromMetadata(key);
      }
    } catch (error) {
      console.warn('Error removing cache entry:', error);
      // Still try to remove from metadata
      this.removeFromMetadata(key);
    }
  }

  /**
   * Update hit rate statistics
   */
  updateHitRate() {
    this.stats.hitRate =
      this.stats.totalLookups > 0 ? (this.stats.hits / this.stats.totalLookups) * 100 : 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.metadata.keys.length,
      maxCacheSize: this.maxCacheSize,
      hitRate: Math.round(this.stats.hitRate * 10) / 10, // Round to 1 decimal
      averageLookupTime: Math.round(this.stats.averageLookupTime * 100) / 100, // Round to 2 decimals
    };
  }

  /**
   * Clear all cached data
   */
  clear() {
    const keys = this.metadata.keys || [];
    keys.forEach((key) => localStorage.removeItem(key));

    localStorage.removeItem(this.metadataKey);

    this.metadata = {
      keys: [],
      created: Date.now(),
      lastCleanup: Date.now(),
    };

    this.stats = {
      hits: 0,
      misses: 0,
      stores: 0,
      evictions: 0,
      totalLookups: 0,
      hitRate: 0,
      averageLookupTime: 0,
    };

    // PERFORMANCE FIX: Reset size tracking
    this.approximateSize = 0;
    this.writesSinceRecalculation = 0;

    console.log('🧹 Translation cache cleared');
  }

  /**
   * Setup periodic cleanup of expired entries
   */
  setupPeriodicCleanup() {
    // MEMORY LEAK FIX: Store interval ID for cleanup
    // Run cleanup every 5 minutes when active
    this.cleanupIntervalId = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000
    );
  }

  /**
   * MEMORY LEAK FIX: Cleanup method to stop periodic cleanup timer
   * Call this when cache is no longer needed to prevent memory leaks
   */
  destroy() {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Clean up expired entries
   */
  cleanupExpiredEntries() {
    const now = Date.now();

    // Skip cleanup if done recently
    if (now - this.metadata.lastCleanup < 5 * 60 * 1000) {
      return;
    }

    const cacheKeys = this.metadata.keys || [];
    let cleanedCount = 0;

    cacheKeys.forEach((key) => {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          const parsedData = JSON.parse(data);
          if (now - parsedData.timestamp > this.maxCacheAge) {
            this._removeEntry(key);
            cleanedCount++;
          }
        } else {
          // Remove orphaned metadata entries
          this.removeFromMetadata(key);
        }
      } catch (_error) {
        // Remove corrupted entries
        this._removeEntry(key);
        cleanedCount++;
      }
    });

    this.metadata.lastCleanup = now;
    this.saveMetadata();

    if (cleanedCount > 0 && process.env.NODE_ENV === 'development') {
      // Use immediate logging for periodic cleanup (infrequent but informative)
      import('./BatchLogger.js').then(({ batchLog }) => {
        batchLog.immediate(
          'INFO',
          `Periodic cleanup removed ${cleanedCount} expired cache entries`
        );
      });
    }
  }
}

// Export a singleton instance for easy usage
export const translationSegmentCache = new TranslationSegmentCache({
  maxCacheSize: 1000, // Store up to 1000 translation segments
  maxCacheAge: 7 * 24 * 60 * 60 * 1000, // Keep for 7 days
});

export default TranslationSegmentCache;
