/**
 * Debug dictionary lookup behavior
 * Test why long text behaves differently from short text
 */

async function debugLookup() {
  const engine = window.translationEngine;

  if (!engine || !engine.dictionaryManager) {
    console.error('❌ Engine or DictionaryManager not available');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Dictionary Lookup Debug');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const phrase = '那三个乞丐';

  // Test 1: Direct dictionary lookup
  console.log('1️⃣ Direct Dictionary Lookup Test:');
  console.log(`   Looking up: "${phrase}"\n`);

  // Try findAllMatches (greedy matching from position)
  const text1 = phrase;
  const fullText1 = text1;
  const position1 = 0;

  console.log('   Scenario 1: Short text (just the phrase)');
  console.log(`   Text: "${fullText1}"`);
  console.log(`   Position: ${position1}`);

  const matches1 = engine.dictionaryManager.findAllMatches(fullText1, position1);
  console.log(`   Matches found: ${matches1.length}`);
  matches1.forEach(m => {
    console.log(`      "${m.word}" → "${m.translation}" [${m.dictionary}] (length: ${m.word.length})`);
  });
  console.log('');

  // Test 2: Same phrase but in longer text
  const longText = '那三个乞丐见是韩艺他们吃剩的';
  const position2 = 0;

  console.log('   Scenario 2: Long text (phrase at start)');
  console.log(`   Text: "${longText}"`);
  console.log(`   Position: ${position2}`);

  const matches2 = engine.dictionaryManager.findAllMatches(longText, position2);
  console.log(`   Matches found: ${matches2.length}`);
  matches2.forEach(m => {
    console.log(`      "${m.word}" → "${m.translation}" [${m.dictionary}] (length: ${m.word.length})`);
  });
  console.log('');

  // Test 3: Check if phrase dictionary entry exists
  console.log('2️⃣ Check Dictionary Entries:');

  // Try all possible substrings starting from position 0
  for (let len = 1; len <= Math.min(10, longText.length); len++) {
    const substring = longText.substring(0, len);
    const matches = engine.dictionaryManager.findAllMatches(substring, 0);
    if (matches.length > 0) {
      console.log(`   "${substring}" (${len} chars):`);
      matches.forEach(m => {
        console.log(`      → "${m.translation}" [${m.dictionary}]`);
      });
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Debug complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Test actual translation
async function compareTranslations() {
  const engine = window.translationEngine;

  if (!engine) {
    console.error('❌ Engine not available');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Translation Comparison');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const shortText = '那三个乞丐';
  const longText = '那三个乞丐见是韩艺他们吃剩的，倒也不客气';

  console.log('Test 1: Short text');
  console.log(`Input: "${shortText}"`);
  const result1 = await engine.translate(shortText);
  console.log(`Output: "${result1}"`);
  console.log('');

  console.log('Test 2: Long text (same phrase at start)');
  console.log(`Input: "${longText}"`);
  const result2 = await engine.translate(longText);
  console.log(`Output: "${result2}"`);
  console.log('');

  // Extract just the first part of the translation
  const words2 = result2.split(' ');
  console.log('First 4 words of long text translation:');
  console.log(`"${words2.slice(0, 4).join(' ')}"`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Comparison complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

window.debugLookup = debugLookup;
window.compareTranslations = compareTranslations;

console.log('✅ Dictionary lookup debug loaded!');
console.log('');
console.log('Usage:');
console.log('  await debugLookup()         - Debug dictionary lookup behavior');
console.log('  await compareTranslations() - Compare short vs long text translation');
