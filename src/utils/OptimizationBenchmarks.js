/**
 * Optimization Benchmarking Infrastructure
 *
 * Specialized benchmarks for measuring TypeScript/Rust optimization opportunities.
 * Establishes baselines before optimizations and tracks improvements.
 *
 * Focus Areas:
 * 1. WASM boundary performance (serialization overhead)
 * 2. Dictionary loading and lookup speed
 * 3. String operations and precomputation
 * 4. Phase 5 character lookup performance
 * 5. Pattern matching efficiency
 *
 * @import { PerformanceBaselineTracker } from './ProactivePerformanceDetector'
 */

import { logger } from './logger';
import { systemPerformanceMonitor } from './ProactivePerformanceDetector.js';

/**
 * Optimization benchmark suite
 */
export class OptimizationBenchmarks {
  constructor() {
    this.results = new Map();
    this.baselines = new Map();
    this.isRunning = false;
  }

  /**
   * Run complete benchmark suite and establish baselines
   */
  async runFullSuite() {
    if (this.isRunning) {
      logger.warn('Benchmark suite already running');
      return this.results;
    }

    this.isRunning = true;
    logger.log('🚀 Starting Optimization Benchmark Suite');
    logger.log('═'.repeat(60));

    try {
      // Critical #1: WASM Boundary Performance
      await this.benchmarkWasmBoundary();

      // High-Impact #5: JSON Serialization
      await this.benchmarkWasmSerialization();

      // Critical #2: String Operations
      await this.benchmarkStringOperations();

      // Critical #3: Dictionary Lookup
      await this.benchmarkDictionaryLookup();

      // High-Impact #6: Regex Performance
      await this.benchmarkRegexOperations();

      // Medium #7: String Assembly
      await this.benchmarkStringAssembly();

      // Task #3: WASM String Processor
      await this.benchmarkWasmStringProcessor();

      // Task #4: WASM Dictionary Trie
      await this.benchmarkWasmDictionaryTrie();

      // Task #6: WASM Regex Utilities
      await this.benchmarkWasmRegexUtils();

      // Task #5: ReadonlyArray Optimizations
      await this.benchmarkReadonlyArrayOptimizations();

      // Task #7: WASM Text Assembly
      await this.benchmarkWasmTextAssembly();

      // Task #8: V8 Hidden Class Optimization
      await this.benchmarkV8Optimization();

      // Print comprehensive report
      this.printBenchmarkReport();

      return this.results;
    } catch (error) {
      logger.error('Benchmark suite failed:', error);
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Benchmark #1: WASM Boundary Overhead
   * Measures serialization/deserialization cost across WASM boundary
   */
  async benchmarkWasmBoundary() {
    logger.log('\n📊 Benchmark #1: WASM Boundary Overhead');
    logger.log('─'.repeat(60));

    const testSizes = [100, 500, 1000, 2000, 5000];
    const iterations = 100;

    const results = {
      tokenTransfer: {},
      dictionaryTransfer: {},
      overhead: {},
    };

    for (const size of testSizes) {
      // Generate test tokens
      const testTokens = Array.from({ length: size }, (_, i) => ({
        value: `字${i}`,
        translated: null,
        translationSource: null,
        position: i,
      }));

      // Test 1: Token array transfer (happens on every pattern/number processing call)
      const tokenTransferStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        // Simulate JSON serialization (current approach)
        JSON.parse(JSON.stringify(testTokens));
      }
      const tokenTransferTime = (performance.now() - tokenTransferStart) / iterations;
      results.tokenTransfer[size] = tokenTransferTime;

      // Test 2: Dictionary entry transfer (happens on dictionary load)
      const testEntries = Array.from({ length: size }, (_, i) => ({
        chars: `字${i}`,
        translation: `translation${i}`,
        priority: i % 10,
      }));

      const dictTransferStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        JSON.parse(JSON.stringify(testEntries));
      }
      const dictTransferTime = (performance.now() - dictTransferStart) / iterations;
      results.dictionaryTransfer[size] = dictTransferTime;

      // Calculate overhead percentage
      const dataSize = JSON.stringify(testTokens).length;
      results.overhead[size] = {
        tokenTime: tokenTransferTime,
        dictTime: dictTransferTime,
        dataSize: dataSize,
        bytesPerMs: dataSize / tokenTransferTime,
      };

      logger.log(
        `  ${size} tokens: ${tokenTransferTime.toFixed(2)}ms (${(dataSize / 1024).toFixed(1)}KB)`
      );
    }

    this.results.set('wasm_boundary', results);
    this.recordBaseline('wasm_boundary_1000', results.tokenTransfer[1000]);

    // Target: <1ms for 1000 tokens
    const current = results.tokenTransfer[1000];
    const target = 1.0;
    logger.log(
      `\n  Target: <${target}ms for 1000 tokens | Current: ${current.toFixed(2)}ms | ${current > target ? '❌ NEEDS OPTIMIZATION' : '✅ ACCEPTABLE'}`
    );
  }

  /**
   * Benchmark #2: WASM Serialization Methods
   * Compare JSON vs binary serialization approaches
   */
  async benchmarkWasmSerialization() {
    logger.log('\n📊 Benchmark #2: WASM Serialization Methods');
    logger.log('─'.repeat(60));

    const testData = Array.from({ length: 1000 }, (_, i) => ({
      value: `字典${i}`,
      translation: `từ điển ${i}`,
      priority: i % 10,
    }));

    const iterations = 100;
    const results = {};

    // Method 1: JSON.stringify/parse (current)
    const jsonStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const serialized = JSON.stringify(testData);
      JSON.parse(serialized);
    }
    const jsonTime = (performance.now() - jsonStart) / iterations;
    results.json = jsonTime;

