# Development Guide

This guide covers development best practices, safe development zones, logging patterns, testing infrastructure, and key development tools.

---

## Safe Development Zones

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

---

## Logging Best Practices

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

- ✅ **Complete** (354+ calls migrated, 56% of original 632): All WASM wrappers, hot paths, monitoring systems, and caching
- ✅ **ESLint rule added**: Warns on new `console.*` usage (see `eslint.config.js`)
- ✅ **Production security**: All `window.*` API exposures guarded by `NODE_ENV` checks
- ⏳ **Remaining**: ~278 calls in non-critical files (tests, utilities, UI components)

**Migration strategy**: Core migration complete (56%). Remaining calls can be migrated incrementally when editing those files.

---

## Active vs Dead Code

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

---

## Extraction Criteria

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

---

## TypeScript Migration Strategy

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

---

## Development Debugging Tools

**Access**: Browser console when `NODE_ENV === 'development'`

**⚠️ SECURITY WARNING** (2026-01-19):

All `window.*` debugging APIs MUST be wrapped in `if (process.env.NODE_ENV === 'development')` checks to prevent production exposure.

- **Why this matters**: Exposing internal APIs in production enables reverse engineering, leaks proprietary algorithms, prevents garbage collection, and creates security vulnerabilities.

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

**Available debugging tools**:

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

---

## Key Files

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

## Development Commands

```bash
# Development
pnpm tauri:dev      # Start dev server with WASM hot reload
pnpm dev            # Vite-only dev (without Tauri)

# Testing
pnpm test           # Run tests in watch mode (Vitest)
pnpm test -- --run  # Run tests once (for CI)
pnpm test:ui        # Visual test UI
pnpm test:coverage  # Generate coverage report

# Code Quality
pnpm format         # Format all code with Prettier
pnpm format:check   # Check formatting without writing
pnpm type-check     # TypeScript type checking (0 errors expected)
pnpm lint           # ESLint (quiet mode, errors only)
pnpm lint:full      # ESLint (all warnings)

# Building
pnpm build-wasm     # Build Rust WASM modules (production)
pnpm build-wasm-dev # Build Rust WASM modules (development)
pnpm build          # Build web assets
pnpm tauri:build    # Build production Tauri app
```

---

## Keyboard Shortcuts

- **Translator**: Cmd/Ctrl-R (Reload), Cmd/Ctrl-1-5 (Quick Add)
- **Dictionary**: Cmd/Ctrl-L (Focus Search), Click (Edit), Enter (Save), Escape (Cancel)
- **Global**: Cmd/Ctrl-Shift-1-4 (Switch Tabs)

---

## Testing Infrastructure

**Test Runner**: Vitest with React Testing Library
**Test Files**: 25 files across utilities, types, components, error handling, and security
**Configuration**: `vitest.config.ts`, `src/test/setup.ts`

**Current Status:**

- ✅ **25 test files, 541 tests, all passing** (4,408% increase from baseline)
- ✅ **Utility functions covered** - Token helpers, caching, memory monitoring
- ✅ **WASM boundaries covered** - Type safety, Rust ↔ JS serialization, edge cases
- ✅ **React components covered** - Error boundary, dictionary dialogs
- ✅ **Error handling covered** - WASM degradation, Rust fallback, async operations
- ✅ **Core systems covered** - Phase integration, position mapping, scalability
- ✅ **API contracts covered** - Synchronous method enforcement (prevents breaking changes)
- ✅ **Security covered** - Configuration validation, malformed data handling

**Key Test Files:**

- `TokenHelpers.test.js` (37 tests) - Translation pipeline utilities
- `PatternPriorityCalculator.test.js` (26 tests) - Pattern conflict resolution
- `LRUCache.test.ts` (36 tests) - Translation caching for performance
- `CacheKeyGenerator.test.ts` (59 tests) - FNV-1a hashing, collision resistance
- `MemoryLeakDetector.test.js` (60 tests) - Memory monitoring and leak prevention
- `WasmTypes.test.ts` (27 tests) - WASM type safety (prevents "undefined" in translations)
- `ErrorBoundary.test.tsx` (27 tests) - Error catching and recovery
- `configValidation.test.ts` (41 tests) - Configuration/dictionary validation, security

