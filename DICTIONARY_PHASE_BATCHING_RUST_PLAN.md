# Dictionary Phase Batching - Rust Migration Plan

**Status**: 📋 Planning Phase
**Created**: January 3, 2025
**Target Completion**: TBD

## Executive Summary

Migrate dictionary lookups for Proper Noun, Phrase, and Character phases from JavaScript to Rust WASM, combining 3 separate phases into a single batched WASM call to eliminate boundary crossing overhead.

**Expected Impact**:
- 5-15x speedup for dictionary-heavy translations
- 60-80% reduction in WASM boundary crossings
- Foundation for future translation optimizations

**Risk Level**: 🟡 Medium (Focused scope avoids full-pipeline serialization issues)

---

## Phase 0: Pre-Migration Profiling ✅ COMPLETE

**Status**: ✅ Complete (January 3, 2025)
**Implementation**: `src/utils/TranslationProfiler.js` + `TranslationEngine.js` integration

### Objective
Confirm dictionary lookups are the bottleneck before investing in migration.

### Implementation Summary

Created comprehensive profiling system with:
- `TranslationProfiler` class for measuring phase-by-phase performance
- Automatic recommendations based on profiling data
- Integration into `TranslationEngine` with minimal overhead
- Console API for easy profiling during development

**Files Modified**:
- ✅ Created `src/utils/TranslationProfiler.js` (255 lines)
- ✅ Updated `TranslationEngine.js` (added profiler integration)

### Usage Instructions

**1. Enable Profiling**

```javascript
// In browser console (Dev Tools)
window.translationEngine.enableProfiling()
// Output: 🔬 Translation profiling enabled
// 💡 Translate some text, then run: window.translationEngine.getProfilingReport()
```

**2. Translate Text**

Paste Chinese text in the Translator tab and click "Translate". The profiler will measure each phase automatically.

**3. View Report**

```javascript
// Get structured report
window.translationEngine.getProfilingReport()

// Or print formatted report to console
window.translationEngine.printProfilingReport()
```

**Example Output**:
```
================================================================================
📊 TRANSLATION PROFILING REPORT
================================================================================
Total Time: 245.67ms over 1 translation(s)

Phase Breakdown:
--------------------------------------------------------------------------------
│ phase                        │ timeMs │ calls │ avgMs │ percentage │
│ Phrase Dictionary            │ 98.45  │ 1     │ 98.45 │ 40.1%      │
│ Character Dictionary         │ 67.23  │ 1     │ 67.23 │ 27.4%      │
│ Proper Noun Dictionary       │ 34.12  │ 1     │ 34.12 │ 13.9%      │
│ Pattern Matching (WASM)      │ 23.45  │ 1     │ 23.45 │ 9.5%       │
│ Number Conversion (WASM)     │ 15.67  │ 1     │ 15.67 │ 6.4%       │
│ Post-Processing              │ 6.75   │ 1     │ 6.75  │ 2.7%       │

================================================================================
💡 RECOMMENDATIONS:
================================================================================
⚠️  Dictionary phases consume 81.4% of translation time (199.80ms)
✅ RECOMMENDED: Migrate dictionary phases to Rust WASM (estimated 5-15x speedup)
📋 See: DICTIONARY_PHASE_BATCHING_RUST_PLAN.md for migration plan

================================================================================
Next Steps:
- Review phase breakdown above
- Follow recommendations if dictionary phases >40%
- Reset profiling: window.translationEngine.resetProfiling()
================================================================================
```

**4. Reset Profiling**

```javascript
// Clear profiling data and start fresh
window.translationEngine.resetProfiling()

// Disable profiling
window.translationEngine.disableProfiling()
```

**2. Run Profiling Tests**

Test cases:
- Short text (100 chars) - mostly proper nouns
- Medium text (500 chars) - mixed content
- Long text (2000+ chars) - character-heavy

Expected results to justify migration:
- Dictionary phases (properNouns + phrases + characters) > 40% of total time
- Multiple boundary crossings visible in timeline

**3. Decision Gate**

✅ **Proceed if**: Dictionary phases consume >40% of translation time
❌ **Abort if**: Other phases are bottleneck (optimize those first)

---

## Phase 1: Technical Design

### Architecture Overview

**Current State** (3 separate JavaScript phases):
```
JavaScript → WASM (dict lookup) → JavaScript → WASM (dict lookup) → JavaScript → WASM (dict lookup) → JavaScript
   ↓             ↓ Proper Nouns           ↓ Phrases                  ↓ Characters
3 boundary crossings, 6 serialization operations
```

