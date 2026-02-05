/**
 * Centralized Cache Key Generation
 *
 * Provides consistent, collision-resistant cache key generation across all caching systems.
 * Replaces the current mix of:
 * - Simple string keys: `word`
 * - Compound keys: `${dict}:${word}` or `${dicts.join(',')}:${word}`
 * - Hash keys: simpleHash(text + fingerprint + options)
 *
 * Benefits:
 * - Single source of truth for key generation
 * - Collision detection and prevention
 * - Version prefix for cache invalidation
 * - Consistent hashing algorithm
 * - Length limits to prevent localStorage quota issues
 */

/**
 * Cache type enumeration
 */
export type CacheType = 'simple' | 'multi' | 'ctx' | 'pattern' | 'pos' | 'unknown';

/**
 * Context object for cache key generation
 */
export interface CacheContext {
  dictionaries?: string[];
  fingerprint?: string;
  options?: Record<string, any>;
  [key: string]: any;
}

/**
 * Cache key statistics structure
 */
export interface CacheKeyStats {
  total: number;
  byType: Record<string, number>;
  outdated: number;
  invalid: number;
}

/**
 * Cache key version - increment when key format changes
 * This allows automatic cache invalidation on format changes
 */
const CACHE_KEY_VERSION = 'v2';

/**
 * Maximum cache key length (localStorage has limits)
 */
const MAX_KEY_LENGTH = 200;

/**
 * Fast, collision-resistant hash function
 * FNV-1a algorithm - good distribution, fast performance
 *
 * @param str - String to hash
 * @returns Hex hash string (8 characters)
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261; // FNV offset basis (32-bit)

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime: multiply by 16777619
    hash = Math.imul(hash, 16777619);
  }

  // Convert to unsigned 32-bit hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Normalize context object for consistent key generation
 * Sorts keys and handles common variations
 *
 * @param context - Context object (dictionaries, options, etc.)
 * @returns Normalized string representation
 */
function normalizeContext(context: CacheContext | string[] | string | null | undefined): string {
  if (!context || typeof context !== 'object') {
    return String(context || '');
  }

  // Handle arrays specially
  if (Array.isArray(context)) {
    return [...context].sort().join(',');
  }

  // Sort object keys for consistency
  const sorted = Object.keys(context)
    .filter((key) => context[key] !== undefined && context[key] !== null)
    .sort()
    .map((key) => {
      const value = context[key];
      if (Array.isArray(value)) {
        return `${key}=${[...value].sort().join(',')}`;
      }
      return `${key}=${value}`;
    });

  return sorted.join('|');
}

/**
 * Generate cache key for simple dictionary lookups
 * Pattern: v2:dict:hash(word)
 *
 * @param text - Text to cache
 * @param dictionary - Dictionary name
 * @returns Cache key
 *
 * @example
 * ```ts
 * generateSimpleKey('你好', 'characters')
 * // => 'v2:characters:a1b2c3d4'
 * ```
 */
export function generateSimpleKey(text: string, dictionary: string): string {
  const hash = fnv1aHash(text);
  const key = `${CACHE_KEY_VERSION}:${dictionary}:${hash}`;

  return key.length > MAX_KEY_LENGTH
    ? `${CACHE_KEY_VERSION}:${dictionary.substring(0, 20)}:${hash}`
    : key;
}

/**
 * Generate cache key for multi-dictionary lookups
 * Pattern: v2:multi:hash(dicts):hash(word)
 *
 * @param text - Text to cache
 * @param dictionaries - Array of dictionary names
 * @returns Cache key
 *
 * @example
 * ```ts
 * generateMultiKey('你好', ['characters', 'phrases'])
 * // => 'v2:multi:d1e2f3g4:a1b2c3d4'
 * ```
 */
export function generateMultiKey(text: string, dictionaries: string[]): string {
  const dictsNormalized = normalizeContext(dictionaries);
  const dictsHash = fnv1aHash(dictsNormalized);
  const textHash = fnv1aHash(text);

  return `${CACHE_KEY_VERSION}:multi:${dictsHash}:${textHash}`;
}

/**
 * Generate cache key with full context (advanced caching)
 * Pattern: v2:ctx:hash(text + context)
 *
 * Used for complex caching scenarios where options matter
 * (e.g., translation segments with configuration)
 *
 * @param text - Text to cache
 * @param context - Full context (dictionaries, options, fingerprint)
 * @returns Cache key
 *
 * @example
 * ```ts
 * generateContextKey('你好世界', {
 *   dictionaries: ['characters', 'phrases'],
 *   fingerprint: 'abc123',
 *   options: { progressive: true }
 * })
 * // => 'v2:ctx:a1b2c3d4e5f6g7h8'
 * ```
 */
export function generateContextKey(text: string, context: CacheContext = {}): string {
  const contextStr = normalizeContext(context);
  const combined = `${text}|${contextStr}`;
  const hash = fnv1aHash(combined);

  return `${CACHE_KEY_VERSION}:ctx:${hash}`;
}

