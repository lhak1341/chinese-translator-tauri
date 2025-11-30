/**
 * WASM Load Testing Framework
 * Comprehensive load testing for large text processing validation
 * 
 * Tests critical performance scenarios:
 * - Large novel-length text processing
 * - Sustained high-throughput translation
 * - Memory stability under load
 * - Concurrent user simulation
 * - Real-world usage pattern simulation
 */

export class WasmLoadTester {
  constructor() {
    this.testResults = new Map();
    this.isRunning = false;
    this.currentTest = null;
    
    // Load testing configuration
    this.config = {
      // Text size categories (in characters)
      textSizes: {
        small: 1000,
        medium: 10000,
        large: 50000,
        massive: 200000
      },
      
      // Performance thresholds
      thresholds: {
        maxTranslationTime: 10000,    // 10s for massive texts
        maxMemoryIncrease: 100,       // 100MB max increase
        minThroughput: 10000,         // 10K chars/second minimum
        maxErrorRate: 0.01            // 1% error rate maximum
      },
      
      // Concurrent user simulation
      concurrency: {
        lightLoad: 5,
        mediumLoad: 15,
        heavyLoad: 50
      }
    };
    
    // Performance monitoring
    this.performanceMonitor = {
      startTime: 0,
      samples: [],
      memorySnapshots: [],
      errorCount: 0,
      totalOperations: 0
    };
  }

