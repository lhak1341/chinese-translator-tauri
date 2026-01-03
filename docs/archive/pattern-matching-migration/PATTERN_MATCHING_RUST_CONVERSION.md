# Pattern Matching Rust Conversion Plan

**Goal**: Convert pattern matching system to Rust for 3-5x performance improvement
**Scope**: 2,004 lines across 3 files (SemanticPatternProcessor, TwoPhasePatternProcessor, PatternAnalyzer)
**Timeline**: Phase 0 (2-3 days) + 2-3 weeks implementation (if Phase 0 succeeds)
**Approach**: Forensic analysis first, then incremental conversion with continuous testing

⚠️ **CRITICAL**: Phase 0 must succeed before proceeding. If root cause analysis reveals unfixable issues, STOP immediately.

---

## 📊 Analysis

### Current JavaScript Implementation

**SemanticPatternProcessor.js** (1,421 lines):
- Pattern parsing and compilation
- Pattern matching algorithm
- Variable resolution with caching
- Priority calculation
- PrecomputedTokenStrings optimization (5-10x speedup via pre-computation)
- Statistics tracking

**TwoPhasePatternProcessor.js** (397 lines):
- Hierarchical two-phase pattern matching orchestration
- Phase A: Variable patterns (allowAsPatternVariable: true)
- Phase B: All patterns with Phase A results as enhanced variables
- Composite detection and absorption
- Decision engine for optimal result selection

**PatternAnalyzer.js** (186 lines):
- Pattern categorization
- Composite eligibility detection
- Pattern dependency analysis

**Total**: 2,004 lines

### Performance Characteristics

**Current Performance**:
- Pattern matching is computationally intensive
- Runs on every translation (every token array)
- PrecomputedTokenStrings: 5-10x speedup (15,000 operations → 70 Map lookups)
- Variable caching reduces redundant dictionary lookups

