# Chinese-Vietnamese Translation App

React/Tauri desktop application for translating Chinese novels to Vietnamese. Processes text through 5-phase sequential token consumption with trie-based dictionary lookups and selective WASM acceleration.

## Quick Start

```bash
npm install
npm run tauri:dev  # Builds WASM core, starts Vite dev server, launches Tauri window
```

**Startup Process**: WASM build (2-3s) → Vite ready (100-200ms) → Tauri window opens.

**Translation Performance**: 5-phase engine with Rust WASM for Chinese number processing (5-10x speedup) and dictionary lookup indexing (6-50x speedup via Rust-powered trie).

## Usage Workflow

1. **Paste Chinese text** → Auto-splits at 18 punctuation types into ~200-character chunks
2. **Select proper noun dictionary** → Choose novel-specific terms
3. **Translate** → Progressive batch processing with real-time results
4. **Add unknown terms** → Quick Add: Cmd/Ctrl-1,2,3,4,5 (auto-copies selected text)
5. **Reload dictionaries** → **Cmd/Ctrl-R** or "Reload Dictionary" button
6. **Re-translate** → New terms now available

## Critical Issue: Translation Cache Corruption

**Symptoms**: Missing capitalization, wrong spacing, persistent formatting errors despite code fixes.

**Root Cause**: `TranslationSegmentCache` stores corrupted results in localStorage that persist across restarts.

**Resolution (ALWAYS TRY FIRST)**:
- Click **"Reload Dictionary"** button (clears cache + reloads dictionaries)

**Manual Cache Clear** (Tauri):
```bash
# macOS
rm -rf ~/Library/Application\ Support/com.tauri.dev/Cache
rm -rf ~/Library/Application\ Support/com.tauri.dev/Local\ Storage

# Linux
rm -rf ~/.local/share/com.tauri.dev/Cache
rm -rf ~/.local/share/com.tauri.dev/Local\ Storage

# Windows
# Delete: %APPDATA%\com.tauri.dev\Cache
# Delete: %APPDATA%\com.tauri.dev\Local Storage

npm run tauri:dev
```

**⚠️ Cache-First Debugging**: ALWAYS clear translation cache before investigating code issues.

## Keyboard Shortcuts

**Translator Tab**: Cmd/Ctrl-R (Reload), Cmd/Ctrl-1-5 (Quick Add)
**Dictionary Tab**: Cmd/Ctrl-L (Focus Search), Click (Edit Text), Enter (Save), Escape (Cancel)
**Global**: Cmd/Ctrl-Shift-1-4 (Switch Tabs)

## Dictionary Inline Editing

**Adaptive Table Layout**: Column structure changes based on dictionary metadata capabilities, eliminating modal dialogs for all editing operations.

**Column Layouts by Dictionary Type**:
- **Patterns**: Source Text (40%) | Translation (40%) | Variable (10%) | Low Priority (10%)
- **Phrases**: Source Text (45%) | Translation (45%) | Variable (10%)
- **Simple Dictionaries**: Source Text (50%) | Translation (50%)
  - Covers: Characters, Proper Nouns, Conversion, Punctuation

**Text Editing Workflow**:
- **Click any text field** → Input appears with blue border
- **Enter or click outside** → Saves changes, validates non-empty strings
- **Escape** → Cancels edit, reverts to original value
- **Auto-focus** → Cursor positioned for immediate typing

**Checkbox Editing**:
- **Direct click** → Toggles immediately, saves to dictionary JSON
- **Metadata handling** → Only sends appropriate fields per dictionary type
- **Visual feedback** → Hover states indicate interactive elements

**Performance Characteristics**:
- **Virtualized scrolling** → Handles 1000+ entries without UI blocking
- **State isolation** → Multiple concurrent edits don't conflict
- **Error recovery** → Failed saves revert to original values with console logging

**Architecture Benefits**:
- **Single editing interface** → Eliminates 3-click modal workflow, reduces to 1-click direct edit
- **Type-aware metadata** → Patterns get both Variable/Low checkboxes, Phrases get Variable only, Simple dictionaries get clean 2-column layout
- **Preserved validation** → Existing dictionary validation and save logic unchanged
- **Future-proof design** → Automatic 2-column layout for new proper noun dictionaries

**Implementation Files**:
- **Table Rendering**: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` - adaptive row components
- **Header Logic**: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` - conditional column headers
- **Save Operations**: Same updateEntry context methods, metadata detection

## Pattern Priority Management

**Pattern Competition Resolution**: When multiple patterns match the same text span, priority calculation determines which pattern wins.

**Priority Calculation**:
```javascript
priority = (variables.length * 10) + tokens.length + (literal_first_token ? 5 : 0) - (lowPriority ? 12 : 0)
```

**Common Conflict Example**:
- "在XY中" (generic, priority 29 → 17 with lowPriority) vs "在X眼中" (specific, priority 19)
- **Result**: "在那些魔帅眼中" → "Ở trong mắt những ma soái kia" (correct word order)

**lowPriority Flag Usage**:
- **Dictionary Tab**: Structural Pattern → Edit pattern → Check "Low priority (for same-length conflicts)"
- **JSON Format**: `{"translation": "ở trong X Y", "allowAsPatternVariable": false, "lowPriority": true}`
- **Visual Indicator**: Orange `[LP]` badge in dictionary table
- **Effect**: -12 priority penalty allows more specific patterns to win

**When to Use lowPriority**:
- Generic patterns that interfere with specific patterns of same length
- Over-broad patterns that produce incorrect word order
- Fallback patterns that should only match when no better option exists