/**
 * Generate cache key for pattern results
 * Pattern: v2:pattern:hash(pattern):hash(tokens)
 *
 * @param pattern - Pattern string
 * @param tokens - Token string or array
 * @returns Cache key
 *
 * @example
 * ```ts
 * generatePatternKey('在X中', '在那些人中')
 * // => 'v2:pattern:a1b2c3d4:e5f6g7h8'
 * ```
 */
export function generatePatternKey(pattern: string, tokens: string | string[]): string {
  const patternHash = fnv1aHash(pattern);
  const tokenStr = Array.isArray(tokens) ? tokens.join('') : String(tokens);
  const tokensHash = fnv1aHash(tokenStr);

  return `${CACHE_KEY_VERSION}:pattern:${patternHash}:${tokensHash}`;
}

/**
 * Generate cache key for position mappings
 * Pattern: v2:pos:hash(originalText + translatedText)
 *
 * @param originalText - Original Chinese text
 * @param translatedText - Translated Vietnamese text
 * @returns Cache key
 *
 * @example
 * ```ts
 * generatePositionKey('你好', 'Xin chào')
 * // => 'v2:pos:a1b2c3d4e5f6g7h8'
 * ```
 */
export function generatePositionKey(originalText: string, translatedText: string): string {
  const combined = `${originalText}|${translatedText}`;
  const hash = fnv1aHash(combined);

  return `${CACHE_KEY_VERSION}:pos:${hash}`;
}

/**
 * Extract cache type from key
 * Useful for debugging and analytics
 *
 * @param key - Cache key
 * @returns Cache type or 'unknown'
 *
 * @example
 * ```ts
 * getCacheType('v2:multi:abc123:def456')
 * // => 'multi'
 * ```
 */
export function getCacheType(key: string): CacheType {
  const parts = key.split(':');
  if (parts[0] === CACHE_KEY_VERSION && parts.length >= 2) {
    return parts[1] as CacheType;
  }
  return 'unknown';
}

/**
 * Check if cache key is current version
 * Useful for cache migration and cleanup
 *
 * @param key - Cache key to check
 * @returns True if key is current version
 *
 * @example
 * ```ts
 * isCurrentVersion('v2:dict:abc123')  // => true
 * isCurrentVersion('v1:dict:abc123')  // => false
 * ```
 */
export function isCurrentVersion(key: string): boolean {
  return key.startsWith(`${CACHE_KEY_VERSION}:`);
}

/**
 * Validate cache key format
 * Helps catch key generation bugs
 *
 * @param key - Cache key to validate
 * @returns True if key is valid
 */
export function validateCacheKey(key: string | null | undefined): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.length > MAX_KEY_LENGTH) return false;
  if (!key.includes(':')) return false;

  const parts = key.split(':');
  if (parts[0] !== CACHE_KEY_VERSION) return false;
  if (parts.length < 2) return false;

  return true;
}

/**
 * Get cache key statistics
 * Useful for debugging cache performance
 *
 * @param keys - Array of cache keys
 * @returns Statistics object
 *
 * @example
 * ```ts
 * const stats = getCacheKeyStats(Object.keys(localStorage))
 * // => { total: 150, byType: { simple: 80, multi: 40, ctx: 30 }, outdated: 5 }
 * ```
 */
export function getCacheKeyStats(keys: string[]): CacheKeyStats {
  const stats: CacheKeyStats = {
    total: 0,
    byType: {},
    outdated: 0,
    invalid: 0,
  };

  for (const key of keys) {
    if (!validateCacheKey(key)) {
      if (key.startsWith('v1:')) {
        stats.outdated++;
      } else {
        stats.invalid++;
      }
      continue;
    }

    stats.total++;
    const type = getCacheType(key);
    stats.byType[type] = (stats.byType[type] || 0) + 1;
  }

  return stats;
}

/**
 * Clean up outdated cache keys
 * Call this after version upgrades
 *
 * @param storage - Storage object (localStorage or sessionStorage)
 * @returns Number of keys removed
 *
 * @example
 * ```ts
 * const removed = cleanupOutdatedKeys(localStorage)
 * console.log(`Removed ${removed} outdated cache entries`)
 * ```
 */
export function cleanupOutdatedKeys(storage: Storage): number {
  let removed = 0;
  const keysToRemove: string[] = [];

  // Iterate through all keys
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && !isCurrentVersion(key) && key.startsWith('v')) {
      keysToRemove.push(key);
    }
  }

  // Remove outdated keys
  for (const key of keysToRemove) {
    storage.removeItem(key);
    removed++;
  }

  return removed;
}

// Export cache key version for external use
export { CACHE_KEY_VERSION };

// Development mode: expose on window for debugging
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).cacheKeyUtils = {
    generateSimpleKey,
    generateMultiKey,
    generateContextKey,
    generatePatternKey,
    generatePositionKey,
    getCacheType,
    isCurrentVersion,
    validateCacheKey,
    getCacheKeyStats,
    cleanupOutdatedKeys,
  };
}
