/**
 * LRU (Least Recently Used) Cache Implementation
 * Provides memory-efficient caching with automatic cleanup
 *
 * Generic type parameters:
 * @template K - Key type (defaults to string)
 * @template V - Value type (defaults to any)
 */

import type { CacheStats } from '../types/CacheTypes';

/**
 * Internal cache statistics structure
 */
interface LRUCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalQueries: number;
}

/**
 * Extended cache statistics with computed metrics
 */
interface ExtendedCacheStats extends LRUCacheStats {
  hitRate: string;
  size: number;
  maxSize: number;
  memoryEfficiency: string;
}

/**
 * LRU Cache class with generic key/value types
 * Implements Least Recently Used eviction policy
 */
export class LRUCache<K = string, V = any> {
  private maxSize: number;
  private cache: Map<K, V>;
  private stats: LRUCacheStats;

  /**
   * Create a new LRU cache
   * @param maxSize - Maximum number of entries (default: 1000)
   */
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map<K, V>();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalQueries: 0
    };
  }

  /**
   * Get a value from the cache
   * @param key - Cache key
   * @returns Cached value or undefined if not found
   */
  get(key: K): V | undefined {
    this.stats.totalQueries++;

    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);
      this.stats.hits++;
      return value;
    }

    this.stats.misses++;
    return undefined;
  }

  /**
   * Set a value in the cache
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: K, value: V): void {
    // If key exists, update and move to end
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.cache.set(key, value);
      return;
    }

    // If cache is full, remove least recently used (first item)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as K;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }

    // Add new item to end (most recently used)
    this.cache.set(key, value);
  }

  /**
   * Check if key exists in cache
   * @param key - Cache key
   * @returns True if key exists
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.totalQueries = 0;
  }

  /**
   * Clear old cache entries if cache is getting large
   * Removes oldest entries if cache is >75% full
   */
  clearOldEntries(): void {
    const threshold = Math.floor(this.maxSize * 0.75);
    if (this.cache.size > threshold) {
      const entriesToRemove = this.cache.size - Math.floor(this.maxSize * 0.5);
      let removed = 0;

      // LRU order: oldest entries are at the beginning of Map iteration
      for (const [key] of this.cache) {
        if (removed >= entriesToRemove) break;
        this.cache.delete(key);
        this.stats.evictions++;
        removed++;
      }
    }
  }

  /**
   * Get cache statistics
   * @returns Cache performance stats with computed metrics
   */
  getStats(): ExtendedCacheStats {
    const hitRate = this.stats.totalQueries > 0
      ? (this.stats.hits / this.stats.totalQueries * 100).toFixed(1)
      : '0';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryEfficiency: `${this.cache.size}/${this.maxSize} (${(this.cache.size/this.maxSize*100).toFixed(1)}%)`
    };
  }

  /**
   * Get cache size
   * @returns Current number of entries in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Remove specific key from cache
   * @param key - Cache key to remove
   * @returns True if key was removed, false if not found
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Get all cache keys (for debugging)
   * @returns Array of cache keys
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all cache values (for debugging)
   * @returns Array of cache values
   */
  values(): V[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get all cache entries (for debugging)
   * @returns Array of [key, value] tuples
   */
  entries(): [K, V][] {
    return Array.from(this.cache.entries());
  }

  /**
   * Reset statistics counters without clearing cache
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.totalQueries = 0;
  }
}