**Philosophy:** Lean test suite focused on critical paths. Write tests when adding new features or fixing bugs.

**Testing Best Practices:**

- Write tests for new utilities before implementing
- Test components for critical UI flows (translation, dictionary editing)
- Mock Tauri APIs (automatically mocked in `src/test/setup.ts`)
- Run `pnpm test` before committing (enforced by pre-commit hook)
- **API Contract Testing**: Verify critical methods stay synchronous (e.g., `translate()` must not become async)
  - Pattern: `expect(result).not.toBeInstanceOf(Promise)` catches breaking changes
  - See `DictionaryManager.apiContract.test.js` for examples

---

## CI/CD Pipeline

**GitHub Actions**: `.github/workflows/ci.yml`

**Automated Checks** (runs on push and PR):

1. Type checking (`pnpm type-check`)
2. Linting (`pnpm lint`)
3. Tests (`pnpm test -- --run`)

**Pragmatic CI Philosophy**:

- CI focuses on catching development errors (types, lint, tests)
- Production builds verified locally before releases (`pnpm tauri:build`)
- No build step in CI - avoids WASM/environment issues, faster runs
- Build works locally; that's what matters for releases

**Pre-commit Hooks**: Husky + lint-staged
**Enforced Locally** (before every commit):

1. Prettier auto-format on staged files
2. ESLint auto-fix on staged files
3. TypeScript type checking on staged `.ts`/`.tsx` files

**Setup**: Hooks install automatically via `pnpm install` (runs `prepare` script)

---

## Code Formatting (Prettier)

**Configuration**: `.prettierrc`, `.prettierignore`
**Style**:

- Single quotes, semicolons, 2-space tabs
- 100 character line length
- Trailing commas (ES5)
- LF line endings

**Usage**:

```bash
pnpm format           # Format all src/ files
pnpm format:check     # Check if files are formatted (CI)
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

---

## Production Build Requirements

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
pnpm add -D vite-plugin-wasm vite-plugin-top-level-await
```

**Why**:

- `vite-plugin-wasm`: Adds WebAssembly ESM integration for wasm-pack generated modules, handles module resolution and dependency optimization
- `vite-plugin-top-level-await`: Supports top-level await in WASM glue code (wasm-pack requirement)
- Asset filename preservation: wasm-pack generates imports with hardcoded filenames - content hashing breaks WASM loading
- Plugin order matters: WASM plugins must process modules before React transformation

**Test production builds before releasing:**

```bash
pnpm tauri:build
open "src-tauri/target/release/bundle/macos/Chinese-Vietnamese Translator.app"
# Test: WASM number processing, dictionary loading, translation quality
```

---

## Gotchas Reference

Accumulated pitfalls confirmed across development sessions. Organized by area.

### Architecture / Extraction

**After extracting Phase 1, reload broke** (2026-01-30): Removed constants still referenced. Always grep for usage before removing infrastructure.

**`HistoryOperation` type divergence — DO NOT swap** (2026-02-12): `LazyDictionaryContext.tsx` uses a local snapshot-based `HistoryOperation` (`oldData`/`newData: DictionaryData`). The canonical `src/types/DictionaryTypes.ts` version is delta-based (individual entries). These are architecturally incompatible — `LazyDictionaryContext.tsx` must keep its local definition.

### JavaScript / TypeScript

**Synchronous WASM cannot be timed out via `Promise.race()`** (2026-02-14): `callWasmWithTimeout()` in `wasmOperationTimeout.js` uses `Promise.race([operation(), timeoutPromise])`. If `operation()` makes a synchronous WASM call, the JS thread is blocked for the full call duration — the timeout fires only _after_ WASM returns, not during it. True interruption requires a Web Worker.

**Idle-callback index loop — always snapshot queue length before loop** (2026-02-14): When using an index-based while loop over a queue inside a `requestIdleCallback` handler, capture `const initialQueueLength = this.cleanupQueue.length` _before_ the loop. If the catch block pushes retry tasks, `cleanupQueue.length` grows and the loop re-executes the retry task in the same callback — defeating deferred-retry intent. `BackgroundCleanupManager.processQueue` (`MemoryManagementRefinements.ts`) is the canonical fix.

