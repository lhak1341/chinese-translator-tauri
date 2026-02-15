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

---

## System Architecture (Brief)

### 5-Phase Translation Pipeline (IMMUTABLE)

1. **Pattern Processing** (Phase 1): Structural patterns with variables (例: "在XY中" → "ở trong X Y")
2. **Proper Noun Processing** (Phase 2): Novel-specific terms from proper noun dictionaries
3. **Number Processing** (Phase 3): Chinese numbers (百分之十五 → 15%, 三千十五 → 3,015)
4. **Phrase Processing** (Phase 4): Common phrases (不知道 → không biết)
5. **Character Processing** (Phase 5): Character dictionary fallback

Each phase consumes tokens (`translated: null, translationSource: "X_consumed"`); later phases only process unconsumed tokens. Changing order breaks conflict resolution.

📖 **Details**: [docs/guides/architecture.md](docs/guides/architecture.md#5-phase-translation-pipeline)

### Dual-Path Architecture (CRITICAL for debugging)

- **Character-only mode**: `ClickableTranslationSemantic.tsx` → `SegmentPrecomputer.js`
- **Full Translation mode**: `ClickableTranslationOptimized.tsx` → `TranslationEngine.js`

**These are completely separate code paths.** Semantic array positions are stored during `postProcess()` assembly. Debug the right path.

📖 **Details**: [docs/guides/architecture.md](docs/guides/architecture.md)

---

## Critical Constraints (What Breaks)

### DO NOT Extract These (Architectural Coupling Required)

**5-Phase Processing Logic** (`TranslationEngine.js:translateSinglePass()`): Shared token state requires synchronous coordination. Extracting phases eliminates conflict resolution between phases.

**Dictionary Operations** (`TranslationEngine.js:findAllMatchesWithSemanticCache()`): Cache invalidation is timing-sensitive. Separating lookups causes phase priority violations.

**Semantic Array Generation** (`TranslationEngine.js:postProcess()`): Position precision depends on exact post-processing assembly order. Extracting loses synchronization with text assembly.

📖 **Why Extraction Fails**: [docs/archive/refactoring-2026/EXTRACTION_ANALYSIS.md](docs/archive/refactoring-2026/EXTRACTION_ANALYSIS.md)

### DO NOT Modify Dictionaries Without Permission

Entries are curated for translation quality, protected by file editing hooks.

- Production: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`
- Source templates: `src/dictionaries/` (copied to app data on init)
- Proper noun dictionaries: `properNouns-{NovelName}.json`

### DO File Architecture This Way

**Large files are intentional:**

- `TranslationEngine.js` (7,464 lines): 5-phase coordination, WASM sync, memory management
- `Translator.jsx` (1,967 lines): Cross-mode state management, configuration timing

**What CAN be extracted**: Pure utilities → `src/utils/`. React hooks (one concern) → `src/hooks/`. Dead code (functions prefixed `_`, verify with grep).

**What CANNOT**: Coordination logic using `this.*`, `setState`, refs, or requiring 10+ parameters.

📖 **Extraction Guidelines**: [docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md](docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md)

---

## Common Issues

**Translation wrong**: Reload Dictionary button first (clears cache + reloads dicts). 📖 [troubleshooting.md](docs/guides/troubleshooting.md#when-translation-is-wrong)

**Highlighting wrong**: Character-only → debug `SegmentPrecomputer.js`. Full Translation → debug `TranslationEngine.js:5184-5350`. 📖 [troubleshooting.md](docs/guides/troubleshooting.md#when-clickable-highlighting-is-wrong)

**Performance degraded**: `window.checkRealMemory()` (10-20% healthy, >30% pressure). `window.translationEngine.translationSegments.length` (≤35 expected). 📖 [troubleshooting.md](docs/guides/troubleshooting.md#when-performance-degrades)

---

## Development Guidelines

### Refactoring Red Flags

- 🚩 **10+ parameters** — coordination logic, keep in component
- 🚩 **Multiple state setters** — coordination logic (dictionary reload has 10+)
- 🚩 **`this.*`, `setState`, refs** — state dependency, can't extract
- 🚩 **Functions prefixed `_`** — likely dead code, verify with grep before removing
- ✅ **Pure functions, no side effects** — extract to `src/utils/`
- ✅ **React hooks, one concern** — extract to `src/hooks/`
- ✅ **CSS modules** — `src/styles/ComponentName.module.css`, not co-located

### Key Gotchas (Critical Short-List)

📖 **Full gotchas reference**: [docs/guides/development.md#gotchas-reference](docs/guides/development.md#gotchas-reference)

The five most likely to cause **silent bugs**:

- **`copyWasmTokens` param reversal**: `WasmBoundaryValidation.ts` (prod): param1=JS dest, param2=WASM source. `types/WasmTypes.ts` (tests): param1=WASM source, param2=JS dest. Swapping causes silent data loss.
- **`validateRawDictionaryEntry`**: Renamed from `validateDictionaryEntry` in `configValidation.ts` to avoid collision with same-named fn in `DictionaryTypes.ts` (different signature). DO NOT revert.
- **`HistoryOperation` type**: `LazyDictionaryContext.tsx` uses a local snapshot-based version (`oldData`/`newData`); `DictionaryTypes.ts` is delta-based. Architecturally incompatible — keep local.
- **Rust `.chars().count()` not `.len()`**: `.len()` is byte count; one Chinese char = 3 bytes. Byte comparisons silently mis-rank pattern lengths. Affects `dictionary_commands.rs`, `lookup_index_engine.rs`, `wasm-core/src/number_processor.rs`, AND `wasm-core/src/pattern_processor/two_phase.rs:select_best_results()` — keep in sync.
- **Canonical type homes**: `ThrottledStreamingState` → `UITypes.d.ts`. `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `DictionaryTypes.ts`. Do not redeclare locally.
- **`web_sys::console` in wasm-core causes SIGABRT on native tests**: `log_1`/`error_1`/`warn_1` use `#[rustc_nounwind]` FFI — panic aborts the entire test process (not catchable). Any `web_sys::console` call reachable from non-WASM tests MUST be `#[cfg(target_arch = "wasm32")]` gated. `#[cfg(debug_assertions)]` alone is NOT sufficient — debug native test builds satisfy it; use `#[cfg(all(debug_assertions, target_arch = "wasm32"))]` in `Drop` impls. When gating a `pub fn`, also gate its `pub use` in `mod.rs` AND any `#[wasm_bindgen]` wrapper in `lib.rs` or the build breaks.
- **`PatternMatchResult::success()` sets `pattern: None`**: The struct stores `pattern_id` (the `original_pattern` string) instead of cloning the full pattern. Tests must use `result.pattern_id.as_deref().unwrap()`, not `result.pattern.as_ref().unwrap()`.
- **`ClickableTranslationOptimized` paragraph logic**: Uses "break on every `\n`" (inline `useMemo`). DO NOT replace with `groupSegmentsIntoParagraphs` — that utility uses Chinese-indentation detection, incompatible with Vietnamese translated text.
- **`validateApiResult`** (was `validateElectronResult`): renamed in `configValidation.ts`. `Translator.jsx` is JS — `type-check` won't catch stale imports there. Always grep `Translator.jsx` after renaming exported functions.
- **`reset_dictionaries` leaves empty dir**: No bundled templates exist. After reset, the dictionaries directory is empty — translation fails until the user re-imports. Never silently succeed; always warn in the response message.
- **`save_dictionary` data must be a JSON object**: `data.as_object().ok_or_else(...)` is the entry-count guard entry point. If `data` is an array or other non-object, the 50K-entry limit is silently bypassed (only the 10MB size check fires). Never relax the `ok_or_else` back to `if let Some`.
- **ZIP-bomb guard must use `.take()`**: `file.size()` from the `zip` crate is attacker-controlled (ZIP central directory header). Use `file.take(MAX_BYTES as u64 + 1).read_to_string(&mut s)` then check `s.len()` for the authoritative size guard.
- **Rust longest-match loops: use `>=` not `>`**: `if sequence.len() >= longest_length` allows multiple same-length patterns to be tried (last successful converter wins). Using `>` silently drops all but the first matching pattern at a given sequence length.
- **React stale dep in effects with event subscriptions**: Never list frequently-updating state in a `useEffect` dep array that creates a `setInterval` or calls `addEventListener` — it recreates the subscription on every update (listener churn, brief unresponsive windows). Use `const ref = useRef(state); ref.current = state;` and read `ref.current` inside the callback. Applies to: `wasmStatus` interval (Translator.jsx), `canUndo`/`canRedo`/`activeTab` keydown listener (useHotkeyHandler.ts).
- **`DictionaryTable.tsx` / `VirtualizedDictionaryTable.tsx` are deleted** (2026-02-15): Only `EnhancedVirtualizedDictionaryTable` is the active table component. Do not recreate the deleted files.
- **`WasmPositionMapper` is an incomplete feature** (2026-02-15): Initialized in `App.jsx`, but never instantiated in any production code path. Dead import removed from `SemanticArrayBuilder.ts`. Do not assume WASM position mapping is active; do not add new call sites without intentionally building out the feature.
- **`grep -E` fails in this shell**: `grep` is aliased to `rg`; `-E` means encoding to rg (not extended regex), so `grep -E "foo|bar"` in Bash pipes errors silently. Use the `Grep` tool or chain single-pattern greps instead.
- **Single trie implementation in `wasm-core`**: `wasm-core/src/trie.rs::TrieNode` is the only trie node — `dictionary_trie.rs` imports and delegates to it. Do NOT add a second `TrieNode` to `dictionary_trie.rs`. `find_matches` / `find_matches_slice` return longest-first; `find_all_matches` / `find_all_matches_slice` return shortest-first.

### Essential Commands

```bash
npm run tauri:dev       # Start dev server
npm test                # Run tests (watch mode)
npm test -- --run       # Run once (CI)
npm run type-check      # TypeScript checking (0 errors expected)
npm run format          # Format all code
cargo check --manifest-path src-tauri/Cargo.toml  # Rust type-check (NOT cd + cargo — zoxide breaks it)
cargo check --manifest-path wasm-core/Cargo.toml   # WASM core (separate crate, run both when touching Rust)
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1  # Run wasm-core tests (98 tests)
```

### Key Files

| Purpose               | File                                  | Notes                                                   |
| --------------------- | ------------------------------------- | ------------------------------------------------------- |
| Translation Core      | `TranslationEngine.js`                | 5-phase state coordination                              |
| UI Coordination       | `Translator.jsx`                      | Cross-mode synchronization                              |
| Shared TS types       | `src/types/DictionaryTypes.ts`        | Canonical dict/entry/metadata types                     |
| Shared dict utils     | `src/utils/dictionaryHelpers.ts`      | `sortDictionaryEntries`, labels, ordering               |
| WASM boundary (prod)  | `src/utils/WasmBoundaryValidation.ts` | `copyWasmTokens` param1=JS dest, param2=WASM src        |
| WASM boundary (tests) | `types/WasmTypes.ts` (root-level)     | `copyWasmTokens` param1=WASM src, param2=JS dest        |
| Shared UI types       | `src/types/UITypes.d.ts`              | `ThrottledStreamingState` and other UI types            |
| Keyboard shortcuts    | `src/hooks/useHotkeyHandler.ts`       | Logic lives here; `HotkeyHandler.tsx` is a thin wrapper |

**Intentionally JavaScript (never migrate)**: `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`

---

## Testing

**Runner**: Vitest + React Testing Library. **1,267 tests, 51 files** (+ 21 Rust). Run: `npm test -- --run`.

**File placement**: Utility tests → `src/utils/__tests__/`. Component tests → `src/components/__tests__/`. Never alongside source files in `src/utils/`.

**`src/test/setup.ts` MUST stay**: Referenced by `vitest.config.ts:10`. The duplicate test files in `src/test/` were removed (stale); `setup.ts` was not.

**Critical import gotchas**:

- `AppConfiguration`: import from `src/types/ComponentTypes`, NOT `configValidation`
- `getDictionaryLabel`/`compareDictionaryOrder`: import from `dictionaryHelpers` directly (re-export through `DuplicateAnalyzer` removed)
- `vi.doMock` for `translation_wasm_core.js`: path resolves from the _source_ file's directory, not the test file's

📖 **Full testing gotchas**: [docs/guides/development.md#testing-gotchas](docs/guides/development.md#testing-gotchas)

---

## Documentation Navigation

- **[Full Documentation Index](docs/README.md)**
- **[Architecture Guide](docs/guides/architecture.md)** — System design, WASM, semantic arrays
- **[Development Guide](docs/guides/development.md)** — Guidelines, gotchas reference, commands, testing
- **[Troubleshooting Guide](docs/guides/troubleshooting.md)** — Debugging and fixes
- **[Performance Guide](docs/guides/performance.md)** — Optimization and profiling
- **[ADRs](docs/adr/)** · **[Archive](docs/archive/)**
