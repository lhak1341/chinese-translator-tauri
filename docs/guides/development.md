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

- **Translator**: Cmd/Ctrl-R (Reload), Cmd/Ctrl-1-5 (Add)
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

1. wasm-core Rust tests (`cargo test --manifest-path wasm-core/Cargo.toml`) — added 2026-08-25; previously wasm-core had zero CI coverage despite 35+ passing local tests
2. WASM dev build (`pnpm build-wasm-dev`, via wasm-pack) — needed before the JS test suite can run
3. Type checking (`pnpm type-check`)
4. Linting (`pnpm lint`)
5. Tests (`pnpm test -- --run`)

**Pragmatic CI Philosophy**:

- CI focuses on catching development errors (types, lint, wasm-core tests, JS tests)
- Full production app builds (`pnpm tauri:build`) are still verified locally before releases, not in CI
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

### Environment / Tooling (RTK, Edit, Bash)

**`grep` is aliased to `rg` in this environment** — flags behave differently. Always use the Grep tool. For **post-edit verification**, use `Read` or `sed -n 'N,Mp' file` — Bash+grep goes through RTK which may return stale file content for recently-written files. RTK also replaces long matched identifiers (and import paths containing them) with `n` in search output — use Read for accurate caller-tracing, not bash rg. In shell scripts, multi-pattern rg requires `-e 'A' -e 'B'`; `'A\\|B'` matches a literal backslash-pipe and silently returns nothing. `--include` is not a valid flag; use `-g '*.js'` glob syntax. `-g` occasionally hits real BSD `grep` (`usage: grep` error) instead of the `rg` alias — if it errors, drop `-g` and rerun plain recursive `grep`. Unquoted `--include=*.ext` gets zsh-glob-expanded before reaching the command, producing `no matches found: --include=*.js` instead of a grep error — quote the pattern (`--include='*.js'`) or drop `--include` and use plain recursive `grep`/`find` instead.

**RTK tee-log context strips leading whitespace/indentation** — `grep -A/-B` output saved to `~/Library/Application Support/rtk/tee/*.log` shows real content but wrong (stripped) indentation. Never build an `Edit` `old_string` from the log's whitespace — `Read` the actual file first to confirm exact indent/comment spacing.

**RTK silently truncates large grep match sets** — a Bash+grep with many hits returns a partial list with no error, and the rest lands in `~/Library/Application Support/rtk/tee/<n>_grep_*.log`; `cat`/`tail` that log for the remainder rather than assuming the visible output is complete.

**RTK filters `cargo test` failure output** — full assertion details (panicked at, left/right values) are in `~/Library/Application Support/rtk/tee/<latest>_cargo_test.log`; grep the test name there when a Rust test fails with no detail shown in terminal.

**Existence checks are unreliable via `find`/bash `grep`** in this environment — confirmed false negatives on git-tracked files that were actively being Read the same session (RTK proxy interference). For "does file/test X already exist," use `git ls-files | grep -i <name>` instead — never trust an empty `find`/`grep` result on its own. `find` with compound predicates (`-not`, `-exec`) errors outright through the RTK proxy (`rtk find does not support compound predicates or actions`) — drop straight to `/usr/bin/find` for those, not just on a suspected false negative.

**Edit tool can silently fail to match `old_string` containing Vietnamese diacritics** (e.g. `à`, `ở`) even when `Read` shows byte-identical content and even after the tool's own unicode-escape-swap retry — don't retry Edit a third time. Fall back to a `python3` script reading/writing the exact line index instead (same technique as the large-edit case below).

**Edit tool's `replace_all` matches exact whitespace** — near-identical blocks that differ only in indentation (common in this codebase's copy-pasted JSX, e.g. duplicated row/cell markup) will silently skip the non-matching copy with no error. After any `replace_all` across "identical" blocks, grep-verify the replacement count matches how many you expected.

**Large file edits:** Edit tool `old_string` fails for blocks >~100 lines. Use `python3 -c "with open(p) as f: lines=f.readlines(); open(p,'w').writelines(lines[:N]+lines[M:])"` to remove line range N–M (0-indexed).

**No `timeout` command on this machine** (macOS, no GNU coreutils) — use the Bash tool's own `timeout` parameter instead of shell `timeout <cmd>` wrapping.

**`git diff HEAD`/`git diff <ref>` omits untracked new files** — when reviewing or diffing a session that created files, also pass their paths for direct `Read`, don't rely on the diff alone.

**`cargo-outdated` isn't installed** (installing it costs several minutes to compile) — for a quick "what would update" signal instead, use `cargo update --dry-run --manifest-path <crate>/Cargo.toml`; this repo's `Cargo.toml`s use loose version constraints, so the dry-run's semver-compatible bumps usually cover what you need.

**`pnpm update --latest`/`pnpm add pkg@latest` silently skip very-recently-published versions** (pnpm's built-in release-age cooldown) — bypassing it via an explicit version pin (`pnpm add pkg@x.y.z`) writes an exclude entry into `pnpm-workspace.yaml`, a shared repo-config change, not just a lockfile bump. Run `pnpm peers check` after any bulk dependency update — it catches peer-range breaks (e.g. a major bump outrunning a plugin's supported range) that a plain `pnpm add`/`update` won't warn about at all.

**`temp/` (repo root, gitignored) is this project's scratch/report-output directory** — prefer it over OS `$TMPDIR` when a skill or task generates a report/artifact file for this project (e.g. `/improve-codebase-architecture`'s saved HTML report), rather than defaulting to the skill's own OS-temp instructions unasked.

### JavaScript / TypeScript

**Synchronous WASM cannot be timed out via `Promise.race()`** (2026-02-14): `callWasmWithTimeout()` in `wasmOperationTimeout.js` uses `Promise.race([operation(), timeoutPromise])`. If `operation()` makes a synchronous WASM call, the JS thread is blocked for the full call duration — the timeout fires only _after_ WASM returns, not during it. True interruption requires a Web Worker.

**Idle-callback index loop — always snapshot queue length before loop** (2026-02-14): When using an index-based while loop over a queue inside a `requestIdleCallback` handler, capture `const initialQueueLength = this.cleanupQueue.length` _before_ the loop. If the catch block pushes retry tasks, `cleanupQueue.length` grows and the loop re-executes the retry task in the same callback — defeating deferred-retry intent. `BackgroundCleanupManager.processQueue` (`MemoryManagementRefinements.ts`) is the canonical fix.

**`EMERGENCY_CLEANUP_THRESHOLD = 10`, `CRITICAL_CLEANUP_THRESHOLD = 20`** (2026-02-13): Raised from 3/5 — keeping only 3–5 segments after cleanup wiped almost all clickable highlighting (expected max ≤35). Regression test at `src/utils/__tests__/TranslationEngine.regression.test.js:247` hardcodes these values; update both together if they ever change.

**Adjacent variable tokens in WASM patterns are unreliable — avoid in pattern authoring** (2026-02-14): `wasm-core/src/pattern_processor/matcher.rs:638-651` uses a greedy shortest-span heuristic when two consecutive variable tokens appear in a pattern (no backtracking). Patterns with a single variable token, or variables separated by at least one literal token, work reliably.

**`AdaptiveBufferCalculator` non-integer `bufferSize` corrupts virtual scroll** (`EnhancedVirtualizedDictionaryTable.tsx`): Medium tier used to return `visibleItems * 1.5` (e.g. `15 * 1.5 = 22.5`). Fixed at source in `AdaptiveVirtualScrolling.js:271` with `Math.floor(visibleItems * 1.5)`. Consumer `visibleRange` also floors defensively — keep both.

**JSX in utils:** `src/utils/` files returning JSX must use `.tsx` extension — TypeScript gives misleading parse errors (`')' expected`, not "JSX not supported") otherwise. Do NOT include `.tsx` in import paths; `allowImportingTsExtensions` is off.

**Dynamic JSON imports:** Never use `import(path, { assert: { type: 'json' } })` — Rolldown silently fails to rewrite the path in production. Use a static `import data from '...json'` at the top of the file.

**Unicode line terminators in regex:** ` ` (LINE SEPARATOR) and ` ` (PARAGRAPH SEPARATOR) are ECMAScript line terminators — stored as actual Unicode characters in a JS/TS file they break a regex literal. Always use `  ` escape sequences in regex character classes.

**Surrogate pairs in a regex character class strip unconditionally, not just unpaired ones:** `[\uD800-\uDFFF]` matches EVERY UTF-16 surrogate code unit, including both halves of a valid pair (emoji, astral-plane chars) — no way to tell "paired" from "unpaired" without lookahead/lookbehind. A plain char-class sanitizer silently deletes emoji from any string it touches. Use `[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]` to strip only genuinely unpaired surrogates. Found in `TextSanitization.ts::sanitizeForJson` (2026-07-17e) — every dictionary entry containing an emoji was silently corrupted on save.

