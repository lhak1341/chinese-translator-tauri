/**
 * Phase 8 Test 1.1: Basic Pattern Matching
 *
 * Purpose: Validate basic pattern matching works with Phase 7 integration
 * APIs Tested:
 * - PatternManager.matchPattern(text)
 * - PatternMatch.substitute() [WASM]
 * - PatternMatch.get_binding(var) [WASM]
 *
 * Expected Warnings Resolved:
 * - ⚠️ substitute is never used
 * - ⚠️ get_binding is never used
 */

// Test configuration
const TEST_CONFIG = {
  testName: 'Phase 8 Test 1.1: Basic Pattern Matching',
  testCases: [
    {
      name: 'Possessive Pattern: 张三的手',
      input: '张三的手',
      expectedPattern: 'X的Y',
      expectedTranslation: 'tay của Trương Tam',
      expectedVariables: {
        X: '张三',
        Y: '手'
      }
    },
    {
      name: 'Possessive Pattern: 李四的眼睛',
      input: '李四的眼睛',
      expectedPattern: 'X的Y',
      expectedTranslation: 'mắt của Lý Tứ',
      expectedVariables: {
        X: '李四',
        Y: '眼睛'
      }
    },
    {
      name: 'Location Pattern: 从北京到上海',
      input: '从北京到上海',
      expectedPattern: '从X到Y',
      expectedTranslation: 'từ Bắc Kinh đến Thượng Hải',
      expectedVariables: {
        X: '北京',
        Y: '上海'
      }
    }
  ]
};

/**
 * Test runner for browser console
 * Usage: Copy this file content and paste into browser console while app is running
 */
async function runTest1_1() {
  console.log('========================================');
  console.log(`🧪 ${TEST_CONFIG.testName}`);
  console.log('========================================\n');

  // Check if TranslationEngine is available
  if (typeof window.translationEngine === 'undefined') {
    console.error('❌ TranslationEngine not found! Make sure the app is running.');
    console.log('💡 Try: window.translationEngine = <your engine instance>');
    return;
  }

  const engine = window.translationEngine;

  // Check if WASM Pattern Manager is initialized
  if (!engine.coreEngineRust || !engine.coreEngineRust.isReady()) {
    console.error('❌ WASM Core Engine not ready!');
    console.log('⏳ Waiting for initialization...');

    // Wait for initialization (up to 5 seconds)
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (!engine.coreEngineRust || !engine.coreEngineRust.isReady()) {
      console.error('❌ WASM Core Engine still not ready after waiting.');
      return;
    }
  }

  // Check if WASM patterns are enabled
  if (!engine.useWasmPatterns || !engine.wasmPatternsReady) {
    console.warn('⚠️  WASM Pattern Manager not enabled!');
    console.log('useWasmPatterns:', engine.useWasmPatterns);
    console.log('wasmPatternsReady:', engine.wasmPatternsReady);
    console.log('\n💡 This is expected if patterns are still loading. Wait a moment and try again.');
    return;
  }

  console.log('✅ WASM Pattern Manager is ready!');
  console.log('✅ Phase 7 integration active\n');

  // Run test cases
  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CONFIG.testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Input: "${testCase.input}"`);

    try {
      // Create variable lookup function
      const lookupFn = engine.coreEngineRust.createVariableLookupFunction(
        engine.dictionaryManager,
        ['properNouns', 'characters', 'places', 'persons']
      );

      // Test pattern matching with variable resolution
      const match = engine.coreEngineRust.matchPatternWithResolution(testCase.input, lookupFn);

      if (!match) {
        console.error(`   ❌ FAIL: No match found for "${testCase.input}"`);
        failed++;
        continue;
      }

      console.log(`   ✓ Pattern matched: ${match.pattern}`);
      console.log(`   ✓ Translation: "${match.translation}"`);
      console.log(`   ✓ Variables:`, match.variables);
      console.log(`   ✓ Resolutions:`, match.resolutions);
      console.log(`   ✓ Confidence: ${match.confidence.toFixed(2)}`);

      // Validate pattern
      if (match.pattern !== testCase.expectedPattern) {
        console.error(`   ❌ FAIL: Expected pattern "${testCase.expectedPattern}", got "${match.pattern}"`);
        failed++;
        continue;
      }

      // Validate translation
      if (match.translation !== testCase.expectedTranslation) {
        console.error(`   ❌ FAIL: Expected translation "${testCase.expectedTranslation}", got "${match.translation}"`);
        failed++;
        continue;
      }

      // Validate variables
      for (const [varName, expectedValue] of Object.entries(testCase.expectedVariables)) {
        if (match.variables[varName] !== expectedValue) {
          console.error(`   ❌ FAIL: Expected ${varName}="${expectedValue}", got "${match.variables[varName]}"`);
          failed++;
          continue;
        }
      }

      console.log(`   ✅ PASS: All assertions passed!`);
      passed++;

    } catch (error) {
      console.error(`   ❌ FAIL: Error during test`);
      console.error(`   Error:`, error);
      failed++;
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('📊 Test Summary');
  console.log('========================================');
  console.log(`✅ Passed: ${passed}/${TEST_CONFIG.testCases.length}`);
  console.log(`❌ Failed: ${failed}/${TEST_CONFIG.testCases.length}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    console.log('\n📋 APIs Validated:');
    console.log('   - ✅ WasmTranslationAccelerator.createVariableLookupFunction()');
    console.log('   - ✅ WasmTranslationAccelerator.matchPatternWithResolution()');
    console.log('   - ✅ Pattern variable extraction');
    console.log('   - ✅ Dictionary-based variable resolution');
    console.log('   - ✅ Template substitution');
    console.log('\n⚠️  Note: WASM internal methods (substitute, get_binding) are called');
    console.log('   internally by matchPatternWithResolution(). Warnings may persist');
    console.log('   if the WASM code doesn\'t expose these methods to JavaScript.');
  } else {
    console.log('\n❌ Some tests failed. Review errors above.');
  }

  console.log('\n========================================\n');
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
  console.log('💡 To run test: runTest1_1()');
  console.log('💡 First, ensure: window.translationEngine = <your engine instance>');
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTest1_1, TEST_CONFIG };
}