**`EMERGENCY_CLEANUP_THRESHOLD = 10`, `CRITICAL_CLEANUP_THRESHOLD = 20`** (2026-02-13): Raised from 3/5 — keeping only 3–5 segments after cleanup wiped almost all clickable highlighting (expected max ≤35). Regression test at `src/utils/__tests__/TranslationEngine.regression.test.js:247` hardcodes these values; update both together if they ever change.

**Adjacent variable tokens in WASM patterns are unreliable — avoid in pattern authoring** (2026-02-14): `wasm-core/src/pattern_processor/matcher.rs:638-651` uses a greedy shortest-span heuristic when two consecutive variable tokens appear in a pattern (no backtracking). Patterns with a single variable token, or variables separated by at least one literal token, work reliably.

**`AdaptiveBufferCalculator` non-integer `bufferSize` corrupts virtual scroll** (`EnhancedVirtualizedDictionaryTable.tsx`): Medium tier used to return `visibleItems * 1.5` (e.g. `15 * 1.5 = 22.5`). Fixed at source in `AdaptiveVirtualScrolling.js:271` with `Math.floor(visibleItems * 1.5)`. Consumer `visibleRange` also floors defensively — keep both.

### Types / Imports

**Dual `WasmTypes` implementations — DO NOT confuse** (2026-02-13): Two files with OPPOSITE `copyWasmTokens` conventions:

- `types/WasmTypes.ts` (project ROOT, not `src/`) — `copyWasmTokens(source, target)`: source=WASM output (param1, read-only), target=JS tokens (param2, written to). Used by ALL test files via `'../../../types/WasmTypes.js'`.
- `src/utils/WasmBoundaryValidation.ts` — `copyWasmTokens(sourceTokens, wasmTokens)`: sourceTokens=JS destination (param1, written to), wasmTokens=WASM output (param2, read). Used by `TranslationEngine.js`.

Swapping imports between production code and tests will silently reverse the copy direction.

**`'../../../types/WasmTypes.js'` test import resolves to project root** (2026-02-13): From any `src/**/__tests__/` directory, three `../` levels exit to the project root, so `'../../../types/WasmTypes.js'` → `{project_root}/types/WasmTypes.ts` (Vite resolves `.js` → `.ts`). The same path works from both `src/types/__tests__/` and `src/utils/__tests__/`.

**`validateDictionaryEntry` renamed — DO NOT revert** (2026-02-14): `configValidation.ts` exports `validateRawDictionaryEntry` (raw JSON structural validation). The name `validateDictionaryEntry` belongs to `src/components/dictionary/DictionaryTypes.ts` (dictionary-type-specific rules, different signature). Same name was a maintenance collision.

