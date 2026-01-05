# Pattern Matching: Detailed Variable Resolution Profiling

**Status**: ✅ Implemented and Built
**Date**: January 5, 2026
**Purpose**: Identify where the 83.8% Variable Resolution time is actually spent

## Background

Initial profiling showed Variable Resolution consumes 83.8% of pattern matching time:
```
Variable Resolution: 3453ms (83.8%)
```

But we tried optimizing specific subsets and failed:
- **Template Building**: Expected 5%, got 0%
- **Pattern Reference**: Expected 5-10%, got 0%
- **Lookahead First-Char**: Expected 5-15%, got -1.4% (slower!)

**Conclusion**: We were optimizing the wrong things. Need granular profiling **inside** variable resolution.

## What This Adds

**Detailed metrics inside `resolve_variable_with_lookahead()`**:

### New Profiling Metrics

1. **String Building Time** (`var_string_building_time`)
   - How long to build `buffer` for each span attempt
   - Measures: `buffer.clear()` + `buffer.push_str()` loop

2. **Cache Lookup Time** (`var_cache_lookup_time`)
   - How long `variable_cache.get(&buffer)` takes
   - Measures: HashMap lookup operation

3. **Lookahead Verification Time** (`var_lookahead_time`)
   - How long to verify next pattern token matches
   - Measures: Single-char comparison + multi-char string building

4. **Cache Hit Rate**
   - `var_cache_hits` / `var_resolution_attempts`
   - Shows how often cache lookups succeed vs fail

5. **Cache Misses Per Span**
   - `var_cache_misses` (incremented on every cache miss)
   - Shows how many span iterations don't find cache entries

## Usage Instructions

### 1. Hard Refresh Browser
Press **Cmd+Shift+R** to load new WASM.

### 2. Enable Profiling
```javascript
window.enableMatcherProfiling()
window.resetMatcherProfiling()
```

### 3. Translate Test Text
Use the same text from previous profiling for comparison.

### 4. View Detailed Results
```javascript
window.printMatcherProfilingReport()
```

**Expected Output**:
```
================================================================================
🦀 RUST-SIDE PATTERN MATCHING PROFILING REPORT
================================================================================
Total Calls: 1,277,814
Total Time: 4122.00ms
Average Time per Call: 0.0032ms

Operation Breakdown (Average per Call):
--------------------------------------------------------------------------------
Early Rejection:      0.0001ms (4.3%)
Literal Matching:     0.0000ms (0.3%)
Variable Resolution:  0.0027ms (83.8%)
Template Building:    0.0000ms (0.0%)
⚠️  Other/Unmeasured:   0.0004ms (11.6%)

Variable Resolution Detailed Breakdown:
--------------------------------------------------------------------------------
Resolution Attempts:  XXX
Cache Hits:           XXX (XX.X% hit rate)
Cache Misses:         XXX (per span iteration)

  String Building:    X.XXXXms (XX.X% of var resolution)
  Cache Lookups:      X.XXXXms (XX.X% of var resolution)
  Lookahead Verify:   X.XXXXms (XX.X% of var resolution)

Total Measured in Var Resolution: XXXXms
Variable Resolution Time (outer): XXXXms
⚠️  Unmeasured in Var Res: XXXms (XX.X%)
================================================================================
```

## What to Look For

### Scenario 1: String Building >50%
**Diagnosis**: Building buffers for each span is the bottleneck.

**Possible Optimizations**:
- Pre-compute common spans
- Use character slicing instead of string building
- Limit max_span to reduce iterations

### Scenario 2: Cache Lookups >50%
**Diagnosis**: HashMap lookups are expensive.

**Possible Optimizations**:
- Pre-fetch likely cache entries before loop
- Use simpler hash function
- Optimize HashMap key structure

### Scenario 3: Lookahead Verification >50%
**Diagnosis**: Next-token verification is slow.

**Possible Optimizations**:
- Skip lookahead for patterns without following literals
- Cache lookahead results per position
- Optimize multi-char literal comparison

### Scenario 4: Low Cache Hit Rate (<30%)
**Diagnosis**: Variable cache doesn't contain needed entries.

**Impact**: Many wasted span iterations trying cache lookups that fail.

**Not an Optimization Target**: Can't cache-optimize if dictionary doesn't have the entries!

### Scenario 5: High Unmeasured Time (>30%)
**Diagnosis**: There's overhead we're not measuring.

**Investigation Needed**:
- Span iteration loop overhead
- Pattern token access
- String cloning on cache hits

## Implementation Details

### Instrumentation Points

**resolve_variable_with_lookahead() function**:

```rust
// String building timing
let start_string_build = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
buffer.clear();
for i in 0..span {
    buffer.push_str(&semantic_tokens[current_position + i].value);
}
let end_string_build = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
total_string_building_time += end_string_build - start_string_build;

// Cache lookup timing
let start_cache_lookup = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
let cache_result = self.variable_cache.get(&buffer);
let end_cache_lookup = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
total_cache_lookup_time += end_cache_lookup - start_cache_lookup;

// Lookahead timing
let start_lookahead = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
// ... lookahead verification logic ...
let end_lookahead = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
total_lookahead_time += end_lookahead - start_lookahead;
```

### Profiling Data Accumulation

**On successful variable resolution**:
```rust
if profiling_enabled {
    let mut data = PROFILING_DATA.lock().unwrap();
    data.var_resolution_attempts += 1;
    data.var_cache_hits += 1;
    data.var_string_building_time += total_string_building_time;
    data.var_cache_lookup_time += total_cache_lookup_time;
    data.var_lookahead_time += total_lookahead_time;
}
```

**On cache miss**:
```rust
if profiling_enabled {
    let mut data = PROFILING_DATA.lock().unwrap();
    data.var_cache_misses += 1;
}
```

## Files Modified

- `wasm-core/src/pattern_processor/matcher.rs`
  - Added 6 new profiling fields to `MatcherProfilingData` struct
  - Instrumented `resolve_variable_with_lookahead()` with timing measurements
  - Updated `print_matcher_profiling_report()` to display detailed breakdown

## Success Criteria

**Goal**: Identify which specific operation inside Variable Resolution is the real bottleneck.

**Expected Outcome**: One operation will show >40% of variable resolution time, giving us a clear optimization target.

**Example Success**:
- String Building: 15% (500ms)
- Cache Lookups: 65% (2200ms) ← **REAL BOTTLENECK**
- Lookahead: 20% (700ms)

**Actionable Result**: Focus optimization efforts on HashMap lookup performance, not string building or lookahead.

## References

- **Initial Profiling**: RUST_SIDE_PROFILING_GUIDE.md
- **Phase 2 Quick Wins Failure**: PATTERN_MATCHING_PHASE2_QUICK_WINS.md (0% improvement)
- **Lookahead Optimization Failure**: PATTERN_MATCHING_PHASE2_LOOKAHEAD_OPTIMIZATION.md (-1.4% degradation)
- **Current Performance**: 4122ms per translation (Variable Resolution: 3453ms)