**Expected Rust Benefits**:
- 3-5x speedup from native performance
- Zero-GC pattern matching
- Faster string operations (Rust's `&str` vs JS string slicing)
- Better regex compilation (compiled once, reused)
- Efficient HashMap for pattern indexing

### Critical Requirements

✅ **Must Maintain**:
- Exact translation quality (pattern competition, priority calculation)
- Two-phase hierarchical processing
- lowPriority flag behavior (-12 penalty)
- Variable type system integration
- Pattern variable caching
- Integration with dictionary lookups

❌ **Cannot Change**:
- Pattern matching algorithm logic
- Priority calculation formula
- Pattern competition resolution
- Variable substitution rules

---

## 🎯 Conversion Strategy

### Phase 0: Root Cause Investigation (2-3 Days) ⚠️ CRITICAL
**Goal**: Understand WHY Phase 6 & 7 WASM translation failed before attempting pattern matching conversion

**Context**: Previous attempt at full WASM translation (Phases 6-7) was removed due to "dictionary lookups returning 0 matches" despite dictionaries being loaded. Documentation is vague about root cause. We MUST understand the exact technical failure mechanism before committing 3 weeks to pattern matching conversion.

**Deliverables**:

1. **Retrieve Deleted Code** (30 minutes)
   ```bash
   # Find the commit that deleted WASM code
   git log --all --oneline --grep="WASM" | head -20
   # Retrieve deleted files from history
   git show <commit>:wasm-core/src/dictionary.rs > /tmp/deleted_dictionary.rs
   git show <commit>:wasm-core/src/core_engine.rs > /tmp/deleted_core_engine.rs
   ```

2. **Analyze Dictionary Lookup Failure** (4-6 hours)
   - Examine deleted `dictionary.rs` and `core_engine.rs`
   - Identify data structures involved in lookups
   - Find serialization points (Rust → WASM → JavaScript)
   - Look for `serde` attribute issues, HashMap key comparisons, UTF-8/UTF-16 encoding
   - Check for silent error swallowing (`.unwrap_or_default()`, `Option::None` → empty results)

3. **Identify Specific Serialization Issues** (4-6 hours)
   Questions to answer:
   - Which Rust types failed to serialize correctly?
   - What JavaScript types were received on the other side?
   - Were `#[serde(rename_all = "camelCase")]` attributes used?
   - Did HashMap keys fail comparison across WASM boundary?
   - Were there Option<T> fields that became undefined instead of null?
   - String encoding issues (UTF-8 Rust vs UTF-16 JavaScript)?

4. **Reproduce "0 Matches" Bug** (4-8 hours)
   Create minimal test case:
   ```rust
   #[cfg(test)]
   mod forensics {
       #[test]
       fn reproduce_zero_matches_bug() {
           // Load dictionary in WASM
           let dict = DictionaryEngine::new();
           dict.load_dictionary("test", test_entries);

           // Perform lookup (this returned 0 in Phase 6-7)
           let results = dict.find_matches("test_dict", "测试", 0);

           // This assertion FAILED in deleted code - WHY?
           assert!(results.len() > 0, "BUG: Lookup returned 0 matches!");
       }

       #[test]
       fn test_serialization_roundtrip() {
           // Create Rust structure
           let entry = DictionaryEntry { chinese: "测试", vietnamese: "thử nghiệm" };

           // Serialize to JsValue
           let js_value = serde_wasm_bindgen::to_value(&entry).unwrap();

           // Deserialize back
           let roundtrip: DictionaryEntry = serde_wasm_bindgen::from_value(js_value).unwrap();

           // CRITICAL: Did data survive roundtrip?
           assert_eq!(entry.chinese, roundtrip.chinese);
       }
   }
   ```

5. **Document Exact Technical Mechanism** (2-4 hours)
   Write forensic report answering:
   - **WHAT failed**: Specific data structure / operation
   - **WHERE it failed**: Rust code location, WASM boundary, JavaScript side
   - **WHY it failed**: Root technical cause (not symptom)
   - **HOW to prevent**: Concrete solution that differs from failed attempt

6. **Critical Decision Point: Go/No-Go** (1 hour)

   **GO if**:
   - ✅ Root cause identified and fixable
   - ✅ Pattern matching uses different data structures than dictionary lookups
   - ✅ We have concrete solution that addresses root cause
   - ✅ Minimal test proves solution works

   **NO-GO if**:
   - ❌ Same serialization issues will affect pattern matching
   - ❌ Root cause is fundamental WASM limitation we can't work around
   - ❌ Pattern matching requires same problematic data structures
   - ❌ Cannot reproduce bug to verify fix

**Key Questions Phase 0 Must Answer**:

1. **Why did WASM DictionaryEngine work (27,132 entries loaded) but Phase 6-7 dictionary lookups fail (0 matches)?**
   - Same engine, different usage pattern?
   - Different code paths?
   - Different serialization?

2. **What specific Rust type caused "serialization issues"?**
   - Trie nodes? HashMap? Nested Options? Metadata objects?

3. **Why silent failures?**
   - Where were errors swallowed?
   - How do we add logging to prevent this?

4. **Will pattern matching face the same issues?**
   - Pattern matching needs dictionary lookups for variables
   - Will it hit the same "0 matches" bug?

**Testing Methodology**:
```rust
// Add explicit error logging at EVERY boundary crossing
pub fn lookup_with_logging(&self, text: &str) -> Vec<Match> {
    web_sys::console::log_1(&format!("🔍 WASM lookup called with: {}", text).into());

    let results = self.internal_lookup(text);

    if results.is_empty() {
        web_sys::console::warn_1(&format!(
            "⚠️ ZERO MATCHES for '{}' (dictionary has {} entries)",
            text, self.dictionary.len()
        ).into());
    } else {
        web_sys::console::log_1(&format!("✅ Found {} matches", results.len()).into());
    }

    results
}
```

**Success Criteria**:
- ✅ Can reproduce "0 matches" bug in isolated test
- ✅ Understand WHY it happened (not just symptoms)
- ✅ Have verified fix that makes test pass
- ✅ OR determine pattern matching will face same issues → STOP

**Escape Clause**:
If Phase 0 reveals that pattern matching will encounter the same unfixable issues as Phase 6-7, we STOP immediately and accept current JavaScript pattern matching (which is already fast: 1034-7500 tokens/sec).

---

### Phase 1: Foundation (Week 1, Days 1-3)
**Goal**: Build core Rust pattern data structures and parsing

⚠️ **Prerequisites**: Phase 0 completed successfully with GO decision

**Deliverables**:
1. Rust structs for patterns, tokens, variables
2. Pattern parsing logic (JavaScript → Rust)
3. Pattern indexing (first token → patterns Map)
4. Basic pattern compilation
5. Unit tests for pattern parsing

**Files Created**:
- `wasm-core/src/pattern_processor/mod.rs` - Main module
- `wasm-core/src/pattern_processor/pattern.rs` - Pattern structs
- `wasm-core/src/pattern_processor/parser.rs` - Pattern parsing
- `wasm-core/src/pattern_processor/index.rs` - Pattern indexing

**Testing**:
- Parse 100 patterns from patterns.json
- Verify pattern structure matches JS version
- Confirm indexing produces correct first-token lookups

**Success Criteria**:
- ✅ All patterns parse correctly
- ✅ Index structure identical to JS
- ✅ Unit tests pass (100% coverage for parsing)

---

### Phase 2: Core Matching Algorithm (Week 1, Days 4-7)
**Goal**: Implement single-pattern matching logic in Rust

**Deliverables**:
1. Pattern matching algorithm (`testPatternMatch()` equivalent)
2. Variable resolution logic
3. Template substitution (`buildResult()`)
4. Priority calculation
5. Pattern competition resolution

**Files Created**:
- `wasm-core/src/pattern_processor/matcher.rs` - Matching algorithm
- `wasm-core/src/pattern_processor/variables.rs` - Variable resolution
- `wasm-core/src/pattern_processor/priority.rs` - Priority calculation

**Testing**:
- Test pattern matching against 50 example texts
- Verify variable extraction matches JS
- Confirm priority calculation (including lowPriority flag)
- Test pattern competition (same-length patterns)

**Success Criteria**:
- ✅ Pattern matches identical to JS version
- ✅ Variable resolution produces same translations
- ✅ Priority calculation matches (within 0.1%)
- ✅ Pattern competition produces correct winners

**Critical Test Cases**:
```javascript
// Test 1: Generic vs Specific pattern competition
Text: "在那些魔帅眼中"
Patterns:
  - "在XY中" (lowPriority: true, priority 17)
  - "在X眼中" (priority 19)
Expected: "在X眼中" wins → "Ở trong mắt những ma soái kia"

// Test 2: Multi-variable pattern
Text: "这些强大的修士"
Pattern: "这些XY"
Variables: X="强大的", Y="修士"
Expected: "Những tu sĩ mạnh mẽ này"

// Test 3: Phase A override
Text: "在那片区域中"
Phase A: "那片区域" → "khu vực kia"
Pattern: "在X中" (uses Phase A result as variable)
Expected: "Trong khu vực kia"
```

---

### Phase 3: Two-Phase Processing (Week 2, Days 1-4)
**Goal**: Implement hierarchical pattern processing

**Deliverables**:
1. Phase A processing (variable patterns only)
2. Phase B processing (with Phase A results)
3. Composite detection logic
4. Result selection / decision engine
5. Token protection marking

**Files Created**:
- `wasm-core/src/pattern_processor/two_phase.rs` - Two-phase orchestrator
- `wasm-core/src/pattern_processor/composite.rs` - Composite detection
- `wasm-core/src/pattern_processor/decision.rs` - Result selection

**Testing**:
- Test two-phase processing on hierarchical patterns
- Verify Phase A results correctly used as variables in Phase B
- Confirm composite detection identifies absorption opportunities
- Test decision engine selects optimal results

**Success Criteria**:
- ✅ Phase A produces correct variable translations
- ✅ Phase B correctly uses Phase A results
- ✅ Composite detection matches JS logic
- ✅ Final results identical to JS two-phase processing

**Critical Test Cases**:
```javascript
// Test: Hierarchical composition
Text: "在这可怕的声波振荡之中"
Phase A: "可怕的声波振荡" → "sự chấn đãng sóng âm đáng sợ"
Phase B: "在X之中" (X = Phase A result)
Expected: "Trong sự chấn đãng sóng âm đáng sợ"
NOT: "ở sóng âm đáng sợ này" (Phase B pattern discarded)
```

---

### Phase 4: Performance Optimizations (Week 2, Days 5-7)
**Goal**: Optimize for speed without changing behavior

**Deliverables**:
1. PrecomputedTokenStrings equivalent in Rust
2. Pattern indexing optimization (HashMap<String, Vec<Pattern>>)
3. Variable caching (HashMap for pre-computed translations)
4. String interning for repeated tokens
5. Performance benchmarking

**Files Created**:
- `wasm-core/src/pattern_processor/cache.rs` - Caching layer
- `wasm-core/src/pattern_processor/optimization.rs` - Performance optimizations

**Testing**:
- Benchmark Rust vs JS on 1000-char texts
- Measure cache hit rates
- Verify no translation quality regression

**Success Criteria**:
- ✅ 3-5x speedup over JS version
- ✅ Cache hit rates >80% (similar to JS)
- ✅ Zero translation quality degradation

**Performance Targets**:
- Pattern matching: <5ms for 100-token texts (vs 15-25ms in JS)
- Variable resolution: <2ms per pattern (vs 5-10ms in JS)
- Total speedup: 3-5x end-to-end

---

### Phase 5: WASM Integration (Week 3, Days 1-3)
**Goal**: Create JavaScript wrapper and integrate with TranslationEngine

**Deliverables**:
1. WASM exports and JavaScript bindings
2. WasmPatternProcessor.js wrapper
3. Integration with TranslationEngine.js
4. Fallback to JavaScript on WASM failure
5. Statistics and debugging support

**Files Created**:
- `src/utils/WasmPatternProcessor.js` - JavaScript wrapper
- Update `wasm-core/src/lib.rs` - WASM exports

**Integration Pattern**:
```javascript
// TranslationEngine.js
async applyPatterns(tokens, options) {
  if (this.wasmPatternProcessor?.isAvailable()) {
    try {
      return await this.wasmPatternProcessor.processTokens(tokens, options);
    } catch (error) {
      console.warn('WASM pattern processing failed, falling back to JS:', error);
    }
  }

  // Fallback to JavaScript
  if (this.settings.enableTwoPhasePatterns) {
    return await this.twoPhasePatternProcessor.processTokens(tokens, options);
  } else {
    return await this.semanticPatternProcessor.processTokens(tokens, options);
  }
}
```

**Testing**:
- Test WASM initialization and pattern loading
- Verify fallback works when WASM unavailable
- Confirm statistics match JS version
- Test error handling and recovery

**Success Criteria**:
- ✅ WASM loads and initializes patterns correctly
- ✅ Pattern processing produces identical results to JS
- ✅ Fallback mechanism works seamlessly
- ✅ No memory leaks after 100+ translations

---

### Phase 6: Testing & Validation (Week 3, Days 4-7)
**Goal**: Comprehensive testing and quality assurance

**Deliverables**:
1. Integration tests (100+ patterns)
2. Regression tests (compare WASM vs JS outputs)
3. Performance benchmarks
4. User acceptance testing
5. Documentation updates

**Test Coverage**:
- ✅ Pattern parsing (all 100+ patterns from patterns.json)
- ✅ Single-pattern matching (50+ test cases)
- ✅ Two-phase processing (20+ hierarchical patterns)
- ✅ Pattern competition (15+ edge cases)
- ✅ Variable resolution (30+ dictionary lookups)
- ✅ Priority calculation (lowPriority flag, multi-variable patterns)
- ✅ Error handling (malformed patterns, missing dictionaries)
- ✅ Performance (3-5x speedup verified)

**Validation Methodology**:
```javascript
// Automated regression testing
const jsResults = semanticPatternProcessor.processTokens(tokens, options);
const wasmResults = wasmPatternProcessor.processTokens(tokens, options);

console.assert(
  JSON.stringify(jsResults) === JSON.stringify(wasmResults),
  'WASM must produce identical results to JavaScript'
);
```

**Success Criteria**:
- ✅ 100% of patterns produce identical translations
- ✅ All translation quality tests pass
- ✅ Performance targets met (3-5x speedup)
- ✅ User testing confirms no regressions
- ✅ CLAUDE.md updated with new WASM system

---

## 🚧 Implementation Guidelines

### Code Organization

```
wasm-core/src/pattern_processor/
├── mod.rs              - Module exports and main API
├── pattern.rs          - Pattern structs (SemanticPattern, PatternToken, etc.)
├── parser.rs           - Pattern parsing from JSON
├── index.rs            - Pattern indexing for O(1) first-token lookup
├── matcher.rs          - Core pattern matching algorithm
├── variables.rs        - Variable resolution and caching
├── priority.rs         - Priority calculation logic
├── two_phase.rs        - Two-phase orchestrator
├── composite.rs        - Composite pattern detection
├── decision.rs         - Decision engine for result selection
├── cache.rs            - Variable and string caching
└── optimization.rs     - Performance optimizations
```

### Rust Data Structures

```rust
// Core pattern representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticPattern {
    pub original_pattern: String,
    pub template: String,
    pub tokens: Vec<PatternToken>,
    pub variables: Vec<PatternVariable>,
    pub priority: i32,
    pub allow_as_pattern_variable: bool,
    pub low_priority: bool,
    pub allowed_variable_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternToken {
    pub token_type: String, // "literal" or "variable"
    pub value: String,
    pub position: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternVariable {
    pub name: String,
    pub position: usize,
    pub span: usize,
    pub allowed_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternMatchResult {
    pub pattern: SemanticPattern,
    pub start_index: usize,
    pub end_index: usize,
    pub matched_tokens: Vec<String>,
    pub variables: HashMap<String, VariableMatch>,
    pub translation: String,
    pub confidence: f64,
}
```

### Testing Strategy

**Unit Tests** (Rust side):
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pattern_parsing() {
        let pattern = parse_pattern("这些XY", "những X Y này", None, false, false);
        assert_eq!(pattern.tokens.len(), 3);
        assert_eq!(pattern.variables.len(), 2);
    }

    #[test]
    fn test_priority_calculation() {
        let priority = calculate_priority(&tokens, &variables, false);
        assert_eq!(priority, 29); // 2 vars * 10 + 3 tokens + 5 literal_first - 0 lowPriority
    }

    #[test]
    fn test_low_priority_penalty() {
        let priority_normal = calculate_priority(&tokens, &variables, false);
        let priority_low = calculate_priority(&tokens, &variables, true);
        assert_eq!(priority_low, priority_normal - 12);
    }
}
```

**Integration Tests** (JavaScript side):
```javascript
// Compare WASM vs JS outputs
async function testPatternMatching() {
  const text = "在那些魔帅眼中";
  const tokens = tokenizer.tokenize(text);

  const jsResult = await jsPatternProcessor.processTokens(tokens, options);
  const wasmResult = await wasmPatternProcessor.processTokens(tokens, options);

  console.assert(
    jsResult[0].translation === wasmResult[0].translation,
    `WASM must match JS: ${jsResult[0].translation} vs ${wasmResult[0].translation}`
  );
}
```

---

## ⚠️ Risks and Mitigation

### Risk 1: Translation Quality Regression
**Impact**: High - Any quality loss is unacceptable
**Probability**: Medium - Complex algorithm with many edge cases
**Mitigation**:
- Comprehensive regression tests comparing WASM vs JS outputs
- Test on 1000+ real translation examples
- User acceptance testing before final merge
- Keep JavaScript fallback permanently

### Risk 2: WASM Boundary Crossing Overhead
**Impact**: Medium - Could negate performance gains
**Probability**: Low - We've solved this before with batch operations
**Mitigation**:
- Batch pattern processing (process entire token array in one WASM call)
- Pre-load dictionaries into WASM (avoid repeated boundary crossings)
- Profile boundary crossing frequency

### Risk 3: Dictionary Integration Complexity
**Impact**: High - Pattern matching needs dictionary lookups for variables
**Probability**: Medium - WASM/JS dictionary coordination is complex
**Mitigation**:
- Reuse existing WASM DictionaryEngine (already working)
- Pass dictionary references into pattern processor
- Test dictionary lookups extensively

### Risk 4: Two-Phase Processing Complexity
**Impact**: High - Hierarchical patterns are core feature
**Probability**: Medium - Phase A/B coordination is intricate
**Mitigation**:
- Implement single-phase first, validate fully
- Add two-phase incrementally
- Comprehensive test cases for hierarchical patterns

---

## 📅 Detailed Schedule

### Phase 0: Root Cause Investigation (2-3 Days) ⚠️ MUST COMPLETE FIRST

**Day 1**:
- [ ] Find commit that deleted WASM code (git history search)
- [ ] Retrieve deleted dictionary.rs and core_engine.rs files
- [ ] Set up forensic analysis workspace (/tmp/wasm-forensics/)
- [ ] Create initial investigation notes document

**Day 2**:
- [ ] Analyze dictionary.rs data structures
- [ ] Identify serialization points (Rust → WASM → JS)
- [ ] Look for serde issues, HashMap problems, UTF-8/UTF-16 encoding
- [ ] Check for silent error swallowing (unwrap_or_default, etc.)
- [ ] Create minimal reproduction test case

**Day 3**:
- [ ] Reproduce "0 matches" bug in isolated test
- [ ] Test serialization roundtrips (Rust → JS → Rust)
- [ ] Document exact technical failure mechanism
- [ ] Write forensic report with root cause
- [ ] **CRITICAL DECISION**: Go/No-Go for pattern matching conversion

**Success Criteria for GO Decision**:
- ✅ Bug reproduced and root cause identified
- ✅ Have concrete fix that makes test pass
- ✅ Pattern matching won't hit same issues
- ✅ OR if NO-GO: Accept JavaScript pattern matching is sufficient

---

### Week 1: Core Pattern Matching (Only if Phase 0 = GO)

**Day 1-2**:
- [ ] Set up Rust module structure
- [ ] Implement pattern parsing (`parsePattern()`)
- [ ] Create pattern indexing (`indexPattern()`)
- [ ] Unit tests for parsing

**Day 3-4**:
- [ ] Implement pattern matching algorithm (`testPatternMatch()`)
- [ ] Variable resolution logic
- [ ] Integration with WASM DictionaryEngine

**Day 5-6**:
- [ ] Priority calculation (`calculatePriority()`)
- [ ] Pattern competition resolution
- [ ] Template substitution (`buildResult()`)

**Day 7**:
- [ ] Testing and validation
- [ ] Compare outputs with JavaScript version
- [ ] Fix any discrepancies

### Week 2: Two-Phase Processing

**Day 1-2**:
- [ ] Implement Phase A processing
- [ ] Token protection marking
- [ ] Phase A result caching

**Day 3-4**:
- [ ] Implement Phase B processing
- [ ] Composite pattern detection
- [ ] Decision engine / result selection

**Day 5-6**:
- [ ] Performance optimizations
- [ ] PrecomputedTokenStrings equivalent
- [ ] Variable caching

**Day 7**:
- [ ] Performance benchmarking
- [ ] Optimization tuning
- [ ] Memory leak testing

### Week 3: Integration & Testing

**Day 1-2**:
- [ ] WASM exports and bindings
- [ ] WasmPatternProcessor.js wrapper
- [ ] TranslationEngine integration

**Day 3**:
- [ ] Fallback mechanism
- [ ] Error handling
- [ ] Statistics tracking

**Day 4-5**:
- [ ] Comprehensive testing
- [ ] Regression tests (100+ patterns)
- [ ] User acceptance testing

**Day 6-7**:
- [ ] Bug fixes
- [ ] Documentation updates
- [ ] Performance verification
- [ ] Final review and merge

---

## ✅ Success Metrics

### Correctness
- ✅ 100% of patterns produce identical translations to JS version
- ✅ All pattern competition edge cases resolved correctly
- ✅ lowPriority flag behavior maintained (-12 penalty)
- ✅ Two-phase hierarchical processing works perfectly

### Performance
- ✅ 3-5x speedup over JavaScript version
- ✅ Pattern matching: <5ms for 100-token texts (vs 15-25ms)
- ✅ Variable resolution: <2ms per pattern (vs 5-10ms)
- ✅ Cache hit rate >80%

### Reliability
- ✅ Zero memory leaks after 100+ translations
- ✅ Graceful fallback to JavaScript on WASM failure
- ✅ Error handling covers all edge cases
- ✅ No translation quality regressions

### Maintainability
- ✅ Comprehensive unit tests (>90% coverage)
- ✅ Integration tests validate all critical paths
- ✅ Documentation updated (CLAUDE.md, inline comments)
- ✅ Clear module structure for future changes

---

## 🛑 Rollback Triggers

**Stop and rollback if**:
1. Translation quality degrades (any pattern produces wrong translation)
2. Performance worse than JavaScript (no speedup)
3. Too many edge cases discovered (algorithm incompatibility)
4. Development time exceeds 4 weeks (2x estimate)
5. Memory leaks or instability issues

**Rollback procedure**:
```bash
# Remove WASM pattern processor
rm -rf wasm-core/src/pattern_processor
git checkout HEAD -- wasm-core/src/lib.rs

