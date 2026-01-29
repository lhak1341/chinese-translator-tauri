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
 */

import { logger } from './logger';

/**
 * Options for TranslationSegmentCache constructor
 */
export interface TranslationSegmentCacheOptions {
  /** Maximum number of cached segments before eviction (default: 1000) */
  maxCacheSize?: number;

  /** Maximum age of cache entries in milliseconds (default: 7 days) */
  maxCacheAge?: number;
}

/**
 * Cache metadata for tracking all cached entries
 * Stored in localStorage to persist across sessions
 */
interface CacheMetadataStructure {
  /** Array of all cache keys currently stored */
  keys: string[];

  /** Timestamp when metadata was created */
  created: number;

  /** Timestamp of last cleanup operation */
  lastCleanup: number;
}

/**
 * Cached translation entry
 * Stored in localStorage with cache key as the key
 */
interface CachedEntry {
  /** Partial original text for debugging (truncated to 100 chars) */
  originalText: string;

  /** Full translated text */
  translatedText: string;

  /** Semantic arrays for clickable highlighting */
  semanticArrays: {
    original: string[];
    translated: string[];
    metadata: any[];
  };

  /** Timestamp when entry was created */
  timestamp: number;

  /** Timestamp of last access */
  lastAccess: number;

  /** Number of times this entry was accessed */
  hitCount: number;

  /** Dictionary fingerprint for cache invalidation */
  dictFingerprint: string;
}

/**
 * Cache statistics for performance monitoring
 */
interface CacheStatistics {
  /** Total cache hits */
  hits: number;

  /** Total cache misses */
  misses: number;

  /** Total cache stores */
  stores: number;

  /** Total cache evictions */
  evictions: number;

  /** Total lookup operations */
  totalLookups: number;

  /** Hit rate percentage */
  hitRate: number;

  /** Average lookup time in milliseconds */
  averageLookupTime: number;
}

/**
 * Return type for get() method
 */
interface CacheGetResult {
  /** Translated text */
  translatedText: string;

  /** Semantic arrays for clickable highlighting */
  semanticArrays: {
    original: string[];
    translated: string[];
    metadata: any[];
  };
}

/**
 * Translation options for cache key generation
 */
interface TranslationOptions {
  [key: string]: string | number | boolean;
}

/**
 * Dictionary manager interface (minimal subset for fingerprint generation)
 */
interface DictionaryManagerLike {
  ready: boolean;
  getActiveDictionaryNames?: () => string[];
  getDictionary?: (name: string) => { version?: string | number; size?: number } | undefined;
}

export class TranslationSegmentCache {
  private maxCacheSize: number;
  private maxCacheAge: number;
  private windowId: string;
  private cacheKeyPrefix: string;
  private metadataKey: string;
  private _operationLock: Promise<void>;
  private readonly LOCK_KEY: string;
  private readonly LOCK_TIMEOUT: number;
  private stats: CacheStatistics;
  private metadata: CacheMetadataStructure;
  private cleanupIntervalId: number | null;
  private approximateSize: number;
  private writesSinceRecalculation: number;
  private readonly RECALCULATION_INTERVAL: number;

