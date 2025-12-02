/**
 * Diagnostic test to check why Common Phrases aren't working
 * Run this in browser console
 */

async function diagnoseCommonPhrases() {
  const engine = window.translationEngine;

  if (!engine) {
    console.error('❌ TranslationEngine not available');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 Common Phrases Diagnostic');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Check what dictionaries exist
  console.log('1️⃣ Checking loaded dictionaries...\n');

  if (engine.dictionaryManager && engine.dictionaryManager.dictionaries) {
    const dicts = engine.dictionaryManager.dictionaries;
    console.log('Available dictionaries:');
    for (const [name, entries] of Object.entries(dicts)) {
      if (Array.isArray(entries)) {
        console.log(`   ✓ "${name}": ${entries.length} entries`);
      }
    }
    console.log('');

    // Step 2: Check if "那三个乞丐" exists in ANY dictionary
    console.log('2️⃣ Searching for "那三个乞丐" in all dictionaries...\n');

    let found = false;
    for (const [dictName, entries] of Object.entries(dicts)) {
      if (Array.isArray(entries)) {
        const match = entries.find(entry => {
          const chinese = entry.chinese || entry.original || entry.word || '';
          return chinese === '那三个乞丐';
        });

        if (match) {
          found = true;
          const vietnamese = match.vietnamese || match.translation || '?';
          console.log(`   ✅ FOUND in "${dictName}":`);
          console.log(`      "${match.chinese || match.original || match.word}" → "${vietnamese}"`);
        }
      }
    }

    if (!found) {
      console.log('   ❌ NOT FOUND in any dictionary!');
      console.log('   ⚠️  This is the problem - you need to add "那三个乞丐" to Common Phrases');
    }
    console.log('');

    // Step 3: Check what dictionary handles phrases like this
    console.log('3️⃣ Checking Common Phrases dictionary specifically...\n');

    const possibleNames = ['commonPhrases', 'Common Phrases', 'phrases', 'Phrases'];
    let phrasesDict = null;
    let phrasesDictName = null;

    for (const name of possibleNames) {
      if (dicts[name]) {
        phrasesDict = dicts[name];
        phrasesDictName = name;
        break;
      }
    }

    if (phrasesDict) {
      console.log(`   ✅ Found phrases dictionary: "${phrasesDictName}"`);
      console.log(`      Total entries: ${phrasesDict.length}`);

      // Check for similar entries
      const similar = phrasesDict.filter(entry => {
        const chinese = entry.chinese || entry.original || entry.word || '';
        return chinese.includes('三个') || chinese.includes('乞丐');
      });

      if (similar.length > 0) {
        console.log(`\n   Similar entries containing "三个" or "乞丐":`);
        similar.slice(0, 10).forEach(entry => {
          const chinese = entry.chinese || entry.original || entry.word || '';
          const vietnamese = entry.vietnamese || entry.translation || '';
          console.log(`      "${chinese}" → "${vietnamese}"`);
        });
        if (similar.length > 10) {
          console.log(`      ... and ${similar.length - 10} more`);
        }
      }
    } else {
      console.log('   ❌ No Common Phrases dictionary found!');
      console.log('   Available names:', Object.keys(dicts).join(', '));
    }
    console.log('');
  }

  // Step 4: Check WASM cache status
  console.log('4️⃣ Checking WASM cache configuration...\n');

  if (engine.coreEngineRust && engine.coreEngineRust.isReady()) {
    try {
      const stats = engine.coreEngineRust.rustEngine.get_stats();
      console.log('   WASM Stats:', stats);
    } catch (error) {
      console.log('   ⚠️  Could not get WASM stats:', error.message);
    }
  }
  console.log('');

  // Step 5: Test direct lookup
  console.log('5️⃣ Testing direct lookup for "那三个乞丐"...\n');

  if (engine.dictionaryManager) {
    const result = engine.dictionaryManager.lookupWord('那三个乞丐');
    if (result && result.length > 0) {
      console.log('   ✅ JavaScript lookup found:');
      result.forEach(match => {
        console.log(`      "${match.word}" → "${match.translation}" [${match.dictionary}]`);
      });
    } else {
      console.log('   ❌ JavaScript lookup: NOT FOUND');
    }
  }
  console.log('');

  // Step 6: Test WASM lookup
  console.log('6️⃣ Testing WASM lookup for "那三个乞丐"...\n');

  if (engine.coreEngineRust && engine.coreEngineRust.isReady()) {
    try {
      const text = '那三个乞丐';
      const positions = [{
        position: 0,
        max_length: text.length,
        dictionaries: null
      }];

      const wasmResult = await engine.coreEngineRust.batchDictionaryLookup(positions, text);

      if (wasmResult && wasmResult.results && wasmResult.results[0]) {
        const matches = wasmResult.results[0].matches;
        if (matches && matches.length > 0) {
          console.log('   ✅ WASM lookup found:');
          matches.forEach(match => {
            console.log(`      "${match.word}" → "${match.translation}" [${match.dictionary}] (priority: ${match.priority})`);
          });
        } else {
          console.log('   ❌ WASM lookup: NOT FOUND');
        }
      }
    } catch (error) {
      console.log('   ❌ WASM lookup failed:', error.message);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Diagnosis complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Export to window
window.diagnoseCommonPhrases = diagnoseCommonPhrases;

console.log('✅ Diagnostic test loaded!');
console.log('Run: await diagnoseCommonPhrases()');
