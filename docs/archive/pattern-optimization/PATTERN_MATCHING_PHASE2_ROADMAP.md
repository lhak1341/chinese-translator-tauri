# Pattern Matching Phase 2 Optimization Roadmap

**Status**: 📋 Planning - Optional Further Optimization
**Created**: January 4, 2026
**Phase 1 Results**: 30% speedup achieved

## Current State

After Phase 1 optimizations:
- Overall translation: **55.33ms per translation** (30% faster than before)
- Pattern matching: **48.89ms per translation** (88.4% of total time)
- Process Tokens (WASM): **48.00ms per translation** (98.3% of pattern time)

**Bottleneck remains**: The actual pattern matching algorithm inside Rust WASM.

## What's Left to Optimize?

Phase 1 eliminated **memory allocation overhead** (30-35% of WASM time). What remains is:

1. **Pattern matching logic** (~40-50% of WASM time) - Core algorithm
2. **WASM boundary crossing** (~10-15%) - Serialization overhead
3. **Pattern validation** (~5-10%) - Type checking, Phase A protection
4. **Template building** (~5%) - Variable substitution

## Phase 2 Optimization Options

### Option 1: Pattern Reference Instead of Cloning ⭐ (Low-hanging fruit)

**Current Issue**: Line 292 in matcher.rs
```rust
PatternMatchResult::success(
    pattern.clone(),  // ❌ Clones entire SemanticPattern on every match
    variables,
    result,
    matched_tokens,
    start_index,
    end_index,
)
```

**Impact**: 5-10% improvement
**Complexity**: Medium (requires lifetime management)
**Risk**: Low

**Implementation**:
- Store pattern index instead of cloning entire pattern
- Or use pattern reference with lifetime parameter
- Reduces allocations on successful matches

**Expected Result**: 48.89ms → 44-46ms per translation

---

### Option 2: Optimize Template Building

**Current Issue**: Lines 449-463 in matcher.rs
```rust
pub fn build_result(template: &str, variables: &HashMap<String, String>) -> String {
    let mut result = template.to_string();  // Clone template

    // Two-pass replacement (to avoid variable collision)
    for (var_name, translation) in variables {
        let placeholder = format!("__PLACEHOLDER_{}__", idx);  // Allocation
        result = result.replace(var_name, &placeholder);       // Allocation
    }

    for (placeholder, translation) in placeholders {
        result = result.replace(&placeholder, &translation);   // Allocation
    }
}
```

**Problems**:
- Multiple string allocations per variable (2 passes × variables)
- Each `replace()` creates a new String

**Impact**: 5% improvement
**Complexity**: Low
**Risk**: Low

**Implementation**:
```rust
pub fn build_result(template: &str, variables: &HashMap<String, String>) -> String {
    // Estimate capacity: template length + sum of translation lengths
    let capacity = template.len() + variables.values().map(|v| v.len()).sum::<usize>();
    let mut result = String::with_capacity(capacity);

    // Single-pass replacement with character iteration
    let mut chars = template.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == 'X' || ch == 'Y' || ch == 'Z' {  // Variable names
            if let Some(translation) = variables.get(&ch.to_string()) {
                result.push_str(translation);
            } else {
                result.push(ch);
            }
        } else {
            result.push(ch);
        }
    }

    result
}
```

**Expected Result**: 48.89ms → 46-47ms per translation

---

### Option 3: Early Pattern Rejection ⭐⭐ (High impact)

**Current Issue**: No early exit on first token mismatch

**Implementation**: Add first-token fast-path check
```rust
pub fn test_pattern_match(...) -> PatternMatchResult {
    // Fast-path: check first pattern token before full matching
    if let Some(first_token) = pattern.tokens.first() {
        match &first_token.token_type {
            TokenType::Literal => {
                let literal = first_token.value.as_ref().unwrap();
                let first_semantic = &semantic_tokens[position].value;

                // Quick rejection if first char doesn't match
                if !first_semantic.starts_with(&literal.chars().next().unwrap().to_string()) {
                    return PatternMatchResult::failure(Some("First token mismatch".to_string()));
                }
            }
            _ => {}  // Variable tokens can't be rejected early
        }
    }

    // Full matching logic...
}
```

**Impact**: 10-15% improvement (many patterns rejected without full matching)
**Complexity**: Low
**Risk**: Very low

**Expected Result**: 48.89ms → 41-44ms per translation

---

### Option 4: Reduce Phase A Protection Checks