# Remove JavaScript wrapper
rm src/utils/WasmPatternProcessor.js

# Revert TranslationEngine changes
git checkout HEAD -- src/utils/TranslationEngine.js

# Rebuild WASM
npm run build-wasm-dev
```

---

## 💡 Key Learnings from Previous Attempts

### From Full Translation Pipeline Failure:
- ❌ **Don't**: Try to convert entire system at once (10,000+ lines failed)
- ✅ **Do**: Convert focused subsystems with clear boundaries

### From PositionTracker Failure:
- ❌ **Don't**: Assume code is used without verifying
- ✅ **Do**: Grep for actual usage before converting

### From Text Chunker Failure:
- ❌ **Don't**: Create half-baked implementations without dependencies
- ✅ **Do**: Convert complete subsystems properly or not at all

### From NumberProcessor Success:
- ✅ **Success Pattern**: Small, focused, stateless conversion with clear I/O
- ✅ **Validation**: Test extensively, compare outputs rigorously

---

## 🎯 Why This Will Succeed

1. **Clear Scope**: 2,004 lines, well-defined boundaries
2. **Proven Need**: Pattern matching runs on every translation
3. **Measurable Benefit**: 3-5x speedup is significant
4. **Incremental Approach**: Test each phase before proceeding
5. **Fallback Strategy**: Keep JavaScript version permanently
6. **Learning from Failures**: We know what NOT to do

---

*Plan created: January 3, 2026*
*Commitment: Proper, complete implementation - no half-measures*
*Expected completion: ~3 weeks with proper testing*
