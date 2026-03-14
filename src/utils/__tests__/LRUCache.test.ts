/**
 * Tests for LRU Cache
 *
 * Tests the Least Recently Used cache implementation including:
 * - Basic get/set operations
 * - LRU eviction policy
 * - Statistics tracking
 * - Cache cleanup
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { LRUCache } from '../caching/LRUCache';

describe('LRUCache', () => {
  describe('basic operations', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
      cache = new LRUCache<string, string>(3);
    });

    test('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    test('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should update existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    test('should check key existence with has()', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    test('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.delete('key1')).toBe(false); // Second delete returns false
    });

    test('should track cache size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('LRU eviction policy', () => {
    let cache: LRUCache<string, number>;

    beforeEach(() => {
      cache = new LRUCache<string, number>(3); // Max size 3
    });

    test('should evict least recently used item when full', () => {
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);
      cache.set('key4', 4); // Should evict key1

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    test('should update LRU order on get()', () => {
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);

      // Access key1, making it most recently used
      cache.get('key1');

      // Add key4, should evict key2 (now least recently used)
      cache.set('key4', 4);

      expect(cache.has('key1')).toBe(true); // Was accessed recently
      expect(cache.has('key2')).toBe(false); // Evicted
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    test('should update LRU order on set() of existing key', () => {
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);

      // Update key1, making it most recently used
      cache.set('key1', 10);

      // Add key4, should evict key2 (now least recently used)
      cache.set('key4', 4);

      expect(cache.has('key1')).toBe(true);
      expect(cache.get('key1')).toBe(10); // Value updated
      expect(cache.has('key2')).toBe(false); // Evicted
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    test('should maintain correct eviction order with multiple accesses', () => {
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);

      // Access pattern: key3, key1, key2 (LRU order: key3, key1, key2)
      cache.get('key3');
      cache.get('key1');
      cache.get('key2');

      // Add key4, should evict key3 (least recently accessed)
      cache.set('key4', 4);

      expect(cache.has('key3')).toBe(false);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });
  });

  describe('statistics tracking', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
      cache = new LRUCache<string, string>(5);
    });

    test('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key1'); // Hit
      cache.get('key3'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.totalQueries).toBe(4);
    });

    test('should calculate hit rate correctly', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Hit
      cache.get('key3'); // Miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('75.0%'); // 3 hits / 4 queries
    });

    test('should track evictions', () => {
      const smallCache = new LRUCache<string, number>(2);

      smallCache.set('key1', 1);
      smallCache.set('key2', 2);
      smallCache.set('key3', 3); // Evicts key1

      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(1);
    });

    test('should show 0% hit rate with no queries', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe('0%');
    });

    test('should include size and maxSize in stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
    });

    test('should calculate memory efficiency', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.memoryEfficiency).toBe('2/5 (40.0%)');
    });

    test('should reset stats without clearing cache', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key2');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalQueries).toBe(0);
      expect(cache.has('key1')).toBe(true); // Cache not cleared
    });
  });

  describe('cache clearing', () => {
    let cache: LRUCache<string, string>;

    beforeEach(() => {
      cache = new LRUCache<string, string>(5);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.get('key1'); // Generate some stats
    });

    test('should clear all entries and stats', () => {
      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.totalQueries).toBe(0);
    });

    test('should clear old entries when >75% full', () => {
      const cache = new LRUCache<string, number>(10);

      // Fill to 80% (8 items)
      for (let i = 0; i < 8; i++) {
        cache.set(`key${i}`, i);
      }

      cache.clearOldEntries();

      // Should reduce to 50% (5 items)
      expect(cache.size()).toBe(5);

      // Oldest items (key0-key2) should be removed
      expect(cache.has('key0')).toBe(false);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);

      // Newest items (key5-key7) should remain
      expect(cache.has('key5')).toBe(true);
      expect(cache.has('key6')).toBe(true);
      expect(cache.has('key7')).toBe(true);
    });

    test('should not clear entries when <75% full', () => {
      const cache = new LRUCache<string, number>(10);

      // Fill to 50% (5 items)
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, i);
      }

      cache.clearOldEntries();

      // Should not change
      expect(cache.size()).toBe(5);
    });

    test('should track evictions from clearOldEntries', () => {
      const cache = new LRUCache<string, number>(10);

      for (let i = 0; i < 8; i++) {
        cache.set(`key${i}`, i);
      }

      cache.clearOldEntries();

      const stats = cache.getStats();
      expect(stats.evictions).toBe(3); // Removed 3 items (8 -> 5)
    });
  });

  describe('generic type support', () => {
    test('should work with string keys and number values', () => {
      const cache = new LRUCache<string, number>(5);
      cache.set('age', 25);
      expect(cache.get('age')).toBe(25);
    });

    test('should work with number keys and string values', () => {
      const cache = new LRUCache<number, string>(5);
      cache.set(1, 'one');
      cache.set(2, 'two');
      expect(cache.get(1)).toBe('one');
      expect(cache.get(2)).toBe('two');
    });

    test('should work with object keys and values', () => {
      interface User {
        name: string;
        age: number;
      }

      const cache = new LRUCache<string, User>(5);
      cache.set('user1', { name: 'Alice', age: 30 });

      const user = cache.get('user1');
      expect(user?.name).toBe('Alice');
      expect(user?.age).toBe(30);
    });

    test('should work with complex keys', () => {
      const cache = new LRUCache<{ id: number }, string>(5);
      const key1 = { id: 1 };
      const key2 = { id: 2 };

      cache.set(key1, 'value1');
      cache.set(key2, 'value2');

      expect(cache.get(key1)).toBe('value1');
      expect(cache.get(key2)).toBe('value2');
    });
  });

  describe('debugging methods', () => {
    let cache: LRUCache<string, number>;

    beforeEach(() => {
      cache = new LRUCache<string, number>(5);
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);
    });

    test('should return all keys', () => {
      const keys = cache.keys();
      expect(keys).toEqual(['key1', 'key2', 'key3']);
    });

    test('should return all values', () => {
      const values = cache.values();
      expect(values).toEqual([1, 2, 3]);
    });

    test('should return all entries', () => {
      const entries = cache.entries();
      expect(entries).toEqual([
        ['key1', 1],
        ['key2', 2],
        ['key3', 3],
      ]);
    });

    test('should return keys in LRU order (oldest first)', () => {
      cache.get('key1'); // Move key1 to end

      const keys = cache.keys();
      expect(keys).toEqual(['key2', 'key3', 'key1']); // key1 now most recent
    });
  });

  describe('edge cases', () => {
    test('should handle maxSize of 1', () => {
      const cache = new LRUCache<string, number>(1);
      cache.set('key1', 1);
      cache.set('key2', 2); // Should evict key1

      expect(cache.size()).toBe(1);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
    });

    test('should handle maxSize of 0 (always evict)', () => {
      const cache = new LRUCache<string, number>(0);
      cache.set('key1', 1);

      // With maxSize 0, cache is always full, immediate eviction
      expect(cache.size()).toBe(1); // Still adds the item
    });

    test('should handle very large maxSize', () => {
      const cache = new LRUCache<string, number>(10000);

      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, i);
      }

      expect(cache.size()).toBe(100);
    });

    test('should handle undefined and null values', () => {
      const cache = new LRUCache<string, any>(5);

      cache.set('key1', undefined);
      cache.set('key2', null);

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeNull();
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);
    });

    test('should handle empty string keys', () => {
      const cache = new LRUCache<string, string>(5);
      cache.set('', 'empty');
      expect(cache.get('')).toBe('empty');
    });

    test('should handle rapid set/get cycles', () => {
      const cache = new LRUCache<string, number>(10);

      for (let i = 0; i < 100; i++) {
        cache.set(`key${i % 10}`, i);
        cache.get(`key${i % 10}`);
      }

      expect(cache.size()).toBe(10);
    });
  });

  describe('default parameters', () => {
    test('should use default maxSize of 1000', () => {
      const cache = new LRUCache();
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(1000);
    });
  });
});
