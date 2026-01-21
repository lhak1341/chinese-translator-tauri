/**
 * Pattern Processing Parity Test
 *
 * Verifies that Rust WASM and JavaScript implementations produce identical results
 * by running both processors on the same input and comparing outputs.
 *
 * Usage in browser console:
 *   window.testPatternParity("从武技上")
 *   window.runAllParityTests()
 */

import { isWasmPatternProcessorAvailable } from './WasmPatternProcessor.js';
import { logger } from './logger.js';

/**
 * Test cases covering critical pattern matching scenarios
 */
export const PARITY_TEST_CASES = [
  {
    name: 'Simple variable pattern',
    input: '从武技上',
    pattern: '从X上',
    expectedMatch: true,
    description: 'Basic single-variable pattern matching',
  },
  {
    name: 'Overlapping patterns (competition)',
    input: '在那些魔帅眼中',
    patterns: ['在XY中', '在X眼中'],
    expectedWinner: '在X眼中',
    description: 'Pattern priority calculation with lowPriority flag',
  },
  {
    name: 'Hierarchical composition',
    input: '在这可怕的声波振荡之中',
    description: 'Phase A result absorbed into Phase B pattern',
  },
  {
    name: 'Multiple non-overlapping patterns',
    input: '这些强大的武技都很厉害',
    description: 'Multiple Phase B patterns without overlap',
  },
  {
    name: 'Identical position filtering',
    input: '从上',
    description: 'Tests duplicate position check in hierarchical composition',
  },
  {
    name: 'Empty input',
    input: '',
    expectedMatch: false,
    description: 'Edge case: empty token array',
  },
];

/**
 * Compare two pattern processing results
 * @param {Array} wasmResults - Results from Rust WASM processor
 * @param {Array} jsResults - Results from JavaScript processor
 * @returns {Object} Comparison result with differences
 */
export function comparePatternResults(wasmResults, jsResults) {
  const differences = [];

  // Check result count
  if (wasmResults.length !== jsResults.length) {
    differences.push({
      type: 'result_count',
      wasm: wasmResults.length,
      js: jsResults.length,
      message: `Result count mismatch: WASM=${wasmResults.length}, JS=${jsResults.length}`,
    });
  }

  // Compare each result
  const maxLength = Math.max(wasmResults.length, jsResults.length);
  for (let i = 0; i < maxLength; i++) {
    const wasmResult = wasmResults[i];
    const jsResult = jsResults[i];

    if (!wasmResult) {
      differences.push({
        type: 'missing_wasm_result',
        index: i,
        jsResult,
        message: `WASM missing result at index ${i}`,
      });
      continue;
    }

    if (!jsResult) {
      differences.push({
        type: 'missing_js_result',
        index: i,
        wasmResult,
        message: `JavaScript missing result at index ${i}`,
      });
      continue;
    }

    // Compare originalText
    if (wasmResult.originalText !== jsResult.originalText) {
      differences.push({
        type: 'original_text',
        index: i,
        wasm: wasmResult.originalText,
        js: jsResult.originalText,
        message: `Original text mismatch at index ${i}`,
      });
    }

    // Compare translation
    if (wasmResult.translation !== jsResult.translation) {
      differences.push({
        type: 'translation',
        index: i,
        wasm: wasmResult.translation,
        js: jsResult.translation,
        message: `Translation mismatch at index ${i}`,
      });
    }

    // Compare indices
    if (
      wasmResult.startIndex !== jsResult.startIndex ||
      wasmResult.endIndex !== jsResult.endIndex
    ) {
      differences.push({
        type: 'indices',
        index: i,
        wasm: `[${wasmResult.startIndex}, ${wasmResult.endIndex}]`,
        js: `[${jsResult.startIndex}, ${jsResult.endIndex}]`,
        message: `Index range mismatch at index ${i}`,
      });
    }

    // Compare source
    if (wasmResult.source !== jsResult.source) {
      differences.push({
        type: 'source',
        index: i,
        wasm: wasmResult.source,
        js: jsResult.source,
        message: `Source mismatch at index ${i}`,
      });
    }

    // Compare pattern originalPattern
    const wasmPattern = wasmResult.pattern?.originalPattern;
    const jsPattern = jsResult.pattern?.originalPattern;
    if (wasmPattern !== jsPattern) {
      differences.push({
        type: 'pattern',
        index: i,
        wasm: wasmPattern,
        js: jsPattern,
        message: `Pattern mismatch at index ${i}`,
      });
    }
  }

  return {
    identical: differences.length === 0,
    differences,
    summary:
      differences.length === 0
        ? '✅ Results are identical'
        : `❌ Found ${differences.length} difference(s)`,
  };
}

