// @ts-check
/**
 * WASM Dictionary Trie Manual Validation Utility
 *
 * Phase 3: Integration Validation
 * Run this in browser DevTools console to validate WASM vs JavaScript implementation
 *
 * Usage:
 *   1. Start dev server: npm run tauri:dev
 *   2. Open DevTools console
 *   3. Run: window.validateWasmDictionaryTrie()
 *
 * This will:
 *   - Compare WASM vs JavaScript lookups for correctness
 *   - Measure performance differences
 *   - Test with actual character dictionary (27,000+ entries)
 *   - Generate detailed validation report
 */

import {
  tokenPositionToCharPosition,
  buildFullTextFromTokens,
} from '../highlighting/PositionMappingUtils.js';

export class WasmDictionaryTrieValidator {
  /**
   * @param {any} translationEngine
   */
  constructor(translationEngine) {
    this.engine = translationEngine;
    this.results = {
      correctness: {
        total: 0,
        matches: 0,
        mismatches: 0,
        wasmOnly: 0,
        jsOnly: 0,
        bothNull: 0,
      },
      performance: {
        wasmTime: 0,
        jsTime: 0,
        positionMappingTime: 0,
        lookupCount: 0,
      },
      errors: /** @type {Array<{tokens: string, position: number, wasm: any, js: any}>} */ ([]),
    };
  }

  /**
   * Run comprehensive validation
   */
  async runValidation() {
    console.log('🚀 Starting WASM Dictionary Trie Validation...\n');

    // Check if WASM is enabled
    if (!this.engine.useWasmDictionaryTrie) {
      console.error('❌ WASM Dictionary Trie is disabled');
      console.log('   Enable with: Remove ?wasm-dictionary-trie=false from URL');
      return;
    }

    if (!this.engine.wasmCharacterTrie?.initialized) {
      console.error('❌ WASM Dictionary Trie is not initialized');
      console.log('   Make sure character dictionary is loaded');
      return;
    }

    console.log('✅ WASM Dictionary Trie is enabled and initialized\n');

    // Test 1: Single character lookups
    console.log('📝 Test 1: Single Character Lookups');
    await this.testSingleCharacters();

    // Test 2: Multi-character lookups
    console.log('\n📝 Test 2: Multi-Character Lookups');
    await this.testMultiCharacters();

    // Test 3: Real sentence translation
    console.log('\n📝 Test 3: Real Sentence Translation');
    await this.testRealSentences();

    // Test 4: Performance benchmarking
    console.log('\n📝 Test 4: Performance Benchmarking');
    await this.benchmarkPerformance();

    // Test 5: Position mapping validation
    console.log('\n📝 Test 5: Position Mapping Validation');
    await this.validatePositionMapping();

    // Generate report
    console.log('\n' + '='.repeat(60));
    this.generateReport();
  }

  /**
   * Test single character lookups
   */
  async testSingleCharacters() {
    const testChars = ['我', '你', '他', '她', '它', '好', '天', '学', '习', '不'];

    testChars.forEach((char) => {
      const tokens = [{ value: char }];
      const result = this.compareLookups(tokens, 0);

      if (result.match) {
        console.log(`  ✅ "${char}" → "${result.translation}"`);
      } else {
        console.log(`  ❌ "${char}" - MISMATCH`);
        console.log(`     WASM: ${result.wasm ? result.wasm.translation : 'null'}`);
        console.log(`     JS:   ${result.js ? result.js.translation : 'null'}`);
      }
    });
  }

  /**
   * Test multi-character lookups
   */
  async testMultiCharacters() {
    const testPhrases = ['今天', '明天', '昨天', '天气', '学习', '不知道', '怎么样', '为什么'];

    testPhrases.forEach((phrase) => {
      const tokens = [{ value: phrase }];
      const result = this.compareLookups(tokens, 0);

      if (result.match) {
        console.log(`  ✅ "${phrase}" → "${result.translation}"`);
      } else {
        console.log(`  ❌ "${phrase}" - MISMATCH`);
      }
    });
  }

  /**
   * Test real sentence translation
   */
  async testRealSentences() {
    const testSentences = [
      '我今天学习',
      '明天天气好',
      '我不知道怎么样',
      '他非常好',
      '她学习很认真',
    ];

    testSentences.forEach((sentence) => {
      const tokens = sentence.split('').map((char) => ({ value: char }));
      let sentenceMatches = true;
      let lookupResults = [];

      for (let pos = 0; pos < tokens.length; pos++) {
        const result = this.compareLookups(tokens, pos);

        if (!result.match) {
          sentenceMatches = false;
        }

        if (result.wasm) {
          lookupResults.push(`"${result.wasm.word}" → "${result.wasm.translation}"`);
          pos += result.wasm.tokenLength - 1; // Skip matched tokens
        }
      }

      if (sentenceMatches) {
        console.log(`  ✅ "${sentence}"`);
        lookupResults.forEach((r) => console.log(`     ${r}`));
      } else {
        console.log(`  ❌ "${sentence}" - MISMATCH`);
      }
    });
  }