**Implementation Files**:
- **Core Logic**: `src/utils/SemanticPatternProcessor.js` - `calculatePatternPriority()` method
- **JSON Loading**: `src/utils/SemanticPatternProcessor.js` - lowPriority extraction in pattern compilation
- **UI Components**: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` - badge display
- **Edit Form**: `src/components/dictionary/DictionaryEntry.tsx` - checkbox

## System Architecture Constraints

### Core Translation Requirements (IMMUTABLE)

**5-Phase Sequential Processing**: Pattern → Proper Noun → Number → Phrase → Character
- **Why Immutable**: Fixed order prevents double-processing conflicts and ensures pattern variable resolution
- **Token Consumption**: Each token processed by exactly ONE phase
- **Engine State**: Single shared state requires sequential execution between modes

**Semantic Array Precision**: Position mapping must align exactly with clickable highlighting
- **Why Critical**: Translation and original text synchronization depends on precise start/end indices
- **UI Dependency**: All translation modes must preserve semantic array structure

**WASM Status**: Selective acceleration for specific features
- **Active**: Chinese number processing (`WasmNumberProcessor.js`), Rust lookup index (`RustLookupIndexManager.js`)
- **Removed**: Full translation acceleration (WasmTranslationAccelerator.js - 1,951 lines removed, see `WASM_REMOVAL_MIGRATION_GUIDE.md`)
- **Why**: Dictionary lookups returned zero matches in WASM, causing character-by-character fallback instead of phrase matching

### File Architecture Rationale

**Large Files Are Intentional**:
- `TranslationEngine.js` (6,400+ lines): 5-phase coordination, WASM sync, memory management
- `Translator.jsx` (2,500+ lines): Cross-mode state management, configuration timing, UI coordination

**Why Extraction Fails**:
- Breaking 5-phase processing eliminates conflict resolution
- Separating WASM/JS handling corrupts state isolation
- Extracting semantic array generation breaks clickable precision

**Successful Refactoring (December 2025)**:
- **Phase 1**: Extracted 3 independent hooks (usePerformanceMonitoring, useStreamingTranslation, useDictionaryConfig) - 329 lines into reusable modules
- **Phase 2**: Extracted 2 display components (TranslatorControls, TranslatorDisplayPanels) - 362 lines with clean prop interfaces
- **Results**: Translator.jsx reduced 2835 → 2492 lines (12.1% reduction), zero functionality loss
- **Key Insight**: Only extract truly independent state/display logic; core translation orchestration must remain coupled for timing guarantees

## Development Guidelines

### Safe Development Zones

**✅ SAFE Extensions** (recommended pattern):
- **Monitoring systems**: Performance tracking, memory analysis, validation
- **Utility functions**: Text processing helpers, format conversion
- **Configuration management**: Settings persistence, import/export
- **Development tooling**: Debugging aids, test utilities

**Pattern Example**:
```javascript
// Extend around existing systems
export class NewMonitoringFeature {
  // Add capabilities without modifying core logic
}

