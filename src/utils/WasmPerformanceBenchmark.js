/**
 * WASM Performance Benchmarking Framework
 * Comprehensive performance measurement and comparison system for WASM vs JavaScript
 *
 * @import {
 *   BenchmarkScenario,
 *   PerformanceMeasurement,
 *   BaselineMetrics,
 *   RegressionThresholds,
 *   BenchmarkEnvironment,
 *   BenchmarkSession,
 *   ScenarioComparison,
 *   RegressionIssue,
 *   BenchmarkSummary,
 *   BenchmarkResults,
 *   WasmPerformanceBenchmarkInterface
 * } from '../types/PerformanceMonitoringTypes'
 */

export class WasmPerformanceBenchmark {
  constructor() {
    this.baselineMetrics = new Map();
    this.wasmMetrics = new Map();
    this.regressionThresholds = {
      minimumSpeedupRequired: 2.0,  // WASM must be 2x faster minimum
      memoryReductionTarget: 0.8,   // Target 20% memory reduction  
      maxRegressionTolerance: 0.05  // 5% performance regression tolerance
    };
    
    // Performance tracking
    this.performanceHistory = [];
    this.currentSession = {
      startTime: Date.now(),
      measurements: [],
      environment: this.captureEnvironment()
    };
  }

  /**
   * Establish JavaScript performance baseline across different scenarios
   */
  async establishBaseline(dictionaryManager) {
    console.log('🏃 Establishing JavaScript performance baseline...');
    
    const scenarios = [
      { 
        name: 'small_lookup', 
        text: '你好', 
        iterations: 1000,
        description: 'Single character lookups'
      },
      { 
        name: 'medium_lookup', 
        text: '你好世界这是测试'.repeat(5), 
        iterations: 500,
        description: 'Medium text processing'
      },
      { 
        name: 'large_lookup', 
        text: '这是一个很长的测试文本用来验证性能'.repeat(50), 
        iterations: 100,
        description: 'Large text processing'
      },
      { 
        name: 'phrase_intensive', 
        text: '手提箱里面有很多东西包括衣服和书籍', 
        iterations: 500,
        description: 'Phrase-heavy content'
      },
      { 
        name: 'character_intensive', 
        text: '一二三四五六七八九十一二三四五六七八九十', 
        iterations: 500,
        description: 'Character-by-character processing'
      }
    ];

    for (const scenario of scenarios) {
      console.log(`📊 Measuring baseline: ${scenario.description}...`);
      
      const baseline = await this.measureJavaScriptPerformance(
        dictionaryManager, 
        scenario
      );
      
      this.baselineMetrics.set(scenario.name, {
        ...baseline,
        scenario: scenario.description,
        testConfig: scenario
      });
      
      console.log(`📈 Baseline ${scenario.name}: ${baseline.averageTime.toFixed(2)}ms avg, ${baseline.memoryUsage.toFixed(1)}MB`);
      
      // Small delay between scenarios to allow garbage collection
      await this.delay(100);
    }
    
    console.log(`✅ JavaScript baseline established: ${scenarios.length} scenarios measured`);
    return this.baselineMetrics;
  }

