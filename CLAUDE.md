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

- **`translationSource` strings written per phase** (must match exactly in any validator — phase names like `'patterns'` are NOT the source strings):
  - Phase 1 Pattern: `'pattern'`, `'hierarchical_pattern'`, `'hierarchical_patterns'`, `'hierarchical_patterns_composite'`
  - Phase 2 Proper noun: dynamic — equals `match.dictionary` (e.g. `'properNouns-MyNovel'`); check membership via `this.activeProperNouns`
  - Phase 3 Number: `'number_conversion'` (WASM), `'number_plus_liang_fix'` (post-process fixup)
  - Phase 4 Phrase: `'phrases'`; Phase 5 Character: `'characters'`
  - `getSourcePriority()` in `translateSinglePass` resolves all of the above to a numeric priority (1–5).
- **Consumed token contract is two-directional**: (A) `*_consumed` source → `translated` must be `null`; (B) non-`_consumed` source → `translated` must NOT be `null`. A leader with `translationSource` set and `translated=null` is silently skipped by `postProcess()`'s `if (token.translationSource) { continue }` — those characters vanish from output with no warning. Both directions are validated by `validateConsumedTokenContract()`.

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
- ✅ **CSS modules** — `src/styles/ComponentName.module.css`, not co-located. For modal overlays, `composes: modalOverlay from './shared.module.css'` then add per-component `background-color`/`padding`. For shared animations, use `:global(@keyframes name) { ... }` in `shared.module.css` — CSS Modules scopes `@keyframes` locally so `composes` does not work for them. **`spin` and `pulse` are global in `index.css`** — do not define local or `:global` duplicates in module files or `shared.module.css`; `animation: spin/pulse` falls back naturally. **`streaming-animations.css` is plain CSS (not a module)** — any `@keyframes` defined there are global; currently defines `progress-pulse` (used by `.streaming-progress-pulse`) and `streaming-blink` (used by `.typing-cursor`) — do not rename them or add new ones.

### Key Gotchas (Critical Short-List)

