# Extraction Analysis: Stats "Formatters"

**Date**: January 5, 2026
**Status**: NOT EXTRACTABLE
**Reason**: Instance state dependencies, not pure formatters

---

## Analysis of "Stats Formatters"

### Methods Examined

1. **`getEngineStats()`** (Lines 3176-3196)
2. **`getPerformanceReport()`** (Lines 3256-3265)
3. **`getDashboardMetrics()`** (Lines 3272-3274)

### Why They Cannot Be Extracted

#### 1. getEngineStats() - Instance State Dependencies

```javascript
getEngineStats() {
  const avgTime = this.stats.totalTranslations > 0
    ? this.stats.totalTime / this.stats.totalTranslations
    : 0;

  return {
    isInitialized: this.isInitialized,                          // ❌ Instance property
    totalTranslations: this.stats.totalTranslations,             // ❌ Instance property
    totalTime: this.stats.totalTime,                             // ❌ Instance property
    averageTime: avgTime,                                        // ✅ Calculated (but from instance data)
    throughput: ...,                                             // ✅ Calculated (but from instance data)
    tokenStats: Object.fromEntries(this.stats.tokenStats),       // ❌ Instance property
    dictionaryStats: this.dictionaryManager.getGlobalStats(),    // ❌ Instance method call
    patternStats: this.semanticPatternProcessor.getDebugInfo(), // ❌ Instance method call
    smartMemoryStats: this.getSmartMemoryStats(),                // ❌ Instance method call
  };
}
```

**Dependencies**:
- `this.stats` (instance property)
- `this.isInitialized` (instance property)
- `this.dictionaryManager` (instance property)
- `this.semanticPatternProcessor` (instance property)
- `this.getSmartMemoryStats()` (instance method)

**Conclusion**: This is an **accessor/getter**, not a formatter. It aggregates data from multiple instance properties. Cannot be extracted without passing the entire engine state.

#### 2. getPerformanceReport() - Side Effects

```javascript
getPerformanceReport() {
  // ❌ Reads from instance
  const cacheStats = this.dictionaryManager.getCacheStats();
  const sortingStats = this.dictionaryManager.getSortingStats ? this.dictionaryManager.getSortingStats() : null;

  // ❌ SIDE EFFECT: Modifies global performanceProfiler
  performanceProfiler.updateDictionaryMetrics(cacheStats, sortingStats);
  performanceProfiler.updateMemoryMetrics();

  // ❌ Delegates to global object
  return performanceProfiler.getPerformanceReport();
}
```

**Issues**:
- Reads from instance (`this.dictionaryManager`)
- **Has side effects** (updates `performanceProfiler`)
- Delegates to global singleton

**Conclusion**: Not a pure function. Has side effects and dependencies on instance state.

#### 3. getDashboardMetrics() - Trivial Delegation

```javascript
getDashboardMetrics() {
  return performanceProfiler.getDashboardMetrics();
}
```

**Conclusion**: Trivial one-line delegation to global object. No value in extracting.

---

## Terminology Clarification

**What we thought they were**: Pure formatting functions that transform data
**What they actually are**: Getter/accessor methods that read from instance state

**True Formatter Example**:
```javascript
// Pure formatter - takes data, returns formatted data
function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
```

**Accessor (what these are)**:
```javascript
// Accessor - reads from 'this', aggregates instance data
getEngineStats() {
  return {
    stats: this.stats, // Reads instance state
    manager: this.dictionaryManager.getGlobalStats() // Calls instance methods
  };
}
```

---

## Why Original Plan Was Optimistic

The original REFACTORING_PLAN.md identified these as "Stats Formatters" suitable for extraction. This was based on the assumption that they were pure formatting functions.

However, upon closer inspection:
- They read extensively from `this.*` properties
- They call other instance methods
- They aggregate data from multiple sources
- `getPerformanceReport()` even has side effects

**These are inherent parts of the TranslationEngine class and MUST remain coupled.**

---

## Lessons Learned

### Extraction Criteria Refinement

**Can be extracted (pure utilities)**:
✅ No `this.` references
✅ Takes all data as parameters
✅ Returns transformed data
✅ No side effects
✅ No instance method calls

**Cannot be extracted (accessors/getters)**:
❌ Reads from `this.*` properties
❌ Calls `this.*` methods
❌ Aggregates instance state
❌ Has side effects
❌ Delegates to singletons with state updates

### Examples from Successful Extractions

**✅ Good: Token Helpers**
```javascript
// Pure function - no 'this', takes all data as params
export function getSemanticTokens(tokens) {
  return tokens.filter(t =>
    !t.isGrouped &&
    (t.type === TokenType.CHINESE_WORD || t.type === TokenType.CHINESE_CHAR)
  );
}
```

**❌ Bad: Stats "Formatters"**
```javascript
// Accessor - reads from 'this', not pure
getEngineStats() {
  return {
    stats: this.stats,  // Instance property
    dictionary: this.dictionaryManager.getGlobalStats() // Instance method
  };
}
```

---

## Recommendation

**Do NOT attempt to extract stats methods.**

Instead, we should:
1. ✅ Keep them as class methods (where they belong)
2. ✅ Document them clearly in the SECTION 15 header
3. ✅ Focus extraction efforts on truly pure utilities

---

## Updated Extraction Opportunities

### Still Extractable (Need Investigation)

1. **Text Processing Utilities** - Look for pure string manipulation
2. **Validation Functions** - Look for pure validation logic
3. **Constants/Enums** - Can be moved to separate files

### Not Extractable (Confirmed)

1. ❌ Stats formatters (instance accessors)
2. ❌ 5-phase translation pipeline (coupling required)
3. ❌ Dictionary operations (timing-sensitive)
4. ❌ Semantic array generation (position precision critical)

---

## Conclusion

The stats "formatters" analysis revealed they are actually **getter/accessor methods** that must remain in the TranslationEngine class due to heavy instance state dependencies.

This is a good reminder to:
- Always verify extraction candidates with actual code inspection
- Distinguish between pure formatters and accessors
- Accept when extraction is not possible
- Focus on truly independent utilities

**No extraction will be performed for stats methods.**
