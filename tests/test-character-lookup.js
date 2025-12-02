/**
 * Debug why "三" translates differently in long vs short text
 */

async function debugCharacterLookup() {
  const engine = window.translationEngine;

  if (!engine || !engine.dictionaryManager) {
    console.error('❌ Engine not available');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Character Lookup Debug: "三"');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Test all possible lookups for characters in "那三个乞丐"
  const chars = ['那', '三', '个', '乞', '丐'];

  for (const char of chars) {
    console.log(`Character: "${char}"`);

    const matches = engine.dictionaryManager.findAllMatches(char, 0);
    console.log(`  Found ${matches.length} matches:`);

    matches.forEach(m => {
      console.log(`    "${m.word}" → "${m.translation}" [${m.dictionary}] (priority: ${m.priority || '?'})`);
    });
    console.log('');
  }

  // Now test the full phrase
  console.log('Full phrase: "那三个乞丐"');
  const phraseMatches = engine.dictionaryManager.findAllMatches('那三个乞丐', 0);
  console.log(`  Found ${phraseMatches.length} matches:`);
  phraseMatches.forEach(m => {
    console.log(`    "${m.word}" → "${m.translation}" [${m.dictionary}] (priority: ${m.priority || '?'})`);
  });
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

window.debugCharacterLookup = debugCharacterLookup;

console.log('✅ Character lookup debug loaded!');
console.log('Run: await debugCharacterLookup()');
