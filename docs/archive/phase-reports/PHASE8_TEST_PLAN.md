# Phase 8 Test Plan - Warning Resolution & Validation

**Goal:** Exercise all Phase 3-6 APIs to validate functionality and resolve dead code warnings

**Status:** In Progress
**Start Date:** December 1, 2025

---

## Test Categories

### Category 1: Core Pattern Matching APIs ✅ PRIORITY 1

**Purpose:** Validate Phase 7 integration works end-to-end

#### Test 1.1: Basic Pattern Matching
**APIs to Test:**
- `PatternManager.matchPattern(text)`
- `PatternMatch.substitute()`
- `PatternMatch.get_binding(var)`

**Test Cases:**
```javascript
// Test: "张三的手" → "tay của Trương Tam"
const match = patternManager.matchPattern("张三的手");
assert(match !== null);
assert(match.substitute() === "tay của Trương Tam");
assert(match.get_binding('X') === "张三");
assert(match.get_binding('Y') === "手");
```

**Expected Warnings Resolved:**
- ⚠️ `substitute` is never used
- ⚠️ `get_binding` is never used

---

#### Test 1.2: Hierarchical Pattern Resolution
**APIs to Test:**
- `PatternProcessor.match_pattern_hierarchical(text, lookup_fn)`
- `HierarchicalResolver.resolve_variable(variable, value, pattern, lookup_fn)`
- `HierarchicalResolver.resolve_pattern(pattern, bindings, lookup_fn)`
- `VariableResolution.new()` constructor
- `HierarchicalMatch.new()` constructor
- `HierarchicalMatch.substitute()`
- `HierarchicalMatch.get_resolution(var)`

**Test Cases:**
```javascript
// Create lookup function
const lookupFn = (text) => {
  const dictResult = dictionaryManager.translate(text, ['properNouns', 'characters']);
  return dictResult ?
    { translation: dictResult.translation, varType: 'ProperNoun', sourceDict: 'properNouns' } :
    null;
};

// Test hierarchical resolution
const match = patternProcessor.match_pattern_hierarchical("张三的手", lookupFn);
assert(match !== null);
assert(match.substitute() === "tay của Trương Tam");
assert(match.get_resolution('X').translation === "Trương Tam");
```

**Expected Warnings Resolved:**
- ⚠️ `match_pattern_hierarchical` is never used
- ⚠️ `resolve_variable` is never used
- ⚠️ `resolve_pattern` is never used
- ⚠️ `VariableResolution::new` is never used
- ⚠️ `HierarchicalMatch::new` is never used
- ⚠️ `HierarchicalMatch::substitute` is never used
- ⚠️ `HierarchicalMatch::get_resolution` is never used

---

#### Test 1.3: Context-Aware Pattern Matching
**APIs to Test:**
- `PatternProcessor.match_pattern_with_context(text, context_key)`
- `PatternProcessor.set_context(key, value)`
- `PatternProcessor.get_context(key)`

**Test Cases:**
```javascript
// Set context for formal language
patternProcessor.set_context("formality", "formal");

// Test context-aware matching - should prefer formal patterns
const match = patternProcessor.match_pattern_with_context("科学与技术", "formality");
assert(match.pattern === "X与Y"); // Formal pattern, not "X和Y"
```

**Expected Warnings Resolved:**
- ⚠️ `match_pattern_with_context` is never used
- ⚠️ Pattern context system validated

---

#### Test 1.4: Pattern Composition
**APIs to Test:**
- `PatternProcessor.compose_pattern(components, operation, template)`
- `PatternProcessor.get_composed_patterns()`
- `PatternComposer.compose_translation(pattern_id, component_matches)`
- `PatternComposer.get_pattern(id)`
- `PatternComposer.get_all_patterns()`
- `PatternComposer.can_match(pattern_id, component_matches)`
- `ComposedPattern.sequence()`, `alternative()`, `nested()`
- `CompositionMatch.new()`

