# Pattern Matching Phase 2: Lookahead Optimization

**Status**: ❌ Reverted - Performance Degradation
**Date**: January 4, 2026
**Target**: Variable Resolution (83.8% bottleneck)
**Expected Impact**: 5-15% speedup
**Actual Impact**: -1.4% (4122ms → 4178ms)

## Background

Rust-side profiling revealed Variable Resolution consumes **83.8%** of pattern matching time:
- Total Calls: 1,277,814
- Variable Resolution: 3,453ms (83.8%)
- Early Rejection: 176ms (4.3%)
- Literal Matching: 12ms (0.3%)
- Template Building: 1ms (0.0%)

## Problem

During variable resolution with lookahead, we build strings for multi-character literals even when the **first character** doesn't match:

**Before Optimization**:
```rust
// Multi-character literal - build sequence and compare
let literal_chars: Vec<char> = next_literal.chars().collect();

// Build sequence from semantic tokens
let semantic_sequence: String = semantic_tokens[next_position..next_position + literal_chars.len()]
    .iter()
    .map(|t| t.value.as_str())
    .collect();  // ← Expensive string allocation

if &semantic_sequence == next_literal {
    return Some((translation, span, text));
} else {
    continue;  // ← Wasted allocation!
}
```

**Example Wasted Work**:
- Pattern: `X的Y` (trying to match "X 的 Y")
- Semantic tokens: "修士 在 世界" ("monk in world")
- Trying span for X=修士, lookahead checks if next token starts with "的"
- Next token is "在" (not "的")
- We build full string "在世界" just to discover first char doesn't match!

## Solution

**Add first-character check BEFORE building strings**:

```rust
// Multi-character literal - check first char before building strings
let literal_chars: Vec<char> = next_literal.chars().collect();

// Early rejection: check first character match before building full strings
// This avoids expensive string allocation when first char doesn't match
if let Some(first_literal_char) = literal_chars.first() {
    if let Some(first_semantic_char) = next_semantic_token.value.chars().next() {
        if first_literal_char != &first_semantic_char {
            continue; // ← Skip this span immediately
        }
    }
}

// Build sequence from semantic tokens (only if first char matched)
let semantic_sequence: String = semantic_tokens[...]
    .iter()
    .map(|t| t.value.as_str())
    .collect();
```

## Benefits

**1. Avoid String Allocation**
- Only build full string when first char matches
- Typical savings: 60-80% of multi-char lookahead cases

**2. Cache-Free Optimization**
- No caching = no invalidation complexity
- Safe with frequent dictionary updates

**3. Maintains Correctness**
- Logic unchanged, just adds early rejection
- No edge cases or special handling needed

## Expected Performance Impact

**Conservative Estimate**: 5-10% speedup
- Variable Resolution: 83.8% of time
- Multi-char lookahead: ~10-15% of variable resolution
- First-char mismatch: ~60-70% of lookahead cases
- String allocation cost: ~50% of lookahead time
- **Math**: 83.8% × 12.5% × 65% × 50% = **5.4% total speedup**

**Optimistic Estimate**: 10-15% speedup
- If multi-char lookahead is 20% of variable resolution
- If first-char mismatch is 80% of cases
- **Math**: 83.8% × 20% × 80% × 50% = **6.7% total speedup**

## Testing Instructions

### 1. Hard Refresh Browser
Press **Cmd+Shift+R** to load new WASM.

### 2. Enable Profiling
```javascript
window.enableMatcherProfiling()
window.resetMatcherProfiling()
```

### 3. Translate Same Test Text
Use the **exact same text** from previous profiling for comparison:
```
在这个修真世界中，修炼者们都在寻找突破的方法。那些强大的修士能够掌握各种神通，他们的实力远超普通人。在修炼的过程中，最重要的是要保持心境平和，不能被外界的诱惑所影响。只有这样，才能在修炼之路上走得更远。
```

### 4. Compare Results
```javascript
window.printMatcherProfilingReport()
```

**Before Optimization** (Baseline):
```
Total Calls: 1,277,814
Total Time: 4122.00ms
Variable Resolution: 3453.00ms (83.8%)
```