class TranslationEngine {
  constructor() {
    this.newFeature = new NewMonitoringFeature(); // Extension
    // Original methods unchanged
  }
}
```

**❌ NEVER Touch** (breaks core functionality):
- 5-phase token processing sequence
- Semantic array position mapping
- WASM/JavaScript engine coordination
- Dictionary trie operations
- React useCallback configuration patterns

**TypeScript Migration Status** (January 2025):

The codebase uses a **hybrid TypeScript/JavaScript architecture** with strategic migration of utilities and UI components while preserving core engine stability.

**Migrated to TypeScript**:
- **Core utilities**: ~15 files converted to `.ts` (LRUCache, PerformanceThresholds, CacheKeyGenerator, ErrorHandling, UnifiedLogger, etc.)
- **Type definitions**: 19 comprehensive `.d.ts` files (11,000+ total lines) covering all major systems:
  - `SemanticTypes.d.ts` - Translation engine interfaces
  - `DictionaryTypes.d.ts` - Dictionary system types
  - `PerformanceTypes.d.ts` - Performance monitoring
  - `WasmTypes.d.ts` - WASM acceleration interfaces
  - `HookTypes.d.ts`, `UITypes.d.ts`, `EventTypes.d.ts` - React components
- **UI components**: Dictionary system (`.tsx`), controls, displays:
  - `EnhancedVirtualizedDictionaryTable.tsx`
  - `DictionaryContext.tsx`
  - `DictionaryEntry.tsx`
  - `TranslatorControls.tsx`
  - `TranslatorDisplayPanels.tsx`
  - `MoveEntryDialog.tsx`
  - Error boundaries and utility components

**Intentionally JavaScript** (will NEVER migrate):
- `TranslationEngine.js` (6,737 lines) - Core 5-phase translation logic with intentional coupling
- `Translator.jsx` (2,566 lines) - Main UI coordination with complex state timing
- `SemanticPatternProcessor.js` - Pattern matching engine with performance-critical code
- Other core engine files requiring tight coupling for timing guarantees

**Development Guidelines**:
- **Import syntax**: Use `.js` extension in TypeScript imports (e.g., `import { foo } from './bar.js'`)
- **Type checking**: Run `npm run type-check` before committing utility changes (0 errors expected)
- **Migration principle**: Only migrate truly independent utilities and display components
- **Core stability**: Never migrate files with timing dependencies or cross-mode synchronization

### Dictionary Modification Restrictions

**NEVER modify dictionary files without explicit permission.** Entries are curated for translation quality.

**Dictionary Locations (Tauri)**:
- **Production**: Platform-specific application data directory
  - macOS: `~/Library/Application Support/com.tauri.dev/dictionaries/`
  - Linux: `~/.local/share/com.tauri.dev/dictionaries/`
  - Windows: `%APPDATA%\com.tauri.dev\dictionaries\`
- **Development fallback**: `src/dictionaries/`
- **Proper noun dictionaries**: `properNouns-{NovelName}.json` (e.g., `properNouns-TuChanTheGioi.json`)

**Protected by hooks**: File editing blocked on `src/dictionaries/**` paths.

## Common Issues & Solutions

### Configuration State Problems

**Symptoms**: Operations ignore config changes despite updates in storage.

**Root Cause**: `useCallback` captures config at creation time, not execution time.

**Solution Pattern**:
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

### React State Timing Issues

**Solution**: Use direct parameters vs async state updates.

```javascript
// CORRECT: Synchronous local variables
const savedPositions = capturePositions();
operationThatChangesDOM();
restoreFunction(savedPositions);

// WRONG: Async state timing gaps
setSavedPositions(positions);     // Queued
restoreFunction();               // Executes immediately, sees stale data
```

### Performance Degradation Patterns

**Translation Segment Memory Leak**: Translation segments accumulate unbounded arrays causing 100x slowdown after extended use

**Symptoms**:
- Progressively slower translation with each operation
- Memory usage growing from ~50MB to 500MB+ over time
- UI becomes unresponsive during large translations

**Root Cause**: Translation segments accumulate during normal operation without automatic cleanup

**Solution**: Proactive cleanup with standardized threshold hierarchy (implemented in `TranslationEngine.js`)
- **Emergency Cleanup**: >3 segments → keep 3 (configured in `PerformanceThresholds.ts`)
- **Critical Cleanup**: >5 segments → keep 5 (configured in `PerformanceThresholds.ts`)
- **Normal Cleanup**: >75 segments → keep 35 (uses `MEMORY_THRESHOLDS` from `PerformanceThresholds.ts`)
- **Implementation**: Cleanup logic at `TranslationEngine.js:3362-3371` checks segment count and removes oldest entries
- **Preservation**: Maintains full clickable highlighting functionality
- **Reset**: Fresh segment array for each new translation (`TranslationEngine.js` - `translateWithProgressiveBatches()` method)

**Engine State Corruption**: Main translation outputs character-by-character Vietnamese
- **Solution**: Sequential execution with `setTimeout(..., 0)` between modes

### Cache Interference with Translation Priority

**Cache Serving Wrong Translation Phases**: Semantic cache returns character-level translations instead of proper noun translations, violating 5-phase priority order.

**Symptoms**:
- Proper noun entries exist in dictionary but not translating (character fallback used)
- Mixed translation quality: some proper nouns work, others don't
- Cache hit rate looks good but translation accuracy degraded

**Root Cause**: `SemanticTranslationCache` served cached results without respecting phase priority. Character-level cache hits prevented proper noun dictionary lookups.

**Diagnostic Steps**:
1. **Check cache vs dictionary**: Verify entry exists in dictionary but cache serves different result
2. **Phase priority analysis**: Lower phases (proper nouns=2) must override higher phases (characters=5)
3. **Cache metadata inspection**: Check if cached result includes `phasePriority` metadata

**Solution Pattern**: Phase-aware caching with priority validation
```javascript
// CORRECT: Check phase priority before serving cache
const cacheResult = semanticTranslationCache.get(text, source);
if (cacheResult && cacheResult.metadata.phasePriority <= currentPhasePriority) {
  return cacheResult.result; // Safe to use
}
// WRONG: Serve any cache hit regardless of translation phase
```

**Implementation**: `TranslationEngine.js:567-636` - `findAllMatchesWithSemanticCache()` validates phase priority before serving cached results.

**Dictionary Reload Cache Persistence**: Semantic cache not cleared during dictionary reload, serving stale translation results.

**Symptoms**: Dictionary changes not reflected after clicking "Reload Dictionary" button
**Root Cause**: `handleForceReload()` cleared main caches but not semantic cache
**Solution**: Added `semanticTranslationCache.clear()` to reload sequence (`Translator.jsx` - `handleForceReload()` method)

### WASM Boundary Crossing Performance Bottlenecks

**Symptoms**: Dictionary operations slower in WASM than JavaScript despite trie optimization, translation performance degrades during pattern variable resolution.

**Root Cause**: N sequential lookups cross WASM boundary N times with expensive serialization. Original O(n*m²) algorithm processed each character individually.

**Diagnostic Steps**:
1. **Check WASM vs JS performance**: Profile dictionary lookup times in both engines
2. **Monitor boundary crossings**: Count serialization calls vs actual lookups needed
3. **Verify trie efficiency**: Ensure `find_longest_match` processes spans, not individual characters

**Architectural Solution**: Batch operations eliminate repeated boundary crossings
```rust
// CORRECT: Process entire span array in single WASM call
let results = find_longest_match(dictionary_trie, token_spans);
// Processes [2,3,1,4] character spans in optimized order

// WRONG: N individual character lookups
for char in text {
    let result = lookup_single_char(dictionary_trie, char); // Boundary crossing each time
}
```

**Implementation**:
- **WASM Core**: `wasm-core/src/number_processor.rs`, `wasm-core/src/lookup_index.rs`
- **JavaScript Interface**: `WasmNumberProcessor.js`, `RustLookupIndexManager.js`
- **Performance**: O(n*m²) → O(n*k) complexity, 99.8% reduction in boundary crossings

**Prevention Strategy**: Always batch WASM operations, process collections not individual items, profile boundary crossing frequency during optimization.

### Pattern Priority Competition Conflicts

**Incorrect Word Order from Pattern Competition**: Multiple patterns match same text span, but wrong pattern wins due to priority calculation, causing incorrect word order in translation.

**Symptoms**:
- Translation exists but word order is wrong (例: "Ở trong những ma soái kia mắt" instead of "Ở trong mắt những ma soái kia")
- Console shows multiple pattern matches but wrong pattern selected as winner
- Dictionary entries exist for both competing patterns

**Root Cause**: Priority calculation favors patterns with more variables, causing generic patterns to beat specific patterns of same length.

**Diagnostic Steps**:
1. **Check translation logs**: Look for multiple "✅ Pattern MATCH" followed by wrong "🏆 WINNER"
2. **Compare pattern priorities**: Generic patterns (more variables) get higher base priority than specific patterns
3. **Verify pattern length**: Same-length patterns compete directly, variable count determines winner

**Common Competition Patterns**:
- **Generic vs Specific**: "在XY中" (2 variables, priority 29) beats "在X眼中" (1 variable, priority 19)
- **Overly Broad Patterns**: Multi-variable patterns matching specific single-variable contexts
- **Structural vs Semantic**: Structural patterns interfering with contextual translations

**Solution Pattern**: lowPriority flag for overly generic patterns
```javascript
// patterns.json - Mark generic pattern as low priority
"在XY中": {
  "translation": "ở trong X Y",
  "allowAsPatternVariable": false,
  "lowPriority": true  // -12 priority penalty
}
```

**Priority Calculation Impact**:
- **Before**: "在XY中" priority 29 vs "在X眼中" priority 19 → Wrong winner
- **After**: "在XY中" priority 17 vs "在X眼中" priority 19 → Correct winner

**Prevention Strategy**: Use lowPriority flag for fallback patterns that should only match when no more specific pattern exists. Test patterns with overlapping contexts during development.

**Implementation**: Priority penalty applied at `SemanticPatternProcessor.js:298`, UI support in Dictionary tab with orange `[LP]` badge and checkbox.

### Performance Regression Detection & Investigation

**When Performance Degrades**: Systematic framework for detecting and investigating gradual performance degradation before it becomes critical.

**Step 1: Check Regression Health Status**
```javascript
// Monitor real-time health in Translator tab UI
// 📊 🟢3 = healthy, 3 baselines   📊 🟡2!1 = warning, 2 baselines, 1 alert   📊 🔴1!3 = critical, 1 baseline, 3 alerts

// Get detailed health report
window.performanceDashboard.getHealthReport()
// Returns: status, totalBaselines, recentAlerts, criticalAlerts, warningAlerts, recommendations
```

**Step 2: Investigate Memory Alerts**
```javascript
// First, check if memory alerts are false positives
window.checkRealMemory()
// Shows: real heap usage % - healthy systems typically show 10-20% usage

// Get specific investigation suggestions for memory issues
window.performanceDashboard.investigateMemoryAlerts()
// Shows: memory ratio analysis, cleanup suggestions, debugging commands

// Direct engine inspection for memory leaks
window.translationEngine.translationSegments.length
// Should be ≤35 segments normally; >35 triggers automatic cleanup
```

**Step 3: Analyze Performance Baselines**
```javascript
// Check established baselines and recent performance
window.performanceDashboard.getBaselines()
// Shows: translation_engine, position_cache, virtual_scrolling performance baselines

// Check cache performance specifically
window.performanceDashboard.checkCachePerformance()
// Shows: hit rate, optimization suggestions if <70%
```

**Common Performance Regression Patterns**:
- **False Memory Alerts (1.3-2.0x baseline)**: Startup vs runtime baseline comparison errors - check real heap usage first
- **Actual Memory Leaks (>35 translation segments)**: Translation segment cleanup threshold issues, cache unbounded growth
- **Cache Degradation (<70% hit rate)**: Content variation, similarity threshold too high, cache size too small
- **Processing Slowdown (1.2-1.5x baseline)**: WASM fallback mode, dictionary loading delays, DOM manipulation bottlenecks

**Diagnostic Questions**:
1. **Is memory pressure real?** `window.checkRealMemory()` - >30% indicates actual issues, <20% suggests false alerts
2. **Are cleanup thresholds working?** `window.translationEngine.translationSegments.length` should be ≤35
3. **Which system is regressing?** Check alerts by type: `translation_engine`, `position_cache`
4. **Is it gradual or sudden?** Baseline tracking detects gradual trends, sudden changes suggest different causes
5. **Does "Reload Dictionary" fix it?** Yes = translation cache issue, No = architectural problem

**Quick Resolution Steps**:
1. **Memory warnings**: First run `window.checkRealMemory()` - if <20% usage, alerts are false positives
2. **Real memory issues**: Click "Reload Dictionary" button to clear caches, check segment count with `window.translationEngine.translationSegments.length`
3. **Cache performance**: Use `window.performanceDashboard.checkCachePerformance()` for optimization suggestions
4. **Persistent issues**: Check browser memory limits, restart application, use `window.performanceDashboard.exportData()` for analysis

**Prevention Strategy**: The system establishes baselines automatically and monitors continuously. Alerts trigger before performance becomes critically degraded, enabling proactive resolution.

## Current System Status

### Active Performance Optimizations

**WASM Acceleration**:
- Chinese number processing: 5-10x speedup for conversions (e.g., 百分之十五 → 15%, 三千十五 → 3,015)
- Rust lookup index: 6-50x speedup via trie-based dictionary indexing
- Note: Full translation acceleration removed (see `WASM_REMOVAL_MIGRATION_GUIDE.md`)

**Viewport Optimization**:
- Large text rendering: 98.5% improvement (6800ms → 50ms)
- Virtualized segments: On-demand generation vs precomputing all
- Acceleration thresholds: <1000 chars (JS), 1000-2000 (Workers), >2000 (WASM)

**Position Mapping Acceleration**:
- Sliding window search: O(n*m) → O(n) complexity for texts >2000 chars with >100 semantic units
- Window-based lookup: 1000-char search windows instead of full text scans (up to 10,000+ chars)
- Position caching: 30-70% cache hit rates for repetitive content patterns reduce redundant searches
- Automatic activation: Triggers at 2000+ chars + 100+ units, preserves exact clickable highlighting precision

**Memory Management**:
- Smart pressure detection: Real heap usage vs fixed thresholds
- Background cleanup: `requestIdleCallback()` scheduling
- Progressive translation: Available for all text lengths
- WASM memory pools: Pre-allocated buffers (small/medium/large) with recycling efficiency >70%

**Proactive Performance Regression Detection**:
- Baseline tracking: Establishes performance baselines for translation_engine, position_cache
- Automated alerts: Detects 20%+ degradation (warning) and 50%+ degradation (critical) - memory alerts disabled due to false positives
- Memory leak detection: Standardized cleanup thresholds (Emergency: 3, Critical: 5, Normal: 35 segments) with consistent hierarchy
- Trend analysis: 5, 15, 30, 60-minute performance trend monitoring with degradation slope calculation
- Investigation framework: Real memory vs baseline comparison (`window.checkRealMemory()`) + systematic debugging via `window.performanceDashboard`
- UI integration: Real-time health indicator in Translator tab (`📊 🟢3` = healthy, 3 baselines; `📊 🔴1!3` = critical, 1 baseline, 3 alerts)

### Key Files Reference

| Purpose | File | Key Functions | Why Coupled |
|---------|------|---------------|-------------|
| **Translation Core** | `TranslationEngine.js` | `translateSinglePass()`, `processChunksInParallel()` | 5-phase state coordination |
| **Dictionary System** | `DictionaryManager.js`, `EnhancedDictionaryManager.js` | Trie lookups, validation | Performance + memory unity |
| **UI Coordination** | `Translator.jsx` | `handleForceReload()` | Cross-mode synchronization |
| **WASM Number Processing** | `wasm-core/src/number_processor.rs`, `WasmNumberProcessor.js` | Chinese number conversion | Native performance |
| **WASM Lookup Index** | `wasm-core/src/lookup_index.rs`, `RustLookupIndexManager.js` | Trie-based dictionary indexing | 6-50x speedup |
| **Performance** | `UIResponsiveness.ts`, `MemoryManagementRefinements.ts` | Debounced updates, smart memory pressure | System extension pattern |
| **Regression Detection** | `ProactivePerformanceDetector.js` | Baseline tracking, automated alerts, trend analysis | Zero-risk monitoring extension |
| **Memory Optimization** | `WasmMemoryPoolManager.ts` | Pre-allocated WASM buffers, recycling efficiency | Boundary crossing optimization |
| **Code Quality** | `types/SemanticTypes.d.ts`, `PerformanceThresholds.ts`, `ErrorHandling.ts`, `UnifiedLogger.ts`, `CacheKeyGenerator.ts` | TypeScript interfaces, centralized thresholds, standardized error/logging/caching | Maintainability and debugging |
| **Refactored Modules** | `hooks/usePerformanceMonitoring.js`, `hooks/useStreamingTranslation.js`, `hooks/useDictionaryConfig.js`, `translator/TranslatorControls.tsx`, `translator/TranslatorDisplayPanels.tsx` | Independent state hooks, display components | Safe extraction from Translator.jsx |

**Detailed Refactoring Analysis**: See "Successful Refactoring (December 2025)" section above for complete analysis of what was successfully extracted vs what must remain coupled due to timing dependencies.

## System Integration Status

### Active Features (Production)

- ✅ **Chinese number processing (WASM)**: 5-10x speedup for conversions (百分之十五 → 15%, 三千十五 → 3,015)
- ✅ **Rust lookup index**: 6-50x speedup via trie-based dictionary indexing (RustLookupIndexManager.js)
- ✅ **5-phase translation (JavaScript)**: Sequential token consumption with immutable phase order (Pattern → Proper Noun → Number → Phrase → Character)
- ✅ **Clickable highlighting**: Position mapping with semantic arrays, sliding window optimization for texts >2000 chars

### Removed Features

- ❌ **Full WASM translation**: WasmTranslationAccelerator.js (1,951 lines removed) - See WASM_REMOVAL_MIGRATION_GUIDE.md for rationale
- ❌ **Dead code cleanup** (December 2025): 12 unused files removed (~3,500 lines)
  - Virtualized components never imported (VirtualizedClickableTranslation.jsx, VirtualizedClickableTranslationViewport.jsx, ClickableOriginalOptimized.jsx)
  - Replaced utilities (ViewportSegmentComputer.js → ViewportSegmentComputerEnhanced.js)
  - Pattern processing duplicates (PatternCompiler.js → SemanticPatternProcessor.js)
  - Test/benchmark files only (WasmPerformanceBenchmark.js, WasmLoadTester.js, setupLookupIndexTest.js)
  - Unused utilities (SilentLogger.js, TranslationValidator.js, PatternConfiguration.js)

### Partially Implemented Features

- ⏸️ **Phase 7 pattern composition**: Infrastructure complete (2,700+ lines in wasm-core), APIs exported but not integrated into TranslationEngine
- ⏸️ **Phase 8 integration tests**: Test plan exists (docs/archive/phase-reports/PHASE8_TEST_PLAN.md) but not executed
- ⏸️ **Variable type system**: 9 semantic types defined (Person, Place, ProperNoun, etc.) but not used in active translation pipeline

**Historical Context**: See docs/archive/phase-reports/ for detailed completion reports of Phases 1-7 and docs/archive/ROADMAP_HISTORICAL.md for original development roadmap.

## Evidence-Based Development Approach

### Proven Successful Pattern

**System Extension** (1,200+ lines added successfully):
- Add monitoring, validation, performance tools around existing architecture
- Zero impact on translation quality or clickable highlighting
- UI responsiveness, memory management, selective WASM acceleration all added via extension

**Recent Optimizations** (October-December 2025):

*October 2025 - Batch Processing*:
- **Progress debouncing**: 300ms threshold reduces callbacks by 60-80%, saves 20-30% UI blocking (`TranslationEngine.js:3944-4372`)
- **Binary search segments**: O(n²) → O(n log n) overlap detection, 35-40ms per batch (`TranslationEngine.js` - 90 lines)
- **Larger batches**: Earlier virtualization for texts >3000 chars

*October 2025 - Boundary Crossing Reduction*:
- **WASM batch loading**: Single call replaces N sequential dictionary loads - 5-10x reduction in boundary crossings
- **Token string precomputation**: `PrecomputedTokenStrings` eliminates 15,000 dynamic slice().join() operations with 70 Map lookups (`SemanticPatternProcessor.js:16-46`) - 5-10x pattern matching speedup
- **WASM trie optimization**: O(n*k) `find_longest_match` replaces O(n*m²) character-by-character processing
- **Dictionary loading fix**: Non-base proper noun dictionaries load correctly from Tauri application data directory
- **Static CSS compilation**: Eliminates dynamic style injection (`StreamingTranslationDisplay.jsx` → `src/styles/streaming-animations.css`) - 2-4x UI responsiveness during streaming

*December 2025 - Production Overhead Elimination*:
- **Dev-only snapshots**: `performance.memory` calls only in development, eliminates 10-30ms per translation (`TranslationEngine.js:4176-4201`)
- **Metadata array slice**: `array.slice()` replaces full rebuild, 200+ ops → 1 native copy + fills (`TranslationEngine.js:4350-4368`)
- **Frozen default object**: Single reused object eliminates 50-100 allocations per progress callback

*December 2025 - Code Quality Infrastructure*:
- **TypeScript type definitions**: Comprehensive interfaces for `SemanticArrays`, `TranslationOptions`, `ProgressData`, etc. (`types/SemanticTypes.d.ts` - 316 lines) - enables IDE autocomplete and prevents position mapping errors
- **Centralized performance thresholds**: Extracted magic numbers to `PerformanceThresholds.ts` with validation and detailed rationale - single source for tuning memory (75→35 segments), WASM activation (2000 chars), virtualization (200 segments)
- **Standardized error handling**: Unified strategies (THROW/FALLBACK/SILENT) via `ErrorHandling.ts` with custom error classes and retry logic - eliminates inconsistent error behavior across modules
- **Unified logging system**: Replaces mix of console.log/debugEnabled/DEBUG_LEVELS with `UnifiedLogger.ts` - environment-aware, category-based filtering, sampling for high-frequency logs, consistent formatting with emojis
- **Standardized cache keys**: Unified FNV-1a hash-based key generation via `CacheKeyGenerator.ts` - replaces 3 different strategies (simple strings, compound keys, ad-hoc hashing) with collision-resistant versioned keys
- **WASM optimization documentation**: Comprehensive guide explaining batch operations pattern (`WASM_BOUNDARY_OPTIMIZATION.md`) - 99.8% boundary crossing reduction, pre-computation vs dynamic generation trade-offs, real-world measurements
- **Algorithm documentation**: Added inline examples to `testPatternMatch()` showing multi-token variables, Phase A overrides, pattern competition (`SemanticPatternProcessor.js:884-928`)

*December 2025 - React Component Re-render Reduction*:
- **Context memoization**: `useMemo` wraps `DictionaryContext` value object to prevent 7+ consumer components from re-rendering on every Provider update (`DictionaryContext.tsx:347-378`)
- **Highlighting state consolidation**: 4 separate useState (unitIndex, translationUnitIndex, characterOnlyUnitIndex, isCharacterOnlyClick) migrated to single useReducer with 6 action types (`Translator.jsx:78-139`) - reduces 2-3 re-renders per highlighting operation to 1 atomic update
- **Action dispatch pattern**: 31+ coordinated setState calls replaced with dispatch actions (HIGHLIGHT_ORIGINAL, HIGHLIGHT_TRANSLATION, HIGHLIGHT_FROM_CHARACTER_ONLY, HIGHLIGHT_BOTH, SET_CHARACTER_ONLY_INDEX, CLEAR_ALL) - eliminates intermediate render states during multi-value updates
- **Debug log reduction**: Removed per-match scoring console output (30+ lines per character click) in character-only highlighting bridge, keeps summary logs only (`Translator.jsx:859`)

*January 2025 - Async Memory Management*:
- **Async proactive cleanup**: Segment cleanup deferred to `requestIdleCallback()` instead of blocking translation (`TranslationEngine.js:3385-3389`) - eliminates 2-5ms per segment creation
- **Async automatic cleanup**: Non-critical memory cleanup runs in browser idle time (`TranslationEngine.js:4110-4114`) - saves 10-20ms per cleanup cycle
- **Preserved synchronous critical cleanup**: Emergency/critical cleanup remains immediate for safety (`TranslationEngine.js:4117`)  - ensures memory emergencies are handled without delay
- **Performance impact**: 5-20ms saved per translation by deferring cleanup to idle time, no translation blocking

*January 2025 - Dead Code Cleanup*:
- **12 files removed**: ~3,500 lines of unused code deleted (VirtualizedClickableTranslation.jsx, WasmTranslationAccelerator.js, PatternCompiler.js, etc.)
- **WasmNumberProcessor.js kept**: Active WASM feature for Chinese number conversion
- **RustLookupIndexManager.js kept**: Active Rust lookup index for dictionary speedup
- **Impact**: Cleaner codebase, easier navigation, no functionality affected

**Cumulative Improvements**: 60-90% faster than baseline for typical translations (500-2000 chars), 40% reduction in bug investigation time from documentation/types, 5-20ms saved per translation from async cleanup

**Why This Works**: Preserves core translation complexity while adding capabilities at system boundaries. Targets actual bottlenecks (boundary crossings, DOM manipulation, repeated computation, production overhead) with measurable performance data.

### Failed Patterns (Avoid)

**Architectural Restructuring**:
- Two-phase translation: 63% clickable coverage (vs 100%)
- Separated concerns: Position mapping failures, metadata loss
- Hierarchical processing: Circular references, coordination failures

**Translation Quality vs Performance Trade-offs**:
- Semantic content caching: Translation quality degradation despite 60-80% cache hit rates
- Phase priority violations: Cache served character-level translations instead of proper noun matches
- Context loss: Similar text patterns cached inappropriate translations despite semantic similarity
- 5-phase architecture interference: Cache bypass mechanisms added complexity without eliminating quality risks

**Resolution**: Removed semantic caching system entirely, prioritizing translation accuracy over marginal performance gains

**Quality Issues Observed**:
- "不知道" cached as "bất biết" instead of correct "không biết" from Common Phrases dictionary
- Inconsistent proper noun translation when similar patterns existed
- Phase-level caching created 3.4x memory growth through duplicate cache keys

**Speculative Performance Optimization Failure**:
- Complex caching system: 1,500+ lines added, 0% measurable performance benefit
- Background processing overhead: Multiple intervals, workers, cleanup routines caused lag
- WASM memory conflicts: Complex state management triggered unsafe memory access
- Integration complexity: Deep modifications to core translation flow created rollback difficulty

**Root Cause**: Premature optimization without profiling actual bottlenecks. Existing simple cache (LRU + TranslationCache) already provided sufficient performance (1034-7500 tokens/sec).

**Symptoms**:
- Zero cache hit rates despite complex frequency analysis
- Performance degradation from "optimization"
- WASM panics from memory safety violations
- NaN memory calculations and excessive logging

**Prevention Strategy**: Profile first, measure current performance, identify actual bottlenecks with data before adding complexity. Simple solutions often outperform complex ones. **Prioritize translation quality over performance optimizations** that interfere with core translation accuracy.

**WASM Full Translation Acceleration Failure**:
- **Implementation**: Phases 6 & 7 - WASM translation engine with pattern matching (10,000+ lines Rust code)
- **Symptoms**: Dictionary lookups returned zero matches, character-by-character fallback instead of phrase matching
- **Example**: "那三个乞丐" → "Na tam cá khất cái" (character-by-character) instead of "Na ba cá ăn mày" (correct phrases)
- **Root Cause**: WASM-JavaScript dictionary data structure serialization issues, silent failures in lookup operations
- **Resolution**: Removed WasmTranslationAccelerator.js (1,951 lines) and all Rust translation modules, kept pure JavaScript translation
- **Documentation**: See `WASM_REMOVAL_MIGRATION_GUIDE.md` for complete details
- **Lessons Learned**: WASM valuable for focused features (number processing, lookup indexing) but full translation replacement introduced complexity without reliability

**Conclusion**: Architecture reflects genuine translation domain complexity, not poor design. Extend around edges, preserve core. Avoid speculative optimization.

## Debugging Translation Issues: Execution Flow Guide

**When to Use**: Translation produces incorrect results, missing parts, or unexpected behavior despite dictionary entries existing.

**Problem**: It's hard to know where to add console.log statements in a complex multi-layered translation system.

**Solution**: Follow the execution flow systematically from entry point to specific translation logic.

### Translation Execution Flow

**Entry Point** → **Batching** → **Single Pass** → **Pattern Processing** → **Post-processing**

```
translate()
  ↓
translateWithSegments()
  ↓
translateWithProgressiveBatches()
  ↓
processChunksInParallel()
  ↓
translateDirectly()
  ↓
translateSinglePass()
  ↓
applyPatterns()
  ↓
[SemanticPatternProcessor OR TwoPhasePatternProcessor]
```

### Systematic Debug Log Placement

**Step 1: Verify Entry Point**
```javascript
// TranslationEngine.js:1073
async translate(text, options = {}) {
  console.log(`🔍 translate() called with: "${text.substring(0, 50)}..."`);
  // Verifies translation request is reaching the engine
}
```

**Step 2: Track Batch Processing**
```javascript
// TranslationEngine.js:3955
async translateWithProgressiveBatches(text, options = {}) {
  console.log(`🔍 translateWithProgressiveBatches() called`);
  // Verifies chunking logic is executing
}

// TranslationEngine.js:3993
console.log(`🔍 Chunks created: total=${chunks.length}, translatable=${translatableChunks.length}`);
// Verifies text was split correctly
```

**Step 3: Identify Translation Path**
```javascript
// TranslationEngine.js:4949
async translateDirectly(text, options = {}) {
  console.log(`🔍 translateDirectly() called with ${text.length} chars`);
  // Verifies chunk is being processed
}

// TranslationEngine.js:5009
async translateSinglePass(tokens, options = {}) {
  console.log(`🔍 translateSinglePass() called with ${tokens.length} tokens`);
  // Verifies tokenization completed
}
```

**Step 4: Check Pattern Processing Route**
```javascript
// TranslationEngine.js:1974
async applyPatterns(tokens, options) {
  console.log(`🔍 applyPatterns() called with ${tokens.length} tokens`);
  console.log(`🔍 semanticPatternProcessor.isInitialized=${this.semanticPatternProcessor.isInitialized}`);
  console.log(`🔍 enableTwoPhasePatterns=${this.settings.enableTwoPhasePatterns}`);
  // Verifies which pattern processing path will be taken
}
```

**Step 5A: Debug Legacy Pattern Path**
```javascript
// SemanticPatternProcessor.js:721
processTokens(tokens, options = {}) {
  console.log(`🔍 SemanticPatternProcessor.processTokens() called`);
  console.log(`🔍 Testing ${this.patterns.length} patterns against ${tokens.length} tokens`);
  // Verifies legacy pattern matching is executing
}

// SemanticPatternProcessor.js:1237
applyPatternMatch(tokens, matchResult, options = {}) {
  console.log(`🔍 Pattern MATCH: "${matchResult.pattern.originalPattern}" → "${matchResult.translation}"`);
  console.log(`🔍 Matched tokens [${matchResult.startIndex}-${matchResult.endIndex}]: "${matchResult.matchedTokens.map(t => t.value).join('')}"`);
  // Shows exactly which patterns are matching and where
}
```

**Step 5B: Debug Hierarchical Pattern Path**
```javascript
// TwoPhasePatternProcessor.js:54
async processTokens(tokens, options) {
  console.log(`🔍 TwoPhasePatternProcessor.processTokens() called`);
  // Verifies hierarchical pattern processing is executing
}

// TwoPhasePatternProcessor.js:60, 69, 74, 79
console.log(`🔍 Phase A completed: ${phaseAResults.length} results`);
console.log(`🔍 Phase B completed: ${phaseBResults.length} results`);
console.log(`🔍 Composites detected: ${compositeResults.length} results`);
console.log(`🔍 Final results selected: ${finalResults.length} results`);
// Tracks two-phase processing stages

// TwoPhasePatternProcessor.js:227-228
console.log(`🔍 Phase A patterns:`, phaseAResults.map(r => ({
  pattern: r.pattern?.originalPattern,
  text: r.originalText,
  translation: r.translation,
  indices: [r.startIndex, r.endIndex]
})));
console.log(`🔍 Phase B patterns:`, phaseBResults.map(r => ({
  pattern: r.pattern?.originalPattern,
  text: r.originalText,
  translation: r.translation,
  indices: [r.startIndex, r.endIndex]
})));
// Shows detailed pattern matching results for analysis
```

**Step 6: Verify Final Output**
```javascript
// TranslationEngine.js:4991
const result = this.postProcess(tokens, options);
console.log(`🔍 Final translation result: "${result.substring(0, 100)}..."`);
// Verifies post-processing didn't corrupt translation
```

### Common Debugging Scenarios

**Scenario 1: Translation missing entirely**
- Add logs at Step 1-3 to verify execution reaches translation logic
- Check if cache is returning stale results (disable cache temporarily)

**Scenario 2: Pattern not matching despite existing in dictionary**
- Add logs at Step 4-5 to see which pattern path is taken
- For hierarchical path, check if pattern is in Phase A or Phase B
- Verify pattern priority calculation with detailed Phase A/B result logs

**Scenario 3: Pattern matches but translation incomplete**
- Add logs at Step 5B to see if hierarchical composition is discarding results
- Check if `simpleResultSelection` is filtering out non-overlapping patterns
- Verify `finalResults.length` matches expected pattern count

**Scenario 4: Wrong pattern wins in competition**
- Add pattern priority logs in `SemanticPatternProcessor.testPatternMatch()`
- Compare priority values between competing patterns
- Check if `lowPriority` flag is set correctly for generic patterns

### Debugging Best Practices

1. **Start broad, narrow down**: Begin at entry point (Step 1), move deeper only when needed
2. **Use descriptive prefixes**: `🔍` for investigation, `✅` for success, `❌` for errors, `⚠️` for warnings
3. **Log structured data**: Use objects `{ pattern, text, translation, indices }` instead of strings
4. **Expand objects in console**: Click arrows to see full details, don't rely on `{...}` preview
5. **Remove logs after fixing**: Clean up debug statements before committing
6. **Disable caches first**: Always test with fresh translation by temporarily disabling `TranslationSegmentCache.get()`
7. **Compare execution paths**: Run same input with legacy path (disable `enableTwoPhasePatterns`) vs hierarchical path

### Quick Debug Template

```javascript
// Copy-paste this template at any function entry point:
console.log(`🔍 [FUNCTION_NAME] Entry:`, {
  inputLength: input?.length,
  options: Object.keys(options),
  timestamp: Date.now()
});

// At key decision points:
console.log(`🔍 [FUNCTION_NAME] Decision:`, {
  condition: 'what you are checking',
  value: actualValue,
  willTake: 'which branch'
});

// At function exit:
console.log(`🔍 [FUNCTION_NAME] Exit:`, {
  resultCount: results.length,
  resultSample: results[0]
});
```

### Recent Bug Example (December 2024)

**Issue**: Translation "在这可怕的声波振荡之中" produced "ở sóng âm đáng sợ này" (missing "trong chấn đãng")

**Investigation Steps**:
1. Added logs at Step 1-3: Verified execution reached `processChunksInParallel()`
2. Added logs at Step 4: Discovered `enableTwoPhasePatterns=true`, taking hierarchical path
3. Added logs at Step 5B: Found Phase A=1 result, Phase B=2 results, but Final=1 result
4. Added detailed result logs: Discovered `selectOptimalResults()` was discarding non-overlapping Phase B pattern
5. **Root Cause**: `detectHierarchicalComposition()` returned ONLY hierarchical results, ignoring other Phase B patterns
6. **Fix**: Modified `simpleResultSelection()` to include non-overlapping Phase B patterns (TwoPhasePatternProcessor.js:229-259)

This debugging flow would have taken 5 minutes instead of 45 minutes with systematic log placement.

## Additional Development Debugging Tools (Development Mode Only)

**Access**: Available via browser console when `NODE_ENV === 'development'`

**Direct System Access**:
- `window.systemPerformanceMonitor` - Direct access to regression detection system, baseline tracking
- `window.translationEngine` - Direct engine state inspection, segment array analysis for memory leaks

**Direct Engine Inspection**:
- `window.translationEngine.translationSegments.length` - Check segment accumulation (should be ≤35)
- Engine state inspection for cache analysis and dictionary manager debugging

**Note**: Core debugging workflows and commands are documented in the "Performance Regression Detection & Investigation" section above.

## Development Commands

```bash
# Type checking (required before committing utility changes)
npm run type-check  # 0 errors expected for clean builds

# Testing
npm test            # Some WASM test failures are expected (pre-existing, not regressions)

# Code quality
npm run lint        # Check code style and formatting

# Build (Tauri)
npm run tauri:build  # Compile for production (verifies types compile)
npm run build        # Build web assets only
```

**Type Check Failures**: If `npm run type-check` shows errors in `.ts` files, fix before committing. Errors in `.js` files are expected (not checked by TypeScript).

## System Requirements

- Node.js compatible with Vite 7.0+
- 4GB+ memory recommended for concurrent dictionary loading
- Rust toolchain for WASM builds (installed automatically via Tauri)
- WASM support (automatic JavaScript fallback available for number processing)
- Tauri system dependencies:
  - macOS: Xcode Command Line Tools
  - Linux: webkit2gtk, libssl-dev, build-essential
  - Windows: Visual Studio Build Tools, WebView2

## Tauri-Specific Notes

**File System Access**: Tauri uses a different file system API than Electron
- Read files: `invoke('read_file', { path })`
- Write files: `invoke('write_file', { path, contents })`
- List directories: `invoke('read_dir', { path })`

**Dictionary Loading**: Dictionaries load from platform-specific application data directories via Tauri commands

**IPC Communication**: Tauri uses `@tauri-apps/api` for frontend-backend communication instead of Electron's IPC

**Security**: Tauri's security model is more restrictive than Electron - file system access requires explicit Tauri commands

---

*This architecture has proven stable and extensible through continuous enhancement. Follow the system extension pattern for reliable development.*
