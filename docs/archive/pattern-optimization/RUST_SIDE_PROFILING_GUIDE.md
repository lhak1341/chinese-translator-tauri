# Rust-Side Pattern Matching Profiling Guide

**Status**: ✅ Implemented and Built
**Date**: January 4, 2026
**Purpose**: Identify where time is actually spent inside Rust WASM pattern matching

## What This Provides

Rust-side profiling measures **exactly where the 47ms** is being spent inside the WASM pattern matching code:

- **Early Rejection**: Time spent checking if first character matches
- **Literal Matching**: Time spent matching literal tokens against semantic tokens
- **Variable Resolution**: Time spent resolving variables with lookahead
- **Template Building**: Time spent building result strings from templates

## Why We Need This

**Problem**: Phase 2 Quick Wins (Template Building + Pattern Reference) showed **0% improvement**:
- Expected: 10-15% speedup
- Actual: No measurable change (53.67ms → 53.89ms)

**Conclusion**: We were optimizing the wrong things. This tool will show us **exactly** what to optimize.

## Usage Instructions

### 1. Hard Refresh Browser

Press **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux) to load new WASM.

### 2. Enable Rust-Side Profiling

```javascript
// Import WASM profiling functions
import {
  enable_matcher_profiling,
  reset_matcher_profiling,
  print_matcher_profiling_report
} from './wasm/translation_wasm_core.js';

// Enable profiling
enable_matcher_profiling();
reset_matcher_profiling();
```

**OR** use browser console directly:

```javascript
// Enable Rust-side profiling (WASM function)
window.enable_matcher_profiling()

// Reset profiling data
window.reset_matcher_profiling()
```

### 3. Translate Test Text

Use the same text from previous profiling:
```
在这个修真世界中，修炼者们都在寻找突破的方法。那些强大的修士能够掌握各种神通，他们的实力远超普通人。在修炼的过程中，最重要的是要保持心境平和，不能被外界的诱惑所影响。只有这样，才能在修炼之路上走得更远。
```

### 4. View Results

```javascript
// Print Rust-side profiling report
window.print_matcher_profiling_report()
```

**Expected Output**:
```
================================================================================
🦀 RUST-SIDE PATTERN MATCHING PROFILING REPORT
================================================================================
Total Calls: 15420
Total Time: 847.23ms
Average Time per Call: 0.0549ms

Operation Breakdown (Average per Call):
--------------------------------------------------------------------------------
Early Rejection:      0.0012ms (2.2%)
Literal Matching:     0.0234ms (42.6%)
Variable Resolution:  0.0289ms (52.7%)
Template Building:    0.0014ms (2.5%)
================================================================================
```

This will tell us **exactly** which operation is the bottleneck!

## What to Look For

### Scenario 1: Variable Resolution is >50%
**Diagnosis**: Variable cache lookups and lookahead verification are the bottleneck.

**Solutions**:
- Optimize `resolve_variable_with_lookahead()` in matcher.rs
- Cache variable spans more aggressively
- Reduce HashMap lookups per variable

### Scenario 2: Literal Matching is >50%
**Diagnosis**: String building and comparison for literals is slow.

**Solutions**:
- Optimize semantic token concatenation
- Use character-by-character comparison instead of building strings
- Pre-compute literal hashes for faster comparison

### Scenario 3: Template Building is >20%
**Diagnosis**: Our single-pass template optimization didn't work.

**Solutions**:
- Profile the `build_result()` function specifically
- Consider pre-compiled templates
- Use faster string replacement algorithms

### Scenario 4: Early Rejection is >20%
**Diagnosis**: Early rejection check is taking too long.

**Solutions**:
- Simplify first-character comparison
- Move early rejection to indexing phase

## Comparison with JavaScript Profiling

**JavaScript Profiling** (TranslationProfiler.js):
- Shows time spent in each **translation phase** (Pattern, Proper Noun, Number, etc.)
- Measures at coarse granularity (entire phase)
- Found that Pattern Matching is 88% of time

**Rust-Side Profiling** (This tool):
- Shows time spent in each **operation within pattern matching**
- Measures at fine granularity (early rejection, literals, variables, templates)
- Will show which specific operation within the 88% is actually slow

## Implementation Details

### Global Profiling State

Profiling data is stored in global static variables using `lazy_static`:

```rust
lazy_static! {
    static ref PROFILING_ENABLED: Mutex<bool> = Mutex::new(false);
    static ref PROFILING_DATA: Mutex<MatcherProfilingData> = Mutex::new(MatcherProfilingData::default());
}
```

**Why Global**: `PatternMatcher` instances are created per-call in `find_best_pattern_match()`, so instance-level profiling data would be lost. Global state persists across all calls.

### Performance Measurement

Uses `web_sys::Performance` API for high-resolution timing:

```rust
let perf = web_sys::window()
    .and_then(|w| Some(w.performance()))
    .flatten();

let start = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
// ... operation ...
let end = perf.as_ref().map(|p| p.now()).unwrap_or(0.0);
let elapsed = end - start;
```

**Overhead**: Minimal when disabled (single boolean check). When enabled, adds ~0.001-0.002ms per call.

### Data Tracked

```rust
pub struct MatcherProfilingData {
    pub total_time: f64,                // Total time in test_pattern_match
    pub early_rejection_time: f64,      // Time in early rejection check
    pub literal_matching_time: f64,     // Time matching literals
    pub variable_resolution_time: f64,  // Time resolving variables
    pub template_building_time: f64,    // Time building templates
    pub call_count: u32,                // Number of calls
}
```

## Files Modified

- ✅ `wasm-core/src/pattern_processor/matcher.rs` - Profiling infrastructure, global state, timing measurements
- ✅ `wasm-core/src/pattern_processor/mod.rs` - Export profiling functions
- ✅ `wasm-core/src/lib.rs` - WASM bindings for JavaScript access
- ✅ `src/wasm/translation_wasm_core.js` - Rebuilt WASM bindings
- ✅ `src/wasm/translation_wasm_core_bg.wasm` - Rebuilt WASM binary

## Next Steps

1. ✅ ~~Implement Rust-side profiling~~ (Complete)
2. ✅ ~~Rebuild WASM~~ (Complete)
3. 🔄 **Test profiling and view results** (User action required)
4. **Analyze breakdown** - Which operation is actually slow?
5. **Implement targeted optimization** based on real data
6. **Re-profile** to measure improvement

## Success Criteria

**Goal**: Identify the real bottleneck with data, not guesses.

**Expected Outcome**: One operation will show >40% of time, telling us exactly what to optimize next.

**Example**: If Variable Resolution is 65% of time:
- **Before**: Guessing template building was slow (it wasn't)
- **After**: Know variable resolution is the bottleneck → optimize that specific function → see actual improvement

## References

- **Phase 1 Results**: PATTERN_MATCHING_PHASE1_OPTIMIZATIONS.md
- **Phase 2 Quick Wins**: PATTERN_MATCHING_PHASE2_QUICK_WINS.md
- **Phase 2 Roadmap**: PATTERN_MATCHING_PHASE2_ROADMAP.md
- **Current Performance**: 53.89ms per translation (Pattern Matching: 47.28ms)
- **Target**: <40ms per translation (50% faster than baseline 79.42ms)