/**
 * Run parity test on a single input string
 * Requires access to TwoPhasePatternProcessor instance
 *
 * @param {string} input - Chinese text to test
 * @param {Object} processor - TwoPhasePatternProcessor instance
 * @returns {Object} Test result with comparison
 */
export async function testPatternParity(input, processor) {
  if (!processor) {
    throw new Error('TwoPhasePatternProcessor instance required');
  }

  logger.log(`\n🧪 Testing parity for: "${input}"`);

  // Get tokens (simplified - in real app, use proper tokenization)
  const tokens = input.split('').map((char, i) => ({
    type: 'chinese_char',
    value: char,
    translated: null,
    translationSource: null,
    originalIndex: i,
  }));

  // Test with WASM enabled
  const originalWasmSetting = processor.options.enableWasm;

  try {
    // Run with WASM
    processor.options.enableWasm = true;
    const wasmResults = await processor.processTokens([...tokens], {});
    logger.log(`🦀 WASM: ${wasmResults.length} results`);

    // Run with JavaScript
    processor.options.enableWasm = false;
    const jsResults = await processor.processTokens([...tokens], {});
    logger.log(`📝 JavaScript: ${jsResults.length} results`);

    // Compare results
    const comparison = comparePatternResults(wasmResults, jsResults);
    logger.log(comparison.summary);

    if (!comparison.identical) {
      logger.log('Differences:');
      comparison.differences.forEach((diff) => {
        logger.log(`  ${diff.message}`);
        logger.log(`    WASM: ${JSON.stringify(diff.wasm)}`);
        logger.log(`    JS:   ${JSON.stringify(diff.js)}`);
      });
    }

    return {
      input,
      wasmResults,
      jsResults,
      comparison,
      passed: comparison.identical,
    };
  } finally {
    // Restore original setting
    processor.options.enableWasm = originalWasmSetting;
  }
}

/**
 * Run all predefined parity tests
 * @param {Object} processor - TwoPhasePatternProcessor instance
 * @returns {Object} Summary of all test results
 */
export async function runAllParityTests(processor) {
  if (!isWasmPatternProcessorAvailable()) {
    logger.error('❌ WASM Pattern Processor not available - cannot run parity tests');
    return { success: false, error: 'WASM not available' };
  }

  logger.log('🧪 Running Pattern Processing Parity Tests...\n');
  logger.log('='.repeat(60));

  const results = [];
  let passCount = 0;
  let failCount = 0;

  for (const testCase of PARITY_TEST_CASES) {
    logger.log(`\nTest: ${testCase.name}`);
    logger.log(`Description: ${testCase.description}`);

    try {
      const result = await testPatternParity(testCase.input, processor);
      results.push({ testCase, ...result });

      if (result.passed) {
        passCount++;
        logger.log('✅ PASS');
      } else {
        failCount++;
        logger.log('❌ FAIL');
      }
    } catch (error) {
      logger.error(`❌ ERROR: ${error.message}`);
      results.push({ testCase, error: error.message, passed: false });
      failCount++;
    }

    logger.log('-'.repeat(60));
  }

  logger.log('\n' + '='.repeat(60));
  logger.log(`\n📊 Test Summary: ${passCount}/${PARITY_TEST_CASES.length} passed`);

  if (failCount === 0) {
    logger.log('✅ All tests passed - Rust WASM and JavaScript implementations are equivalent!');
  } else {
    logger.log(`⚠️  ${failCount} test(s) failed - implementations differ!`);
  }

  return {
    success: failCount === 0,
    passCount,
    failCount,
    total: PARITY_TEST_CASES.length,
    results,
  };
}

// Export for console access (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.testPatternParity = testPatternParity;
  window.runAllParityTests = runAllParityTests;
  window.comparePatternResults = comparePatternResults;
}
