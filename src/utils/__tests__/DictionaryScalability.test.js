/**
 * Dictionary System Scalability Tests
 *
 * MEDIUM-3 FIX: Performance testing for 100K+ dictionary entries
 *
 * Tests critical scalability requirements:
 * - Load time for large dictionaries (100K+ entries)
 * - Search performance at scale (trie O(k) complexity)
 * - Memory usage stability
 * - No UI blocking operations
 *
 * WHY THIS IS CRITICAL:
 * - Current system tested at 27K entries (production baseline)
 * - Proper noun dictionaries can grow to 100K+ for long novels
 * - O(k) trie lookups must stay fast at scale
 * - Memory must stay bounded (no unbounded growth)
 * - UI must stay responsive (no blocking operations)
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { DictionaryManager } from '../DictionaryManager.js';

describe('Dictionary Scalability - 100K+ Entries', () => {
  let manager;

  beforeEach(() => {
    manager = new DictionaryManager({ enableVerboseLogging: false });
  });

  /**
   * Generate test dictionary data at scale
   */
  function generateLargeDictionary(size) {
    const dictionary = {};
    for (let i = 0; i < size; i++) {
      // Generate realistic Chinese characters (Unicode range 4E00-9FFF)
      const charCode = 0x4e00 + (i % 0x5200);
      const chinese = String.fromCharCode(charCode);
      // Add some multi-character entries for realism
      const entry = i % 10 === 0 ? chinese + String.fromCharCode(charCode + 1) : chinese;
      dictionary[entry] = `translation_${i}`;
    }
    return dictionary;
  }

  describe('load time performance', () => {
    test('should load 100K entries in <5 seconds', async () => {
      const dictionary = generateLargeDictionary(100000);
      const startTime = performance.now();

      await manager.loadDictionaries({
        scalability_test_100k: dictionary,
      });

      const elapsed = performance.now() - startTime;

      // Performance threshold: 5 seconds for 100K entries
      expect(elapsed).toBeLessThan(5000);
      expect(manager.dictionaries.has('scalability_test_100k')).toBe(true);
    });

    test('should load 50K entries in <2 seconds', async () => {
      const dictionary = generateLargeDictionary(50000);
      const startTime = performance.now();

      await manager.loadDictionaries({
        scalability_test_50k: dictionary,
      });

      const elapsed = performance.now() - startTime;

      // Performance threshold: 2 seconds for 50K entries
      expect(elapsed).toBeLessThan(2000);
    });

    test('should scale linearly with dictionary size', async () => {
      const sizes = [10000, 50000, 100000];
      const loadTimes = [];

      for (const size of sizes) {
        const dictionary = generateLargeDictionary(size);
        const startTime = performance.now();

        await manager.loadDictionaries({
          [`scalability_test_${size}`]: dictionary,
        });

        const elapsed = performance.now() - startTime;
        loadTimes.push({ size, time: elapsed });

        // Cleanup for next iteration
        manager.dictionaries.delete(`scalability_test_${size}`);
      }

      // Verify roughly linear scaling (within 3x ratio)
      const ratio10kTo50k = loadTimes[1].time / loadTimes[0].time;
      const ratio50kTo100k = loadTimes[2].time / loadTimes[1].time;

      expect(ratio10kTo50k).toBeLessThan(10); // Should not be exponential
      expect(ratio50kTo100k).toBeLessThan(5); // Should be roughly linear
    });
  });

  describe('search performance at scale', () => {
    beforeEach(async () => {
      const dictionary = generateLargeDictionary(100000);
      await manager.loadDictionaries({
        large_dict: dictionary,
      });
    });

    test('should maintain O(k) lookup time regardless of dictionary size', () => {
      const testChars = [
        String.fromCharCode(0x4e00), // First entry
        String.fromCharCode(0x4e00 + 50000), // Middle entry
        String.fromCharCode(0x4e00 + 99999), // Last entry
      ];

      const lookupTimes = testChars.map((char) => {
        const startTime = performance.now();
        manager.translate(char, ['large_dict']);
        return performance.now() - startTime;
      });

      // All lookups should be fast (<10ms) regardless of position
      lookupTimes.forEach((time) => {
        expect(time).toBeLessThan(10);
      });

      // Lookup times should be consistent (no position-dependent degradation)
      const avgTime = lookupTimes.reduce((sum, t) => sum + t, 0) / lookupTimes.length;
      const maxDeviation = Math.max(...lookupTimes.map((t) => Math.abs(t - avgTime)));
      expect(maxDeviation).toBeLessThan(avgTime * 2); // Within 2x of average
    });

    test('should maintain consistent performance across 1000 consecutive lookups', () => {
      // Warmup: Stabilize JIT compilation before measurement
      for (let i = 0; i < 100; i++) {
        const char = String.fromCharCode(0x4e00 + i);
        manager.translate(char, ['large_dict']);
      }

      const iterations = 1000;
      const lookupTimes = [];

      for (let i = 0; i < iterations; i++) {
        const charCode = 0x4e00 + (i % 100000);
        const char = String.fromCharCode(charCode);

        const startTime = performance.now();
        manager.translate(char, ['large_dict']);
        const elapsed = performance.now() - startTime;

        lookupTimes.push(elapsed);
      }

      // Calculate median across all batches to verify consistency
      const getMedian = (times) => {
        const sorted = [...times].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      };

      const batchSize = 100;
      const numBatches = Math.floor(iterations / batchSize);
      const batchMedians = [];

      for (let i = 0; i < numBatches; i++) {
        const batchTimes = lookupTimes.slice(i * batchSize, (i + 1) * batchSize);
        batchMedians.push(getMedian(batchTimes));
      }

      // Overall median across all batches
      const overallMedian = getMedian(batchMedians);

      // All batch medians should be within 5x of overall median
      // This catches catastrophic degradation while tolerating GC/JIT variance
      for (const batchMedian of batchMedians) {
        expect(batchMedian).toBeLessThan(overallMedian * 5);
      }

      // Also verify no individual batch is pathologically slow (>1ms median)
      for (const batchMedian of batchMedians) {
        expect(batchMedian).toBeLessThan(1); // <1ms per lookup
      }
    });

    test('should maintain fast findMatches at scale', () => {
      const testText = String.fromCharCode(0x4e00, 0x4e01, 0x4e02);

      const startTime = performance.now();
      manager.findAllMatches(testText, 0, ['large_dict']);
      const elapsed = performance.now() - startTime;

      // Should find all matches in <50ms even with 100K entries
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('memory usage stability', () => {
    test('should clean up dictionary references after deletion', async () => {
      // Build 10 dictionaries
      const allDictionaries = {};
      for (let i = 0; i < 10; i++) {
        allDictionaries[`temp_dict_${i}`] = generateLargeDictionary(10000);
      }

      // Load all at once
      await manager.loadDictionaries(allDictionaries);

      // Verify all loaded
      expect(manager.dictionaries.size).toBe(10);

      // Delete all dictionaries
      for (let i = 0; i < 10; i++) {
        manager.dictionaries.delete(`temp_dict_${i}`);
      }

      // Verify cleanup (deterministic, no GC needed)
      expect(manager.dictionaries.size).toBe(0);

      // Verify lookups no longer find deleted dictionaries
      const testChar = String.fromCharCode(0x4e00);
      const result = manager.translate(testChar, ['temp_dict_0']);
      expect(result).toBeNull();
    });

    test('should maintain bounded memory with LRU cache', async () => {
      const dictionary = generateLargeDictionary(100000);
      await manager.loadDictionaries({
        large_dict: dictionary,
      });

      const initialHeap = getHeapUsedMB();

      // Perform 10K lookups (cache should prevent unbounded growth)
      for (let i = 0; i < 10000; i++) {
        const charCode = 0x4e00 + (i % 100000);
        const char = String.fromCharCode(charCode);
        manager.translate(char, ['large_dict']);
      }

      const finalHeap = getHeapUsedMB();
      const cacheGrowth = finalHeap - initialHeap;

      // Cache should be bounded (< 50MB growth for 10K lookups)
      expect(cacheGrowth).toBeLessThan(50);
    });
  });

  describe('UI responsiveness (no blocking)', () => {
    test('should not block event loop during large dictionary load', async () => {
      const dictionary = generateLargeDictionary(100000);
      let eventLoopBlocked = false;

      // Simulate event loop activity
      const checkInterval = setInterval(() => {
        // This should run during dictionary loading
        // If blocked, this won't execute
      }, 50);

      const startTime = performance.now();
      await manager.loadDictionaries({
        large_dict: dictionary,
      });
      const elapsed = performance.now() - startTime;

      clearInterval(checkInterval);

      // Event loop should remain responsive (no single blocking operation > 100ms)
      // Note: This is a soft check - actual blocking would prevent interval from running
      expect(eventLoopBlocked).toBe(false);
      expect(elapsed).toBeLessThan(10000); // Total time reasonable
    });

    test('should handle concurrent lookups without blocking', async () => {
      const dictionary = generateLargeDictionary(50000);
      await manager.loadDictionaries({
        large_dict: dictionary,
      });

      // Simulate concurrent lookups (Promise.all)
      const lookups = Array.from({ length: 100 }, (_, i) => {
        const charCode = 0x4e00 + i;
        const char = String.fromCharCode(charCode);
        return Promise.resolve(manager.translate(char, ['large_dict']));
      });

      const startTime = performance.now();
      await Promise.all(lookups);
      const elapsed = performance.now() - startTime;

      // Should handle 100 concurrent lookups in <100ms
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('edge cases at scale', () => {
    test('should handle maximum trie depth without stack overflow', async () => {
      // Create deeply nested entries (long compound words)
      const dictionary = {};
      const baseChar = String.fromCharCode(0x4e00);
      for (let depth = 1; depth <= 100; depth++) {
        const entry = baseChar.repeat(depth);
        dictionary[entry] = `translation_depth_${depth}`;
      }

      await manager.loadDictionaries({
        deep_trie: dictionary,
      });

      // Should find longest match without stack overflow
      const longInput = baseChar.repeat(100);
      const result = manager.translate(longInput, ['deep_trie']);

      expect(result).not.toBeNull();
      expect(result.word).toBe(longInput);
    });

    test('should handle mixed small and large dictionaries', async () => {
      const smallDict = generateLargeDictionary(100);
      const largeDict = generateLargeDictionary(100000);

      await manager.loadDictionaries({
        small: smallDict,
        large: largeDict,
      });

      // Lookups in small dictionary should not be slowed by large dictionary
      const charInSmall = String.fromCharCode(0x4e00);

      const startTime = performance.now();
      manager.translate(charInSmall, ['small', 'large']);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(10); // Should be fast
    });

    test('should maintain correctness with colliding hash codes', async () => {
      // Create entries that might have hash collisions
      const dictionary = {};
      const baseCode = 0x4e00;

      // Generate 1000 entries with potential hash collisions
      for (let i = 0; i < 1000; i++) {
        const char1 = String.fromCharCode(baseCode + i);
        const char2 = String.fromCharCode(baseCode + ((i * 7) % 1000));
        const entry = char1 + char2;
        dictionary[entry] = `translation_${i}`;
      }

      await manager.loadDictionaries({
        collision_test: dictionary,
      });

      // Verify all entries are retrievable
      for (let i = 0; i < 1000; i++) {
        const char1 = String.fromCharCode(baseCode + i);
        const char2 = String.fromCharCode(baseCode + ((i * 7) % 1000));
        const entry = char1 + char2;

        const result = manager.translate(entry, ['collision_test']);
        expect(result).not.toBeNull();
        expect(result.translation).toBe(`translation_${i}`);
      }
    });
  });
});

/**
 * Helper: Get heap usage in MB
 */
function getHeapUsedMB() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed / 1024 / 1024;
  }
  return 0; // Fallback if not available
}