**Blind `||`→`??` swap on a `cond && value` expression is unsafe.** `&&` returns the literal falsy left-hand value (e.g. `false`), not `undefined`, when `cond` fails — `??` treats that as non-nullish and stops right there, skipping the real fallback that `||` would have reached. Rewrite `cond && value` → `cond ? value : undefined` first, so the "condition fails" case is genuinely nullish, then swap to `??`. Found `useDictionaryEntryForm.ts` (2026-08-12) — a third variant of a recurring `||`-vs-`??` falsy-default bug class (also found in `WasmMemoryPoolManager`, `VocabularyWarmup`).

**`catch (_)`/unused catch bindings trigger lint warnings here.** `eslint.config.js` sets no `caughtErrorsIgnorePattern` — `varsIgnorePattern: '^_'`/`argsIgnorePattern: '^_'` cover vars and args, not catch clauses. Use bare `catch {}` (optional catch binding) when the error is unused, not `catch (_) {}`.

### Types / Imports

**`types/WasmTypes.ts` (project root) deleted 2026-08-08 (ADR-037)** — it was a test-only twin of `src/utils/wasm/WasmBoundaryValidation.ts` with a reversed `copyWasmTokens` param order, plus a drifted copy of `validateWasmDictionaryMatch` that its own tests were silently validating instead of the real one. `copyWasmTokens`/`validateWasmToken`/`validateWasmPatternMatch`/`validateRustLookupMatch`/`isMetadataSizeValid` are gone from `WasmBoundaryValidation.ts` too — their sole production caller (WASM NumberProcessor) was already deleted when Phase 3 moved to pure JS. Only `validateWasmDictionaryMatch` survives, called by `DictionaryWasmLookup.js`. Do not recreate either file's dead functions without a concrete new caller — see ADR-037.

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

**`vi.mock('../X')` resolves relative to the TEST FILE's own path**, not the module under test's — when stubbing a child that the component-under-test imports from elsewhere, match the component's import depth, not the test file's. Wrong relative depth silently renders the REAL child instead of the stub (no error, just confusing downstream test failures).

**Single test file:** `pnpm exec vitest run src/path/to/test.ts` — `pnpm test -- --testPathPattern` does not reliably filter to one file.

**`pnpm test -- --run` (full suite) previously hung — root-caused and fixed 2026-08-08.** Cause: `EnhancedVirtualizedDictionaryTable.tsx`'s `refreshDuplicatesPreservingScroll` depended on the whole `scroll` object from `useVirtualScrollRange` (which returns a new object every render) instead of the one stable field it used (`scroll.getScrollTop`) — infinite render loop, only triggered by `DictionaryManager.composition.test.tsx` mounting the real composition. Full suite now runs clean in ~30s. If it hangs again, suspect the same shape: a `useCallback`/`useEffect` dep on a whole hook-return-object instead of the specific stable field it reads — check `git log -S getScrollTop -- src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` for the fix commit.

**Test file placement in `src/utils/`:** goes flat in `src/utils/__tests__/`, even for modules living in a subdirectory (`dictionary/`, `pattern/`, `highlighting/`, etc.) — NOT in a nested `src/utils/<subdir>/__tests__/`. `src/utils/ui/__tests__/` is the one pre-existing exception. Check `ls src/utils/__tests__/ | grep <ModuleName>` before creating a new test file.

**Test file placement in `src/components/`:** components that live in a subdirectory nest their tests there (`src/components/dictionary/__tests__/`, `src/components/configuration/__tests__/`, etc.). Root-level components with no subdirectory (`ErrorBoundary.tsx`, `TabbedInterface.tsx`, a new cross-cutting primitive like `SearchFilterHeader.tsx`) use the flat `src/components/__tests__/` dir instead — it already holds several. Don't apply the `src/utils/` flat-rule to a component that DOES have a subdirectory, though.

**Cross-language (wasm-core Rust ↔ src/ TS) shared test fixtures live in `test-fixtures/` at repo root** — read via `include_str!` + `serde_json` on the Rust side, a static JSON import on the TS side (`resolveJsonModule` pulls it in even though it's outside `tsconfig.json`'s `include` globs). Established 2026-07-29 for tokenizer parity (`test-fixtures/tokenizer-parity.json`) — reuse this location for any future cross-language fixture need instead of picking a new one.

**`pnpm exec eslint <test-file>.test.ts` always prints "File ignored because no matching configuration was supplied"** — `eslint.config.js` excludes test files entirely. Not a bug; confirmed against a pre-existing test file too.

**`pnpm lint` suppresses ALL warnings.** `eslint . --quiet` — every rule in `eslint.config.js` except `react-hooks/rules-of-hooks` is severity `warn`, so `--quiet` silently drops `prefer-nullish-coalescing`, `no-unused-vars`, `react-hooks/exhaustive-deps`, and the console-ban rule. `pnpm lint` currently only catches parse errors + hook-rule violations. Run `pnpm exec eslint <file>` (no `--quiet`) to see real findings. Many `||` warnings are pre-existing and unswept (confirmed repeatedly in `DictionaryManager.js`, `IncrementalDictionarySorter.js`) — after editing a file, check whether _your_ diff touched the flagged line before treating an eslint warning as a regression you introduced. **The RTK proxy summarizes `eslint` output into a "Top rules/Top files" count regardless of flags** — even `--format unix` doesn't return file:line detail through it. To see which line a warning is on, `grep` the source for the pattern directly (e.g. `grep -n '||' file.ts`) and inspect each hit by hand.

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

**Merged 2026-08-17** (agent-config-hygiene restructure) — the list below continues the same convention from root `CLAUDE.md`, where later entries (2026-06 onward) had drifted to a second, disconnected list. This is now the single home; add new entries here, in the same pass you delete the symbol.