**Target State** (1 batched WASM call):
```
JavaScript → WASM (all 3 dict lookups internally) → JavaScript
              ↓ Single batch call
1 boundary crossing, 2 serialization operations (60-80% reduction)
```

### Rust Module Structure

```
wasm-core/src/dictionary_batch/
├── mod.rs                  # Module exports
├── batch_processor.rs      # Main batch processing logic
├── proper_noun_phase.rs    # Phase 2: Proper noun matching
├── phrase_phase.rs         # Phase 4: Phrase matching
├── character_phase.rs      # Phase 5: Character fallback
├── conflict_resolver.rs    # Handle overlapping matches
└── wasm_wrapper.rs         # JavaScript interface
```

### Data Structures

**Input** (from JavaScript):
```rust
#[derive(Serialize, Deserialize)]
pub struct Token {
    pub value: String,
    pub translated: Option<String>,
    pub translation_source: Option<String>,
    pub original_index: usize,
    pub is_grouped: bool,
    pub group_leader: Option<usize>,
}

#[derive(Serialize, Deserialize)]
pub struct DictionaryBatchInput {
    pub tokens: Vec<Token>,
    pub active_proper_nouns: Vec<String>,  // Which proper noun dicts to use
}
```

**Output** (to JavaScript):
```rust
#[derive(Serialize, Deserialize)]
pub struct DictionaryBatchResult {
    pub tokens: Vec<Token>,  // Modified with translations
    pub stats: DictionaryBatchStats,
}

#[derive(Serialize, Deserialize)]
pub struct DictionaryBatchStats {
    pub proper_noun_matches: usize,
    pub phrase_matches: usize,
    pub character_matches: usize,
    pub total_time_ms: f64,
}
```

### WASM Interface

**JavaScript Wrapper** (`src/utils/WasmDictionaryBatch.js`):
```javascript
export async function initializeDictionaryBatch(dictionaries) {
  // Load all 3 types of dictionaries into WASM trie structures
  const dictionaryBatch = new wasmModule.WasmDictionaryBatch();

  await dictionaryBatch.loadProperNounDictionaries(dictionaries.properNouns);
  await dictionaryBatch.loadPhraseDictionary(dictionaries.phrases);
  await dictionaryBatch.loadCharacterDictionary(dictionaries.characters);

  return dictionaryBatch;
}

export async function processDictionaryBatch(tokens, activeProperNouns) {
  // Single WASM call for all 3 phases
  return dictionaryBatch.processTokens(tokens, activeProperNouns);
}
```

**Rust Implementation** (`wasm-core/src/dictionary_batch/wasm_wrapper.rs`):
```rust
#[wasm_bindgen]
pub struct WasmDictionaryBatch {
    processor: DictionaryBatchProcessor,
    initialized: bool,
}

#[wasm_bindgen]
impl WasmDictionaryBatch {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmDictionaryBatch {
        console_error_panic_hook::set_once();
        WasmDictionaryBatch {
            processor: DictionaryBatchProcessor::new(),
            initialized: false,
        }
    }

    #[wasm_bindgen(js_name = loadProperNounDictionaries)]
    pub fn load_proper_noun_dictionaries(&mut self, dicts: JsValue) -> Result<(), JsValue> {
        let dictionaries: HashMap<String, HashMap<String, String>> =
            serde_wasm_bindgen::from_value(dicts)?;
        self.processor.load_proper_noun_dictionaries(dictionaries);
        Ok(())
    }

    #[wasm_bindgen(js_name = processTokens)]
    pub fn process_tokens(
        &self,
        tokens: JsValue,
        active_proper_nouns: JsValue,
    ) -> Result<JsValue, JsValue> {
        let mut token_vec: Vec<Token> = serde_wasm_bindgen::from_value(tokens)?;
        let active: Vec<String> = serde_wasm_bindgen::from_value(active_proper_nouns)?;

        let result = self.processor.process_batch(&mut token_vec, &active);

        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }
}
```

### Core Processing Logic

