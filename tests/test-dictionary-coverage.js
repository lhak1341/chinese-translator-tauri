/**
 * Test Dictionary Coverage - Check which dictionaries are loaded and working
 * Run this in the browser console after the app loads
 */

async function checkDictionaryStatus() {
  const engine = window.translationEngine;

  if (!engine) {
    console.error('❌ TranslationEngine not available');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📚 Dictionary Status Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check JavaScript DictionaryManager
  if (engine.dictionaryManager) {
    console.log('✅ JavaScript DictionaryManager:');
    const dicts = engine.dictionaryManager.dictionaries || {};

    for (const [name, entries] of Object.entries(dicts)) {
      if (Array.isArray(entries)) {
        console.log(`   ${name}: ${entries.length} entries`);

        // Show first 3 entries as sample
        if (entries.length > 0) {
          console.log(`      Sample entries:`);
          entries.slice(0, 3).forEach(entry => {
            const chinese = entry.chinese || entry.original || entry.word || '?';
            const vietnamese = entry.vietnamese || entry.translation || '?';
            console.log(`        "${chinese}" → "${vietnamese}"`);
          });
        }
      }
    }
    console.log('');
  }

  // Check WASM Core Engine
  if (engine.coreEngineRust && engine.coreEngineRust.isReady()) {
    console.log('✅ WASM Core Engine:');

    try {
      const stats = engine.coreEngineRust.rustEngine.get_stats();
      console.log('   Stats:', stats);
      console.log('');
    } catch (error) {
      console.log('   ⚠️  Could not get WASM stats:', error.message);
    }
  } else {
    console.log('❌ WASM Core Engine: Not available');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function testSpecificPhrase(chinese, expectedVietnamese = null) {
  const engine = window.translationEngine;

  if (!engine) {
    console.error('❌ TranslationEngine not available');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔍 Testing: "${chinese}"`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Test 1: Direct dictionary lookup (JavaScript)
  console.log('\n1️⃣ JavaScript Dictionary Lookup:');
  if (engine.dictionaryManager) {
    const jsResult = engine.dictionaryManager.lookupWord(chinese);
    if (jsResult && jsResult.length > 0) {
      console.log(`   ✅ Found in JavaScript:`);
      jsResult.forEach(match => {
        console.log(`      "${match.word}" → "${match.translation}" [${match.dictionary}]`);
      });
    } else {
      console.log(`   ❌ NOT found in JavaScript dictionaries`);
    }
  }

  // Test 2: WASM dictionary lookup
  console.log('\n2️⃣ WASM Dictionary Lookup:');
  if (engine.coreEngineRust && engine.coreEngineRust.isReady()) {
    try {
      // Try batch lookup
      const positions = [{
        position: 0,
        max_length: chinese.length,
        dictionaries: null // Use all dictionaries
      }];

      const wasmResult = await engine.coreEngineRust.batchDictionaryLookup(positions, chinese);

      if (wasmResult && wasmResult.results && wasmResult.results[0]) {
        const matches = wasmResult.results[0].matches;
        if (matches && matches.length > 0) {
          console.log(`   ✅ Found in WASM:`);
          matches.forEach(match => {
            console.log(`      "${match.word}" → "${match.translation}" [${match.dictionary}]`);
          });
        } else {
          console.log(`   ❌ NOT found in WASM dictionaries`);
        }
      } else {
        console.log(`   ❌ NOT found in WASM dictionaries`);
      }
    } catch (error) {
      console.log(`   ❌ WASM lookup failed:`, error.message);
    }
  }

  // Test 3: Full translation
  console.log('\n3️⃣ Full Translation:');
  try {
    const translation = await engine.translate(chinese);
    console.log(`   Result: "${translation}"`);

    if (expectedVietnamese) {
      if (translation === expectedVietnamese) {
        console.log(`   ✅ CORRECT (matches expected: "${expectedVietnamese}")`);
      } else {
        console.log(`   ❌ INCORRECT`);
        console.log(`   Expected: "${expectedVietnamese}"`);
        console.log(`   Got:      "${translation}"`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Translation failed:`, error.message);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function runCommonPhrasesTest() {
  console.log('\n🧪 Testing Common Phrases Recognition\n');

  // Test several common phrases
  const testCases = [
    { chinese: '你好', expected: 'xin chào' },
    { chinese: '谢谢', expected: 'cảm ơn' },
    { chinese: '对不起', expected: 'xin lỗi' },
    { chinese: '没关系', expected: 'không sao' },
    { chinese: '再见', expected: 'tạm biệt' }
  ];

  for (const testCase of testCases) {
    await testSpecificPhrase(testCase.chinese, testCase.expected);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// Export functions to window
window.checkDictionaryStatus = checkDictionaryStatus;
window.testSpecificPhrase = testSpecificPhrase;
window.runCommonPhrasesTest = runCommonPhrasesTest;

console.log('✅ Dictionary coverage test loaded!');
console.log('');
console.log('Usage:');
console.log('  await checkDictionaryStatus()              - Check which dictionaries are loaded');
console.log('  await testSpecificPhrase("你好")           - Test if a specific phrase is recognized');
console.log('  await testSpecificPhrase("你好", "xin chào") - Test with expected translation');
console.log('  await runCommonPhrasesTest()               - Test common phrases recognition');
