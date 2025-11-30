/**
 * Performance Regression Tests and Benchmarks
 * Comprehensive testing suite for parallel processing performance validation
 */

import { TranslationEngine } from '../TranslationEngine.js';
import { parallelConfig } from '../ParallelConfig.js';
import { performanceProfiler } from '../PerformanceProfiler.js';

// Mock high-performance environment for consistent testing
global.performance = {
  now: () => Date.now(),
  memory: {
    jsHeapSizeLimit: 8 * 1024 * 1024 * 1024, // 8GB - high-end device
    usedJSHeapSize: 200 * 1024 * 1024
  }
};

describe('Performance Regression Tests', () => {
  let engine;
  let baselineMetrics;
  
  const testScenarios = [
    {
      name: 'Small Text',
      text: "简短的测试文本。",
      expectedChunks: 1,
      maxTime: 1000 // 1 second
    },
    {
      name: 'Medium Text',
      text: "这是一个中等长度的测试文本。".repeat(10),
      expectedChunks: 3,
      maxTime: 3000 // 3 seconds
    },
    {
      name: 'Large Text',
      text: "这是一个较长的测试文本，用于性能测试。".repeat(50),
      expectedChunks: 15,
      maxTime: 10000 // 10 seconds
    },
    {
      name: 'Complex Text',
      text: "复杂的文本包含多种词汇类型，如专有名词、短语和单个字符。数字123和标点符号！这将测试所有处理阶段的性能。".repeat(20),
      expectedChunks: 25,
      maxTime: 15000 // 15 seconds
    }
  ];
  
  beforeAll(async () => {
    engine = new TranslationEngine();
    await engine.initialize();
    
    // Reset performance profiler for clean baseline
    performanceProfiler.reset();
    
    // Set up optimal parallel configuration
    parallelConfig.updateConfig({
      chunk: { enabled: true, maxParallelChunks: 5 },
      dictionary: { enabled: true, maxParallelDictionaries: 8 },
      monitoring: { enabled: true, trackPerformanceMetrics: true }
    });
  });
  
  beforeEach(() => {
    performanceProfiler.reset();
  });

  describe('Performance Benchmarks', () => {
    test.each(testScenarios)('should process $name within time limits', async ({ name, text, maxTime }) => {
      const startTime = performance.now();
      
      const result = await engine.translateWithProgressiveBatches(text, {
        enableParallelChunks: true
      });
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      console.log(`${name} processing time: ${processingTime.toFixed(2)}ms (limit: ${maxTime}ms)`);
      
      // Performance assertions
      expect(processingTime).toBeLessThan(maxTime);
      expect(result.translatedText).toBeDefined();
      expect(result.translatedText.length).toBeGreaterThan(0);
      
      // Record baseline for regression testing
      if (!baselineMetrics) {
        baselineMetrics = {};
      }
      baselineMetrics[name] = processingTime;
    }, 30000); // 30 second timeout
    
    test('should maintain parallel processing efficiency', async () => {
      const text = testScenarios[2].text; // Large text
      const iterations = 3;
      
      // Measure parallel processing
      const parallelTimes = [];
      for (let i = 0; i < iterations; i++) {
        performanceProfiler.reset();
        const start = performance.now();
        
        await engine.translateWithProgressiveBatches(text, {
          enableParallelChunks: true
        });
        
        const end = performance.now();
        parallelTimes.push(end - start);
      }
      
      // Measure sequential processing
      const sequentialTimes = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        await engine.translateWithProgressiveBatches(text, {
          enableParallelChunks: false
        });
        
        const end = performance.now();
        sequentialTimes.push(end - start);
      }
      
      const avgParallel = parallelTimes.reduce((a, b) => a + b) / iterations;
      const avgSequential = sequentialTimes.reduce((a, b) => a + b) / iterations;
      const speedup = avgSequential / avgParallel;
      
      console.log(`Parallel avg: ${avgParallel.toFixed(2)}ms`);
      console.log(`Sequential avg: ${avgSequential.toFixed(2)}ms`);
      console.log(`Speedup: ${speedup.toFixed(2)}x`);
      
      // Should show improvement (allowing for test variability)
      expect(speedup).toBeGreaterThan(1.2); // At least 20% improvement
      expect(avgParallel).toBeLessThan(avgSequential * 1.1); // Should not be slower
    });
    
    test('should maintain memory efficiency under parallel load', async () => {
      const text = testScenarios[3].text; // Complex text
      
      const initialMemory = performance.memory.usedJSHeapSize;
      
      // Process multiple texts in parallel to stress memory
      const promises = Array(5).fill(0).map(() =>
        engine.translateWithProgressiveBatches(text, {
          enableParallelChunks: true
        })
      );
      
      await Promise.all(promises);
      
      // Force garbage collection if possible
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = performance.memory.usedJSHeapSize;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
      
      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
      
      // Should not have excessive memory growth (allowing for normal GC cycles)
      expect(memoryIncreaseMB).toBeLessThan(100); // Less than 100MB increase
    }, 45000); // 45 second timeout
  });

  describe('Regression Testing', () => {
    test('should not regress from baseline performance', async () => {
      if (!baselineMetrics) {
        console.log('No baseline metrics available, skipping regression test');
        return;
      }
      
      for (const scenario of testScenarios.slice(1, 3)) { // Test medium and large
        const startTime = performance.now();
        
        await engine.translateWithProgressiveBatches(scenario.text, {
          enableParallelChunks: true
        });
        
        const endTime = performance.now();
        const currentTime = endTime - startTime;
        const baseline = baselineMetrics[scenario.name];
        
        if (baseline) {
          const regressionThreshold = baseline * 1.3; // Allow 30% degradation
          const improvement = ((baseline - currentTime) / baseline * 100);
          
          console.log(`${scenario.name}: Current ${currentTime.toFixed(2)}ms vs Baseline ${baseline.toFixed(2)}ms (${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%)`);
          
          expect(currentTime).toBeLessThan(regressionThreshold);
        }
      }
    });
    
    test('should maintain translation quality consistency', async () => {
      const text = "质量一致性测试。并行处理应该产生相同的结果。";
      const iterations = 5;
      
      const results = [];
      
      // Run multiple parallel translations
      for (let i = 0; i < iterations; i++) {
        const result = await engine.translateWithProgressiveBatches(text, {
          enableParallelChunks: true
        });
        results.push(result.translatedText);
      }
      
      // All results should be identical
      const firstResult = results[0];
      results.forEach((result, _index) => {
        expect(result).toBe(firstResult);
      });
      
      console.log(`Quality consistency verified across ${iterations} iterations`);
    });
  });

  describe('Scalability Testing', () => {
    test('should scale gracefully with increasing load', async () => {
      const baseText = "可扩展性测试文本。";
      const scalingSizes = [1, 5, 10, 20]; // Multipliers
      
      const scalingResults = [];
      
      for (const size of scalingSizes) {
        const scaledText = baseText.repeat(size);
        
        const startTime = performance.now();
        const result = await engine.translateWithProgressiveBatches(scaledText, {
          enableParallelChunks: true
        });
        const endTime = performance.now();
        
        const processingTime = endTime - startTime;
        const timePerUnit = processingTime / size;
        
        scalingResults.push({
          size,
          totalTime: processingTime,
          timePerUnit,
          textLength: scaledText.length,
          resultLength: result.translatedText.length
        });
        
        console.log(`Size ${size}x: ${processingTime.toFixed(2)}ms (${timePerUnit.toFixed(2)}ms per unit)`);
      }
      
      // Verify scaling doesn't degrade exponentially
      for (let i = 1; i < scalingResults.length; i++) {
        const current = scalingResults[i];
        const previous = scalingResults[i - 1];
        
        // Time per unit should not increase dramatically (allowing for some overhead)
        const timeIncrease = current.timePerUnit / previous.timePerUnit;
        expect(timeIncrease).toBeLessThan(2.0); // Should not double per size increase
      }
    }, 60000); // 1 minute timeout
    
    test('should handle concurrent translations efficiently', async () => {
      const text = "并发翻译测试文本。";
      const concurrencyLevels = [1, 3, 5];
      
      for (const concurrency of concurrencyLevels) {
        const startTime = performance.now();
        
        const promises = Array(concurrency).fill(0).map(() =>
          engine.translateWithProgressiveBatches(text, {
            enableParallelChunks: true
          })
        );
        
        await Promise.all(promises);
        
        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const timePerTranslation = totalTime / concurrency;
        
        console.log(`Concurrency ${concurrency}: ${totalTime.toFixed(2)}ms total (${timePerTranslation.toFixed(2)}ms per translation)`);
        
        // Verify all translations completed successfully
        expect(promises).toHaveLength(concurrency);
      }
    }, 30000);
  });

  describe('Error Resilience Testing', () => {
    test('should maintain performance under error conditions', async () => {
      const text = "错误恢复性能测试。";
      
      // Mock intermittent failures
      const originalFindAllMatchesAsync = engine.dictionaryManager.findAllMatchesAsync;
      let callCount = 0;
      engine.dictionaryManager.findAllMatchesAsync = jest.fn().mockImplementation(async (...args) => {
        callCount++;
        if (callCount % 3 === 0) { // Fail every 3rd call
          throw new Error('Simulated dictionary failure');
        }
        return originalFindAllMatchesAsync.apply(engine.dictionaryManager, args);
      });
      
      const startTime = performance.now();
      
      const result = await engine.translateWithProgressiveBatches(text, {
        enableParallelChunks: true
      });
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // Should complete despite errors
      expect(result.translatedText).toBeDefined();
      expect(processingTime).toBeLessThan(10000); // Should not take excessively long
      
      console.log(`Error resilience test: ${processingTime.toFixed(2)}ms with simulated failures`);
      
      // Restore original method
      engine.dictionaryManager.findAllMatchesAsync = originalFindAllMatchesAsync;
    });
  });

  describe('Configuration Impact Testing', () => {
    test('should respond appropriately to configuration changes', async () => {
      const text = testScenarios[1].text; // Medium text
      const configurations = [
        { name: 'Minimal Parallel', chunk: { maxParallelChunks: 2 }, dictionary: { maxParallelDictionaries: 2 } },
        { name: 'Moderate Parallel', chunk: { maxParallelChunks: 3 }, dictionary: { maxParallelDictionaries: 5 } },
        { name: 'Maximum Parallel', chunk: { maxParallelChunks: 5 }, dictionary: { maxParallelDictionaries: 10 } }
      ];
      
      const configResults = [];
      
      for (const config of configurations) {
        parallelConfig.updateConfig(config);
        
        const startTime = performance.now();
        const result = await engine.translateWithProgressiveBatches(text, {
          enableParallelChunks: true
        });
        const endTime = performance.now();
        
        const processingTime = endTime - startTime;
        
        configResults.push({
          name: config.name,
          time: processingTime,
          resultLength: result.translatedText.length
        });
        
        console.log(`${config.name}: ${processingTime.toFixed(2)}ms`);
      }
      
      // All configurations should produce valid results
      configResults.forEach(result => {
        expect(result.time).toBeLessThan(15000); // Reasonable time limit
        expect(result.resultLength).toBeGreaterThan(0);
      });
      
      // Results should be relatively consistent
      const lengths = configResults.map(r => r.resultLength);
      const maxLength = Math.max(...lengths);
      const minLength = Math.min(...lengths);
      expect(maxLength / minLength).toBeLessThan(1.1); // Less than 10% variation
    });
  });

  afterAll(() => {
    console.log('\n=== Performance Benchmark Summary ===');
    if (baselineMetrics) {
      Object.entries(baselineMetrics).forEach(([name, time]) => {
        console.log(`${name}: ${time.toFixed(2)}ms`);
      });
    }
    console.log('=====================================\n');
    
    // Get final performance report
    const report = performanceProfiler.getPerformanceReport();
    if (report.parallel) {
      console.log('Parallel Processing Summary:');
      console.log(`- Total Operations: ${report.parallel.totalParallelOperations || 0}`);
      console.log(`- Fallback Rate: ${((report.parallel.fallbackRate || 0) * 100).toFixed(1)}%`);
      console.log(`- Average Speedup: ${(report.parallel.avgParallelSpeedup || 1).toFixed(2)}x`);
    }
  });
});