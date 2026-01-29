# Performance Guide

This guide covers performance monitoring, optimization strategies, cache management, and memory leak prevention.

---

## Performance Monitoring

### Check Real Memory Usage

```javascript
window.checkRealMemory(); // Shows real heap usage %
// Healthy: 10-20% usage
// Warning: >30% usage indicates actual memory pressure
// False alarm: Memory warnings with <20% usage = baseline comparison errors
```

### Verify Segment Cleanup

```javascript
window.translationEngine.translationSegments.length;
// Expected: ≤35 segments (automatic cleanup triggers at Emergency:3, Critical:5, Normal:35)
// Problem: >35 segments = cleanup thresholds not working
```

**Pattern**: Translation segments accumulate unbounded arrays, causing 100x slowdown. Proactive cleanup standardized in `PerformanceThresholds.ts`.

### Check Cache Performance

```javascript
window.performanceDashboard.checkCachePerformance();
// Expected: >70% hit rate
// Problem: <70% = content variation, similarity threshold too high, cache size too small
```

### Analyze Performance Baselines

```javascript
window.performanceDashboard.getHealthReport();
// Status: healthy (🟢), warning (🟡), critical (🔴)
// Shows: totalBaselines, recentAlerts, criticalAlerts, recommendations
```

**Common patterns:**

- **False memory alerts** (1.3-2.0x baseline): Startup vs runtime baseline comparison - check real heap first
- **Actual memory leaks** (>35 segments): Cleanup thresholds not triggering
- **Cache degradation** (<70% hit rate): Content variation or configuration issues
- **Processing slowdown** (1.2-1.5x baseline): WASM fallback, dictionary loading delays, DOM bottlenecks

---

## Cache Management

### Cache Invalidation (Unified API)

**Problem**: Dictionary edits don't clear caches → stale translations served after add/update/delete operations.

**Solution** (January 2025): Unified `invalidateAllCaches()` API clears all 6 cache systems:

1. **Dictionary Manager Caches** - Character, phrase, pattern, lookup caches (LRU-based)
2. **Semantic Array Builder Cache** - Capitalization update optimization cache
3. **Pattern Processor Variable Cache** - Pattern variable resolution cache
4. **Rust Lookup Index Cache** - Backend trie indexing cache (dynamically loaded)
5. **Translation Segments** - Interactive highlighting segments
6. **Proper Noun Translation Cache** - Bounded collection (max 10,000 entries)

**Usage**:

```javascript
// Clear all caches (comprehensive)
await window.translationEngine.invalidateAllCaches();

// Clear specific dictionary only
await window.translationEngine.invalidateAllCaches('properNouns');
```

**Automatic invalidation** (January 2025): Dictionary operations automatically invalidate caches:

- `addEntry()` - Clears caches after successful add
- `updateEntry()` - Clears caches after successful update
- `deleteEntry()` - Clears caches after successful delete
- `undo()` / `redo()` - Clears caches after history operations

**Implementation**:

- Unified API: `TranslationEngine.js:6849-6902`
- Dictionary operations: `LazyDictionaryContext.tsx` (lines 383-385, 466-468, 514-516, 558-560, 595-597)

**Why this matters**: Prevents stale translations from being served after dictionary changes. Each cache invalidation is logged with timing for debugging.

---

## When to Profile Performance

**Systematic approach to optimization:**

### Step 1: Confirm Performance Is Actually a Problem

```javascript
// Measure actual user-facing performance
const start = performance.now();
await translateText(sampleText);
const duration = performance.now() - start;
console.log(`Translation took ${duration}ms for ${sampleText.length} chars`);

// Diagnostic questions:
// - Is it slower than 1000 tokens/sec baseline?
// - Does it block the UI (>100ms without yielding)?
// - Do users complain about specific operations being slow?
```

**If NO to all questions**: Don't optimize. System is fast enough.

### Step 2: Identify the Bottleneck (Not Guessing)

```javascript
// Browser DevTools Performance tab:
// 1. Record profile during slow operation
// 2. Identify functions taking >10% of total time
// 3. Focus optimization ONLY on those functions

// Or use inline profiling:
console.time('dictionary-lookup');
const result = dictionaryManager.findMatches(text);
console.timeEnd('dictionary-lookup');

console.time('pattern-matching');
const patterns = patternProcessor.processTokens(tokens);
console.timeEnd('pattern-matching');

// Diagnostic question:
// - Which operation takes >50% of the time?
```

### Step 3: Verify Optimization Impact

```javascript
// Measure before and after with SAME input:
const iterations = 100;
const before = performance.now();
for (let i = 0; i < iterations; i++) {
  oldImplementation(sampleData);
}
const baselineTime = (performance.now() - before) / iterations;

// After optimization:
const after = performance.now();
for (let i = 0; i < iterations; i++) {
  newImplementation(sampleData);
}
const optimizedTime = (performance.now() - after) / iterations;

const speedup = baselineTime / optimizedTime;
console.log(
  `Speedup: ${speedup.toFixed(1)}x (${baselineTime.toFixed(2)}ms → ${optimizedTime.toFixed(2)}ms)`
);

// Diagnostic questions:
// - Is speedup >1.5x? (worth keeping)
// - Is speedup <1.2x? (not worth added complexity)
```