**Test Cases:**
```javascript
// Create sequence composition: "X的Y和Z" = "Y và Z của X"
const composed = patternProcessor.compose_pattern(
  ["X的Y", "和Z"],
  "Sequence",
  "C0 C1"
);

// Test composed pattern matching
const match = patternProcessor.matchPattern("张三的手和脚");
assert(match.translation === "tay và chân của Trương Tam");
```

**Expected Warnings Resolved:**
- ⚠️ `compose_pattern` is never used
- ⚠️ `get_composed_patterns` is never used
- ⚠️ `compose_translation` is never used
- ⚠️ `get_pattern` is never used
- ⚠️ `get_all_patterns` is never used
- ⚠️ `can_match` is never used
- ⚠️ `ComposedPattern::sequence`, `alternative`, `nested` are never used
- ⚠️ `CompositionMatch::new` is never used
- ⚠️ All compose helper methods validated

---

#### Test 1.5: Multi-Level Hierarchical Matching
**APIs to Test:**
- `PatternProcessor.match_multi_level(text, lookup_fn, max_depth)`
- `PatternProcessor.match_multi_level_recursive()` (internal)

**Test Cases:**
```javascript
// Test nested pattern resolution
const match = patternProcessor.match_multi_level("对他的朋友来说", lookupFn, 3);
// Should resolve: 对[X的Y]来说 → nested pattern
assert(match !== null);
```

**Expected Warnings Resolved:**
- ⚠️ `match_multi_level` is never used
- ⚠️ `match_multi_level_recursive` is never used

---

### Category 2: Type System & Validation APIs ✅ PRIORITY 2

#### Test 2.1: Type Constraints
**APIs to Test:**
- `HierarchicalResolver.is_type_allowed(pattern, variable, var_type)`
- `HierarchicalResolver.validate_resolutions(pattern, resolutions)`
- `AllowedVariableTypes.add_constraint(var, types)`
- `AllowedVariableTypes.is_allowed(var, var_type)`
- `VariableType.is_valid_pattern_variable()`

**Test Cases:**
```javascript
// Test type constraint enforcement
const resolver = new HierarchicalResolver();
resolver.add_type_constraint("X的Y", 'X', ["Person", "ProperNoun"]);

// Should allow Person type
assert(resolver.is_type_allowed("X的Y", 'X', "Person") === true);

// Should reject Place type
assert(resolver.is_type_allowed("X的Y", 'X', "Place") === false);
```

**Expected Warnings Resolved:**
- ⚠️ `is_type_allowed` is never used
- ⚠️ `validate_resolutions` is never used
- ⚠️ `add_constraint` is never used
- ⚠️ `is_allowed` is never used
- ⚠️ `is_valid_pattern_variable` is never used

---

#### Test 2.2: Variable Metadata
**APIs to Test:**
- `VariableMetadata.new_pattern_variable(semantic_type)`
- `VariableMetadata.from_json(json)`
- `VariableMetadata.to_json()`

**Test Cases:**
```javascript
// Create variable metadata
const metadata = VariableMetadata.new_pattern_variable("Person");
const json = metadata.to_json();
const restored = VariableMetadata.from_json(json);
assert(restored.semantic_type === "Person");
```

**Expected Warnings Resolved:**
- ⚠️ `new_pattern_variable` is never used
- ⚠️ `from_json` is never used
- ⚠️ `to_json` is never used

---

### Category 3: Performance & Profiling APIs ⚡ PRIORITY 2

#### Test 3.1: Pattern Matching Cache
**APIs to Test:**
- `PatternProcessor.clear_cache()`
- `PatternProcessor.set_cache_size(size)`
- `PatternProcessor.get_cache_hit_rate()`

**Test Cases:**
```javascript
// Test cache effectiveness
patternProcessor.clear_cache();
patternProcessor.set_cache_size(1000);

// First match - cache miss
patternProcessor.matchPattern("张三的手");

// Second match - cache hit
patternProcessor.matchPattern("张三的手");

const hitRate = patternProcessor.get_cache_hit_rate();
assert(hitRate > 0.5); // At least 50% hit rate
```

