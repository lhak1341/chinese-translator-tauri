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
- Run `npm test` before committing (enforced by pre-commit hook)
- **API Contract Testing**: Verify critical methods stay synchronous (e.g., `translate()` must not become async)
  - Pattern: `expect(result).not.toBeInstanceOf(Promise)` catches breaking changes
  - See `DictionaryManager.apiContract.test.js` for examples

---

## CI/CD Pipeline

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

## Related Guides

- [Architecture Guide](./architecture.md) - System architecture and WASM acceleration
- [Performance Guide](./performance.md) - Performance monitoring and optimization
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
