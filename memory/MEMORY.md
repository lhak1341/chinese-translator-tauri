# Chinese-Vietnamese Translator — Dev Memory

## Session History Index

Detailed fix notes for sessions 9-18 are archived in `memory/sessions/`:

- `session09-18.md` — all prior session fixes (2026-02-20 to 2026-02-21)

---

## Fixes Done (2026-02-22, session 19)

### Comprehensive architecture code review — 14 issues fixed

**CRITICAL fixes:**

**`dictionary_commands.rs` — cache invalidation always no-op (Critical)**

- `invalidate(Some(id))` used `key.starts_with("id:")` but `get_cache_key()` returns bare IDs
- Fixed: `cache.retain(|key, _| key != id)`. Tests updated to use bare-ID keys.
- Without this fix, every `save_dictionary` / `create_proper_nouns_dictionary` call left stale cache

**`dictionary_commands.rs` — ZIP parse error leaks attacker-controlled content (Important)**

- `serde_json` error message embeds snippets of ZIP entry content in its Display
- Fixed: `Err(_) => { errors.push(format!("{}: invalid JSON format", filename)); }`

**`DictionaryContext.tsx` — `bulkDeleteEntries` Concurrent Mode violation (Critical)**

- `let oldData`/`sortedDictionary` assigned inside `setDictionaries` updater, read outside
- Fixed: compute from closed-over `dictionaries` snapshot BEFORE `setDictionaries`
- Added outer `try/catch` with `!isValidationError && !isSaveError` guard (Issue 6)
- Changed save-failure throw from `new Error` to `new SaveError`
- CLAUDE.md `bulkDeleteEntries` "exception" note was WRONG — removed; now matches other CRUD ops

**`WasmStringProcessor.js` — `buildCache` null deref after failed init (Critical)**

- `this.initialize()` return value was ignored; `this.processor.buildCache()` called when null
- Fixed: `const ok = await this.initialize(); if (!ok) return false;`

**`WasmNumberProcessor.js` — `initializationPromise` not cleared after failure (Critical)**

- IIFE resolves (not rejects) to false on failure; outer `.catch()` never fires
- `getWasmNumberProcessorStatus()` permanently reported `{ initializing: true }` after failure
- Fixed: added `initializationPromise = null; retryAllowedAfter = Date.now() + RETRY_COOLDOWN_MS;` in IIFE catch

**`TranslationEngine.js` — corruption toast spam, up to 6 toasts per event (Critical)**

- `checkSemanticArrayCorruption` called after each of 5 phases; no dedup guard
- Fixed: added `let corruptionToastShown = false;` + `if (!corruptionToastShown)` guard in closure

**Important fixes:**

**`LazyDictionaryContext.tsx` — `addEntry` missing-dict throws `ValidationError` (Important)**

- Should be plain `Error` (not ValidationError) — a precondition, not user input error
- Fixed: moved check before `try` block, changed to `throw new Error(msg)` (matches DictionaryContext.tsx)

**`LazyDictionaryContext.tsx` — `handleDictionaryChange` closes over `dictionaryTypes` state (Important)**

- Added `dictionaryTypesRef` ref-mirror; removed `dictionaryTypes` from dep array → `[loadDictionaryImmediate, schedulePreload]`

**`WasmDictionaryManager.js` — sequential fallback always returns `true` (Important)**

- Changed `return true` → `return successCount === dictionaries.length`

**`WasmBoundaryValidation.ts` — `sourceTokens` param name misleads (Important)**

- Renamed `sourceTokens` → `jsTokens` to clarify it's the JS destination (param1)

**`number_processor.rs` — `Token` struct missing `#[serde(default)]` (Important)**

- Added `#[serde(default)]` to `translated` and `translation_source` fields
- Without: absent JS key (vs null) causes `from_value` to fail, killing entire token batch

**`two_phase.rs` — overlapping Phase B spans in `hierarchical_results` (Important)**

- Two Phase B patterns with overlapping spans both pushed to `hierarchical_results`, both returned
- Fixed: added greedy longest-span dedup pass in `select_optimal_results` before the Phase A/B tracking

**`SemanticPatternProcessor.js` — `PrecomputedTokenStrings.getStats()` cache hit rate always 0 (Important)**

- Added `totalMisses: 0` to stats constructor; increment on cache miss in `getString()`

**Verification**: TypeScript 0 errors, Tauri cargo check clean, WASM cargo check clean (1 pre-existing dead_code warning), 1151 JS tests pass, 134 Rust tests pass.

---

## Key Architectural Invariants (most frequently violated)

- **`bulkDeleteEntries`**: compute from closed-over snapshot BEFORE `setDictionaries` (same as other CRUD ops)
- **Cache keys in `dictionary_commands.rs`**: bare IDs (`"phrases"`, not `"phrases:path"`)
- **`initializationPromise` must be cleared in IIFE catch** (not only in outer `.catch()`) for WasmNumberProcessor
- **`dictionaryTypesRef` ref-mirror**: `handleDictionaryChange` dep array is `[loadDictionaryImmediate, schedulePreload]`
- **`copyWasmTokens` param order**: param1=jsTokens (JS dest), param2=wasmTokens (WASM src)

---

## Stable Project Facts

- **5-Phase pipeline order is IMMUTABLE**: Pattern→ProperNoun→Number→Phrase→Character
- **Dual-path architecture**: `ClickableTranslationSemantic` → `SegmentPrecomputer.js` (char-only); `ClickableTranslationOptimized` → `TranslationEngine.js` (full)
- **Large files are intentional**: `TranslationEngine.js` (10K LOC), `Translator.jsx` (2.5K LOC), `EnhancedVirtualizedDictionaryTable.tsx` (2.8K LOC)
- **Test counts**: 1151 JS/TS tests (50 files), 134 Rust tests (wasm-core)
- **TypeScript strict mode, 0 errors expected**
- **`spin`/`pulse` @keyframes are global in `index.css`** — do not redefine in CSS modules
- **`streaming-animations.css` is plain CSS** (not a module) — `progress-pulse` and `streaming-blink` keyframes are global there
- **`DictionaryContext.tsx` ↔ `LazyDictionaryContext.tsx`**: fixes to CRUD ops must be mirrored; `LazyDictionaryContext.tsx` has no `bulkDeleteEntries`