📖 **Full gotchas reference**: [docs/guides/development.md#gotchas-reference](docs/guides/development.md#gotchas-reference)

Key gotchas — most likely to cause **silent bugs**:

- **`copyWasmTokens` param reversal**: `WasmBoundaryValidation.ts` (prod): param1=JS dest, param2=WASM source. `types/WasmTypes.ts` (tests): param1=WASM source, param2=JS dest. Swapping causes silent data loss.
- **`validateRawDictionaryEntry`**: Renamed from `validateDictionaryEntry` in `configValidation.ts` to avoid collision with same-named fn in `DictionaryTypes.ts` (different signature). DO NOT revert.
- **`HistoryOperation` type**: `LazyDictionaryContext.tsx` uses a local snapshot-based version (`oldData`/`newData`); `DictionaryTypes.ts` is delta-based. Architecturally incompatible — keep local.
- **Rust `.chars().count()` not `.len()`**: `.len()` is byte count; one Chinese char = 3 bytes. Byte comparisons silently mis-rank pattern lengths. **Exception: `String::with_capacity(n)` takes bytes — `.len()` for capacity hints is correct and must NOT be changed to `.chars().count()` (that would under-allocate).** Affects `dictionary_commands.rs`, `lookup_index_engine.rs`, `wasm-core/src/number_processor.rs`, `wasm-core/src/pattern_processor/two_phase.rs:select_best_results()`, `wasm-core/src/pattern_processor/matcher.rs` (lookahead fast-path), `wasm-core/src/lib.rs` (checksum + memory estimate), `wasm-core/src/text_assembly.rs` (positions_array) — keep in sync.
- **Canonical type homes**: `ThrottledStreamingState` → `UITypes.d.ts`. `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `DictionaryTypes.ts`. Do not redeclare locally.
- **`web_sys::console` in wasm-core causes SIGABRT on native tests**: `log_1`/`error_1`/`warn_1` use `#[rustc_nounwind]` FFI — panic aborts the entire test process (not catchable). Any `web_sys::console` call reachable from non-WASM tests MUST be `#[cfg(target_arch = "wasm32")]` gated. `#[cfg(debug_assertions)]` alone is NOT sufficient — debug native test builds satisfy it; use `#[cfg(all(debug_assertions, target_arch = "wasm32"))]` in `Drop` impls. When gating a `pub fn`, also gate its `pub use` in `mod.rs` AND any `#[wasm_bindgen]` wrapper in `lib.rs` or the build breaks. **`js_sys::Date::now()` and all `js_sys::*` also panic on native** — gate with `#[cfg(target_arch = "wasm32")]` + `#[cfg(not(target_arch = "wasm32"))]` fallback (e.g. `let version_id = 0u64;` for timestamps, `let elapsed_ms = 0.0f64;` for timing). All `#[wasm_bindgen]` top-level wrapper fns should be consistently gated when any sibling is (e.g. `enable/disable/reset_matcher_profiling` alongside `print_matcher_profiling_report`). **Inline `#[test]` functions that call WASM-only methods must be `#[cfg(target_arch = "wasm32")]` gated on the entire `fn`** — an ungated test calling a `cfg(wasm32)`-only method blocks ALL `cargo test` compilation for the whole crate (compile errors, not test failures). Example: `test_punctuation_detection` in `text_chunker.rs` called `is_punctuation_separator` (WASM-only) without gating, blocking every other test file from running.
- **`let foo` only referenced in a `#[cfg(target_arch = "wasm32")]` block causes "unused variable" warning on native**: Gate the declaration itself — `#[cfg(target_arch = "wasm32")] let foo = expr;`. Compiler does not suppress the warning just because the only use-site is also cfg-gated. **Also applies after extracting helpers**: if the caller reads `result.field` only inside a `#[cfg(wasm32)]` block, gate that `let field = result.field` at the call site too — otherwise the variable is defined in the helper but unreachable at the call site.
- **`ClickableTranslationOptimized` paragraph logic**: Uses "break on every `\n`" (inline `useMemo`). DO NOT replace with `groupSegmentsIntoParagraphs` — that utility uses Chinese-indentation detection, incompatible with Vietnamese translated text.
- **`validateApiResult`** (was `validateElectronResult`): renamed in `configValidation.ts`. `Translator.jsx` is JS — `type-check` won't catch stale imports there. Always grep `Translator.jsx` after renaming exported functions.
- **`reset_dictionaries` leaves empty dir**: No bundled templates exist. After reset, the dictionaries directory is empty — translation fails until the user re-imports. Never silently succeed; always warn in the response message.
- **`save_dictionary` data must be a JSON object**: `data.as_object().ok_or_else(...)` is the entry-count guard entry point. If `data` is an array or other non-object, the 50K-entry limit is silently bypassed (only the 10MB size check fires). Never relax the `ok_or_else` back to `if let Some`.
- **ZIP-bomb guard must use `.take()`**: `file.size()` from the `zip` crate is attacker-controlled (ZIP central directory header). Use `file.take(MAX_BYTES as u64 + 1).read_to_string(&mut s)` then check `s.len()` for the authoritative size guard.
- **Rust longest-match loops: use `>=` not `>`**: `if sequence.len() >= longest_length` allows multiple same-length patterns to be tried (last successful converter wins). Using `>` silently drops all but the first matching pattern at a given sequence length.
- **React stale dep in effects with event subscriptions**: Never list frequently-updating state or callback props in a `useEffect` dep array that creates a `setInterval` or calls `addEventListener` — it recreates the subscription on every update (listener churn, brief unresponsive windows). Use `const ref = useRef(value); ref.current = value;` and read `ref.current` inside the callback. Applies to: `wasmStatus` interval (Translator.jsx), `canUndo`/`canRedo`/`activeTab` AND all 13 callback props (`onUndo`, `onRedo`, `onTabSwitch`, etc.) in keydown listener (useHotkeyHandler.ts) — dep array is now `[]`. **Also applies to `useCallback` with a mutable state dep**: a `Set` stored in state creates a new reference on every `setState` call → the callback + every downstream callback is recreated on each update. Use `const fooRef = useRef(foo); fooRef.current = foo;` and read via ref; dep array → `[]`. Example: `loadedDictionariesRef` in `LazyDictionaryContext.tsx` — `loadDictionaryImmediate` dep array is `[]`, preventing cascade churn to `schedulePreload` and `handleDictionaryChange`. `schedulePreload` dep array is `[loadDictionaryImmediate]` (not `[loadedDictionaries, loadDictionaryImmediate]`) — reads `loadedDictionariesRef.current` inside `setTimeout` to avoid stale-closure capture of the Set.
- **`detect_hierarchical_composition` requires token range containment before substring check** (`wasm-core/src/pattern_processor/two_phase.rs:479`): Checks whether Phase B's translation string contains Phase A's — but fires falsely on unrelated patterns covering disjoint token spans whenever common Vietnamese words (e.g. `"và"`, `"là"`) collide. Always verify `phase_a.start_index >= phase_b.start_index && phase_a.end_index <= phase_b.end_index` before the `.contains()` check.
- **`process_phase_a` must combine literal-starting AND variable-starting candidates** (`two_phase.rs`): mirrors `process_phase_b` — hoist `variable_patterns` outside the loop, then `candidate_patterns.extend_from_slice(literal_patterns); candidate_patterns.extend_from_slice(variable_patterns);` each iteration. Using fallback-only logic (`if candidates.is_empty() { try variable_patterns }`) silently skips variable-starting Phase A patterns (e.g. `"X的Y"`) at any position where a literal-starting Phase A pattern also exists.
- **Variable-before-variable span resolution: both JS and Rust take the SHORTEST valid span** (`SemanticPatternProcessor.js:testPatternMatch`, `matcher.rs:resolve_variable_with_lookahead`): When resolving variable X and the next pattern token is also a variable Y, do NOT break on the first (longest) cache-hit span — continue iterating so shorter spans overwrite `result`; the final value is the shortest. Taking the longest span greedily exhausts tokens Y needs, causing silent pattern failure. `candidateSpans` is ordered longest→shortest, so "no break on variable" leaves the shortest valid candidate as `validSpan`.
- **`grep` is aliased to `rg` — multiple flags behave differently**: `-E` sets encoding (not extended-regex); `grep -rl FILE` for counting imports also gives unreliable results. Always use the **`Grep` tool** for any code search or import counting.
- **Single trie implementation in `wasm-core`**: `wasm-core/src/trie.rs::TrieNode` is the only trie node — `dictionary_trie.rs` imports and delegates to it. Do NOT add a second `TrieNode` to `dictionary_trie.rs`. `find_matches` / `find_matches_slice` return longest-first; `find_all_matches` / `find_all_matches_slice` return shortest-first.
- **Rust `hash.abs()` panics on `i32::MIN` in debug builds**: Any loop using `wrapping_sub`/`wrapping_add` can produce `i32::MIN`; calling `.abs()` on it panics (overflow) in debug mode and silently wraps in release. Always use `.wrapping_abs()` after wrapping hash arithmetic. Affects `generate_content_hash` in `wasm-core/src/lib.rs`.
- **WASM `translationSource` strings in `two_phase.rs` must match JS `PHASE_PRIORITIES`**: `from_match_result()` in `wasm-core/src/pattern_processor/two_phase.rs` emits `translationSource` strings consumed by `getSourcePriority()` in `TranslationEngine.js`. Valid values: `"hierarchical_pattern"` (Phase A), `"hierarchical_patterns"` (Phase B/default). Any other string returns priority `999` — lower than character fallback — causing silent translation corruption.
- **`semanticArrayBuilder.addUnit` third arg must be a valid `PHASE_PRIORITIES` key**: `getSourcePriority()` returns `999` for any unrecognised string — lower than character fallback (5) — silently demoting the entry in conflict resolution. For JS-side structural patterns (`SemanticPatternProcessor.applyPatternMatch`), use `'pattern'` (singular). `'patterns'` (plural) is NOT a valid key. Phase 3 WASM number path must use `'number_conversion'` (not `'numbers'`). Pass-through NUMBER/LATIN_WORD tokens in `postProcess` must use `'characters'` (not `'passthrough'`). **`validateConsumedTokenContract` detects consumed sources with `.includes('_consumed')`** — this predicate must stay identical to `getSourcePriority`'s check; any divergence silently misclassifies non-standard source strings.
- **`SemanticPatternProcessor` ↔ `TwoPhasePatternProcessor` variable caches must stay in sync**: Both classes have parallel `buildVariableCache` implementations for phrase and proper-noun variables. Changes to phrase type handling, token type filtering (`getSemanticTokens` / `extractSemanticTokens`), or `classifyVariableType` fallbacks in one must be mirrored in the other. Current canonical phrase fallback: `metadata?.semanticType || 'concept'` (NOT `'phrase'`). Current semantic token types: `chinese_char`, `chinese_word`, `latin_word`, `number`.
- **`validatePhasePriority` must use literal priority numbers**: `PHASE_PRIORITIES` keys are `translationSource` strings (`'pattern'`, `'phrases'`, etc.) — not phase-group labels. `PHASE_PRIORITIES.patterns` / `.properNouns` / `.numbers` are all `undefined`. Always call `validatePhasePriority('phaseName', 1|2|3|4|5, tokens)` with a literal number, never `PHASE_PRIORITIES.*`.
- **All config.json writes must use `save_json_file()`**: Never write config files directly via `serde_json::to_string_pretty` + `fs::write`. The `save_json_file` helper enforces `check_json_depth(data, 50)` and the 10MB size cap. Applies to any Tauri command that persists config state **and to new dictionary file creation** (e.g. `create_proper_nouns_dictionary` writing an empty `{}`). **Exception**: `import_dictionaries` writes dictionary files via `fs::write` directly (after ZIP decompression) and must manually enforce all guards in order: type check → entry-count → `check_json_depth(&data, 50)` → size check → write. Missing any one breaks the invariant. **`save_dictionary` also cannot use `save_json_file`** — it must return `DictionaryResponse::ok_with_data(data)` (not `ok()`) and needs "dictionary file"/"Dictionary too large" labels; `save_json_file` hardcodes "Config file"/"Config too large". Inline the same guards in `save_dictionary`: `check_json_depth` → `to_string_pretty` (use `|_|` static error string, never `|e|`) → size check → `fs::write`.
- **`extractErrorMessage` over inline error coercion** (`src/utils/errorHelpers.ts`): Use `extractErrorMessage(error)` instead of `error instanceof Error ? error.message : 'Unknown error'` — the inline form misses `string`, `{ message }`, and `null` inputs. Already imported in `ConfigurationManager.tsx`; add to any file catching `unknown` errors.
- **`isSaveError` guard alongside `isValidationError` in catch blocks** (`src/utils/errors`): If a code path shows a toast then `throw new SaveError(...)`, the outer `catch` must guard with `!isValidationError(error) && !isSaveError(error)` before showing its own toast — otherwise the user sees two toasts. Both are exported from `src/utils/errors`. Pattern is used in `addEntry`/`updateEntry`/`deleteEntry` in `LazyDictionaryContext.tsx`. **Pre-`try` existence checks must throw `ValidationError`, not bare `Error`**: dict-not-found checks before the `try` block that call `toast.error(msg)` then `throw new Error(msg)` bypass the `!isValidationError` guard — the outer catch shows a second "Could not add entry" toast. Always use `throw new ValidationError(msg)` for pre-try existence checks in CRUD functions.
- **`DictionaryContext.tsx` is the eager sibling of `LazyDictionaryContext.tsx`**: fixes to either must be mirrored in the other. Both contexts have `addEntry`/`updateEntry`/`deleteEntry`/`bulkDeleteEntries`/`moveEntry`/`bulkMoveEntries`. **Undo limitation in `LazyDictionaryContext`**: snapshot-based history is single-dict; `moveEntry`/`bulkMoveEntries` undo only restores the source dict (no cross-dict rollback — would require extending `HistoryOperation`). After touching `addEntry`/`updateEntry`/`deleteEntry`/`bulkDeleteEntries`/`addToHistory` in either context, audit the corresponding code for: (1) stale-closure ref-mirrors (`loadedDictionariesRef`, `currentHistoryIndexRef`), (2) typed error throws (`ValidationError`/`SaveError`) including pre-`try` existence checks, (3) dep-array correctness, (4) `isValidationError`/`isSaveError` double-toast guards, (5) metadata coverage (`allowAsPatternVariable`, `lowPriority`, `semanticType`, `allowedVariableTypes` for `phrases|patterns|properNouns-*`), (6) `sanitizeDictionaryEntry` called at the top of `addEntry`/`updateEntry` before validation. **`bulkDeleteEntries` follows the same snapshot-before-updater pattern as other CRUD ops**: compute `oldData`/`sortedDictionary` from the closed-over `dictionaries` snapshot BEFORE `setDictionaries`, do the dict existence check before the `try` block, and pass a pure functional update. **`undo`/`redo` dep arrays: `[history, currentHistoryIndex]`** — not `dictionaries`; move/bulk_move branches and non-move branches both read `dictionariesRef.current` directly. **The audit is bidirectional** — `LazyDictionaryContext.tsx` and `DictionaryContext.tsx` must stay in sync.
- **`buildVariableCache`'s `shouldInclude` type-filter requires `hasUnconstrainedPatterns` guard** (`TwoPhasePatternProcessor.js`): `requiredTypes` collects all types listed in any pattern's `allowedVariableTypes`. Filtering typed cache entries by `requiredTypes` is only correct when ALL patterns are constrained — any unconstrained pattern accepts any variable type, so filtering would silently exclude entries it needs. Guard: `if (!requiredTypes || hasUnconstrainedPatterns) return true;`. Removing this causes unconstrained patterns to silently fail on typed entries the moment ANY other pattern adds `allowedVariableTypes`.
- **`SemanticType` canonical values** (`src/constants/SemanticTypes.ts`): `'character'`, `'location'`, `'organization'`, `'concept'`, `'object'` (short UI labels: CHA/LOC/ORG/CON/OBJ). Dictionary JSON stores these strings directly — a stale value (e.g. old `'person'`/`'place'`) displays no badge and fails filter matching silently. To bulk-migrate dictionary files: `scripts/migrate-semantic-types.py`. **`SEMANTIC_TYPE_ABBREVIATIONS`** (same file) is the canonical export for compact button labels (CHA/LOC/ORG/CON/OBJ); `SEMANTIC_TYPE_LABELS` has full names — use abbreviations for space-constrained UI (e.g. `DictionaryEntry.tsx` semantic type buttons). **`DictionaryEntryValue` and `DictionaryEntryMetadata`** both type `semanticType` as `SemanticType` (not `string`) — in context CRUD handlers, TypeScript doesn't narrow optional property accesses through `&&` spreads; extract to a local variable or use imperative assignment (`if (metadata.semanticType) entry.semanticType = metadata.semanticType`). **`SEMANTIC_TYPE_LIST` and `SEMANTIC_TYPE_ABBREVIATIONS`** are the canonical exports for the inline type-toggle cells in `EnhancedVirtualizedDictionaryTable.tsx` — do NOT redeclare local lists. **`classifyVariableType`** in `SemanticPatternProcessor.js` returns canonical `SemanticType` values when `metadata.semanticType` is set or heuristics fire, but falls back to internal discriminators (`'proper_noun'`, `'character_unit'`, `'unknown'`) that are NOT canonical — `'proper_noun'` is special-cased by `TwoPhasePatternProcessor` to `null` (always include); `'character_unit'` and `'unknown'` fail `allowedVariableTypes` constraints intentionally.
- **Never `throw` inside React state updater functions** (`setState(prev => { throw ... })`): In React 18 Concurrent Mode, updaters may be called multiple times; throws bypass the `await` chain above (not catchable). Do existence checks on the closed-over variable BEFORE `setState`: `if (!dictionaries[id]) { toast.error(...); throw new ValidationError(...); }` then `setDictionaries(prev => { ... })`. (Use `ValidationError` not bare `Error` — see `isSaveError` gotcha above.)
- **Never assign `let` variables inside an updater for use outside it**: `let oldData; setDictionaries(prev => { oldData = prev[id]; ... })` followed by `await save(oldData!)` is broken — updater may run twice, `oldData` reflects whichever run was last. Always compute from the closed-over snapshot BEFORE `setDictionaries`: `const oldData = { ...dictionaries[id] }; setDictionaries(prev => ({ ...prev, [id]: sorted }));`. For undo/redo, use `dictionariesRef.current` directly instead of a hollow "read-and-return-unchanged" updater.
- **Every Tauri command writing to `dictionaries/` must ensure the directory exists first**: `get_dictionary_path` only returns the path — it does not create the directory. Use `get_or_create_dictionary_dir(&app_handle)?` (combines path resolution, `create_dir_all`, and `sanitize_io_error` in one call). New commands that skip this fail with `NotFound` on fresh installs or after `reset_dictionaries`. Never use `get_dictionary_path` + bare `create_dir_all` — you'll miss the error sanitization.
- **All `fs::*` calls in Tauri commands must use `sanitize_io_error`, never `e.to_string()`**: `e.to_string()` on `fs::read_dir`, `fs::copy`, `fs::remove_dir_all`, `fs::write` etc. exposes full OS paths (e.g. `/Users/lhak/Library/Application Support/...`) to the frontend. Use `.map_err(|e| sanitize_io_error(e, "context label"))?` for every I/O operation. Applies to ALL functions in `dictionary_commands.rs` (including non-`#[tauri::command]` helpers). Error strings accumulated into response `Vec<String>` (e.g. `errors.push(format!("...: {}", e))`) are equally frontend-visible and must also use `sanitize_io_error`. The only exception is Tauri API errors (e.g. `app_handle.path().app_data_dir()`) which don't contain filesystem paths. **Also applies to Tauri plugin errors** (e.g. `OpenerExt::open_path`): plugin error `Display` impls may embed the path passed to them — use `.map_err(|_| "static description".to_string())` for any plugin call that receives a filesystem path. **Also applies to `zip::ZipError`**: `ZipError::InvalidArchive`/`UnsupportedArchive` embed filenames from the ZIP central directory header in their `Display`. Use `map_err(|_| "Failed to read ZIP archive: invalid or corrupted format".to_string())` — never `.map_err(|e| e.to_string())` on ZipArchive operations. Affects `export_dictionaries` (start*file/write_all/finish) and `import_dictionaries` (ZipArchive::new) in `dictionary_commands.rs`. **Also in `match` arms**: `archive.by_index(i)` returns `ZipError` — when formatting the error in a `match` arm, never use `e` in the `format!` string. Use a static message: `format!("entry {}: failed to read ZIP entry", i)` (drop `e` entirely, use `*`in the pattern). **Also `serde_json`parse errors**:`serde_json`error`Display`can embed a snippet of the parsed content — use a static message (e.g.`format!("Invalid JSON in dictionary '{}'", id)`) instead of `format!("... {}", e)`for any`serde_json::from_str`/`from_value`error that is user-visible. Affects`load_dictionary`, `load_dictionaries_parallel`, `load_json_file_with_default`, and any future batch-load path in `dictionary_commands.rs`.
- **Cache keys and log identifiers must not embed `file_path.display()`**: `get_cache_key` and similar helpers must use only `dictionary_id` — not the full OS path. Cache keys can be serialized or logged, creating the same path-disclosure risk as `e.to_string()`. `dictionary_id` alone is sufficient since all dictionary files share the same directory.
- **`VirtualRowComponent` is at module scope** (2026-02-18): Defined before `EnhancedVirtualizedDictionaryTable` with props `selectedDictionary`, `onUpdateEntry`, `onSelectEntry`, `onContextMenu`. Do NOT wrap in `useMemo` — any dep change creates a new React component _type_, unmounting all rows and destroying inline edit state (`editingSource`, `tempSource`, etc.).
- **Rust `u64` timestamp subtraction: always use `.saturating_sub()`**: `SystemTime::now()` is not monotonic on macOS — clock-backwards adjustment makes `now - last` underflow as `u64`, panicking in debug or wrapping to a huge number in release (bypasses rate limiters). Use `now_ms.saturating_sub(last_notify)`. Affects `emit_poisoning_event` in `dictionary_commands.rs`.
- **`resolveGlobalConflicts()` and `find_best_pattern_match()` solve different problems — do NOT conflate them**: `find_best_pattern_match()` (Rust `matcher.rs`) selects the best pattern at a **single position** (one call per position during Phase 1). `resolveGlobalConflicts()` is greedy interval scheduling across **all positions at once** (Phase 4 conflict resolution). The real sibling with similar logic is `resolveMatchConflicts()` (~line 2383, Phase 2) — also JS-only. Algorithm changes to `resolveGlobalConflicts()` must be manually mirrored in `resolveMatchConflicts()`. Rust parity validator (test-only, no WASM overhead): `wasm-core/tests/conflict_resolution_parity_test.rs`. JS parity spec: `src/utils/__tests__/TranslationEngine.resolveConflicts.test.js`. **`resolveMatchConflicts` (Phase 2) and `resolveGlobalConflicts` (Phase 4) intentionally invert phrase/pattern priority at equal length** — Phase 2 lets patterns beat regular phrases (conflicts with residual proper-noun overlaps); Phase 4 lets phrases beat patterns (all Phase 1 pattern tokens are already consumed by Phase 4). This is architectural — do NOT harmonize them.
- **WASM singleton modules must call `.initialize().catch(warn)` at module bottom**: Any `src/utils/Wasm*.js` that exports a singleton (e.g. `wasmTextAssembler`, `processNumbersWasm`) must trigger background init at import time so WASM is ready before first call. Pattern: `singleton.initialize().catch((err) => { logger.warn('...', err); });` at end of file. Missing this forces every first caller onto the slow JS fallback path. **Exception — `WasmPatternProcessor.js`**: exports functions, not a singleton, and requires `patternsDict` for full init. Its module-bottom prewarm is a self-calling IIFE that only warms the ES module cache and binary cache via `fetchWasmBinary` — it does NOT call `wasmModule.default()` or create a `WasmPatternProcessor` instance. Do not replace this IIFE with a standard singleton-style init call.
- **`needs_space()` / `needsSpace()` are the canonical postProcess spacing rules**: The 9 spacing rules that determine inter-segment spaces in translated output live in `wasm-core/src/text_assembly.rs::needs_space()` (Rust) and `src/utils/WasmTextAssembler.js::needsSpace()` (JS fallback). Both must stay in sync. Parity spec: `src/utils/__tests__/TranslationEngine.textAssembly.test.js`.
- **Rust parity validators belong in `wasm-core/tests/` as standalone integration test files**: Use when you need to verify a JS algorithm against an independent Rust port without any `#[wasm_bindgen]` export. These files compile only during `cargo test`, add zero production binary weight, and catch divergence immediately. Pattern: `wasm-core/tests/conflict_resolution_parity_test.rs` (greedy interval scheduling), `wasm-core/tests/two_phase_test.rs` (pattern processor).
- **`cleanupFormatting()` has two branches and cannot be migrated to WASM**: Always does 27-char dictionary-lookup punctuation translation first (lines 4886-4923, calls `this.dictionaryManager.translate()`). Then branches: `options.useChunking !== false` → simple spacing fix + early return (chunked mode); `else` → also applies space-after-punctuation rules and colon-quote handling (non-chunked mode). The dictionary loop is the blocking constraint for WASM. Do not duplicate this function's logic elsewhere — it is the single authoritative post-assembly cleanup step in `postProcess()`.
- **`emit_poisoning_event()` is the only valid path for cache-poisoning notifications** (`dictionary_commands.rs`): Never call `app.emit("dictionary-cache-critical-error", ...)` directly — it bypasses the 60-second `NOTIFICATION_COOLDOWN_MS` rate limiter. `emit_poisoning_event()` uses `APP_HANDLE` internally; `check_dictionary_cache_health` therefore takes no `AppHandle` parameter.
- **`lookup_index_engine::TrieNode` (Tauri-side) has `pub fn insert(word, translation, metadata)`**: Use it when building tries from dictionary entries instead of writing manual `for ch in word.chars() { current = current.children.entry(ch)... }` loops. Distinct from `wasm-core/src/trie.rs::TrieNode` which has different fields.
- **`DictionaryCache.invalidate` uses exact-key match** (`dictionary_commands.rs`): `get_cache_key()` returns bare IDs (`"phrases"`, `"properNouns-MyNovel"`). `invalidate(Some(id))` retains `key != id`. Do NOT introduce a colon-separated key format — it would make every targeted invalidation a silent no-op. Tests also use bare ID keys.
- **`LazyDictionaryContext.tsx` `dictionaryTypesRef` ref-mirror**: `const dictionaryTypesRef = useRef(dictionaryTypes); dictionaryTypesRef.current = dictionaryTypes;` declared after `loadedDictionariesRef`. `handleDictionaryChange` reads `Object.keys(dictionaryTypesRef.current)`. Dep array: `[loadDictionaryImmediate, schedulePreload]`. Adding `dictionaryTypes` back to the dep array recreates `handleDictionaryChange` on every `refreshDictionaryTypes()` call.
- **WASM wrapper methods must check `initialize()` return value**: `if (!this.initialized) { const ok = await this.initialize(); if (!ok) return false; }` — skipping `if (!ok)` causes `this.processor.*` to throw a TypeError when `this.processor` is null after a failed init, silently caught and returning false. Applies to every method in `WasmStringProcessor`-style classes.
- **`WasmNumberProcessor` IIFE resolves (not rejects) on failure**: The module-bottom `.catch()` only fires on rejection; the IIFE swallows errors and resolves to `false`. Clearing `initializationPromise` must happen inside the IIFE `catch` block: `initializationPromise = null; retryAllowedAfter = Date.now() + RETRY_COOLDOWN_MS;`. If omitted, `getWasmNumberProcessorStatus()` permanently reports `{ initializing: true }`.
- **`checkSemanticArrayCorruption` in `TranslationEngine.js` uses `corruptionToastShown`**: A translation-scoped `let corruptionToastShown = false` defined before the closure guards `toast.error` to at most once per translation. `isCorrupted` is sticky — once true it stays true across all 5 phase checks. Any new call site that toasts on `isCorrupted` must reuse this flag.
- **Rust `Option<T>` fields in WASM-bridged structs need `#[serde(default)]`**: `serde` maps JSON `null` → `None` but returns an error for _absent_ keys unless `default` is set. JS callers that omit optional fields (not null, but absent) cause `serde_wasm_bindgen::from_value` to fail for the whole batch. Add `#[serde(default)]` (and `#[serde(rename = "...", default)]` for renamed fields) to any `Option<T>` in a struct deserialized from JS.
- **`processChunksInParallel` merge loop (~line 7101) only passes 4 args to `addUnit`**: The loop that merges isolated chunk builders back into the main builder calls `addUnit(original, translated, source, globalTokenIndex)` — any metadata field beyond arg 4 is silently dropped for ALL multi-chunk translations (which is every real translation via the progressive batches path). After adding a new field to `addUnit`, explicitly pass it from `isolatedArrays.metadata?.[j]` in this merge loop or the field will always be its default (-1, null) in the main builder.
- **`SemanticArrayBuilder` and `OptimizedSemanticArrayBuilder` must stay field-synchronized** (`OptimizedSemanticArrayBuilder.ts` is the default production builder — `TranslationEngine.js` line 348): Any field added to `SemanticArrayMetadata` in `SemanticArrayBuilder.ts` must also be added to `OptimizedSemanticMetadata`, initialized to its default in `addUnit()`, and handled in `setPositionByMatch()`. Omitting this makes the field always `-1`/`null` in production while appearing to work with `?optimized-semantics=false`. Example: `originalStart`/`originalEnd` added to `SemanticArrayBuilder` but not `OptimizedSemanticArrayBuilder` — all related highlighting fixes were silently inert in production until both were synced. **Also applies to method algorithms**: `updateWithCapitalizedText` must use the same fast-path + `indexOf` algorithm in both builders (NOT regex-based in Optimized). When changing this method in either, mirror in the other.
- **`buildSegmentsFromPositions` in `SegmentPrecomputer.ts` fires only when ALL `metadata[].originalStart >= 0`**: Since the parallel merge loop drops `originalStart`, this path never activates for multi-chunk translations — only for single-chunk (short) texts. Making it fire for long texts by fixing the merge loop can trigger "no highlighting" regression if the path has latent bugs, which is worse than the original wrong-instance-highlighting issue. Test both short and long texts separately before enabling this path.
- **`token.start` from WASM tokenizer is a byte offset, not a char offset**: Chinese chars are 3 bytes each, making `token.start` ~3× too large for char-position arithmetic. In `postProcess`, use cumulative `tokenCharPositions` instead: `tokenCharPositions[i] = sum of tokens[0..i-1].value.length`. This is the existing pattern at the top of `postProcess` (~line 4480).
- **`getSemanticTokens` requires `TextToken[]`, not a string — `getSemanticTokens(chunk.content)` silently returns `[]`**: `chunk.content` is a string; `getSemanticTokens` expects a `TextToken[]`. When called with a string, every character fails the `.type === TokenType.*` check → returns `[]` → `chunkTokenCount = 0` for every chunk → all `chunkTokenOffsets` equal `batchStart` → `addUnit` token indices are local-only (not global). This makes same-translated-text disambiguation in the word segment builder sort meaningless — e.g., 不(tokenIndex=0, first token in its chunk) sorts before 没(tokenIndex=5) → 不 claims the earlier Vietnamese position instead of 没. Fix: always call `this.tokenizer.tokenize(chunk.content).length` (raw token count) for chunk offset arithmetic. Affected locations: `processChunksInParallel` (~line 5405), `translateWithProgressiveBatches` (~line 6172), `translateWithChunking` parallel merge loop (~line 7084), `translateWithChunking` sequential loop (~line 7140).
- **`precomputeOriginalSegments` firstCharIndex must be sorted by tokenIndex** (`SegmentPrecomputer.ts:~724`): After building `firstCharIndex`, sort each candidate list by `tokenIndex` ascending: `for (const indices of firstCharIndex.values()) { indices.sort((a,b) => (metadata[a]?.tokenIndex??0)-(metadata[b]?.tokenIndex??0)); }`. Without this, parallel-chunk scrambling assigns the wrong `unitIndex` to duplicate characters in the Original Chinese panel (entries from later chunks land at lower array indices and get consumed first by the greedy scan).
- **Duplicate-word highlighting requires tokenIndex ordering in THREE places** (all same root cause — `processChunksInParallel` scrambles semantic array indices): (1) Full Translation word-level builder (`TranslationEngine.js` ~6644): sort `candidateWords` by `tokenIndex` ascending for same-length ties; (2) Full Translation→Char-only bridge (`Translator.jsx` ~1127): count `occurrenceInFullTranslation` using `metadata[i].tokenIndex < clickedTokenIndex`, not `i < activeIndex`; (3) Original Chinese panel (`SegmentPrecomputer.ts` ~724): `firstCharIndex` candidate lists sorted by `tokenIndex`. Any new greedy scan or occurrence counter over the semantic array must use `tokenIndex` order.

#### `// @ts-check` Coverage (14 files, src/utils/ + src/reducers/)

Active on: `wasmBinaryCache.js`, `PositionValidationHelpers.js`, `WasmTextAssembler.js`, `WasmRegexUtils.js`, `FallbackManager.js`, `WasmDictionaryTrie.js`, `WasmRetryManager.js`, `WasmTextChunker.js`, `WasmTextTokenizer.js`, `WasmStringProcessor.js`, `wasmOperationTimeout.js`, `WasmNumberProcessor.js`, `DictionaryTrieLoader.js`, `highlightingReducer.js`. Do NOT remove without understanding that these were explicitly fixed to pass 0 errors.

17 other utils were assessed and deferred — they have 7–69 errors each from insufficient JSDoc typedef coverage (objects typed as `{Object}` with property accesses, implicit-any params, untyped catch bindings). Add `// @ts-check` to them only after fixing their JSDoc.

**JSDoc patterns required for `// @ts-check` compatibility:**

- `@returns {Array}` → must be `@returns {Array<*>}` (TypeScript requires generic arg)
- Catch bindings: `} catch (/** @type {any} */ error) {` — bare `catch (error)` gives `error is unknown`
- `window.customProp = x` — needs `// @ts-ignore` above; property not on Window type
- `@param {Object} options` with sub-property `@param {string} options.X` — TS requires leading `{object}` (lowercase) for sub-property style; use inline type `@param {{ x: string }} [options]` and remove sub-property lines
- `constructor(options = {})` where type has required props → TS2739; add `// @ts-ignore` above constructor
- Module-level `let x = null` → add `/** @type {Function|null} */` above; TypeScript can't infer eventual type from `null`
- `return async function (...args)` with `this` usage inside → two `// @ts-ignore` needed: one above the `return async function` line (rest param TS7019), one inside above the `this` call (TS2683)
- `Object`-typed return used with property access → inline cast: `const typed = /** @type {{ prop: type }} */ (result)`

#### Deleted symbols — do not recreate

- Table components: `DictionaryTable.tsx`/`VirtualizedDictionaryTable.tsx` → use `EnhancedVirtualizedDictionaryTable` instead.
- `LegacySystemFlags.js` deleted — `getLegacySystemStatus`, `checkRollbackTriggers`, `initializePerformanceBaselines`, `updatePerformanceBaselines` no longer exist; sequential and legacy-pattern fallbacks are permanently removed.
- `createReadonlyTokens` removed from `ReadonlyOptimizationUtils.js` — only `scanTokens` exported. Was a no-op identity function.
- `OptimizedSemanticArrayBuilder.getCachedRegex` / `regexCache` / `maxCacheSize` removed — `updateWithCapitalizedText` now uses fast-path + `indexOf`. Tests calling `getCachedRegex` must be deleted.
- `V8OptimizationUtils.js` moved to `src/utils/__benchmarks__/V8OptimizationUtils.js` (was `src/utils/`).
- All other deleted symbols (WASM mappers/helpers/workers/converters) had zero importers — 📖 [Full list](docs/guides/development.md#deleted-symbols)

### Essential Commands

```bash
npm run tauri:dev       # Start dev server
npm test                # Run tests (watch mode)
npm test -- --run       # Run once (CI)
npm run type-check      # TypeScript checking (0 errors expected)
npm run format          # Format all code
cargo check --manifest-path src-tauri/Cargo.toml  # Rust type-check (NOT cd + cargo — zoxide breaks it)
cargo check --manifest-path wasm-core/Cargo.toml   # WASM core (separate crate, run both when touching Rust)
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1  # Run wasm-core tests (94 unit + 40 integration = 134 total)
```

### Key Files

| Purpose               | File                                        | Notes                                                                                                                                                                     |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Translation Core      | `TranslationEngine.js`                      | 5-phase state coordination                                                                                                                                                |
| UI Coordination       | `Translator.jsx`                            | Cross-mode synchronization                                                                                                                                                |
| Shared TS types       | `src/types/DictionaryTypes.ts`              | Canonical dict/entry/metadata types                                                                                                                                       |
| Shared dict utils     | `src/utils/dictionaryHelpers.ts`            | `sortDictionaryEntries`, labels, ordering                                                                                                                                 |
| WASM boundary (prod)  | `src/utils/WasmBoundaryValidation.ts`       | `copyWasmTokens` param1=JS dest, param2=WASM src                                                                                                                          |
| WASM boundary (tests) | `types/WasmTypes.ts` (root-level)           | `copyWasmTokens` param1=WASM src, param2=JS dest                                                                                                                          |
| Shared UI types       | `src/types/UITypes.d.ts`                    | `ThrottledStreamingState` and other UI types                                                                                                                              |
| Keyboard shortcuts    | `src/hooks/useHotkeyHandler.ts`             | Logic lives here; `HotkeyHandler.tsx` is a thin wrapper                                                                                                                   |
| Dict persistence      | `src/hooks/usePersistSelectedDictionary.ts` | Shared hook used by both `DictionaryContext.tsx` and `LazyDictionaryContext.tsx`; includes `isMounted` guard                                                              |
| WASM text assembly    | `src/utils/WasmTextAssembler.js`            | Wraps `text_assembly.rs::TextAssembler`; `assembleWithSpacing()` powers postProcess() Step 2; spacing rules live in `needs_space()` (Rust) + `needsSpace()` (JS fallback) |

**Intentionally JavaScript (never migrate)**: `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`

---

## Testing

**Runner**: Vitest + React Testing Library. **1,211 tests, 50 files** (+ 94 Rust). Run: `npm test -- --run`.

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
- **[GUI Framework Evaluation](docs/GUI_FRAMEWORK_EVALUATION_2026.md)** — Tauri vs. iced/egui/gpui/Dioxus; verdict: stay on Tauri
- **[WASM Migration Code Review](docs/WASM_MIGRATION_CODE_REVIEW_2026.md)** — Pure computation candidates for wasm-core migration
