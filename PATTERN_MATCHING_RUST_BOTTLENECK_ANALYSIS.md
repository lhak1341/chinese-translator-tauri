# Pattern Matching Rust Bottleneck Analysis

**Created**: January 4, 2026
**Status**: ✅ Analysis Complete

## Executive Summary

Internal profiling revealed that **98.4% of pattern matching time** (7,269ms) is spent in `Process Tokens (WASM)` - the Rust pattern matching code itself. Code analysis identified **5 critical bottlenecks** causing excessive memory allocation and cloning.

**Key Finding**: Pattern indexing IS implemented and working. The bottleneck is **excessive HashMap and String cloning**, not algorithmic complexity.

## Profiling Results

```
Pattern Matching Internal Breakdown (7,390ms total):
- Extract Semantic Tokens:      2ms    (0.0%)
- Build Variable Cache (TOTAL):  119ms  (1.6%)
  - Already Translated:          1ms    (0.0%)
  - Phrase Lookups:              95ms   (1.3%)
  - Proper Noun Lookups:         20ms   (0.3%)
  - Full-Text Scan:              3ms    (0.0%)
- Process Tokens (WASM):         7,269ms (98.4%)  ⚠️ BOTTLENECK
```

**Conclusion**: JavaScript preparation is fast (1.6%). The Rust WASM code is the bottleneck.

## Code Analysis Findings

### ✅ Pattern Indexing (Already Implemented)

**File**: `wasm-core/src/pattern_processor/two_phase.rs`

Pattern indexing IS working correctly:
- **Lines 111, 114**: PatternIndex structs for Phase A and Phase B
- **Lines 136-140**: Patterns indexed at initialization
- **Line 207**: Phase A uses `phase_a_index.get_patterns_by_first_token(first_token)`
- **Line 307**: Phase B uses `phase_b_index.get_patterns_by_first_token(first_token)`

**Impact**: O(1) first-token lookup is functioning, reducing patterns tested per position from ~1,539 to ~10-50.

### ❌ Critical Bottleneck #1: HashMap Cloning Per Token

**File**: `wasm-core/src/pattern_processor/matcher.rs:489`

```rust
pub fn find_best_pattern_match(
    patterns: &[SemanticPattern],
    semantic_tokens: &[SemanticToken],
    position: usize,
    variable_cache: &HashMap<String, VariableCacheEntry>,
) -> Option<PatternMatchResult> {
    let matcher = PatternMatcher::new(variable_cache.clone());  // ❌ CLONE ENTIRE HASHMAP
    // ...
}
```

**Problem**:
- `variable_cache` is cloned **at every token position** in both Phase A and Phase B
- With 154 calls (from profiling), that's **154 full HashMap clones**
- Variable cache can contain **hundreds of entries** (proper nouns + phrases + Phase A results)

**Complexity**: O(n * m) where n = tokens, m = cache size

**Estimated Impact**: **40-60% of WASM time** (2,900-4,360ms)

**Fix**: Pass `&HashMap` reference instead of cloning:
```rust
pub fn find_best_pattern_match(
    patterns: &[SemanticPattern],
    semantic_tokens: &[SemanticToken],
    position: usize,
    variable_cache: &HashMap<String, VariableCacheEntry>,  // No change
) -> Option<PatternMatchResult> {
    let matcher = PatternMatcher::new(variable_cache);  // ✅ Pass reference, don't clone
    // ...
}

// Update PatternMatcher to accept reference
impl PatternMatcher {
    pub fn new(variable_cache: &HashMap<String, VariableCacheEntry>) -> Self {
        Self { variable_cache }  // Store reference
    }
}
```

### ❌ Critical Bottleneck #2: String Allocations in Variable Resolution

**File**: `wasm-core/src/pattern_processor/matcher.rs:326-334`

```rust
fn resolve_variable_with_lookahead(
    // ...
) -> Option<(String, usize, String)> {
    // ...
    for span in (1..=max_span).rev() {  // Up to 10 iterations
        let multi_token_value: String = semantic_tokens[current_position..current_position + span]
            .iter()
            .map(|t| t.value.as_str())
            .collect();  // ❌ String allocation per span

        if let Some(cache_entry) = self.variable_cache.get(&multi_token_value) {
            candidate_spans.push((
                cache_entry.translation.clone(),  // ❌ Clone translation
                span,
                multi_token_value.clone()         // ❌ Clone text AGAIN
            ));
        }
    }
}
```

**Problem**:
- For each variable match attempt (could be 10-50 patterns at a position):
  - Tests 1-10 spans (longest-first backtracking)
  - Each span: 1 string allocation + 2 clones if match found
- With multi-variable patterns (e.g., "XYZ"), this compounds

**Estimated Impact**: **30-40% of WASM time** (2,180-2,900ms)

**Fix**:
1. Use string slices for lookup, only clone on success
2. Return references instead of cloning strings
3. Cache string constructions

### ❌ Critical Bottleneck #3: Token Cloning