  /**
   * Measure JavaScript-only performance for comparison
   */
  async measureJavaScriptPerformance(dictionaryManager, scenario) {
    const startMemory = this.getCurrentMemoryUsage();
    const timings = [];
    const memorySnapshots = [];

    // Warm up the JavaScript engine
    for (let i = 0; i < Math.min(10, scenario.iterations); i++) {
      await this.performJSDictionaryLookup(dictionaryManager, scenario.text);
    }

    // Actual measurement
    for (let i = 0; i < scenario.iterations; i++) {
      const iterationStart = performance.now();
      
      await this.performJSDictionaryLookup(dictionaryManager, scenario.text);
      
      const iterationTime = performance.now() - iterationStart;
      timings.push(iterationTime);
      
      // Sample memory every 10 iterations to avoid measurement overhead
      if (i % 10 === 0) {
        memorySnapshots.push(this.getCurrentMemoryUsage());
        // Force micro-task processing
        await this.delay(0);
      }
    }

    const endMemory = this.getCurrentMemoryUsage();
    const memoryPeak = Math.max(...memorySnapshots, endMemory);
    
    return {
      averageTime: this.calculateAverage(timings),
      medianTime: this.calculateMedian(timings),
      p95Time: this.calculatePercentile(timings, 95),
      minTime: Math.min(...timings),
      maxTime: Math.max(...timings),
      memoryUsage: endMemory - startMemory,
      memoryPeak: memoryPeak - startMemory,
      standardDeviation: this.calculateStandardDeviation(timings),
      iterations: scenario.iterations,
      timestamp: Date.now()
    };
  }

  /**
   * Measure WASM performance for the same scenarios
   */
  async measureWasmPerformance(dictionaryManager, scenario) {
    const startMemory = this.getCurrentMemoryUsage();
    const timings = [];
    const memorySnapshots = [];

    // Ensure WASM is initialized
    if (!dictionaryManager.wasmManager || !dictionaryManager.wasmManager.isInitialized) {
      console.warn('⚠️ WASM not initialized, falling back to JS measurement');
      return this.measureJavaScriptPerformance(dictionaryManager, scenario);
    }

    // Warm up the WASM engine
    for (let i = 0; i < Math.min(10, scenario.iterations); i++) {
      await this.performWASMDictionaryLookup(dictionaryManager, scenario.text);
    }

    // Actual measurement
    for (let i = 0; i < scenario.iterations; i++) {
      const iterationStart = performance.now();
      
      await this.performWASMDictionaryLookup(dictionaryManager, scenario.text);
      
      const iterationTime = performance.now() - iterationStart;
      timings.push(iterationTime);
      
      // Sample memory every 10 iterations
      if (i % 10 === 0) {
        memorySnapshots.push(this.getCurrentMemoryUsage());
        await this.delay(0);
      }
    }

    const endMemory = this.getCurrentMemoryUsage();
    const memoryPeak = Math.max(...memorySnapshots, endMemory);
    
    return {
      averageTime: this.calculateAverage(timings),
      medianTime: this.calculateMedian(timings),
      p95Time: this.calculatePercentile(timings, 95),
      minTime: Math.min(...timings),
      maxTime: Math.max(...timings),
      memoryUsage: endMemory - startMemory,
      memoryPeak: memoryPeak - startMemory,
      standardDeviation: this.calculateStandardDeviation(timings),
      iterations: scenario.iterations,
      timestamp: Date.now()
    };
  }

  /**
   * Perform JavaScript-only dictionary lookup
   */
  async performJSDictionaryLookup(dictionaryManager, text) {
    // Force JavaScript implementation
    const result = dictionaryManager.findMatch('characters', text, { forceJS: true });
    
    // Also test phrase lookups for comprehensive measurement
    if (text.length > 5) {
      dictionaryManager.findMatch('phrases', text, { forceJS: true });
    }
    
    return result;
  }

  /**
   * Perform WASM dictionary lookup
   */
  async performWASMDictionaryLookup(dictionaryManager, text) {
    // Use WASM implementation
    const result = dictionaryManager.findMatch('characters', text, { forceWASM: true });
    
    // Also test phrase lookups
    if (text.length > 5) {
      dictionaryManager.findMatch('phrases', text, { forceWASM: true });
    }
    
    return result;
  }

