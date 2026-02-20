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
- ✅ **CSS modules** — `src/styles/ComponentName.module.css`, not co-located. For modal overlays, `composes: modalOverlay from './shared.module.css'` then add per-component `background-color`/`padding` — do not copy-paste the base `position: fixed; top/left/right/bottom: 0; display: flex` block. For shared animations, use `:global(@keyframes name) { ... }` in `shared.module.css` — CSS Modules scopes `@keyframes` locally by default so `composes` does not work for them; `:global` keyframe names are referenced directly in consumers' `animation:` properties without a local `@keyframes` block. **Exception for `spin` and `pulse`**: `index.css` already defines these as global `@keyframes`. When a module CSS file has an identical local duplicate, just remove it — `animation: spin/pulse` falls back to the global naturally. Do NOT add `:global(@keyframes spin/pulse)` to `shared.module.css`; that creates a second global definition and risks collision with `streaming-animations.css`'s distinct transform-scale `pulse` (which is itself unused by any class in that file).

### Key Gotchas (Critical Short-List)

📖 **Full gotchas reference**: [docs/guides/development.md#gotchas-reference](docs/guides/development.md#gotchas-reference)

The five most likely to cause **silent bugs**:

- **`copyWasmTokens` param reversal**: `WasmBoundaryValidation.ts` (prod): param1=JS dest, param2=WASM source. `types/WasmTypes.ts` (tests): param1=WASM source, param2=JS dest. Swapping causes silent data loss.
- **`validateRawDictionaryEntry`**: Renamed from `validateDictionaryEntry` in `configValidation.ts` to avoid collision with same-named fn in `DictionaryTypes.ts` (different signature). DO NOT revert.
- **`HistoryOperation` type**: `LazyDictionaryContext.tsx` uses a local snapshot-based version (`oldData`/`newData`); `DictionaryTypes.ts` is delta-based. Architecturally incompatible — keep local.
- **Rust `.chars().count()` not `.len()`**: `.len()` is byte count; one Chinese char = 3 bytes. Byte comparisons silently mis-rank pattern lengths. **Exception: `String::with_capacity(n)` takes bytes — `.len()` for capacity hints is correct and must NOT be changed to `.chars().count()` (that would under-allocate).** Affects `dictionary_commands.rs`, `lookup_index_engine.rs`, `wasm-core/src/number_processor.rs`, `wasm-core/src/pattern_processor/two_phase.rs:select_best_results()`, `wasm-core/src/pattern_processor/matcher.rs` (lookahead fast-path), `wasm-core/src/lib.rs` (checksum + memory estimate), `wasm-core/src/text_assembly.rs` (positions_array) — keep in sync.
- **Canonical type homes**: `ThrottledStreamingState` → `UITypes.d.ts`. `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `DictionaryTypes.ts`. Do not redeclare locally.
- **`web_sys::console` in wasm-core causes SIGABRT on native tests**: `log_1`/`error_1`/`warn_1` use `#[rustc_nounwind]` FFI — panic aborts the entire test process (not catchable). Any `web_sys::console` call reachable from non-WASM tests MUST be `#[cfg(target_arch = "wasm32")]` gated. `#[cfg(debug_assertions)]` alone is NOT sufficient — debug native test builds satisfy it; use `#[cfg(all(debug_assertions, target_arch = "wasm32"))]` in `Drop` impls. When gating a `pub fn`, also gate its `pub use` in `mod.rs` AND any `#[wasm_bindgen]` wrapper in `lib.rs` or the build breaks. **`js_sys::Date::now()` and all `js_sys::*` also panic on native** — gate with `#[cfg(target_arch = "wasm32")]` + `#[cfg(not(target_arch = "wasm32"))]` fallback (e.g. `let version_id = 0u64;` for timestamps, `let elapsed_ms = 0.0f64;` for timing). All `#[wasm_bindgen]` top-level wrapper fns should be consistently gated when any sibling is (e.g. `enable/disable/reset_matcher_profiling` alongside `print_matcher_profiling_report`).
- **`let foo` only referenced in a `#[cfg(target_arch = "wasm32")]` block causes "unused variable" warning on native**: Gate the declaration itself — `#[cfg(target_arch = "wasm32")] let foo = expr;`. Compiler does not suppress the warning just because the only use-site is also cfg-gated. **Also applies after extracting helpers**: if the caller reads `result.field` only inside a `#[cfg(wasm32)]` block, gate that `let field = result.field` at the call site too — otherwise the variable is defined in the helper but unreachable at the call site.
- **`PatternMatchResult::success()` sets `pattern: None`**: The struct stores `pattern_id` (the `original_pattern` string) instead of cloning the full pattern. Tests must use `result.pattern_id.as_deref().unwrap()`, not `result.pattern.as_ref().unwrap()`.
- **`ClickableTranslationOptimized` paragraph logic**: Uses "break on every `\n`" (inline `useMemo`). DO NOT replace with `groupSegmentsIntoParagraphs` — that utility uses Chinese-indentation detection, incompatible with Vietnamese translated text.
- **`validateApiResult`** (was `validateElectronResult`): renamed in `configValidation.ts`. `Translator.jsx` is JS — `type-check` won't catch stale imports there. Always grep `Translator.jsx` after renaming exported functions.
- **`reset_dictionaries` leaves empty dir**: No bundled templates exist. After reset, the dictionaries directory is empty — translation fails until the user re-imports. Never silently succeed; always warn in the response message.
- **`save_dictionary` data must be a JSON object**: `data.as_object().ok_or_else(...)` is the entry-count guard entry point. If `data` is an array or other non-object, the 50K-entry limit is silently bypassed (only the 10MB size check fires). Never relax the `ok_or_else` back to `if let Some`.
- **ZIP-bomb guard must use `.take()`**: `file.size()` from the `zip` crate is attacker-controlled (ZIP central directory header). Use `file.take(MAX_BYTES as u64 + 1).read_to_string(&mut s)` then check `s.len()` for the authoritative size guard.
- **Rust longest-match loops: use `>=` not `>`**: `if sequence.len() >= longest_length` allows multiple same-length patterns to be tried (last successful converter wins). Using `>` silently drops all but the first matching pattern at a given sequence length.
- **React stale dep in effects with event subscriptions**: Never list frequently-updating state or callback props in a `useEffect` dep array that creates a `setInterval` or calls `addEventListener` — it recreates the subscription on every update (listener churn, brief unresponsive windows). Use `const ref = useRef(value); ref.current = value;` and read `ref.current` inside the callback. Applies to: `wasmStatus` interval (Translator.jsx), `canUndo`/`canRedo`/`activeTab` AND all 13 callback props (`onUndo`, `onRedo`, `onTabSwitch`, etc.) in keydown listener (useHotkeyHandler.ts) — dep array is now `[]`. **Also applies to `useCallback` with a mutable state dep**: a `Set` stored in state creates a new reference on every `setState` call → the callback + every downstream callback is recreated on each update. Use `const fooRef = useRef(foo); fooRef.current = foo;` and read via ref; dep array → `[]`. Example: `loadedDictionariesRef` in `LazyDictionaryContext.tsx` — `loadDictionaryImmediate` dep array is `[]`, preventing cascade churn to `schedulePreload` and `handleDictionaryChange`. `schedulePreload` dep array is `[loadDictionaryImmediate]` (not `[loadedDictionaries, loadDictionaryImmediate]`) — reads `loadedDictionariesRef.current` inside `setTimeout` to avoid stale-closure capture of the Set.
- **`detect_hierarchical_composition` requires token range containment before substring check** (`wasm-core/src/pattern_processor/two_phase.rs:479`): Checks whether Phase B's translation string contains Phase A's — but fires falsely on unrelated patterns covering disjoint token spans whenever common Vietnamese words (e.g. `"và"`, `"là"`) collide. Always verify `phase_a.start_index >= phase_b.start_index && phase_a.end_index <= phase_b.end_index` before the `.contains()` check.
- **`DictionaryTable.tsx` / `VirtualizedDictionaryTable.tsx` are deleted** (2026-02-15): Only `EnhancedVirtualizedDictionaryTable` is the active table component. Do not recreate the deleted files.
- **`WasmPositionMapper`, `WasmNormalizer`, `WasmSegmentMatcher`, `PositionMappingValidator`, `PositionMappingBuilder`, `TranslationEngineFactory` are deleted** (2026-02-17): All had zero production imports. Do not recreate them.
- **`grep` is aliased to `rg` — multiple flags behave differently**: `-E` sets encoding (not extended-regex); `grep -rl FILE` for counting imports also gives unreliable results. Always use the **`Grep` tool** for any code search or import counting.
- **Single trie implementation in `wasm-core`**: `wasm-core/src/trie.rs::TrieNode` is the only trie node — `dictionary_trie.rs` imports and delegates to it. Do NOT add a second `TrieNode` to `dictionary_trie.rs`. `find_matches` / `find_matches_slice` return longest-first; `find_all_matches` / `find_all_matches_slice` return shortest-first.
- **Rust `hash.abs()` panics on `i32::MIN` in debug builds**: Any loop using `wrapping_sub`/`wrapping_add` can produce `i32::MIN`; calling `.abs()` on it panics (overflow) in debug mode and silently wraps in release. Always use `.wrapping_abs()` after wrapping hash arithmetic. Affects `generate_content_hash` in `wasm-core/src/lib.rs`.
- **WASM `translationSource` strings in `two_phase.rs` must match JS `PHASE_PRIORITIES`**: `from_match_result()` in `wasm-core/src/pattern_processor/two_phase.rs` emits `translationSource` strings consumed by `getSourcePriority()` in `TranslationEngine.js`. Valid values: `"hierarchical_pattern"` (Phase A), `"hierarchical_patterns"` (Phase B/default). Any other string returns priority `999` — lower than character fallback — causing silent translation corruption.
- **`DictionaryEntry` modal layout is intentionally center-aligned**: `.modal` has `text-align: center` and `.formGroup` has `align-items: center` — labels render centered. Utility buttons (`---a`, `-aaa` etc.) require `white-space: nowrap` or they break across lines when `flex: 1` is applied.
- **`EnhancedVirtualizedDictionaryTable` context menu buttons use CSS classes** (2026-02-17): `Edit Entry`, `Move to...`, `Delete Entry` now use `.contextMenuItem` / `.contextMenuItemDanger` from the CSS module with `:hover, :focus-visible` rules. Previously used JS `onMouseEnter`/`onMouseLeave` inline — do not revert.
- **`validatePhasePriority` must use literal priority numbers**: `PHASE_PRIORITIES` keys are `translationSource` strings (`'pattern'`, `'phrases'`, etc.) — not phase-group labels. `PHASE_PRIORITIES.patterns` / `.properNouns` / `.numbers` are all `undefined`. Always call `validatePhasePriority('phaseName', 1|2|3|4|5, tokens)` with a literal number, never `PHASE_PRIORITIES.*`.
- **All config.json writes must use `save_json_file()`**: Never write config files directly via `serde_json::to_string_pretty` + `fs::write`. The `save_json_file` helper enforces `check_json_depth(data, 50)` and the 10MB size cap. Applies to any Tauri command that persists config state. **Exception**: `import_dictionaries` writes dictionary files via `fs::write` directly (after ZIP decompression) and must manually enforce all guards in order: type check → entry-count → `check_json_depth(&data, 50)` → size check → write. Missing any one breaks the invariant.
- **`extractErrorMessage` over inline error coercion** (`src/utils/errorHelpers.ts`): Use `extractErrorMessage(error)` instead of `error instanceof Error ? error.message : 'Unknown error'` — the inline form misses `string`, `{ message }`, and `null` inputs. Already imported in `ConfigurationManager.tsx`; add to any file catching `unknown` errors.
- **`isSaveError` guard alongside `isValidationError` in catch blocks** (`src/utils/errors`): If a code path shows a toast then `throw new SaveError(...)`, the outer `catch` must guard with `!isValidationError(error) && !isSaveError(error)` before showing its own toast — otherwise the user sees two toasts. Both are exported from `src/utils/errors`. Pattern is used in `addEntry`/`updateEntry`/`deleteEntry` in `LazyDictionaryContext.tsx`.
- **`DictionaryContext.tsx` is the eager sibling of `LazyDictionaryContext.tsx`** and implements the same `DictionaryContextValue` interface. It consistently lags behind when the lazy variant is hardened. After any fix to `LazyDictionaryContext.tsx` involving: stale-closure ref-mirrors (`loadedDictionariesRef`, `currentHistoryIndexRef`), typed error throws (`ValidationError`/`SaveError`), or dep-array corrections — always audit the corresponding code in `DictionaryContext.tsx` (`addToHistory`, `addEntry`, `updateEntry`, `deleteEntry`).
- **Never `throw` inside React state updater functions** (`setState(prev => { throw ... })`): In React 18 Concurrent Mode, updaters may be called multiple times, and throws bypass the `await` chain above (not catchable). Do dictionary/state existence checks on the already-captured closure variable BEFORE the `setState` call: `if (!dictionaries[id]) { toast.error(...); throw new Error(...); }` then `setDictionaries(prev => { ... })`.
- **Every Tauri command writing to `dictionaries/` must ensure the directory exists first**: `get_dictionary_path` only returns the path — it does not create the directory. Use `get_or_create_dictionary_dir(&app_handle)?` (combines path resolution, `create_dir_all`, and `sanitize_io_error` in one call). New commands that skip this fail with `NotFound` on fresh installs or after `reset_dictionaries`. Never use `get_dictionary_path` + bare `create_dir_all` — you'll miss the error sanitization.
- **All `fs::*` calls in Tauri commands must use `sanitize_io_error`, never `e.to_string()`**: `e.to_string()` on `fs::read_dir`, `fs::copy`, `fs::remove_dir_all`, `fs::write` etc. exposes full OS paths (e.g. `/Users/lhak/Library/Application Support/...`) to the frontend. Use `.map_err(|e| sanitize_io_error(e, "context label"))?` for every I/O operation. This applies to ALL functions in `dictionary_commands.rs` — not just `#[tauri::command]` functions but also helper functions (`save_json_file`, `load_json_file_with_default`, etc.). Error strings accumulated into response `Vec<String>` (e.g. `errors.push(format!("...: {}", e))`) are equally frontend-visible and must also use `sanitize_io_error`. The only exception is Tauri API errors (e.g. `app_handle.path().app_data_dir()`) which don't contain filesystem paths. **Also applies to `zip::ZipError`**: `ZipError::InvalidArchive`/`UnsupportedArchive` embed filenames from the ZIP central directory header in their `Display`. Use `map_err(|_| "Failed to read ZIP archive: invalid or corrupted format".to_string())` — never `.map_err(|e| e.to_string())` on ZipArchive operations. Affects `export_dictionaries` (start*file/write_all/finish) and `import_dictionaries` (ZipArchive::new) in `dictionary_commands.rs`. **Also in `match` arms**: `archive.by_index(i)` returns `ZipError` — when formatting the error in a `match` arm, never use `e` in the `format!` string. Use a static message: `format!("entry {}: failed to read ZIP entry", i)` (drop `e` entirely, use `*` in the pattern).
- **Cache keys and log identifiers must not embed `file_path.display()`**: `get_cache_key` and similar helpers must use only `dictionary_id` — not the full OS path. Cache keys can be serialized or logged, creating the same path-disclosure risk as `e.to_string()`. `dictionary_id` alone is sufficient since all dictionary files share the same directory.
- **`AdaptiveBufferCalculator` non-integer `bufferSize` corrupts virtual scroll** (`EnhancedVirtualizedDictionaryTable.tsx`): Medium tier used to return `visibleItems * 1.5` (e.g. `15 * 1.5 = 22.5`). Fixed at source in `AdaptiveVirtualScrolling.js:271` (2026-02-18) with `Math.floor(visibleItems * 1.5)`. Consumer `visibleRange` also floors defensively — keep both.
- **`VirtualRowComponent` is at module scope** (2026-02-18): Defined before `EnhancedVirtualizedDictionaryTable` with props `selectedDictionary`, `onUpdateEntry`, `onSelectEntry`, `onContextMenu`. Do NOT wrap in `useMemo` — any dep change creates a new React component _type_, unmounting all rows and destroying inline edit state (`editingSource`, `tempSource`, etc.).
- **Rust `u64` timestamp subtraction: always use `.saturating_sub()`**: `SystemTime::now()` is not monotonic on macOS — clock-backwards adjustment makes `now - last` underflow as `u64`, panicking in debug or wrapping to a huge number in release (bypasses rate limiters). Use `now_ms.saturating_sub(last_notify)`. Affects `emit_poisoning_event` in `dictionary_commands.rs`.
- **CSS `repeating-linear-gradient` for virtual scroll row shading: put gradient on rows container, NOT spacer** (`EnhancedVirtualizedDictionaryTable.tsx`): CSS `background` uses the element's **layout** y-position, not visual/transformed position — `translateY` is irrelevant. With gradient on the spacer, rows always see it at slice-local y (layout y=0..N), causing parity flips on every scroll. Place gradient on the rows container (direct parent of rows); use `backgroundPositionY: (startIndex % 2) * ITEM_HEIGHT + 'px'` for phase correction; set all row `backgroundColor` to `transparent`.
- **`resolveGlobalConflicts()` and `find_best_pattern_match()` solve different problems — do NOT conflate them**: `find_best_pattern_match()` (Rust `matcher.rs`) selects the best pattern at a **single position** (one call per position during Phase 1). `resolveGlobalConflicts()` is greedy interval scheduling across **all positions at once** (Phase 4 conflict resolution). The real sibling with similar logic is `resolveMatchConflicts()` (~line 2381, Phase 2) — also JS-only. Algorithm changes to `resolveGlobalConflicts()` must be manually mirrored in `resolveMatchConflicts()`. Rust parity validator (test-only, no WASM overhead): `wasm-core/tests/conflict_resolution_parity_test.rs`. JS parity spec: `src/utils/__tests__/TranslationEngine.resolveConflicts.test.js`.
- **WASM singleton modules must call `.initialize().catch(warn)` at module bottom**: Any `src/utils/Wasm*.js` that exports a singleton (e.g. `wasmTextAssembler`, `processNumbersWasm`) must trigger background init at import time so WASM is ready before first call. Pattern: `singleton.initialize().catch((err) => { logger.warn('...', err); });` at end of file. Missing this forces every first caller onto the slow JS fallback path.
- **`needs_space()` / `needsSpace()` are the canonical postProcess spacing rules**: The 9 spacing rules that determine inter-segment spaces in translated output live in `wasm-core/src/text_assembly.rs::needs_space()` (Rust) and `src/utils/WasmTextAssembler.js::needsSpace()` (JS fallback). Both must stay in sync. Parity spec: `src/utils/__tests__/TranslationEngine.textAssembly.test.js`.
- **Rust parity validators belong in `wasm-core/tests/` as standalone integration test files**: Use when you need to verify a JS algorithm against an independent Rust port without any `#[wasm_bindgen]` export. These files compile only during `cargo test`, add zero production binary weight, and catch divergence immediately. Pattern: `wasm-core/tests/conflict_resolution_parity_test.rs` (greedy interval scheduling), `wasm-core/tests/two_phase_test.rs` (pattern processor).
- **`buildSegmentsFromSemanticArrays`, `buildSimpleWordLevelSegments`, `findPositionOptimized` are deleted** (2026-02-20): All had zero call sites in the entire codebase. Do not recreate them — position tracking is now a byproduct of `assembleWithSpacing()` (Candidate 1).
- **`ViewportSegmentComputerEnhanced.js`, `SegmentWorkerManager.js`, `SegmentPositionWorker.js`, `WorkerTypes.d.ts` are deleted** (2026-02-20): Zero production imports — ViewportSegmentComputerEnhanced was only referenced in `ViewportTypes.d.ts` (type-only, kept). Do not recreate; `SegmentPositionWorker.js` was instantiated as a Web Worker at path `/src/workers/SegmentPositionWorker.js` — that path is gone.
- **`AsyncInitializer.ts` is deleted** (2026-02-20): Was in `src/utils/` — zero imports anywhere; WASM modules each hand-roll their own promise-caching init pattern. Do not recreate.
- **`resultHelpers.ts` runtime helpers deleted** (2026-02-20): `throwIfFailed`, `getOrDefault`, `isSuccess`, `wrapOperation`, `mapResult` had zero call sites and were removed. The file now exports only the `ApiResult<T>` interface (used by `configValidation.ts`). Do not add runtime helpers back without adopting them at call sites.
- **`cleanupFormatting()` has two branches and cannot be migrated to WASM**: Always does 27-char dictionary-lookup punctuation translation first (lines 4886-4923, calls `this.dictionaryManager.translate()`). Then branches: `options.useChunking !== false` → simple spacing fix + early return (chunked mode); `else` → also applies space-after-punctuation rules and colon-quote handling (non-chunked mode). The dictionary loop is the blocking constraint for WASM. Do not duplicate this function's logic elsewhere — it is the single authoritative post-assembly cleanup step in `postProcess()`.
- **`emit_poisoning_event()` is the only valid path for cache-poisoning notifications** (`dictionary_commands.rs`): Never call `app.emit("dictionary-cache-critical-error", ...)` directly — it bypasses the 60-second `NOTIFICATION_COOLDOWN_MS` rate limiter. `emit_poisoning_event()` uses `APP_HANDLE` internally; `check_dictionary_cache_health` therefore takes no `AppHandle` parameter (fixed 2026-02-20).
- **`lookup_index_engine::TrieNode` (Tauri-side) has `pub fn insert(word, translation, metadata)`** (added 2026-02-20): Use it when building tries from dictionary entries instead of writing manual `for ch in word.chars() { current = current.children.entry(ch)... }` loops. Distinct from `wasm-core/src/trie.rs::TrieNode` which has different fields.
- **`WasmRegexUtils.js` singleton deleted** (2026-02-20): File now exports only the `createWasmRegexUtils` async factory. Do not add a singleton back — it had zero production imports and lacked the required background-init call.

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

**Runner**: Vitest + React Testing Library. **1,303 tests, 52 files** (+ 94 Rust). Run: `npm test -- --run`.

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
