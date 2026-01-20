# Chinese-Vietnamese Translation App

React/Tauri desktop app for translating Chinese novels to Vietnamese. Processes text through 5-phase sequential token consumption (Pattern → Proper Noun → Number → Phrase → Character) with WASM acceleration.

**Performance**: 1000-7500 tokens/sec, 27,000+ dictionary entries loaded in <100ms, WASM accelerates number processing 5-10x and pattern matching 10-50x for 2000+ char texts.

---

## Quick Start

```bash
npm install
npm run tauri:dev  # WASM build (2-3s) → Vite (100-200ms) → Tauri window
```

**Usage**: Paste Chinese text → Select proper noun dictionary → Translate → Add unknown terms (Cmd/Ctrl-1-5) → Reload (Cmd/Ctrl-R) → Re-translate.

**Code Activity Status**: See "WASM Acceleration (Active Systems)" and "Key Files" sections below - 4 WASM systems are active, core engine is JavaScript with targeted WASM acceleration.

---

## System Architecture

### 5-Phase Translation Pipeline (IMMUTABLE)

**Fixed processing order** prevents double-processing conflicts:

1. **Pattern Processing** (Phase 1): Structural patterns with variables (例: "在XY中" → "ở trong X Y")
2. **Proper Noun Processing** (Phase 2): Novel-specific terms from proper noun dictionaries
3. **Number Processing** (Phase 3): Chinese numbers (百分之十五 → 15%, 三千十五 → 3,015)
4. **Phrase Processing** (Phase 4): Common phrases (不知道 → không biết)
5. **Character Processing** (Phase 5): Character dictionary fallback

**Why this order cannot change:**

- Each phase consumes tokens (sets `translated: null, translationSource: "X_consumed"`)
- Later phases only process unconsumed tokens
- Changing order breaks conflict resolution (例: proper nouns would match character-by-character instead)

**Implementation**: `TranslationEngine.js:translateSinglePass()` orchestrates all phases with shared token state.

### WASM Acceleration (Active Systems)

**Only 3 WASM systems are actively used:**

1. **WASM Number Processor** (`wasm-core/src/number_processor.rs`)
   - Handles: Chinese number conversion
   - Activation: All texts with numbers
   - Speedup: 5-10x vs JavaScript
   - Debug: `window.translationEngine.dictionaryManager.getWasmStatus()`

2. **WASM Pattern Processor** (`wasm-core/src/pattern_processor/two_phase.rs`)
   - Handles: Two-phase hierarchical pattern matching (WASM-only, JavaScript fallback removed Jan 2025)
   - Activation: All texts (mandatory)
   - Speedup: 10-50x vs JavaScript
   - Algorithm: O(n*k) find_longest_match replaces O(n*m²) character-by-character processing

3. **WASM Dictionary Engine** (`wasm-core/src/lib.rs` DictionaryEngine)
   - Handles: Trie-based dictionary lookups, loads 7 dictionaries with 27,000+ entries
   - Used via: `WasmDictionaryManager.js`
   - Speedup: O(k) trie lookups vs O(n) linear search

4. **Rust Lookup Index** (`src-tauri/src/lookup_index.rs` - Tauri backend)
   - Handles: Trie indexing for character-only translation
   - Used via: `RustLookupIndexManager.js`
   - Speedup: 6-50x via backend trie indexing

**Archive**: See `docs/archive/pattern-optimization/` for WASM optimization history (hash map cloning elimination, string allocation reduction, early pattern rejection).

### WASM Dictionary Sync Validation (Automatic)

**4-layer state synchronization** (React → JS → WASM → Rust) can diverge if WASM sync fails silently.

**Automatic validation** (January 2025): Every dictionary reload validates WASM sync integrity:

- **Location**: `Translator.jsx:2150-2178` (handleForceReload)
- **What it checks**: Compares WASM vs JavaScript translation results for test words
- **When it runs**: After every Cmd/Ctrl-R reload
- **User notification**: Toast error if sync fails, falls back to JavaScript
- **Validation method**: `EnhancedDictionaryManager.validateWasmFallback()`

**Sync metrics tracking** (January 2025):

- Tracks batch vs sequential loading separately
- Records sync attempts, successes, failures with timestamps
- Maintains last 20 sync attempts in history
- Calculates success rates for overall, batch, and sequential loading
- Debug: `window.performanceDashboard.getWasmSyncMetrics()`

**Why this matters**:

- Batch loading may fail but sequential fallback succeeds (typical: 0% batch, 100% sequential)
- All 12 dictionaries can load successfully via sequential method
- Metrics show true system health, not just batch operation status

### Semantic Arrays (Clickable Highlighting)

**Direct position tracking** (January 2025): Positions stored during `postProcess()` text assembly instead of searching.

**Why precision is critical:**

- Translation and original text must synchronize exactly for click highlighting
- Position mapping uses `setPositionByMatch()` during text concatenation (O(1) lookup vs O(n\*m) search)
- All translation modes must preserve semantic array structure
- Breaking position mapping breaks clickable bidirectional highlighting

**Implementation**: `SemanticArrayBuilder.setPositionByMatch()`, `OptimizedSemanticArrayBuilder.setPositionByMatch()`

---

## Critical Constraints (What Breaks)

### DO NOT Extract These (Architectural Coupling Required)

**5-Phase Processing Logic**:

- **Why coupled**: Shared token state requires synchronous coordination
- **What breaks**: Extracting phases eliminates conflict resolution between phases
- **Location**: `TranslationEngine.js:translateSinglePass()`

**Dictionary Operations**:

- **Why coupled**: Timing-sensitive cache invalidation depends on phase execution order
- **What breaks**: Separating dictionary lookups causes phase priority violations (cache serves character translations instead of proper noun matches)
- **Location**: `TranslationEngine.js:findAllMatchesWithSemanticCache()`

**Semantic Array Generation**:

- **Why coupled**: Position precision depends on exact post-processing assembly order
- **What breaks**: Extracting position mapping loses synchronization with text assembly
- **Location**: `TranslationEngine.js:postProcess()`, semantic array builders

**Configuration Loading** (React useCallback pattern):