  /**
   * Run complete benchmark suite comparing WASM vs JavaScript
   */
  async runCompleteBenchmarkSuite(dictionaryManager) {
    console.log('🚀 Starting comprehensive WASM vs JavaScript benchmark...');
    
    // Establish JavaScript baseline
    await this.establishBaseline(dictionaryManager);
    
    console.log('🦀 Running WASM performance measurements...');
    
    const results = {
      scenarios: {},
      summary: {
        totalSpeedup: 0,
        averageSpeedup: 0,
        memoryImprovement: 0,
        regressions: [],
        meetsBenchmarks: false,
        timestamp: Date.now(),
        environment: this.captureEnvironment()
      },
      rawData: {
        baseline: Object.fromEntries(this.baselineMetrics),
        wasm: {}
      }
    };

    // Measure WASM performance for each baseline scenario
    for (const [scenarioName, baseline] of this.baselineMetrics) {
      console.log(`📊 Measuring WASM: ${baseline.scenario}...`);
      
      const wasmMetrics = await this.measureWasmPerformance(
        dictionaryManager, 
        baseline.testConfig
      );
      
      results.rawData.wasm[scenarioName] = wasmMetrics;
      
      // Calculate comparison metrics
      const speedup = baseline.averageTime / wasmMetrics.averageTime;
      const memoryImprovement = (baseline.memoryUsage - wasmMetrics.memoryUsage) / baseline.memoryUsage;
      const consistencyImprovement = baseline.standardDeviation / wasmMetrics.standardDeviation;
      
      results.scenarios[scenarioName] = {
        scenario: baseline.scenario,
        baseline: {
          avgTime: baseline.averageTime,
          memory: baseline.memoryUsage,
          consistency: baseline.standardDeviation
        },
        wasm: {
          avgTime: wasmMetrics.averageTime,
          memory: wasmMetrics.memoryUsage,
          consistency: wasmMetrics.standardDeviation
        },
        improvements: {
          speedup: speedup,
          memoryReduction: memoryImprovement,
          consistencyImprovement: consistencyImprovement
        },
        meetsTargets: {
          speed: speedup >= this.regressionThresholds.minimumSpeedupRequired,
          memory: memoryImprovement >= -0.1 // Allow 10% memory increase
        }
      };

      console.log(`📈 ${scenarioName}: ${speedup.toFixed(2)}x speedup, ${(memoryImprovement*100).toFixed(1)}% memory improvement`);
      
      // Check for regressions
      if (speedup < this.regressionThresholds.minimumSpeedupRequired) {
        results.summary.regressions.push({
          scenario: scenarioName,
          issue: 'insufficient_speedup',
          actual: speedup,
          required: this.regressionThresholds.minimumSpeedupRequired
        });
      }
      
      // Small delay between scenarios
      await this.delay(200);
    }

    // Calculate summary statistics
    const speedups = Object.values(results.scenarios).map(r => r.improvements.speedup);
    const memoryImprovements = Object.values(results.scenarios).map(r => r.improvements.memoryReduction);
    
    results.summary.averageSpeedup = this.calculateAverage(speedups);
    results.summary.totalSpeedup = Math.min(...speedups); // Most conservative
    results.summary.memoryImprovement = this.calculateAverage(memoryImprovements);
    results.summary.meetsBenchmarks = results.summary.regressions.length === 0;

    // Store results for historical comparison
    this.performanceHistory.push(results);

    // Generate report
    this.generatePerformanceReport(results);

    return results;
  }

