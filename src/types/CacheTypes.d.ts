/**
 * TypeScript type definitions for caching system
 *
 * Defines interfaces for LRU cache, translation cache, and cache statistics
 * used throughout the translation system for performance optimization.
 */

/**
 * Cache entry with timestamp and access tracking
 * Generic structure for cached values
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;

  /** Timestamp when entry was created */
  timestamp: number;

  /** Number of cache hits for this entry */
  hits: number;

  /** Last access timestamp */
  lastAccess?: number;

  /** Entry size in bytes (for memory tracking) */
  sizeBytes?: number;

  /** Time-to-live in milliseconds */
  ttl?: number;
}

/**
 * Cache statistics for monitoring performance
 * Tracks hit rate, evictions, and memory usage
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number;

  /** Total cache misses */
  misses: number;

  /** Total cache evictions (LRU removals) */
  evictions: number;

  /** Total queries (hits + misses) */
  totalQueries: number;

  /** Current cache size (number of entries) */
  currentSize?: number;

  /** Maximum cache size */
  maxSize?: number;

  /** Hit rate (hits / totalQueries) */
  hitRate?: number;

  /** Average lookup time in milliseconds */
  avgLookupTime?: number;
}

/**
 * LRU Cache interface
 * Least Recently Used cache with automatic eviction
 */
export interface LRUCache<K = string, V = any> {
  /** Maximum number of entries before eviction */
  maxSize: number;

  /** Internal cache storage */
  cache: Map<K, V>;

  /** Cache statistics */
  stats: CacheStats;

  /**
   * Get value from cache
   * @param key - Cache key
   * @returns Cached value or undefined
   */
  get(key: K): V | undefined;

  /**
   * Set value in cache
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: K, value: V): void;

  /**
   * Check if key exists in cache
   * @param key - Cache key
   * @returns True if key exists
   */
  has(key: K): boolean;

  /**
   * Remove entry from cache
   * @param key - Cache key
   * @returns True if entry was removed
   */
  delete(key: K): boolean;

  /**
   * Clear all cache entries
   */
  clear(): void;

  /**
   * Get current cache size
   * @returns Number of entries
   */
  size(): number;

  /**
   * Get cache statistics
   * @returns Cache stats object
   */
  getStats(): CacheStats;

  /**
   * Reset statistics counters
   */
  resetStats(): void;
}

/**
 * Translation cache configuration options
 * Used by TranslationCache constructor
 */
export interface TranslationCacheOptions {
  /** Maximum entries for character cache (default: 500) */
  characterCacheSize?: number;

  /** Maximum entries for phrase cache (default: 1000) */
  phraseCacheSize?: number;

  /** Maximum entries for pattern cache (default: 200) */
  patternCacheSize?: number;

  /** Maximum entries for lookup cache (default: 800) */
  lookupCacheSize?: number;

  /** Enable caching (default: true) */
  enabled?: boolean;

  /** Enable performance tracking */
  enableProfiling?: boolean;
}

/**
 * Translation cache interface
 * Multi-level caching for different translation types
 */
export interface TranslationCache {
  /** Character translation cache */
  characterCache: LRUCache<string, any>;

  /** Phrase translation cache */
  phraseCache: LRUCache<string, any>;

  /** Pattern translation cache */
  patternCache: LRUCache<string, any>;

  /** Multi-dictionary lookup cache */
  lookupCache: LRUCache<string, any>;

  /** Whether caching is enabled */
  isEnabled: boolean;

  /**
   * Generate cache key for dictionary lookup
   * @param text - Text to translate
   * @param dictionaryName - Dictionary name
   * @returns Cache key (format: "dictionaryName:text")
   */
  generateLookupKey(text: string, dictionaryName: string): string;

  /**
   * Generate cache key for multi-dictionary lookup
   * @param text - Text to translate
   * @param dictionaryNames - Array of dictionary names
   * @returns Cache key (format: "dict1,dict2:text")
   */
  generateMultiLookupKey(text: string, dictionaryNames: string[]): string;

  /**
   * Get cached character translation
   * @param character - Character to translate
   * @param dictionaryName - Dictionary name
   * @returns Cached result or undefined
   */
  getCharacter(character: string, dictionaryName: string): any;

  /**
   * Cache character translation result
   * @param character - Character translated
   * @param dictionaryName - Dictionary name
   * @param result - Translation result
   */
  setCharacter(character: string, dictionaryName: string, result: any): void;