- **Why coupled**: Configuration must load at operation time, not capture time
- **What breaks**: Capturing config in useCallback dependencies creates stale config
- **Pattern**: Load config inside callback, not in dependencies

```javascript
// CORRECT: Load at operation time
const handleOperation = useCallback(async () => {
  const currentConfig = await loadConfigurationFile(); // Fresh
  return processWithConfig(data, currentConfig);
}, []); // No config in dependencies

// WRONG: Stale config from React state
const [config, setConfig] = useState(defaultConfig);
const operation = useCallback(() => {
  return processWithConfig(data, config); // Stale
}, [config]);
```

**Archive**: See `docs/archive/refactoring-2026/` for attempted extractions and why they failed.

### DO NOT Modify Dictionaries Without Permission

**Why**: Entries are curated for translation quality, protected by file editing hooks.

**Locations** (Tauri):

- Production: Platform-specific app data directory (macOS: `~/Library/Application Support/com.tauri.dev/dictionaries/`)
- Development fallback: `src/dictionaries/`
- Proper noun dictionaries: `properNouns-{NovelName}.json`

**Archive**: See dictionary modification guidelines in previous sections (preserved from original).

### DO File Architecture This Way

**Large files are intentional:**

- `TranslationEngine.js` (6,299 lines): 5-phase coordination, WASM sync, memory management
- `Translator.jsx` (2,352 lines): Cross-mode state management, configuration timing, UI coordination

**Why extraction fails:**

- Breaking 5-phase processing eliminates conflict resolution
- Separating WASM/JS handling corrupts state isolation
- Extracting semantic array generation breaks clickable precision

**What CAN be extracted** (successful pattern from refactoring 2026):

- Pure utilities with zero `this.*` references
- Self-contained classes with no engine state dependencies
- Pure functions taking all data as parameters
- No side effects, no instance method calls

**Examples of successful extractions**:

- `MemoryLeakDetector.js` (343 lines) - zero engine dependencies
- `TokenHelpers.js` (6 pure functions) - no state modification
- `PatternPriorityCalculator.js` - pure calculation function

**Archive**: See `docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md` for extraction criteria and `EXTRACTION_ANALYSIS.md` for what cannot be extracted.

---

## Common Issues & Debugging

### When Translation Is Wrong

**Systematic diagnosis framework:**

**Step 1: Check Translation Cache**

```bash
# Click "Reload Dictionary" button (clears cache + reloads dictionaries)
```

**Why first**: `TranslationSegmentCache` stores results in localStorage, persists across restarts, can serve stale/corrupted translations despite code fixes.

**Step 2: Verify Execution Path**

```javascript
// Add at function entry to confirm code is running
console.log('🔍 Function called:', { inputLength: text.length });
```

**Common issue**: Function not called due to configuration state problems or disabled features.

**Step 3: Check Phase Processing**

```javascript
// TranslationEngine.js - verify which phases execute
console.log('🔍 Phase A results:', phaseAResults.length);
console.log('🔍 Phase B results:', phaseBResults.length);
console.log('🔍 Final results:', finalResults.length);
```

**Pattern**: Missing results indicate phase not executing or filtering results incorrectly.

**Step 4: Verify Dictionary Entries**

```javascript
// Check if entry exists in dictionary
console.log(
  '🔍 Pattern exists:',
  patterns.find((p) => p.originalPattern === '在XY中')
);
console.log('🔍 Priority:', pattern.metadata.priority);
```

**Pattern**: Entry exists but wrong pattern wins due to priority calculation.

**Step 5: Test Pattern Competition**

```javascript
// When multiple patterns match same text
// Higher priority wins, check priorities:
console.log(
  '🔍 Pattern competition:',
  matches.map((m) => ({
    pattern: m.pattern.originalPattern,
    priority: m.pattern.metadata.priority,
    lowPriority: m.pattern.metadata.lowPriority,
  }))
);
```

**Solution**: Use `lowPriority: true` flag on overly generic patterns to allow specific patterns to win (−12 priority penalty).

**Archive**: See `docs/archive/pattern-optimization/PATTERN_MATCHING_*.md` for pattern matching algorithm optimizations and troubleshooting.

### When Performance Degrades

**Systematic diagnosis framework:**

**Step 1: Check Real Memory Usage**

```javascript
window.checkRealMemory(); // Shows real heap usage %
// Healthy: 10-20% usage
// Warning: >30% usage indicates actual memory pressure
// False alarm: Memory warnings with <20% usage = baseline comparison errors
```

**Step 2: Verify Segment Cleanup**

```javascript
window.translationEngine.translationSegments.length;
// Expected: ≤35 segments (automatic cleanup triggers at Emergency:3, Critical:5, Normal:35)
// Problem: >35 segments = cleanup thresholds not working
```

**Pattern**: Translation segments accumulate unbounded arrays, causing 100x slowdown. Proactive cleanup standardized in `PerformanceThresholds.ts`.

**Step 3: Check Cache Performance**

```javascript
window.performanceDashboard.checkCachePerformance();
// Expected: >70% hit rate
// Problem: <70% = content variation, similarity threshold too high, cache size too small
```

**Step 4: Analyze Performance Baselines**

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

**Archive**: See performance regression detection documentation in earlier sections (preserved).

### When Cache Serves Wrong Translation

**Pattern**: Semantic cache returns character-level translations instead of proper noun translations, violating 5-phase priority.

**Symptoms:**