**Main Processor** (`batch_processor.rs`):
```rust
pub struct DictionaryBatchProcessor {
    proper_noun_tries: HashMap<String, Trie>,  // One trie per proper noun dict
    phrase_trie: Trie,
    character_trie: Trie,
}

impl DictionaryBatchProcessor {
    pub fn process_batch(
        &self,
        tokens: &mut [Token],
        active_proper_nouns: &[String],
    ) -> DictionaryBatchResult {
        let start_time = instant::Instant::now();

        // Phase 2: Proper Nouns (highest priority)
        let proper_noun_stats = self.process_proper_nouns(tokens, active_proper_nouns);

        // Phase 4: Phrases (skip already translated tokens)
        let phrase_stats = self.process_phrases(tokens);

        // Phase 5: Characters (fallback for remaining tokens)
        let character_stats = self.process_characters(tokens);

        DictionaryBatchResult {
            tokens: tokens.to_vec(),
            stats: DictionaryBatchStats {
                proper_noun_matches: proper_noun_stats.matches,
                phrase_matches: phrase_stats.matches,
                character_matches: character_stats.matches,
                total_time_ms: start_time.elapsed().as_millis() as f64,
            }
        }
    }
}
```

**Proper Noun Phase** (`proper_noun_phase.rs`):
```rust
impl DictionaryBatchProcessor {
    fn process_proper_nouns(
        &self,
        tokens: &mut [Token],
        active_proper_nouns: &[String],
    ) -> PhaseStats {
        let mut matches = 0;

        // Try longest matches first (up to 10 tokens)
        for max_length in (1..=10).rev() {
            for i in 0..(tokens.len().saturating_sub(max_length - 1)) {
                // Skip already translated
                if tokens[i].translated.is_some() {
                    continue;
                }

                // Build candidate string
                let candidate = self.build_token_string(&tokens[i..i+max_length]);

                // Try each active proper noun dictionary
                for dict_name in active_proper_nouns {
                    if let Some(trie) = self.proper_noun_tries.get(dict_name) {
                        if let Some(translation) = trie.get(&candidate) {
                            self.apply_match(tokens, i, i + max_length - 1,
                                           translation, "properNoun");
                            matches += 1;
                            break;
                        }
                    }
                }
            }
        }

        PhaseStats { matches }
    }
}
```

### Key Design Decisions

**1. Dictionary Loading Strategy**
- ✅ Load all dictionaries into WASM tries during initialization
- ✅ Reuse existing WASM Dictionary Engine trie implementation
- ❌ Don't serialize dictionaries on every translation call

**2. Token Modification In-Place**
- ✅ Modify tokens directly in Rust (same as pattern processor)
- ✅ Return modified token array to JavaScript
- ❌ Don't create separate result objects (reduces serialization)

**3. Phase Isolation**
- ✅ Keep phases separate internally (easier to debug/verify)
- ✅ Batch only at WASM boundary (not algorithm changes)
- ❌ Don't merge phase logic (maintain parity with JavaScript)

**4. Conflict Resolution**
- ✅ Priority order: Proper Nouns > Phrases > Characters
- ✅ Skip tokens already translated by higher-priority phases
- ✅ Match JavaScript behavior exactly

---

## Phase 2: Implementation

### Milestone 1: Core Infrastructure (Week 1)

**Tasks**:
1. Create `wasm-core/src/dictionary_batch/` module structure
2. Implement `DictionaryBatchProcessor` skeleton
3. Add WASM wrapper with JavaScript interface
4. Implement trie loading from JavaScript dictionaries
5. Add basic test cases

**Deliverables**:
- ✅ Rust module compiles
- ✅ WASM builds successfully
- ✅ JavaScript can call `processTokens()` (even if returns empty)
- ✅ Unit tests pass

**Success Criteria**: Can initialize and call WASM (no functionality yet)

---

### Milestone 2: Proper Noun Phase (Week 2)

**Tasks**:
1. Implement `process_proper_nouns()` in `proper_noun_phase.rs`
2. Add longest-match-first algorithm (10 tokens max)
3. Handle multiple active proper noun dictionaries
4. Add comprehensive test cases

**Test Cases**:
```rust
#[test]
fn test_proper_noun_single_character() {
    // "李" → "Lý"
}

#[test]
fn test_proper_noun_multi_character() {
    // "黄河" → "Hoàng Hà"
}

#[test]
fn test_proper_noun_priority() {
    // Longer match wins: "黄河" not "黄" + "河"
}

#[test]
fn test_multiple_dictionaries() {
    // Check activeProperNouns filtering works
}
```

**Deliverables**:
- ✅ Proper noun matching works
- ✅ All test cases pass
- ✅ Benchmarks show performance improvement

**Success Criteria**: Rust proper noun matching = JavaScript behavior

---

### Milestone 3: Phrase Phase (Week 3)

**Tasks**:
1. Implement `process_phrases()` in `phrase_phase.rs`
2. Skip tokens already translated by proper nouns
3. Add longest-match-first for phrases
4. Handle phrase/proper noun conflicts correctly