- `dispatchHighlighting` from `useHighlightingState` — replaced by `highlightOriginal`, `highlightTranslation`, `highlightBoth`, `highlightFromCharacterOnly`, `setCharacterOnlyIndex`; do NOT add `dispatchHighlighting` back
- `MAX_SAFE_SEGMENTS`, `HIGHLIGHT_SCROLL_DELAY_MS` from `useHighlightingState` — moved to `src/utils/highlighting/semanticArrayConstants.ts`; import from there (or highlighting barrel)
- `DictionaryTable.tsx` / `VirtualizedDictionaryTable.tsx` → use `EnhancedVirtualizedDictionaryTable`
- `LegacySystemFlags.js` and all its exports — permanently removed
- `createReadonlyTokens` from `ReadonlyOptimizationUtils.js` — only `scanTokens` exported
- `OptimizedSemanticArrayBuilder` — entire class deleted; renamed to `SemanticArrayBuilder` (do not import old name)
- `V8OptimizationUtils.js`, `OptimizationBenchmarks.js` — in `src/utils/__benchmarks__/` (dev/debug only); `OptimizationBenchmarks.js` is dynamically imported in `src/utils/__devtools__/DevConsole.js` — not in the production bundle
- `PatternParityTest.js`, `window.runPatternParityTests` (`DevConsole.js`), `test-pattern-parity.html` — deleted 2026-07-28. Broken since the same commit that created it (`e49f655`, 2026-01-03): that commit removed `TwoPhasePatternProcessor`'s internal JS fallback (283 lines) while shipping a dev-console parity tool that needed `processor.options.enableWasm = false` to still run JS internally to produce comparison results — `processTokens()` has thrown `WASM Pattern Processor not available` on that path ever since, for the tool's entire ~7-month lifetime. Also always unreachable independently: it read `engine.twoPhasePatternProcessor`, a property `TranslationEngine` never had. Neither side of the JS/WASM pattern-matcher pair (`SemanticPatternProcessor.testPatternMatch`, `matcher.rs::find_best_pattern_match`/`test_pattern_match`) has fixture-based tests asserting concrete matched output today — see ADR-033 for why a real parity test wasn't built as a replacement.
- `SemanticPatternProcessor.applyPatternMatch` — deleted; `processTokens()` now returns `PatternProcessorResult[]`, apply via `applyHierarchicalResults(tokens, results, options)`
- `useDictionaryConfig.js` — deleted; use `useDictionaryModals` from `src/hooks/useDictionaryModals.js`
- `useTranslationController.forceCleanup` — removed (unused); hook returns only `{createController, cleanup, cancelAll, getActiveCount}`
- `WasmDictionaryTrieWrapper` from `wasm/WasmDictionaryTrie.js`, `validateWasmDictionaryTrie` from `WasmDictionaryTrieValidator.js` — deleted; WASM trie is 2x slower than JS Map at current dictionary size (benchmarked 2026-01-31)
- `WasmRetryManager.js` / `wasmRetryManager` — absorbed into `WasmProcessorLifecycle`; retry logic is now private (`_retryWithBackoff`, `_isTransientError`, `_calculateDelay`)
- `WasmTextChunker.initialize(useUnicodeProperties, timeoutMs)` — removed; init is module-private `_initializeTextChunker()`; background init fires at module bottom; `wasmTextChunker` singleton still exported
- `MemoryManagementRefinements.ts` from `wasm/` — split into `src/utils/memory/` (`SmartMemoryPressureDetector.ts`, `BackgroundCleanupManager.ts`, `ComponentMemoryProfiler.ts`)
- `EnhancedDictionaryManager` from `dictionary/EnhancedDictionaryManager.js` — merged into `DictionaryManager` via injected `WasmDictionaryAdapter`; use `new DictionaryManager({ wasmAdapter: new WasmDictionaryAdapter() })`
- `TranslationSegmentCache` class + `translationSegmentCache` singleton from `utils/dictionary` — deleted (cache was removed from engine; hit rate permanently 0)
- `SegmentPrecomputer.createRenderSegments`, `.getSegmentClassName`, `.getSegmentStyles`, `.getVisibleSegments` — deleted (dead, zero callers); `RenderSegment` interface also removed from highlighting barrel
- `SegmentPrecomputer` class — declassed to named exports `precomputeSegments`, `precomputeOriginalSegments`, `findUnitMatch`, `normalizeText` from same file; `precomputeSegmentsWasm`, `convertMatchesToSegments`, `addNonSemanticSegments` deleted (dead WASM path, `WasmSegmentMatcher` was never globally defined)
- `PerformanceProfiler.recordParallelPerformance`, `.recordParallelFallback`, `.getParallelPerformanceReport`, `.generateParallelRecommendations` — deleted (dead, zero callers)
- `DictionaryManager._wasmAdapter`, `._wasmInitialized`, `._wasmInitPromise`, `._wasmValidationCallCount`, `.performanceComparison` — extracted to `DictionaryWasmLookup`; use `this.wasmLookup` (set in constructor if `options.wasmAdapter` provided)
- `DictionaryManager._translateWasm`, `._findAllMatchesWasm`, `._validateWasmSync`, `._syncDictionariesToWasmSequential`, `._initializeWasm` — extracted to `DictionaryWasmLookup` as `translate()`, `findAllMatches()`, `_validate()`, `sync()`, `_doInit()`
- `DictionaryManager._initializeWasmBackground` — deleted; init→sync sequence now in `DictionaryWasmLookup.startBackgroundInit(config)`; DWL constructor accepts `{ getEntries, getPriorities }` callbacks for the post-init sync
- `EVDT` inline scroll state (`scrollTop`, `containerHeight`, `isScrolling`, `scrollVelocity`), refs (`scrollRef`, `scrollTimeoutRef`, `lastScrollTop`, `lastScrollTime`, `resizeObserverRef`), and callbacks (`scrollRefCallback`, `handleScroll`, `scrollToTop`, `scrollToBottom`, `visibleRange` memo, `scrollRestore` RAF effect) — extracted to `useVirtualScrollRange` in `src/hooks/useVirtualScrollRange.ts`; EVDT uses `const scroll = useVirtualScrollRange(totalItems, { itemHeight, isActive, scrollRestore, onScrollSave })`. Hook exposes `scroll.scrollRef` (for `useEntrySelection` + restore effect) and `scroll.setScrollTop` (state-only sync). `bufferSize` is internal to the hook (self-optimizing via `adaptiveBufferCalculator`, debounced 100ms); do NOT pass it as a param.
- `DictionaryEntryFilters` interface from `useDictionaryEntryFilter` — deleted; filter state now owned by the hook; 4th param is `showDuplicatesMode: boolean` (not a filters object)
- `SemanticArrayBuilder.buildOriginalMapping`, `.buildTranslatedMapping` (private methods) — extracted to `mapToPositions(text, units, count, caseInsensitive?)` in `src/utils/highlighting/TextPositionMapper.ts`; `buildPositionMappings` now delegates both passes to this function
- `SemanticPatternProcessor.classifyVariableType`, `.getHeuristicType` — extracted to `src/utils/pattern/VariableTypeClassifier.ts`; `classifyVariableType` exported (pure fn), `getHeuristicType` module-private; `properNouns-f_HarryPotter`/`DuongThan` name hardcode deleted
- `DictionaryManager.isDictionaryType`, `.getIndexedMatches` — extracted to `src/utils/dictionary/LookupIndexUtils.ts`
- `WasmDictionaryManager.syncFailureTracking`, `._recordSyncSuccess`, `._recordSyncFailure`, `.getSyncMetrics`, `.failureReasonsIndex`, `.syncHistoryIndex`, `loadDictionary._skipMetrics` param — deleted (zero callers on `getSyncMetrics`; see ADR-020 for restoration shape if perf dashboard is built); use `isDictionaryCategory(name, cat)` (imported into DM internally) and `getIndexedMatches(index, pos, cat)` (imported directly in `TranslationEngine.js`, no longer on DM's interface). `DictionaryManager.metadata.type` was never written — the `metadata.type === 'X'` branches in `isDictionaryType` were dead code; do not recreate them.
- `TextChunker.translatePunctuation`, `.translatePunctuationNormally`, `.fixAngleQuotePositioning`, `.reconstructText`, `.reconstructTextWithSegments` — extracted to `ChunkPostProcessor` (`src/utils/text/ChunkPostProcessor.js`); `TranslationEngine` holds `this.chunkPostProcessor = new ChunkPostProcessor()` alongside `this.textChunker`. `TextChunker.testChunking` method and `testChunker` module export also deleted (dev-only, zero callers).
- `TranslationEngine.initializeSmartMemoryManagement`, `.handleSmartCleanup`, `.performEmergencyCleanup`, `.performHighPriorityCleanup`, `.queueBackgroundCleanup`, `.cleanupOldPerformanceData`, `.optimizeMemoryStructures`, `.startMemoryProfiling`, `.completeMemoryProfiling`, `.getSmartMemoryStats`, `.shutdownSmartMemoryManagement` — all extracted to `SmartMemoryCoordinator` in `utils/memory/SmartMemoryCoordinator.ts`; engine accesses via `this.memoryCoordinator`
- `prevIsDictionaryReloadingRef` in `Translator.jsx` — absorbed into `useDictionaryReloadGuard` (`src/hooks/useDictionaryReloadGuard.ts`); do not recreate the inline ref-update pattern in `loadAndTranslate`
- `isClipboardBusy` ref, `isClipboardTranslation` state, `setIsClipboardTranslation`, inline `handleTranslateFromClipboard` in `Translator.jsx` — extracted to `useClipboardTranslation` (`src/hooks/useClipboardTranslation.ts`); Translator uses `const { isClipboardTranslationRef, resetClipboardFlag, handleTranslateFromClipboard } = useClipboardTranslation(...)`. `isClipboardTranslation` is now a ref (not state) — never drives JSX; `loadAndTranslate` reads `.current` and calls `resetClipboardFlag()` (no dep-omission needed)
- `highlightingComputationRef` in `Translator.jsx` — private to `useCharacterOnlyBridge`; inline bridge useEffects `:623`+`:699` extracted to `src/hooks/useCharacterOnlyBridge.ts` (guards, bounds check, `findCharacterOnlyMatch` call, `setCharacterOnlyIndex` dispatch, 10ms scroll)
- inline `loadAndTranslate` `useEffect` in `Translator.jsx` — extracted to `useAutoTranslateTrigger` (`src/hooks/useAutoTranslateTrigger.ts`); owns "when to re-translate" policy: reload guards (`consumeReloadTransition` first, then `isDictionaryReloading`), charOnly after main (`setTimeout 0`), clipboard scroll (`setTimeout 100ms`), `isTranslating` lifecycle. Dep array: `[inputText, isLoading, isDictionaryReloading, translateCharacterOnly, translateText]`. Stable params (9) grouped into `ctx: TranslationExecutionContext` (exported from same file) — do not flatten back to top-level params.
- `handleForceReload` inline `useCallback` in `Translator.jsx` — extracted to `useForceReload` (`src/hooks/useForceReload.js`); owns 5-step reload protocol (cancel→clear→load→reinit→retranslate→scroll restore). CRITICAL-3 invariant (`await cleanupComplete` before touching `engineRef.current`) is the primary documented invariant. Stable refs/callbacks (19) grouped into `forceReloadCtx` in Translator.jsx — excluded from dep array (same pattern as `TranslationExecutionContext`). Dep array: `[isDictionaryReloading, inputText, isLoading, dictionaries]`.
- `HealthReport.cacheHitRate` — deleted (`TranslationSegmentCache` removed; field was always 0 in UI); `performanceHealth.getReport()` now takes no arguments
- `MemoryLeakDetector`, `getPerformanceMetric`, `releasePerformanceMetric` from `performance/index.ts` barrel — removed (zero prod barrel callers); import directly from their files if needed
- `WasmNumberProcessor.js` / `isWasmNumberProcessorAvailable` — deleted; Phase 3 is now pure JS (`NumberProcessor.js`); `this.numberProcessor.processTokens()` is the sole Phase 3 call site in `TranslationEngine.js`
- `NumberProcessingAdapter.js` / `processNumbers` — deleted alongside `WasmNumberProcessor.js`
- `WASM_NUMBER_THRESHOLDS` from `TranslationConstants.js` — deleted (was WASM/JS dispatch threshold)
- `INITIAL_STREAMING`, `INITIAL_STATE`, `streamingReducer` from `useStreamingTranslation` — module-private (intentionally unexported session 78); only `useStreamingTranslation` is exported
- `useSegmentComputation` from `src/hooks/useSegmentComputation` — split into `useCharacterOnlySegments` (char-only sync, `segmentFromPositionMetadata`) and `useFullTranslationSegments` (async, `precomputeSegments` + cancellation guard). `useFullTranslationSegments` itself deleted 2026-07-17d — dead on arrival, zero production callers. The full-translation path (`ClickableTranslationOptimized.tsx`) never computed segments client-side at all; it consumes the `prebuiltSegments` prop the engine builds synchronously during translation (`TranslationEngine.js`'s `this.prebuiltSegments = ...` sites), threaded through `Translator.jsx` → `TranslatorDisplayPanels.tsx`. The hook's own "may await WASM" doc comment was also stale — `precomputeSegments` is plain sync JS, the WASM path it described was deleted in session 59. Only `useCharacterOnlySegments` survives, wired into `ClickableTranslationSemantic.tsx`.
- `validateDictionaryEntry` from `src/components/dictionary/DictionaryTypes.ts` — extracted and renamed; use `validatePersistEntry` from `src/utils/dictionary/PersistTimeValidator` (or `utils/dictionary` barrel). Distinct from form-time `validateDictionaryEntry` in `DictionaryEntryValidator.ts` (different signature: `(source, translation, dictionaryId) → ValidationResult`).
- `useDictionaryCRUD` from `src/components/dictionary/` — moved to `src/hooks/useDictionaryCRUD.ts`; ADR-026 superseded 2026-06-27
- `RustLookupIndexManager.extractEntriesFromTrie` — deleted; DFS-walked a `DictionaryTrie` back into flat entries on every translate call. Replaced by `DictionaryManager.flatEntries` (built once at load time via `flattenDictionaryEntries` in `src/utils/dictionary/DictionaryEntryFlattener.ts`, directly from raw dictionary JSON, never from a trie). `RustLookupIndexManager.buildLookupIndex`'s 2nd param is now "Map of dictionary name → flat entries," not "→ trie" — callers pass `dictionaryManager.flatEntries`, not `dictionaryManager.dictionaries`.
- `toPatternsId`/`toProperNounsId` (`src/utils/dictionary/DictionaryIdClassifier.ts`) — canonical ADR-027 fiction dict-ID pairing derivation. Do NOT hand-roll `'patterns-' + id.slice('properNouns-'.length)` again; grep for `slice('properNouns-'.length)` before adding a new fiction-pairing call site.
- `resolveDefaultProperNounTarget`/`resolveStructuralPatternQuickAddTarget` (`src/utils/dictionary/QuickAddTargetResolver.ts`) — Cmd-5/Cmd-6 quick-add target resolution, shared by `TabbedInterface.tsx` and `useDictionaryModals.js`.
- `filterDictionariesForEngine` — moved from `useTranslatorEngine.js` to `src/utils/dictionary/FictionDictionaryFilter.ts` (barrel-exported). The hook now calls the imported version.
- `onAddEntry` from `HotkeyHandlerOptions` (`useHotkeyHandler.ts`) — removed, was dead (no `HotkeyAction` variant ever dispatched to it). `DictionaryManager.tsx`'s "+" button already calls `setShowAddEntry(true)` directly.
- `useHotkeyHandler(options)` now takes one options object (not destructured) mirrored into a single `optionsRef` — do not reintroduce per-prop `useRef` pairs; add new callbacks to `HotkeyHandlerOptions` and read via `optionsRef.current.X`.
- `enable_matcher_profiling`/`disable_matcher_profiling`/`reset_matcher_profiling`/`print_matcher_profiling_report` (wasm-core `matcher.rs` + `lib.rs` wasm_bindgen wrappers) + `MatcherProfilingData`/`PROFILING_DATA`/`PROFILING_ENABLED` — deleted 2026-07-17; grepped zero JS callers (dev-console-only, never wired into production). Do not recreate without a concrete profiling need — see git history for the removed implementation if one arises.
- `memory_management.rs`/`wasm_boundary.rs` (wasm-core) — deleted 2026-07-17, entirely dead RAII memory-tracking module and zero-copy/binary-serialization `BoundaryOptimizer` respectively. Neither was in `lib.rs`'s own "✅ ACTIVE SYSTEMS" header comment; `wasm_boundary.rs` had zero JS wrapper (unlike the 5 real WASM processors) and zero JS callers of `processTokensZeroCopy`/`processTokensBinary`. `bincode` dependency removed from `wasm-core/Cargo.toml` alongside it — was `wasm_boundary.rs`'s sole consumer in the crate. Do not recreate without a measured perf need — see git history for the removed implementation if one arises.
- `ContentAwarePositionCache`/`contentAwarePositionCache` from `src/utils/caching/` — deleted 2026-07-17. Sole external caller (`SystemPerformanceMonitor.js`) only ever read `.getStats()`; nothing ever called `.get()`/`.set()`, so the "position_cache" baseline/recommendation was permanently zero — same failure mode as the earlier `cacheHitRate`/`TranslationSegmentCache` deletion. Swept alongside it: the `'positionCache'` integration entry + `recordIntegrationMetrics` block in `SystemPerformanceMonitor.js`, the `generateRecommendations()` position-cache branch, `DevConsole.js`'s `checkCachePerformance()` position/semantic-cache branches, and a pre-existing dead `semanticTranslationCache`/`semantic_translation_cache` leftover found in the same files (from the already-completed `TranslationSegmentCache` deletion, never fully swept). Also deleted: the drifted pre-v3 ambient type spec in `CacheTypes.d.ts` (`similarityCache`/`findSimilar`, never matched the real class) and `ContentAwarePositionCacheInterface`/`Options` in `ViewportTypes.d.ts`. `PerformanceBaselineTracker.js`'s generic `cacheHitRate` machinery was left intact — it's reusable for any future operationType, not specific to this cache.
- `segment_matcher.rs` (wasm-core) — deleted 2026-07-17c, dead `SegmentMatcher` WASM module. Sole JS consumer `WasmSegmentMatcher.js` was already deleted (see `SegmentPrecomputer` entry above); zero remaining JS callers and zero internal Rust cross-references. Also absent from `lib.rs`'s own "✅ ACTIVE SYSTEMS" header — third confirmed case of that exact signal after `memory_management.rs`/`wasm_boundary.rs`. `pub mod segment_matcher;` and `pub use segment_matcher::SegmentMatcher;` removed from `lib.rs`; no Cargo.toml dep was unique to it (HashMap/wasm_bindgen/serde all shared elsewhere in the crate).
- `dictionaryCache`/`MAX_DICTIONARY_CACHE_SIZE` in `Translator.jsx` — deleted 2026-07-17c. Declared right above `forceReloadCtx` with a "CRITICAL FIX: LRU eviction" comment but never read or written anywhere in the file — dead since whenever the caching logic they were meant to gate was never wired in (or was removed and these two lines were missed).
- `TranslationEngine.wasmManager` getter, `Translator.jsx`'s `wasmStatus`/`wasmStatusRef` polling cluster, `TranslatorControls`' `wasmStatus` prop/badge, `.wasmStatus` CSS class, and 3 duplicate `WasmStatus` ambient type declarations (`ComponentTypes.d.ts`, `TranslationEngineTypes.d.ts` ×2) — deleted 2026-07-17d. The getter pointed at `dictionaryManager.wasmManager`, a property that stopped existing 2026-06-03 (`WasmDictionaryAdapter` composition change) and was never updated through the later `DictionaryMatchLookup`/`DictionaryWasmLookup` split — the polling effect's guard (`engineRef.current?.wasmManager`) was `undefined` from that point on, so the dev WASM-status badge never rendered again. See ADR-019 addendum. Do not recreate without repointing at the real `dictionaryManager.wasmLookup` and re-checking what `WasmDictionaryAdapter` (deliberately narrow seam) actually exposes.
- `wasmErrorHandler.js` (`categorizeWasmError`, `createWasmErrorHandler`, `formatWasmError`, `shouldEnterFallback`) — deleted 2026-07-17d, zero callers ever (own doc-comment usage example was never adopted at any real `Wasm*.js` call site). Superseded by two conventions that evolved independently: `FallbackManager.handleFailure()` (the actual binary success/failure model all 5 wrappers use in their catch blocks) and `WasmProcessorLifecycle`'s Retire-After-Panic convention (any post-init panic is permanent — the transient/permanent distinction this module offered would be actively wrong there, since all 5 wrappers share one WASM binary/linear memory and a panic corrupts it for all of them). Also referenced `window.errorTracker`, a global that doesn't exist anywhere else in the codebase — a speculative error-tracking integration never wired to any real service.
- `createTokenizer`/`tokenTypeToString` (`src/utils/text/TextTokenizer.ts`) and `isWasmTextTokenizerSupported` (`src/utils/wasm/WasmTextTokenizer.js`) — deleted 2026-07-17d, zero production callers. Despite looking freshly added (61b4807 touched the same files for an unrelated punctuation-gap fix, adding tests), git blame traces all 3 to the project's early days (initial Tauri migration / original WASM TextTokenizer implementation) — genuinely old dead exports, not new ones. Survived `d0c2197`'s dedicated dead-export sweep, likely because each had its own test file that read as "used" to whatever tool that sweep ran. Real callers construct `new TextTokenizer()` directly (not `createTokenizer()`); nothing calls `tokenTypeToString` or `isWasmTextTokenizerSupported` outside their own now-deleted test blocks.
- `DictionaryWasmLookup._getPerformanceComparison`/`isBeneficial`/`getPerformanceReport`/`_stats`/`_recordLookup`, `DictionaryManager.getEnhancedPerformanceReport`/`isWasmBeneficial`, `TranslationEngine.getWasmPerformanceReport`, `WasmValidationPerformance` type, and `validateWasmFallback`'s write-only `.performance` field — deleted 2026-07-17d. All hardcoded `jsLookups: 0, jsTotalTime: 0, jsAverageTime: 0, speedupRatio: 1.0` (`isBeneficial()`'s own comment admitted `speedupRatio` stayed 1.0 forever) with zero real readers anywhere — fourth confirmed case of the "constant-zero metric" pattern after `cacheHitRate`/`ContentAwarePositionCache`/`getSyncMetrics`. `TranslationEngine.getWasmPerformanceReport()` was additionally calling `this.dictionaryManager.getPerformanceReport()`, a method that never existed on `DictionaryManager` — would have thrown if it had ever been called.
- `RustLookupIndexManager.invalidateCache` — never existed; a guarded `typeof === 'function'` call site in `TranslationEngine.js`'s `invalidateAllCaches()` always no-op'd. Deleted 2026-07-17e alongside the dead `@see` doc comment — confirmed via full read of `RustLookupIndexManager.js` (only `reset()`/`cleanup()` exist) and confirmed `build_lookup_index`'s Rust side is stateless per-call (no server-side cache exists to invalidate, ever).
- `AdaptiveChunker.totalAdaptations`/`.currentOptimalSize`/`.adaptationStats`, `getAdaptationStats()`, `reset()` — deleted 2026-07-18. All write-only/unreachable (no `window.*` global, unlike ADR-021's protected dev tools) — 5th confirmed case of the "nobody reads this metric" pattern. `analyzeContentCharacteristics`/`calculateOptimalChunkSize`/`recordPerformance`/`analyzePerformanceTrend` are real production dependencies of `TranslationEngine.js` and untouched. `BatchProcessingTypes.d.ts`'s `AdaptationStats` interface and the matching fields on its `AdaptiveChunker` interface deleted alongside (100% decorative — no `// @ts-check` file ever imported them as a real type).
- `DictionaryManager.getPrecomputedCacheStats()` — deleted 2026-07-18. Zero direct callers; redundant duplicate of `window.dictionaryTrieLoader.getCacheStats()` (`DictionaryTrieLoader.js`) — both read the same module-level `precomputedTrieStats` singleton, so the two paths were always byte-identical. Also collided in name with the real, unrelated `DictionaryManager.getCacheStats()` (translation-cache stats, not trie-cache stats).
- `WasmRegexUtils.js`, `wasm-core/src/regex_utils.rs`, `OptimizationBenchmarks.benchmarkWasmRegexUtils()` — deleted 2026-07-18. Built 2026-01-31 (commit `4761c3a`); that commit's own "Next Steps" said "run benchmarks to verify 3-8x speedup" and "optional integration with TextChunker" — neither ever happened (`git log -S` on the benchmark's baseline key and on `WasmRegexUtils` in `TextChunker.js` both show zero hits after the creation commit). The wrapper's doc comment ("Benchmark: 0.004ms → 0.0013ms") reads like a measured result but matches the commit's own _projected_ target verbatim — never actually run. `regex`/`lazy_static` Cargo.toml deps kept (shared with `number_processor.rs`).
- `TranslationEngine.performMemoryCleanup` (the ~150-line 3-branch `'automatic'`/`'critical'`/`'emergency'` method, method-as-property, reassigned fresh on every `translateWithProgressiveBatches` call) — deleted 2026-07-29 (architecture review candidate #1). It was only ever invoked via `this.memoryTracker.onCleanupNeeded`, which only fires from inside `MemoryLeakDetector.takeSnapshot`'s internal heap-ratio check — and `takeSnapshot` was only ever called `if (process.env.NODE_ENV === 'development')`. **Unreachable in production the entire time.** Superseded by `BatchMemoryCleanup` (see `CONTEXT.md`), triggered by `memoryCoordinator`'s pressure callbacks and a throttled (every-5-batch, dev+prod) growth check.
- `MEMORY_THRESHOLDS.EMERGENCY_CLEANUP_THRESHOLD`/`.CRITICAL_CLEANUP_THRESHOLD` (`PerformanceThresholds.ts`) — deleted 2026-07-29 alongside `performMemoryCleanup`. Zero production callers ever — their only consumer was `TranslationEngine.regression.test.js`'s `MockTranslationEngine.performEmergencyCleanup`/`.performHighPriorityCleanup`, hand-rolled reimplementations of methods (`handleSmartCleanup`, `performEmergencyCleanup`, `performHighPriorityCleanup`, `optimizeMemoryStructures`) that were themselves already on this file's own "Deleted symbols" list (extracted to `SmartMemoryCoordinator` well before this entry was written) — the mock was never updated after the real methods were deleted, and its asserted keep-counts (10/20) never matched what the real `onEmergency`/`onHighPriority` callbacks actually hardcoded (3/5). Test removed alongside the constants; the file's real, still-accurate coverage (`trackTranslationSegment`'s canonical hard ceiling) was left untouched.
- `dictionaryManager.optimizeCaches()`, `semanticArrayBuilder.cleanup()`, `semanticArrayBuilder.clearCache()` (4 call sites), `translationCache.clearOldEntries()` — all guarded `typeof === 'function'`/truthy calls inside `translateWithProgressiveBatches`, deleted 2026-07-29. None of the 4 methods/properties has ever existed — confirmed via full-file grep, zero definitions anywhere. `translationCache` in particular is a stale reference to `TranslationSegmentCache`, already deleted per this same list (see the earlier `TranslationSegmentCache` entry) — this call site was simply never swept at the time. 9th+ confirmed instance of the "guarded call to a method that was never real" pattern in this codebase (after `RustLookupIndexManager.invalidateCache`, `DictionaryManager.getEnhancedPerformanceReport`'s `getPerformanceReport()`, etc.) — when auditing a `translateWithProgressiveBatches`-adjacent block, verify every guarded `typeof x.y === 'function'` call actually resolves before assuming the guard proves it's real.
- `src/utils/performance/PerformanceProfiler.js` (entire file, class + `performanceProfiler` singleton) — deleted 2026-08-06 (architecture review candidate #1). Its write side ran on every translation (`startTranslationProfile`/`endTranslationProfile`) but every read method (`getPerformanceReport`, `getDashboardMetrics`, `getPerformanceTrends`, and `TranslationEngine`'s own delegators of the same names) had zero callers anywhere — confirmed by full-repo grep, not just outside-file. `markTranslationPhase`/`recordRenderingMetrics` had zero callers at all, not even internally. Same "constant nobody reads" shape as `cacheHitRate`/`ContentAwarePositionCache`/`getSyncMetrics` earlier in this list. `TranslationEngine`'s constructor no longer accepts a `{ performanceProfiler }` DI option — nothing injected it (confirmed: zero test references).
- `PerformanceLogger` class and `performanceLogger` singleton from `src/utils/BatchLogger.js` — deleted alongside `PerformanceProfiler.js`, same sweep. Same shape again: `startTiming`/`endTiming` ran live (2 call sites in `TranslationEngine.js`), but `getPerformanceAnalysis`/`getBottlenecks`/`clearBottlenecks` and the `TranslationEngine` wrapper methods `getPerformanceAnalysis()`/`clearPerformanceData()` had zero callers. The one real behavior — a dev-console log branching on a 200ms slow-operation threshold — survives as `logIfSlow(operation, startTime, context)`, a plain exported function in the same file, called from `TranslationEngine.js`'s `translateWithSegments` and `processChunksInParallel`. Do not recreate `PerformanceLogger`/`performanceLogger` — use `logIfSlow`. `batchLog` (the general dev-logging convenience object in the same file) is unrelated and untouched.
- `DebugObjectPool.js`'s `performanceMetricPool`, `timestampPool`, `memorySnapshotPool`, `cacheStatsPool` (4 of 5 pools) and their `get*`/`release*` methods and module exports (`getPerformanceMetric`, `releasePerformanceMetric`, `getTimestamp`, `releaseTimestamp`, `getMemorySnapshot`, `releaseMemorySnapshot`, `getCacheStats`, `releaseCacheStats`) — deleted same sweep. `performanceMetricPool` was orphaned by the `PerformanceProfiler.js` deletion (its only caller); the other 3 pools were **already** dead independently — zero external callers, confirmed, predating this change. `getAllStats()`/`getSummaryStats()` (the aggregate stats rollup over all 5 pools) also deleted — zero callers ever. `DebugObjectPoolManager` now owns exactly one pool, `logEntryPool`, feeding `BatchLogger`'s live `getLogEntry`/`releaseLogEntry`. Do not recreate the other 4 pools without a concrete new caller.
- `DictionaryTrie.js`'s `validateIntegrity()`, `repair()`, `getHealthScore()` — deleted 2026-08-06 (architecture review candidate #3). `ADR-034` (2026-07-28) had already confirmed `repair()`/`getHealthScore()` had zero callers anywhere and `validateIntegrity()`'s only 2 callers were those same two methods — a closed, unreachable island, re-verified still true 9 days later. Unlike `TranslationProfiler`/Pattern Profiling (ADR-021's protected gated dev tools), this had no enable/disable toggle or `DevConsole` wiring — just orphaned code. The 8 supporting `.d.ts` interfaces (`TrieValidationResult`, `TrieValidationError`, `TrieValidationWarning`, `TrieValidationStatistics`, `TrieValidationPerformance`, `TrieRepairResult`, `TrieRepairAction`, `TrieHealthScore`) were deleted alongside from `DictionaryManagerTypes.d.ts`, plus the dead JSDoc `@import` lines referencing them in `DictionaryManager.js` (which never actually used them in a type annotation — `DictionaryManager` never had a `validateIntegrity` method at any point in its git history, per `ADR-034`).
- `DictionaryManager._extractAllEntries`/`._extractTrieEntries` — deleted 2026-08-07 (architecture review candidate #1 grilling). Unguarded recursive DFS walk of a live `DictionaryTrie`, run on every dictionary CRUD edit via `invalidateDictionaryCaches` → `syncDictionariesToWasm`, to rebuild the same `{chinese,vietnamese,metadata}[]` shape `this.flatEntries` (see `DictionaryEntryFlattener` in `CONTEXT.md`) already computes once at load time from the same raw JSON. `syncDictionariesToWasm()` now reads `this.flatEntries` directly; the constructor's `DictionaryWasmLookup` `getEntries` callback does too (`() => this.flatEntries`, not `() => this._extractAllEntries()`). `_extractPriorityMap()` is untouched (reads `this.metadata`, unrelated to the trie walk).
- `WasmDictionaryManager.loadDictionariesBatch`/`.estimateBatchMemoryRequirement` — deleted 2026-08-07, same sweep. Confirmed zero production callers (only `WasmDictionaryAdapter` → `loadDictionary` singular is ever called in the real composition path) and confirmed the method's own `this.engine.load_dictionaries_batch_fallback` hook doesn't exist anywhere in the Rust bindgen surface — always resolved to the `false` branch of its own `??` chain. `estimateBatchMemoryRequirement` had exactly one caller, the now-deleted method.
- `DictionaryManager.getDictionaryNames`, `.periodicWasmValidation` (and its sole-purpose field `_validationCallCount`) — deleted 2026-08-08 (architecture review round, candidate #1 grilling). Both had zero callers anywhere — production, tests, dev-console, `.d.ts`, and ADRs — confirmed by full-repo grep. Do NOT delete the 3 sibling methods flagged alongside them in the same investigation: `getWasmStatus()` is a documented dev-console command (`docs/guides/development.md:126,237`, `window.translationEngine.dictionaryManager.getWasmStatus()`) and is asserted directly by `DictionaryManager.apiContract.test.js` as a public-API-contract guarantee; `getMemoryUsage()`/`reloadDictionaries()` are exercised by `DictionaryMemoryCleanup.regression.test.js` as the regression guard for a real historical WASM-cleanup-on-reload bug (see `docs/code-review/DICTIONARY_MEMORY_FIXES_2026-02-03.md`, HIGH-1/HIGH-2/CRITICAL-1) — ADR-034 line 20 cites this pair by name as "a dropped feature with a HIGH-severity-labeled regression test proving real historical intent." All 3 look like the same "test-only caller, therefore dead" shape as the two deleted methods on a plain grep, but aren't — check dev-console reachability and regression-test provenance before re-flagging any DictionaryManager method as dead code, not just caller count.
- `TranslationEngine.js`'s 9 `systemPerformanceMonitor.recordAlert(...)` call sites (and the `typeof` guards around each, and the now-unused `import { systemPerformanceMonitor } from './performance/SystemPerformanceMonitor.js'` itself) — deleted 2026-08-08 (architecture review round, candidate #3 grilling). `recordAlert` never existed on `SystemPerformanceMonitor` — confirmed by full-repo grep; the class's real methods are `recordPerformance`, `getStatus`, `getSystemHealthReport`, `destroy`. Every one of the 9 `typeof systemPerformanceMonitor.recordAlert === 'function'` guards (covering `pattern_processing_failure`, `pattern_processing_error`, `semantic_array_corruption`, `token_array_corruption` ×5 per-phase, `phase_failures`) was permanently `false` since inception — none ever fired. ADR-030 had wrongly asserted these calls were "load-bearing" (see its 2026-08-08 addendum) — only the `window.systemPerformanceMonitor` assignment for `DevConsole.js`'s devtools access was real; the alert calls it was describing never worked. `errorContext`/`failureReport` locals that also feed a `logger.error`/`this.lastPhaseFailures` use elsewhere were kept; only the dead guard+call blocks were removed.
- `DictionaryTrieLoader.invalidateDictionaryCache` (and its `window.dictionaryTrieLoader.invalidateCache` dev-console exposure), `PrecomputedTrieCache.invalidatePrecomputedTrie`, `.recordCacheInvalidation()`/`.cacheInvalidations` — deleted 2026-08-07 (architecture review candidate #5 grilling). The `deleteCacheFile` callback `invalidateDictionaryCache` passed down was hardcoded `return false` always ("deletion can be added later") — confirmed zero production callers (dev-console-only), and confirmed the checksum-validation in `tryLoadPrecomputedTrie` is a real, self-sufficient staleness check independent of explicit invalidation: any dictionary content change is caught via checksum mismatch on the next load regardless. A working `invalidateDictionaryCache` would only ever have been a minor perf micro-optimization (skip one wasted read+discard cycle), never a correctness requirement. `recordCacheInvalidation()`/`cacheInvalidations` had exactly one write-caller — the now-deleted wrapper — matching this codebase's repeated "write path removed, stat displays 0 forever" pattern. `caching/index.ts`'s barrel re-export of `invalidatePrecomputedTrie` had zero importers even before the deletion. `getCacheStats` (the sibling function on the same `window.dictionaryTrieLoader` object) is untouched — it's a genuinely working read, and dev-console-only reachability is normal for a debug tool, not a defect. `PrecomputedTrieCache.js`'s own module doc claimed "On save: Delete .trie.json to invalidate cache" — grepped both this file and `src-tauri/src/dictionary_commands.rs`; nothing anywhere ever implemented that. Corrected to describe the real (checksum-only) strategy.
- `types/WasmTypes.ts` (repo root, outside `src/`), `src/types/WasmTypes.d.ts`, and `WasmBoundaryValidation.ts`'s `validateWasmToken`/`copyWasmTokens`/`validateWasmPatternMatch`/`validateRustLookupMatch`/`isMetadataSizeValid`/`MAX_WASM_METADATA_SIZE` — deleted 2026-08-08 (architecture review candidate #3 grilling; see ADR-037). `copyWasmTokens`/`validateWasmToken` were real production code for ~5 months until their sole caller (WASM NumberProcessor) was deleted; the other four were dead-on-arrival. `types/WasmTypes.ts` additionally had its own copy of `validateWasmDictionaryMatch` that had drifted from the real one (wrongly required `m.dictionary`) — its test (`WasmBoundaryEdgeCases.test.js`, also deleted) was silently testing the wrong contract. `WasmBoundaryValidation.ts`'s `validateWasmDictionaryMatch` survives — it's live, called by `DictionaryWasmLookup.js`. Do not recreate the deleted validators as a "fix" for `WasmPatternProcessor.js`/`WasmTextChunker.js` having no boundary validation — that's a real, separately-flagged open gap (ADR-037), not solved by resurrecting a `WasmToken`-shaped validator that doesn't match either wrapper's actual data shape.
- `src/utils/highlighting/PositionMappingUtils.js` (entire file: `tokenPositionToCharPosition`, `buildFullTextFromTokens`, `convertWasmMatchToTokenMatch`) — deleted 2026-08-08 (architecture review candidate #4 grilling). 100% of the file's exports were dead — zero production callers, confirmed via full-repo grep including the `utils/highlighting` barrel's consumer list. `TextChunker.js`'s `TextChunk` (now module-private, still used internally to construct chunks) and `createChunker` (fully deleted, zero callers even internally — a single-line unused factory), `PerformanceMonitor.js`'s `timeOperation` (fully deleted, zero callers) and `PerformanceMonitor` class export (now module-private, `globalPerformanceMonitor` still constructs from it in the same file), `CharacterOnlyBridge.ts`'s `MAX_MATCHES`/`CONTEXT_WINDOW` (now module-private, `findCharacterOnlyMatch` still uses them internally), and `configValidation.ts`'s `validateRawDictionaryEntry`/`validateDictionary`/`validateDictionaryList`/`DictionaryEntry` type/`Dictionary` interface/`ValidationError` re-export — same sweep, same shape: each had zero external callers, superseded by `validatePersistEntry` (`PersistTimeValidator.ts`) for the dictionary-validation trio. `configValidation.ts`'s plain `import { ValidationError } from './errors'` stays — `validateApiResult` (the surviving export) still throws it; only the re-export line was dead. The `ValidationError` class's own test coverage (previously living in `configValidation.test.ts` despite the class living in `errors.ts`) moved to a new `errors.test.ts`. **Not included in this sweep**: `VocabularyWarmup.js`'s `extractHighFrequencyVocabulary`/`generateCharacterCombinations` — also zero external callers, but deliberately kept exported because `VocabularyWarmup.test.js` has ~130 lines of substantive direct unit tests pinning real edge cases (empty trie, single-char words) that only work through a direct import; unexporting would force those tests to either break or weaken to indirect-only coverage through `warmNovelSpecificVocabulary`. A real test surface is a legitimate reason to keep an export with no cross-module caller — do not re-flag this pair as dead code without re-litigating that tradeoff.
- `RulesManager.tsx`'s local `SemanticTypeToggles` — deleted 2026-08-12 (architecture review grilling); replaced by the shared `SemanticTypeToggleCell` (`VirtualRowComponent.tsx`), extended with `clearable`/`size`/`align`/`rowLabel` props. `MatchKindToggle` untouched — different domain (prefix/suffix, not semantic type), not unified.
- `useDictionaryEntryForm.ts`'s local `joinCharGloss`/`generateRoughTranslation`/`computeInitialTranslation` (closure-capturing `useCallback`s) and its private `transformRules` state/load-effect — deleted 2026-08-12 (architecture review grilling); logic moved to `TransformRuleEngine.ts` as plain functions taking `dictionaries`/`rules` as explicit params instead of closure capture, rule loading now goes through the existing `useTransformRules()` hook instead of a second hand-rolled loader.
- `sortRules` (local function in `RulesManager.tsx`) — deleted 2026-08-12 (architecture review candidate #2); replaced by `compareRulePrecedence` exported from `TransformRuleEngine.ts`. It's now the sole owner of rule display/match precedence — also partitions by `matchKind` (suffix rows before prefix) which `sortRules` never did, a real display-order bug the old function had.
- `MatchKindToggle`, `EditableCell`, `NewRuleModal`, `RuleRow` — extracted from `RulesManager.tsx` (were inline, 665 lines total) into their own files under `src/components/rules/`, 2026-08-12 (architecture review candidate #1). `RulesManager.tsx` is now container-only (279 lines): filter state, save orchestration, list assembly.
- `useTranslationExecutionContext`, `UseTranslationExecutionContextParams` (`src/hooks/useReloadExecutionContexts.ts`) — deleted 2026-08-12 (architecture review, candidate #1 grilling). A literal identity function: dev-only shape assertion, then `return params` — interface was exactly the implementation, nothing behind the seam. Its sibling in the same file, `useForceReloadContext`, stayed — it composes real `useCallback` closures and enforces the CRITICAL-3 ordering invariant, genuinely deep. The dev-only guard (`createShapeGuard`, still exported from `useReloadExecutionContexts.ts`) moved into `useAutoTranslateTrigger.ts` itself, called as the first line of `useAutoTranslateTrigger()` against its own `ctx` param — that hook already owns the `TranslationExecutionContext` type being checked, so the runtime check now sits next to its type declaration instead of one hop upstream. `Translator.jsx`'s `executionCtx` is a plain object literal now, not a hook call.
- `useDictionaryConfigManagement`'s raw setters `setShowNewDictionaryModal`/`setNewDictionaryName`/`setRenameValue` — no longer escape the hook, 2026-08-12 (architecture review, candidate #3 grilling). Replaced by named ops `openCreateModal()`/`closeCreateModal()`, `updateDraftName(name)`, `updateRenameValue(value)` — same "no raw setters escape the hook" convention `useEntryEditAndMove` already uses (`src/components/dictionary/CLAUDE.md`). **Real bug fixed alongside it**: the Cancel button's raw `setShowNewDictionaryModal(false)` never cleared `newDictionaryName`, while `handleCreateDictionary`'s success path cleared both — the two close paths had silently drifted from each other, leaving a stale draft name behind after Cancel + reopen. `closeCreateModal()` is now the single close path (used by both the Cancel button and the success handler) and always clears the draft. Regression test: `ConfigurationManager.test.tsx`'s "Cancel clears the draft name" case.
- `EditableTextCell` (local to `RuleMatchesModal.tsx`) — deleted 2026-08-12. **Superseded 2026-08-14**: the dual-mode `edit?` design above was itself split into `EditableCell` (internal `useInlineFieldEdit`, RuleRow's 6 cells) and `ControlledEditableCell` (named export, requires `edit: InlineFieldEdit`, no internal hook — `RuleMatchesModal`'s `MatchRow`) — the dual-mode version always built a second, unused edit-state instance even when a caller supplied its own.
- `useCharacterOnlyBridge.ts`'s `computationRef`/`cancelled` — deleted 2026-08-14 (architecture review candidate #4). Written at construction, never read anywhere including its own test file — the match effect is fully synchronous, so there was no async gap for a cancellation flag to guard. Do not recreate without a genuine async operation to cancel.
- `useDictionaryCRUD.ts`'s `DictionaryCRUDAPI` — 2026-08-14, changed from a hand-duplicated interface to `Pick<DictionaryContextInterface, 'addEntry' | 'updateEntry' | 'deleteEntry' | 'bulkDeleteEntries' | 'moveEntry' | 'bulkMoveEntries'>` (`src/types/DictionaryTypes.ts` is the source of truth). Do not re-declare the 6 method signatures by hand again.
- `AdaptiveChunker.generateOptimizationRecommendations` and the `recommendations`/`priorityOptimizations`/`performanceExpectations` fields it wrote onto `analyzeContentCharacteristics`'s return — deleted 2026-08-16 (architecture review candidate #5 grilling). Computed on every progressive-batch translation but had exactly one reader anywhere: a `batchLog.info` call in `TranslationEngine.js`, itself gated `NODE_ENV !== 'development'`; `calculateOptimalChunkSize` (the function that actually sets batch size) only ever read `.complexity`/`.chunkingStrategy`. `WasmMemoryPoolManager.ts` has an unrelated, live method of the same name — don't confuse the two in a future grep.
- `TextChunker.updatePunctuationConfig`/`.getDiagnosticInfo` and `UnicodePunctuationDetector.updateConfig`/`.getConfig` — deleted 2026-08-16 (architecture review candidate #2 grilling). Zero production callers ever — `TextChunker` is constructed once with static config, never reconfigured at runtime. `getConfig` was independently dead too (every other `.getConfig()` hit in the repo resolves to the unrelated `ParallelConfig.getConfig()` — name collision).
- `precomputeSegments`, `findUnitMatch`, `normalizeText` from `SegmentPrecomputer.ts`, plus its private `MatchResult`/`UnitData` types — deleted 2026-08-17 (architecture review candidate #1). Zero production callers — full-translation path uses `ChunkPostProcessor.reconstructTextWithSegments`/`WordSegmentMatcher.matchWordSegments`, char-only uses `PositionMetadataSegmenter.segmentFromPositionMetadata`. `findUnitMatch`/`normalizeText` were called only from inside `precomputeSegments` itself.
- `HighlightableSegment`'s `onClick: () => void` prop — renamed to `onUnitClick: (unitIndex: number) => void` (2026-08-17, architecture review candidate #2). A fresh `() => onUnitClick(unitIndex)` closure built at the `SegmentedParagraphs.tsx` call site was defeating `React.memo` on every highlight change; the new shape lets the caller pass the already-stable handler straight through. Do not recreate the old `onClick: () => void` signature.
- `TranslationEngine.buildProgressiveClickableSegments`/`_checkOverlapBinarySearch`/`_insertSorted`/`getBatchSemanticArrays`, `progressivePositionTracker.clickableSegments`, `processedBatchCache`/`maxCachedBatches`, and the `progressiveSegments`/`clickableSegments`/`batchSegments`/`cumulativeSegments` fields threaded through `ProgressiveProgressReporter.js` and `Translator.jsx` — deleted 2026-08-17 (architecture review, candidate #2 grilling). Original candidate claimed the streaming (`buildProgressiveClickableSegments`) and finalized (`WordSegmentMatcher.matchWordSegments`) highlighting paths were two matching algorithms that could visibly disagree — traced both to their UI consumers and found the streaming path's entire output was write-only: `Translator.jsx`'s `progressData.progressiveSegments` handler was a comment with no body, `UIResponsiveness.ts`'s real `handleProgress` never destructured the field at all, and `StreamingTranslationDisplay.tsx` renders streaming text as plain unstyled text (`partialSemanticArrays` feeds only a dev-only segment _count_, never a render). No live clickable highlighting exists today — same "write-only, nobody reads" shape as `cacheHitRate`/`ContentAwarePositionCache`. `processedBatchCache` was a second, independent write-only cache found during the same trace (`.set()`/`.delete()`/`.clear()` only, zero `.get()` anywhere) — folded into the same deletion since its only write site was the function being edited anyway. `matchWordSegments`/`WordSegmentMatcher.ts` is untouched — it's the real, sole highlighting-match implementation; nothing was unified because there was never a second live one. `progressivePositionTracker.finalText`/`.runningTextPosition` survive — real, feed live streaming text.
- `ChunkPostProcessor.js`'s `reconstructText`/`reconstructTextWithSegments` each had their own copy of the opening/closing-punctuation-spacing rules — collapsed to one shared private `_computePunctuationSpacing(chunk, index, chunks, content)` (2026-08-17, architecture review candidate #1 grilling). The dead `_containsOnlyOpeningQuotes` var (computed, never read) in `reconstructText`'s copy is gone. **Not unified**: NFC-normalization and segment-building — these are a real, tested, intentional split, not drift. `reconstructText` is the progressive-batch fast path (no NFC-normalize, pinned by `ChunkPostProcessor.test.js`'s "does NOT NFC-normalize" test; no segments — those come once at the end via `matchWordSegments` against the final NFC-normalized text) and `reconstructTextWithSegments` is the single-pass path needing segments inline. Both methods' EXECUTION PATH doc comments previously claimed a char-only/full-translation split — false; grepped real callers, both are full-translation-only, split by progressive-batch vs single-pass. Comments corrected in place.
- `CharacterOnlyBridge.ts`'s `findCharacterOnlyMatch` position-ratio fallback branch (`if (bestScore === -1)`) — deleted 2026-08-17 (architecture review, candidate #3 grilling). `score` is built from strictly non-negative additions (context: 0/2/10, sequential: 0/100), so `bestScore` (init `-1`) is always overwritten on the loop's first iteration — the branch was mathematically unreachable, contradicting its own doc comment. There IS a real (if rare) reachable no-signal case — every candidate ties at `0`, e.g. when `occurrenceInSource >= allMatches.length` (Character-Only panel has fewer/differently-ordered occurrences than Full-Translation/Original) — but today, and after this fix, that case defaults to `allMatches[0]` (first occurrence), not the deleted position-ratio heuristic; making the all-zero-tie case use position-ratio instead was scoped out as a separate product decision, not this candidate's job. The `CharacterOnlyBridge.test.ts` `'position-ratio fallback'` describe block was deleted alongside — its own inline comment admitted the fixture's `sequentialScore` gave `+100` to `match[0]` "anyway," meaning it never actually exercised the fallback branch; it passed by coincidence (both branches picked the same match), not because the code path it claimed to test ran. Sole remaining log branch reworded from `"Best context match: score 0"` (misleading — implies a real match was found) to `"No context or sequential signal — defaulting to first occurrence"` when `bestScore <= 0`.
- `TranslationEngine.translate()` (the non-progressive dispatcher, ~103 lines) — deleted 2026-08-17 (architecture review candidate #2 grilling). Its sole caller was `translateWithSegments`'s `else` branch, taken only when `useProgressive` (`options.progressive && options.onProgress`) was falsy — never true in production (`Translator.jsx`'s one call site hardcodes `progressive: true`). `translateWithSegments` now calls `translateWithProgressiveBatches` unconditionally (the `if/else` and `useProgressive` check are gone). **Do NOT assume `translateWithChunking()`/`translateDirectly()` went with it** — both are still very much alive via a _second_, unrelated call path: `processChunksInParallel()` (called from the live `translateWithProgressiveBatches`) calls `translateDirectly()` directly, and `translateDirectly()` itself recursively calls `translateWithChunking()` as a rare safety net when a single already-chunked piece is still too large (`options.useChunking` falsy check, ~TranslationEngine.js:5959). Tracing this was the whole point of grilling the candidate — the original report assumed all three methods were dead together; only the top-level `translate()` dispatcher actually was. `MEMORY_WASTE_DETECTION`-gated auto-compact logic that lived in the deleted `else` branch is gone too (never ran in production either, since production never took that branch) — `MEMORY_WASTE_DETECTION` import removed from `TranslationEngine.js` as a result; the constant itself still lives in `TranslationConstants.js`, unused elsewhere.
- `mapToPositions` (`src/utils/highlighting/TextPositionMapper.ts`) and `SemanticArrayBuilder.buildPositionMappings`/`PositionMappings` interface — deleted 2026-08-17 (architecture review candidate #3 grilling). Zero production callers on either — confirmed by full-repo grep; `buildPositionMappings`'s only caller was its own definition and `SemanticArrayBuilder.regression.test.js`, `mapToPositions`'s only caller was `buildPositionMappings` and its own direct unit test. Real position-mapping in production today is split across three differently-shaped, separately-tested algorithms this one never fed: `PositionMetadataSegmenter.segmentFromPositionMetadata` (char-only), `precomputeOriginalSegments`'s inline scan (`SegmentPrecomputer.ts`, full-translation original panel), and `WordSegmentMatcher.matchWordSegments` (full-translation, output-position based). Grilled explicitly against the `VocabularyWarmup` "keep a zero-caller export alive because its test coverage is substantive" precedent — rejected as not analogous: `mapToPositions` isn't an unwired-but-ready utility, it's an actively-superseded one (its own doc comment already flagged it lacks the `tokenIndex` tie-break the three live replacements needed, so reviving it would mean rewriting it anyway). Bug history the deleted code encoded, for anyone tracing similar issues in the surviving three algorithms: **CRITICAL-1** — empty unit strings must be skipped when building the first-grapheme candidate index, or the empty string collides at every position. **MEDIUM-2** — first-character lookups for matching must use grapheme-aware extraction (`getFirstGrapheme`, not `str[0]`), or Vietnamese combining diacritics (e.g. `'ở'` as base+combining-mark) split incorrectly. **CRITICAL-5** — an explicit bounds check (`unit.length <= remaining`) must run before the inner char-by-char comparison loop, or a candidate longer than the remaining text can read past the string end. `compareByTokenIndex`/`resolveTokenIndex` — the other two exports of the same file — are untouched and still live (`SegmentPrecomputer.ts`, `WordSegmentMatcher.ts`).

---

## Fallow Dead-Code Analysis

Fallow reports are a starting point, not a deletion list. Four blind spots:

1. **Class dead ≠ file dead.** Fallow tracks `export class Foo` and `export const foo = new Foo()` separately. If only the class is listed dead, the singleton may still have callers — check both before touching the file.

2. **CSS `composes` is invisible.** `composes: X from './shared.module.css'` is a hard dependency fallow never sees. Before deleting any `.module.css`, grep: `composes.*from.*'./filename'` across all CSS files.

3. **Dynamic `import()` calls not tracked.** `import("./SomeFile.js")` lazy imports are invisible to fallow. Before deleting, grep: `import(.*filename` across `src/`.

4. **Test imports count.** Fallow may flag exports used only in `__tests__/` files as dead. Check test files before removing.

4b. **A test-only caller isn't automatically "delete it."** If the test unit-tests real, substantial edge-case logic that only works via direct import, keep the export — a real test surface justifies an interface with zero cross-module callers. Reserve unexport/delete for trivial constants or logic the surviving public function already covers indirectly. (2026-08-08: kept `VocabularyWarmup.js`'s `extractHighFrequencyVocabulary`/`generateCharacterCombinations` exported for this reason; unexported `CharacterOnlyBridge`/`PerformanceMonitor`'s trivial constants safely since their tests lost nothing hardcoding literals instead.)

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
pnpm type-check && pnpm test -- --run  # add --reporter=verbose if backgrounding — default reporter is silent when piped, and a full run legitimately slows down deep in; that's not a hang
pnpm tauri:dev  # catches dynamic import() breakage — type-check/tests miss it
```

---

## Related Guides

- [Architecture Guide](./architecture.md) - System architecture and WASM acceleration
- [Performance Guide](./performance.md) - Performance monitoring and optimization
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