**Expected Warnings Resolved:**
- Cache management methods validated

---

#### Test 3.2: Performance Profiling
**APIs to Test:**
- `Profiler.start(operation)`
- `Profiler.end(operation)`
- `Profiler.record(operation, duration)`
- `Profiler.increment(counter)`
- `Profiler.add(counter, value)`
- `Profiler.get_counter(counter)`
- `Profiler.reset()`

**Test Cases:**
```javascript
// Enable profiling
patternProcessor.enable_profiling();

// Test profiler methods
const profiler = patternProcessor.get_profiler();
profiler.start("test_operation");
// ... do work
profiler.end("test_operation");

profiler.increment("test_counter");
profiler.add("test_sum", 100);

assert(profiler.get_counter("test_counter") === 1);
assert(profiler.get_counter("test_sum") === 100);

const report = patternProcessor.get_profile_report();
assert(report.operations.length > 0);

profiler.reset();
```

**Expected Warnings Resolved:**
- ⚠️ `start` is never used
- ⚠️ `end` is never used
- ⚠️ `increment` is never used
- ⚠️ `add` is never used
- ⚠️ `get_counter` is never used
- ⚠️ `reset` is never used

---

### Category 4: Pattern Analysis Utilities 🔧 PRIORITY 3

#### Test 4.1: Pattern Introspection
**APIs to Test:**
- `ParsedPattern.starts_with_variable()`
- `ParsedPattern.ends_with_variable()`
- `ParsedPattern.variable_count()`
- `ParsedPattern.has_variable(var)`
- `ParsedPattern.to_display_string()`
- `ParsedPattern.reconstruct()`
- `ParsedPattern.prefix()`, `suffix()`, `connector()`
- `ParsedPattern.classify()`

**Test Cases:**
```javascript
// Parse pattern and analyze structure
const parsed = ParsedPattern.parse("X的Y");

assert(parsed.starts_with_variable() === true);
assert(parsed.ends_with_variable() === true);
assert(parsed.variable_count() === 2);
assert(parsed.has_variable('X') === true);
assert(parsed.connector() === "的");
assert(parsed.classify() === "Possessive");
```

**Expected Warnings Resolved:**
- ⚠️ All pattern analysis methods validated

---

#### Test 4.2: Pattern Index Utilities
**APIs to Test:**
- `PatternIndex.all_patterns()`
- `PatternIndex.is_empty()`
- `PatternIndex.get_token_patterns(token)`
- `PatternIndex.get_variable_start_patterns()`
- `IndexedPattern.from_str(pattern_str)`

**Test Cases:**
```javascript
// Test pattern index introspection
const index = patternProcessor.get_pattern_index();

assert(index.is_empty() === false);
const allPatterns = index.all_patterns();
assert(allPatterns.length === 17); // Our 17 base patterns

const tokenPatterns = index.get_token_patterns("的");
assert(tokenPatterns.length > 0); // Should find "X的Y" pattern
```

**Expected Warnings Resolved:**
- ⚠️ All pattern index utilities validated

---

### Category 5: Cache & Statistics APIs 📊 PRIORITY 3

#### Test 5.1: LRU Cache Utilities
**APIs to Test:**
- `LruCache.get_mut(key)`
- `LruCache.contains_key(key)`
- `LruCache.len()`
- `LruCache.is_empty()`
- `LruCache.reset_stats()`

**Test Cases:**
```javascript
// Test cache introspection
const cache = patternProcessor.get_cache();

assert(cache.is_empty() === false);
assert(cache.len() > 0);
assert(cache.contains_key("some_pattern"));

cache.reset_stats();
```

**Expected Warnings Resolved:**
- ⚠️ `get_mut` is never used
- ⚠️ `contains_key` is never used
- ⚠️ `len` is never used
- ⚠️ `is_empty` is never used
- ⚠️ `reset_stats` is never used