  /**
   * Benchmark WASM vs JavaScript performance
   */
  async benchmarkPerformance() {
    const iterations = 1000;
    const testSentence = '我今天学习不知道怎么样非常好';
    const tokens = testSentence.split('').map((char) => ({ value: char }));
    // Get dictionary for JavaScript comparison
    const dictionary = this.engine.dictionaryManager.getDictionary('characters');
    if (!dictionary) {
      console.log('  ⚠️ Character dictionary not available');
      return;
    }

    console.log(`  Running ${iterations} iterations...`);

    // Warm up
    for (let i = 0; i < 10; i++) {
      this.wasmLookup(tokens, 0);
      this.jsLookup(tokens, 0, dictionary);
    }

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < tokens.length; pos++) {
        this.wasmLookup(tokens, pos);
      }
    }
    const wasmTime = performance.now() - wasmStart;

    // Benchmark JavaScript
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < tokens.length; pos++) {
        this.jsLookup(tokens, pos, dictionary);
      }
    }
    const jsTime = performance.now() - jsStart;

    // Benchmark position mapping
    const mappingStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (let pos = 0; pos < tokens.length; pos++) {
        tokenPositionToCharPosition(tokens, pos);
        buildFullTextFromTokens(tokens);
      }
    }
    const mappingTime = performance.now() - mappingStart;

    this.results.performance.wasmTime = wasmTime;
    this.results.performance.jsTime = jsTime;
    this.results.performance.positionMappingTime = mappingTime;
    this.results.performance.lookupCount = iterations * tokens.length;

    const speedup = jsTime / wasmTime;
    const mappingOverhead = (mappingTime / wasmTime) * 100;

    console.log(`\n  📊 Performance Results (${iterations} iterations):`);
    console.log(`     WASM:              ${wasmTime.toFixed(2)}ms`);
    console.log(`     JavaScript:        ${jsTime.toFixed(2)}ms`);
    console.log(`     Position Mapping:  ${mappingTime.toFixed(2)}ms`);
    console.log(`     Speedup:           ${speedup.toFixed(2)}x`);
    console.log(`     Mapping Overhead:  ${mappingOverhead.toFixed(1)}%`);
  }

  /**
   * Validate position mapping accuracy
   */
  async validatePositionMapping() {
    const testCases = [
      {
        tokens: [{ value: '我' }, { value: '今天' }, { value: '学习' }],
        expected: [0, 1, 3], // Character positions
      },
      {
        tokens: [{ value: '今天' }, { value: '天气' }, { value: '好' }],
        expected: [0, 2, 4],
      },
      {
        tokens: [{ value: '😀' }, { value: '你好' }, { value: '👋' }],
        expected: [0, 2, 4], // Emoji = 2 UTF-16 code units
      },
    ];

    let allCorrect = true;

    testCases.forEach(({ tokens, expected }, idx) => {
      const actual = tokens.map((_, pos) => tokenPositionToCharPosition(tokens, pos));

      const matches = actual.every((val, i) => val === expected[i]);

      if (matches) {
        console.log(`  ✅ Test case ${idx + 1}: Position mapping correct`);
      } else {
        console.log(`  ❌ Test case ${idx + 1}: Position mapping INCORRECT`);
        console.log(`     Expected: [${expected.join(', ')}]`);
        console.log(`     Actual:   [${actual.join(', ')}]`);
        allCorrect = false;
      }
    });

    if (allCorrect) {
      console.log('\n  ✅ All position mapping tests passed');
    }
  }

  /**
   * Compare WASM vs JavaScript lookup for a single position
   * @param {any} tokens
   * @param {any} position
   */
  compareLookups(tokens, position) {
    const dictionary = this.engine.dictionaryManager.getDictionary('characters');

    // WASM lookup
    const wasm = this.wasmLookup(tokens, position);

    // JavaScript lookup
    const js = this.jsLookup(tokens, position, dictionary);

    // Compare results
    const match = this.compareResults(wasm, js);

    // Update stats
    this.results.correctness.total++;
    if (match) {
      this.results.correctness.matches++;
      if (wasm === null && js === null) {
        this.results.correctness.bothNull++;
      }
    } else {
      this.results.correctness.mismatches++;
      if (wasm && !js) this.results.correctness.wasmOnly++;
      if (!wasm && js) this.results.correctness.jsOnly++;

      this.results.errors.push({
        tokens: tokens.map((/** @type {any} */ t) => t.value).join(''),
        position,
        wasm,
        js,
      });
    }

    return {
      match,
      wasm,
      js,
      translation: wasm?.translation || js?.translation,
    };
  }

  /**
   * WASM lookup wrapper
   * @param {any} tokens
   * @param {any} position
   */
  wasmLookup(tokens, position) {
    try {
      return this.engine.tryWasmDictionaryLookup(tokens, position, 'characters');
    } catch (error) {
      return null;
    }
  }

  /**
   * JavaScript lookup (original implementation)
   * @param {any} tokens
   * @param {any} position
   * @param {any} dictionary
   */
  jsLookup(tokens, position, dictionary) {
    if (!dictionary) return null;

    let bestMatch = null;
    let maxLength = 0;

    for (let length = 1; length <= Math.min(10, tokens.length - position); length++) {
      const tokenSequence = tokens.slice(position, position + length);
      const text = tokenSequence.map((/** @type {any} */ t) => t.value).join('');
      const result = dictionary.get(text);

      if (result) {
        if (length > maxLength) {
          maxLength = length;
          bestMatch = {
            word: text,
            translation: typeof result === 'string' ? result : result.translation,
            tokenLength: length,
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Compare two lookup results
   * @param {any} wasm
   * @param {any} js
   */
  compareResults(wasm, js) {
    // Both null
    if (wasm === null && js === null) return true;

    // One null, one not
    if ((wasm === null) !== (js === null)) return false;

    // Both have results - compare
    return (
      wasm.word === js.word &&
      wasm.translation === js.translation &&
      wasm.tokenLength === js.tokenLength
    );
  }

  /**
   * Generate validation report
   */
  generateReport() {
    console.log('📊 VALIDATION REPORT');
    console.log('='.repeat(60));

    // Correctness
    console.log('\n🎯 Correctness:');
    console.log(`   Total Comparisons: ${this.results.correctness.total}`);
    console.log(`   Matches:           ${this.results.correctness.matches}`);
    console.log(`   Mismatches:        ${this.results.correctness.mismatches}`);
    console.log(`   Both Null:         ${this.results.correctness.bothNull}`);
    console.log(`   WASM Only:         ${this.results.correctness.wasmOnly}`);
    console.log(`   JavaScript Only:   ${this.results.correctness.jsOnly}`);

    const accuracy =
      this.results.correctness.total > 0
        ? (this.results.correctness.matches / this.results.correctness.total) * 100
        : 0;
    console.log(`   Accuracy:          ${accuracy.toFixed(2)}%`);

    // Performance
    if (this.results.performance.lookupCount > 0) {
      console.log('\n⚡ Performance:');
      console.log(`   WASM Time:         ${this.results.performance.wasmTime.toFixed(2)}ms`);
      console.log(`   JavaScript Time:   ${this.results.performance.jsTime.toFixed(2)}ms`);
      console.log(
        `   Position Mapping:  ${this.results.performance.positionMappingTime.toFixed(2)}ms`
      );

      const speedup = this.results.performance.jsTime / this.results.performance.wasmTime;
      console.log(`   Speedup:           ${speedup.toFixed(2)}x`);

      const overhead =
        (this.results.performance.positionMappingTime / this.results.performance.wasmTime) * 100;
      console.log(`   Mapping Overhead:  ${overhead.toFixed(1)}%`);
    }

    // Errors
    if (this.results.errors.length > 0) {
      console.log('\n❌ Mismatches Found:');
      this.results.errors.slice(0, 10).forEach((error, idx) => {
        console.log(`\n   ${idx + 1}. Text: "${error.tokens}", Position: ${error.position}`);
        console.log(
          `      WASM: ${error.wasm ? `"${error.wasm.word}" → "${error.wasm.translation}"` : 'null'}`
        );
        console.log(
          `      JS:   ${error.js ? `"${error.js.word}" → "${error.js.translation}"` : 'null'}`
        );
      });

      if (this.results.errors.length > 10) {
        console.log(`\n   ... and ${this.results.errors.length - 10} more`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    if (this.results.correctness.mismatches === 0) {
      console.log('✅ VALIDATION PASSED - WASM matches JavaScript perfectly!');
    } else {
      console.log(
        `⚠️ VALIDATION INCOMPLETE - ${this.results.correctness.mismatches} mismatches found`
      );
    }

    if (this.results.performance.lookupCount > 0) {
      const speedup = this.results.performance.jsTime / this.results.performance.wasmTime;
      if (speedup >= 2) {
        console.log(`✅ PERFORMANCE TARGET MET - ${speedup.toFixed(2)}x speedup achieved!`);
      } else {
        console.log(`⚠️ PERFORMANCE BELOW TARGET - ${speedup.toFixed(2)}x speedup (target: 2-4x)`);
      }
    }

    console.log('='.repeat(60));
  }
}

/**
 * Global validation function
 * Call this from DevTools console: window.validateWasmDictionaryTrie()
 */
export async function validateWasmDictionaryTrie() {
  // @ts-ignore - window.translationEngine is set at runtime
  if (!window.translationEngine) {
    console.error('❌ Translation engine not found');
    console.log("   Make sure you're in the Translator tab and dictionaries are loaded");
    return;
  }

  // @ts-ignore
  const validator = new WasmDictionaryTrieValidator(window.translationEngine);
  await validator.runValidation();
}