- Dictionary entry exists but not translating (character fallback used)
- Mixed translation quality (some proper nouns work, others don't)
- Cache hit rate looks good but accuracy degraded

**Root cause**: `SemanticTranslationCache` served cached results without respecting phase priority.

**Diagnostic steps:**

1. Check cache vs dictionary: Verify entry exists but cache serves different result
2. Phase priority analysis: Lower phases (proper nouns=2) must override higher phases (characters=5)
3. Cache metadata inspection: Check if cached result includes `phasePriority` metadata

**Solution pattern**: Phase-aware caching with priority validation

```javascript
// CORRECT: Check phase priority before serving cache
const cacheResult = semanticTranslationCache.get(text, source);
if (cacheResult && cacheResult.metadata.phasePriority <= currentPhasePriority) {
  return cacheResult.result; // Safe to use
}
```

**Implementation**: `TranslationEngine.js:567-636` validates phase priority before serving cached results.

**Resolution**: Click "Reload Dictionary" button - clears all caches including semantic cache.

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

### When to Profile Performance

**Systematic approach to optimization:**

**Step 1: Confirm Performance Is Actually a Problem**

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

**Step 2: Identify the Bottleneck (Not Guessing)**

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

**Step 3: Verify Optimization Impact**

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

**Common Profiling Targets**:

- **WASM boundary crossings**: Count calls, batch operations
- **Dictionary lookups**: Measure trie traversal, check O(k) vs O(n) complexity
- **Token array operations**: Profile slice/map/filter chains
- **DOM manipulation**: Measure render blocking, use virtualization thresholds

**Built-in Pattern Matching Profiler** (Rust-side detailed profiling):

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

**Prevention Strategy**:

- Profile BEFORE optimizing (never guess bottlenecks)
- Measure actual speedup (feelings lie, numbers don't)
- Only optimize if >1.5x speedup possible (complexity has cost)
- Keep simple implementation if "fast enough" (<100ms, no UI blocking)

**Archive**: See `docs/archive/pattern-optimization/` for real-world profiling examples (hash map cloning: 40-60% speedup, string allocation: 30-40% speedup, verified via measurement).

---

## Development Guidelines

### Safe Development Zones

**✅ System Extension Pattern** (proven successful):

- **Monitoring systems**: Performance tracking, memory analysis, validation (例: `MemoryLeakDetector.js`, `PerformanceThresholds.ts`)
- **Utility functions**: Pure helpers with no state dependencies (例: `TokenHelpers.js`, `PatternPriorityCalculator.js`, `ByteFormatter.js`, `ValidationHelpers.js`)
- **Configuration management**: Settings persistence, import/export
- **Development tooling**: Debugging aids, test utilities
- **Type contracts**: WASM boundary validation (例: `WasmTypes.ts` with validation functions)

**Pattern**:

```javascript
// Extend around existing systems without modifying core logic
export class NewMonitoringFeature {
  // Add capabilities
}

class TranslationEngine {
  constructor() {
    this.newFeature = new NewMonitoringFeature(); // Extension
    // Original methods unchanged
  }
}
```

**Archive**: See `docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md` for 5 successful extractions (~680 lines) with zero risk.

**Recent Extractions** (2026-01-16):

- `ByteFormatter.js` (180 lines) - Byte formatting utilities with automatic unit selection
- `ValidationHelpers.js` (340 lines) - 19 pure validation functions for common patterns
- Enhanced `WasmTypes.ts` - Added contracts for all 4 WASM systems with validation functions

### Logging Best Practices

**Environment-aware logging** (2026-01-18): Use `logger` utility instead of `console.*` to reduce production pollution.

```typescript
// ❌ OLD: Always logs (performance overhead, exposes internals)
console.log('Translation started:', text);

// ✅ NEW: Only logs in development
import { logger } from './utils/logger';
logger.log('Translation started:', text);

// Always shown (warnings/errors important in production)
logger.warn('Dictionary not found:', dictId);
logger.error('Failed to save:', error);
```

**Scoped logging** for component-specific logs:

```typescript
import { createScopedLogger } from './utils/logger';
const log = createScopedLogger('TranslationEngine');

log.info('Initializing...'); // → [timestamp] ℹ️ [TranslationEngine] Initializing...
```

**Benefits**:

- **Performance**: ~0.1-0.5ms saved per log call in production
- **Security**: Doesn't expose internal state to end users
- **UX**: Clean developer tools for production debugging
- **Debugging**: Full logging in development with timestamps

**Migration progress** (2026-01-20):

- ✅ **Complete** (327+ calls migrated, 52% of original 632): All WASM wrappers, hot paths, monitoring systems, and caching
  - `WasmNumberProcessor.js`, `WasmDictionaryManager.js`, `RustLookupIndexManager.js`
  - `WasmPatternProcessor.js`, `TranslationEngine.js`, `Translator.jsx`
  - `App.jsx` performance dashboard (92 calls)
  - `ProactivePerformanceDetector.js` (48 calls - console.log/warn/error/group/groupEnd)
  - `ContentAwarePositionCache.js` (7 calls - console.log/warn)
- ✅ **ESLint rule added**: Warns on new `console.*` usage (see `eslint.config.js`)
- ✅ **Production security**: All `window.*` API exposures now guarded by `NODE_ENV` checks
- ✅ **Code cleanup** (2026-01-20): Removed duplicate window API assignments + fixed memory leaks
  - Consolidated `window.translationEngine` to single location (Translator.jsx line 362)
  - Removed duplicate performance monitor assignments (ProactivePerformanceDetector.js)
  - Added initialization flag cleanup to prevent race conditions
  - Fixed App.jsx cleanup to call `destroy()` instead of `stopMonitoring()` (memory leak fix)
  - Fixed CRITICAL memory leaks in singleton classes (3 fixes):
    - `ContentAwarePositionCache.js`: Added destroy() method with interval cleanup
    - `DebugObjectPool.js`: Added destroy() method with interval cleanup
    - `BatchLogger.js`: Added destroy() method (base class for PerformanceLogger)
- ⏳ **Remaining**: ~305 calls in non-critical files (tests, utilities, UI components)

**Migration strategy**: Core migration complete (52%). Remaining calls can be migrated incrementally when editing those files.

**Code maintenance** (2026-01-20): Regular code reviews identified and fixed:

- Duplicate window API assignments (maintenance overhead, bundle bloat)
- Memory leak in App.jsx cleanup (baselineTracker interval not cleared)
- Console.\* usage in ProactivePerformanceDetector.js (48 calls migrated)
- **CRITICAL memory leaks** in singleton classes (setInterval never cleared):
  - ContentAwarePositionCache (5-minute cleanup interval)
  - DebugObjectPool (5-minute cleanup interval)
  - BatchLogger (flush timer)
- Console.\* usage in ContentAwarePositionCache.js (7 calls migrated)

### Active vs Dead Code

**How to verify if code is active:**

```bash
# Check for actual usage (function calls with parentheses)
grep "functionName(" src/ -r

# Check for imports
grep "import.*functionName" src/ -r

# Check execution (add at entry point)
console.log('🔍 Function called:', { args });  # If logs missing = dead code
```

**✅ Active Systems:**

- **Core Engine**: `TranslationEngine.js` (6,541 lines), `Translator.jsx` (2,354 lines)
- **WASM Acceleration**: 4 systems (number processor, pattern processor, dictionary engine, lookup index)
- **JavaScript Processors**: Pattern, proper noun, phrase, character processors
- **Semantic Arrays**: `SemanticArrayBuilder.js`, `OptimizedSemanticArrayBuilder.js`
- **Performance**: All monitoring, caching, and threshold systems
- **UI Components**: All dictionary, control, and display components

**❌ Dead Code (Archived):**

- **Full WASM Translation Engine** (`WasmTranslationAccelerator.js`, 1,951 lines) - Removed 2024
  - Dictionary lookups returned zero matches across all phases
  - See: `docs/archive/migrations/WASM_REMOVAL_MIGRATION_GUIDE.md`
- **JavaScript Pattern Fallback** - Removed Jan 2025
  - WASM pattern processor achieved 100% parity, fallback no longer needed
- **Two-phase translation experiments** - Failed 2026
  - Broke clickable highlighting (63% vs 100% coverage)
  - See: `docs/archive/refactoring-2026/`

**Quick WASM Status Check:**

```javascript
// Browser console in development
window.translationEngine.dictionaryManager.getWasmStatus();
// Shows which WASM systems are active and their performance
```

### Extraction Criteria

**Can be extracted (pure utilities):**

- ✅ No `this.*` references
- ✅ Takes all data as parameters
- ✅ Returns transformed data
- ✅ No side effects
- ✅ No instance method calls

**Cannot be extracted (accessors/getters):**

- ❌ Reads from `this.*` properties
- ❌ Calls `this.*` methods
- ❌ Aggregates instance state
- ❌ Has side effects
- ❌ Delegates to singletons with state updates

**Example comparison:**

```javascript
// ✅ Extractable: Pure formatter (see ByteFormatter.js)
export function formatBytes(bytes, decimals = 2) {
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

// ❌ Not extractable: Accessor method
getEngineStats() {
  return {
    stats: this.stats,  // Instance property
    dictionary: this.dictionaryManager.getGlobalStats() // Instance method
  };
}
```

**Archive**: See `docs/archive/refactoring-2026/EXTRACTION_ANALYSIS.md` for detailed analysis of what cannot be extracted.

### TypeScript Migration Strategy

**Hybrid architecture**: Strategic migration of utilities and UI components while preserving core engine stability.

**Migrated to TypeScript:**

- Core utilities (~15 files): `LRUCache.ts`, `PerformanceThresholds.ts`, `CacheKeyGenerator.ts`, etc.
- Type definitions (19 `.d.ts` files, 11,000+ lines): `SemanticTypes.d.ts`, `DictionaryTypes.d.ts`, `PerformanceTypes.d.ts`, etc.
- UI components: Dictionary system (`.tsx`), controls, displays, error boundaries

**Intentionally JavaScript (never migrate):**

- `TranslationEngine.js` (6,299 lines) - Core 5-phase logic with intentional coupling
- `Translator.jsx` (2,352 lines) - Main UI coordination with complex state timing
- `SemanticPatternProcessor.js` - Pattern matching with performance-critical code
- Other core engine files requiring tight coupling for timing guarantees

**Development:**

- Import syntax: Use `.js` extension in TypeScript imports
- Type checking: `npm run type-check` before committing (0 errors expected)
- Migration principle: Only migrate truly independent utilities and display components

### Error Handling Patterns

**Production reliability** (January 2025): Comprehensive error handling with user-facing notifications and graceful degradation.

**React Async Error Boundaries Pattern**:

Error boundaries don't catch errors in async callbacks. Wrap all async operations in try-catch with toast notifications.

```typescript
// CRITICAL-1: React async operations
const addEntry = useCallback(
  async (dictionaryId: string, source: string, translation: string) => {
    try {
      // Validation
      const validationError = validateDictionaryEntry(dictionaryId, source, translation);
      if (validationError) {
        toast.error(`Invalid entry: ${validationError}`);
        throw new Error(validationError);
      }

      // Optimistic update
      const oldData = { ...dictionaries[dictionaryId] };
      setDictionaries((prev) => ({ ...prev, [dictionaryId]: newData }));

      // Persist to backend
      const result = await window.electronAPI.saveDictionary(dictionaryId, newData);

      if (result.success) {
        toast.success('Entry added successfully');
      } else {
        // Rollback on failure
        setDictionaries((prev) => ({ ...prev, [dictionaryId]: oldData }));
        toast.error(`Save failed: ${result.error}. Changes reverted.`);
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error adding dictionary entry:', error);
      if (!(error instanceof Error && error.message.includes('Invalid entry'))) {
        toast.error(`Could not add entry: ${error.message}`);
      }
      throw error;
    }
  },
  [dictionaries]
);
```

**Key principles:**

- Try-catch wraps entire async operation
- Optimistic updates with rollback on failure
- Toast notifications for all outcomes (success, validation, failure)
- Don't re-toast validation errors (already shown)

**Implementation**: `LazyDictionaryContext.tsx:addEntry()`, `updateEntry()`, `deleteEntry()`, `undo()`, `redo()`

**WASM Graceful Degradation Pattern**:

WASM modules may fail to initialize. Return empty results instead of throwing to allow app to continue with reduced functionality.

```javascript
// CRITICAL-2: WASM pattern processor
export async function processTokensWasm(semanticTokens, variableCache) {
  if (!wasmPatternProcessor) {
    console.warn('⚠️ WASM Pattern Processor not initialized - skipping pattern processing');
    console.warn('Translation will continue with lower quality (no pattern matching)');
    return []; // Graceful degradation, don't block translation
  }

  try {
    return wasmPatternProcessor.processTokens(semanticTokens, variableCache);
  } catch (error) {
    console.error('❌ Error in WASM pattern processing, skipping patterns:', error);
    return []; // Don't propagate error, allow translation to continue
  }
}
```

**Key principles:**

- Check initialization before use
- Warn user about degraded functionality
- Return empty results (not null/undefined)
- Catch and log errors without propagating

**Implementation**: `WasmPatternProcessor.js:processTokensWasm()`, `WasmDictionaryManager.js:findMatches()`

**Initialization Error Recovery Pattern**:

Critical initialization failures need user-visible errors with recovery options.

```javascript
// CRITICAL-3: Translation engine initialization
const [initializationError, setInitializationError] = useState(null);

useEffect(() => {
  async function initializeEngine() {
    try {
      engineRef.current = createTranslationEngine();
      await engineRef.current.initialize(filteredDictionaries, {...});
      setEngineInitialized(true);
      setInitializationError(null);
    } catch (error) {
      console.error('Failed to initialize engine:', error);
      setEngineInitialized(false);
      const errorMsg = error instanceof Error ? error.message : 'Unknown initialization error';
      setInitializationError(errorMsg);
      toast.error(`Engine initialization failed: ${errorMsg}. Try reloading dictionaries.`, {
        duration: 10000,
      });
    }
  }
  initializeEngine();
}, [filteredDictionaries]);

// In render:
{initializationError && (
  <div style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #dc2626', padding: '1rem' }}>
    <strong style={{ color: '#dc2626' }}>⚠️ Translation Engine Error</strong>
    <div style={{ color: '#991b1b' }}>{initializationError}</div>
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button onClick={handleForceReload}>Reload Dictionaries</button>
      <button onClick={() => window.location.reload()}>Reload App</button>
    </div>
  </div>
)}
```

**Key principles:**

- State tracks initialization errors
- Error banner visible to user
- Provide recovery actions (reload dictionaries, reload app)
- Long toast duration (10s) for critical errors

**Implementation**: `Translator.jsx:initializationError state`

**Fallback Mode Notification Pattern**:

When performance-critical systems degrade to slower fallbacks, notify users once.

```javascript
// HIGH-2: Rust lookup index fallback
handleFailure(error) {
  this.consecutiveFailures++;

  if (this.consecutiveFailures >= this.maxFailuresBeforeFallback) {
    console.warn('🚨 Too many Rust lookup index failures, disabling Rust implementation');
    this.enabled = false;

    // One-time notification
    if (!this.showedFallbackWarning) {
      toast.warning(
        'High-performance indexing unavailable. Large texts may translate slower.',
        { duration: 5000 }
      );
      this.showedFallbackWarning = true;
    }
  }
}
```

**Key principles:**

- Track consecutive failures (not total)
- One-time notification (boolean flag prevents spam)
- Warn about performance impact
- Clear, actionable message

**Implementation**: `RustLookupIndexManager.js:handleFailure()`, `WasmDictionaryManager.js:handleFailure()`

**Test Coverage**: 43 tests across 4 test files verify all error handling patterns.

### Memory Management Patterns

**Production stability** (January 2025): Eliminated memory leaks causing 50MB+ accumulation over long sessions.

**Timer Cleanup Pattern**:

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

**Bounded Collection Pattern**:

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

**localStorage Quota Monitoring Pattern**:

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

**Segment Cleanup Verification Pattern**:

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

**Semantic Array Auto-Compact Pattern**:

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

**Test Coverage**: 60 tests in `MemoryLeakDetector.test.js` verify memory monitoring and leak prevention.

### Failed Patterns (Avoid)

**Architectural restructuring:**

- Two-phase translation: 63% clickable coverage (vs 100%)
- Separated concerns: Position mapping failures, metadata loss
- Hierarchical processing: Circular references, coordination failures

**Speculative optimization without profiling:**

- Complex caching system: 1,500+ lines, 0% measurable benefit
- Background processing: Multiple intervals/workers caused lag instead of helping
- WASM memory conflicts: Complex state management triggered unsafe memory access

**Root cause**: Premature optimization without profiling actual bottlenecks. Existing simple cache already provided sufficient performance (1034-7500 tokens/sec).

**WASM full 5-phase engine attempt** (Phase 6-7, 2024):

- Complete 5-phase WASM engine (`WasmTranslationAccelerator.js`, 1,951 lines)
- Dictionary lookups returned zero matches (serialization issues across all phases)
- Example: "那三个乞丐" → "Na tam cá khất cái" (character-by-character) instead of "Na ba cá ăn mày" (correct phrases)
- Resolution: Removed, kept focused WASM acceleration (number processing, pattern matching, lookup indexing)

**WASM pattern matching success** (January 2025):

- Isolated pattern matching only (not full pipeline): 10-50x speedup, complete parity, production-ready
- Key difference: Focused acceleration vs full translation pipeline prevented serialization issues

**Archive**: See `docs/archive/migrations/WASM_REMOVAL_MIGRATION_GUIDE.md` for complete WASM engine removal details.

### Production Build Requirements

**Critical CSP configuration** for WASM loading:

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "security": {
      "csp": "default-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' asset: http://asset.localhost data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost"
    }
  }
}
```

**Note**: Modern `vite-plugin-wasm` only requires `'wasm-unsafe-eval'` - no need for `'unsafe-inline'` or `'unsafe-eval'` which would weaken security.

**Vite WASM configuration** (required plugins and asset handling):

```typescript
// vite.config.ts
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  // CRITICAL: WASM plugins must come before React plugin
  plugins: [wasm(), topLevelAwait(), react(), ...otherPlugins],

  build: {
    rollupOptions: {
      output: {
        // Preserve WASM file names (no content hashing)
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name][extname]'; // No content hashing
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
```

**Required packages**:

```bash
npm install --save-dev vite-plugin-wasm vite-plugin-top-level-await
```

**Why**:

- `vite-plugin-wasm`: Adds WebAssembly ESM integration for wasm-pack generated modules, handles module resolution and dependency optimization
- `vite-plugin-top-level-await`: Supports top-level await in WASM glue code (wasm-pack requirement)
- Asset filename preservation: wasm-pack generates imports with hardcoded filenames - content hashing breaks WASM loading
- Plugin order matters: WASM plugins must process modules before React transformation

**Test production builds before releasing:**

```bash
npm run tauri:build
open "src-tauri/target/release/bundle/macos/Chinese-Vietnamese Translator.app"
# Test: WASM number processing, dictionary loading, translation quality
```

---

## Development Reference

### Keyboard Shortcuts

- **Translator**: Cmd/Ctrl-R (Reload), Cmd/Ctrl-1-5 (Quick Add)
- **Dictionary**: Cmd/Ctrl-L (Focus Search), Click (Edit), Enter (Save), Escape (Cancel)
- **Global**: Cmd/Ctrl-Shift-1-4 (Switch Tabs)

### Development Commands

```bash
# Development
npm run tauri:dev   # Start dev server with WASM hot reload
npm run dev         # Vite-only dev (without Tauri)

# Testing
npm test            # Run tests in watch mode (Vitest)
npm test -- --run   # Run tests once (for CI)
npm run test:ui     # Visual test UI
npm run test:coverage # Generate coverage report

# Code Quality
npm run format      # Format all code with Prettier
npm run format:check # Check formatting without writing
npm run type-check  # TypeScript type checking (0 errors expected)
npm run lint        # ESLint (quiet mode, errors only)
npm run lint:full   # ESLint (all warnings)

# Building
npm run build-wasm     # Build Rust WASM modules (production)
npm run build-wasm-dev # Build Rust WASM modules (development)
npm run build          # Build web assets
npm run tauri:build    # Build production Tauri app
```

### Testing Infrastructure

**Test Runner**: Vitest with React Testing Library
**Test Files**: 19 files across utilities, types, components, and error handling
**Configuration**: `vitest.config.ts`, `src/test/setup.ts`

**Current Status:**

- ✅ **24 test files, 500 tests, all passing** (4,067% increase from baseline)
- ✅ **Utility functions covered** - Token helpers, caching, memory monitoring
- ✅ **WASM boundaries covered** - Type safety, Rust ↔ JS serialization, edge cases
- ✅ **React components covered** - Error boundary, dictionary dialogs
- ✅ **Error handling covered** - WASM degradation, Rust fallback, async operations
- ✅ **Core systems covered** - Phase integration, position mapping, scalability
- ✅ **API contracts covered** - Synchronous method enforcement (prevents breaking changes)

**Test Coverage Details:**

| Category         | Files | Tests | Coverage                                         |
| ---------------- | ----- | ----- | ------------------------------------------------ |
| Utilities        | 5     | 245   | Token helpers, caching, pattern priority, memory |
| WASM Boundaries  | 2     | 57    | Type contracts, undefined → null, edge cases     |
| React Components | 2     | 51    | Error handling, dictionary operations            |
| Error Handling   | 4     | 43    | WASM degradation, Rust fallback, async ops       |
| Regression Tests | 6     | 30    | WASM, engine, semantic arrays, dictionary        |
| Core Systems     | 2     | 34    | Phase integration, position mapping              |
| Scalability      | 1     | 13    | 100K+ entry performance, memory stability        |
| API Contracts    | 1     | 15    | Synchronous method enforcement                   |
| Original         | 1     | 12    | Unicode punctuation detection                    |

**Key Test Files:**

- `TokenHelpers.test.js` (37 tests) - Translation pipeline utilities
- `PatternPriorityCalculator.test.js` (26 tests) - Pattern conflict resolution
- `LRUCache.test.ts` (36 tests) - Translation caching for performance
- `CacheKeyGenerator.test.ts` (59 tests) - FNV-1a hashing, collision resistance
- `MemoryLeakDetector.test.js` (60 tests) - Memory monitoring and leak prevention
- `WasmTypes.test.ts` (27 tests) - WASM type safety (prevents "undefined" in translations)
- `ErrorBoundary.test.tsx` (27 tests) - Error catching and recovery
- `MoveEntryDialog.test.tsx` (24 tests) - Dictionary entry operations
- `LazyDictionaryContext.errorHandling.test.tsx` (12 tests) - Async error handling, rollback
- `WasmPatternProcessor.errorHandling.test.js` (9 tests) - Graceful degradation
- `RustLookupIndexManager.errorHandling.test.js` (10 tests) - Fallback notifications
- `WasmDictionaryManager.errorHandling.test.js` (12 tests) - WASM fallback handling
- `UnicodePunctuationDetector.test.js` (12 tests) - Original test file
- `PhaseIntegration.test.js` (16 tests) - 5-phase pipeline token consumption and priority
- `PositionMapping.test.js` (18 tests) - Position tracking completeness for clickable highlighting
- `WasmBoundaryEdgeCases.test.js` (30 tests) - WASM-JS boundary edge cases and validation
- `DictionaryScalability.test.js` (13 tests) - 100K+ entry performance, O(k) lookup verification, memory stability
- `DictionaryManager.apiContract.test.js` (15 tests) - API contract enforcement, prevents breaking changes

**Test History:**

- **2026-01-07**: Deleted 18 obsolete test files (~3,500 lines) - legacy features, outdated expectations, brittle WASM mocks
- **2026-01-08**: Added 8 new test files (296 tests) - systematic coverage of critical paths
- **2026-01-14**: Added 4 error handling test files (43 tests) - comprehensive error recovery coverage
- **2026-01-16**: Added 5 core system test files (92 tests) - phase integration, position mapping, WASM edge cases, scalability, API contracts

**Philosophy:** Lean test suite focused on critical paths. Write tests when adding new features or fixing bugs.

**Testing Best Practices:**

- Write tests for new utilities before implementing
- Test components for critical UI flows (translation, dictionary editing)
- Mock Tauri APIs (automatically mocked in `src/test/setup.ts`)
- Run `npm test` before committing (enforced by pre-commit hook)
- **API Contract Testing**: Verify critical methods stay synchronous (e.g., `translate()` must not become async)
  - Pattern: `expect(result).not.toBeInstanceOf(Promise)` catches breaking changes
  - See `DictionaryManager.apiContract.test.js` for examples
- See `TEST_COVERAGE_IMPROVEMENTS.md` for detailed coverage breakdown

### CI/CD Pipeline

**GitHub Actions**: `.github/workflows/ci.yml`

**Automated Checks** (runs on push and PR):

1. Type checking (`npm run type-check`)
2. Linting (`npm run lint`)
3. Tests (`npm test -- --run`)

**Pragmatic CI Philosophy**:

- CI focuses on catching development errors (types, lint, tests)
- Production builds verified locally before releases (`npm run tauri:build`)
- No build step in CI - avoids WASM/environment issues, faster runs
- Build works locally; that's what matters for releases

**Pre-commit Hooks**: Husky + lint-staged
**Enforced Locally** (before every commit):

1. Prettier auto-format on staged files
2. ESLint auto-fix on staged files
3. TypeScript type checking on staged `.ts`/`.tsx` files

**Setup**: Hooks install automatically via `npm install` (runs `prepare` script)

### Code Formatting (Prettier)

**Configuration**: `.prettierrc`, `.prettierignore`
**Style**:

- Single quotes, semicolons, 2-space tabs
- 100 character line length
- Trailing commas (ES5)
- LF line endings

**Usage**:

```bash
npm run format        # Format all src/ files
npm run format:check  # Check if files are formatted (CI)
```

**Auto-format on save** (VS Code):

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

**Integration**:

- Pre-commit hook runs Prettier automatically
- ESLint configured to not conflict with Prettier
- Formats `.js`, `.jsx`, `.ts`, `.tsx`, `.css`, `.json`, `.md` files

### Development Debugging Tools

**Access**: Browser console when `NODE_ENV === 'development'`

**⚠️ SECURITY WARNING** (2026-01-19):

All `window.*` debugging APIs MUST be wrapped in `if (process.env.NODE_ENV === 'development')` checks to prevent production exposure.

- **Why this matters**: Exposing internal APIs in production enables reverse engineering, leaks proprietary algorithms, prevents garbage collection, and creates security vulnerabilities.
- **Fixed files**: `ProactivePerformanceDetector.js`, `WasmPatternProcessor.js`, `PatternParityTest.js`
- **Already guarded**: `App.jsx`, `Translator.jsx`

**Never do this**:

```javascript
// ❌ BAD: Exposes in production
if (typeof window !== 'undefined') {
  window.translationEngine = engineRef.current;
}
```

**Always do this**:

```javascript
// ✅ GOOD: Development only
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.translationEngine = engineRef.current;
}
```

```javascript
// System performance monitoring
window.systemPerformanceMonitor; // Regression detection, baseline tracking
window.performanceDashboard; // Health reports, investigation tools

// Direct engine inspection
window.translationEngine; // Engine state, segment arrays
window.translationEngine.translationSegments.length; // Check cleanup (≤35 expected)
window.translationEngine.dictionaryManager.getWasmStatus(); // WASM diagnostics

// Memory and performance
window.checkRealMemory(); // Real heap usage % (10-20% healthy)
window.performanceDashboard.getHealthReport(); // Status, baselines, alerts
window.performanceDashboard.checkCachePerformance(); // Hit rate, suggestions

// WASM sync diagnostics (January 2025)
window.performanceDashboard.getWasmSyncMetrics(); // Batch vs sequential loading metrics

// Cache invalidation (January 2025)
window.translationEngine.invalidateAllCaches(); // Clear all 6 cache systems
window.translationEngine.invalidateAllCaches('properNouns'); // Clear specific dictionary
```

### Key Files

| Purpose           | File                                                                      | Lines | Why Coupled                |
| ----------------- | ------------------------------------------------------------------------- | ----- | -------------------------- |
| Translation Core  | `TranslationEngine.js` (with table of contents)                           | 7,507 | 5-phase state coordination |
| Dictionary System | `DictionaryManager.js`, `EnhancedDictionaryManager.js`                    | -     | Performance + memory unity |
| UI Coordination   | `Translator.jsx`                                                          | 2,352 | Cross-mode synchronization |
| WASM Number       | `wasm-core/src/number_processor.rs`, `WasmNumberProcessor.js`             | -     | Native performance         |
| WASM Pattern      | `wasm-core/src/pattern_processor/two_phase.rs`, `WasmPatternProcessor.js` | -     | 10-50x speedup             |
| WASM Dictionary   | `wasm-core/src/lib.rs`, `WasmDictionaryManager.js`                        | -     | 27,000+ entries            |
| Rust Lookup       | `src-tauri/src/lookup_index.rs`, `RustLookupIndexManager.js`              | -     | Backend trie indexing      |
| Performance       | `PerformanceThresholds.ts`, `MemoryLeakDetector.js`                       | -     | System extension pattern   |

---

## Archive References

**Pattern optimization history**: `docs/archive/pattern-optimization/`

- WASM pattern matching optimizations (hash map cloning, string allocation, early rejection)
- Dictionary phase batching plans
- Rust-side profiling guides

**Refactoring history**: `docs/archive/refactoring-2026/`

- Extraction analysis (what can vs cannot be extracted)
- Extraction summary (5 successful extractions, ~680 lines)
- Refactoring plan and progress

**Migration history**: `docs/archive/migrations/`

- WASM full 5-phase engine removal guide

### Dictionary Inline Editing

**Adaptive table layout**: Column structure changes based on dictionary metadata (patterns get Variable/Low Priority checkboxes, phrases get Variable only, simple dictionaries get 2-column layout).

**Column layouts by type**:

- **Patterns**: Source (40%) | Translation (40%) | Variable (10%) | Low Priority (10%)
- **Phrases**: Source (45%) | Translation (45%) | Variable (10%)
- **Simple**: Source (50%) | Translation (50%) - Characters, Proper Nouns, Conversion, Punctuation

**Workflow**:

- **Click text field** → Input appears with blue border
- **Enter or click outside** → Saves, validates non-empty
- **Escape** → Cancels, reverts to original
- **Checkbox click** → Toggles immediately, saves to JSON

**Performance**: Virtualized scrolling handles 1000+ entries without UI blocking, state isolation prevents edit conflicts.

**Implementation**: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx`

### Pattern Priority Management

**Pattern competition**: When multiple patterns match same text span, priority determines winner.

**Priority formula**:

```
priority = (variables × 10) + tokens.length + (literal_first ? 5 : 0) - (lowPriority ? 12 : 0)
```

**Example**:

- "在XY中" (2 variables, 3 tokens): 20 + 3 = 23 (→ 11 with lowPriority flag)
- "在X眼中" (1 variable, 3 tokens, literal-first): 10 + 3 + 5 = 18
- **Winner**: "在X眼中" (18 > 11) → correct word order

**Usage**: Add `lowPriority: true` to generic patterns in patterns.json to allow specific patterns to win. Shows orange `[LP]` badge in dictionary table.

**Implementation**: `src/utils/PatternPriorityCalculator.js:calculatePatternPriority()`

---

## Token Processing Contracts (WASM-JavaScript Boundaries)

### Type Serialization Rules

**Problem**: Rust `Option<String>` serializes to JavaScript `undefined` (not `null`), causing "undefined" to appear as literal text.

**Rust structure**:

```rust
pub struct Token {
    pub value: String,
    pub translated: Option<String>,  // None → undefined in JS!
    pub translation_source: Option<String>,
}
```

**JavaScript handling**:

```javascript
// ❌ WRONG: Copies undefined, displays "undefined"
tokens[i].translated = processedTokens[i].translated;

// ✅ CORRECT: Explicit null conversion
if (processed.translationSource?.includes('consumed')) {
  tokens[i].translated = null; // Explicit null
} else if (processed.translated !== undefined) {
  tokens[i].translated = processed.translated;
}
```

### Token Modification Pattern

**All token processors (WASM or JavaScript) MUST**:

1. Maintain original token array length (no insert/delete)
2. Set consumed tokens to `{ translated: null, translationSource: "X_consumed" }`
3. Use explicit `null` (not `undefined`) for optional fields
4. Modify tokens in-place (don't replace array)

**Post-processing reliance**:

```javascript
// TranslationEngine.js:postProcess() depends on this pattern
if (token.translated !== null) {
  output = token.translated;  // Use translation
} else if (token.translationSource) {
  continue;  // Skip consumed (null + source = consumed)
} else {
  // Character fallback
}
```

**Critical**: Consumed tokens MUST have `translated: null`, otherwise processed instead of skipped.

### WASM Boundary Type Contracts (Enhanced 2026-01-16)

**Location**: `types/WasmTypes.ts`

**Comprehensive validation** for all 4 WASM systems:

1. **WasmToken** - Number processor tokens with undefined → null conversion
2. **WasmPatternMatch** - Pattern processor results with validation
3. **WasmDictionaryMatch** - Dictionary engine results with defaults
4. **RustLookupMatch** - Lookup index results with type enforcement

**Validation functions**:

- `validateWasmToken()` - Converts undefined to null, logs warnings
- `validateWasmPatternMatch()` - Ensures required fields, provides defaults
- `validateWasmDictionaryMatch()` - Infers length from word, default priority
- `validateRustLookupMatch()` - Enforces dictionary type, infers length
- `copyWasmTokens()` - Two-phase validation prevents partial corruption

**Safety rules documented**:

- undefined → null conversion (Rule 1)
- Array length preservation (Rule 2)
- In-place modification (Rule 3)
- Consumed token pattern (Rule 4)
- Two-phase validation (Rule 5)
- Error propagation (Rule 6)

**Test coverage**: 57 tests across WasmTypes.test.ts and WasmBoundaryEdgeCases.test.js

---

## Development Process Lessons

### Lesson 1: Verify Execution Before Fixing Logic

**Pattern**: Modified code multiple times, rebuilt WASM, cleared caches - but function never called.

**Prevention**:

1. **Verify execution path**: `grep "functionName(" src/` - Is it called?
2. **Check expected logs**: Missing logs = code not running
3. **Add entry point log**: `console.log('🔍 Function called')` - Confirm execution
4. **Then fix logic**: Only modify after verifying reachable

**Template**:

```bash
# Step 1: Verify import
grep "processNumbersWasm" src/utils/TranslationEngine.js

# Step 2: Verify invocation (look for actual call with parentheses)
grep "processNumbersWasm(" src/utils/TranslationEngine.js

# Step 3: Check console logs
# Missing = execution path problem, seeing logs = logic problem
```

### Lesson 2: Test Production Builds During Development

**Pattern**: Dev build worked, production completely failed (CSP blocked WASM in production).

**Prevention**:

- Test production builds during development, not just before release
- Different bundling = different issues (Vite transforms differently)
- Different protocols = different loading (`http://` vs `asset://`)
- Different CSP = different restrictions (relaxed in dev, strict in prod)

**Weekly check**:

```bash
npm run tauri:build
open "src-tauri/target/release/bundle/macos/App.app"
# Quick smoke test critical features
```

### Lesson 3: Type Boundaries Need Explicit Contracts

**Pattern**: Rust `Option::None` became JavaScript `undefined`, displayed as literal "undefined" text.

**Prevention**:

- Document type conversions at boundaries (Rust ↔ JS, WASM ↔ JS)
- Add runtime validation for WASM responses
- Use TypeScript interfaces for WASM-returned types
- Explicit null handling at all boundary crossings

**TypeScript contract** (add to `types/WasmTypes.d.ts`):

```typescript
interface WasmToken {
  translated: string | null; // Explicit: null allowed, undefined NOT allowed
}

function validateWasmToken(token: unknown): WasmToken {
  if (token.translated === undefined) {
    throw new Error('WASM returned undefined instead of null');
  }
  return token as WasmToken;
}
```

### Lesson 4: Follow Existing Patterns

**Pattern**: First attempt replaced entire array, breaking object references. Should have checked how JavaScript `numberProcessor.processTokens()` works first.

**Prevention**:

- Check existing implementations before adding new ones
- Match modification patterns (in-place vs replacement)
- `grep "processTokens(" src/` - How do others do it?

---

## System Requirements

- Node.js compatible with Vite 7.0+
- 4GB+ memory for concurrent dictionary loading
- Rust toolchain for WASM builds (installed automatically via Tauri)
- WASM support (automatic fallback for number processing, WASM-only for pattern matching)
- Tauri system dependencies:
  - macOS: Xcode Command Line Tools
  - Linux: webkit2gtk, libssl-dev, build-essential
  - Windows: Visual Studio Build Tools, WebView2
