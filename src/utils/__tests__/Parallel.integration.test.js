/**
 * Integration tests for complete parallel processing pipeline
 * Tests the interaction between parallel chunk processing and parallel dictionary lookups
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { TranslationEngine } from '../TranslationEngine.js';

// Mock performance and console for testing
global.performance = {
  now: () => Date.now(),
  memory: {
    jsHeapSizeLimit: 4 * 1024 * 1024 * 1024, // 4GB - high memory device
    usedJSHeapSize: 100 * 1024 * 1024,
  },
};

global.console = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('Parallel Processing Integration', () => {
  let engine;

  beforeEach(async () => {
    engine = new TranslationEngine();

    // Mock successful initialization
    engine.isInitialized = true;
    engine.dictionaryManager.ready = true;

    // Mock basic dictionaries for testing
    engine.dictionaryManager.dictionaries = new Map();
    engine.dictionaryManager.metadata = new Map();

    // Enable parallel processing for tests
    engine.parallelConfig = null; // Will be initialized on first use
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End Parallel Pipeline', () => {
    test('should process multi-chunk text with parallel chunk and dictionary processing', async () => {
      const testText =
        '这是第一个测试句子。这是第二个测试句子。这是第三个测试句子。这是第四个测试句子。';

      // Mock methods to verify they're called
      const chunkParallelSpy = jest
        .spyOn(engine, 'processChunksInParallel')
        .mockImplementation(async (batch, _options, _batchStart) => {
          // Simulate parallel chunk processing
          for (const chunk of batch) {
            chunk.translated = `translated_${chunk.content}`;
          }
        });

      const dictParallelSpy = jest
        .spyOn(engine.dictionaryManager, 'findAllMatchesAsync')
        .mockImplementation(async () => []);

      const result = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Should have used parallel processing
      expect(chunkParallelSpy).toHaveBeenCalled();
      expect(dictParallelSpy).toHaveBeenCalled();

      // Should produce valid result
      expect(result.translatedText).toBeDefined();
      expect(result.semanticArrays).toBeDefined();

      chunkParallelSpy.mockRestore();
      dictParallelSpy.mockRestore();
    });

    test('should maintain translation quality with parallel processing enabled', async () => {
      const testText = '简单的测试文本。另一个测试句子。';

      // Test with parallel processing
      const parallelResult = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Test with sequential processing
      const sequentialResult = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: false,
      });

      // Results should be equivalent (allowing for minor timing differences)
      expect(parallelResult.translatedText).toBeDefined();
      expect(sequentialResult.translatedText).toBeDefined();
      expect(parallelResult.semanticArrays.original.length).toBe(
        sequentialResult.semanticArrays.original.length
      );
    });

    test('should handle mixed processing scenarios gracefully', async () => {
      const testText = '单个句子'; // Single chunk - should use sequential

      const processSequentiallySpy = vi.spyOn(engine, 'processChunksSequentially');

      await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Should fallback to sequential for single chunk
      expect(processSequentiallySpy).toHaveBeenCalled();

      processSequentiallySpy.mockRestore();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should recover from parallel chunk processing failures', async () => {
      const testText = '失败测试。正常测试。另一个测试。';

      // Mock processChunksInParallel to fail once
      let callCount = 0;
      const originalProcessChunks = engine.processChunksInParallel;
      engine.processChunksInParallel = vi.fn().mockImplementation(async (...args) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Simulated parallel processing failure');
        }
        return originalProcessChunks.apply(engine, args);
      });

      const result = await engine.translateWithProgressiveBatches(testText);

      // Should complete successfully despite failure
      expect(result.translatedText).toBeDefined();
      expect(result.translatedText.length).toBeGreaterThan(0);

      // Should have attempted parallel processing and fallen back
      expect(engine.processChunksInParallel).toHaveBeenCalled();
    });

    test('should handle dictionary lookup failures gracefully', async () => {
      const testText = '词典失败测试。正常处理测试。';

      // Mock dictionary methods to fail intermittently
      const originalFindAllMatchesAsync = engine.dictionaryManager.findAllMatchesAsync;
      let dictCallCount = 0;
      engine.dictionaryManager.findAllMatchesAsync = jest
        .fn()
        .mockImplementation(async (...args) => {
          dictCallCount++;
          if (dictCallCount === 1) {
            throw new Error('Dictionary lookup failure');
          }
          return originalFindAllMatchesAsync.apply(engine.dictionaryManager, args);
        });

      const result = await engine.translateWithProgressiveBatches(testText);

      // Should complete translation despite dictionary failures
      expect(result.translatedText).toBeDefined();
      expect(result.semanticArrays).toBeDefined();

      engine.dictionaryManager.findAllMatchesAsync = originalFindAllMatchesAsync;
    });

    test('should maintain progress reporting during parallel processing', async () => {
      const testText = '进度测试一。进度测试二。进度测试三。进度测试四。进度测试五。';

      const progressUpdates = [];
      const progressCallback = (progress) => {
        progressUpdates.push(progress);
      };

      await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
        onProgress: progressCallback,
      });

      // Should receive progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Progress should be properly formatted
      progressUpdates.forEach((update) => {
        expect(update).toHaveProperty('currentBatch');
        expect(update).toHaveProperty('totalBatches');
        expect(update).toHaveProperty('partialTranslation');
        expect(typeof update.currentBatch).toBe('number');
        expect(typeof update.totalBatches).toBe('number');
      });
    });
  });

  describe('Memory and Performance Management', () => {
    test('should respect device memory limits in parallel processing', () => {
      // Test low memory device scenario
      const originalCalculateMax = engine.calculateMaxTokensForDevice;
      engine.calculateMaxTokensForDevice = vi.fn(() => 5000); // Low memory device

      engine.initializeParallelProcessing();

      // Should disable parallel processing for low memory
      expect(engine.parallelConfig.enableParallelChunks).toBe(false);
      expect(engine.parallelConfig.maxParallelChunks).toBe(1);

      // Test high memory device scenario
      engine.calculateMaxTokensForDevice = vi.fn(() => 50000); // High memory device

      engine.initializeParallelProcessing();

      // Should enable parallel processing for high memory
      expect(engine.parallelConfig.enableParallelChunks).toBe(true);
      expect(engine.parallelConfig.maxParallelChunks).toBe(5);

      engine.calculateMaxTokensForDevice = originalCalculateMax;
    });

    test('should handle large text processing with parallel optimizations', async () => {
      const largeText = '大型文本测试句子。'.repeat(50); // Substantial text

      const startTime = performance.now();

      const result = await engine.translateWithProgressiveBatches(largeText, {
        enableParallelChunks: true,
      });

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should complete processing
      expect(result.translatedText).toBeDefined();
      expect(result.translatedText.length).toBeGreaterThan(0);

      // Should process in reasonable time (allowing for test environment variability)
      expect(processingTime).toBeLessThan(30000); // 30 seconds max

      console.log(`Large text processing time: ${processingTime.toFixed(2)}ms`);
    }, 35000); // 35 second timeout

    test('should maintain semantic array consistency with parallel processing', async () => {
      const testText = '语义数组测试。并行处理测试。一致性验证。';

      const result = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Should have consistent semantic arrays
      expect(result.semanticArrays.original).toBeDefined();
      expect(result.semanticArrays.translated).toBeDefined();
      expect(Array.isArray(result.semanticArrays.original)).toBe(true);
      expect(Array.isArray(result.semanticArrays.translated)).toBe(true);

      // Arrays should have reasonable length (not empty, not excessively long)
      expect(result.semanticArrays.original.length).toBeGreaterThan(0);
      expect(result.semanticArrays.translated.length).toBeGreaterThan(0);
      expect(result.semanticArrays.original.length).toBeLessThan(1000);
    });
  });

  describe('Configuration and Flexibility', () => {
    test('should support dynamic configuration changes', () => {
      // Test initial configuration
      engine.initializeParallelProcessing({
        enableParallelChunks: true,
        maxParallelChunks: 3,
      });

      expect(engine.parallelConfig.enableParallelChunks).toBe(true);
      expect(engine.parallelConfig.maxParallelChunks).toBe(3);

      // Test reconfiguration
      engine.initializeParallelProcessing({
        enableParallelChunks: false,
        maxParallelChunks: 1,
      });

      expect(engine.parallelConfig.enableParallelChunks).toBe(false);
      expect(engine.parallelConfig.maxParallelChunks).toBe(1);
    });

    test('should integrate with existing performance profiling', async () => {
      const testText = '性能分析测试。并行处理监控。';

      // Enable performance profiling if available
      if (engine.performanceProfiler) {
        const resetSpy = vi.spyOn(engine.performanceProfiler, 'reset');
        const recordSpy = vi.spyOn(engine.performanceProfiler, 'recordRenderingMetrics');

        await engine.translateWithProgressiveBatches(testText);

        // Should interact with performance profiler
        expect(resetSpy).toHaveBeenCalled() || expect(recordSpy).toHaveBeenCalled();

        resetSpy.mockRestore();
        recordSpy.mockRestore();
      }
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain existing API contracts', async () => {
      const testText = '兼容性测试文本。';

      // All existing methods should continue to work
      const progressResult = await engine.translateWithProgressiveBatches(testText);
      expect(progressResult).toHaveProperty('translatedText');
      expect(progressResult).toHaveProperty('semanticArrays');

      // Dictionary manager methods should work
      const dictResults = engine.dictionaryManager.findAllMatches('测试');
      expect(Array.isArray(dictResults)).toBe(true);

      const asyncDictResults = await engine.dictionaryManager.findAllMatchesAsync('测试');
      expect(Array.isArray(asyncDictResults)).toBe(true);
    });

    test('should handle legacy configuration gracefully', async () => {
      const testText = '遗留配置测试。';

      // Test with no parallel configuration
      engine.parallelConfig = null;

      const result = await engine.translateWithProgressiveBatches(testText);

      // Should work and initialize config automatically
      expect(result.translatedText).toBeDefined();
      expect(engine.parallelConfig).toBeDefined();
    });
  });
});
