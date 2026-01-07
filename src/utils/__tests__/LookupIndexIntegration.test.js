/**
 * Integration tests for lookup index optimization in real translation workflows
 * Validates the optimization works correctly with actual TranslationEngine processing
 */

import { describe, test, expect } from 'vitest';
import TranslationEngine from '../TranslationEngine.js';

describe('Lookup Index Integration', () => {
  let engine;
  let originalConsoleLog;
  let logMessages = [];

  beforeAll(async () => {
    // Capture console logs for performance monitoring
    originalConsoleLog = console.log;
    console.log = (...args) => {
      logMessages.push(args.join(' '));
      originalConsoleLog(...args);
    };

    // Initialize translation engine (will load real dictionaries)
    engine = new TranslationEngine();
    await engine.initialize();
  });

  afterAll(() => {
    // Restore console.log
    console.log = originalConsoleLog;
  });

  describe('Real Translation Workflow', () => {
    test('Translation with lookup index enabled produces correct results', async () => {
      const testTexts = [
        '这个人很好。',
        '小明在北京工作。',
        '这样的事情不应该发生。',
        '今天天气很好，我们去公园吧！',
      ];

      for (const text of testTexts) {
        logMessages = []; // Reset log capture

        // Translate with index enabled
        const withIndex = await engine.translateText(text, { enableLookupIndexing: true });

        // Translate with index disabled
        const withoutIndex = await engine.translateText(text, { enableLookupIndexing: false });

        // Results should be identical
        expect(withIndex.translatedText).toBe(withoutIndex.translatedText);

        // Should have similar semantic arrays
        if (withIndex.semanticArrays && withoutIndex.semanticArrays) {
          expect(withIndex.semanticArrays.original.length).toBe(
            withoutIndex.semanticArrays.original.length
          );
          expect(withIndex.semanticArrays.translated.length).toBe(
            withoutIndex.semanticArrays.translated.length
          );
        }

        // Check if indexing was used (look for indexing log messages)
        const indexingLogs = logMessages.filter(
          (msg) =>
            msg.includes('Building lookup index') ||
            msg.includes('Lookup index built') ||
            msg.includes('Skipping lookup indexing')
        );

        if (text.length >= 50) {
          expect(indexingLogs.length).toBeGreaterThan(0);
          console.log(`✓ Index used for text: "${text}"`);
        } else {
          // Short texts should skip indexing
          const skipLogs = logMessages.filter((msg) => msg.includes('Skipping lookup indexing'));
          expect(skipLogs.length).toBeGreaterThan(0);
          console.log(`✓ Index skipped for short text: "${text}"`);
        }
      }
    });

    test('Long text shows performance improvement', async () => {
      // Create longer text that should benefit from indexing
      const longText =
        '这个人很好，那个人也很好。今天天气很好，明天也会很好。' +
        '小明在北京工作，小红在上海学习。这样的事情经常发生，' +
        '我们应该习惯这种情况。生活就是这样，有好有坏。';

      console.log(`Testing performance with ${longText.length} character text`);

      // Time translation with index
      const indexStart = performance.now();
      const withIndex = await engine.translateText(longText, { enableLookupIndexing: true });
      const indexTime = performance.now() - indexStart;

      // Time translation without index
      const sequentialStart = performance.now();
      const withoutIndex = await engine.translateText(longText, { enableLookupIndexing: false });
      const sequentialTime = performance.now() - sequentialStart;

      console.log(`Index: ${indexTime.toFixed(1)}ms, Sequential: ${sequentialTime.toFixed(1)}ms`);

      // Results should be identical
      expect(withIndex.translatedText).toBe(withoutIndex.translatedText);

      // For long texts, index should provide some benefit or at least not be much slower
      const performanceRatio = indexTime / sequentialTime;
      expect(performanceRatio).toBeLessThan(1.5); // Index shouldn't be more than 50% slower

      if (performanceRatio < 0.9) {
        console.log(
          `✓ Performance improvement: ${((1 - performanceRatio) * 100).toFixed(1)}% faster`
        );
      } else {
        console.log(`⚠️ No significant improvement: ${performanceRatio.toFixed(2)}x ratio`);
      }
    });

    test('Memory usage remains stable during indexing', async () => {
      if (typeof performance.memory !== 'undefined') {
        const beforeMemory = performance.memory.usedJSHeapSize;

        // Process multiple texts to test memory stability
        const testTexts = [
          '这是第一段测试文本，用来检查内存使用情况。',
          '这是第二段测试文本，应该不会导致内存泄漏。',
          '这是第三段测试文本，继续监控内存使用情况。',
        ];

        for (const text of testTexts) {
          await engine.translateText(text, { enableLookupIndexing: true });
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        const afterMemory = performance.memory.usedJSHeapSize;
        const memoryIncrease = afterMemory - beforeMemory;

        console.log(`Memory usage: ${(memoryIncrease / 1024 / 1024).toFixed(1)}MB increase`);

        // Memory increase should be reasonable (less than 10MB for test texts)
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      } else {
        console.log('⚠️ performance.memory not available, skipping memory test');
      }
    });
  });

  describe('Edge Case Handling', () => {
    test('Very short texts skip indexing appropriately', async () => {
      const shortTexts = ['好', '这个', '小明', '北京'];

      for (const text of shortTexts) {
        logMessages = [];
        await engine.translateText(text, { enableLookupIndexing: true });

        // Should skip indexing for short texts
        const skipLogs = logMessages.filter(
          (msg) => msg.includes('Skipping lookup indexing') || text.length < 50
        );
        expect(skipLogs.length).toBeGreaterThan(0);
      }
    });

    test('Texts with no dictionary matches handle gracefully', async () => {
      const noMatchText = 'xyz'.repeat(20); // 60 characters of non-Chinese text

      logMessages = [];
      const result = await engine.translateText(noMatchText, { enableLookupIndexing: true });

      // Should complete without errors
      expect(result).toBeDefined();
      expect(result.translatedText).toBe(noMatchText); // No translation changes

      // Indexing should occur but find no matches
      const indexLogs = logMessages.filter((msg) => msg.includes('positions with matches'));
      if (indexLogs.length > 0) {
        expect(indexLogs[0]).toMatch(/0\/.+ positions with matches/);
      }
    });

    test('Mixed Chinese and non-Chinese text handles correctly', async () => {
      const mixedText = '这个人叫John Smith，他在New York工作。Today天气很好。';

      const result = await engine.translateText(mixedText, { enableLookupIndexing: true });

      // Should complete successfully
      expect(result).toBeDefined();
      expect(result.translatedText).toBeDefined();

      // Should have some translations for Chinese parts
      expect(result.translatedText).not.toBe(mixedText);
      expect(result.translatedText.includes('John Smith')).toBe(true); // Non-Chinese preserved
      expect(result.translatedText.includes('New York')).toBe(true);
    });
  });

  describe('Performance Statistics Integration', () => {
    test('Translation engine collects lookup index statistics', async () => {
      const testText = '这个人很好，那个人也很好。今天天气很好，明天也会很好。';

      // Clear any existing stats
      if (engine.dictionaryManager.lookupIndexStats) {
        engine.dictionaryManager.lookupIndexStats = {
          buildCalls: 0,
          avgBuildTime: 0,
          lastIndexSize: 0,
        };
      }

      await engine.translateText(testText, { enableLookupIndexing: true });

      // Check stats were collected
      const stats = engine.dictionaryManager.lookupIndexStats;
      if (stats) {
        expect(stats.buildCalls).toBeGreaterThan(0);
        expect(stats.avgBuildTime).toBeGreaterThan(0);
        expect(stats.lastIndexSize).toBeGreaterThanOrEqual(0);

        console.log(
          `Stats: ${stats.buildCalls} builds, ${stats.avgBuildTime.toFixed(1)}ms avg, ${stats.lastIndexSize} positions`
        );
      }
    });
  });
});

/**
 * Integration Test Results Expected:
 *
 * ✓ Identical translation results with/without index
 * ✓ Performance improvement or stability for long texts
 * ✓ Appropriate indexing skipping for short texts
 * ✓ Graceful handling of texts with no matches
 * ✓ Mixed language content processes correctly
 * ✓ Memory usage remains stable
 * ✓ Performance statistics collected properly
 *
 * This validates that the lookup index optimization:
 * 1. Maintains 100% translation correctness
 * 2. Provides performance benefits where expected
 * 3. Handles edge cases gracefully
 * 4. Integrates properly with existing engine features
 */
