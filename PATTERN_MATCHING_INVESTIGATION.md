# Pattern Matching Bottleneck Investigation

**Status**: 🔬 Investigation In Progress
**Created**: January 4, 2026

## Problem Statement

Phase 0 profiling revealed that **Pattern Matching consumes 92.4% of translation time** (17,548ms out of 18,983ms), despite already being implemented in Rust WASM. Dictionary phases (the original migration target) only consume 5.7% of time.

**Original assumption**: Dictionary lookups were the bottleneck
**Reality**: Pattern matching is 16x slower than all dictionary phases combined

## Investigation Tools Implemented

### 1. Top-Level Profiling (TranslationProfiler)
- **File**: `src/utils/TranslationProfiler.js`
- **Measures**: 6 translation phases (patterns, properNouns, numbers, phrases, characters, postProcess)
- **API**: `window.translationEngine.enableProfiling()`, `printProfilingReport()`

### 2. Pattern-Level Profiling (TwoPhasePatternProcessor)
- **File**: `src/utils/TwoPhasePatternProcessor.js`
- **Measures**: 7 internal operations within pattern matching
- **API**: `window.translationEngine.enablePatternProfiling()`, `printPatternProfilingReport()`

### Internal Profiling Breakdown

The pattern profiler measures these operations:

1. **Extract Semantic Tokens** - Filter Chinese tokens from full token array
2. **Build Variable Cache (TOTAL)** - Prepare pattern variable substitutions
   - **Already Translated Tokens** - Cache from Phase 2 proper nouns
   - **Phrase Lookups** - Check up to 6-char phrase combinations (O(n²))
   - **Proper Noun Lookups** - Single-token proper noun lookups
   - **Full-Text Scan** - Character-by-character proper noun scanning (O(n*m))
3. **Process Tokens (WASM)** - Actual Rust WASM pattern matching

## Investigation Workflow

### Step 1: Run Investigation Script

Copy and paste this into browser console (Dev Tools):

```javascript
// ======================================================================
// PATTERN MATCHING BOTTLENECK INVESTIGATION
// ======================================================================

console.log('='.repeat(80));
console.log('📊 PATTERN MATCHING BOTTLENECK INVESTIGATION');
console.log('='.repeat(80));
console.log('');

// STEP 1: System Diagnostic
console.log('STEP 1: System Diagnostic');
console.log('-'.repeat(80));

const debugInfo = window.translationEngine.semanticPatternProcessor.getDebugInfo();
console.log('Pattern Processor Info:');
console.log('- Initialized:', debugInfo.isInitialized);
console.log('- Pattern count:', debugInfo.patternCount);
console.log('- WASM available:', debugInfo.wasmAvailable);
console.log('');

console.log('Two-Phase Pattern Settings:');
console.log('- Enabled:', window.translationEngine.settings.enableTwoPhasePatterns);
console.log('- Max composite detection time:', window.translationEngine.settings.maxCompositeDetectionTime);
console.log('');

// STEP 2: Enable Profiling
console.log('STEP 2: Enable Profiling');
console.log('-'.repeat(80));

window.translationEngine.enableProfiling();
window.translationEngine.enablePatternProfiling();

console.log('✅ Top-level profiling enabled');
console.log('✅ Pattern-level profiling enabled');
console.log('');

// STEP 3: Instructions
console.log('STEP 3: Translate Some Text');
console.log('-'.repeat(80));
console.log('1. Paste Chinese text in the Translator tab');
console.log('2. Click "Translate"');
console.log('3. Come back to this console and run the commands below');
console.log('');

console.log('STEP 4: View Results');
console.log('-'.repeat(80));
console.log('After translating, run these commands:');
console.log('');
console.log('// Top-level breakdown (shows 92.4% pattern matching):');
console.log('window.translationEngine.printProfilingReport()');
console.log('');
console.log('// Internal pattern matching breakdown (shows bottleneck):');
console.log('window.translationEngine.printPatternProfilingReport()');
console.log('');

console.log('='.repeat(80));
console.log('Ready! Now translate some text and check the reports.');
console.log('='.repeat(80));
```

### Step 2: Translate Text

Paste Chinese text in the Translator tab and click "Translate".

### Step 3: View Reports

```javascript
// Top-level report (confirms 92.4% in patterns)
window.translationEngine.printProfilingReport()

// Internal pattern breakdown (identifies specific bottleneck)
window.translationEngine.printPatternProfilingReport()
```

### Step 4: Analyze Results

Expected bottleneck candidates:

**High Probability**:
- **Full-Text Scan** (O(n*m) - scans every character position for multi-char proper nouns)
- **Phrase Lookups** (O(n²) - checks up to 6-char combinations for every token)

**Medium Probability**:
- **Process Tokens (WASM)** - Actual pattern matching (already in Rust)
- **Proper Noun Lookups** - O(n) single-token lookups

**Low Probability**:
- **Extract Semantic Tokens** - Simple filter operation
- **Already Translated Tokens** - Linear scan

### Step 5: Optimization Strategies

Based on profiling results:

**If "Full-Text Scan" is bottleneck (likely)**:
- **Problem**: Scans every character position (O(n*m))
- **Solution**: Use Rust trie-based proper noun index (already exists for dictionary lookups)
- **Expected speedup**: 10-50x (similar to pattern matching migration)

**If "Phrase Lookups" is bottleneck**:
- **Problem**: Checks 2-6 char combinations for allowAsPatternVariable (O(n²))
- **Solution**: Pre-index phrases with allowAsPatternVariable flag
- **Expected speedup**: 5-10x

**If "Process Tokens (WASM)" is bottleneck**:
- **Problem**: Pattern matching algorithm in Rust is slow
- **Solution**: Profile Rust side, optimize algorithm (indexing, early termination)
- **Expected speedup**: 2-5x

## Files Modified

**Created**:
- `src/utils/TranslationProfiler.js` (255 lines) - Top-level phase profiling
- `PATTERN_MATCHING_INVESTIGATION.md` (this file) - Investigation documentation

**Modified**:
- `src/utils/TranslationEngine.js`:
  - Added TranslationProfiler integration
  - Added pattern profiling API methods
  - Stored TwoPhasePatternProcessor instance for profiling access
- `src/utils/TwoPhasePatternProcessor.js`:
  - Added internal profiling infrastructure
  - Instrumented buildVariableCache with 4 sub-timers
  - Added profiling API methods

## Next Steps

1. ✅ ~~Implement profiling infrastructure~~ (Complete)
2. 🔄 **Run profiling tests** (In Progress - User action required)
3. **Analyze results** to identify specific bottleneck
4. **Design optimization** based on bottleneck type
5. **Implement optimization** (Rust migration or caching)
6. **Verify performance improvement**

## Decision Gates

- **If Full-Text Scan >40%**: Migrate to Rust trie-based proper noun scanning
- **If Phrase Lookups >40%**: Implement phrase pattern variable index
- **If Process Tokens (WASM) >40%**: Profile and optimize Rust pattern matching algorithm
- **If no single bottleneck >40%**: Consider multi-faceted optimization or accept current performance

## References

- **Original Profiling Results**: 92.4% in Pattern Matching (17,548ms / 18,983ms total)
- **Dictionary Phase Batching Plan**: DICTIONARY_PHASE_BATCHING_RUST_PLAN.md (cancelled due to 5.7% contribution)
- **Pattern Matching Migration**: docs/PATTERN_MATCHING_RUST_MIGRATION_COMPLETE.md
