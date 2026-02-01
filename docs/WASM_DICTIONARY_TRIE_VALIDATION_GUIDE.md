# WASM Dictionary Trie - Manual Validation Guide

**Date**: 2026-01-31
**Phase**: 3 - Validation
**Purpose**: Step-by-step guide for validating WASM Dictionary Trie implementation

---

## 📚 Related Documentation

**Dictionary Trie Documentation Set**:

- 📋 [OPTIMIZATION_MASTER_INDEX_2026-01-31.md](OPTIMIZATION_MASTER_INDEX_2026-01-31.md) - Central tracking (see Task #4)
- 📖 [DICTIONARY_TRIE_FINAL_SUMMARY_2026-01-31.md](DICTIONARY_TRIE_FINAL_SUMMARY_2026-01-31.md) - Complete overview and decision
- 🔧 [DICTIONARY_TRIE_INTEGRATION_SESSION_2026-01-31.md](DICTIONARY_TRIE_INTEGRATION_SESSION_2026-01-31.md) - Technical implementation
- ✅ **This Document** - Validation testing guide
- 🔮 [FUTURE_OPTIMIZATIONS_2026-01-31.md](FUTURE_OPTIMIZATIONS_2026-01-31.md) - Integration #6 details

---

## Overview

The WASM Dictionary Trie validation suite compares WASM vs JavaScript implementations to ensure:

1. **Correctness**: WASM produces identical results to JavaScript
2. **Performance**: WASM achieves 2-4x speedup target
3. **Reliability**: Graceful degradation and error handling work correctly

---

## Quick Start

### Method 1: Automated Browser Validation (Recommended)

**Step 1**: Start the development server

```bash
npm run tauri:dev
```

**Step 2**: Open DevTools Console (F12 or Cmd+Option+I)

**Step 3**: Run validation

```javascript
await window.validateWasmDictionaryTrie();
```

**Expected Output**:

```
🚀 Starting WASM Dictionary Trie Validation...

✅ WASM Dictionary Trie is enabled and initialized

📝 Test 1: Single Character Lookups
  ✅ "我" → "tôi"
  ✅ "你" → "bạn"
  ✅ "他" → "anh ấy"
  ...

📝 Test 2: Multi-Character Lookups
  ✅ "今天" → "hôm nay"
  ✅ "明天" → "ngày mai"
  ...

📝 Test 3: Real Sentence Translation
  ✅ "我今天学习"
     "我" → "tôi"
     "今天" → "hôm nay"
     "学习" → "học tập"
  ...

📝 Test 4: Performance Benchmarking
  Running 1000 iterations...

  📊 Performance Results (1000 iterations):
     WASM:              45.23ms
     JavaScript:        127.89ms
     Position Mapping:  12.45ms
     Speedup:           2.83x
     Mapping Overhead:  27.5%

📝 Test 5: Position Mapping Validation
  ✅ Test case 1: Position mapping correct
  ✅ Test case 2: Position mapping correct
  ✅ Test case 3: Position mapping correct

  ✅ All position mapping tests passed

============================================================
📊 VALIDATION REPORT
============================================================

🎯 Correctness:
   Total Comparisons: 156
   Matches:           156
   Mismatches:        0
   Both Null:         23
   WASM Only:         0
   JavaScript Only:   0
   Accuracy:          100.00%

⚡ Performance:
   WASM Time:         45.23ms
   JavaScript Time:   127.89ms
   Position Mapping:  12.45ms
   Speedup:           2.83x
   Mapping Overhead:  27.5%

============================================================
✅ VALIDATION PASSED - WASM matches JavaScript perfectly!
✅ PERFORMANCE TARGET MET - 2.83x speedup achieved!
============================================================
```

---

## Detailed Validation Steps

### Test 1: Single Character Lookups

**What it tests**: Individual character dictionary lookups

**Test cases**:

- Common characters: 我, 你, 他, 她, 它
- Dictionary lookups: 好, 天, 学, 习, 不

**Success criteria**: WASM and JavaScript return identical translations

---

### Test 2: Multi-Character Lookups

**What it tests**: Phrase and compound word lookups

**Test cases**:

- 2-char words: 今天, 明天, 昨天, 天气, 学习
- 3-char phrases: 不知道, 怎么样, 为什么
- 4-char phrases: (if in dictionary)

**Success criteria**: Longest match selection works correctly

---

### Test 3: Real Sentence Translation

**What it tests**: Sequential lookups in context

**Test sentences**:

- 我今天学习
- 明天天气好
- 我不知道怎么样
- 他非常好
- 她学习很认真

**Success criteria**:

- All lookups match between WASM and JavaScript
- Position mapping correctly handles token sequences
- Longest match preference works (e.g., "今天" over "今" + "天")

---

### Test 4: Performance Benchmarking

**What it measures**:

1. WASM lookup time
2. JavaScript lookup time
3. Position mapping overhead
4. Overall speedup factor

**Benchmark parameters**:

- Iterations: 1000
- Test sentence: "我今天学习不知道怎么样非常好" (mixed lengths)
- Measures: Total time for all lookups in sentence

**Success criteria**:

- Speedup: 2-4x (target met if ≥2.0x)
- Position mapping overhead: <50% of WASM time
- WASM time: Significantly lower than JavaScript

**Performance expectations**:

```
Text length: 10 characters
Iterations:  1000

WASM:         40-60ms    (target)
JavaScript:   100-180ms  (baseline)
Speedup:      2.0-4.0x   (SUCCESS if ≥2.0x)
Mapping:      10-25ms    (acceptable if <50% of WASM)
```

---

### Test 5: Position Mapping Validation

**What it tests**: Token position ↔ character position conversion accuracy

**Test cases**:

1. Single-char tokens: [我, 今天, 学习]
2. Multi-char tokens: [今天, 天气, 好]
3. Unicode (emoji): [😀, 你好, 👋]

**Validates**:

- `tokenPositionToCharPosition()` returns correct character offsets
- Emoji handling (2 UTF-16 code units = 1 token)
- Combining diacritics handled correctly

**Success criteria**: All position mappings match expected values

---

## Troubleshooting

### WASM Not Initialized

**Symptom**:

```
❌ WASM Dictionary Trie is not initialized
   Make sure character dictionary is loaded
```

**Solutions**:

1. Check dictionaries are loaded: Click "Reload Dictionary" (Cmd/Ctrl-R)
2. Verify WASM enabled: Remove `?wasm-dictionary-trie=false` from URL
3. Check console for initialization errors

---

### WASM Disabled

**Symptom**:

```
❌ WASM Dictionary Trie is disabled
   Enable with: Remove ?wasm-dictionary-trie=false from URL
```

**Solutions**:

1. Remove query parameter from URL
2. Reload page
3. Re-run validation

---

### Performance Below Target

**Symptom**:

```
⚠️ PERFORMANCE BELOW TARGET - 1.5x speedup (target: 2-4x)
```

**Possible causes**:

1. Small dictionary size (less benefit with few entries)
2. Browser optimization not kicked in (run more iterations)
3. Development mode overhead (try production build)
4. Position mapping overhead high (check implementation)

**Solutions**:

1. Run benchmark multiple times (warm up JIT compiler)
2. Increase iteration count
3. Test with production build: `npm run tauri:build`
4. Profile position mapping functions

---

### Correctness Mismatches

**Symptom**:

```
❌ "今天" - MISMATCH
   WASM: "hôm nay"
   JS:   "ngày hôm nay"
```

**Investigate**:

1. Check dictionary entry format
2. Verify token structure matches expectations
3. Check for Unicode normalization issues (NFC vs NFD)
4. Examine position mapping at mismatch location

**Debug commands**:

```javascript
// Check WASM trie stats
window.translationEngine.wasmCharacterTrie.getStats();

// Test specific lookup
const tokens = [{ value: '今天' }];
const wasm = window.translationEngine.tryWasmDictionaryLookup(tokens, 0, 'characters');
const dict = window.translationEngine.dictionaryManager.getDictionary('characters');
const js = dict.get('今天');

console.log('WASM:', wasm);
console.log('JS:', js);
```

---

## Advanced Validation

### Test with Full Character Dictionary

**Goal**: Validate all 27,000+ entries

**Method**:

```javascript
// Get character dictionary
const dict = window.translationEngine.dictionaryManager.getDictionary('characters');

// Test all entries
let mismatches = 0;
for (const [chars, translation] of dict.entries()) {
  const tokens = [{ value: chars }];
  const wasm = window.translationEngine.tryWasmDictionaryLookup(tokens, 0, 'characters');

  if (!wasm || wasm.translation !== translation) {
    console.error(`Mismatch: "${chars}" → WASM: ${wasm?.translation}, JS: ${translation}`);
    mismatches++;
  }
}

console.log(`Total entries: ${dict.size}`);
console.log(`Mismatches: ${mismatches}`);
console.log(`Accuracy: ${((1 - mismatches / dict.size) * 100).toFixed(2)}%`);
```

**Expected**: 0 mismatches, 100% accuracy

---

### Performance Profiling

**Goal**: Detailed breakdown of where time is spent

**Method**:

```javascript
// Profile WASM lookup
console.profile('WASM Lookup');
for (let i = 0; i < 1000; i++) {
  window.translationEngine.tryWasmDictionaryLookup([{ value: '我' }], 0, 'characters');
}
console.profileEnd('WASM Lookup');

// Profile JavaScript lookup
console.profile('JS Lookup');
const dict = window.translationEngine.dictionaryManager.getDictionary('characters');
for (let i = 0; i < 1000; i++) {
  dict.get('我');
}
console.profileEnd('JS Lookup');
```

**Analyze**: Chrome DevTools → Performance tab → View profile

---

### Cache Invalidation Testing

**Goal**: Verify WASM trie reloads after dictionary changes

**Method**:

```javascript
// 1. Run initial validation
await window.validateWasmDictionaryTrie();

// 2. Reload dictionaries (triggers cache invalidation)
// Click "Reload Dictionary" button or:
await window.handleReloadDictionaries();

// 3. Run validation again
await window.validateWasmDictionaryTrie();

// 4. Should show same results (no stale cache)
```

**Expected**: Both validations should pass identically

---

## Success Criteria Checklist

### Phase 3 Validation Complete When:

- [ ] **Correctness**: 100% match rate (WASM === JavaScript)
  - All single character lookups match
  - All multi-character lookups match
  - All real sentence translations match
  - No mismatches in batch validation

- [ ] **Performance**: 2-4x speedup achieved
  - WASM faster than JavaScript
  - Speedup ≥ 2.0x
  - Position mapping overhead < 50%

- [ ] **Position Mapping**: All tests pass
  - Single-char token mapping correct
  - Multi-char token mapping correct
  - Unicode (emoji) mapping correct

- [ ] **Reliability**: Error handling works
  - Graceful degradation on WASM failure
  - Cache invalidation working
  - Dictionary reload working

- [ ] **Production Ready**:
  - All 27,000+ entries validated
  - Production build tested
  - No regressions in existing tests
  - Documentation complete

---

## Next Steps After Validation

1. **Document Results**: Create `WASM_DICTIONARY_TRIE_VALIDATION_RESULTS.md`
2. **Update OPTIMIZATION_MASTER_INDEX**: Mark Phase 3 complete
3. **Production Rollout Plan**: Define beta testing strategy
4. **Monitoring Setup**: Add performance metrics collection
5. **User Documentation**: Update end-user guides

---

## Reference

**Validator Code**: `src/utils/WasmDictionaryTrieValidator.js`
**Integration**: `src/utils/TranslationEngine.js` (lines 8481-8594)
**Position Mapping**: `src/utils/PositionMappingUtils.js`
**Test Suite**: `src/utils/__tests__/WasmDictionaryTrie.validation.test.js`

**Documentation**:

- [OPTIMIZATION_MASTER_INDEX_2026-01-31.md](OPTIMIZATION_MASTER_INDEX_2026-01-31.md)
- [DICTIONARY_TRIE_INTEGRATION_SESSION_2026-01-31.md](DICTIONARY_TRIE_INTEGRATION_SESSION_2026-01-31.md)
- [FUTURE_OPTIMIZATIONS_2026-01-31.md](FUTURE_OPTIMIZATIONS_2026-01-31.md)

---

**Last Updated**: 2026-01-31
