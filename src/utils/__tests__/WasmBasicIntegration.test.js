/**
 * Basic WASM Integration Tests
 * Tests the core functionality of the WASM dictionary engine
 */

import { WasmDictionaryManager } from '../WasmDictionaryManager.js';

// Mock fallback manager for testing
const mockFallbackManager = {
  loadDictionary: vi.fn(() => Promise.resolve(true)),
  findMatches: vi.fn(() => []),
  findLongestMatch: vi.fn(() => null),
};

describe('WASM Basic Integration', () => {
  let wasmManager;

  beforeEach(async () => {
    wasmManager = new WasmDictionaryManager();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    test('initializes WASM engine successfully', async () => {
      const success = await wasmManager.initialize(mockFallbackManager);

      expect(success).toBe(true);
      expect(wasmManager.isInitialized()).toBe(true);
      expect(wasmManager.isInFallbackMode()).toBe(false);
    });

    test('provides performance stats after initialization', async () => {
      await wasmManager.initialize(mockFallbackManager);

      const stats = wasmManager.getPerformanceReport();

      expect(stats).toBeDefined();
      expect(stats.initialized).toBe(true);
      expect(stats.fallbackMode).toBe(false);
      expect(typeof stats.totalLookups).toBe('number');
    });
  });

  describe('Dictionary Loading', () => {
    beforeEach(async () => {
      await wasmManager.initialize(mockFallbackManager);
    });

    test('loads dictionary with Chinese-Vietnamese entries', async () => {
      const testEntries = [
        { chinese: '你好', vietnamese: 'xin chào', metadata: { source: 'test' } },
        { chinese: '世界', vietnamese: 'thế giới', metadata: { source: 'test' } },
        { chinese: '你', vietnamese: 'bạn', metadata: { source: 'test' } },
      ];

      const success = await wasmManager.loadDictionary('test-dict', testEntries);

      expect(success).toBe(true);
      expect(wasmManager.getDictionaryCount()).toBe(1);
      expect(wasmManager.getTotalEntries()).toBe(3);
      expect(wasmManager.hasDictionary('test-dict')).toBe(true);
    });

    test('handles empty dictionary', async () => {
      const success = await wasmManager.loadDictionary('empty-dict', []);

      expect(success).toBe(true);
      expect(wasmManager.hasDictionary('empty-dict')).toBe(true);
    });

    test('handles various entry formats', async () => {
      const testEntries = [
        { chinese: '测试1', vietnamese: 'test1' }, // No metadata
        { original: '测试2', translation: 'test2' }, // Alternative field names
        { word: '测试3', vietnamese: 'test3', metadata: { priority: 1 } }, // Mixed format
      ];

      const success = await wasmManager.loadDictionary('format-test', testEntries);
      expect(success).toBe(true);
    });
  });

  describe('Dictionary Lookups', () => {
    beforeEach(async () => {
      await wasmManager.initialize(mockFallbackManager);

      // Load test dictionary
      const testEntries = [
        { chinese: '你好', vietnamese: 'xin chào', metadata: { source: 'greeting' } },
        { chinese: '世界', vietnamese: 'thế giới', metadata: { source: 'world' } },
        { chinese: '你', vietnamese: 'bạn', metadata: { source: 'pronoun' } },
        { chinese: '好', vietnamese: 'tốt', metadata: { source: 'adjective' } },
      ];

      await wasmManager.loadDictionary('lookup-test', testEntries);
    });

    test('finds all matches for text', () => {
      const matches = wasmManager.findMatches('lookup-test', '你好', 0);

      expect(matches.length).toBe(2); // Should find both "你好" and "你"
      expect(matches[0].word).toBe('你好'); // Longest match first
      expect(matches[0].translation).toBe('xin chào');
      expect(matches[0].startPos).toBe(0);
      expect(matches[0].endPos).toBe(2);

      expect(matches[1].word).toBe('你');
      expect(matches[1].translation).toBe('bạn');
    });

    test('finds longest match only', () => {
      const match = wasmManager.findLongestMatch('lookup-test', '你好', 0);

      expect(match).toBeDefined();
      expect(match.word).toBe('你好');
      expect(match.translation).toBe('xin chào');
      expect(match.metadata.source).toBe('greeting');
    });

    test('handles no matches gracefully', () => {
      const matches = wasmManager.findMatches('lookup-test', '测试', 0);
      expect(matches.length).toBe(0);

      const match = wasmManager.findLongestMatch('lookup-test', '测试', 0);
      expect(match).toBeNull();
    });

    test('handles non-existent dictionary', () => {
      const matches = wasmManager.findMatches('non-existent', '你好', 0);
      expect(matches.length).toBe(0);

      const match = wasmManager.findLongestMatch('non-existent', '你好', 0);
      expect(match).toBeNull();
    });
  });

  describe('Fallback Behavior', () => {
    test('falls back to JavaScript when WASM fails to initialize', async () => {
      // Create a manager that will fail to initialize
      const failingManager = new WasmDictionaryManager();

      // Force initialization to fail by providing invalid fallback
      const success = await failingManager.initialize(null);

      expect(success).toBe(false);
      expect(failingManager.isInFallbackMode()).toBe(true);
    });

    test('uses fallback manager when in fallback mode', async () => {
      await wasmManager.initialize(mockFallbackManager);

      // Force fallback mode
      wasmManager.fallbackMode = true;

      // Test dictionary loading fallback
      await wasmManager.loadDictionary('test', []);
      expect(mockFallbackManager.loadDictionary).toHaveBeenCalledWith('test', []);

      // Test lookup fallback
      wasmManager.findMatches('test', '你好', 0);
      expect(mockFallbackManager.findMatches).toHaveBeenCalledWith('test', '你好', 0);
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(async () => {
      await wasmManager.initialize(mockFallbackManager);

      await wasmManager.loadDictionary('perf-test', [{ chinese: '测试', vietnamese: 'test' }]);
    });

    test('tracks lookup operations', () => {
      const statsBefore = wasmManager.getPerformanceReport();

      // Perform some lookups
      wasmManager.findMatches('perf-test', '测试', 0);
      wasmManager.findLongestMatch('perf-test', '测试', 0);

      const statsAfter = wasmManager.getPerformanceReport();

      expect(statsAfter.totalLookups).toBeGreaterThan(statsBefore.totalLookups);
    });

    test('provides meaningful performance metrics', () => {
      wasmManager.findMatches('perf-test', '测试', 0);

      const stats = wasmManager.getPerformanceReport();

      expect(typeof stats.totalLookups).toBe('number');
      expect(typeof stats.totalTimeMs).toBe('number');
      expect(typeof stats.averageTimeMs).toBe('number');
      expect(stats.totalLookups).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('handles invalid dictionary entries gracefully', async () => {
      await wasmManager.initialize(mockFallbackManager);

      // Test with invalid entries
      const invalidEntries = [
        null,
        undefined,
        { chinese: null, vietnamese: 'test' },
        { chinese: 'test' }, // Missing translation
      ];

      // Should not throw, might use fallback
      const success = await wasmManager.loadDictionary('invalid-test', invalidEntries);

      // Should handle gracefully (either succeed with valid entries or fallback)
      expect(typeof success).toBe('boolean');
    });

    test('recovers from consecutive failures', async () => {
      await wasmManager.initialize(mockFallbackManager);

      // Simulate consecutive failures
      wasmManager.consecutiveFailures = 5;
      wasmManager.handleFailure();

      expect(wasmManager.isInFallbackMode()).toBe(true);
    });
  });
});

describe('WASM Performance Comparison', () => {
  let wasmManager;

  beforeEach(async () => {
    wasmManager = new WasmDictionaryManager();
    await wasmManager.initialize(mockFallbackManager);
  });

  test('basic performance benchmark', async () => {
    const testEntries = Array(1000)
      .fill()
      .map((_, i) => ({
        chinese: `测试${i}`,
        vietnamese: `test${i}`,
      }));

    await wasmManager.loadDictionary('benchmark', testEntries);

    const iterations = 100;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      wasmManager.findMatches('benchmark', '测试500', 0);
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;

    console.log(
      `WASM Performance: ${iterations} lookups in ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(3)}ms per lookup)`
    );

    // Basic performance expectation - should be reasonably fast
    expect(avgTime).toBeLessThan(10); // Less than 10ms per lookup on average
  });
});