**Test Cases**:
```rust
#[test]
fn test_phrase_basic() {
    // "不知道" → "không biết"
}

#[test]
fn test_phrase_skip_translated() {
    // Proper noun already translated → skip
}

#[test]
fn test_phrase_longest_match() {
    // "不知道" not "不" + "知道"
}
```

**Deliverables**:
- ✅ Phrase matching works
- ✅ Proper noun conflicts handled correctly
- ✅ Test cases pass

**Success Criteria**: Rust phrase phase = JavaScript behavior

---

### Milestone 4: Character Phase (Week 4)

**Tasks**:
1. Implement `process_characters()` in `character_phase.rs`
2. Process only remaining untranslated tokens
3. Handle character-level fallback
4. Add comprehensive test cases

**Test Cases**:
```rust
#[test]
fn test_character_fallback() {
    // Untranslated character → dictionary lookup
}

#[test]
fn test_character_skip_already_translated() {
    // Already translated by proper noun/phrase → skip
}
```

**Deliverables**:
- ✅ Character phase complete
- ✅ All 3 phases working together
- ✅ End-to-end tests pass

**Success Criteria**: Full batch processing matches JavaScript output

---

## Phase 3: Parity Verification

### Strategy

Follow successful pattern from pattern matching migration:
1. Create automated parity test suite
2. Run both Rust and JavaScript on identical inputs
3. Compare outputs character-by-character
4. Fix any discrepancies before removing JavaScript

### Test Infrastructure

**File**: `src/utils/DictionaryBatchParityTest.js`

```javascript
export const DICTIONARY_PARITY_TESTS = [
  {
    name: "Pure proper nouns",
    input: "李明和王小红去了北京",
    description: "All proper nouns, no phrases"
  },
  {
    name: "Mixed proper nouns and phrases",
    input: "我不知道李明在哪里",
    description: "Proper nouns + common phrases"
  },
  {
    name: "Character fallback",
    input: "这是一个测试",
    description: "Mostly characters with some phrases"
  },
  {
    name: "Long proper noun",
    input: "中华人民共和国",
    description: "Multi-character proper noun"
  },
  {
    name: "Overlapping matches",
    input: "黄河流域",
    description: "Proper noun 黄河 + phrase conflict"
  }
];

export async function testDictionaryBatchParity(input, engine) {
  // Run with WASM
  engine.enableWasmDictionaryBatch = true;
  const wasmResult = await engine.translateDictionary(input);

  // Run with JavaScript
  engine.enableWasmDictionaryBatch = false;
  const jsResult = await engine.translateDictionary(input);

  // Compare
  return compareResults(wasmResult, jsResult);
}
```

### Acceptance Criteria

✅ **All tests must pass** before removing JavaScript fallback:
- Translation text matches exactly
- Token boundaries match exactly
- Translation sources match exactly
- No performance regression

---

## Phase 4: Integration & Rollout

### Integration Steps

**1. Add WASM Dictionary Batch to TranslationEngine.js**

```javascript
class TranslationEngine {
  async initialize(dictionaries, options) {
    // ... existing initialization ...

    // Initialize WASM Dictionary Batch
    if (options.enableWasmDictionaryBatch !== false) {
      try {
        await initializeDictionaryBatch(dictionaries);
        this.wasmDictionaryBatchAvailable = true;
        console.log('✅ WASM Dictionary Batch initialized successfully');
      } catch (error) {
        console.warn('⚠️ WASM Dictionary Batch unavailable, using JavaScript');
        this.wasmDictionaryBatchAvailable = false;
      }
    }
  }

  async translateSinglePass(tokens, options) {
    // ... patterns phase ...

    // Dictionary phases (batched or fallback)
    if (this.wasmDictionaryBatchAvailable) {
      const result = await processDictionaryBatch(tokens, this.activeProperNouns);
      copyWasmTokens(result.tokens, tokens);
    } else {
      // JavaScript fallback
      await this.applyDictionaryTranslation(tokens, { phase: 'properNouns' });
      await this.createOptimalPhraseGroups(tokens, options);
      await this.processRemainingTokensInBatches(tokens, processedTokens, options);
    }

    // ... post-processing ...
  }
}
```

**2. Gradual Rollout**

- Week 1-2: WASM available but off by default (opt-in testing)
- Week 3-4: WASM on by default, JavaScript fallback available
- Week 5: Verify production metrics, confirm no regressions
- Week 6+: Remove JavaScript fallback if parity confirmed

**3. Monitoring**