  /**
   * Generate detailed performance report
   */
  generatePerformanceReport(results) {
    console.log('\n🏆 ===== WASM PERFORMANCE BENCHMARK REPORT =====');
    console.log(`📅 Timestamp: ${new Date(results.summary.timestamp).toLocaleString()}`);
    console.log(`🌍 Environment: ${results.summary.environment.platform} ${results.summary.environment.browserVersion}`);
    
    console.log('\n📊 PERFORMANCE SUMMARY:');
    console.log(`   Average Speedup: ${results.summary.averageSpeedup.toFixed(2)}x`);
    console.log(`   Conservative Speedup: ${results.summary.totalSpeedup.toFixed(2)}x`);
    console.log(`   Average Memory Improvement: ${(results.summary.memoryImprovement * 100).toFixed(1)}%`);
    console.log(`   Benchmarks Met: ${results.summary.meetsBenchmarks ? '✅ YES' : '❌ NO'}`);
    
    console.log('\n📈 DETAILED SCENARIO RESULTS:');
    for (const [scenario, data] of Object.entries(results.scenarios)) {
      const speed = data.improvements.speedup;
      const memory = data.improvements.memoryReduction * 100;
      const speedStatus = speed >= 2.0 ? '✅' : speed >= 1.5 ? '⚠️' : '❌';
      const memoryStatus = memory > 0 ? '✅' : memory > -10 ? '⚠️' : '❌';
      
      console.log(`   ${scenario}:`);
      console.log(`     ${speedStatus} Speed: ${speed.toFixed(2)}x (${data.baseline.avgTime.toFixed(2)}ms → ${data.wasm.avgTime.toFixed(2)}ms)`);
      console.log(`     ${memoryStatus} Memory: ${memory.toFixed(1)}% (${data.baseline.memory.toFixed(1)}MB → ${data.wasm.memory.toFixed(1)}MB)`);
    }
    
    if (results.summary.regressions.length > 0) {
      console.log('\n❌ PERFORMANCE REGRESSIONS DETECTED:');
      for (const regression of results.summary.regressions) {
        console.log(`   - ${regression.scenario}: ${regression.issue} (${regression.actual.toFixed(2)} < ${regression.required})`);
      }
    } else {
      console.log('\n✅ ALL PERFORMANCE BENCHMARKS EXCEEDED!');
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    if (results.summary.averageSpeedup < 3.0) {
      console.log('   - Consider optimizing trie traversal algorithms');
      console.log('   - Profile memory allocation patterns');
    }
    if (results.summary.memoryImprovement < 0.1) {
      console.log('   - Review WASM memory management');
      console.log('   - Optimize string handling between JS and WASM');
    }
    if (results.summary.averageSpeedup >= 5.0) {
      console.log('   🎉 Exceptional performance! Consider documenting optimization techniques');
    }
    
    console.log('===============================================\n');
  }

  /**
   * Utility functions for statistical calculations
   */
  calculateAverage(numbers) {
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  calculatePercentile(numbers, percentile) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  calculateStandardDeviation(numbers) {
    const avg = this.calculateAverage(numbers);
    const squareDiffs = numbers.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = this.calculateAverage(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  getCurrentMemoryUsage() {
    return performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0;
  }

  captureEnvironment() {
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      browserVersion: this.getBrowserVersion(),
      memory: performance.memory ? {
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        usedJSHeapSize: performance.memory.usedJSHeapSize
      } : null,
      timestamp: Date.now()
    };
  }

  getBrowserVersion() {
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
      return `Electron ${process.versions.electron} (Chrome ${process.versions.chrome})`;
    }
    return 'Unknown';
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Export results for analysis
   */
  exportResults(results, filename = `wasm-benchmark-${Date.now()}.json`) {
    const exportData = {
      ...results,
      metadata: {
        benchmarkVersion: '1.0.0',
        exportTime: Date.now(),
        totalScenarios: Object.keys(results.scenarios).length,
        benchmarkDuration: Date.now() - this.currentSession.startTime
      }
    };
    
    // In Node.js environment, could write to file
    console.log(`📄 Benchmark results available for export: ${filename}`);
    console.log('📊 Results object:', exportData);
    
    return exportData;
  }
}

/**
 * Convenience function to run benchmarks
 */
export async function runWasmBenchmark(dictionaryManager, options = {}) {
  const benchmark = new WasmPerformanceBenchmark();
  
  try {
    const results = await benchmark.runCompleteBenchmarkSuite(dictionaryManager);
    
    if (options.export !== false) {
      benchmark.exportResults(results);
    }
    
    return results;
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    throw error;
  }
}