### Common Profiling Targets

- **WASM boundary crossings**: Count calls, batch operations
- **Dictionary lookups**: Measure trie traversal, check O(k) vs O(n) complexity
- **Token array operations**: Profile slice/map/filter chains
- **DOM manipulation**: Measure render blocking, use virtualization thresholds

### Built-in Pattern Matching Profiler

**Rust-side detailed profiling:**

```javascript
// 1. Enable profiling
window.enableMatcherProfiling();
window.resetMatcherProfiling();

// 2. Translate test text

// 3. View detailed breakdown
window.printMatcherProfilingReport();

// Output shows:
// - Variable Resolution time (string building, cache lookups, lookahead)
// - Cache hit rate (percentage of successful variable cache lookups)
// - Early rejection efficiency
// - Literal matching performance
// - Unmeasured overhead

// Diagnostic questions:
// - Is string building >50% of variable resolution? → Pre-compute spans
// - Are cache lookups >50%? → Optimize HashMap key structure
// - Is lookahead >50%? → Skip lookahead for patterns without literals
// - Is cache hit rate <30%? → Dictionary doesn't have entries (not cache problem)
```

**When to use pattern matcher profiling**: When pattern matching takes >50% of translation time and you need to identify which part of variable resolution is the bottleneck.

**Archive**: See `docs/archive/pattern-optimization/PATTERN_MATCHING_DETAILED_VAR_PROFILING.md` for detailed usage instructions and interpretation guide.

### Prevention Strategy

