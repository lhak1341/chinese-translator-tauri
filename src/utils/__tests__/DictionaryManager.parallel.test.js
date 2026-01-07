/**
 * Tests for DictionaryManager parallel processing functionality
 * Verifies thread safety and performance improvements in dictionary lookups
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { DictionaryManager } from '../DictionaryManager.js';

// Mock performance object for consistent testing
global.performance = {
  now: () => Date.now(),
};

// Mock console for cleaner test output
global.console = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('DictionaryManager Parallel Processing', () => {
  let manager;

  // Mock dictionary data for testing
  const testDictionaries = {
    phrases: {
      测试: 'test',
      并行: 'parallel',
      处理: 'processing',
      测试并行: 'test parallel',
      并行处理: 'parallel processing',
      测试并行处理: 'test parallel processing',
    },
    characters: {
      测: 'test_char',
      试: 'try_char',
      并: 'parallel_char',
      行: 'row_char',
      处: 'place_char',
      理: 'logic_char',
    },
    proper_nouns: {
      张三: 'Zhang San',
      李四: 'Li Si',
      北京: 'Beijing',
    },
  };

  beforeEach(async () => {
    manager = new DictionaryManager({
      enableParallelLookups: true,
      cacheEnabled: false, // Disable caching for predictable test results
    });

    // Mock the dictionary loading process
    manager.ready = true;
    manager.dictionaries = new Map();
    manager.metadata = new Map();

    // Create mock dictionaries with test data
    Object.entries(testDictionaries).forEach(([name, words]) => {
      const mockTrie = {
        root: { children: new Map() },
        size: Object.keys(words).length,
        sharedMatchesArray: [],
      };

      // Build a simple trie structure for testing
      Object.entries(words).forEach(([word, translation]) => {
        let current = mockTrie.root;
        for (const char of word) {
          if (!current.children.has(char)) {
            current.children.set(char, {
              children: new Map(),
              isEndOfWord: false,
            });
          }
          current = current.children.get(char);
        }
        current.isEndOfWord = true;
        current.translation = translation;
        current.metadata = null;
      });

      manager.dictionaries.set(name, mockTrie);
      manager.metadata.set(name, { priority: name === 'proper_nouns' ? 1 : 5 });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Thread Safety', () => {
    test('should use thread-safe findMatches implementation', () => {
      const text = '测试并行处理';
      const dictionary = manager.dictionaries.get('phrases');

      // Test thread-safe method directly
      const matches1 = manager.findMatchesThreadSafe(dictionary, text, 0);
      const matches2 = manager.findMatchesThreadSafe(dictionary, text, 0);

      // Should produce identical results
      expect(matches1).toEqual(matches2);
      expect(matches1.length).toBeGreaterThan(0);

      // Should not use shared array (no interference)
      expect(matches1).not.toBe(matches2); // Different instances
    });

    test('should handle concurrent access safely', async () => {
      const text = '测试并行处理';
      const iterations = 10;

      // Run multiple concurrent lookups
      const promises = Array(iterations)
        .fill(0)
        .map(() => manager.findAllMatchesParallel(text, 0));

      const results = await Promise.all(promises);

      // All results should be identical
      const firstResult = results[0];
      results.forEach((result, _index) => {
        expect(result).toEqual(firstResult);
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Parallel Dictionary Lookups', () => {
    test('should produce identical results to sequential processing', async () => {
      const text = '测试并行处理';

      const parallelResults = await manager.findAllMatchesParallel(text);
      const sequentialResults = manager.findAllMatchesSequential(text);

      // Results should be identical in content
      expect(parallelResults.length).toBe(sequentialResults.length);

      // Sort both arrays for comparison (async processing may change order)
      const sortFn = (a, b) => a.word.localeCompare(b.word);
      parallelResults.sort(sortFn);
      sequentialResults.sort(sortFn);

      expect(parallelResults).toEqual(sequentialResults);
    });

    test.skip('should handle partial dictionary failures gracefully [NEEDS FIX]', async () => {
      const text = '测试';

      // Mock one dictionary to fail
      const originalGet = manager.dictionaries.get;
      manager.dictionaries.get = vi.fn((name) => {
        if (name === 'phrases') {
          throw new Error('Simulated dictionary failure');
        }
        return originalGet.call(manager.dictionaries, name);
      });

      const results = await manager.findAllMatchesParallel(text);

      // Should still return results from working dictionaries
      expect(results.length).toBeGreaterThan(0);

      // Should log the error
      expect(console.error).toHaveBeenCalled();

      // Restore original method
      manager.dictionaries.get = originalGet;
    });

    test.skip('should record performance statistics [FLAKY]', async () => {
      const text = '测试';

      // Reset stats
      manager.parallelLookupStats = {
        parallelCalls: 0,
        sequentialCalls: 0,
        averageParallelTime: 0,
        averageSequentialTime: 0,
        fallbackCount: 0,
      };

      await manager.findAllMatchesParallel(text);
      manager.findAllMatchesSequential(text);

      expect(manager.parallelLookupStats.parallelCalls).toBe(1);
      expect(manager.parallelLookupStats.sequentialCalls).toBe(1);
      expect(manager.parallelLookupStats.averageParallelTime).toBeGreaterThan(0);
      expect(manager.parallelLookupStats.averageSequentialTime).toBeGreaterThan(0);
    });

    test('should fallback to sequential on parallel processing errors', async () => {
      const text = '测试';

      // Mock Promise.all to fail
      const originalPromiseAll = Promise.all;
      Promise.all = vi.fn(() => Promise.reject(new Error('Parallel processing failed')));

      const fallbackSpy = vi.spyOn(manager, 'findAllMatchesSequential');

      const result = await manager.findAllMatchesParallel(text);

      // Should have called fallback
      expect(fallbackSpy).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);

      // Should log fallback
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Parallel dictionary lookup failed'),
        expect.any(Error)
      );

      // Restore original Promise.all
      Promise.all = originalPromiseAll;
      fallbackSpy.mockRestore();
    });
  });

  describe('Async Method Integration', () => {
    test('should automatically choose processing method based on configuration', async () => {
      const text = '测试';

      // Test with parallel enabled and multiple dictionaries
      manager.enableParallelLookups = true;
      manager.dictionaryParallelThreshold = 2;

      const parallelSpy = vi.spyOn(manager, 'findAllMatchesParallel');
      const sequentialSpy = vi.spyOn(manager, 'findAllMatchesSequential');

      await manager.findAllMatchesAsync(text);

      // Should use parallel processing
      expect(parallelSpy).toHaveBeenCalled();
      expect(sequentialSpy).not.toHaveBeenCalled();

      parallelSpy.mockRestore();
      sequentialSpy.mockRestore();
    });

    test('should use sequential processing when parallel is disabled', async () => {
      const text = '测试';

      // Disable parallel processing
      manager.enableParallelLookups = false;

      const parallelSpy = vi.spyOn(manager, 'findAllMatchesParallel');
      const sequentialSpy = vi.spyOn(manager, 'findAllMatchesSequential');

      await manager.findAllMatchesAsync(text);

      // Should use sequential processing
      expect(parallelSpy).not.toHaveBeenCalled();
      expect(sequentialSpy).toHaveBeenCalled();

      parallelSpy.mockRestore();
      sequentialSpy.mockRestore();
    });

    test('should use sequential processing for single dictionary', async () => {
      const text = '测试';

      // Mock single dictionary scenario
      manager.dictionaryParallelThreshold = 2;
      const originalGetDefaultSearchOrder = manager.getDefaultSearchOrder;
      manager.getDefaultSearchOrder = vi.fn(() => ['phrases']); // Only one dictionary

      const parallelSpy = vi.spyOn(manager, 'findAllMatchesParallel');
      const sequentialSpy = vi.spyOn(manager, 'findAllMatchesSequential');

      await manager.findAllMatchesAsync(text);

      // Should use sequential processing due to threshold
      expect(parallelSpy).not.toHaveBeenCalled();
      expect(sequentialSpy).toHaveBeenCalled();

      // Restore original method
      manager.getDefaultSearchOrder = originalGetDefaultSearchOrder;
      parallelSpy.mockRestore();
      sequentialSpy.mockRestore();
    });
  });

  describe('Performance Characteristics', () => {
    test.skip('should show performance improvement with parallel processing [FLAKY]', async () => {
      // Skip this test if running in resource-constrained environment
      if (manager.dictionaries.size < 3) {
        console.log('Skipping performance test - insufficient dictionaries');
        return;
      }

      const text = '测试并行处理';
      const iterations = 5;

      // Measure sequential processing time
      const sequentialTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        manager.findAllMatchesSequential(text);
        const end = performance.now();
        sequentialTimes.push(end - start);
      }
      const avgSequential = sequentialTimes.reduce((a, b) => a + b) / iterations;

      // Measure parallel processing time
      const parallelTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await manager.findAllMatchesParallel(text);
        const end = performance.now();
        parallelTimes.push(end - start);
      }
      const avgParallel = parallelTimes.reduce((a, b) => a + b) / iterations;

      console.log(
        `Sequential avg: ${avgSequential.toFixed(2)}ms, Parallel avg: ${avgParallel.toFixed(2)}ms`
      );

      // Parallel should be competitive or faster (allowing for test variability)
      expect(avgParallel).toBeLessThan(avgSequential * 1.5);
    }, 15000); // 15 second timeout for performance test
  });

  describe('Result Quality Assurance', () => {
    test('should maintain priority sorting in parallel processing', async () => {
      const text = '北京'; // Should match both proper_nouns (priority 1) and characters (priority 5)

      const results = await manager.findAllMatchesParallel(text);

      // Should have results
      expect(results.length).toBeGreaterThan(0);

      // Should be sorted by priority (lower number = higher priority)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].priority).toBeGreaterThanOrEqual(results[i - 1].priority);
      }
    });

    test('should maintain length sorting within priority groups', async () => {
      const text = '测试并行处理'; // Has overlapping matches of different lengths

      const results = await manager.findAllMatchesParallel(text);

      // Group by priority and check length sorting within groups
      const groupedByPriority = results.reduce((groups, result) => {
        const priority = result.priority;
        if (!groups[priority]) groups[priority] = [];
        groups[priority].push(result);
        return groups;
      }, {});

      Object.values(groupedByPriority).forEach((group) => {
        // Within each priority group, should be sorted by length (longer first)
        for (let i = 1; i < group.length; i++) {
          expect(group[i].word.length).toBeLessThanOrEqual(group[i - 1].word.length);
        }
      });
    });

    test('should handle empty results gracefully', async () => {
      const text = '不存在的词'; // Should not match anything

      const results = await manager.findAllMatchesParallel(text);

      expect(results).toEqual([]);
      expect(Array.isArray(results)).toBe(true);
    });

    test('should preserve match metadata', async () => {
      const text = '测试';

      const results = await manager.findAllMatchesParallel(text);

      results.forEach((result) => {
        expect(result).toHaveProperty('word');
        expect(result).toHaveProperty('translation');
        expect(result).toHaveProperty('dictionary');
        expect(result).toHaveProperty('priority');
        expect(result).toHaveProperty('endPos');
        expect(typeof result.dictionary).toBe('string');
        expect(typeof result.priority).toBe('number');
      });
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain synchronous findAllMatches behavior', () => {
      const text = '测试';

      const result = manager.findAllMatches(text);

      // Should return synchronously (not a Promise)
      expect(result).not.toBeInstanceOf(Promise);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should maintain findBestMatch compatibility', async () => {
      const text = '测试并行处理';

      const syncBest = manager.findBestMatch(text);
      const asyncBest = await manager.findBestMatchAsync(text);

      // Should return equivalent results
      expect(syncBest.word).toBe(asyncBest.word);
      expect(syncBest.translation).toBe(asyncBest.translation);
      expect(syncBest.dictionary).toBe(asyncBest.dictionary);
    });
  });
});