**Current Issue**: Lines 272-282 in matcher.rs
```rust
// Check for Phase A override (runs on every successful match)
if self.has_phase_a_protection(&matched_tokens, match_start, current_position) {
    let current_matched_text: String = matched_tokens.iter()
        .map(|t| t.value.as_str()).collect();  // ❌ Allocates string
    let max_phase_a_length = self.get_max_phase_a_length(&matched_tokens);

    if current_matched_text.len() <= max_phase_a_length {
        return PatternMatchResult::failure(...);
    }
}
```

**Optimization**:
```rust
// Early exit if no Phase A protection
if !self.has_any_phase_a_protection(&matched_tokens) {
    // Skip expensive checks
} else {
    // Only build string if actually protected
    let current_matched_text: String = ...;
}
```

**Impact**: 2-5% improvement
**Complexity**: Low
**Risk**: Very low

**Expected Result**: 48.89ms → 47-48ms per translation

---

### Option 5: Rust-Side Internal Profiling 🔍 (Diagnostic)

**Purpose**: Identify exactly where the 48ms is being spent inside Rust

**Implementation**: Add timing to Rust code
```rust
use web_sys::Performance;

pub fn test_pattern_match(...) -> PatternMatchResult {
    let perf = web_sys::window().unwrap().performance().unwrap();

    let start_literal = perf.now();
    // Literal matching logic...
    let literal_time = perf.now() - start_literal;

    let start_variable = perf.now();
    // Variable resolution logic...
    let variable_time = perf.now() - start_variable;

    web_sys::console::log_1(&format!(
        "🦀 Literal: {:.2}ms, Variable: {:.2}ms",
        literal_time, variable_time
    ).into());

    // ...
}
```

**Impact**: 0% (diagnostic only)
**Complexity**: Low
**Risk**: None (dev-only)

**Benefit**: Know exactly what to optimize next

---

### Option 6: Pattern Indexing Improvements ⭐⭐⭐ (High complexity, high reward)

**Current State**: First-token indexing is working (10-50 candidates instead of 1,539)

**Further Optimization**: Multi-token indexing
```rust
// Current: Index by first token only
phase_b_index.get_patterns_by_first_token("在")  // Returns all patterns starting with "在"

// Optimized: Index by first TWO tokens
phase_b_index.get_patterns_by_tokens(&["在", "这"])  // More specific, fewer candidates
```

**Impact**: 20-30% improvement (if many patterns share first token)
**Complexity**: High
**Risk**: Medium

**Expected Result**: 48.89ms → 34-39ms per translation

---

## Recommended Approach

### Quick Wins (1-2 hours, 15-25% improvement)

1. ✅ **Early Pattern Rejection** - Add first-token fast-path (10-15%)
2. ✅ **Pattern Reference** - Stop cloning patterns on success (5-10%)
3. ✅ **Template Building** - Single-pass replacement (5%)

**Combined Expected**: 48.89ms → 37-41ms per translation (20-25% additional improvement)
**Overall**: 79.42ms → 37-41ms per translation = **48-53% total speedup**

### Deep Investigation (2-3 hours, diagnostic)

4. 🔍 **Rust-Side Profiling** - Find the actual hotspot
5. Based on results, implement targeted optimizations

### Advanced Optimization (4-6 hours, 20-30% improvement)

6. ⚡ **Multi-Token Indexing** - Only if profiling shows pattern lookup is still slow

## Decision Matrix

| Priority | Optimization | Time | Impact | Complexity | Risk |
|----------|--------------|------|--------|------------|------|
| 🥇 HIGH | Early Pattern Rejection | 30min | 10-15% | Low | Very Low |
| 🥇 HIGH | Pattern Reference | 1hr | 5-10% | Med | Low |
| 🥈 MEDIUM | Template Building | 1hr | 5% | Low | Low |
| 🔍 DIAGNOSTIC | Rust-Side Profiling | 1hr | 0% | Low | None |
| 🥉 LOW | Phase A Protection | 30min | 2-5% | Low | Very Low |
| 🔬 RESEARCH | Multi-Token Indexing | 4-6hr | 20-30% | High | Med |

## Success Criteria

**Target**: Sub-40ms per translation (50% total improvement from baseline)
- Baseline: 79.42ms
- Phase 1: 55.33ms (30% improvement) ✅
- Phase 2 Target: <40ms (50%+ total improvement)

**Recommended**: Implement Quick Wins (Options 1, 2, 3) to reach 37-41ms per translation

## Next Steps

1. **Choose approach**: Quick Wins or Deep Investigation
2. **Implement optimizations** in order of priority
3. **Re-profile** after each optimization
4. **Stop when** target reached or diminishing returns

---

**Current Recommendation**: Start with **Early Pattern Rejection** (Option 3) - 30 minutes for 10-15% gain, very low risk.