- Profile BEFORE optimizing (never guess bottlenecks)
- Measure actual speedup (feelings lie, numbers don't)
- Only optimize if >1.5x speedup possible (complexity has cost)
- Keep simple implementation if "fast enough" (<100ms, no UI blocking)

**Archive**: See `docs/archive/pattern-optimization/` for real-world profiling examples (hash map cloning: 40-60% speedup, string allocation: 30-40% speedup, verified via measurement).

---

## Memory Leak Prevention

### Timer Cleanup Pattern

**Production stability** (January 2025): Eliminated memory leaks causing 50MB+ accumulation over long sessions.

All `setInterval` must have corresponding `clearInterval` in cleanup/destroy methods.

```javascript
// CRITICAL: setInterval leak fix
class TranslationSegmentCache {
  constructor() {
    this.cleanupIntervalId = null; // Track interval ID

    // Start periodic cleanup
    this.cleanupIntervalId = setInterval(() => {
      this.performCleanup();
    }, 60000);
  }

  destroy() {
    // MUST clear interval on cleanup
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}
```

**Key principles:**

- Store interval ID in instance variable
- Provide explicit `destroy()` method
- Set ID to null after clearing
- Call destroy in React cleanup: `useEffect(() => { return () => cache.destroy(); }, [])`

**Impact**: Long-running sessions 50MB → <10MB

**Implementation**: `TranslationSegmentCache.js:destroy()`, `ProactivePerformanceDetector.js:destroy()`

### Bounded Collection Pattern

Map/Set collections must have size limits with LRU eviction.

```javascript
// CRITICAL: Unbounded Map growth fix
class ProactivePerformanceDetector {
  constructor() {
    this.MAX_BASELINES = 100;
    this.MAX_TRENDS = 200;
    this.MAX_ALERTS = 50;

    this.baselines = new Map();
    this.trends = new Map();
    this.recentAlerts = new Map();
  }

  recordBaseline(metricKey, value) {
    // Enforce size limit with LRU eviction
    if (this.baselines.size >= this.MAX_BASELINES) {
      const firstKey = this.baselines.keys().next().value;
      this.baselines.delete(firstKey); // Remove oldest
    }

    this.baselines.set(metricKey, value);
  }
}
```

**Key principles:**

- Define MAX\_\* constants for all collections
- Check size before adding
- Delete oldest entry (Map insertion order = chronological)
- Typical limits: Baselines=100, Trends=200, Alerts=50

**Impact**: Dictionary switching 20-50MB → <5MB

**Implementation**: `ProactivePerformanceDetector.js:recordBaseline()`, `recordTrend()`, `recordAlert()`

**Additional Bounded Collection Examples** (Code Review Round 9, 2026-01-20):

- **SmoothLoadingManager** (`UIResponsiveness.ts`): 2 Maps with limits (loadingStates=50, callbacks=30)
- **IncrementalDictionarySorter** (`IncrementalDictionarySorter.js`): sortedCache Map limit=15
- **Translator Component** (`Translator.jsx`): Timer cleanup for scrollRestorationTimeoutRef

### localStorage Quota Monitoring Pattern

localStorage has 5-10MB quota. Monitor and cleanup proactively at 80% threshold.

```javascript
// HIGH: localStorage quota monitoring
isApproachingQuota() {
  try {
    let totalBytes = 0;
    const cacheKeys = this.metadata.keys || [];

    for (const key of cacheKeys) {
      const value = localStorage.getItem(key);
      if (value) {
        totalBytes += (key.length + value.length) * 2; // UTF-16 encoding
      }
    }

    const totalMB = totalBytes / 1024 / 1024;
    const quotaLimitMB = 4; // 80% of typical 5MB quota

    if (totalMB > quotaLimitMB) {
      console.warn(`⚠️ localStorage approaching quota: ${totalMB.toFixed(2)}MB / 5MB`);
      this.proactiveCleanup(); // Remove oldest entries
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}
```

**Key principles:**

- Calculate total bytes (key + value, UTF-16 = 2 bytes/char)
- Set threshold at 80% (4MB of 5MB typical quota)
- Trigger proactive cleanup before hitting quota
- Check before every large write operation

**Impact**: Translation cache 12.6MB → <5MB (within quota)

**Implementation**: `TranslationSegmentCache.js:isApproachingQuota()`, `proactiveCleanup()`

### Segment Cleanup Verification Pattern

Translation segments accumulate large arrays. Verify cleanup triggers fire correctly.

```javascript
// HIGH: Segment cleanup verification
cleanupOldSegments() {
  const threshold = this.getSegmentCleanupThreshold();
  const segmentCount = this.translationSegments.length;

  // Log cleanup trigger
  console.log(
    `🧹 Segment cleanup: ${segmentCount} segments (threshold: ${threshold.type}=${threshold.value})`
  );

  if (segmentCount > threshold.value) {
    const removedCount = segmentCount - threshold.value;
    this.translationSegments.splice(0, removedCount);

    console.log(`✅ Removed ${removedCount} old segments, ${this.translationSegments.length} remaining`);
  }
}
```

**Key principles:**

- Log when cleanup triggers (verify thresholds work)
- Log removal count and remaining count
- Expected behavior: ≤35 segments (Emergency:3, Critical:5, Normal:35)
- Problem indicator: >35 segments = thresholds not firing

**Implementation**: `TranslationEngine.js:cleanupOldSegments()`

### Semantic Array Auto-Compact Pattern

Semantic arrays pre-allocate capacity but waste memory if oversized. Auto-compact when >30% waste.

```javascript
// HIGH: Semantic array auto-compact
autoCompactIfNeeded() {
  const wastedCapacity = this.capacity - this.length;
  const wasteRatio = wastedCapacity / this.capacity;

  if (wasteRatio > 0.3) {
    console.log(
      `📦 Auto-compacting semantic array: ${this.capacity} → ${this.length} (${(wasteRatio * 100).toFixed(1)}% waste)`
    );
    this.compact();
  }
}
```

**Key principles:**

- Calculate waste ratio: (capacity - length) / capacity
- Compact if waste >30%
- Log before compacting (helps debug performance)
- Call after translation completes

**Implementation**: `OptimizedSemanticArrayBuilder.js:autoCompactIfNeeded()`

### Test Coverage

**Test Coverage**: 60 tests in `MemoryLeakDetector.test.js` verify memory monitoring and leak prevention.

---

## Failed Patterns (Avoid)

### Architectural restructuring

- Two-phase translation: 63% clickable coverage (vs 100%)
- Separated concerns: Position mapping failures, metadata loss
- Hierarchical processing: Circular references, coordination failures

### Speculative optimization without profiling

- Complex caching system: 1,500+ lines, 0% measurable benefit
- Background processing: Multiple intervals/workers caused lag instead of helping
- WASM memory conflicts: Complex state management triggered unsafe memory access

**Root cause**: Premature optimization without profiling actual bottlenecks. Existing simple cache already provided sufficient performance (1034-7500 tokens/sec).

### WASM full 5-phase engine attempt (Phase 6-7, 2024)

- Complete 5-phase WASM engine (`WasmTranslationAccelerator.js`, 1,951 lines)
- Dictionary lookups returned zero matches (serialization issues across all phases)
- Example: "那三个乞丐" → "Na tam cá khất cái" (character-by-character) instead of "Na ba cá ăn mày" (correct phrases)
- Resolution: Removed, kept focused WASM acceleration (number processing, pattern matching, lookup indexing)

### WASM pattern matching success (January 2025)

- Isolated pattern matching only (not full pipeline): 10-50x speedup, complete parity, production-ready
- Key difference: Focused acceleration vs full translation pipeline prevented serialization issues

**Archive**: See `docs/archive/migrations/WASM_REMOVAL_MIGRATION_GUIDE.md` for complete WASM engine removal details.

---

## Related Guides

- [Architecture Guide](./architecture.md) - System architecture and WASM acceleration
- [Development Guide](./development.md) - Development guidelines, logging, testing
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
