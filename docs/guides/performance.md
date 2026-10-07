# Performance Guide

This guide covers performance monitoring, optimization strategies, cache management, and memory leak prevention.

---

## Performance Monitoring

### Check Real Memory Usage

```javascript
window.performanceDashboard.getStats(); // avgTime, totalOperations, opsPerSecond
// Healthy: 10-20% usage
// Warning: >30% usage indicates actual memory pressure
// False alarm: Memory warnings with <20% usage = baseline comparison errors
```

### Verify Segment Cleanup

```javascript
window.translationEngine.translationSegments.length;
// Cleanup is idle-deferred at SEGMENT_CLEANUP_TRIGGER (75) and trims back to
// SEGMENT_CLEANUP_KEEP (35); SEGMENT_CLEANUP_HARD_CEILING (100) trims synchronously.
// Problem: sustained >100 = the engine's own cleanup is not firing
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
- **Actual memory leaks** (segments sustained >100): Cleanup thresholds not triggering
- **Cache degradation** (<70% hit rate): Content variation or configuration issues
- **Processing slowdown** (1.2-1.5x baseline): WASM fallback, dictionary loading delays, DOM bottlenecks

---

## Cache Management

### Cache Invalidation

**Problem**: Dictionary edits don't clear caches → stale translations served after add/update/delete operations.

**Targeted, after an edit**: `DictionaryContext` calls the invalidator `Translator.jsx` registers (`registerCacheInvalidator`) after each mutating operation — add, update, delete, move, undo/redo — which runs `TranslationEngine.invalidateDictionaryCaches(dictionaryId)`: the dictionary manager's lookup caches, the proper-noun translation cache, and a WASM re-sync of that one dictionary.

**Everything, on a reload**: a full invalidation is an engine rebuild (`reinitialize`, from Cmd+R or a binding change), which bumps `engineVersion` — the signal every holder of translated output (the Reader's chunk cache, its outline titles) listens to.

`invalidateAllCaches()`, the older "clear all 6 cache systems" API documented here until 2026-09-26, had no caller in the app (only reachable by hand from devtools) and was deleted — see `deleted-symbols.md`.

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

**A measurement here is invalid unless you prove the thing you meant to measure actually ran.** Six confirmed ways it silently does not:

- **WASM does not run under vitest by default.** `src/test/setup.ts` mocks `translation_wasm_core.js` and Node `fetch` cannot load `file://`, so a profile shows the pattern phase as near-zero. The two `vi.mock`s at the top of `TranslationEngine.phase1.test.js` (the real module, `WasmSharedModule` reading `src/wasm/translation_wasm_core_bg.wasm`) load the real binary; with them, Pattern Matching was 251 of 268 ms (debug build, 2026-10-05).
- **`window.electronAPI` is absent in vitest**, so `buildLookupIndex` throws, `MatchSource` records a failure and, after three, stops trying: a headless profile never exercises the Rust index. Stub `buildLookupIndex` with a counting fake to see how often it fires.
- **Dev builds are debug WASM.** See `wasm-core/CLAUDE.md`'s Build Profile: `bun run dev` / `bun run tauri:dev` overwrite a release binary with a debug one.
- **`phaseProfiler` wraps async functions, so its numbers are wall-clock-with-awaits, not CPU share.** Measured on one run: it reported `Pattern Matching (WASM)` = 463 ms where the actual synchronous WASM work was 69 ms. Treat `getProfilingReport()` percentages as a ranking hint, never as a CPU breakdown.
- **A background tab throttles timers**, and the engine yields between batches, so wall-clock inflates without bound (a 304-char input measured 12 s hidden vs ~35 ms unthrottled) and looks exactly like an algorithmic cliff. Check `document.hidden` before believing any wall-clock number. The throttle-immune measure is the sum of _synchronous_ `WasmPatternProcessor.processTokens` durations.
- **Monkey-patch instrumentation silently misses after a WASM rebuild:** vite then serves the app HMR-busted module URLs, so a console `import('/src/wasm/…')` returns a _different module instance_ than the engine uses — the patch lands on a copy nothing calls, and `isWasmPatternProcessorReady()` read from that copy reports `false` while WASM is fine. Always probe with a tiny translate and assert the hook fired before trusting a run.

Driving the engine outside the native app (needed for browser profiling): the app's own dictionary load goes through Tauri `invoke` and fails with "All 6 dictionaries failed to load" — expected, ignore it. Construct `TranslationEngine` directly and `fetch()` dictionary copies staged under `public/`. Verify output equality on `result.translatedText` only: hashing the whole result is not a valid check, because `semanticArrays` is ordered by chunk completion order and varies between runs.

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

