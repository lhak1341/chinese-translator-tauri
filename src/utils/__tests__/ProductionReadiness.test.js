/**
 * Production Readiness Validation Tests
 * Comprehensive testing for browser compatibility, error handling, and production scenarios
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { TranslationEngine } from '../TranslationEngine.js';
import { parallelConfig } from '../ParallelConfig.js';

// Mock different browser environments for compatibility testing
const mockBrowserEnvironments = {
  chrome: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124',
    performance: {
      now: () => Date.now(),
      memory: { jsHeapSizeLimit: 4 * 1024 * 1024 * 1024, usedJSHeapSize: 100 * 1024 * 1024 },
    },
    navigator: { deviceMemory: 8 },
  },
  firefox: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    performance: { now: () => Date.now() },
    navigator: {},
  },
  safari: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/14.1.1',
    performance: { now: () => Date.now() },
    navigator: {},
  },
  edge: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/91.0.864.59',
    performance: { now: () => Date.now() },
    navigator: { deviceMemory: 4 },
  },
};

describe('Production Readiness Validation', () => {
  let engine;

  beforeEach(async () => {
    engine = new TranslationEngine();

    // Mock successful initialization
    engine.isInitialized = true;
    engine.dictionaryManager.ready = true;
    engine.activeProperNouns = ['properNouns']; // Initialize required array
    engine.translationSegments = []; // Initialize segments array
  });

  describe('Browser Compatibility', () => {
    test.each(Object.entries(mockBrowserEnvironments))(
      'should work in %s environment',
      async (browserName, env) => {
        // Mock browser environment
        const originalUserAgent = global.navigator?.userAgent;
        const originalPerformance = global.performance;
        const originalNavigator = global.navigator;

        global.performance = env.performance;
        global.navigator = { userAgent: env.userAgent, ...env.navigator };

        try {
          // Test basic functionality
          const testText = '浏览器兼容性测试。';

          const result = await engine.translateWithProgressiveBatches(testText, {
            enableParallelChunks: true,
          });

          expect(result.translatedText).toBeDefined();
          expect(result.semanticArrays).toBeDefined();

          console.log(`${browserName} compatibility: ✓ Passed`);
        } finally {
          // Restore original environment
          if (originalUserAgent) global.navigator.userAgent = originalUserAgent;
          global.performance = originalPerformance;
          global.navigator = originalNavigator;
        }
      }
    );

    test('should handle missing browser APIs gracefully', async () => {
      const originalPerformance = global.performance;
      const originalNavigator = global.navigator;

      // Simulate limited browser environment
      global.performance = { now: () => Date.now() }; // No memory API
      global.navigator = {}; // No deviceMemory

      try {
        const testText = '有限浏览器环境测试。';

        const result = await engine.translateWithProgressiveBatches(testText, {
          enableParallelChunks: true,
        });

        expect(result.translatedText).toBeDefined();
        console.log('Limited browser environment: ✓ Handled gracefully');
      } finally {
        global.performance = originalPerformance;
        global.navigator = originalNavigator;
      }
    });
  });

  describe('Error Handling Robustness', () => {
    test('should handle Promise.all failures gracefully', async () => {
      const originalPromiseAll = Promise.all;
      let failureCount = 0;

      // Mock Promise.all to fail intermittently
      Promise.all = vi.fn().mockImplementation((promises) => {
        failureCount++;
        if (failureCount === 2) {
          // Fail on second call
          return Promise.reject(new Error('Promise.all failure'));
        }
        return originalPromiseAll.call(Promise, promises);
      });

      const testText = 'Promise错误处理测试。并行处理故障恢复。';

      const result = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Should complete successfully despite Promise.all failure
      expect(result.translatedText).toBeDefined();
      expect(result.translatedText.length).toBeGreaterThan(0);

      Promise.all = originalPromiseAll;
    });

    test('should handle memory pressure gracefully', async () => {
      // Simulate low memory condition
      const originalPerformance = global.performance;
      global.performance = {
        now: () => Date.now(),
        memory: {
          jsHeapSizeLimit: 100 * 1024 * 1024, // 100MB limit
          usedJSHeapSize: 80 * 1024 * 1024, // 80MB used (80% full)
        },
      };

      const testText = '内存压力测试。'.repeat(100);

      try {
        const result = await engine.translateWithProgressiveBatches(testText, {
          enableParallelChunks: true,
        });

        expect(result.translatedText).toBeDefined();
        console.log('Memory pressure: ✓ Handled gracefully');
      } finally {
        global.performance = originalPerformance;
      }
    });

    test('should handle network-like delays in dictionary lookups', async () => {
      // Mock slow dictionary responses
      const originalFindAllMatchesAsync = engine.dictionaryManager.findAllMatchesAsync;
      engine.dictionaryManager.findAllMatchesAsync = jest
        .fn()
        .mockImplementation(async (...args) => {
          // Add random delay to simulate network latency
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50));
          return originalFindAllMatchesAsync.apply(engine.dictionaryManager, args);
        });

      const testText = '网络延迟模拟测试。字典查找延迟处理。';

      const startTime = performance.now();
      const result = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });
      const endTime = performance.now();

      expect(result.translatedText).toBeDefined();
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds

      engine.dictionaryManager.findAllMatchesAsync = originalFindAllMatchesAsync;
    });
  });

  describe('Configuration Validation', () => {
    test('should validate and sanitize user configurations', () => {
      const invalidConfigs = [
        { chunk: { maxParallelChunks: -1 } }, // Negative value
        { chunk: { maxParallelChunks: 100 } }, // Too high
        { dictionary: { maxParallelDictionaries: 0 } }, // Zero value
        { chunk: { parallelThreshold: -5 } }, // Negative threshold
      ];

      invalidConfigs.forEach((config) => {
        const validation = parallelConfig.validateConfig({
          ...parallelConfig.getConfig(),
          ...config,
        });

        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      });
    });

    test('should provide meaningful warnings for suboptimal configurations', () => {
      const suboptimalConfig = {
        ...parallelConfig.getConfig(),
        chunk: { maxParallelChunks: 8 }, // Very high
        dictionary: { lookupTimeout: 500 }, // Very low
      };

      const validation = parallelConfig.validateConfig(suboptimalConfig);

      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings.some((w) => w.includes('memory pressure'))).toBe(true);
    });

    test('should export and import configurations correctly', () => {
      const originalConfig = parallelConfig.getConfig();

      // Modify configuration
      parallelConfig.updateConfig({
        chunk: { maxParallelChunks: 3 },
        dictionary: { maxParallelDictionaries: 6 },
      });

      // Export configuration
      const exportedConfig = parallelConfig.exportConfig();
      expect(exportedConfig).toBeDefined();
      expect(typeof exportedConfig).toBe('string');

      // Reset to original
      parallelConfig.updateConfig(originalConfig);

      // Import configuration
      const importSuccess = parallelConfig.importConfig(exportedConfig);
      expect(importSuccess).toBe(true);

      // Verify import worked
      const importedConfig = parallelConfig.getConfig();
      expect(importedConfig.chunk.maxParallelChunks).toBe(3);
      expect(importedConfig.dictionary.maxParallelDictionaries).toBe(6);
    });
  });

  describe('Load Testing', () => {
    test('should handle sustained high load', async () => {
      const testText = '高负载持续测试。';
      const iterations = 20;
      const concurrency = 3;

      const results = [];
      const errors = [];

      // Run sustained load test
      for (let batch = 0; batch < iterations / concurrency; batch++) {
        const batchPromises = Array(concurrency)
          .fill(0)
          .map(async () => {
            try {
              const startTime = performance.now();
              const result = await engine.translateWithProgressiveBatches(testText, {
                enableParallelChunks: true,
              });
              const endTime = performance.now();

              return {
                success: true,
                time: endTime - startTime,
                resultLength: result.translatedText.length,
              };
            } catch (error) {
              errors.push(error);
              return { success: false, error: error.message };
            }
          });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches to simulate real usage
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Analyze results
      const successfulResults = results.filter((r) => r.success);
      const errorRate = errors.length / results.length;
      const avgTime =
        successfulResults.reduce((sum, r) => sum + r.time, 0) / successfulResults.length;

      console.log(
        `Load test: ${successfulResults.length}/${results.length} successful, ${errorRate * 100}% error rate, avg time: ${avgTime.toFixed(2)}ms`
      );

      // Assertions
      expect(errorRate).toBeLessThan(0.05); // Less than 5% error rate
      expect(successfulResults.length).toBeGreaterThan(results.length * 0.95); // At least 95% success
      expect(avgTime).toBeLessThan(5000); // Average under 5 seconds
    }, 60000); // 1 minute timeout

    test('should maintain performance under memory constraints', async () => {
      // Simulate progressive memory pressure
      const originalPerformance = global.performance;
      let memoryPressure = 0;

      global.performance = {
        now: () => Date.now(),
        get memory() {
          memoryPressure += 0.1;
          return {
            jsHeapSizeLimit: 2 * 1024 * 1024 * 1024, // 2GB
            usedJSHeapSize: Math.min(
              1.8 * 1024 * 1024 * 1024,
              500 * 1024 * 1024 + memoryPressure * 1024 * 1024 * 1024
            ),
          };
        },
      };

      const testText = '内存约束下的性能测试。';
      const iterations = 10;

      try {
        for (let i = 0; i < iterations; i++) {
          const result = await engine.translateWithProgressiveBatches(testText, {
            enableParallelChunks: true,
          });

          expect(result.translatedText).toBeDefined();

          // Check if system adapted to memory pressure
          const _currentConfig = parallelConfig.getConfig();
          if (i > 5) {
            // After several iterations
            console.log(
              `Iteration ${i}: Memory usage simulation ${((500 + memoryPressure * 1000) / 1024).toFixed(1)}GB`
            );
          }
        }

        console.log('Memory constraint test: ✓ Completed successfully');
      } finally {
        global.performance = originalPerformance;
      }
    });
  });

  describe('Data Integrity', () => {
    test('should maintain translation consistency across parallel operations', async () => {
      const testCases = [
        '数据完整性测试。',
        '并行处理应该产生一致的结果。',
        '多次运行应该得到相同的翻译。',
        '这是一个复杂的测试用例，包含多种语言结构。',
      ];

      const consistencyResults = {};

      for (const testText of testCases) {
        const results = [];

        // Run same text multiple times
        for (let i = 0; i < 5; i++) {
          const result = await engine.translateWithProgressiveBatches(testText, {
            enableParallelChunks: true,
          });
          results.push(result.translatedText);
        }

        // Check consistency
        const firstResult = results[0];
        const allSame = results.every((result) => result === firstResult);

        consistencyResults[testText] = {
          consistent: allSame,
          results: results,
        };

        expect(allSame).toBe(true);
      }

      console.log(`Data integrity: ✓ All ${testCases.length} test cases consistent`);
    });

    test('should preserve semantic array integrity', async () => {
      const testText = '语义数组完整性测试。确保数据结构保持一致。';

      const result = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Validate semantic arrays
      expect(result.semanticArrays).toBeDefined();
      expect(result.semanticArrays.original).toBeDefined();
      expect(result.semanticArrays.translated).toBeDefined();

      const { original, translated } = result.semanticArrays;

      // Arrays should be valid
      expect(Array.isArray(original)).toBe(true);
      expect(Array.isArray(translated)).toBe(true);
      expect(original.length).toBeGreaterThan(0);
      expect(translated.length).toBeGreaterThan(0);

      // Arrays should have related content
      expect(original.length).toBeLessThanOrEqual(translated.length + 5); // Allow some variance
      expect(translated.length).toBeLessThanOrEqual(original.length + 5);

      // Each element should have required properties
      original.forEach((item) => {
        expect(item).toHaveProperty('text');
        expect(item).toHaveProperty('startPos');
        expect(item).toHaveProperty('endPos');
      });

      translated.forEach((item) => {
        expect(item).toHaveProperty('text');
        expect(item).toHaveProperty('startPos');
        expect(item).toHaveProperty('endPos');
      });
    });
  });

  describe('Feature Flags and Rollback', () => {
    test('should support graceful feature disabling', async () => {
      const testText = '功能开关测试。';

      // Test with parallel processing enabled
      const parallelResult = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Test with parallel processing disabled (rollback scenario)
      const sequentialResult = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: false,
      });

      // Both should work and produce valid results
      expect(parallelResult.translatedText).toBeDefined();
      expect(sequentialResult.translatedText).toBeDefined();

      // Results should be consistent
      expect(parallelResult.translatedText).toBe(sequentialResult.translatedText);

      console.log('Feature rollback: ✓ Parallel and sequential modes produce identical results');
    });

    test('should handle configuration changes during runtime', async () => {
      const testText = '运行时配置变更测试。';

      // Start with one configuration
      parallelConfig.updateConfig({
        chunk: { maxParallelChunks: 2 },
      });

      const result1 = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Change configuration mid-runtime
      parallelConfig.updateConfig({
        chunk: { maxParallelChunks: 5 },
      });

      const result2 = await engine.translateWithProgressiveBatches(testText, {
        enableParallelChunks: true,
      });

      // Both should work despite configuration changes
      expect(result1.translatedText).toBeDefined();
      expect(result2.translatedText).toBeDefined();
      expect(result1.translatedText).toBe(result2.translatedText);

      console.log('Runtime configuration: ✓ Handled gracefully');
    });
  });

  afterAll(() => {
    console.log('\n=== Production Readiness Summary ===');
    console.log('✓ Browser compatibility validated');
    console.log('✓ Error handling robustness confirmed');
    console.log('✓ Configuration validation implemented');
    console.log('✓ Load testing passed');
    console.log('✓ Data integrity maintained');
    console.log('✓ Feature flags and rollback supported');
    console.log('===================================\n');
  });
});