**Canonical homes for shared component types** (2026-02-14): `ThrottledStreamingState` → `UITypes.d.ts`. `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `DictionaryTypes.ts`. Import from these files; do not redeclare locally in components.

**`AppConfiguration` import path**: Always import from `src/types/ComponentTypes`, NOT from `configValidation`. `configValidation.ts` does not re-export it.

**`getDictionaryLabel` / `getDictionaryDropdownLabel` / `compareDictionaryOrder`**: Import directly from `dictionaryHelpers`. The re-export through `DuplicateAnalyzer` was removed (2026-02-13).

**`useConfigurationLoader.ts` deleted (2026-02-13)**: Hook existed with no callers or tests. Imperative equivalent is `loadValidatedConfiguration()` in `configurationHelpers.ts`.

### Rust / WASM Backend

**`DictionaryCache` Rust mutex pattern** (2026-02-12): Always collect needed data while holding the `cache` lock, then `drop(cache)` explicitly before acquiring `access_order`. Nested lock (holding `cache` while locking `access_order`) is a deadlock risk. See `set()` in `dictionary_commands.rs` for the canonical pattern.

**Rust `.len()` vs `.chars().count()` for Chinese text** (2026-02-13): In WASM/Rust code, always use `.chars().count()` when comparing _character_ lengths of strings that may contain Chinese or mixed-script text. `.len()` returns _byte_ count — one Chinese character is 3 bytes, so byte comparisons silently mis-rank pattern lengths. Affected: `matcher.rs` Phase A override, any length-based priority logic.

**Rust `HashMap` iteration order in template substitution** (2026-02-13): `HashMap` iteration is non-deterministic. When substituting multiple named variables into a template (e.g., `build_result` in `matcher.rs`), collect into a `Vec`, sort by key length descending, then iterate — ensures longest variable name matches first and results are deterministic across runs.

**`SegmentMatcher::find_matches` — do NOT re-add `used_indices`** (2026-02-13): Removed `HashSet<usize>` that blocked the same `unit_index` from matching at more than one text position. The same translated word (e.g., "bạn") can legitimately appear twice; `used_indices` silently dropped the second match, breaking highlight positions. The trie's length-greedy advance already prevents overlapping matches.

**`SegmentMatcher` trie: `unit_indices: Vec<usize>`, not `Option<usize>`** (2026-02-13): `TrieNode.unit_indices` is a `Vec` so multiple semantic units with the same translated text all have their index stored. Reverting to `Option<usize>` re-introduces last-writer-wins: the second `build_index` insert silently drops the first unit's click-highlighting.

**All Rust write helpers that accept `serde_json::Value` need `MAX_JSON_SIZE_BYTES` check** (2026-02-14): Any function that calls `fs::write` with user-supplied JSON must check `json_string.len() > MAX_JSON_SIZE_BYTES` before writing. When adding new write helpers, always mirror the size guard already in `save_dictionary`.

**ZIP entry read path needs two guards** (2026-02-14): When iterating ZIP entries with `archive.by_index(i)`, always apply: (1) `|| filename.ends_with(".trie.json")` exclusion alongside the `.json` check, and (2) `file.size() > MAX_JSON_SIZE_BYTES` before `file.read_to_string()`. Missing either allows trie-cache pollution or ZIP-bomb DoS. See `import_dictionaries` in `dictionary_commands.rs` for the canonical pattern.

**Tauri read commands need the same ID validation as write commands** (2026-02-13): `list_proper_nouns_dictionaries` (and any future list/read command) must call `validate_dictionary_id()` inside its `filter_map` before returning IDs to the frontend.

**Rust tests for `lookup_index_engine.rs`**: Run with `cargo test --manifest-path src-tauri/Cargo.toml lookup_index_engine`. 21 tests cover trie matching, char-vs-byte index correctness, serial/parallel parity, categorization, and `build_comprehensive_lookup_index` guards.

### Testing Gotchas

**`src/test/setup.ts` MUST NOT be deleted**: It is the Vitest setup file referenced by `vitest.config.ts:10` (`setupFiles: './src/test/setup.ts'`). The duplicate test files in `src/test/` were removed (stale copies of `src/utils/__tests__/`), but `setup.ts` was not.

**Vitest `vi.doMock` paths for non-existent WASM modules** (2026-02-13): For `translation_wasm_core.js` (virtual, doesn't exist on disk), the mock path must resolve to the same directory as the source file's import — not the test file's directory. Test in `src/test/` uses `'../wasm/translation_wasm_core.js'`; test in `src/utils/__tests__/` uses `'../../wasm/translation_wasm_core.js'` (both → `src/wasm/`).

**Vitest matchers — no `toEndWith`/`toStartWith`** (2026-02-13): Vitest uses Chai, not jest-extended. Use `.endsWith(' ')` + `.toBe(true)`, or `toMatch(/ $/)`.

**`SegmentPrecomputer.findUnitMatch` space-absorption** (2026-02-13): `normalizeText` trims leading whitespace, so `findUnitMatch(' tốt', 'tốt')` returns `{found:true, offset:0}`. Test text-reconstruction (`segments.map(s=>s.text).join('')`) rather than individual `.text` values when units follow spaces.

**`SegmentPrecomputer.precomputeSegmentsJS` — empty arrays**: Returns `[]` immediately via early-exit guard — does NOT produce non-semantic text segments for the input.

**`createRenderSegments` with `highlightedUnitIndex=-1`**: Non-semantic segments have `unitIndex=-1`; they become `isHighlighted=true` when caller passes `-1` as the highlighted index. Use `99` (or any non-matching value) in tests verifying non-semantic segments are unhighlighted.

**React Testing Library paragraph selector** (2026-02-13): `container.querySelectorAll('div > div')` matches both the component container AND paragraph children (RTL wraps everything in an extra div). Use `div > div > div` to select only paragraph-level divs inside a two-level component.

**RTL `waitFor` must throw, not return falsy** (2026-06-05): `waitFor(() => !result.current.isLoading)` resolves immediately — RTL only retries when the callback throws. Use `waitFor(() => expect(result.current.isLoading).toBe(false))` instead.

**`PunctuationProcessor.isAlreadyProperlySpaced` regex — brackets not matched** (2026-02-13): `openingQuotePattern` embedded inside another `[...]` class closes early. The regex matches opening _quotes_ but NOT literal `[`/`(` brackets. Write tests using quote chars, not bracket chars.

**`PatternMatchResult::success()` sets `pattern: None`**: The struct stores `pattern_id` (the `original_pattern` string) instead of cloning the full pattern. Tests must use `result.pattern_id.as_deref().unwrap()`, not `result.pattern.as_ref().unwrap()`.

**Removing `export` from a named export also requires cleaning its test describe blocks**: Vitest does not statically analyze — importing a non-exported named export throws `TypeError: ... is not a function` at runtime. When you un-export a function, find any `describe('functionName', ...)` blocks in the corresponding test file and remove them too.

### CSS / UI Components

**`DictionaryEntry` modal layout is intentionally center-aligned**: `.modal` has `text-align: center` and `.formGroup` has `align-items: center` — labels render centered. Utility buttons (`---a`, `-aaa` etc.) require `white-space: nowrap` or they break across lines when `flex: 1` is applied.

**`EnhancedVirtualizedDictionaryTable` context menu buttons use CSS classes**: `Edit Entry`, `Move to...`, `Delete Entry` use `.contextMenuItem` / `.contextMenuItemDanger` from the CSS module with `:hover, :focus-visible` rules. Previously used JS `onMouseEnter`/`onMouseLeave` inline — do not revert.

**CSS `repeating-linear-gradient` for virtual scroll row shading: put gradient on rows container, NOT spacer** (`EnhancedVirtualizedDictionaryTable.tsx`): CSS `background` uses the element's **layout** y-position, not visual/transformed position — `translateY` is irrelevant. With gradient on the spacer, rows always see it at slice-local y (layout y=0..N), causing parity flips on every scroll. Place gradient on the rows container (direct parent of rows); use `backgroundPositionY: (startIndex % 2) * ITEM_HEIGHT + 'px'` for phase correction; set all row `backgroundColor` to `transparent`.

### Historical / Deleted {#deleted-symbols}

**`WasmRegexUtils.js` singleton deleted**: File now exports only the `createWasmRegexUtils` async factory. Do not add a singleton back — it had zero production imports and lacked the required background-init call.

**`WasmDictionaryManager.consecutiveFailures` does not exist as a field**: Was never initialized in the constructor — reads returned `undefined`. All `consecutiveFailures` reporting in `getPerformanceReport()` and `getSyncMetrics()` delegates to `this.fallbackHandler.getFailureCount()`. Do not add a local `this.consecutiveFailures` field.

**`TextSanitization.ts` only exports `sanitizeDictionaryEntry`**: `validateSanitizedEntry` and `sanitizeAndValidate` were deleted — only internal callers of each other with no external importers. `sanitizeForJson` remains as a private helper called by `sanitizeDictionaryEntry`.

**Deleted symbols — do not recreate:**

- **`DictionaryTable.tsx` / `VirtualizedDictionaryTable.tsx`** (deleted 2026-02-15): Only `EnhancedVirtualizedDictionaryTable` is the active table component.
- **`WasmPositionMapper`, `WasmNormalizer`, `WasmSegmentMatcher`, `PositionMappingValidator`, `PositionMappingBuilder`, `TranslationEngineFactory`** (deleted 2026-02-17): All had zero production imports.
- **`buildSegmentsFromSemanticArrays`, `buildSimpleWordLevelSegments`, `findPositionOptimized`** (deleted 2026-02-20): Position tracking is now a byproduct of `assembleWithSpacing()`.
- **`ViewportSegmentComputerEnhanced.js`, `SegmentWorkerManager.js`, `SegmentPositionWorker.js`, `WorkerTypes.d.ts`** (deleted 2026-02-20): Zero production imports; `SegmentPositionWorker.js` Web Worker path `/src/workers/SegmentPositionWorker.js` is gone.
- **`AsyncInitializer.ts`** (deleted 2026-02-20): WASM modules each hand-roll their own promise-caching init pattern instead.
- **`resultHelpers.ts` runtime helpers** (`throwIfFailed`, `getOrDefault`, `isSuccess`, `wrapOperation`, `mapResult`) deleted 2026-02-20: File now exports only the `ApiResult<T>` interface (used by `configValidation.ts`).
- **`ByteFormatter.ts`, `ValidationHelpers.ts`, `CacheKeyGenerator.ts`, `ChineseNumberConverter.js`** (deleted 2026-02-21): Zero production importers.
- **`src/wasm/translation_wasm_core_types.js` + `translation_wasm_core_types.d.ts`** (deleted 2026-02-21): Identity no-op wrappers — every function was `return value`.
- **`src/utils/RegexHelpers.ts`** (deleted 2026-02-21): `escapeRegExp`, `precompilePatterns`, `precompileSortedPatterns` — zero importers.

---

## Fallow Dead-Code Analysis

Fallow reports are a starting point, not a deletion list. Four blind spots:

1. **Class dead ≠ file dead.** Fallow tracks `export class Foo` and `export const foo = new Foo()` separately. If only the class is listed dead, the singleton may still have callers — check both before touching the file.

2. **CSS `composes` is invisible.** `composes: X from './shared.module.css'` is a hard dependency fallow never sees. Before deleting any `.module.css`, grep: `composes.*from.*'./filename'` across all CSS files.

3. **Dynamic `import()` calls not tracked.** `import("./SomeFile.js")` lazy imports are invisible to fallow. Before deleting, grep: `import(.*filename` across `src/`.

4. **Test imports count.** Fallow may flag exports used only in `__tests__/` files as dead. Check test files before removing.

5. **Partial-dead ≠ file-dead.** A file with some dead exports is NOT a dead file. Verify every export has zero callers before deleting the file.

6. **JSDoc `@import {...} from '...'` and inline `@type {import('...').X}` are invisible to `analyze`/`trace_export`.** This codebase types many `.js` files via JSDoc, not real ES imports — a `.d.ts` file consumed only this way shows `file_reachable: false` even when genuinely alive. Grep for `@import\s*{` and `import\(['"].*['"]\)\.` referencing a file before trusting fallow's verdict on it.

7. **`analyze` with a `file:` filter suppresses `unused_files`** (dependency-level checks are disabled in file-scoped mode — the tool's own docs say so, easy to miss). Re-run without `file:` for a real answer.

8. **`fix_apply`/`fix_preview` have no file/name scoping and only cover `unused-exports`, not `unused-types`.** Confirmed false positives: wanted to strip exports from a barrel that real code imports, and delete npm deps wired through Rust, not JS. Not usable for a scoped cleanup — verify every proposed fix manually, or don't use it for `.d.ts`/type pruning at all.

**Protocol per file:**

- Grep each export (not just fallow-listed ones): `grep -r "ExportName" src/` — confirm zero results outside the definition.
- Grep dynamic imports: `grep -r "import(.*filename" src/`
- For `.module.css`: grep `composes.*from.*'./filename'` in all CSS files.

**Verification after each batch:**

```bash
pnpm type-check && pnpm test -- --run
pnpm tauri:dev  # catches dynamic import() breakage — type-check/tests miss it
```

---

## Related Guides

- [Architecture Guide](./architecture.md) - System architecture and WASM acceleration
- [Performance Guide](./performance.md) - Performance monitoring and optimization
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