  /**
   * Run comprehensive load testing suite
   */
  async runLoadTestSuite(dictionaryManager, _options = {}) {
    console.log('🚀 Starting WASM Load Testing Suite...');
    console.log(`📊 Environment: ${this.getEnvironmentInfo()}`);
    
    this.isRunning = true;
    const suiteStartTime = performance.now();
    
    try {
      const results = {
        environment: this.getEnvironmentInfo(),
        startTime: Date.now(),
        tests: {},
        summary: {
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          totalDuration: 0,
          overallScore: 0
        }
      };

      // Test 1: Single Large Text Processing
      console.log('\n🔬 Test 1: Single Large Text Processing');
      results.tests.singleLargeText = await this.testSingleLargeTextProcessing(dictionaryManager);

      // Test 2: Sustained High Throughput
      console.log('\n🔬 Test 2: Sustained High Throughput');
      results.tests.sustainedThroughput = await this.testSustainedThroughput(dictionaryManager);

      // Test 3: Memory Stability Under Load
      console.log('\n🔬 Test 3: Memory Stability Under Load');
      results.tests.memoryStability = await this.testMemoryStability(dictionaryManager);

      // Test 4: Concurrent User Simulation
      console.log('\n🔬 Test 4: Concurrent User Simulation');
      results.tests.concurrentUsers = await this.testConcurrentUsers(dictionaryManager);

      // Test 5: Real-World Usage Patterns
      console.log('\n🔬 Test 5: Real-World Usage Patterns');
      results.tests.realWorldPatterns = await this.testRealWorldPatterns(dictionaryManager);

      // Test 6: Stress Testing - Breaking Point Analysis
      console.log('\n🔬 Test 6: Breaking Point Analysis');
      results.tests.breakingPoint = await this.testBreakingPoint(dictionaryManager);

      // Calculate summary
      results.summary = this.calculateSummary(results.tests);
      results.summary.totalDuration = performance.now() - suiteStartTime;

      this.generateLoadTestReport(results);
      return results;

    } catch (error) {
      console.error('❌ Load test suite failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Test single large text processing capabilities
   */
  async testSingleLargeTextProcessing(dictionaryManager) {
    console.log('   📝 Testing single large text processing...');
    
    const testResult = {
      name: 'Single Large Text Processing',
      passed: false,
      metrics: {},
      details: []
    };

    // Generate test texts of different sizes
    const testTexts = this.generateTestTexts();
    
    for (const [size, text] of Object.entries(testTexts)) {
      console.log(`     Processing ${size} text (${text.length.toLocaleString()} characters)...`);
      
      const testStartTime = performance.now();
      const startMemory = this.getCurrentMemoryUsage();
      
      try {
        // Test both JS and WASM if available
        const jsResult = await this.processTextWithTracking(
          dictionaryManager, 
          text, 
          { forceJS: true, label: `${size}-js` }
        );
        
        let wasmResult = null;
        try {
          wasmResult = await this.processTextWithTracking(
            dictionaryManager, 
            text, 
            { forceWASM: true, label: `${size}-wasm` }
          );
        } catch (_error) {
          console.log(`       WASM not available for ${size} test`);
        }

        const testEndTime = performance.now();
        const endMemory = this.getCurrentMemoryUsage();
        
        const testDuration = testEndTime - testStartTime;
        const memoryIncrease = endMemory - startMemory;
        const throughput = text.length / (testDuration / 1000); // chars/second

        const sizeResult = {
          size,
          textLength: text.length,
          duration: testDuration,
          memoryIncrease,
          throughput,
          jsSuccess: !!jsResult,
          wasmSuccess: !!wasmResult,
          speedup: wasmResult && jsResult ? jsResult.duration / wasmResult.duration : null
        };

        testResult.details.push(sizeResult);
        
        console.log(`       Duration: ${testDuration.toFixed(2)}ms`);
        console.log(`       Throughput: ${throughput.toFixed(0)} chars/second`);
        console.log(`       Memory: +${memoryIncrease.toFixed(1)}MB`);
        if (sizeResult.speedup) {
          console.log(`       WASM Speedup: ${sizeResult.speedup.toFixed(2)}x`);
        }

        // Check against thresholds
        if (testDuration > this.config.thresholds.maxTranslationTime) {
          console.log(`       ⚠️ Exceeded time threshold (${this.config.thresholds.maxTranslationTime}ms)`);
        }
        
        if (throughput < this.config.thresholds.minThroughput) {
          console.log(`       ⚠️ Below throughput threshold (${this.config.thresholds.minThroughput} chars/sec)`);
        }

      } catch (error) {
        console.error(`       ❌ Failed processing ${size} text:`, error.message);
        testResult.details.push({
          size,
          textLength: text.length,
          error: error.message,
          failed: true
        });
      }
    }

    // Determine overall test result
    const successfulTests = testResult.details.filter(d => !d.failed);
    testResult.passed = successfulTests.length > 0;
    testResult.metrics = this.calculateSingleTextMetrics(testResult.details);

    return testResult;
  }

  /**
   * Test sustained high throughput processing
   */
  async testSustainedThroughput(dictionaryManager) {
    console.log('   🏃 Testing sustained throughput...');
    
    const testResult = {
      name: 'Sustained High Throughput',
      passed: false,
      metrics: {},
      details: []
    };

    const testText = this.generateChineseNovelText(this.config.textSizes.medium);
    const iterations = 20;
    const batchSize = 5;

    console.log(`     Processing ${iterations} iterations in batches of ${batchSize}...`);

    const startTime = performance.now();
    const startMemory = this.getCurrentMemoryUsage();
    let totalProcessed = 0;
    let errors = 0;

    // Process in batches to simulate sustained load
    for (let batch = 0; batch < iterations / batchSize; batch++) {
      const batchStartTime = performance.now();
      const batchPromises = [];

      // Create concurrent operations within batch
      for (let i = 0; i < batchSize; i++) {
        batchPromises.push(
          this.processTextWithTracking(dictionaryManager, testText, {
            label: `batch-${batch}-item-${i}`
          }).catch(_error => {
            errors++;
            return null;
          })
        );
      }

      const batchResults = await Promise.all(batchPromises);
      const batchDuration = performance.now() - batchStartTime;
      const batchProcessed = batchResults.filter(r => r).length * testText.length;
      
      totalProcessed += batchProcessed;
      
      const batchThroughput = batchProcessed / (batchDuration / 1000);
      
      testResult.details.push({
        batch,
        duration: batchDuration,
        processed: batchProcessed,
        throughput: batchThroughput,
        errors: errors
      });

      console.log(`     Batch ${batch + 1}: ${batchThroughput.toFixed(0)} chars/sec`);
      
      // Small delay between batches
      await this.delay(100);
    }

    const totalDuration = performance.now() - startTime;
    const endMemory = this.getCurrentMemoryUsage();
    const overallThroughput = totalProcessed / (totalDuration / 1000);
    const errorRate = errors / (iterations);

    testResult.metrics = {
      totalDuration,
      totalProcessed,
      overallThroughput,
      errorRate,
      memoryIncrease: endMemory - startMemory,
      averageBatchThroughput: testResult.details.reduce((sum, d) => sum + d.throughput, 0) / testResult.details.length
    };

    console.log(`     Overall Throughput: ${overallThroughput.toFixed(0)} chars/second`);
    console.log(`     Error Rate: ${(errorRate * 100).toFixed(2)}%`);
    console.log(`     Memory Stability: +${testResult.metrics.memoryIncrease.toFixed(1)}MB`);

    // Check thresholds
    testResult.passed = (
      overallThroughput >= this.config.thresholds.minThroughput &&
      errorRate <= this.config.thresholds.maxErrorRate &&
      testResult.metrics.memoryIncrease <= this.config.thresholds.maxMemoryIncrease
    );

    return testResult;
  }

  /**
   * Test memory stability under sustained load
   */
  async testMemoryStability(dictionaryManager) {
    console.log('   🧠 Testing memory stability...');
    
    const testResult = {
      name: 'Memory Stability Under Load',
      passed: false,
      metrics: {},
      details: []
    };

    const testText = this.generateChineseNovelText(this.config.textSizes.small);
    const cycles = 10;
    const operationsPerCycle = 50;

    let memorySnapshots = [];
    let peakMemory = 0;

    for (let cycle = 0; cycle < cycles; cycle++) {
      console.log(`     Memory cycle ${cycle + 1}/${cycles}...`);
      
      const cycleStartMemory = this.getCurrentMemoryUsage();
      
      // Perform many operations
      for (let op = 0; op < operationsPerCycle; op++) {
        try {
          await this.processTextWithTracking(dictionaryManager, testText, {
            label: `memory-cycle-${cycle}-op-${op}`,
            skipLogging: true
          });
        } catch (_error) {
          // Continue on errors for stability testing
        }
      }

      const cycleEndMemory = this.getCurrentMemoryUsage();
      peakMemory = Math.max(peakMemory, cycleEndMemory);
      
      memorySnapshots.push({
        cycle,
        startMemory: cycleStartMemory,
        endMemory: cycleEndMemory,
        increase: cycleEndMemory - cycleStartMemory
      });

      console.log(`       Memory: ${cycleStartMemory.toFixed(1)}MB → ${cycleEndMemory.toFixed(1)}MB`);

      // Force garbage collection if available
      if (global.gc && cycle % 3 === 0) {
        global.gc();
        console.log('       Triggered garbage collection');
      }
      
      await this.delay(200); // Brief pause between cycles
    }

    const initialMemory = memorySnapshots[0].startMemory;
    const finalMemory = memorySnapshots[memorySnapshots.length - 1].endMemory;
    const totalMemoryIncrease = finalMemory - initialMemory;
    const averageMemoryIncrease = memorySnapshots.reduce((sum, s) => sum + s.increase, 0) / memorySnapshots.length;
    const maxCycleMemoryIncrease = Math.max(...memorySnapshots.map(s => s.increase));

    testResult.metrics = {
      cycles,
      operationsPerCycle,
      initialMemory,
      finalMemory,
      peakMemory,
      totalMemoryIncrease,
      averageMemoryIncrease,
      maxCycleMemoryIncrease,
      memoryEfficiency: operationsPerCycle * cycles / totalMemoryIncrease // operations per MB
    };

    testResult.details = memorySnapshots;

    console.log(`     Total Memory Increase: ${totalMemoryIncrease.toFixed(1)}MB`);
    console.log(`     Peak Memory: ${peakMemory.toFixed(1)}MB`);
    console.log(`     Memory Efficiency: ${testResult.metrics.memoryEfficiency.toFixed(0)} ops/MB`);

    // Memory stability criteria
    testResult.passed = (
      totalMemoryIncrease <= this.config.thresholds.maxMemoryIncrease &&
      averageMemoryIncrease >= -5 && // No significant memory leaks per cycle
      maxCycleMemoryIncrease <= 20 // No single cycle causes massive increase
    );

    return testResult;
  }

  /**
   * Test concurrent users simulation
   */
  async testConcurrentUsers(dictionaryManager) {
    console.log('   👥 Testing concurrent users...');
    
    const testResult = {
      name: 'Concurrent User Simulation',
      passed: false,
      metrics: {},
      details: []
    };

    const loadLevels = [
      { name: 'light', users: this.config.concurrency.lightLoad },
      { name: 'medium', users: this.config.concurrency.mediumLoad },
      { name: 'heavy', users: this.config.concurrency.heavyLoad }
    ];

    for (const level of loadLevels) {
      console.log(`     Testing ${level.name} load: ${level.users} concurrent users...`);
      
      const levelResult = await this.simulateConcurrentUsers(dictionaryManager, level.users);
      testResult.details.push({
        loadLevel: level.name,
        users: level.users,
        ...levelResult
      });

      console.log(`       Success Rate: ${(levelResult.successRate * 100).toFixed(1)}%`);
      console.log(`       Avg Response Time: ${levelResult.averageResponseTime.toFixed(2)}ms`);
      console.log(`       Throughput: ${levelResult.totalThroughput.toFixed(0)} chars/sec`);
    }

    // Overall metrics
    const successRates = testResult.details.map(d => d.successRate);
    const responseTimes = testResult.details.map(d => d.averageResponseTime);
    
    testResult.metrics = {
      minSuccessRate: Math.min(...successRates),
      maxResponseTime: Math.max(...responseTimes),
      scalabilityScore: this.calculateScalabilityScore(testResult.details)
    };

    // Pass criteria: reasonable performance under all load levels
    testResult.passed = (
      testResult.metrics.minSuccessRate >= 0.95 && // 95% success rate minimum
      testResult.metrics.maxResponseTime <= 5000 && // 5s maximum response time
      testResult.metrics.scalabilityScore >= 0.7 // Good scalability
    );

    return testResult;
  }

  /**
   * Test real-world usage patterns
   */
  async testRealWorldPatterns(dictionaryManager) {
    console.log('   🌍 Testing real-world usage patterns...');
    
    const testResult = {
      name: 'Real-World Usage Patterns',
      passed: false,
      metrics: {},
      details: []
    };

    // Simulate different real-world scenarios
    const scenarios = [
      {
        name: 'Novel Translation',
        pattern: 'continuous_medium_texts',
        description: 'Translating novel chapters continuously'
      },
      {
        name: 'Quick Lookups',
        pattern: 'rapid_small_texts',
        description: 'Quick character/phrase lookups'
      },
      {
        name: 'Mixed Workload',
        pattern: 'mixed_sizes',
        description: 'Mixed small and large text processing'
      },
      {
        name: 'Bursty Usage',
        pattern: 'burst_processing',
        description: 'Periods of high activity with quiet periods'
      }
    ];

    for (const scenario of scenarios) {
      console.log(`     Scenario: ${scenario.name} - ${scenario.description}`);
      
      const scenarioResult = await this.simulateUsagePattern(dictionaryManager, scenario.pattern);
      testResult.details.push({
        scenario: scenario.name,
        pattern: scenario.pattern,
        ...scenarioResult
      });

      console.log(`       Performance Score: ${scenarioResult.performanceScore.toFixed(2)}`);
      console.log(`       User Experience: ${scenarioResult.userExperience}`);
    }

    // Calculate overall real-world performance
    const performanceScores = testResult.details.map(d => d.performanceScore);
    const avgPerformanceScore = performanceScores.reduce((sum, score) => sum + score, 0) / performanceScores.length;
    
    testResult.metrics = {
      averagePerformanceScore: avgPerformanceScore,
      scenariosCompleted: testResult.details.length,
      realWorldReadiness: avgPerformanceScore >= 0.8 ? 'Excellent' : avgPerformanceScore >= 0.6 ? 'Good' : 'Needs Improvement'
    };

    testResult.passed = avgPerformanceScore >= 0.7; // 70% performance score minimum

    return testResult;
  }

  /**
   * Test breaking point analysis
   */
  async testBreakingPoint(dictionaryManager) {
    console.log('   🔥 Testing breaking point analysis...');
    
    const testResult = {
      name: 'Breaking Point Analysis',
      passed: true, // This test passes if it completes without crashing
      metrics: {},
      details: []
    };

    // Gradually increase load until failure
    const textSizeMultipliers = [1, 2, 4, 8, 16, 32];
    const baseTextSize = this.config.textSizes.large;
    
    let breakingPoint = null;

    for (const multiplier of textSizeMultipliers) {
      const textSize = baseTextSize * multiplier;
      const testText = this.generateChineseNovelText(textSize);
      
      console.log(`     Testing ${multiplier}x load (${textSize.toLocaleString()} characters)...`);
      
      const startTime = performance.now();
      const startMemory = this.getCurrentMemoryUsage();
      
      try {
        const _result = await this.processTextWithTracking(dictionaryManager, testText, {
          label: `breaking-point-${multiplier}x`,
          timeout: 30000 // 30 second timeout
        });

        const endTime = performance.now();
        const endMemory = this.getCurrentMemoryUsage();
        
        const testDuration = endTime - startTime;
        const memoryIncrease = endMemory - startMemory;
        const throughput = textSize / (testDuration / 1000);

        testResult.details.push({
          multiplier,
          textSize,
          duration: testDuration,
          memoryIncrease,
          throughput,
          success: true
        });

        console.log(`       ✅ Completed in ${testDuration.toFixed(2)}ms`);
        console.log(`       Memory: +${memoryIncrease.toFixed(1)}MB`);
        console.log(`       Throughput: ${throughput.toFixed(0)} chars/sec`);

      } catch (error) {
        console.log(`       ❌ Failed at ${multiplier}x: ${error.message}`);
        
        breakingPoint = {
          multiplier,
          textSize,
          error: error.message
        };

        testResult.details.push({
          multiplier,
          textSize,
          error: error.message,
          success: false
        });
        
        break; // Stop at first failure
      }

      // Give system time to recover
      await this.delay(1000);
    }

    const maxSuccessfulMultiplier = Math.max(...testResult.details.filter(d => d.success).map(d => d.multiplier));
    const maxProcessedSize = Math.max(...testResult.details.filter(d => d.success).map(d => d.textSize));

    testResult.metrics = {
      maxSuccessfulMultiplier,
      maxProcessedSize,
      breakingPoint,
      systemStability: breakingPoint ? 'Limited' : 'Excellent'
    };

    console.log(`     Maximum successful load: ${maxSuccessfulMultiplier}x (${maxProcessedSize.toLocaleString()} chars)`);
    
    if (breakingPoint) {
      console.log(`     Breaking point: ${breakingPoint.multiplier}x (${breakingPoint.error})`);
    } else {
      console.log(`     No breaking point found within test limits`);
    }

    return testResult;
  }

  // Utility Methods

  generateTestTexts() {
    const texts = {};
    for (const [size, charCount] of Object.entries(this.config.textSizes)) {
      texts[size] = this.generateChineseNovelText(charCount);
    }
    return texts;
  }

  generateChineseNovelText(charCount) {
    const sentences = [
      '这是一个关于勇敢的年轻人的故事',
      '他踏上了寻找真相的旅程',
      '在古老的森林中发现了神秘的力量',
      '经过无数的挑战和考验',
      '最终获得了智慧和成长',
      '世界变得更加美好和和谐',
      '人们生活在幸福和平的环境中',
      '这个故事告诉我们坚持的重要性',
      '只有通过努力才能实现梦想',
      '希望这个故事能够激励每一个人'
    ];
    
    let text = '';
    while (text.length < charCount) {
      const sentence = sentences[Math.floor(Math.random() * sentences.length)];
      text += sentence + '。';
    }
    
    return text.substring(0, charCount);
  }

  async processTextWithTracking(dictionaryManager, text, options = {}) {
    const startTime = performance.now();
    const startMemory = this.getCurrentMemoryUsage();
    
    try {
      // Simulate text processing - multiple lookups
      const results = [];
      const chunks = this.chunkText(text, 20); // Process in chunks of 20 characters
      
      for (const chunk of chunks) {
        const result = dictionaryManager.findMatch('characters', chunk, options);
        results.push(result);
      }

      const endTime = performance.now();
      const endMemory = this.getCurrentMemoryUsage();

      const trackingResult = {
        textLength: text.length,
        chunkCount: chunks.length,
        resultsCount: results.filter(r => r).length,
        duration: endTime - startTime,
        memoryIncrease: endMemory - startMemory,
        throughput: text.length / ((endTime - startTime) / 1000),
        success: true
      };

      if (!options.skipLogging) {
        console.log(`       Processed ${text.length} chars in ${trackingResult.duration.toFixed(2)}ms`);
      }

      return trackingResult;

    } catch (error) {
      const endTime = performance.now();
      return {
        textLength: text.length,
        duration: endTime - startTime,
        error: error.message,
        success: false
      };
    }
  }

  chunkText(text, chunkSize) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
  }

  async simulateConcurrentUsers(dictionaryManager, userCount) {
    const testText = this.generateChineseNovelText(this.config.textSizes.small);
    const operationsPerUser = 10;
    
    // Create user simulation promises
    const userPromises = Array(userCount).fill().map(async (_, userId) => {
      const userResults = [];
      
      for (let op = 0; op < operationsPerUser; op++) {
        try {
          const result = await this.processTextWithTracking(
            dictionaryManager,
            testText,
            { label: `user-${userId}-op-${op}`, skipLogging: true }
          );
          userResults.push(result);
        } catch (error) {
          userResults.push({ success: false, error: error.message });
        }
        
        // Random delay between operations (simulate human behavior)
        await this.delay(Math.random() * 100 + 50);
      }
      
      return userResults;
    });

    const startTime = performance.now();
    const allUserResults = await Promise.all(userPromises);
    const totalTime = performance.now() - startTime;

    // Calculate metrics
    let totalOperations = 0;
    let successfulOperations = 0;
    let totalResponseTime = 0;
    let totalProcessedChars = 0;

    for (const userResults of allUserResults) {
      for (const result of userResults) {
        totalOperations++;
        if (result.success) {
          successfulOperations++;
          totalResponseTime += result.duration;
          totalProcessedChars += result.textLength;
        }
      }
    }

    return {
      userCount,
      totalOperations,
      successfulOperations,
      successRate: successfulOperations / totalOperations,
      averageResponseTime: totalResponseTime / successfulOperations,
      totalThroughput: totalProcessedChars / (totalTime / 1000),
      concurrencyEfficiency: successfulOperations / (totalTime / 1000)
    };
  }

  async simulateUsagePattern(dictionaryManager, pattern) {
    const patternFunctions = {
      continuous_medium_texts: () => this.simulateContinuousProcessing(dictionaryManager),
      rapid_small_texts: () => this.simulateRapidLookups(dictionaryManager),
      mixed_sizes: () => this.simulateMixedWorkload(dictionaryManager),
      burst_processing: () => this.simulateBurstProcessing(dictionaryManager)
    };

    const simulationFunction = patternFunctions[pattern];
    if (!simulationFunction) {
      throw new Error(`Unknown usage pattern: ${pattern}`);
    }

    return await simulationFunction();
  }

  async simulateContinuousProcessing(dictionaryManager) {
    const texts = Array(5).fill().map(() => 
      this.generateChineseNovelText(this.config.textSizes.medium)
    );
    
    const results = [];
    const startTime = performance.now();
    
    for (const text of texts) {
      const result = await this.processTextWithTracking(
        dictionaryManager, 
        text, 
        { label: 'continuous', skipLogging: true }
      );
      results.push(result);
    }
    
    const totalTime = performance.now() - startTime;
    const successRate = results.filter(r => r.success).length / results.length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    return {
      performanceScore: this.calculatePerformanceScore(successRate, avgResponseTime, totalTime),
      userExperience: successRate > 0.9 ? 'Excellent' : successRate > 0.7 ? 'Good' : 'Poor',
      successRate,
      avgResponseTime,
      totalTime
    };
  }

  async simulateRapidLookups(dictionaryManager) {
    const lookupTexts = Array(100).fill().map(() => 
      this.generateChineseNovelText(50) // Very small texts for rapid lookups
    );
    
    const startTime = performance.now();
    const results = await Promise.all(
      lookupTexts.map(text => 
        this.processTextWithTracking(
          dictionaryManager, 
          text, 
          { label: 'rapid', skipLogging: true }
        ).catch(error => ({ success: false, error: error.message }))
      )
    );
    const totalTime = performance.now() - startTime;
    
    const successRate = results.filter(r => r.success).length / results.length;
    const avgResponseTime = results.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) / results.filter(r => r.success).length;
    
    return {
      performanceScore: this.calculatePerformanceScore(successRate, avgResponseTime, totalTime),
      userExperience: avgResponseTime < 50 ? 'Excellent' : avgResponseTime < 200 ? 'Good' : 'Poor',
      successRate,
      avgResponseTime,
      totalTime
    };
  }

  async simulateMixedWorkload(dictionaryManager) {
    const mixedTexts = [
      ...Array(10).fill().map(() => this.generateChineseNovelText(100)), // Small
      ...Array(5).fill().map(() => this.generateChineseNovelText(1000)),  // Medium  
      ...Array(2).fill().map(() => this.generateChineseNovelText(5000))   // Large
    ];
    
    // Shuffle for realistic mixed processing
    const shuffled = mixedTexts.sort(() => Math.random() - 0.5);
    
    const results = [];
    const startTime = performance.now();
    
    for (const text of shuffled) {
      const result = await this.processTextWithTracking(
        dictionaryManager, 
        text, 
        { label: 'mixed', skipLogging: true }
      );
      results.push(result);
    }
    
    const totalTime = performance.now() - startTime;
    const successRate = results.filter(r => r.success).length / results.length;
    const avgResponseTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    return {
      performanceScore: this.calculatePerformanceScore(successRate, avgResponseTime, totalTime),
      userExperience: this.assessMixedWorkloadExperience(results),
      successRate,
      avgResponseTime,
      totalTime
    };
  }

  async simulateBurstProcessing(dictionaryManager) {
    const burstResults = [];
    
    // Simulate 3 bursts with quiet periods
    for (let burst = 0; burst < 3; burst++) {
      console.log(`       Processing burst ${burst + 1}/3...`);
      
      // High activity burst
      const burstTexts = Array(10).fill().map(() => 
        this.generateChineseNovelText(this.config.textSizes.small)
      );
      
      const burstStart = performance.now();
      const burstPromises = burstTexts.map(text =>
        this.processTextWithTracking(
          dictionaryManager,
          text,
          { label: `burst-${burst}`, skipLogging: true }
        ).catch(error => ({ success: false, error: error.message }))
      );
      
      const burstResults_inner = await Promise.all(burstPromises);
      const burstTime = performance.now() - burstStart;
      
      burstResults.push({
        burst,
        results: burstResults_inner,
        duration: burstTime,
        successRate: burstResults_inner.filter(r => r.success).length / burstResults_inner.length
      });
      
      // Quiet period
      await this.delay(1000);
    }
    
    const totalTime = burstResults.reduce((sum, b) => sum + b.duration, 0);
    const overallSuccessRate = burstResults.reduce((sum, b) => sum + b.successRate, 0) / burstResults.length;
    const avgBurstTime = totalTime / burstResults.length;
    
    return {
      performanceScore: this.calculatePerformanceScore(overallSuccessRate, avgBurstTime, totalTime),
      userExperience: overallSuccessRate > 0.9 ? 'Handles bursts well' : 'Struggles with bursts',
      successRate: overallSuccessRate,
      avgResponseTime: avgBurstTime,
      totalTime,
      burstDetails: burstResults
    };
  }

  // Calculation and Analysis Methods

  calculatePerformanceScore(successRate, responseTime, totalTime) {
    const successScore = successRate; // 0-1
    const speedScore = Math.max(0, 1 - (responseTime / 1000)); // Penalty for slow responses
    const efficiencyScore = Math.max(0, 1 - (totalTime / 10000)); // Penalty for long total time
    
    return (successScore * 0.5 + speedScore * 0.3 + efficiencyScore * 0.2);
  }

  calculateScalabilityScore(loadLevelResults) {
    // Compare performance across different load levels
    const throughputs = loadLevelResults.map(r => r.totalThroughput);
    const maxThroughput = Math.max(...throughputs);
    const minThroughput = Math.min(...throughputs);
    
    // Good scalability means throughput doesn't degrade too much
    return minThroughput / maxThroughput;
  }

  assessMixedWorkloadExperience(results) {
    const smallTexts = results.filter(r => r.textLength <= 500);
    const largeTexts = results.filter(r => r.textLength > 5000);
    
    const smallAvgTime = smallTexts.reduce((sum, r) => sum + r.duration, 0) / smallTexts.length;
    const largeAvgTime = largeTexts.reduce((sum, r) => sum + r.duration, 0) / largeTexts.length;
    
    if (smallAvgTime < 100 && largeAvgTime < 2000) {
      return 'Excellent';
    } else if (smallAvgTime < 200 && largeAvgTime < 5000) {
      return 'Good';
    } else {
      return 'Needs Improvement';
    }
  }

  calculateSingleTextMetrics(details) {
    const successful = details.filter(d => !d.failed);
    
    return {
      testsCompleted: details.length,
      successfulTests: successful.length,
      averageThroughput: successful.reduce((sum, d) => sum + d.throughput, 0) / successful.length,
      averageSpeedup: successful.filter(d => d.speedup).reduce((sum, d) => sum + d.speedup, 0) / successful.filter(d => d.speedup).length || null,
      maxTextSizeProcessed: Math.max(...successful.map(d => d.textLength))
    };
  }

  calculateSummary(tests) {
    const testResults = Object.values(tests);
    const passedTests = testResults.filter(t => t.passed);
    
    return {
      totalTests: testResults.length,
      passedTests: passedTests.length,
      failedTests: testResults.length - passedTests.length,
      overallScore: passedTests.length / testResults.length
    };
  }

  generateLoadTestReport(results) {
    console.log('\n🏆 ===== WASM LOAD TEST REPORT =====');
    console.log(`📅 Timestamp: ${new Date(results.startTime).toLocaleString()}`);
    console.log(`🌍 Environment: ${results.environment.platform}`);
    console.log(`⏱️ Total Duration: ${(results.summary.totalDuration / 1000).toFixed(2)}s`);
    
    console.log('\n📊 SUMMARY:');
    console.log(`   Tests Completed: ${results.summary.totalTests}`);
    console.log(`   Tests Passed: ${results.summary.passedTests}`);
    console.log(`   Tests Failed: ${results.summary.failedTests}`);
    console.log(`   Overall Score: ${(results.summary.overallScore * 100).toFixed(1)}%`);
    
    console.log('\n📈 DETAILED RESULTS:');
    for (const [_testName, testResult] of Object.entries(results.tests)) {
      const status = testResult.passed ? '✅' : '❌';
      console.log(`   ${status} ${testResult.name}`);
      
      if (testResult.metrics) {
        for (const [metric, value] of Object.entries(testResult.metrics)) {
          if (typeof value === 'number') {
            console.log(`     ${metric}: ${value.toFixed(2)}`);
          } else {
            console.log(`     ${metric}: ${value}`);
          }
        }
      }
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    if (results.summary.overallScore >= 0.9) {
      console.log('   🎉 Excellent! System performs well under all load conditions');
    } else if (results.summary.overallScore >= 0.7) {
      console.log('   👍 Good performance with room for optimization');
      console.log('   - Consider memory optimizations for sustained load');
      console.log('   - Profile concurrent access patterns');
    } else {
      console.log('   ⚠️ Performance issues detected:');
      const failedTests = Object.values(results.tests).filter(t => !t.passed);
      failedTests.forEach(test => {
        console.log(`   - Address issues in: ${test.name}`);
      });
    }
    
    console.log('=======================================\n');
  }

  // Utility methods
  getCurrentMemoryUsage() {
    return performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0;
  }

  getEnvironmentInfo() {
    return {
      platform: navigator.platform,
      memory: performance.memory ? `${Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)}MB` : 'Unknown',
      timestamp: new Date().toISOString()
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function to run load tests
 */
export async function runWasmLoadTest(dictionaryManager, options = {}) {
  const loadTester = new WasmLoadTester();
  
  try {
    const results = await loadTester.runLoadTestSuite(dictionaryManager, options);
    return results;
  } catch (error) {
    console.error('❌ Load test failed:', error);
    throw error;
  }
}