---

#### Test 5.2: Statistics & Reporting
**APIs to Test:**
- `HierarchicalResolver.reset_stats()`
- `HierarchicalResolver.clear_constraints()`
- Various stats getters

**Test Cases:**
```javascript
// Test statistics management
const resolver = patternProcessor.get_resolver();
const statsBefore = resolver.get_stats();

// ... perform operations ...

const statsAfter = resolver.get_stats();
assert(statsAfter.resolutions_succeeded > statsBefore.resolutions_succeeded);

resolver.reset_stats();
resolver.clear_constraints();
```

**Expected Warnings Resolved:**
- ⚠️ `reset_stats` is never used
- ⚠️ `clear_constraints` is never used

---

## Warnings We Can Ignore (Won't Resolve)

### Category 6: Early Phase Code (Low Value)

These are from Phases 1-2 and may genuinely never be used:

1. **Batch Loader Methods:**
   - `LazyLoadConfig.get_immediate_dictionaries()`
   - `BatchLoadResult.with_deferred()`
   - `BatchLoader.with_config()`, `is_active()`, etc.
   - `convert_batch_data()`, `enrich_with_metadata()`

2. **Dictionary Metadata:**
   - `variable_metadata` field
   - `get_variable_type()`
   - `find_all_matches_parallel()`

**Rationale:** These were experimental features from early phases that we decided not to pursue. Can add `#[allow(dead_code)]` if desired.

---

## Implementation Plan

### Week 1: Core Functionality Testing

**Day 1:**
- [ ] Implement Test 1.1 - Basic Pattern Matching
- [ ] Implement Test 1.2 - Hierarchical Resolution
- [ ] Expected: 7-10 warnings resolved

**Day 2:**
- [ ] Implement Test 1.3 - Context-Aware Matching
- [ ] Implement Test 1.4 - Pattern Composition
- [ ] Expected: 10-15 warnings resolved

**Day 3:**
- [ ] Implement Test 1.5 - Multi-Level Matching
- [ ] Implement Test 2.1 - Type Constraints
- [ ] Implement Test 2.2 - Variable Metadata
- [ ] Expected: 8-10 warnings resolved

### Week 2: Performance & Polish

**Day 4:**
- [ ] Implement Test 3.1 - Cache Testing
- [ ] Implement Test 3.2 - Profiling Testing
- [ ] Expected: 6-8 warnings resolved

**Day 5:**
- [ ] Implement Test 4.1 - Pattern Analysis
- [ ] Implement Test 4.2 - Pattern Index
- [ ] Expected: 10-12 warnings resolved

---

## Success Metrics

### Warning Resolution Target
- **Current:** 28 warnings
- **Category 1 (Critical):** Resolve 15-20 warnings
- **Category 2 (Important):** Resolve 5-8 warnings
- **Category 3 (Nice to have):** Resolve 3-5 warnings
- **Target Total:** Reduce to 3-5 warnings (only truly unused code)

### Functional Validation Target
- [ ] All 17 patterns successfully match test cases
- [ ] Variable resolution works with real dictionaries
- [ ] Type constraints prevent incorrect matches
- [ ] Pattern composition produces correct output
- [ ] Cache hit rate > 85%
- [ ] Performance improvement > 10x vs JavaScript

---

## Progress Tracking

| Category | Tests | Warnings | Status |
|----------|-------|----------|--------|
| Core Pattern Matching | 5 tests | ~20 warnings | ⏳ Not Started |
| Type System | 2 tests | ~6 warnings | ⏳ Not Started |
| Performance | 2 tests | ~6 warnings | ⏳ Not Started |
| Utilities | 2 tests | ~10 warnings | ⏳ Not Started |
| Statistics | 1 test | ~3 warnings | ⏳ Not Started |

**Total Progress:** 0/12 tests complete, 0/28 warnings resolved

---

**Next Step:** Create test file and start with Test 1.1 (Basic Pattern Matching)
