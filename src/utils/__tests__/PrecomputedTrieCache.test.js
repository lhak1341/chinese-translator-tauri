import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateDictionaryChecksum,
  serializeTrie,
  deserializeTrie,
  PrecomputedTrieStats,
} from '../caching/PrecomputedTrieCache.js';

describe('PrecomputedTrieCache', () => {
  describe('calculateDictionaryChecksum', () => {
    it('should generate consistent checksums for same dictionary', () => {
      const dict1 = { hello: 'xin chào', world: 'thế giới' };
      const dict2 = { hello: 'xin chào', world: 'thế giới' };

      const checksum1 = calculateDictionaryChecksum(dict1);
      const checksum2 = calculateDictionaryChecksum(dict2);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should generate different checksums for different dictionaries', () => {
      const dict1 = { hello: 'xin chào' };
      const dict2 = { goodbye: 'tạm biệt' };

      const checksum1 = calculateDictionaryChecksum(dict1);
      const checksum2 = calculateDictionaryChecksum(dict2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should detect dictionary changes', () => {
      const dict1 = { hello: 'xin chào' };
      const dict2 = { hello: 'chào' }; // Changed translation

      const checksum1 = calculateDictionaryChecksum(dict1);
      const checksum2 = calculateDictionaryChecksum(dict2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('serializeTrie and deserializeTrie', () => {
    class MockTrieNode {
      constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.translation = null;
        this.metadata = null;
      }
    }

    it('should serialize and deserialize simple trie', () => {
      // Create a simple trie
      const root = new MockTrieNode();
      const childA = new MockTrieNode();
      childA.isEndOfWord = true;
      childA.translation = 'translation A';
      root.children.set('a', childA);

      // Serialize
      const serialized = serializeTrie(root, 1);

      expect(serialized).toHaveProperty('root');
      expect(serialized).toHaveProperty('size');
      expect(serialized.size).toBe(1);

      // Deserialize
      const deserialized = deserializeTrie(serialized, MockTrieNode);

      expect(deserialized.children.has('a')).toBe(true);
      const deserializedChildA = deserialized.children.get('a');
      expect(deserializedChildA.isEndOfWord).toBe(true);
      expect(deserializedChildA.translation).toBe('translation A');
    });

    it('should preserve metadata', () => {
      const root = new MockTrieNode();
      const child = new MockTrieNode();
      child.isEndOfWord = true;
      child.translation = 'test';
      child.metadata = { priority: 1, dictionary: 'test' };
      root.children.set('x', child);

      const serialized = serializeTrie(root, 1);
      const deserialized = deserializeTrie(serialized, MockTrieNode);

      const deserializedChild = deserialized.children.get('x');
      expect(deserializedChild.metadata).toEqual({ priority: 1, dictionary: 'test' });
    });

    it('should handle nested trie structure', () => {
      const root = new MockTrieNode();
      const childH = new MockTrieNode();
      const childHi = new MockTrieNode();
      childHi.isEndOfWord = true;
      childHi.translation = 'xin chào';

      childH.children.set('i', childHi);
      root.children.set('h', childH);

      const serialized = serializeTrie(root, 1);
      const deserialized = deserializeTrie(serialized, MockTrieNode);

      expect(deserialized.children.has('h')).toBe(true);
      const h = deserialized.children.get('h');
      expect(h.children.has('i')).toBe(true);
      const hi = h.children.get('i');
      expect(hi.isEndOfWord).toBe(true);
      expect(hi.translation).toBe('xin chào');
    });

    it('should handle empty trie', () => {
      const root = new MockTrieNode();
      const serialized = serializeTrie(root, 0);
      const deserialized = deserializeTrie(serialized, MockTrieNode);

      expect(deserialized.children.size).toBe(0);
      expect(deserialized.isEndOfWord).toBe(false);
    });
  });

  describe('PrecomputedTrieStats', () => {
    let stats;

    beforeEach(() => {
      stats = new PrecomputedTrieStats();
    });

    it('should track cache hits', () => {
      stats.recordCacheHit(10);
      stats.recordCacheHit(20);

      const summary = stats.getSummary();
      expect(summary.cacheHits).toBe(2);
      expect(summary.cacheMisses).toBe(0);
      expect(summary.avgLoadTime).toBe('15.00ms');
    });

    it('should track cache misses', () => {
      stats.recordCacheMiss(100);
      stats.recordCacheMiss(200);

      const summary = stats.getSummary();
      expect(summary.cacheHits).toBe(0);
      expect(summary.cacheMisses).toBe(2);
      expect(summary.avgBuildTime).toBe('150.00ms');
    });

    it('should calculate hit rate', () => {
      stats.recordCacheHit(10);
      stats.recordCacheHit(10);
      stats.recordCacheMiss(100);

      const summary = stats.getSummary();
      expect(summary.hitRate).toBe('66.7%');
    });

    it('should calculate speedup ratio', () => {
      stats.recordCacheHit(10); // Fast load
      stats.recordCacheMiss(100); // Slow build

      const summary = stats.getSummary();
      expect(summary.speedup).toBe('10.0x');
    });

    it('should track saves', () => {
      stats.recordCacheSave();
      stats.recordCacheSave();

      const summary = stats.getSummary();
      expect(summary.cacheSaves).toBe(2);
    });
  });
});
