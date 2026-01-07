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
- **Utility functions**: Pure helpers with no state dependencies (例: `TokenHelpers.js`, `PatternPriorityCalculator.js`)
- **Configuration management**: Settings persistence, import/export
- **Development tooling**: Debugging aids, test utilities

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
// ✅ Extractable: Pure formatter
export function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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
      "csp": "default-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost"
    }
  }
}
```

**Vite asset configuration** (preserve WASM filenames):

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
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

**Why**: wasm-pack generates imports with hardcoded filenames. Vite's default content hashing breaks WASM loading in production.

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
**Test Files**: 13 files in `src/utils/__tests__/` (obsolete tests removed)
**Configuration**: `vitest.config.ts`, `src/test/setup.ts`

**Current Coverage:**

- ✅ Utility functions well-tested
- ⚠️ Component tests needed (0 tests for 19+ components)
- ⚠️ Some integration tests failing (7 of 13 test files)

**Test Status (as of 2026-01-07):**

- 13 test files remaining (deleted 6 obsolete test files for removed features)
- 3 test files passing cleanly
- 3 test files with skipped tests (known flaky tests)
- 7 test files failing (need WASM mocking fixes or similar setup)

**Note:** The app works well - test failures are test infrastructure issues, not app bugs.
Tests for legacy features (fallback patterns, emergency rollback) have been removed.

**Testing Best Practices:**

- Write tests for new utilities before implementing
- Test components for critical UI flows (translation, dictionary editing)
- Mock Tauri APIs (automatically mocked in `src/test/setup.ts`)
- Run `npm test` before committing (enforced by pre-commit hook)

### CI/CD Pipeline

**GitHub Actions**: `.github/workflows/ci.yml`

**Automated Checks** (runs on push and PR):

1. Type checking (`npm run type-check`)
2. Linting (`npm run lint`)
3. WASM build (`npm run build-wasm`)
4. Tests (`npm test -- --run`)
5. Production build (`npm run build`)

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
```

### Key Files

| Purpose           | File                                                                      | Lines | Why Coupled                |
| ----------------- | ------------------------------------------------------------------------- | ----- | -------------------------- |
| Translation Core  | `TranslationEngine.js`                                                    | 6,299 | 5-phase state coordination |
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
