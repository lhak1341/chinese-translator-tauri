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

// ============================================================================
// Translation Segment Cache (localStorage-based persistent caching)
// ============================================================================

/**
 * Translation segment cache configuration
 * Used by TranslationSegmentCache constructor
 */
export interface TranslationSegmentCacheOptions {
  /** Maximum cache entries before eviction (default: 1000) */
  maxCacheSize?: number;

  /** Maximum age in milliseconds (default: 7 days) */
  maxCacheAge?: number;

  /** localStorage key prefix (default: 'translation_segment_') */
  cacheKeyPrefix?: string;

  /** Enable cache (default: true) */
  enabled?: boolean;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Cache metadata for validation
 * Stored with each cached segment
 */
export interface CacheMetadata {
  /** Timestamp when cached */
  timestamp: number;

  /** Dictionary fingerprint for invalidation */
  dictionaryFingerprint: string;

  /** Translation options used */
  options: {
    /** Pattern processing enabled */
    enablePatternProcessing?: boolean;

    /** Hierarchical pattern processing */
    enableTwoPhasePatterns?: boolean;

    /** Number processing enabled */
    enableNumberProcessing?: boolean;

    /** Selected proper noun dictionary */
    selectedProperNounDictionary?: string;
  };

  /** Cache version for compatibility */
  cacheVersion: number;

  /** Access count */
  accessCount: number;

  /** Last access timestamp */
  lastAccess: number;
}

/**
 * Cached translation segment entry
 * Full segment translation with metadata
 */
export interface SegmentCacheEntry {
  /** Original Chinese text */
  originalText: string;

  /** Translated Vietnamese text */
  translatedText: string;

  /** Semantic arrays for clickable highlighting */
  semanticArrays: {
    original: string[];
    translated: string[];
    metadata: any[];
  };

  /** Cache metadata */
  metadata: CacheMetadata;

  /** Entry size in bytes */
  sizeBytes?: number;
}

/**
 * Translation segment cache interface
 * Persistent localStorage caching for translated segments
 */
export interface TranslationSegmentCache {
  /** Maximum cache size */
  maxCacheSize: number;

  /** Maximum cache age in milliseconds */
  maxCacheAge: number;

  /** localStorage key prefix */
  cacheKeyPrefix: string;

  /** Cache statistics */
  stats: {
    hits: number;
    misses: number;
    stores: number;
    evictions: number;
    hitRate: number;
  };

  /**
   * Generate cache key from text and options
   * @param originalText - Text to cache
   * @param dictionaryFingerprint - Dictionary state fingerprint
   * @param options - Translation options
   * @returns Hash-based cache key
   */
  generateCacheKey(
    originalText: string,
    dictionaryFingerprint: string,
    options?: any
  ): string;

  /**
   * Get cached translation segment
   * @param originalText - Original text
   * @param dictionaryFingerprint - Dictionary fingerprint
   * @param options - Translation options
   * @returns Cached entry or null
   */
  get(
    originalText: string,
    dictionaryFingerprint: string,
    options?: any
  ): SegmentCacheEntry | null;

  /**
   * Store translation segment in cache
   * @param originalText - Original text
   * @param translatedText - Translated text
   * @param semanticArrays - Semantic arrays
   * @param dictionaryFingerprint - Dictionary fingerprint
   * @param options - Translation options
   */
  set(
    originalText: string,
    translatedText: string,
    semanticArrays: any,
    dictionaryFingerprint: string,
    options?: any
  ): void;

  /**
   * Clear entire cache
   */
  clear(): void;

  /**
   * Remove expired entries
   * @returns Number of entries removed
   */
  cleanupExpired(): number;

  /**
   * Ensure cache doesn't exceed size limit
   * Implements LRU eviction strategy
   */
  ensureCacheSpace(): void;

  /**
   * Get cache statistics
   * @returns Stats object
   */
  getStats(): {
    hits: number;
    misses: number;
    stores: number;
    evictions: number;
    hitRate: number;
    cacheSize: number;
    totalSizeBytes: number;
  };

  /**
   * Simple hash function for cache keys
   * @param str - String to hash
   * @returns Hash string
   */
  simpleHash(str: string): string;
}

// ============================================================================
// Content-Aware Position Cache (similarity-based position mapping)
// ============================================================================

/**
 * Content-aware position cache configuration
 * Used by ContentAwarePositionCache constructor
 */
export interface ContentAwarePositionCacheOptions {
  /** Maximum exact match cache entries (default: 500) */
  maxCacheSize?: number;

  /** Similarity threshold 0-1 (default: 0.85) */
  similarityThreshold?: number;