Add telemetry:
```javascript
window.translationEngine.getDictionaryBatchStats()
// Returns: { wasmUsed: true, timeMs: 45, matches: { properNouns: 5, phrases: 12, characters: 23 } }
```

---

## Phase 5: Cleanup & Documentation

### After Parity Confirmation

**1. Remove JavaScript Fallback**

Files to modify:
- `src/utils/TranslationEngine.js` - Remove `applyDictionaryTranslation()`, `createOptimalPhraseGroups()`, `processRemainingTokensInBatches()`
- Update CLAUDE.md with new WASM system

**2. Update Documentation**

- Add to CLAUDE.md "Active Features" section
- Create migration completion report
- Archive planning documents

**3. Performance Benchmarking**

Document before/after metrics:
- Translation speed improvement
- Boundary crossing reduction
- Memory usage comparison

---

## Risk Mitigation

### High-Risk Areas

**1. Dictionary Serialization**
- **Risk**: Same issue that killed full 5-phase WASM
- **Mitigation**: Load dictionaries once during initialization, not per translation
- **Validation**: Test with large dictionaries (27,000+ entries)

**2. Token Modification Synchronization**
- **Risk**: Rust modifications not reflected in JavaScript
- **Mitigation**: Copy token array back explicitly (like number processor)
- **Validation**: Check every token field matches

**3. Proper Noun Dictionary Selection**
- **Risk**: Wrong dictionaries loaded for active proper nouns
- **Mitigation**: Pass `activeProperNouns` array on every call
- **Validation**: Test with multiple proper noun dictionaries

### Fallback Strategy

If migration fails:
1. Keep JavaScript fallback indefinitely
2. Use WASM only when available (graceful degradation)
3. Document why batching didn't work
4. Consider smaller scope (e.g., only proper nouns)

---

## Success Metrics

### Performance Targets

- [ ] 5-15x speedup for dictionary-heavy translations
- [ ] 60-80% reduction in WASM boundary crossings
- [ ] No regression in translation quality
- [ ] Memory usage ≤ current levels

### Quality Targets

- [ ] 100% parity with JavaScript implementation
- [ ] All test cases pass
- [ ] No production bugs in first month
- [ ] Clean error messages when WASM unavailable

---

## Timeline Estimate

**Total Duration**: 6-8 weeks

| Phase | Duration | Key Deliverable |
|-------|----------|----------------|
| Phase 0: Profiling | 3-5 days | Confirm bottleneck |
| Phase 1: Design | 3-5 days | Architecture approved |
| Phase 2: Implementation | 4 weeks | All 3 phases working |
| Phase 3: Parity Testing | 1 week | All tests pass |
| Phase 4: Rollout | 1-2 weeks | Production deployment |
| Phase 5: Cleanup | 3-5 days | Documentation complete |

---

## Open Questions

1. **Should we batch all 3 phases or start with 1?**
   - Option A: All 3 phases at once (faster, riskier)
   - Option B: Proper nouns first, then add phrases/characters (safer)

2. **How to handle dictionary updates during runtime?**
   - Option A: Reload WASM dictionaries on dictionary reload
   - Option B: Pass dictionaries on every call (more boundary crossing)

3. **Should we optimize phrase matching algorithm while migrating?**
   - Current: Longest-match-first is O(n*m)
   - Alternative: Could add trie optimization in Rust
   - Trade-off: Complexity vs speedup

---

## Next Steps

1. ✅ ~~**Review this plan** with team/stakeholders~~ (Complete)
2. ✅ ~~**Run Phase 0 profiling** to confirm bottleneck~~ (Complete - profiler ready for testing)
3. 🔄 **Execute profiling tests** using the new TranslationProfiler:
   - Test with short text (100 chars) - mostly proper nouns
   - Test with medium text (500 chars) - mixed content
   - Test with long text (2000+ chars) - character-heavy
   - Analyze profiling reports to confirm dictionary phases >40%
4. **Decision Gate**: Proceed with Phase 1 if profiling confirms dictionary bottleneck
5. **Create GitHub issue** for tracking (if approved)
6. **Set up development branch** for WASM dictionary batch (if approved)
7. **Begin Milestone 1** if profiling confirms >40% time in dictionary phases

---

## References

- **Successful Migration**: Pattern Matching Rust Conversion (Jan 2025)
- **Failed Migration**: Full 5-Phase WASM Engine (2024) - See WASM_REMOVAL_MIGRATION_GUIDE.md
- **Existing WASM Systems**: Number Processor, Pattern Processor, Dictionary Engine
- **Architecture**: CLAUDE.md sections on WASM/Rust Status