**After Optimization** (Expected):
```
Total Calls: 1,277,814
Total Time: 3900-4000ms (5-10% faster)
Variable Resolution: 3250-3350ms (6-10% faster)
```

**Success Criteria**:
- Total Time: 3900-4000ms (down from 4122ms) = **3-5% total speedup**
- Variable Resolution: 3250-3350ms (down from 3453ms) = **6-10% variable speedup**

If we see >5% total speedup, the optimization exceeded expectations!

## Implementation Details

**File Modified**: `wasm-core/src/pattern_processor/matcher.rs`
**Function**: `resolve_variable_with_lookahead()`
**Lines Changed**: 572-580 (added 7 lines of early rejection logic)

**Code Location**:
```rust
// Lines 572-580 in matcher.rs
if let Some(first_literal_char) = literal_chars.first() {
    if let Some(first_semantic_char) = next_semantic_token.value.chars().next() {
        if first_literal_char != &first_semantic_char {
            continue; // Skip this span immediately
        }
    }
}
```

## Risk Assessment

**Risk Level**: ✅ **Very Low**

**Why Safe**:
- No logic changes, just adds early rejection
- Maintains exact same matching behavior
- No caching or state to invalidate
- No new data structures or memory allocation
- Falls back to existing string comparison if first char matches

**Edge Cases Handled**:
- Empty literals: `literal_chars.first()` returns None, skips optimization
- Empty semantic tokens: `chars().next()` returns None, skips optimization
- Single-char literals: Already handled in separate branch (line 561-567)

## Future Optimizations

If this 5-10% gain is confirmed, next steps could be:

**1. Optimize HashMap Lookups** (10-15% expected)
- Pre-fetch variable cache entries before loop
- Reduce redundant `variable_cache.get()` calls

**2. Smarter Span Selection** (10-20% expected, but risky)
- Limit max_span based on dictionary statistics
- Early termination on first valid span

**3. Better Data Structures** (5-10% expected)
- Pre-compute pattern metadata during initialization
- Avoid repeated `pattern.tokens.len()` calls

**Total Cumulative Target**: 30-50% speedup through multiple safe optimizations

## Why This Optimization Failed

### Actual Test Results

**Before Optimization** (Baseline):
```
Total Calls: 1,277,814
Total Time: 4122.00ms
Variable Resolution: 3453.00ms (83.8%)
```

**After Optimization**:
```
Total Calls: 1,277,846
Total Time: 4178.00ms (+56ms, -1.4% slower)
Variable Resolution: 3461.00ms (+8ms, -0.2% slower)
```

### Root Cause Analysis

**Hypothesis 1: High First-Char Match Rate**
- If 80-90% of multi-char lookaheads match on first character, we:
  - Add overhead (extra `if let` checks and branching)
  - Don't save much (still build string for most cases)
  - Net result: overhead > savings

**Hypothesis 2: Rare Optimization Target**
- Multi-char lookahead might be only 5-10% of variable resolution
- Even with perfect optimization (100% savings), impact would be minimal
- The real bottleneck is elsewhere in variable resolution

**Hypothesis 3: Branch Prediction Overhead**
- CPU branch misprediction from added conditional checks
- Pipeline stalls outweigh string allocation savings
- Modern CPUs optimize straight-line code better than branching

### Lessons Learned

**Similar to Phase 2 Quick Wins Failure**:
- **Quick Wins**: Expected 10-15%, got 0% (53.67ms → 53.89ms)
- **Lookahead**: Expected 5-15%, got -1.4% (4122ms → 4178ms)

**Pattern**: We keep optimizing **subsets** of Variable Resolution that aren't the real bottleneck.

**Conclusion**: Need more granular profiling to find where the 83.8% is **actually** spent.

## Reverted

**Date**: January 4, 2026
**Reason**: Performance degradation (-1.4%)
**Status**: Code reverted to original, WASM rebuilt

## References

- **Profiling Results**: RUST_SIDE_PROFILING_GUIDE.md
- **Phase 2 Quick Wins**: PATTERN_MATCHING_PHASE2_QUICK_WINS.md (0% improvement)
- **Current Performance**: 4122ms per translation (Variable Resolution: 3453ms)
- **Baseline**: 79.42ms per translation (pre-Phase 1 optimizations)
