# Chinese-Vietnamese Translation App

React/Tauri desktop app for translating Chinese novels to Vietnamese. Processes text through 5-phase sequential token consumption (Pattern → Proper Noun → Number → Phrase → Character) with WASM acceleration.

**Performance**: 1000-7500 tokens/sec, 27,000+ dictionary entries loaded in <100ms, WASM accelerates number processing 5-10x and pattern matching 10-50x for 2000+ char texts.

📖 **Full Documentation**: [docs/README.md](docs/README.md)

---

## Quick Start

```bash
npm install
npm run tauri:dev  # WASM build (2-3s) → Vite (100-200ms) → Tauri window
```

**Usage**: Paste Chinese text → Select proper noun dictionary → Translate → Add unknown terms (Cmd/Ctrl-1-5) → Reload (Cmd/Ctrl-R) → Re-translate.

**Code Activity Status**: 4 WASM systems active (number processor, pattern processor, dictionary engine, lookup index) - core engine is JavaScript with targeted WASM acceleration.

---

## System Architecture (Brief)

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

📖 **Details**: [docs/guides/architecture.md](docs/guides/architecture.md#5-phase-translation-pipeline)

### WASM Acceleration

**4 WASM systems actively used:**

1. **WASM Number Processor** - 5-10x speedup for Chinese number conversion
2. **WASM Pattern Processor** - 10-50x speedup for pattern matching (mandatory, no fallback)
3. **WASM Dictionary Engine** - O(k) trie lookups for 27,000+ entries
4. **Rust Lookup Index** - 6-50x speedup for character-only translation

📖 **Details**: [docs/guides/architecture.md](docs/guides/architecture.md#wasm-acceleration)

### Semantic Arrays (Clickable Highlighting)

**Direct position tracking**: Positions stored during `postProcess()` text assembly for bidirectional highlighting.

**Dual-Path Architecture** (CRITICAL for debugging):

- **Character-only mode**: `ClickableTranslationSemantic.tsx` → `SegmentPrecomputer.js`
- **Full Translation mode**: `ClickableTranslationOptimized.tsx` → `TranslationEngine.js`

**Common pitfall**: Assuming one component handles all modes - they're completely separate code paths!

📖 **Details**: [docs/guides/architecture.md](docs/guides/architecture.md#semantic-arrays)

---

## Critical Constraints (What Breaks)

### DO NOT Extract These (Architectural Coupling Required)

**5-Phase Processing Logic**:

- **Why coupled**: Shared token state requires synchronous coordination
- **What breaks**: Extracting phases eliminates conflict resolution between phases
- **Location**: `TranslationEngine.js:translateSinglePass()`

**Dictionary Operations**:

- **Why coupled**: Timing-sensitive cache invalidation depends on phase execution order
- **What breaks**: Separating dictionary lookups causes phase priority violations
- **Location**: `TranslationEngine.js:findAllMatchesWithSemanticCache()`

**Semantic Array Generation**:

- **Why coupled**: Position precision depends on exact post-processing assembly order
- **What breaks**: Extracting position mapping loses synchronization with text assembly
- **Location**: `TranslationEngine.js:postProcess()`, semantic array builders

📖 **Why Extraction Fails**: [docs/archive/refactoring-2026/EXTRACTION_ANALYSIS.md](docs/archive/refactoring-2026/EXTRACTION_ANALYSIS.md)

### DO NOT Modify Dictionaries Without Permission

**Why**: Entries are curated for translation quality, protected by file editing hooks.

**Locations** (Tauri):

- Production: Platform-specific app data directory (macOS: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`)
- Development: Same as production (initialized on first run or via "Open Dictionary Folder" button)
- Source templates: `src/dictionaries/` (copied to app data directory on initialization)
- Proper noun dictionaries: `properNouns-{NovelName}.json`

### DO File Architecture This Way

**Large files are intentional:**

- `TranslationEngine.js` (7,464 lines): 5-phase coordination, WASM sync, memory management
- `Translator.jsx` (1,967 lines): Cross-mode state management, configuration timing, UI coordination

**Why extraction fails**: Breaking 5-phase processing eliminates conflict resolution

**What CAN be extracted** (proven patterns from 2026-01-30 refactoring):

- ✅ Pure utilities: Number conversion, input validation, pattern parsing → `src/utils/`
- ✅ React hooks: AbortController lifecycle, scroll position management → `src/hooks/`
- ✅ Dead code: Functions prefixed with `_` are unused, safe to remove after verification
- ❌ Coordination logic: Dictionary reload (10+ state setters), cache invalidation, mode bridges
- ❌ Functions using `this.*`, `setState`, `engineRef`, or parent component functions

**Gotcha**: If extracting requires passing 10+ parameters, it's coordination logic - keep it in component.

📖 **Extraction Guidelines**: [docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md](docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md)

---

## Common Issues & Quick Fixes

### When Translation Is Wrong

**Step 1**: Click "Reload Dictionary" button (clears cache + reloads dictionaries)

**Step 2**: Verify execution path

```javascript
console.log('🔍 Function called:', { inputLength: text.length });
```

📖 **Full Diagnosis Framework**: [docs/guides/troubleshooting.md](docs/guides/troubleshooting.md#when-translation-is-wrong)

### When Clickable Highlighting Is Wrong

**Step 1**: Identify which mode has the bug

- Character-only (bottom-left panel): Debug `SegmentPrecomputer.js`
- Full Translation (right panel): Debug `TranslationEngine.js:5184-5350`

**Step 2**: Add diagnostic logging to verify segment creation

📖 **Dual-Path Debugging Guide**: [docs/guides/troubleshooting.md](docs/guides/troubleshooting.md#when-clickable-highlighting-is-wrong)

### When Performance Degrades

**Step 1**: Check real memory usage

```javascript
window.checkRealMemory(); // 10-20% = healthy, >30% = actual pressure
```

**Step 2**: Verify segment cleanup

```javascript
window.translationEngine.translationSegments.length; // Expected: ≤35
```

📖 **Performance Diagnosis**: [docs/guides/troubleshooting.md](docs/guides/troubleshooting.md#when-performance-degrades)

---

## Development Guidelines

### Safe Development Zones

**✅ System Extension Pattern** (proven successful):

- Monitoring systems: Performance tracking, memory analysis
- Utility functions: Pure helpers with no state dependencies
- Configuration management: Settings persistence, import/export
- Type contracts: WASM boundary validation

📖 **Full Guidelines**: [docs/guides/development.md](docs/guides/development.md#safe-development-zones)

### Refactoring Gotchas

**Before extracting, check for these red flags:**

- 🚩 **10+ parameters** - It's coordination logic, keep it in component
- 🚩 **Multiple state setters** - Dictionary reload has 10+ setters, can't extract
- 🚩 **Functions prefixed with `_`** - Unused legacy code, verify with grep then remove
- 🚩 **`this.*`, `setState`, refs** - State dependencies prevent extraction
- ✅ **Pure functions, no side effects** - Safe to extract to `src/utils/`
- ✅ **React hooks managing one concern** - Extract to `src/hooks/`
- ✅ **CSS modules** - All module CSS lives in `src/styles/ComponentName.module.css`, not co-located with components

**After extracting Phase 1, reload broke** (2026-01-30): Removed constants still referenced. Always grep for usage before removing infrastructure.

**`HistoryOperation` type divergence — DO NOT swap** (2026-02-12): `LazyDictionaryContext.tsx` uses a snapshot-based `HistoryOperation` (`oldData`/`newData: DictionaryData`). The canonical `src/types/DictionaryTypes.ts` version is delta-based (individual entries). These are architecturally incompatible — `LazyDictionaryContext.tsx` must keep its local definition.

**`DictionaryCache` Rust mutex pattern** (2026-02-12): Always collect needed data while holding the `cache` lock, then `drop(cache)` explicitly before acquiring `access_order`. Nested lock (holding `cache` while locking `access_order`) is a deadlock risk. See `set()` in `dictionary_commands.rs` for the canonical pattern.

**Vitest `vi.doMock` paths for non-existent WASM modules** (2026-02-13): When moving test files, `vi.doMock('path/nonexistent.js', ...)` key is the _attempted_ resolution path from the test file's directory — not a normalized absolute path. For `translation_wasm_core.js` (virtual, doesn't exist on disk), the mock path must resolve to the same directory as the source file's import. Test in `src/test/` uses `'../wasm/translation_wasm_core.js'` (→ `src/wasm/`); test in `src/utils/__tests__/` must use `'../../wasm/translation_wasm_core.js'` (also → `src/wasm/`). Applies to all `vi.doMock`/`vi.mock` calls for non-existent modules.

### Logging Best Practices

**Environment-aware logging** (2026-01-18): Use `logger` utility instead of `console.*`

```typescript
// ✅ NEW: Only logs in development
import { logger } from './utils/logger';
logger.log('Translation started:', text);

// Always shown (warnings/errors important in production)
logger.warn('Dictionary not found:', dictId);
logger.error('Failed to save:', error);
```

📖 **Migration Progress**: [docs/guides/development.md](docs/guides/development.md#logging-best-practices)

### Debugging Strategies

**Critical insight** (2026-02-02): Understanding execution paths is essential before adding debug logs.

**Execution path differences** (Full Translation vs Character-only):

| Aspect                             | Full Translation                             | Character-only      |
| ---------------------------------- | -------------------------------------------- | ------------------- |
| TextChunker                        | WASM (Rust)                                  | JavaScript          |
| Reconstruction                     | `reconstructTextWithSegments()`              | `reconstructText()` |
| When `postProcess()` called        | Only for Chinese content needing translation | Same                |
| Content that skips `postProcess()` | Numbers, Latin text (already in target form) | Same                |

**Debugging strategy that works:**

1. **Start at the output and work backwards** - Don't guess which function processes what
2. **Verify execution path first** - Add logs to confirm which code path is actually running
3. **Check if logs appear** - If logs don't appear, you're in the wrong function
4. **Trace decision points** - Log at if/else branches to understand flow

**Common mistakes:**

- ❌ Adding logs to functions that aren't called for your test case
- ❌ Assuming both modes use the same code path
- ❌ Not checking if WASM vs JavaScript implementation is being used
- ❌ Assuming all content goes through all processing phases

**Example: Numbers don't need translation:**

```javascript
// ❌ WRONG: Adding logs here won't show anything for "23" or "30"
postProcess(translationResult) {
  console.log('Processing:', translationResult);
  // Numbers skip this entirely - they're already in Arabic numerals!
}

// ✅ RIGHT: Add logs at the decision point
if (needsTranslation(content)) {
  console.log('Content needs translation, calling postProcess');
  postProcess(content);
} else {
  console.log('Content already in target form, skipping postProcess');
}
```

📖 **Full Analysis**: [docs/code-review/PUNCTUATION_SPACING_DEBUG_2026-02-02.md](docs/code-review/PUNCTUATION_SPACING_DEBUG_2026-02-02.md)

### Error Handling Patterns

**Production reliability** (January 2025): Comprehensive error handling with user-facing notifications and graceful degradation.

**Key patterns:**

- React async error boundaries with try-catch + toast
- WASM graceful degradation (return empty results, don't throw)
- Initialization error recovery with user-visible UI
- Configuration validation with safe defaults

📖 **All Patterns**: [docs/guides/troubleshooting.md](docs/guides/troubleshooting.md#error-handling-patterns)

### TypeScript Migration Strategy

**Hybrid architecture**: Strategic migration of utilities and UI components while preserving core engine stability.

**Migrated**: Core utilities (~15 files), type definitions (19 `.d.ts` files, 11,000+ lines), UI components

**Intentionally JavaScript (never migrate)**: `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`

📖 **Migration Strategy**: [docs/guides/development.md](docs/guides/development.md#typescript-migration-strategy)

---

## Development Quick Reference

### Keyboard Shortcuts

- **Translator**: Cmd/Ctrl-R (Reload), Cmd/Ctrl-1-5 (Quick Add)
- **Dictionary**: Cmd/Ctrl-L (Focus Search), Click (Edit), Enter (Save), Escape (Cancel)
- **Global**: Cmd/Ctrl-Shift-1-4 (Switch Tabs)

### Essential Commands

```bash
npm run tauri:dev       # Start dev server
npm test                # Run tests
npm run type-check      # TypeScript checking (0 errors expected)
npm run format          # Format all code
npm run tauri:build     # Build production app
cargo check --manifest-path src-tauri/Cargo.toml  # Rust type-check (do NOT use cd + cargo check — zoxide breaks it in Bash tool)
```

📖 **All Commands**: [docs/guides/development.md](docs/guides/development.md#development-commands)

### Key Files

| Purpose           | File                                | Lines | Why Coupled                                                                                            |
| ----------------- | ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| Translation Core  | `TranslationEngine.js`              | 7,464 | 5-phase state coordination                                                                             |
| UI Coordination   | `Translator.jsx`                    | 1,967 | Cross-mode synchronization                                                                             |
| Shared TS types   | `src/types/DictionaryTypes.ts`      | -     | Canonical home for cross-component types (DictionaryEntryValue, EditingEntryData, MoveEntryData, etc.) |
| WASM Number       | `wasm-core/src/number_processor.rs` | -     | Native performance                                                                                     |
| WASM Pattern      | `wasm-core/src/pattern_processor/`  | -     | 10-50x speedup                                                                                         |
| WASM Dictionary   | `wasm-core/src/lib.rs`              | -     | 27,000+ entries                                                                                        |
| Rust Lookup       | `src-tauri/src/lookup_index.rs`     | -     | Backend trie indexing                                                                                  |
| Shared dict utils | `src/utils/dictionaryHelpers.ts`    | -     | `sortDictionaryEntries` shared by DictionaryContext + LazyDictionaryContext                            |

**Extracted Utilities** (2026-01-30, see `docs/code-review/REFACTORING_EXTRACTION_2026-01-30.md`):

- `ChineseNumberConverter.js` (640 lines) - Number processing, 73 tests
- `PatternTemplateEngine.js` (250 lines) - Pattern parsing, 51 tests
- `useTranslationController.js` (221 lines) - AbortController lifecycle, 20 tests
- `TranslationInputValidator.js`, `useScrollPositionManager.js`, `ScrollHelpers.ts` - Various utilities

### Development Debugging Tools

**Access**: Browser console when `NODE_ENV === 'development'`

```javascript
// System performance monitoring
window.systemPerformanceMonitor;
window.performanceDashboard.getHealthReport();

// Engine inspection
window.translationEngine;
window.translationEngine.dictionaryManager.getWasmStatus();

// Memory and cache
window.checkRealMemory();
window.performanceDashboard.checkCachePerformance();
```

📖 **All Tools**: [docs/guides/development.md](docs/guides/development.md#development-debugging-tools)

---

## Testing

**Test Runner**: Vitest with React Testing Library

**Coverage**: 541 tests across 25 files (4,408% increase from baseline)

- Utility functions (245 tests)
- WASM boundaries (57 tests)
- React components (51 tests)
- Error handling (43 tests)
- Security (41 tests)
- Regression tests (30 tests)
- Core systems (34 tests)
- Scalability (13 tests)

```bash
npm test              # Watch mode
npm test -- --run     # Run once (CI)
npm run test:coverage # Coverage report
```

**Test file placement**: Utility tests go in `src/utils/__tests__/`, component tests in `src/components/__tests__/`. Never place `.test.ts` files directly alongside source files in `src/utils/`.

📖 **Testing Details**: [docs/guides/development.md](docs/guides/development.md#testing-infrastructure)

---

## Production Builds

**Critical CSP configuration** for WASM loading:

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "security": {
      "csp": "... script-src 'self' 'wasm-unsafe-eval'; ..."
    }
  }
}
```

**Test production builds before releasing:**

```bash
npm run tauri:build
open "src-tauri/target/release/bundle/macos/Chinese-Vietnamese Translator.app"
```

📖 **Full Requirements**: [docs/guides/development.md](docs/guides/development.md#production-build-requirements)

---

## Documentation Organization

### Where to Create New Documentation

When development requires creating documentation, use this decision tree:

**1. Architecture Decision Records (ADRs)** → `docs/adr/`

- **When**: Making a significant architectural decision or explaining why a design choice was made
- **Format**: `ADR-NNN-short-title.md` (e.g., `ADR-005-cache-invalidation-strategy.md`)
- **Content**: Problem, decision, rationale, consequences, alternatives considered
- **Examples**: "Why we chose X over Y", "Why this coupling is necessary"

**2. Code Reviews** → `docs/code-review/`

- **When**: Documenting a code review, bug fix analysis, or security audit
- **Format**: `TOPIC_YYYY-MM-DD.md` (e.g., `CACHE_RACE_CONDITIONS_2026-01-29.md`)
- **Content**: Issues found, fixes applied, verification steps
- **Examples**: Performance optimization reviews, security fixes, hotfix documentation

**3. Core Guides** → `docs/guides/`

- **When**: Adding to existing guide categories (architecture, development, performance, troubleshooting)
- **Update existing files**: Don't create new guides unless it's a completely new category
- **Content**: Practical "how to" information, diagnostic procedures, best practices

**4. Archive** → `docs/archive/`

- **When**: Documenting completed migrations, historical context, or deprecated approaches
- **Subdirectories**:
  - `migrations/` - Migration guides for major changes
  - `refactoring-2026/` - Refactoring attempts and lessons learned
  - `pattern-optimization/` - Historical optimization work
- **Content**: What was done, why it was changed, lessons learned

**5. Inline Code Comments**

- **When**: Explaining complex logic, warning about pitfalls, documenting critical fixes
- **Format**: Add `CODE REVIEW FIX:` or `CRITICAL FIX:` prefixes for important fixes
- **Examples**: Race condition fixes, mutex handling, security validations

### Documentation Quick Reference

**Don't create standalone docs for**:

- Simple bug fixes (use git commit messages)
- Temporary investigations (use comments in code)
- Individual function documentation (use JSDoc/TSDoc)

**Always document**:

- Architectural decisions (ADRs)
- Security fixes and audits (code reviews)
- Migration procedures (archive)
- Significant refactoring attempts, even if failed (archive)

**Keep updated**:

- `CLAUDE.md` - Overview and critical constraints (update when architecture changes)
- `docs/README.md` - Documentation index (update when adding new docs)
- Core guides - Living documents that evolve with the codebase

---

## Documentation Navigation

- **[Full Documentation Index](docs/README.md)** - Complete documentation map
- **[Architecture Guide](docs/guides/architecture.md)** - System design and WASM
- **[Development Guide](docs/guides/development.md)** - Guidelines, testing, tools
- **[Performance Guide](docs/guides/performance.md)** - Optimization and profiling
- **[Troubleshooting Guide](docs/guides/troubleshooting.md)** - Debugging and fixes
- **[ADRs](docs/adr/)** - Architecture Decision Records
- **[Archive](docs/archive/)** - Historical context and migrations