    // Method 2: Structured clone (faster for complex objects)
    const cloneStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      structuredClone(testData);
    }
    const cloneTime = (performance.now() - cloneStart) / iterations;
    results.structuredClone = cloneTime;

    // Method 3: Manual array mapping (fastest for simple structures)
    const mapStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      testData.map((item) => ({
        value: item.value,
        translation: item.translation,
        priority: item.priority,
      }));
    }
    const mapTime = (performance.now() - mapStart) / iterations;
    results.manualMap = mapTime;

    this.results.set('wasm_serialization', results);

    logger.log(`  JSON stringify/parse: ${jsonTime.toFixed(2)}ms`);
    logger.log(`  structuredClone: ${cloneTime.toFixed(2)}ms`);
    logger.log(`  Manual mapping: ${mapTime.toFixed(2)}ms`);
    logger.log(`\n  Speedup potential: ${(jsonTime / Math.min(cloneTime, mapTime)).toFixed(1)}x`);
  }

  /**
   * Benchmark #3: String Operations
   * Measures string slicing, concatenation, and precomputation costs
   */
  async benchmarkStringOperations() {
    logger.log('\n📊 Benchmark #3: String Operations');
    logger.log('─'.repeat(60));

    const testText = '在这个非常复杂的中文句子中有很多字符需要处理'.repeat(20); // ~600 chars
    const iterations = 1000;
    const results = {};

    // Test 1: String slicing (used extensively in pattern matching)
    const sliceStart = performance.now();
    let sliceCount = 0;
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < testText.length - 10; pos += 5) {
        testText.slice(pos, pos + 5);
        sliceCount++;
      }
    }
    const sliceTime = performance.now() - sliceStart;
    results.slicing = {
      totalTime: sliceTime,
      avgPerSlice: sliceTime / sliceCount,
      slicesPerSecond: (sliceCount / sliceTime) * 1000,
    };

    // Test 2: String concatenation (used in post-processing)
    const concatStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      let result = '';
      for (let j = 0; j < 100; j++) {
        result += testText.slice(j * 5, (j + 1) * 5);
      }
    }
    const concatTime = performance.now() - concatStart;
    results.concatenation = concatTime / iterations;

    // Test 3: Array join (better alternative to concatenation)
    const joinStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const parts = [];
      for (let j = 0; j < 100; j++) {
        parts.push(testText.slice(j * 5, (j + 1) * 5));
      }
      parts.join('');
    }
    const joinTime = performance.now() - joinStart;
    results.arrayJoin = joinTime / iterations;

    // Test 4: Template literals
    const templateStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const parts = [];
      for (let j = 0; j < 100; j++) {
        parts.push(testText.slice(j * 5, (j + 1) * 5));
      }
      parts.reduce((acc, part) => `${acc}${part}`, '');
    }
    const templateTime = performance.now() - templateStart;
    results.templateLiterals = templateTime / iterations;

    this.results.set('string_operations', results);

    logger.log(`  String slicing: ${results.slicing.slicesPerSecond.toFixed(0)} ops/sec`);
    logger.log(`  Concatenation: ${results.concatenation.toFixed(2)}ms per 100 parts`);
    logger.log(`  Array join: ${results.arrayJoin.toFixed(2)}ms per 100 parts`);
    logger.log(`  Template literals: ${results.templateLiterals.toFixed(2)}ms per 100 parts`);
    logger.log(
      `\n  Best method: Array join (${(results.concatenation / results.arrayJoin).toFixed(1)}x faster than concat)`
    );

    // Target: 5-15x speedup with Rust
    this.recordBaseline('string_slicing_ops_per_sec', results.slicing.slicesPerSecond);
  }

  /**
   * Benchmark #4: Dictionary Lookup Performance
   * Measures Phase 5 character dictionary lookup speed
   */
  async benchmarkDictionaryLookup() {
    logger.log('\n📊 Benchmark #4: Dictionary Lookup (Phase 5)');
    logger.log('─'.repeat(60));

    // Simulate character dictionary (27,000+ entries in real app)
    const dictionarySize = 10000; // Use 10k for benchmark
    const testDictionary = new Map();

    for (let i = 0; i < dictionarySize; i++) {
      testDictionary.set(`字${i}`, `từ ${i}`);
    }

    const testText = Array.from({ length: 1000 }, (_, i) => `字${i % dictionarySize}`).join('');
    const iterations = 100;
    const results = {};

    // Test 1: Map.get() lookup (current JavaScript approach)
    const mapStart = performance.now();
    let mapHits = 0;
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < testText.length; pos++) {
        const char = testText[pos];
        if (testDictionary.has(char)) {
          testDictionary.get(char);
          mapHits++;
        }
      }
    }
    const mapTime = performance.now() - mapStart;
    results.mapLookup = {
      totalTime: mapTime,
      avgPerLookup: mapTime / mapHits,
      lookupsPerSecond: (mapHits / mapTime) * 1000,
    };

    // Test 2: Object property access (alternative approach)
    const objDict = {};
    testDictionary.forEach((value, key) => {
      objDict[key] = value;
    });

    const objStart = performance.now();
    let objHits = 0;
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < testText.length; pos++) {
        const char = testText[pos];
        if (objDict[char]) {
          const _ = objDict[char];
          objHits++;
        }
      }
    }
    const objTime = performance.now() - objStart;
    results.objectLookup = {
      totalTime: objTime,
      avgPerLookup: objTime / objHits,
      lookupsPerSecond: (objHits / objTime) * 1000,
    };

    this.results.set('dictionary_lookup', results);

    logger.log(
      `  Map lookup: ${results.mapLookup.lookupsPerSecond.toFixed(0)} lookups/sec (${(results.mapLookup.avgPerLookup * 1000).toFixed(3)}µs per lookup)`
    );
    logger.log(
      `  Object lookup: ${results.objectLookup.lookupsPerSecond.toFixed(0)} lookups/sec (${(results.objectLookup.avgPerLookup * 1000).toFixed(3)}µs per lookup)`
    );

    // Target: 2-4x speedup with Rust trie
    const current = results.mapLookup.lookupsPerSecond;
    const target = current * 3; // 3x target
    logger.log(
      `\n  Current: ${current.toFixed(0)} ops/sec | Target with Rust: ${target.toFixed(0)} ops/sec (3x)`
    );

    this.recordBaseline('dict_lookup_ops_per_sec', current);
  }

  /**
   * Benchmark #5: Regex Performance
   * Measures regex compilation and execution overhead
   */
  async benchmarkRegexOperations() {
    logger.log('\n📊 Benchmark #5: Regex Operations');
    logger.log('─'.repeat(60));

    const testText = '在XY中有很多Z的情况下我们需要AB处理'.repeat(50);
    const iterations = 1000;
    const results = {};

    // Test 1: Regex with compilation each time (anti-pattern)
    const compileEachStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const regex = /在(.+?)中/g;
      const matches = [...testText.matchAll(regex)];
    }
    const compileEachTime = performance.now() - compileEachStart;
    results.compileEachTime = compileEachTime / iterations;

    // Test 2: Pre-compiled regex (current best practice)
    const preCompiledRegex = /在(.+?)中/g;
    const preCompiledStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const matches = [...testText.matchAll(preCompiledRegex)];
    }
    const preCompiledTime = performance.now() - preCompiledStart;
    results.preCompiledTime = preCompiledTime / iterations;

    // Test 3: String indexOf (faster for simple patterns)
    const indexOfStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const matches = [];
      let pos = 0;
      while ((pos = testText.indexOf('在', pos)) !== -1) {
        const end = testText.indexOf('中', pos);
        if (end !== -1) {
          matches.push(testText.slice(pos, end + 1));
          pos = end + 1;
        } else {
          break;
        }
      }
    }
    const indexOfTime = performance.now() - indexOfStart;
    results.indexOfTime = indexOfTime / iterations;

    this.results.set('regex_operations', results);

    logger.log(`  Compile each time: ${results.compileEachTime.toFixed(2)}ms`);
    logger.log(`  Pre-compiled regex: ${results.preCompiledTime.toFixed(2)}ms`);
    logger.log(`  indexOf approach: ${results.indexOfTime.toFixed(2)}ms`);
    logger.log(
      `\n  Speedup (pre-compiled vs compile-each): ${(results.compileEachTime / results.preCompiledTime).toFixed(1)}x`
    );
    logger.log(
      `  Speedup (indexOf vs regex): ${(results.preCompiledTime / results.indexOfTime).toFixed(1)}x`
    );

    // Target: 3-8x with Rust lazy_static
    this.recordBaseline('regex_precompiled_time', results.preCompiledTime);
  }

  /**
   * Benchmark #6: String Assembly (Post-Processing)
   * Measures text assembly performance for translation results
   */
  async benchmarkStringAssembly() {
    logger.log('\n📊 Benchmark #6: String Assembly (Post-Processing)');
    logger.log('─'.repeat(60));

    const segmentCount = 100;
    const iterations = 1000;
    const results = {};

    // Create test segments
    const testSegments = Array.from({ length: segmentCount }, (_, i) => ({
      original: `原文${i}`,
      translated: `bản dịch ${i}`,
      metadata: { index: i },
    }));

    // Test 1: String concatenation (worst)
    const concatStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      let result = '';
      for (const seg of testSegments) {
        result += seg.translated;
      }
    }
    const concatTime = performance.now() - concatStart;
    results.concatenation = concatTime / iterations;

    // Test 2: Array join (better)
    const joinStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const parts = testSegments.map((seg) => seg.translated);
      parts.join('');
    }
    const joinTime = performance.now() - joinStart;
    results.arrayJoin = joinTime / iterations;

    // Test 3: Pre-allocated array (best in JS)
    const preallocStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const parts = new Array(segmentCount);
      for (let j = 0; j < segmentCount; j++) {
        parts[j] = testSegments[j].translated;
      }
      parts.join('');
    }
    const preallocTime = performance.now() - preallocStart;
    results.preallocated = preallocTime / iterations;

    this.results.set('string_assembly', results);

    logger.log(
      `  Concatenation: ${results.concatenation.toFixed(3)}ms per ${segmentCount} segments`
    );
    logger.log(`  Array join: ${results.arrayJoin.toFixed(3)}ms`);
    logger.log(`  Pre-allocated: ${results.preallocated.toFixed(3)}ms`);
    logger.log(
      `\n  Best method: Pre-allocated array (${(results.concatenation / results.preallocated).toFixed(1)}x faster)`
    );

    // Target: 30-50% faster with Rust String::with_capacity
    this.recordBaseline('string_assembly_time', results.preallocated);
  }

  /**
   * Record baseline measurement
   */
  recordBaseline(name, value) {
    this.baselines.set(name, {
      value,
      timestamp: Date.now(),
    });

    // Also record in system performance monitor
    systemPerformanceMonitor.baselineTracker.recordPerformance(`optimization_${name}`, {
      duration: typeof value === 'number' ? value : 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Benchmark #7: WASM String Processor (Task #3)
   * Compares JavaScript PrecomputedTokenStrings vs Rust WASM StringProcessor
   */
  async benchmarkWasmStringProcessor() {
    logger.log('\n📊 Benchmark #7: WASM String Processor (Task #3)');
    logger.log('  Testing: JavaScript vs Rust WASM string operations');

    // Import dependencies
    const { wasmStringProcessor } = await import('./wasm/WasmStringProcessor.js');

    // Create test data (typical 2000-char text = ~200 tokens)
    const testTokens = Array.from({ length: 200 }, (_, i) => ({
      value: `字${i}`,
      type: 'chinese_char',
      position: i,
    }));

    const results = {
      javascript: { buildTime: 0, getString: 0, totalPrecomputed: 0 },
      wasm: { buildTime: 0, getString: 0, totalPrecomputed: 0 },
      speedup: { build: 0, getString: 0 },
    };

    // Benchmark JavaScript PrecomputedTokenStrings
    logger.log('  Testing JavaScript implementation...');
    const { default: SemanticPatternProcessor } =
      await import('./pattern/SemanticPatternProcessor.js');

    // Access the PrecomputedTokenStrings class (it's a private class, use reflection)
    const PrecomputedTokenStrings = class {
      constructor(semanticTokens, maxSpan = 10) {
        this.stringLookup = new Map();
        this.enabled = true;
        this.stats = { totalPrecomputed: 0, totalLookups: 0, precomputeTime: 0 };

        const startTime = performance.now();
        for (let pos = 0; pos < semanticTokens.length; pos++) {
          for (let span = 1; span <= maxSpan; span++) {
            if (pos + span <= semanticTokens.length) {
              const key = `${pos}_${span}`;
              const value = semanticTokens
                .slice(pos, pos + span)
                .map((t) => t.value)
                .join('');
              this.stringLookup.set(key, value);
              this.stats.totalPrecomputed++;
            }
          }
        }
        this.stats.precomputeTime = performance.now() - startTime;
      }

      getString(position, span) {
        if (!this.enabled) return null;
        this.stats.totalLookups++;
        const key = `${position}_${span}`;
        return this.stringLookup.get(key) || null;
      }
    };

    const jsStart = performance.now();
    const jsProcessor = new PrecomputedTokenStrings(testTokens, 10);
    results.javascript.buildTime = performance.now() - jsStart;
    results.javascript.totalPrecomputed = jsProcessor.stats.totalPrecomputed;

    // Test getString performance
    const jsGetStart = performance.now();
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      jsProcessor.getString(50, 3);
      jsProcessor.getString(100, 5);
      jsProcessor.getString(150, 2);
    }
    results.javascript.getString = (performance.now() - jsGetStart) / iterations;

    // Benchmark WASM StringProcessor
    logger.log('  Testing WASM implementation...');

    const wasmStart = performance.now();
    await wasmStringProcessor.buildCache(testTokens);
    results.wasm.buildTime = performance.now() - wasmStart;
    const stats = wasmStringProcessor.getStats();
    results.wasm.totalPrecomputed = stats.cacheSize;

    // Test getString performance
    const wasmGetStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmStringProcessor.getString(50, 3);
      wasmStringProcessor.getString(100, 5);
      wasmStringProcessor.getString(150, 2);
    }
    results.wasm.getString = (performance.now() - wasmGetStart) / iterations;

    // Calculate speedups
    results.speedup.build = results.javascript.buildTime / results.wasm.buildTime;
    results.speedup.getString = results.javascript.getString / results.wasm.getString;

    // Clean up
    wasmStringProcessor.clear();

    this.results.set('wasm_string_processor', results);
    this.recordBaseline('wasm_string_build_time', results.wasm.buildTime);
    this.recordBaseline('wasm_string_get_speedup', results.speedup.getString);

    logger.log(`  JavaScript build: ${results.javascript.buildTime.toFixed(2)}ms`);
    logger.log(`  WASM build: ${results.wasm.buildTime.toFixed(2)}ms`);
    logger.log(
      `  Build speedup: ${results.speedup.build.toFixed(1)}x ${results.speedup.build >= 5 ? '✅' : '⚠️'}`
    );
    logger.log(`  getString speedup: ${results.speedup.getString.toFixed(1)}x`);
    logger.log(
      `\n  Target: 5-15x improvement | Current: ${results.speedup.build.toFixed(1)}x | ${results.speedup.build >= 5 ? '✅ TARGET MET' : '❌ NEEDS IMPROVEMENT'}`
    );
  }

  /**
   * Benchmark #8: WASM Dictionary Trie (Task #4)
   * Compares JavaScript Map trie vs Rust WASM HashMap trie
   */
  async benchmarkWasmDictionaryTrie() {
    logger.log('\n📊 Benchmark #8: WASM Dictionary Trie (Task #4)');
    logger.log('  Testing: JavaScript Map vs Rust HashMap trie');

    // Import dependencies
    const { createWasmDictionaryTrie } = await import('./wasm/WasmDictionaryTrie.js');

    // Create test dictionary (simulate character dictionary with ~1000 entries)
    const testEntries = [];
    for (let i = 0; i < 1000; i++) {
      testEntries.push({
        chars: `字${i}`,
        translation: `chữ ${i}`,
        priority: Math.floor(Math.random() * 10),
      });
    }

    // Add some multi-character entries for realistic matching
    testEntries.push({ chars: '字典', translation: 'từ điển', priority: 8 });
    testEntries.push({ chars: '图书馆', translation: 'thư viện', priority: 7 });
    testEntries.push({ chars: '学校', translation: 'trường học', priority: 8 });

    const results = {
      javascript: { loadTime: 0, lookupTime: 0, memoryBytes: 0 },
      wasm: { loadTime: 0, lookupTime: 0, memoryBytes: 0 },
      speedup: { load: 0, lookup: 0, memory: 0 },
    };

    // Benchmark JavaScript Map trie (simplified implementation)
    logger.log('  Testing JavaScript Map trie...');

    class SimpleMapTrie {
      constructor() {
        this.root = new Map();
      }

      insert(chars, entry) {
        let current = this.root;
        for (const ch of chars) {
          if (!current.has(ch)) {
            current.set(ch, { children: new Map(), data: null });
          }
          current = current.get(ch).children;
        }
        // Set data at the last node
        const lastChar = chars[chars.length - 1];
        if (this.root.has(lastChar)) {
          current.set('__data__', entry);
        }
      }

      findLongestMatch(text, startPos) {
        const chars = Array.from(text);
        if (startPos >= chars.length) return null;

        let current = this.root;
        let longestMatch = null;
        let pos = startPos;

        while (pos < chars.length) {
          const ch = chars[pos];
          const node = current.get(ch);

          if (!node) break;

          pos++;
          current = node.children;

          if (current.has('__data__')) {
            longestMatch = {
              matchedText: chars.slice(startPos, pos).join(''),
              ...current.get('__data__'),
              length: pos - startPos,
            };
          }
        }

        return longestMatch;
      }
    }

    const jsTrieStart = performance.now();
    const jsTrie = new SimpleMapTrie();
    for (const entry of testEntries) {
      jsTrie.insert(entry.chars, entry);
    }
    results.javascript.loadTime = performance.now() - jsTrieStart;

    // Test lookup performance
    const testText = '字典图书馆学校字1字2字3';
    const iterations = 10000;

    const jsLookupStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < testText.length; pos++) {
        jsTrie.findLongestMatch(testText, pos);
      }
    }
    results.javascript.lookupTime = (performance.now() - jsLookupStart) / iterations;

    // Estimate memory (rough approximation)
    results.javascript.memoryBytes = testEntries.length * 100; // ~100 bytes per entry with Map overhead

    // Benchmark WASM HashMap trie
    logger.log('  Testing WASM HashMap trie...');

    const wasmTrieStart = performance.now();
    const wasmTrie = await createWasmDictionaryTrie('test', testEntries);
    results.wasm.loadTime = performance.now() - wasmTrieStart;

    // Test lookup performance
    const wasmLookupStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < testText.length; pos++) {
        wasmTrie.findLongestMatch(testText, pos);
      }
    }
    results.wasm.lookupTime = (performance.now() - wasmLookupStart) / iterations;

    // Get actual memory stats from WASM
    const stats = wasmTrie.getStats();
    results.wasm.memoryBytes = stats.nodeCount * 50; // Estimate ~50 bytes per node

    // Calculate speedups
    results.speedup.load = results.javascript.loadTime / results.wasm.loadTime;
    results.speedup.lookup = results.javascript.lookupTime / results.wasm.lookupTime;
    results.speedup.memory = results.javascript.memoryBytes / results.wasm.memoryBytes;

    // Clean up
    wasmTrie.clear();

    this.results.set('wasm_dictionary_trie', results);
    this.recordBaseline('wasm_trie_load_time', results.wasm.loadTime);
    this.recordBaseline('wasm_trie_lookup_speedup', results.speedup.lookup);

    logger.log(`  JavaScript load: ${results.javascript.loadTime.toFixed(2)}ms`);
    logger.log(`  WASM load: ${results.wasm.loadTime.toFixed(2)}ms`);
    logger.log(`  Load speedup: ${results.speedup.load.toFixed(1)}x`);
    logger.log(`  JavaScript lookup: ${results.javascript.lookupTime.toFixed(3)}ms per iteration`);
    logger.log(`  WASM lookup: ${results.wasm.lookupTime.toFixed(3)}ms per iteration`);
    logger.log(
      `  Lookup speedup: ${results.speedup.lookup.toFixed(1)}x ${results.speedup.lookup >= 2 ? '✅' : '⚠️'}`
    );
    logger.log(`  Memory reduction: ${results.speedup.memory.toFixed(1)}x`);
    logger.log(
      `\n  Target: 2-4x improvement | Current: ${results.speedup.lookup.toFixed(1)}x | ${results.speedup.lookup >= 2 ? '✅ TARGET MET' : '❌ NEEDS IMPROVEMENT'}`
    );
  }

  /**
   * Benchmark #9: WASM Regex Utilities (Task #6)
   * Compares JavaScript regex (recompiled each time) vs Rust lazy_static
   */
  async benchmarkWasmRegexUtils() {
    logger.log('\n📊 Benchmark #9: WASM Regex Utilities (Task #6)');
    logger.log('  Testing: JavaScript regex vs Rust lazy_static');

    // Import dependencies
    const { createWasmRegexUtils } = await import('./wasm/WasmRegexUtils.js');

    const testText = '这是第一句。这是第二句！这是第三句？还有更多内容在这里。';
    const testPattern = '在{X}{Y}中';
    const iterations = 10000;

    const results = {
      javascript: {
        punctuationTest: 0,
        sentenceSplit: 0,
        variableExtract: 0,
        whitespaceNorm: 0,
      },
      wasm: {
        punctuationTest: 0,
        sentenceSplit: 0,
        variableExtract: 0,
        whitespaceNorm: 0,
      },
      speedup: {
        punctuationTest: 0,
        sentenceSplit: 0,
        variableExtract: 0,
        whitespaceNorm: 0,
      },
    };

    // Benchmark JavaScript regex (recompiled each time)
    logger.log('  Testing JavaScript regex (recompiled)...');

    // Test 1: Punctuation detection
    let jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const regex = /[。！？]/g; // Recompiled every iteration
      regex.test(testText);
    }
    results.javascript.punctuationTest = (performance.now() - jsStart) / iterations;

    // Test 2: Sentence splitting
    jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const regex = /[。！？]/g; // Recompiled every iteration
      testText.split(regex);
    }
    results.javascript.sentenceSplit = (performance.now() - jsStart) / iterations;

    // Test 3: Variable extraction
    jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const regex = /\{([A-Z])\}/g; // Recompiled every iteration
      const matches = [];
      let match;
      while ((match = regex.exec(testPattern)) !== null) {
        matches.push(match[1]);
      }
    }
    results.javascript.variableExtract = (performance.now() - jsStart) / iterations;

    // Test 4: Whitespace normalization
    const whitespaceText = 'text   with    multiple     spaces';
    jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const regex = /\s+/g; // Recompiled every iteration
      whitespaceText.replace(regex, ' ');
    }
    results.javascript.whitespaceNorm = (performance.now() - jsStart) / iterations;

    // Benchmark WASM lazy_static regex
    logger.log('  Testing WASM lazy_static regex...');

    const wasmUtils = await createWasmRegexUtils();

    // Test 1: Punctuation detection
    let wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmUtils.hasChinesePunctuation(testText);
    }
    results.wasm.punctuationTest = (performance.now() - wasmStart) / iterations;

    // Test 2: Sentence splitting
    wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmUtils.splitBySentences(testText);
    }
    results.wasm.sentenceSplit = (performance.now() - wasmStart) / iterations;

    // Test 3: Variable extraction
    wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmUtils.extractPatternVariables(testPattern);
    }
    results.wasm.variableExtract = (performance.now() - wasmStart) / iterations;

    // Test 4: Whitespace normalization
    wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmUtils.normalizeWhitespace(whitespaceText);
    }
    results.wasm.whitespaceNorm = (performance.now() - wasmStart) / iterations;

    // Calculate speedups
    results.speedup.punctuationTest =
      results.javascript.punctuationTest / results.wasm.punctuationTest;
    results.speedup.sentenceSplit = results.javascript.sentenceSplit / results.wasm.sentenceSplit;
    results.speedup.variableExtract =
      results.javascript.variableExtract / results.wasm.variableExtract;
    results.speedup.whitespaceNorm =
      results.javascript.whitespaceNorm / results.wasm.whitespaceNorm;

    // Calculate average speedup
    const avgSpeedup =
      (results.speedup.punctuationTest +
        results.speedup.sentenceSplit +
        results.speedup.variableExtract +
        results.speedup.whitespaceNorm) /
      4;

    this.results.set('wasm_regex_utils', results);
    this.recordBaseline('wasm_regex_avg_speedup', avgSpeedup);

    logger.log(`  Punctuation test: ${results.speedup.punctuationTest.toFixed(1)}x speedup`);
    logger.log(`  Sentence split: ${results.speedup.sentenceSplit.toFixed(1)}x speedup`);
    logger.log(`  Variable extract: ${results.speedup.variableExtract.toFixed(1)}x speedup`);
    logger.log(`  Whitespace norm: ${results.speedup.whitespaceNorm.toFixed(1)}x speedup`);
    logger.log(`\n  Average speedup: ${avgSpeedup.toFixed(1)}x ${avgSpeedup >= 3 ? '✅' : '⚠️'}`);
    logger.log(
      `  Target: 3-8x improvement | Current: ${avgSpeedup.toFixed(1)}x | ${avgSpeedup >= 3 ? '✅ TARGET MET' : '❌ NEEDS IMPROVEMENT'}`
    );
  }

  /**
   * Benchmark #10: ReadonlyArray Optimizations (Task #5)
   * Compares direct array mutation vs readonly scan + batch update
   */
  async benchmarkReadonlyArrayOptimizations() {
    logger.log('\n📊 Benchmark #10: ReadonlyArray Optimizations (Task #5)');
    logger.log('  Testing: Direct mutation vs readonly scan + batch update');

    const {
      scanTokens,
      applyTokenUpdates,
      createTokenUpdate,
      findUnprocessedTokens,
      findConsecutiveUnprocessed,
    } = await import('./ReadonlyOptimizationUtils.js');

    // Create test token array
    const tokenCount = 5000;
    const testTokens = Array.from({ length: tokenCount }, (_, i) => ({
      value: String.fromCharCode(0x4e00 + (i % 100)), // Chinese characters
      type: 'character',
      position: i,
      translated: i % 3 === 0 ? null : 'translated',
      translationSource: i % 3 === 0 ? null : 'test',
    }));

    const iterations = 1000;
    const results = {
      directMutation: {
        scanAndUpdate: 0,
        findUnprocessed: 0,
        findConsecutive: 0,
      },
      readonlyBatch: {
        scanAndUpdate: 0,
        findUnprocessed: 0,
        findConsecutive: 0,
      },
      speedup: {
        scanAndUpdate: 0,
        findUnprocessed: 0,
        findConsecutive: 0,
      },
    };

    // Test 1: Scan and update pattern (most common operation)
    logger.log('  Testing scan + update pattern...');

    // Direct mutation approach
    let directStart = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      const tokens = JSON.parse(JSON.stringify(testTokens)); // Fresh copy

      // Scan and mutate in same pass
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].translated === null) {
          tokens[i].translated = 'updated';
          tokens[i].translationSource = 'phase4';
        }
      }
    }
    results.directMutation.scanAndUpdate = (performance.now() - directStart) / iterations;

    // Readonly + batch update approach
    let readonlyStart = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      const tokens = JSON.parse(JSON.stringify(testTokens)); // Fresh copy

      // Readonly scan
      const updates = new Map();
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].translated === null) {
          updates.set(i, createTokenUpdate(i, 'updated', 'phase4'));
        }
      }

      // Batch apply
      applyTokenUpdates(tokens, updates);
    }
    results.readonlyBatch.scanAndUpdate = (performance.now() - readonlyStart) / iterations;

    // Test 2: Find unprocessed tokens
    logger.log('  Testing findUnprocessed pattern...');

    // Direct approach
    directStart = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      const indices = [];
      for (let i = 0; i < testTokens.length; i++) {
        if (testTokens[i].translated === null) {
          indices.push(i);
        }
      }
    }
    results.directMutation.findUnprocessed = (performance.now() - directStart) / iterations;

    // Readonly approach
    readonlyStart = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      findUnprocessedTokens(testTokens);
    }
    results.readonlyBatch.findUnprocessed = (performance.now() - readonlyStart) / iterations;

    // Test 3: Find consecutive unprocessed spans
    logger.log('  Testing findConsecutive pattern...');

    // Direct approach
    directStart = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      const spans = [];
      let spanStart = -1;
      let spanLength = 0;

      for (let i = 0; i < testTokens.length; i++) {
        const isUnprocessed = testTokens[i].translated === null;

        if (isUnprocessed) {
          if (spanStart === -1) {
            spanStart = i;
            spanLength = 1;
          } else {
            spanLength++;
          }
        } else {
          if (spanStart !== -1 && spanLength >= 1) {
            spans.push({ start: spanStart, length: spanLength });
          }
          spanStart = -1;
          spanLength = 0;
        }
      }
    }
    results.directMutation.findConsecutive = (performance.now() - directStart) / iterations;

    // Readonly approach
    readonlyStart = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      findConsecutiveUnprocessed(testTokens, 1, 10);
    }
    results.readonlyBatch.findConsecutive = (performance.now() - readonlyStart) / iterations;

    // Calculate speedups
    results.speedup.scanAndUpdate =
      results.directMutation.scanAndUpdate / results.readonlyBatch.scanAndUpdate;
    results.speedup.findUnprocessed =
      results.directMutation.findUnprocessed / results.readonlyBatch.findUnprocessed;
    results.speedup.findConsecutive =
      results.directMutation.findConsecutive / results.readonlyBatch.findConsecutive;

    // Calculate average improvement
    const avgImprovement =
      ((results.speedup.scanAndUpdate +
        results.speedup.findUnprocessed +
        results.speedup.findConsecutive) /
        3 -
        1) *
      100;

    this.results.set('readonly_optimization', results);
    this.recordBaseline('readonly_optimization_improvement', avgImprovement);

    logger.log(`\n  Scan + Update: ${results.speedup.scanAndUpdate.toFixed(2)}x speedup`);
    logger.log(`  Find Unprocessed: ${results.speedup.findUnprocessed.toFixed(2)}x speedup`);
    logger.log(`  Find Consecutive: ${results.speedup.findConsecutive.toFixed(2)}x speedup`);
    logger.log(
      `\n  Average improvement: ${avgImprovement.toFixed(1)}% ${avgImprovement >= 5 ? '✅' : '⚠️'}`
    );
    logger.log(
      `  Target: 5-10% reduction | Current: ${avgImprovement.toFixed(1)}% | ${avgImprovement >= 5 ? '✅ TARGET MET' : '❌ NEEDS IMPROVEMENT'}`
    );
  }

  /**
   * Benchmark #11: WASM Text Assembly (Task #7)
   * Compares JavaScript string concatenation vs Rust String::with_capacity
   */
  async benchmarkWasmTextAssembly() {
    logger.log('\n📊 Benchmark #11: WASM Text Assembly (Task #7)');
    logger.log('  Testing: JavaScript concatenation vs Rust String::with_capacity');

    const { createWasmTextAssembler } = await import('./wasm/WasmTextAssembler.js');

    // Create test segments (simulate translation output)
    const segmentCounts = [10, 50, 100, 200];
    const results = {
      javascript: {},
      wasm: {},
      speedup: {},
    };

    for (const count of segmentCounts) {
      logger.log(`  Testing with ${count} segments...`);

      // Generate test segments
      const segments = Array.from({ length: count }, (_, i) => ({
        original: '这是一段测试文本',
        translated: 'Đây là một đoạn văn bản thử nghiệm',
        translationSource: i % 3 === 0 ? 'pattern' : i % 2 === 0 ? 'phrase' : 'character',
        startIndex: i * 8,
        endIndex: (i + 1) * 8,
        metadata: {
          phase: (i % 5) + 1,
          confidence: 0.9,
        },
      }));

      const iterations = 1000;

      // JavaScript assembly
      let jsStart = performance.now();
      for (let iter = 0; iter < iterations; iter++) {
        let translatedText = '';
        let originalText = '';
        const originalArray = [];
        const translatedArray = [];
        const sourcesArray = [];
        const positionsArray = [];
        let currentPosition = 0;

        for (const segment of segments) {
          translatedText += segment.translated;
          originalText += segment.original;

          originalArray.push(segment.original);
          translatedArray.push(segment.translated);
          sourcesArray.push(segment.translationSource);
          positionsArray.push(currentPosition);

          currentPosition += segment.original.length;
        }
      }
      results.javascript[count] = (performance.now() - jsStart) / iterations;

      // WASM assembly
      const wasmAssembler = await createWasmTextAssembler();
      let wasmStart = performance.now();
      for (let iter = 0; iter < iterations; iter++) {
        wasmAssembler.assembleTranslation(segments);
      }
      results.wasm[count] = (performance.now() - wasmStart) / iterations;

      // Calculate speedup
      results.speedup[count] = results.javascript[count] / results.wasm[count];
    }

    // Calculate average speedup
    const avgSpeedup =
      Object.values(results.speedup).reduce((sum, val) => sum + val, 0) / segmentCounts.length;

    // Calculate improvement percentage
    const avgImprovement = (avgSpeedup - 1) * 100;

    this.results.set('wasm_text_assembly', results);
    this.recordBaseline('wasm_text_assembly_speedup', avgSpeedup);

    logger.log(`\n  Results by segment count:`);
    for (const count of segmentCounts) {
      logger.log(
        `    ${count} segments: ${results.speedup[count].toFixed(2)}x speedup (JS: ${results.javascript[count].toFixed(3)}ms, WASM: ${results.wasm[count].toFixed(3)}ms)`
      );
    }

    logger.log(
      `\n  Average speedup: ${avgSpeedup.toFixed(2)}x (${avgImprovement.toFixed(1)}% improvement) ${avgImprovement >= 30 ? '✅' : '⚠️'}`
    );
    logger.log(
      `  Target: 30-50% improvement | Current: ${avgImprovement.toFixed(1)}% | ${avgImprovement >= 30 ? '✅ TARGET MET' : '❌ NEEDS IMPROVEMENT'}`
    );
  }

  /**
   * Benchmark #12: V8 Hidden Class Optimization (Task #8)
   * Compares dynamic Object.keys/values vs typed iteration
   */
  async benchmarkV8Optimization() {
    logger.log('\n📊 Benchmark #12: V8 Hidden Class Optimization (Task #8)');
    logger.log('  Testing: Dynamic Object.keys vs typed iteration');

    const {
      createTypedIterator,
      benchmarkPropertyAccess,
      segmentIterator,
      memoryStatsIterator,
      performanceMetricsIterator,
    } = await import('./__benchmarks__/V8OptimizationUtils.js');

    const results = {
      segmentAccess: { dynamic: 0, typed: 0, speedup: 0 },
      memoryStats: { dynamic: 0, typed: 0, speedup: 0 },
      performanceMetrics: { dynamic: 0, typed: 0, speedup: 0 },
      averageSpeedup: 0,
    };

    const iterations = 50000;

    // Test 1: Translation segment property access
    logger.log('  Testing translation segment access...');

    const testSegment = {
      originalSegment: '这是测试文本这是测试文本这是测试文本',
      translatedSegment: 'Đây là văn bản thử nghiệm',
      metadata: { phase: 4, confidence: 0.9, pattern: 'test' },
      startIndex: 0,
      endIndex: 8,
      translationSource: 'phrase',
      priority: 1,
    };

    // Dynamic Object.keys approach
    let dynamicStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const keys = Object.keys(testSegment);
      let sum = 0;
      for (const key of keys) {
        const value = testSegment[key];
        if (typeof value === 'string') {
          sum += value.length;
        } else if (typeof value === 'number') {
          sum += value;
        }
      }
    }
    results.segmentAccess.dynamic = performance.now() - dynamicStart;

    // Typed iteration approach
    let typedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      let sum = 0;
      segmentIterator.forEachProperty(testSegment, (key, value) => {
        if (typeof value === 'string') {
          sum += value.length;
        } else if (typeof value === 'number') {
          sum += value;
        }
      });
    }
    results.segmentAccess.typed = performance.now() - typedStart;
    results.segmentAccess.speedup = results.segmentAccess.dynamic / results.segmentAccess.typed;

    // Test 2: Memory stats access
    logger.log('  Testing memory stats access...');

    const testMemoryStats = {
      totalMemory: 104857600,
      heapUsed: 52428800,
      heapTotal: 78643200,
      external: 5242880,
      arrayBuffers: 1048576,
      timestamp: Date.now(),
    };

    // Dynamic approach
    dynamicStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const values = Object.values(testMemoryStats);
      const sum = values.reduce((acc, val) => acc + val, 0);
    }
    results.memoryStats.dynamic = performance.now() - dynamicStart;

    // Typed approach
    typedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const values = memoryStatsIterator.getValues(testMemoryStats);
      const sum = values.reduce((acc, val) => acc + val, 0);
    }
    results.memoryStats.typed = performance.now() - typedStart;
    results.memoryStats.speedup = results.memoryStats.dynamic / results.memoryStats.typed;

    // Test 3: Performance metrics access
    logger.log('  Testing performance metrics access...');

    const testMetrics = {
      totalTime: 125.5,
      phase1Time: 15.2,
      phase2Time: 22.3,
      phase3Time: 18.7,
      phase4Time: 35.1,
      phase5Time: 28.4,
      dictionaryLookupTime: 5.8,
      wasmOverheadTime: 0.3,
      postProcessingTime: 12.7,
    };

    // Dynamic approach
    dynamicStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const entries = Object.entries(testMetrics);
      const result = entries.map(([key, value]) => ({ name: key, time: value }));
    }
    results.performanceMetrics.dynamic = performance.now() - dynamicStart;

    // Typed approach
    typedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const result = performanceMetricsIterator.mapProperties(testMetrics, (key, value) => ({
        name: key,
        time: value,
      }));
    }
    results.performanceMetrics.typed = performance.now() - typedStart;
    results.performanceMetrics.speedup =
      results.performanceMetrics.dynamic / results.performanceMetrics.typed;

    // Calculate average speedup and improvement
    results.averageSpeedup =
      (results.segmentAccess.speedup +
        results.memoryStats.speedup +
        results.performanceMetrics.speedup) /
      3;

    const avgImprovement = (results.averageSpeedup - 1) * 100;

    this.results.set('v8_optimization', results);
    this.recordBaseline('v8_optimization_speedup', results.averageSpeedup);

    logger.log(`\n  Results:`);
    logger.log(
      `    Segment access: ${results.segmentAccess.speedup.toFixed(2)}x speedup (Dynamic: ${results.segmentAccess.dynamic.toFixed(2)}ms, Typed: ${results.segmentAccess.typed.toFixed(2)}ms)`
    );
    logger.log(
      `    Memory stats: ${results.memoryStats.speedup.toFixed(2)}x speedup (Dynamic: ${results.memoryStats.dynamic.toFixed(2)}ms, Typed: ${results.memoryStats.typed.toFixed(2)}ms)`
    );
    logger.log(
      `    Performance metrics: ${results.performanceMetrics.speedup.toFixed(2)}x speedup (Dynamic: ${results.performanceMetrics.dynamic.toFixed(2)}ms, Typed: ${results.performanceMetrics.typed.toFixed(2)}ms)`
    );

    logger.log(
      `\n  Average speedup: ${results.averageSpeedup.toFixed(2)}x (${avgImprovement.toFixed(1)}% improvement) ${avgImprovement >= 10 ? '✅' : '⚠️'}`
    );
    logger.log(
      `  Target: 10-20% improvement | Current: ${avgImprovement.toFixed(1)}% | ${avgImprovement >= 10 ? '✅ TARGET MET' : '❌ NEEDS IMPROVEMENT'}`
    );
  }

  /**
   * Print comprehensive benchmark report
   */
  printBenchmarkReport() {
    logger.log('\n');
    logger.log('═'.repeat(60));
    logger.log('📊 OPTIMIZATION BENCHMARK REPORT');
    logger.log('═'.repeat(60));

    const wasmBoundary = this.results.get('wasm_boundary');
    const dictLookup = this.results.get('dictionary_lookup');
    const stringOps = this.results.get('string_operations');

    logger.log('\n🎯 CRITICAL OPTIMIZATION TARGETS:');
    logger.log('─'.repeat(60));

    if (wasmBoundary) {
      const current = wasmBoundary.tokenTransfer[1000];
      const target = 1.0;
      const potentialGain = ((current - target) / current) * 100;

      logger.log(`\n1. WASM Boundary (Critical #1)`);
      logger.log(`   Current: ${current.toFixed(2)}ms per 1000 tokens`);
      logger.log(`   Target: <${target}ms`);
      logger.log(`   Potential gain: ${potentialGain.toFixed(1)}% reduction`);
      logger.log(`   Status: ${current > target ? '❌ NEEDS OPTIMIZATION' : '✅ ACCEPTABLE'}`);
    }

    if (dictLookup) {
      const current = dictLookup.mapLookup.lookupsPerSecond;
      const target = current * 3;

      logger.log(`\n2. Dictionary Lookup (Critical #3)`);
      logger.log(`   Current: ${current.toFixed(0)} lookups/sec`);
      logger.log(`   Target: ${target.toFixed(0)} lookups/sec (3x with Rust)`);
      logger.log(`   Potential gain: 200% speedup`);
    }

    if (stringOps) {
      const current = stringOps.slicing.slicesPerSecond;
      const targetMin = current * 5;
      const targetMax = current * 15;

      logger.log(`\n3. String Operations (Critical #2)`);
      logger.log(`   Current: ${current.toFixed(0)} slices/sec`);
      logger.log(
        `   Target: ${targetMin.toFixed(0)}-${targetMax.toFixed(0)} ops/sec (5-15x with Rust)`
      );
      logger.log(`   Potential gain: 400-1400% speedup`);
    }

    logger.log('\n');
    logger.log('═'.repeat(60));
    logger.log('💡 Next Steps:');
    logger.log('  1. Fix WASM type boundaries (Low effort, 10-20% gain)');
    logger.log('  2. Optimize WASM serialization (Medium effort, 40-60% gain)');
    logger.log('  3. Migrate string ops to Rust (Medium effort, 5-15x gain)');
    logger.log('  4. Expose Rust trie to WASM (Medium effort, 2-4x gain)');
    logger.log('═'.repeat(60));
  }

  /**
   * Export benchmark results for analysis
   */
  exportResults() {
    return {
      timestamp: Date.now(),
      baselines: Object.fromEntries(this.baselines),
      results: Object.fromEntries(this.results),
    };
  }

  /**
   * Compare current performance against baselines
   */
  compareToBaseline() {
    logger.log('\n📈 Performance Comparison vs Baseline');
    logger.log('─'.repeat(60));

    for (const [name, baseline] of this.baselines.entries()) {
      const currentResult = this.results.get(name.replace('optimization_', ''));
      if (currentResult) {
        const improvement = ((baseline.value - currentResult) / baseline.value) * 100;
        const status =
          improvement > 0 ? '✅ IMPROVED' : improvement < -5 ? '❌ REGRESSED' : '➖ STABLE';

        logger.log(`${name}:`);
        logger.log(`  Baseline: ${baseline.value.toFixed(2)}`);
        logger.log(`  Current: ${currentResult.toFixed(2)}`);
        logger.log(`  Change: ${improvement.toFixed(1)}% ${status}`);
      }
    }
  }
}

// Export singleton instance
export const optimizationBenchmarks = new OptimizationBenchmarks();

// Development API exposure
if (process.env.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    window.optimizationBenchmarks = optimizationBenchmarks;
    window.runOptimizationBenchmarks = () => optimizationBenchmarks.runFullSuite();
  }
}
