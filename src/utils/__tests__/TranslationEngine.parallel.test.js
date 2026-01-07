/**
 * Tests for TranslationEngine parallel processing functionality
 * Verifies that parallel chunk processing produces identical results to sequential processing
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { TranslationEngine } from '../TranslationEngine.js';

// Mock performance object for consistent testing
global.performance = {
  now: () => Date.now(),
  memory: {
    jsHeapSizeLimit: 4 * 1024 * 1024 * 1024, // 4GB - high memory device
    usedJSHeapSize: 100 * 1024 * 1024,
  },
};

describe('TranslationEngine Parallel Processing', () => {
  let engine;

  beforeEach(async () => {
    engine = new TranslationEngine();
    await engine.initialize();
  });

  afterEach(() => {
    // Reset any test modifications
    if (engine.parallelConfig) {
      engine.parallelConfig = null;
    }
  });

  describe('Parallel Configuration', () => {
    test('should initialize parallel config based on device memory', () => {
      engine.initializeParallelProcessing();

      expect(engine.parallelConfig).toBeDefined();
      expect(engine.parallelConfig.enableParallelChunks).toBe(true); // High memory device
      expect(engine.parallelConfig.maxParallelChunks).toBe(5);
      expect(engine.parallelConfig.chunkParallelThreshold).toBe(2);
    });

    test('should disable parallel processing for low memory devices', () => {
      // Mock low memory device
      const originalCalculateMax = engine.calculateMaxTokensForDevice;
      engine.calculateMaxTokensForDevice = vi.fn(() => 10000); // Low memory device

      engine.initializeParallelProcessing();

      expect(engine.parallelConfig.enableParallelChunks).toBe(false);
      expect(engine.parallelConfig.maxParallelChunks).toBe(1);

      // Restore original method
      engine.calculateMaxTokensForDevice = originalCalculateMax;
    });

    test('should respect explicit configuration options', () => {
      engine.initializeParallelProcessing({
        enableParallelChunks: false,
        maxParallelChunks: 3,
      });

      expect(engine.parallelConfig.enableParallelChunks).toBe(false);
    });
  });

  describe('Parallel Chunk Processing', () => {
    test('should produce identical results to sequential processing', async () => {
      const testText = '这是测试文本。另一个句子。第三个句子。第四个句子。';

      // Test with parallel processing enabled
      const parallelResult = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Test with parallel processing disabled
      const sequentialResult = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: false,
      });

      // Results should be identical
      expect(parallelResult.translatedText).toBe(sequentialResult.translatedText);
      expect(parallelResult.semanticArrays.original.length).toBe(
        sequentialResult.semanticArrays.original.length
      );
      expect(parallelResult.semanticArrays.translated.length).toBe(
        sequentialResult.semanticArrays.translated.length
      );
    });

    test('should fallback to sequential processing for single chunk', async () => {
      const testText = '单个句子测试';

      const logSpy = vi.spyOn(engine, 'log').mockImplementation(() => {});

      await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Should not see parallel processing logs for single chunk
      const parallelLogs = logSpy.mock.calls.filter(
        (call) => call[1] && call[1].includes('Parallel batch processing')
      );
      expect(parallelLogs).toHaveLength(0);

      logSpy.mockRestore();
    });

    test('should handle parallel processing errors gracefully', async () => {
      const testText = '测试错误处理。另一个句子。第三个句子。';

      // Mock translateDirectly to fail on specific content
      const originalTranslateDirectly = engine.translateDirectly;
      let failCount = 0;
      engine.translateDirectly = vi.fn().mockImplementation((content, options) => {
        if (content.includes('错误') && failCount === 0) {
          failCount++;
          throw new Error('Simulated translation failure');
        }
        return originalTranslateDirectly.call(engine, content, options);
      });

      const logSpy = vi.spyOn(engine, 'log').mockImplementation(() => {});

      const result = await engine.translateWithProgressiveBatches(testText);

      // Should complete successfully despite error
      expect(result.translatedText).toBeDefined();
      expect(result.translatedText).not.toContain('undefined');

      // Should log fallback to sequential processing
      const fallbackLogs = logSpy.mock.calls.filter(
        (call) => call[1] && call[1].includes('Falling back to sequential')
      );
      expect(fallbackLogs.length).toBeGreaterThan(0);

      // Restore mocks
      engine.translateDirectly = originalTranslateDirectly;
      logSpy.mockRestore();
    });

    test('should respect chunk parallel threshold', async () => {
      const testText = '单句';

      const processSequentiallySpy = vi.spyOn(engine, 'processChunksSequentially');

      await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Should use sequential processing for text below threshold
      expect(processSequentiallySpy).toHaveBeenCalled();

      processSequentiallySpy.mockRestore();
    });
  });

  describe('Progressive System Integration', () => {
    test('should preserve existing batch-level processing', async () => {
      const testText = '测试标点。引用文本"内容"。数字123。';

      // Spy on existing methods to ensure they're still called
      const punctuationSpy = vi.spyOn(engine.textChunker, 'translatePunctuation');
      const capitalizationSpy = vi.spyOn(engine, 'applySmartCapitalization');
      const cleanupSpy = vi.spyOn(engine, 'applyFinalCleanup');

      const result = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Verify batch-level processing still occurs
      expect(punctuationSpy).toHaveBeenCalled();
      expect(capitalizationSpy).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalled();

      // Result should be properly formatted
      expect(result.translatedText).toBeDefined();
      expect(result.semanticArrays).toBeDefined();

      // Cleanup spies
      punctuationSpy.mockRestore();
      capitalizationSpy.mockRestore();
      cleanupSpy.mockRestore();
    });

    test('should maintain progress reporting during parallel processing', async () => {
      const testText = '句子一。句子二。句子三。句子四。句子五。'.repeat(2);

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

      // Progress updates should have required fields
      progressUpdates.forEach((update) => {
        expect(update).toHaveProperty('currentBatch');
        expect(update).toHaveProperty('totalBatches');
        expect(update).toHaveProperty('completedChunks');
        expect(update).toHaveProperty('totalChunks');
        expect(update).toHaveProperty('partialTranslation');
        expect(update).toHaveProperty('semanticArrays');
      });
    });
  });

  describe('Performance Characteristics', () => {
    test('should show performance improvement with parallel processing', async () => {
      // Skip this test if running in low-performance environment
      if (engine.calculateMaxTokensForDevice() < 25000) {
        console.log('Skipping performance test on low-memory device');
        return;
      }

      const testText = '性能测试句子。'.repeat(20); // Create substantial workload

      // Measure sequential processing time
      const sequentialStart = performance.now();
      await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: false,
      });
      const sequentialTime = performance.now() - sequentialStart;

      // Measure parallel processing time
      const parallelStart = performance.now();
      await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });
      const parallelTime = performance.now() - parallelStart;

      console.log(`Sequential: ${sequentialTime}ms, Parallel: ${parallelTime}ms`);

      // Parallel should be faster or at least not significantly slower
      // Allow 20% margin for test variability and setup overhead
      expect(parallelTime).toBeLessThan(sequentialTime * 1.2);
    }, 30000); // 30 second timeout for performance test
  });

  describe('Error Recovery', () => {
    test('should recover from partial batch failures', async () => {
      const testText = '正常文本。失败文本fail。正常文本。另一个正常文本。';

      // Mock translateDirectly to fail intermittently
      const originalTranslateDirectly = engine.translateDirectly;
      engine.translateDirectly = vi.fn().mockImplementation((content, options) => {
        if (content.includes('fail')) {
          throw new Error('Simulated intermittent failure');
        }
        return originalTranslateDirectly.call(engine, content, options);
      });

      const result = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Should complete translation despite partial failures
      expect(result.translatedText).toBeDefined();
      expect(result.translatedText.length).toBeGreaterThan(0);

      // Should not contain undefined or error text
      expect(result.translatedText).not.toContain('undefined');
      expect(result.translatedText).not.toContain('Error');

      // Restore original method
      engine.translateDirectly = originalTranslateDirectly;
    });
  });

  describe('Memory Constraint Handling', () => {
    test('should respect device memory limits', () => {
      // Mock low memory device
      const originalCalculateMax = engine.calculateMaxTokensForDevice;
      engine.calculateMaxTokensForDevice = vi.fn(() => 5000); // Very low memory

      engine.initializeParallelProcessing();

      expect(engine.parallelConfig.enableParallelChunks).toBe(false);
      expect(engine.parallelConfig.maxParallelChunks).toBe(1);

      // Restore original method
      engine.calculateMaxTokensForDevice = originalCalculateMax;
    });
  });
});