  /** Enable similarity matching (default: false in v3) */
  enableSimilarityMatching?: boolean;

  /** Cache version for compatibility */
  cacheVersion?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Content signature for similarity detection
 * Character frequency and structural patterns
 */
export interface ContentSignature {
  /** Top 20 most frequent characters (pipe-separated) */
  signature: string;

  /** Text length */
  length: number;

  /** Word count (space-separated) */
  wordCount: number;

  /** Character frequency map */
  charFrequency?: Record<string, number>;

  /** Sample text hash (first 1000 chars) */
  sampleHash?: string;
}

/**
 * Position mapping cache entry
 * Stores position mappings for clickable highlighting
 */
export interface PositionMappingCacheEntry {
  /** Original text content hash */
  contentHash: string;

  /** Position mappings array */
  positionMappings: Array<{
    originalIndex: number;
    translatedIndex: number;
    unitIndex: number;
  }>;

  /** Content signature for similarity matching */
  contentSignature: ContentSignature;

  /** Timestamp when cached */
  timestamp: number;

  /** Access count */
  accessCount: number;

  /** Last access timestamp */
  lastAccess: number;
}

/**
 * Similarity match result
 * Result from similarity-based cache lookup
 */
export interface SimilarityMatch {
  /** Similarity score 0-1 */
  similarity: number;

  /** Matched cache entry */
  entry: PositionMappingCacheEntry;

  /** Whether match exceeds threshold */
  isMatch: boolean;

  /** Match reason (exact, similar, no_match) */
  matchType: 'exact' | 'similar' | 'no_match';
}

/**
 * Content-aware position cache statistics
 * Performance metrics for position mapping cache
 */
export interface ContentAwarePositionCacheStats {
  /** Exact match cache hits */
  exactHits: number;

  /** Similarity match cache hits */
  similarityHits: number;

  /** Total cache misses */
  misses: number;

  /** Total queries */
  totalQueries: number;

  /** Overall hit rate */
  hitRate: number;

  /** Exact hit rate */
  exactHitRate: number;

  /** Similarity hit rate */
  similarityHitRate: number;

  /** Cache size (exact matches) */
  cacheSize: number;

  /** Similarity cache size */
  similarityCacheSize: number;

  /** Average lookup time (ms) */
  avgLookupTime: number;

  /** Total time saved (ms) */
  totalTimeSaved: number;
}

/**
 * Content-aware position cache interface
 * Cache position mappings based on text content hash
 */
export interface ContentAwarePositionCache {
  /** Cache version for compatibility */
  cacheVersion: number;

  /** Maximum cache size */
  maxCacheSize: number;

  /** Similarity threshold for matching */
  similarityThreshold: number;

  /** Whether similarity matching is enabled */
  enableSimilarityMatching: boolean;

  /** Exact match cache (LRU) */
  exactCache: LRUCache<string, PositionMappingCacheEntry>;

  /** Similarity cache (content signature based) */
  similarityCache: Map<string, PositionMappingCacheEntry>;

  /** Cache statistics */
  stats: ContentAwarePositionCacheStats;

  /**
   * Generate content hash from text
   * @param text - Original text
   * @returns Content hash string
   */
  generateContentHash(text: string): string;

  /**
   * Generate content signature for similarity detection
   * @param text - Text to analyze
   * @returns Content signature
   */
  generateContentSignature(text: string): ContentSignature;

  /**
   * Calculate similarity between two content signatures
   * @param sig1 - First signature
   * @param sig2 - Second signature
   * @returns Similarity score 0-1
   */
  calculateSimilarity(sig1: ContentSignature, sig2: ContentSignature): number;

  /**
   * Get cached position mappings
   * @param originalText - Original text
   * @param translatedText - Translated text
   * @returns Cached position mappings or null
   */
  get(
    originalText: string,
    translatedText: string
  ): Array<{ originalIndex: number; translatedIndex: number; unitIndex: number }> | null;

  /**
   * Store position mappings in cache
   * @param originalText - Original text
   * @param translatedText - Translated text
   * @param positionMappings - Position mappings array
   */
  set(
    originalText: string,
    translatedText: string,
    positionMappings: Array<{
      originalIndex: number;
      translatedIndex: number;
      unitIndex: number;
    }>
  ): void;

  /**
   * Clear all caches
   */
  clear(): void;

  /**
   * Get cache statistics
   * @returns Statistics object
   */
  getStats(): ContentAwarePositionCacheStats;

  /**
   * Reset statistics counters
   */
  resetStats(): void;

  /**
   * Find similar cached content
   * @param signature - Content signature to match
   * @returns Similarity match result
   */
  findSimilar(signature: ContentSignature): SimilarityMatch | null;
}