  constructor(options: TranslationSegmentCacheOptions = {}) {
    this.maxCacheSize = options.maxCacheSize || 1000; // Maximum cached segments
    this.maxCacheAge = options.maxCacheAge || 7 * 24 * 60 * 60 * 1000; // 7 days in ms

    // MEDIUM-2 FIX: Window-specific cache prefix to prevent multi-tab conflicts
    // Each browser window/tab gets unique cache namespace
    // Why: Multiple windows writing to same localStorage keys causes last-write-wins corruption
    this.windowId = `w${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.cacheKeyPrefix = `translation-cache-${this.windowId}-`;
    this.metadataKey = `translation-cache-metadata-${this.windowId}`;

    // CRITICAL FIX: Add operation-level locking for concurrent write protection
    // Prevents cache metadata corruption from concurrent translations
    // Without this: Translation A and B both read metadata → A writes → B overwrites → A's entry orphaned
    this._operationLock = Promise.resolve();
    this.LOCK_KEY = `${this.cacheKeyPrefix}lock`;
    this.LOCK_TIMEOUT = 5000; // 5 second timeout to prevent deadlock

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
    // HIGH-PRIORITY FIX: Reduced from 20 to 10 writes to prevent quota drift during burst operations
    // During rapid translations (10 writes/sec), 20×100KB = +2MB drift before recalculation
    // Reducing to 10 writes limits drift to +1MB (safer margin)
    this.RECALCULATION_INTERVAL = 10; // Recalculate full size every 10 writes

    // Calculate initial size
    this._recalculateSize();

    // MEMORY LEAK FIX: Clean up orphaned cache entries from previous sessions
    this._cleanupOrphanedEntries();

    // Periodic cleanup (every 5 minutes when active)
    this.setupPeriodicCleanup();
  }

  /**
   * CRITICAL FIX: Acquire operation lock to prevent concurrent write corruption
   * Uses promise chaining to serialize cache operations
   * @returns Release function to call when operation completes
   */
  private async _acquireLock(): Promise<() => void> {
    // Chain this operation after previous operation completes
    const previousOperation = this._operationLock;

    let releaseLock: () => void;
    this._operationLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Wait for previous operation to complete
    await previousOperation;

    return releaseLock!;
  }

  /**
   * CRITICAL FIX: Safe JSON parser to prevent crashes from corrupted localStorage
   * Handles malformed entries from browser crashes or storage corruption
   * @param jsonString - JSON string to parse
   * @param fallback - Fallback value if parsing fails
   * @returns Parsed object or fallback
   */
  private _safeParseJSON<T>(jsonString: string, fallback: T): T {
    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      logger.warn(
        'Failed to parse JSON from localStorage (using fallback):',
        error instanceof Error ? error.message : String(error)
      );
      return fallback;
    }
  }

  /**
   * CODE REVIEW FIX: Safe localStorage write with verification
   * Verifies write succeeded to detect corruption early
   * @param key - Storage key
   * @param value - JSON string to store
   * @throws Error if write verification fails
   */
  private _safeSetItem(key: string, value: string): void {
    try {
      // Write to localStorage
      localStorage.setItem(key, value);

      // CRITICAL FIX: Verify write succeeded by reading back
      const readback = localStorage.getItem(key);
      if (readback !== value) {
        // Write verification failed - remove corrupted entry
        this._removeEntry(key);
        throw new Error('localStorage write verification failed - data mismatch');
      }
    } catch (error) {
      // Re-throw for caller to handle (quota exceeded, verification failed, etc.)
      throw error;
    }
  }

  /**
   * CODE REVIEW FIX (MEDIUM-3): Generate secure cache key with SHA-256
   * Uses collision-resistant hashing to prevent wrong translations being served
   * @param originalText - Original text to translate
   * @param dictionaryFingerprint - Dictionary version fingerprint
   * @param options - Translation options
   * @returns Cache key
   */
  async generateCacheKey(
    originalText: string,
    dictionaryFingerprint: string,
    options: TranslationOptions = {}
  ): Promise<string> {
    const startTime = performance.now();

    // SECURITY FIX: Sanitize options to prevent cache collisions from unexpected types
    const safeOptions = this.sanitizeOptions(options);

    // CODE REVIEW FIX (MEDIUM-3): Use SHA-256 for collision-resistant hashing
    // Web Crypto API provides cryptographically secure hashing
    const hashContent =
      originalText + '|' + dictionaryFingerprint + '|' + JSON.stringify(safeOptions);
    const hash = await this.secureHash(hashContent);

    this.stats.averageLookupTime =
      (this.stats.averageLookupTime + (performance.now() - startTime)) / 2;

    return `${this.cacheKeyPrefix}${hash}`;
  }

  /**
   * CODE REVIEW FIX (MEDIUM-3): Secure hash using SHA-256
   * Provides collision-resistant hashing via Web Crypto API
   * @param content - Content to hash
   * @returns Hex-encoded SHA-256 hash
   */
  async secureHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Sanitize options object to prevent cache collisions from unexpected types
   * Only allows primitive string/number/boolean values
   */
  sanitizeOptions(options: any): TranslationOptions {
    if (!options || typeof options !== 'object') {
      return {};
    }

    const safeOptions: TranslationOptions = {};
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
  simpleHash(str: string): string {
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
  generateDictionaryFingerprint(dictionaryManager: DictionaryManagerLike | null): string {
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
      logger.warn('Failed to generate dictionary fingerprint:', error);
      return 'fingerprint-error';
    }
  }

  /**
   * Get cached translation result
   * Returns null if not found or expired
   * CODE REVIEW FIX (MEDIUM-3): Now async to support SHA-256 hashing
   */
  async get(
    originalText: string,
    dictionaryFingerprint: string,
    options: TranslationOptions = {}
  ): Promise<CacheGetResult | null> {
    const startTime = performance.now();
    this.stats.totalLookups++;

    try {
      const cacheKey = await this.generateCacheKey(originalText, dictionaryFingerprint, options);
      const cachedDataStr = localStorage.getItem(cacheKey);

      if (!cachedDataStr) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      // ERROR HANDLING FIX: Validate JSON.parse to prevent cache corruption crashes
      let cachedData: CachedEntry | null;
      try {
        cachedData = JSON.parse(cachedDataStr) as CachedEntry;
      } catch (parseError) {
        // Corrupted cache entry - remove and treat as miss
        logger.warn(
          `Corrupted cache entry removed: ${cacheKey}`,
          parseError instanceof Error ? parseError.message : String(parseError)
        );
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
        logger.warn(`Invalid cache data structure, removing: ${cacheKey}`);
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
        logger.warn('Failed to update cache hit count:', error);
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
      logger.warn('Cache get error:', error);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * Store translation result in cache
   * Implements LRU eviction when cache is full
   * CRITICAL FIX: Uses operation lock to prevent concurrent write corruption
   */
  async set(
    originalText: string,
    translatedText: string,
    semanticArrays: { original: string[]; translated: string[]; metadata: any[] },
    dictionaryFingerprint: string,
    options: TranslationOptions = {}
  ): Promise<void> {
    const startTime = performance.now();
    const cacheKey = await this.generateCacheKey(originalText, dictionaryFingerprint, options);
    const now = Date.now();

    const cacheEntry: CachedEntry = {
      originalText:
        originalText.length > 100 ? originalText.substring(0, 100) + '...' : originalText, // Store partial for debugging
      translatedText,
      semanticArrays,
      timestamp: now,
      lastAccess: now,
      hitCount: 0,
      dictFingerprint: dictionaryFingerprint,
    };

    // CRITICAL FIX: Acquire lock to serialize cache operations
    // Prevents concurrent translations from corrupting metadata
    const releaseLock = await this._acquireLock();

    try {
      // MEMORY PROFILING FIX: Proactive quota monitoring to prevent quota exceeded errors
      // Check quota before storing to avoid delays from reactive cleanup
      if (this.isApproachingQuota()) {
        this.proactiveCleanup();
      }

      // Check if we need to evict old entries before storing
      this.ensureCacheSpace();

      const serializedEntry = JSON.stringify(cacheEntry);
      this._safeSetItem(cacheKey, serializedEntry); // CODE REVIEW FIX: Use verified write
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
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        logger.warn('Cache storage quota exceeded, cleaning up old entries');
        this.aggressiveCleanup();
        // Retry once after cleanup
        try {
          const serializedEntry = JSON.stringify(cacheEntry);
          this._safeSetItem(cacheKey, serializedEntry); // CODE REVIEW FIX: Use verified write
          this.addToMetadata(cacheKey, now);

          // PERFORMANCE FIX: Track size incrementally on retry too
          this.approximateSize += this._estimateEntrySize(cacheKey, serializedEntry);
          this.writesSinceRecalculation++;

          this.stats.stores++;
        } catch (retryError) {
          logger.warn('Cache store failed after cleanup:', retryError);
        }
      } else {
        logger.warn('Cache set error:', error);
      }
    } finally {
      // CRITICAL: Always release lock, even on error
      releaseLock();
    }
  }

  /**
   * Ensure cache doesn't exceed size limits
   * Implements LRU eviction strategy
   */
  ensureCacheSpace(): void {
    const cacheKeys = this.metadata.keys || [];

    if (cacheKeys.length >= this.maxCacheSize) {
      // Sort by last access time (ascending) to find LRU entries
      const keyStats = cacheKeys.map((key) => {
        // CRITICAL FIX: Use safe parser to handle corrupted localStorage entries
        const data = this._safeParseJSON<Partial<CachedEntry>>(
          localStorage.getItem(key) || '{}',
          {}
        );
        return {
          key,
          lastAccess: data.lastAccess || 0,
          hitCount: data.hitCount || 0,
        };
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
   * @returns True if localStorage usage > 80% of typical 5MB quota
   */
  /**
   * PERFORMANCE FIX: Recalculate actual localStorage size
   * Only called periodically (every 10 writes) to correct drift
   */
  private _recalculateSize(): number {
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
      logger.warn('Failed to recalculate localStorage size:', error);
      return this.approximateSize; // Keep current approximation on error
    }
  }

  /**
   * PERFORMANCE FIX: Estimate entry size for incremental tracking
   */
  private _estimateEntrySize(key: string, value: string): number {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    return (key.length + valueStr.length) * 2; // UTF-16 encoding
  }

  isApproachingQuota(): boolean {
    try {
      // PERFORMANCE FIX: Use incremental size tracking instead of O(n) loop
      // Periodically recalculate to correct drift
      if (this.writesSinceRecalculation >= this.RECALCULATION_INTERVAL) {
        this._recalculateSize();
        this.writesSinceRecalculation = 0;
      }

      const totalMB = this.approximateSize / 1024 / 1024;
      // HIGH-PRIORITY FIX: Use 70% safety margin instead of 80%
      // Protects against quota drift: approximateSize can be +1MB off, so 3.5MB + 1MB = 4.5MB (safe)
      // Old 4MB threshold + 1MB drift = 5MB (quota exceeded!)
      const QUOTA_SAFETY_MARGIN = 0.7; // 70% of 5MB = 3.5MB threshold
      const quotaLimitMB = QUOTA_SAFETY_MARGIN * 5; // 3.5MB

      if (totalMB > quotaLimitMB) {
        // HIGH-PRIORITY FIX: Force accurate recalculation when approaching quota
        // Approximation drift could cause false positives, verify with exact calculation
        this._recalculateSize();
        const exactMB = this.approximateSize / 1024 / 1024;

        if (exactMB > quotaLimitMB) {
          logger.warn(
            `⚠️ localStorage approaching quota: ${exactMB.toFixed(2)}MB / 5MB (${((exactMB / 5) * 100).toFixed(1)}%) [exact after recalculation]`
          );
          return true;
        } else {
          // False alarm from drift, reset counter
          this.writesSinceRecalculation = 0;
          return false;
        }
      }

      return false;
    } catch (error) {
      logger.warn('Failed to check localStorage quota:', error);
      return false; // Don't trigger cleanup on errors
    }
  }

  /**
   * MEMORY LEAK FIX: Clean up orphaned cache entries from previous sessions
   * Removes entries with different window IDs that were created in previous app runs
   */
  private _cleanupOrphanedEntries(): void {
    try {
      let removedCount = 0;
      const currentPrefix = this.cacheKeyPrefix;

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
        logger.log(`🧹 Cleaned up ${removedCount} orphaned cache entries from previous sessions`);
      }
    } catch (error) {
      logger.warn('Failed to clean up orphaned cache entries:', error);
    }
  }

  /**
   * MEMORY PROFILING FIX: Proactive cleanup to prevent quota exceeded errors
   * More aggressive than reactive cleanup - removes entries older than 3 days
   */
  proactiveCleanup(): void {
    const now = Date.now();
    const cacheKeys = this.metadata.keys || [];
    let removedCount = 0;

    // Remove entries older than 3 days (less aggressive than 1-day reactive cleanup)
    cacheKeys.forEach((key) => {
      // CRITICAL FIX: Use safe parser, remove corrupted entries
      const data = this._safeParseJSON<Partial<CachedEntry> | null>(
        localStorage.getItem(key) || '{}',
        null
      );

      // If parsing failed (returns null), remove corrupted entry
      if (data === null) {
        this._removeEntry(key);
        removedCount++;
      } else if (now - (data.timestamp || 0) > 3 * 24 * 60 * 60 * 1000) {
        // 3 days
        this._removeEntry(key);
        removedCount++;
      }
    });

    if (removedCount > 0) {
      logger.log(`🧹 Proactive quota cleanup removed ${removedCount} entries older than 3 days`);
    }
  }

  /**
   * Aggressive cleanup when storage quota exceeded
   */
  aggressiveCleanup(): void {
    const now = Date.now();
    const cacheKeys = this.metadata.keys || [];
    let removedCount = 0;

    // Remove all entries older than 1 day
    cacheKeys.forEach((key) => {
      // CRITICAL FIX: Use safe parser, remove corrupted entries
      const data = this._safeParseJSON<Partial<CachedEntry> | null>(
        localStorage.getItem(key) || '{}',
        null
      );

      // If parsing failed (returns null), remove corrupted entry
      if (data === null) {
        this._removeEntry(key);
        removedCount++;
      } else if (now - (data.timestamp || 0) > 24 * 60 * 60 * 1000) {
        // 1 day
        this._removeEntry(key);
        removedCount++;
      }
    });

    logger.log(`🔥 Aggressive cleanup removed ${removedCount} old cache entries`);
  }

  /**
   * Load or initialize cache metadata
   */
  loadMetadata(): CacheMetadataStructure {
    try {
      const metadataStr = localStorage.getItem(this.metadataKey);
      if (metadataStr) {
        return JSON.parse(metadataStr) as CacheMetadataStructure;
      }
    } catch (error) {
      logger.warn('Failed to load cache metadata:', error);
    }

    return {
      keys: [],
      created: Date.now(),
      lastCleanup: Date.now(),
    };
  }

  /**
   * Save cache metadata
   * CRITICAL: Metadata must be saved to track cache keys, without it cache becomes inconsistent
   */
  saveMetadata(): void {
    try {
      this._safeSetItem(this.metadataKey, JSON.stringify(this.metadata)); // CODE REVIEW FIX: Use verified write
    } catch (error) {
      // Handle localStorage quota exceeded
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        logger.warn('Metadata storage quota exceeded, cleaning up old entries');
        this.aggressiveCleanup();
        // Retry once after cleanup
        try {
          this._safeSetItem(this.metadataKey, JSON.stringify(this.metadata)); // CODE REVIEW FIX: Use verified write
        } catch (retryError) {
          logger.error('CRITICAL: Metadata save failed after cleanup:', retryError);
          // Metadata loss is critical - cache tracking will be inconsistent
          // Consider clearing entire cache to prevent orphaned entries
          if (retryError instanceof Error && retryError.name === 'QuotaExceededError') {
            logger.error('Clearing entire cache due to quota issues');
            this.clear();
          }
        }
      } else {
        logger.warn('Failed to save cache metadata:', error);
      }
    }
  }

  /**
   * Add key to metadata tracking
   */
  addToMetadata(key: string, _timestamp: number): void {
    if (!this.metadata.keys.includes(key)) {
      this.metadata.keys.push(key);
      this.saveMetadata();
    }
  }

  /**
   * Remove key from metadata tracking
   */
  removeFromMetadata(key: string): void {
    this.metadata.keys = this.metadata.keys.filter((k) => k !== key);
    this.saveMetadata();
  }

  /**
   * PERFORMANCE FIX: Remove cache entry and update size tracking
   * Helper to ensure size tracking stays in sync with removals
   */
  private _removeEntry(key: string): void {
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
      logger.warn('Error removing cache entry:', error);
      // Still try to remove from metadata
      this.removeFromMetadata(key);
    }
  }

  /**
   * Update hit rate statistics
   */
  updateHitRate(): void {
    this.stats.hitRate =
      this.stats.totalLookups > 0 ? (this.stats.hits / this.stats.totalLookups) * 100 : 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    stores: number;
    evictions: number;
    totalLookups: number;
    hitRate: number;
    cacheSize: number;
    maxCacheSize: number;
    averageLookupTime: number;
  } {
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
  clear(): void {
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

    logger.log('🧹 Translation cache cleared');
  }

  /**
   * Setup periodic cleanup of expired entries
   */
  setupPeriodicCleanup(): void {
    // MEMORY LEAK FIX: Store interval ID for cleanup
    // Run cleanup every 5 minutes when active
    this.cleanupIntervalId = window.setInterval(
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
  destroy(): void {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Clean up expired entries
   */
  cleanupExpiredEntries(): void {
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
          const parsedData = JSON.parse(data) as CachedEntry;
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

    // MEDIUM-2 FIX: Add periodic quota monitoring during cleanup
    // Proactively monitor quota even when no new writes are happening
    if (this.isApproachingQuota()) {
      logger.log('📊 Periodic quota check: approaching limit, triggering proactive cleanup');
      this.proactiveCleanup();
    }

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