  /**
   * Get cached phrase translation
   * @param phrase - Phrase to translate
   * @param dictionaryName - Dictionary name
   * @returns Cached result or undefined
   */
  getPhrase(phrase: string, dictionaryName: string): any;

  /**
   * Cache phrase translation result
   * @param phrase - Phrase translated
   * @param dictionaryName - Dictionary name
   * @param result - Translation result
   */
  setPhrase(phrase: string, dictionaryName: string, result: any): void;

  /**
   * Get cached pattern translation
   * @param pattern - Pattern to match
   * @param context - Pattern context
   * @returns Cached result or undefined
   */
  getPattern(pattern: string, context: string): any;

  /**
   * Cache pattern translation result
   * @param pattern - Pattern matched
   * @param context - Pattern context
   * @param result - Translation result
   */
  setPattern(pattern: string, context: string, result: any): void;

  /**
   * Clear all caches
   */
  clearAll(): void;

  /**
   * Get combined cache statistics
   * @returns Aggregated stats from all caches
   */
  getStats(): {
    character: CacheStats;
    phrase: CacheStats;
    pattern: CacheStats;
    lookup: CacheStats;
    total: {
      hits: number;
      misses: number;
      hitRate: number;
      totalEntries: number;
    };
  };
}

/**
 * Semantic translation cache entry
 * Caches translation results with phase priority metadata
 */
export interface SemanticCacheEntry {
  /** Cached translation result */
  result: any;

  /** Translation phase priority (1-5) */
  phasePriority: number;

  /** Source of translation (pattern, properNoun, phrase, character) */
  source: string;

  /** Timestamp when cached */
  timestamp: number;

  /** Number of times this entry was used */
  hitCount?: number;
}

/**
 * Position mapping cache entry
 * Caches position mappings for clickable highlighting
 */
export interface PositionCacheEntry {
  /** Original text position */
  originalPosition: number;

  /** Translated text position */
  translatedPosition: number;

  /** Semantic unit index */
  unitIndex: number;

  /** Cache key for validation */
  cacheKey: string;

  /** Timestamp */
  timestamp: number;
}

/**
 * Cache key generator options
 * Configuration for generating cache keys
 */
export interface CacheKeyOptions {
  /** Include version in key for cache invalidation */
  version?: string;

  /** Hash algorithm (default: 'fnv1a') */
  algorithm?: 'fnv1a' | 'simple' | 'compound';

  /** Maximum key length */
  maxLength?: number;

  /** Include metadata in key */
  includeMetadata?: boolean;
}

/**
 * Cache key generator interface
 * Standardized cache key generation across the system
 */
export interface CacheKeyGenerator {
  /**
   * Generate cache key from components
   * @param components - Key components to hash
   * @param options - Key generation options
   * @returns Hash-based cache key
   */
  generate(components: string[], options?: CacheKeyOptions): string;

  /**
   * Generate FNV-1a hash
   * @param str - String to hash
   * @returns 32-bit hash
   */
  fnv1a(str: string): number;

  /**
   * Generate versioned cache key
   * @param components - Key components
   * @param version - Cache version
   * @returns Versioned key
   */
  versioned(components: string[], version: string): string;
}

// ============================================================================
// Pre-warming Configuration and Results
// ============================================================================

/**
 * Cache pre-warming options
 * Configuration for pre-warming translation caches
 */
export interface PreWarmOptions {
  /** Include common Chinese characters (的一是在不) */
  includeCommonCharacters?: boolean;

  /** Include common Chinese phrases */
  includeCommonPhrases?: boolean;

  /** Include novel-specific vocabulary */
  includeNovelVocabulary?: boolean;

  /** Proper noun dictionary name for novel-specific terms */
  properNounDictionary?: string;

  /** Maximum entries to pre-warm */
  maxEntries?: number;

  /** Enable progress logging */
  verbose?: boolean;

  /** Delay between lookups (ms) to avoid blocking */
  delayBetweenLookups?: number;
}

/**
 * Pre-warming result
 * Statistics from cache pre-warming operation
 */
export interface PreWarmResult {
  /** Total entries attempted */
  totalEntries: number;

  /** Successfully cached entries */
  cachedEntries: number;

  /** Failed lookups */
  failedLookups: number;

  /** Time taken in milliseconds */
  durationMs: number;

  /** Cache hit rate before pre-warming */
  hitRateBefore: number;

  /** Cache hit rate after pre-warming */
  hitRateAfter: number;

  /** Cache sizes by type */
  cacheSizes: {
    characters: number;
    phrases: number;
    patterns: number;
    lookups: number;
  };
}