**File**: `wasm-core/src/pattern_processor/matcher.rs:210, 261`

```rust
// During literal matching
matched_tokens.push(semantic_tokens[current_position + j].clone());  // ❌ Clone token

// During variable matching
matched_tokens.push(semantic_tokens[current_position + j].clone());  // ❌ Clone token
```

**Problem**:
- Every matched token is cloned (SemanticToken has String fields)
- Patterns matching 5-10 tokens = 5-10 clones per match
- Testing 10-50 patterns per position = 50-500 token clones per position

**Estimated Impact**: **10-15% of WASM time** (730-1,090ms)

**Fix**: Use indices instead of cloning tokens, reconstruct on success only

### ❌ Bottleneck #4: Pattern Cloning on Success

**File**: `wasm-core/src/pattern_processor/matcher.rs:299`

```rust
PatternMatchResult::success(
    pattern.clone(),  // ❌ Clone entire pattern structure
    variables,
    result,
    matched_tokens,
    start_index,
    end_index,
)
```

**Problem**:
- SemanticPattern contains Vec<TokenType>, HashMap<String, Vec<String>>, and other allocations
- Cloned for every successful match (could be 50-150 times per translation)

**Estimated Impact**: **5-10% of WASM time** (360-730ms)

**Fix**: Store pattern reference instead of cloning

### ❌ Bottleneck #5: String Replacement in build_result

**File**: `wasm-core/src/pattern_processor/matcher.rs:450-463`

```rust
pub fn build_result(template: &str, variables: &HashMap<String, String>) -> String {
    let mut result = template.to_string();  // ❌ Clone template
    let mut placeholders: HashMap<String, String> = HashMap::new();

    // Replace variables with placeholders
    for (var_name, translation) in variables {
        let placeholder = format!("__PLACEHOLDER_{}__", placeholder_index);  // ❌ Allocation
        placeholders.insert(placeholder.clone(), translation.clone());       // ❌ Two clones
        result = result.replace(var_name, &placeholder);                     // ❌ String allocation
    }

    // Replace placeholders with translations
    for (placeholder, translation) in placeholders {
        result = result.replace(&placeholder, &translation);                 // ❌ String allocation
    }
}
```

**Problem**:
- Multiple string allocations per variable (2 passes of `replace()`)
- Each `replace()` allocates a new String
- For patterns with 2-3 variables, that's 4-6 string allocations per successful match

**Estimated Impact**: **5% of WASM time** (360ms)

**Fix**: Use single-pass template replacement with pre-allocated capacity

## Optimization Strategy

### Phase 1: High-Impact Fixes (Expected 60-70% speedup)

**1. Eliminate HashMap Cloning** (40-60% improvement)
- Change `PatternMatcher::new()` to accept `&HashMap`
- Update lifetime parameters
- **Estimated time savings**: 2,900-4,360ms

**2. Optimize String Allocations in Variable Resolution** (30-40% improvement)
- Use `&str` for dictionary lookups
- Only clone on actual match
- Cache constructed strings
- **Estimated time savings**: 2,180-2,900ms

**3. Reduce Token Cloning** (10-15% improvement)
- Store token indices instead of clones
- Reconstruct matched tokens only on success
- **Estimated time savings**: 730-1,090ms

### Phase 2: Medium-Impact Fixes (Expected 10-20% additional speedup)

**4. Pattern Reference Instead of Clone** (5-10% improvement)
- Use pattern IDs or references
- **Estimated time savings**: 360-730ms

**5. Optimize build_result** (5% improvement)
- Single-pass template replacement
- Pre-allocated String capacity
- **Estimated time savings**: 360ms

### Expected Total Improvement

**Conservative**: 60% speedup → 7,269ms → **2,900ms**
**Realistic**: 75% speedup → 7,269ms → **1,817ms**
**Optimistic**: 85% speedup → 7,269ms → **1,090ms**

## Implementation Priority

1. ✅ **Eliminate HashMap cloning** (matcher.rs:489) - Single line change, massive impact
2. ✅ **Optimize variable resolution strings** (matcher.rs:326-334) - Moderate refactor, high impact
3. ⏸️ **Reduce token cloning** (matcher.rs:210, 261) - Requires index-based approach
4. ⏸️ **Pattern references** (matcher.rs:299) - Requires lifetime management
5. ⏸️ **Optimize build_result** (matcher.rs:450-463) - Nice-to-have cleanup

## Files to Modify

- `wasm-core/src/pattern_processor/matcher.rs` - All bottlenecks are in this file
- `wasm-core/src/pattern_processor/two_phase.rs` - Update to pass references

## Next Steps

1. Implement Phase 1 optimizations (HashMap + String allocations)
2. Rebuild WASM and test
3. Re-run profiling to measure improvement
4. Proceed with Phase 2 if needed

## References

- **Profiling Results**: 98.4% in Process Tokens (WASM) = 7,269ms
- **Pattern Count**: 1,539 patterns total
- **Translation Calls**: 154 calls (from profiling data)