**Benchmarking WASM against its JS twin.** Run the script as `MODE=test bun run x.mjs` (JavaScriptCore, the app's WKWebView engine; it imports repo `.ts` directly, Node cannot) and call `initSync({ module: readFileSync('src/wasm/translation_wasm_core_bg.wasm') })` from `src/wasm/translation_wasm_core.js`, then `new` the Rust class; cross-check on V8 only where Node can import it. Time the wrapper's whole path (JSON in/out, `JSON.parse`, result mapping), not the bare export. Use real call counts (the processor's own stats, e.g. `stringOptimization.precomputedLookups`: 3.4M per 500 characters on the JS fallback matcher) and real novels from `~/Downloads/_FICTION`, not synthetic text, so the boundary-crossing cost is weighed at its real frequency. To diff final engine output between two implementations, copy the setup of `TranslationEngine.phase1.test.js` (real binary via its two mocks) into a temporary `src/**/*.test.js`, load the production dictionaries read-only (`dangerouslyDisableSandbox`), patch the wrapper method per mode, and run a same-mode control: `segments` ids and order differ between two identical runs (parallel chunk completion), so compare `translatedText`. ADR-073, ADR-078 and ADR-079 are the worked examples.

**Sizing an engine call's real inputs.** Put a throwaway test under `src/utils/__tests__/` that loads the real WASM (the two `vi.mock`s at the top of `TranslationEngine.phase1.test.js`), initializes the engine with the production dictionaries, replaces the method with a recorder that then calls the original, and runs `translateWithSegments` over library windows; write the result to a file and delete the test. Do not `vi.mock('../logger')` with a partial object: `logger.debugIfSlow` is called in the translate path. Round 16 found `resolveGlobalConflicts` sees 3 candidates per call at the median (17 at most, 6,728 calls), which no synthetic array would have predicted (ADR-083).

### Common Profiling Targets

- **WASM boundary crossings**: Count calls, batch operations
- **Dictionary lookups**: Measure trie traversal, check O(k) vs O(n) complexity
- **Token array operations**: Profile slice/map/filter chains
- **DOM manipulation**: Measure render blocking, use virtualization thresholds

### Rust-side matcher profiling is not wired up

`wasm-core` exports `enable_matcher_profiling` / `reset_matcher_profiling` and friends, but nothing installs them on `window` — `DevConsole.js` exposes only `translationEngine`, `performanceDashboard` (`getStats` only, ADR-069), `optimizationBenchmarks` and `runOptimizationBenchmarks`. To use the Rust-side breakdown (variable-resolution time, cache hit rate, early-rejection efficiency), expose the exports through `DevConsole.js` first and invoke each one manually once, per the dev-console rot warning in `src/utils/CLAUDE.md`. Usage and interpretation: `docs/archive/pattern-optimization/PATTERN_MATCHING_DETAILED_VAR_PROFILING.md`.

### Prevention Strategy

- Profile BEFORE optimizing (never guess bottlenecks)
- Measure actual speedup (feelings lie, numbers don't)
- Only optimize if >1.5x speedup possible (complexity has cost)
- Keep simple implementation if "fast enough" (<100ms, no UI blocking)

**Archive**: See `docs/archive/pattern-optimization/` for real-world profiling examples (hash map cloning: 40-60% speedup, string allocation: 30-40% speedup, verified via measurement).

---

## Memory Leak Prevention

**Every accumulator that grows per-translation or per-interval needs a size cap and an explicit teardown at the site that creates it.** A cleanup pass bolted on elsewhere does not count — it drifts out of sync with the thing it is cleaning, and the accumulator is unbounded in the window between them. Four accumulator kinds appear here; the generic JS half (store the interval id, clear it in `destroy()`, evict oldest on insert since `Map` iterates in insertion order) is not repeated below, only what is project-specific.

| Accumulator                   | Cap                                                                                                                                                              | Owner                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Translation segments          | `SEGMENT_CLEANUP_TRIGGER` 75 (idle-deferred), trimmed back to `SEGMENT_CLEANUP_KEEP` 35; `SEGMENT_CLEANUP_HARD_CEILING` 100 trims synchronously at the push site | `TranslationEngine`, values in `constants/PerformanceThresholds.ts` |
| Proper-noun translation cache | 10,000 entries                                                                                                                                                   | `TranslationEngine`                                                 |
| localStorage-backed caches    | proactive cleanup at 4MB of the ~5MB quota (count key+value as UTF-16, 2 bytes/char)                                                                             | translation cache                                                   |

Timers follow the same rule: every `setInterval`/`setTimeout` needs its id stored and cleared in a teardown that React's effect cleanup actually calls (`useEffect(() => () => x.destroy(), [])`). `Translator.jsx`'s `highlightScrollTimeoutRef` is the live example — a ref cleared in its own effect cleanup.

Historical impact, for calibration on whether a regression here matters: long sessions went 50MB → <10MB (timer cleanup), dictionary switching 20-50MB → <5MB (bounded collections), translation cache 12.6MB → <5MB (quota monitoring).

Verifying at runtime: `window.translationEngine.translationSegments.length` for segment growth — >35 means the thresholds are not firing. Coverage: `MemoryLeakDetector.test.js`.

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

- [Architecture Guide](./architecture.md) - Execution paths, semantic arrays, token contracts
- [Development Guide](./development.md) - Development guidelines, logging, testing
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
