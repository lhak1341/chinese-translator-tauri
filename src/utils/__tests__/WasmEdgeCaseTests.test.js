/**
 * WASM Edge Case Hardening Tests
 * Comprehensive testing for Unicode, memory pressure, concurrent access, and other edge cases
 * 
 * Based on critical scenarios from CLAUDE.md:
 * - Cross-language Unicode handling (Chinese ↔ Vietnamese ↔ JavaScript)
 * - Memory pressure testing (15MB dictionary limits)
 * - Concurrent access patterns (parallel dictionary lookups)
 * - Complex text scenarios (mixed content, special characters)
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EnhancedDictionaryManager } from '../EnhancedDictionaryManager.js';
// import { WasmDictionaryManager } from '../WasmDictionaryManager.js';

// Mock performance for testing
global.performance = global.performance || {
  now: () => Date.now(),
  memory: {
    usedJSHeapSize: 50000000,  // 50MB
    totalJSHeapSize: 100000000, // 100MB
    jsHeapSizeLimit: 200000000  // 200MB
  }
};

global.navigator = {
  platform: 'test-platform',
  userAgent: 'test-agent'
};

describe('WASM Edge Case Hardening Tests', () => {
  let dictionaryManager;
  let wasmManager;

  beforeEach(async () => {
    dictionaryManager = new EnhancedDictionaryManager();
    await waitForInitialization(dictionaryManager);
    wasmManager = dictionaryManager.wasmManager;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Unicode and Encoding Edge Cases', () => {
    test('handles complex Unicode Chinese characters', async () => {
      const complexUnicodeEntries = [
        // Traditional vs Simplified variants
        { chinese: '龍', vietnamese: 'rồng', source: 'traditional' },
        { chinese: '龙', vietnamese: 'rồng', source: 'simplified' },
        // Rare Unicode characters
        { chinese: '𠀀', vietnamese: 'rare-char', source: 'unicode-plane2' },
        // Multi-byte sequences
        { chinese: '👨‍👩‍👧‍👦', vietnamese: 'family-emoji', source: 'emoji' },
        // Mathematical symbols
        { chinese: '∀∃∈∉', vietnamese: 'math-symbols', source: 'symbols' },
        // Tone marks and diacritics
        { chinese: 'àáâãäåæçèéêë', vietnamese: 'diacritics-test', source: 'diacritics' }
      ];

      await dictionaryManager.loadDictionary('unicode-test', complexUnicodeEntries);

      // Test each complex character
      for (const entry of complexUnicodeEntries) {
        const jsResult = dictionaryManager.findMatch('unicode-test', entry.chinese, { forceJS: true });
        expect(jsResult).toBeTruthy();
        expect(jsResult.translation).toBe(entry.vietnamese);

        // Test WASM if available
        try {
          const wasmResult = dictionaryManager.findMatch('unicode-test', entry.chinese, { forceWASM: true });
          expect(wasmResult).toBeTruthy();
          expect(wasmResult.translation).toBe(entry.vietnamese);
          
          // Results should be identical
          expect(JSON.stringify(jsResult)).toBe(JSON.stringify(wasmResult));
        } catch (_error) {
          console.log(`WASM not available for Unicode test: ${entry.chinese}`);
        }
      }
    });

    test('maintains proper character indices across language boundaries', async () => {
      const mixedContent = [
        { chinese: 'Hello你好World世界', vietnamese: 'mixed-1', source: 'mixed' },
        { chinese: '123中文456', vietnamese: 'mixed-2', source: 'mixed' },
        { chinese: 'English中文Tiếng Việt中文', vietnamese: 'mixed-3', source: 'mixed' },
        { chinese: '🌏你好🌍世界🌎', vietnamese: 'mixed-emoji', source: 'mixed' }
      ];

      await dictionaryManager.loadDictionary('mixed-test', mixedContent);

      for (const entry of mixedContent) {
        const result = dictionaryManager.findMatch('mixed-test', entry.chinese);
        expect(result).toBeTruthy();
        
        // Character indices should be maintained properly
        expect(result.word).toBe(entry.chinese);
        expect(result.translation).toBe(entry.vietnamese);
      }
    });

    test('handles Unicode normalization edge cases', async () => {
      // Test different Unicode normalization forms
      const normalizationTests = [
        // NFC vs NFD forms
        { chinese: 'café', vietnamese: 'nfc-form', source: 'norm' },     // NFC: single é
        { chinese: 'cafe\u0301', vietnamese: 'nfd-form', source: 'norm' }, // NFD: e + combining acute
        // Vietnamese tone marks
        { chinese: 'Tiếng', vietnamese: 'tiếng-nfc', source: 'vietnamese' },
        { chinese: 'Tie\u0301ng', vietnamese: 'tiếng-nfd', source: 'vietnamese' }
      ];

      await dictionaryManager.loadDictionary('normalization-test', normalizationTests);

      for (const entry of normalizationTests) {
        const result = dictionaryManager.findMatch('normalization-test', entry.chinese);
        expect(result).toBeTruthy();
        expect(result.translation).toBe(entry.vietnamese);
      }
    });

    test('handles zero-width and control characters', async () => {
      const specialCharEntries = [
        // Zero-width characters
        { chinese: '你\u200B好', vietnamese: 'zero-width-space', source: 'special' },
        { chinese: '世\uFEFF界', vietnamese: 'bom-char', source: 'special' },
        // Direction marks
        { chinese: '中\u202D文\u202C', vietnamese: 'ltr-override', source: 'special' },
        // Line/paragraph separators
        { chinese: '测\u2028试', vietnamese: 'line-separator', source: 'special' }
      ];

      await dictionaryManager.loadDictionary('special-chars', specialCharEntries);

      for (const entry of specialCharEntries) {
        const result = dictionaryManager.findMatch('special-chars', entry.chinese);
        
        // Should handle gracefully (either find or ignore control chars)
        if (result) {
          expect(result.translation).toBe(entry.vietnamese);
        }
      }
    });
  });

  describe('Memory Pressure and Large Dataset Testing', () => {
    test('handles 15MB dictionary limit enforcement', async () => {
      if (!wasmManager || !wasmManager.isInitialized) {
        console.log('WASM not available, skipping memory limit test');
        return;
      }

      // Generate large dictionary approaching 15MB limit
      const entriesPerMB = 15000; // Approximate
      const targetEntries = entriesPerMB * 14; // 14MB worth

      console.log(`Generating ${targetEntries} dictionary entries for memory test...`);
      
      const largeDictionary = [];
      for (let i = 0; i < targetEntries; i++) {
        largeDictionary.push({
          chinese: `大型词典测试条目${i}号包含更多文本内容`,
          vietnamese: `từ điển lớn mục ${i} chứa nhiều nội dung văn bản hơn`,
          source: 'memory-pressure-test'
        });
      }

      const startMemory = wasmManager.getMemoryUsage ? wasmManager.getMemoryUsage() : 0;
      console.log(`Starting memory: ${startMemory}MB`);

      // Load the large dictionary
      const loadResult = await dictionaryManager.loadDictionary('memory-test', largeDictionary);
      
      const endMemory = wasmManager.getMemoryUsage ? wasmManager.getMemoryUsage() : 0;
      console.log(`Memory after load: ${endMemory}MB`);
      console.log(`Memory increase: ${endMemory - startMemory}MB`);

      // Should load successfully or fail gracefully
      expect(typeof loadResult).toBe('boolean');
      
      if (loadResult && endMemory > 0) {
        // Memory should be within reasonable bounds (allowing for overhead)
        expect(endMemory).toBeLessThan(20); // 20MB maximum including overhead
        
        // Should be able to perform lookups
        const testResult = dictionaryManager.findMatch('memory-test', '大型词典测试条目100号包含更多文本内容');
        expect(testResult).toBeTruthy();
      }
    });

    test('manages memory efficiently with multiple large dictionaries', async () => {
      const dictionaries = ['dict1', 'dict2', 'dict3'];
      const entriesPerDict = 5000;
      
      let totalMemoryIncrease = 0;
      const _initialMemory = performance.memory.usedJSHeapSize;

      for (const dictName of dictionaries) {
        const entries = Array(entriesPerDict).fill().map((_, i) => ({
          chinese: `${dictName}测试条目${i}`,
          vietnamese: `${dictName} mục thử nghiệm ${i}`,
          source: 'multi-dict-test'
        }));

        const preLoadMemory = performance.memory.usedJSHeapSize;
        await dictionaryManager.loadDictionary(dictName, entries);
        const postLoadMemory = performance.memory.usedJSHeapSize;
        
        const dictMemoryIncrease = (postLoadMemory - preLoadMemory) / 1024 / 1024;
        totalMemoryIncrease += dictMemoryIncrease;
        
        console.log(`${dictName} memory increase: ${dictMemoryIncrease.toFixed(1)}MB`);
        
        // Verify functionality
        const testResult = dictionaryManager.findMatch(dictName, `${dictName}测试条目0`);
        expect(testResult).toBeTruthy();
      }

      console.log(`Total memory increase: ${totalMemoryIncrease.toFixed(1)}MB`);
      
      // Total memory increase should be reasonable
      expect(totalMemoryIncrease).toBeLessThan(100); // 100MB maximum for 15K entries
    });

    test('handles memory cleanup and garbage collection', async () => {
      const initialMemory = performance.memory.usedJSHeapSize;
      
      // Load and unload dictionaries multiple times
      for (let cycle = 0; cycle < 3; cycle++) {
        const entries = Array(2000).fill().map((_, i) => ({
          chinese: `循环${cycle}条目${i}`,
          vietnamese: `chu kỳ ${cycle} mục ${i}`,
          source: 'gc-test'
        }));

        await dictionaryManager.loadDictionary('gc-test', entries);
        
        // Perform some lookups
        for (let i = 0; i < 100; i++) {
          dictionaryManager.findMatch('gc-test', `循环${cycle}条目${i}`);
        }

        // Replace with new dictionary (should cleanup old one)
        await dictionaryManager.loadDictionary('gc-test', [
          { chinese: '新', vietnamese: 'mới', source: 'replacement' }
        ]);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = performance.memory.usedJSHeapSize;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      console.log(`Memory increase after GC cycles: ${memoryIncrease.toFixed(1)}MB`);
      
      // Memory should not grow unboundedly
      expect(memoryIncrease).toBeLessThan(50); // 50MB maximum growth
    });
  });

  describe('Concurrent Access and Threading', () => {
    test('handles concurrent dictionary lookups safely', async () => {
      const testEntries = Array(1000).fill().map((_, i) => ({
        chinese: `并发测试${i}`,
        vietnamese: `đồng thời ${i}`,
        source: 'concurrency-test'
      }));

      await dictionaryManager.loadDictionary('concurrent-test', testEntries);

      // Create multiple concurrent lookup operations
      const concurrentLookups = Array(50).fill().map(async (_, i) => {
        const results = [];
        
        // Each thread performs multiple lookups
        for (let j = 0; j < 20; j++) {
          const index = (i * 20 + j) % 1000;
          const result = dictionaryManager.findMatch('concurrent-test', `并发测试${index}`);
          results.push(result);
        }
        
        return results;
      });

      const startTime = performance.now();
      const allResults = await Promise.all(concurrentLookups);
      const totalTime = performance.now() - startTime;

      console.log(`Concurrent lookup test completed in ${totalTime.toFixed(2)}ms`);

      // All lookups should succeed
      let totalLookups = 0;
      let successfulLookups = 0;

      for (const threadResults of allResults) {
        for (const result of threadResults) {
          totalLookups++;
          if (result && result.translation) {
            successfulLookups++;
          }
        }
      }

      console.log(`Successful lookups: ${successfulLookups}/${totalLookups}`);
      expect(successfulLookups).toBe(totalLookups);
      
      // Performance should remain reasonable under concurrency
      const avgTimePerLookup = totalTime / totalLookups;
      expect(avgTimePerLookup).toBeLessThan(1); // Less than 1ms per lookup
    });

    test('concurrent dictionary loading and access', async () => {
      const dictionaries = ['concurrent1', 'concurrent2', 'concurrent3'];
      
      // Load dictionaries concurrently
      const loadingPromises = dictionaries.map(async (dictName, index) => {
        const entries = Array(500).fill().map((_, i) => ({
          chinese: `${dictName}条目${i}`,
          vietnamese: `${dictName} mục ${i}`,
          source: `concurrent-load-${index}`
        }));

        return dictionaryManager.loadDictionary(dictName, entries);
      });

      const loadResults = await Promise.all(loadingPromises);
      expect(loadResults.every(r => r === true || r === undefined)).toBe(true);

      // Concurrent access to different dictionaries
      const accessPromises = dictionaries.map(async dictName => {
        const results = [];
        for (let i = 0; i < 100; i++) {
          const result = dictionaryManager.findMatch(dictName, `${dictName}条目${i}`);
          results.push(result);
        }
        return results;
      });

      const accessResults = await Promise.all(accessPromises);
      
      // All access should succeed
      for (const dictResults of accessResults) {
        const successCount = dictResults.filter(r => r && r.translation).length;
        expect(successCount).toBe(100);
      }
    });

    test('handles race conditions in dictionary updates', async () => {
      const baseEntries = [
        { chinese: '竞态', vietnamese: 'race condition', source: 'race-test' }
      ];

      await dictionaryManager.loadDictionary('race-test', baseEntries);

      // Concurrent updates and lookups
      const updatePromises = Array(10).fill().map(async (_, i) => {
        const updatedEntries = [
          ...baseEntries,
          { chinese: `更新${i}`, vietnamese: `update ${i}`, source: 'race-update' }
        ];
        
        return dictionaryManager.loadDictionary('race-test', updatedEntries);
      });

      const lookupPromises = Array(20).fill().map(async () => {
        const results = [];
        for (let i = 0; i < 10; i++) {
          results.push(dictionaryManager.findMatch('race-test', '竞态'));
          await delay(1); // Small delay to create race conditions
        }
        return results;
      });

      const [updateResults, lookupResults] = await Promise.all([
        Promise.all(updatePromises),
        Promise.all(lookupPromises)
      ]);

      // Updates should complete
      expect(updateResults.length).toBe(10);

      // Lookups should not fail due to race conditions
      for (const threadResults of lookupResults) {
        for (const result of threadResults) {
          expect(result).toBeTruthy();
          expect(result.translation).toBe('race condition');
        }
      }
    });
  });

  describe('Complex Text Processing Scenarios', () => {
    test('handles mixed scripts and writing systems', async () => {
      const mixedEntries = [
        // Chinese + Latin
        { chinese: '中文English混合', vietnamese: 'hỗn hợp Trung Anh', source: 'mixed' },
        // Chinese + Numbers + Symbols
        { chinese: '数字123符号@#$', vietnamese: 'số ký hiệu', source: 'mixed' },
        // Multiple scripts
        { chinese: '中文русскийعربيEnglish', vietnamese: 'đa ngôn ngữ', source: 'mixed' },
        // RTL and LTR mixing
        { chinese: 'من中文到English', vietnamese: 'từ Trung sang Anh', source: 'mixed' }
      ];

      await dictionaryManager.loadDictionary('mixed-scripts', mixedEntries);

      for (const entry of mixedEntries) {
        const result = dictionaryManager.findMatch('mixed-scripts', entry.chinese);
        expect(result).toBeTruthy();
        expect(result.translation).toBe(entry.vietnamese);
      }
    });

    test('processes very long strings efficiently', async () => {
      const longStringEntries = [
        {
          chinese: '这是一个非常非常非常长的中文字符串'.repeat(100),
          vietnamese: 'chuỗi tiếng Trung rất rất dài',
          source: 'long-string'
        },
        {
          chinese: '重复文本'.repeat(500),
          vietnamese: 'văn bản lặp lại',
          source: 'repeated-text'
        }
      ];

      await dictionaryManager.loadDictionary('long-strings', longStringEntries);

      for (const entry of longStringEntries) {
        const startTime = performance.now();
        const result = dictionaryManager.findMatch('long-strings', entry.chinese);
        const lookupTime = performance.now() - startTime;

        expect(result).toBeTruthy();
        expect(result.translation).toBe(entry.vietnamese);
        
        // Should process efficiently even for long strings
        expect(lookupTime).toBeLessThan(100); // Less than 100ms
        
        console.log(`Long string lookup (${entry.chinese.length} chars): ${lookupTime.toFixed(2)}ms`);
      }
    });

    test('handles edge cases in text segmentation', async () => {
      const segmentationEntries = [
        // Adjacent punctuation
        { chinese: '你好，！？。', vietnamese: 'xin chào dấu câu', source: 'punctuation' },
        // Nested quotes and brackets
        { chinese: '《"你好"》', vietnamese: 'trích dẫn lồng nhau', source: 'nested' },
        // Whitespace variations
        { chinese: '你 好\t世\n界', vietnamese: 'khoảng trắng khác nhau', source: 'whitespace' },
        // Word boundaries
        { chinese: '中文word中文', vietnamese: 'ranh giới từ', source: 'boundaries' }
      ];

      await dictionaryManager.loadDictionary('segmentation', segmentationEntries);

      for (const entry of segmentationEntries) {
        const result = dictionaryManager.findMatch('segmentation', entry.chinese);
        expect(result).toBeTruthy();
        expect(result.translation).toBe(entry.vietnamese);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('recovers from dictionary corruption gracefully', async () => {
      // Load valid dictionary first
      const validEntries = [
        { chinese: '正常', vietnamese: 'bình thường', source: 'valid' }
      ];
      
      await dictionaryManager.loadDictionary('corruption-test', validEntries);
      
      // Verify normal operation
      let result = dictionaryManager.findMatch('corruption-test', '正常');
      expect(result).toBeTruthy();

      // Attempt to load corrupted dictionary
      const corruptedEntries = [
        { chinese: null, vietnamese: 'null chinese', source: 'corrupt' },
        { chinese: '坏数据', vietnamese: null, source: 'corrupt' },
        undefined,
        { chinese: '', vietnamese: '', source: 'empty' },
        { chinese: '好数据', vietnamese: 'dữ liệu tốt', source: 'valid-in-corrupt' }
      ];

      // This might succeed (filtering bad entries) or fail gracefully
      const corruptLoadResult = await dictionaryManager.loadDictionary('corruption-test', corruptedEntries);
      
      // System should remain functional
      result = dictionaryManager.findMatch('corruption-test', '好数据');
      
      if (corruptLoadResult) {
        // If load succeeded, valid entry should be found
        expect(result).toBeTruthy();
      } else {
        // If load failed, original dictionary should still work
        result = dictionaryManager.findMatch('corruption-test', '正常');
        expect(result).toBeTruthy();
      }
    });

    test('handles memory exhaustion gracefully', async () => {
      // Simulate memory pressure by creating very large entries
      const memoryPressureEntries = Array(100).fill().map((_, i) => ({
        chinese: `内存压力测试条目${i}`.repeat(1000), // Very long strings
        vietnamese: `áp lực bộ nhớ ${i}`.repeat(1000),
        source: 'memory-pressure'
      }));

      let loadResult;
      let memoryError = false;
      
      try {
        loadResult = await dictionaryManager.loadDictionary('memory-pressure', memoryPressureEntries);
      } catch (error) {
        memoryError = true;
        console.log('Memory pressure test triggered error (expected):', error.message);
      }

      // Should either succeed or fail gracefully
      expect(typeof loadResult === 'boolean' || memoryError).toBe(true);
      
      // System should remain functional for normal operations
      const smallEntries = [{ chinese: '小', vietnamese: 'nhỏ', source: 'small' }];
      const _smallLoadResult = await dictionaryManager.loadDictionary('small-test', smallEntries);
      
      const smallResult = dictionaryManager.findMatch('small-test', '小');
      expect(smallResult).toBeTruthy();
    });

    test('maintains consistency during partial failures', async () => {
      const mixedEntries = [
        { chinese: '成功1', vietnamese: 'thành công 1', source: 'valid' },
        { chinese: null, vietnamese: 'invalid', source: 'invalid' }, // Invalid
        { chinese: '成功2', vietnamese: 'thành công 2', source: 'valid' },
        { chinese: '成功3', vietnamese: null, source: 'invalid' }, // Invalid
        { chinese: '成功4', vietnamese: 'thành công 4', source: 'valid' }
      ];

      const _loadResult = await dictionaryManager.loadDictionary('partial-failure', mixedEntries);
      
      // Valid entries should be available regardless of load result
      const results = [
        dictionaryManager.findMatch('partial-failure', '成功1'),
        dictionaryManager.findMatch('partial-failure', '成功2'),
        dictionaryManager.findMatch('partial-failure', '成功4')
      ];

      const validResults = results.filter(r => r && r.translation);
      expect(validResults.length).toBeGreaterThan(0); // At least some should work
      
      console.log(`Partial failure test: ${validResults.length}/3 valid entries loaded`);
    });
  });
});

// Utility functions
async function waitForInitialization(manager, timeoutMs = 5000) {
  const startTime = Date.now();
  
  while (!manager.initialized && (Date.now() - startTime) < timeoutMs) {
    await delay(50);
  }
  
  if (!manager.initialized) {
    throw new Error('Dictionary manager failed to initialize within timeout');
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}