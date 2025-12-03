/**
 * Setup global test functions for Rust Lookup Index
 *
 * This module exposes test functions to window.testLookupIndex for easy browser console testing
 */

import { rustLookupIndexManager } from './RustLookupIndexManager.js';

/**
 * Create a simple test dictionary
 */
function createTestDictionary() {
  // Create a simple trie structure
  const trie = {
    children: {},
    isEndOfWord: false,
    translation: null,
    metadata: null,
  };

  // Helper to insert words
  const insertWord = (word, translation) => {
    let current = trie;
    for (const char of word) {
      if (!current.children[char]) {
        current.children[char] = {
          children: {},
          isEndOfWord: false,
          translation: null,
          metadata: null,
        };
      }
      current = current.children[char];
    }
    current.isEndOfWord = true;
    current.translation = translation;
  };

  // Add some test words
  insertWord('你好', 'xin chào');
  insertWord('你', 'bạn');
  insertWord('好', 'tốt');
  insertWord('世界', 'thế giới');
  insertWord('中国', 'Trung Quốc');
  insertWord('中', 'trung');
  insertWord('国', 'quốc');
  insertWord('人', 'người');
  insertWord('一', 'một');
  insertWord('二', 'hai');
  insertWord('三', 'ba');

  return trie;
}

/**
 * Run a quick test of the lookup index builder
 */
async function runQuickTest() {
  console.log('🧪 Starting Rust Lookup Index Quick Test...\n');

  // Create test data
  const testText = '你好世界，我是中国人。一二三四五。';
  const testDictionaries = {
    'test-dict': createTestDictionary(),
  };
  const testDictionaryOrder = ['test-dict'];

  console.log('📝 Test Input:');
  console.log(`   Text: "${testText}"`);
  console.log(`   Text length: ${testText.length} characters\n`);

  try {
    console.log('⏱️  Building lookup index...');
    const startTime = performance.now();

    const result = await rustLookupIndexManager.buildLookupIndex(
      testText,
      testDictionaries,
      testDictionaryOrder,
      {
        minTextLength: 1, // Allow short test texts
        enableIndexing: true,
        useParallel: true,
      }
    );

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    console.log(`✅ Build completed in ${totalTime.toFixed(2)}ms\n`);

    if (result.success) {
      console.log('📊 Results:');
      console.log(`   ✅ Success: true`);
      console.log(`   🦀 Rust build time: ${result.buildTimeMs}ms`);
      console.log(`   ⏱️  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`   📍 Positions indexed: ${result.positionsIndexed}`);
      console.log(`   🔍 Total matches: ${result.indexSize}`);
      console.log(`   💾 Index size: ${Object.keys(result.index).length} positions\n`);

      // Show sample matches
      console.log('🔍 Sample Matches (first 5):');
      let sampleCount = 0;
      for (const [position, categorized] of Object.entries(result.index)) {
        if (sampleCount >= 5) break;

        const posNum = parseInt(position);
        const char = testText.charAt(posNum);

        const allMatches = [
          ...categorized.patterns,
          ...categorized.proper_nouns,
          ...categorized.phrases,
          ...categorized.characters,
          ...categorized.numbers,
        ];

        if (allMatches.length > 0) {
          console.log(`   Position ${position} ('${char}'):`);
          allMatches.forEach((match) => {
            console.log(`      "${match.word}" → "${match.translation}"`);
          });
          sampleCount++;
        }
      }

      console.log('\n✅ Test completed successfully!');
      return result;
    } else {
      console.error('❌ Build failed:', result.error);
      return result;
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

/**
 * Get performance stats
 */
function getStats() {
  const stats = rustLookupIndexManager.getStats();
  console.log('📈 Rust Lookup Index Statistics:');
  console.table(stats);
  return stats;
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  window.testLookupIndex = {
    run: runQuickTest,
    stats: getStats,
    manager: rustLookupIndexManager,
  };

  console.log('🧪 Lookup index test ready! Use window.testLookupIndex.run() to test');
}

export { runQuickTest, getStats };
