# Performance Optimization Review — 2026-02-04

Systematic review of Rust (WASM + Tauri backend) and TypeScript/React performance issues.
Fixes are applied in priority order. Status updated after each item is completed.

**All 1062 tests pass (1002 run, 60 skipped — integration/WASM runtime tests).**

---

## Legend

| Status         | Meaning                                            |
| -------------- | -------------------------------------------------- |
| ⬜ Pending     | Not yet started                                    |
| 🔄 In Progress | Currently being fixed                              |
| ✅ Done        | Fix applied and verified                           |
| ⚠️ Skipped     | Analyzed, intentionally deferred or not worthwhile |

---

## Priority Group A — High Impact / Safe Fixes

| #   | File                                                               | Line(s)                    | Issue                                                                                                                       | Impact      | Status |
| --- | ------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| A1  | `src-tauri/src/lookup_index_engine.rs`                             | 67                         | `text.chars().collect()` inside `find_matches`, called per-position inside `into_par_iter()` — O(n²·d) char-vec allocations | High        | ✅     |
| A2  | `src/components/dictionary/LazyDictionaryContext.tsx`              | 809-828                    | Context value object created fresh every render, not memoized — causes full consumer re-render                              | High        | ✅     |
| A3  | `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` | multiple                   | VirtualRow defined inside useMemo (re-mounts on scroll); BulkMoveDialog in render body; sync batch loop = filter()          | High        | ✅     |
| A4  | `src/utils/TranslationSegmentCache.ts`                             | multiple                   | async SHA-256 for cache keys (should be sync simpleHash); O(n²) metadata batch removal                                      | High        | ✅     |
| A5  | `wasm-core/src/pattern_processor/matcher.rs`                       | 15-18, 538+                | PROFILING_ENABLED as Mutex<bool> (→ AtomicBool); multiple PROFILING_DATA lock acquisitions per fn                           | Medium-High | ✅     |
| A6  | `wasm-core/src/pattern_processor/two_phase.rs`                     | 116, 264, 283-287, 472-500 | .clone() where move suffices; Arc for PhaseAResult; variable_cache full clone; O(n²) composition detection                  | High        | ✅     |

## Priority Group B — Medium Impact / Targeted Fixes

| #   | File                                                                                        | Line(s)          | Issue                                                                                                             | Impact     | Status |
| --- | ------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| B1  | `src/utils/QuoteProcessor.ts` / `PunctuationProcessor.ts` / `UnicodePunctuationDetector.ts` | various          | Regex compiled per call — hoist to module scope                                                                   | Medium     | ✅     |
| B2  | `src/hooks/useConfigurationLoader.ts`                                                       | 126-130, 67      | Side-effect in useState initializer (double-fires StrictMode); isLoading flash                                    | Medium     | ✅     |
| B3  | `wasm-core/src/regex_utils.rs`                                                              | 140-147, 161-180 | `ch.to_string()` + regex match for sentence-end check — replace with direct char comparison                       | Medium     | ✅     |
| B4  | `src/components/ClickableOriginalSemantic.tsx`                                              | 139              | Missing React.memo on export (siblings have it)                                                                   | Low-Medium | ✅     |
| B5  | `wasm-core/src/trie.rs`                                                                     | 43-84            | `find_longest_match` calls `find_matches` (full walk + sort + collect) then takes [0]; sort when reverse suffices | Medium     | ✅     |

## Priority Group C — Low Impact / Quick Wins

| #   | File                                   | Line(s)  | Issue                                                                                 | Impact    | Status |
| --- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------- | --------- | ------ |
| C1  | `wasm-core/src/segment_matcher.rs`     | 116      | `units.clone()` where `units` is freshly owned — should be move                       | Low       | ✅     |
| C2  | `wasm-core/src/lib.rs`                 | 656      | `hash = hash & hash` is a no-op                                                       | Low       | ✅     |
| C3  | `src/utils/CacheKeyGenerator.ts`       | 88       | `context.sort()` mutates caller's array — use `[...context].sort()`                   | Low (bug) | ✅     |
| C4  | `src/utils/logger.ts`                  | 29       | `prefixes` Record recreated every `formatMessage` call; 3 string allocs for timestamp | Low       | ✅     |
| C5  | `wasm-core/src/number_processor.rs`    | 354-367  | `format_with_commas` uses `insert(0, …)` — O(n²)                                      | Low       | ✅     |
| C6  | `src-tauri/src/lookup_index_engine.rs` | 228      | `dictionary_order.contains()` is O(m) per dict — use HashSet                          | Low       | ✅     |
| C7  | `wasm-core/Cargo.toml`                 | 23       | `fxhash` declared but never imported/used                                             | Low       | ✅     |
| C8  | `src/utils/ParagraphGrouping.ts`       | 72, 82   | `JSON.parse(JSON.stringify())` deep copy — use spread                                 | Low       | ✅     |
| C9  | `src/utils/TextTokenizer.ts`           | 296-310  | `postProcessTokens` is a no-op — remove                                               | Low       | ✅     |
| C10 | `src/utils/GraphemeHelper.ts`          | 75       | `Array.from()` materializes iterator just to get length — use for…of counter          | Low       | ✅     |
| C11 | `src/utils/TextSanitization.ts`        | multiple | 3 chained `.replace()` — merge into single regex                                      | Low       | ✅     |
| C12 | `src/utils/ByteFormatter.ts`           | 120      | `sizes` array recreated per call — hoist to module scope                              | Low       | ✅     |

## Priority Group D — React / UI Optimizations

| #   | File                                                    | Line(s)  | Issue                                                                          | Impact     | Status |
| --- | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ | ---------- | ------ |
| D1  | `src/components/configuration/ConfigurationManager.tsx` | 81       | `categorizeDictionaries` not memoized                                          | Low-Medium | ✅     |
| D2  | `src/components/configuration/ConfigurationManager.tsx` | 475-479  | IPC call on every mousemove during slider drag (~60/sec) — debounce to mouseup | Medium     | ✅     |
| D3  | `src/components/ClickableTranslationSemantic.tsx`       | 261-267  | async IIFE in useEffect without cancellation guard                             | Low-Medium | ✅     |
| D4  | `src/components/StreamingTranslationDisplay.tsx`        | 163      | `slice(-maxVisibleLines)` + index keys → every DOM node re-keys on new line    | Low        | ✅     |
| D5  | `src/components/appearance/AppearanceManager.tsx`       | multiple | 24 inline arrow functions; preview divs duplicate CSS custom properties        | Low        | ✅     |

## Priority Group E — Security / Correctness

| #   | File                                   | Line(s)  | Issue                                                   | Impact   | Status |
| --- | -------------------------------------- | -------- | ------------------------------------------------------- | -------- | ------ |
| E1  | `src-tauri/src/dictionary_commands.rs` | 986-1051 | `load_dictionaries_parallel` skips `validate_file_size` | Security | ✅     |

---

## Implementation Log

### A1 — lookup_index_engine.rs: chars pre-collection

- **Problem**: `find_matches` accepted `&str`, called `.chars().collect::<Vec<char>>()` internally. Called per-position in `find_all_matches_at_position` which is called per-index in the parallel index builder — O(n²·d) allocations.
- **Fix**: Changed `find_matches` signature to `chars: &[char]`. Callers (`build_index_serial`, `build_index_parallel`) pre-collect `text.chars().collect()` once and pass the slice.
- **Also**: `dictionary_order.contains(&dict.name)` O(m) linear scan → `HashSet<&str>` with O(1) lookup (C6).

### A2 — LazyDictionaryContext: useMemo on context value

- **Problem**: Context value object was a fresh object literal every render — all 16 consumer components re-rendered on any state change.
- **Fix**: Wrapped the context value in `useMemo<LazyDictionaryContextValue>(…, [all 16 deps])`.

### A3 — EnhancedVirtualizedDictionaryTable: three sub-fixes

1. **Sync batch loop → `.filter()`**: Replaced a synchronous `for` loop that built an array by pushing every element matching a condition with a single `.filter()` call. Removed unused `isLargeList` variable.
2. **VirtualRow `isScrolling` prop**: `isScrolling` was captured via closure inside `useMemo`, causing the entire VirtualRow component definition to regenerate on every scroll start/end → all rows remount. Moved `isScrolling` into `VirtualRowProps`, passed as a prop at the render site, removed from `useMemo` deps. React.memo prevents re-render unless the prop actually changes.
3. **BulkMoveDialog extraction**: Component with hooks (`useDictionary`, `useState`, `useEffect`) was defined inside the parent render body — every parent re-render created a new component type, causing React to unmount/remount. Extracted to module scope with a `BulkMoveDialogProps` interface (6 props: `selectedDictionary`, `selectedEntries`, `isMoving`, `onSetMoving`, `onClose`, `onMoveSuccess`).

### A4 — TranslationSegmentCache: sync keys + O(1) metadata ops

- **Cache key**: `generateCacheKey` used async SHA-256 (`crypto.subtle.digest`), making `get()`/`set()` async on every translation. Replaced with sync `simpleHash` (djb2, same function used for other internal keys). Removed `secureHash` method entirely.
- **Metadata tracking**: `addToMetadata` did O(n) `includes()` before push; `removeFromMetadata` did O(n) `.filter()`. Added a shadow `metadataKeySet: Set<string>` for O(1) `has`/`add`/`delete`. Both methods now check the set first. `clear()` resets the set.

### A5 — pattern_processor/matcher.rs: AtomicBool + lock consolidation

- **PROFILING_ENABLED**: Changed from `lazy_static! { static ref PROFILING_ENABLED: Mutex<bool> }` to `static PROFILING_ENABLED: AtomicBool`. All reads use `.load(Ordering::Relaxed)`, all writes `.store(…, Ordering::Relaxed)`. Lock-free on the hot read path.
- **PROFILING_DATA lock consolidation in `resolve_variable_with_lookahead`**: 6 separate `PROFILING_DATA.lock().unwrap()` calls (one per cache hit/miss + early return) consolidated to 1: local `local_cache_hits`/`local_cache_misses` counters accumulate during the loop; single `lock()` + flush at function exit.

### A6 — pattern_processor/two_phase.rs: clone elimination

- **Line 116**: `.clone()` on freshly deserialized `units` → removed (move semantics; borrow for loop already works after assignment).
- **Lines 138, 141**: `index_patterns(…clone())` → `index_patterns(&…)`. Changed `index_patterns` signature from `Vec<SemanticPattern>` to `&[SemanticPattern]`.
- **Arc<PhaseAResult>**: Analyzed but skipped — `PhaseAResult` is serialized via `serde_wasm_bindgen` (not `Serialize`), so `Arc` clone would not eliminate the deep copy at the WASM boundary. Cost is minor for typical 5–10 token spans.
- **`enhanced_cache` clone in `process_phase_b`**: Unavoidable — need an owned `HashMap` to merge Phase A entries before passing to Phase B.
- **`detect_hierarchical_composition` O(n²)**: Pattern counts are O(tens), not thousands. Algorithmic improvement not worthwhile.

### B1 — PunctuationProcessor: pre-compiled regexes

- Added 3 `RegExp` instance fields (`SPACED_CLOSE_MIDDLE_OPEN`, `SPACED_MIDDLE_OPEN`, `COMMA_OPENING_QUOTE`) initialized once in the constructor. `isAlreadyProperlySpaced` and `processSequence` use the cached instances. Reset `lastIndex` before reuse of global regexes.

### B2 — useConfigurationLoader: side-effect in useState initializer

- **Problem**: `useState(() => { if (autoLoad) loadConfig(); })` — the initializer ran a side-effect. In React StrictMode, initializers run twice, causing double load.
- **Fix**: Changed `isLoading` initial value from `false` to `autoLoad`. Replaced initializer with `useEffect(() => { if (autoLoad) loadConfig(); }, [])`.

### B3 — regex_utils.rs: direct char comparison

- **`ends_with_sentence_punctuation`**: Replaced `text.chars().last().unwrap().to_string()` + `SENTENCE_END.is_match(…)` with `match text.chars().last() { Some('。'|'！'|'？') => true, _ => false }`. Zero allocations.
- **`split_by_sentences` inner loop**: `SENTENCE_END.is_match(&ch.to_string())` → `matches!(ch, '。'|'！'|'？')`.

### B4 — ClickableOriginalSemantic: React.memo

- Added `import React` (was only importing `{ useMemo }`). Wrapped export in `React.memo(…)` to match all sibling clickable components.

### B5 — trie.rs: find_longest_match rewrite

- **`find_matches`**: Replaced `sort_by(|a,b| b.word.len().cmp(&a.word.len()))` with `.reverse()` — matches are already accumulated in ascending length order during the trie walk.
- **`find_longest_match`**: Rewrote to walk the trie once, tracking the longest match inline, instead of calling `find_matches` (full walk + sort + collect) then `.into_iter().next()`.

### C1 — segment_matcher.rs: move semantics

- `self.units = units.clone()` → `self.units = units`. The value is freshly deserialized and owned; the `for unit in &units` loop borrows after assignment.

### C2 — lib.rs: hash no-op

- Removed `hash = hash & hash` — bitwise AND of a value with itself is identity. `i32` wrapping arithmetic already keeps the value in range.

### C3 — CacheKeyGenerator: sort mutation (bug fix)

- `context.sort()` and `value.sort()` mutated the caller's arrays in place. Fixed to `[…context].sort()` / `[…value].sort()`.

### C4 — logger.ts: timestamp + prefix allocation

- Hoisted `prefixes` Record to module-level `LOG_PREFIXES` constant (was recreated every `formatMessage` call).
- Timestamp: replaced `new Date().toISOString().split('T')[1].split('.')[0]` (creates 3 intermediate strings) with `getHours()`/`getMinutes()`/`getSeconds()` + `padStart`.

### C5 — number_processor.rs: format_with_commas O(n²) → O(n)

- Replaced `insert(0, …)` loop (shifts entire string each iteration) with build-reversed-string-then-reverse approach using `String::with_capacity`.

### C6 — see A1 log (HashSet for dictionary_order).

### C7 — Cargo.toml: removed unused fxhash

- Confirmed zero usage via `grep` before removal.

### C8 — ParagraphGrouping.ts: spread instead of JSON round-trip

- `JSON.parse(JSON.stringify(segment.metadata))` → `{ …segment.metadata }`. Verified metadata type is flat (only primitive fields: `phase`, `confidence`, `pattern`).

### C9 — TextTokenizer.ts: removed no-op postProcessTokens

- The function was a `while` loop that pushed every element — identical to the identity transformation. Call site now returns `tokens` directly.

### C10 — GraphemeHelper.ts: iterator length without materialization

- `Array.from(this.segmenter.segment(text)).length` → `for (const _ of …) count++`. Avoids allocating an intermediate array.

### C11 — TextSanitization.ts: merged 3 replaces

- 3 chained `.replace()` calls (control chars, surrogates, C1 controls) merged into a single regex: `/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uD800-\uDFFF]/g`.

### C12 — ByteFormatter.ts: hoisted constants

- `sizes` array and `k = 1024` were local variables recreated per call. Hoisted to module-level `BYTE_UNITS` and `K`.

### D1 — ConfigurationManager: useMemo on categorizeDictionaries

- Wrapped `categorizeDictionaries(availableDictionaries)` in `useMemo(…, [availableDictionaries])`.

### D2 — ConfigurationManager: slider IPC debounce

- `handleMove` (mousemove, ~60 fps) now only updates local `pendingValue` state (instant UI). `handleUp` (mouseup) calls the actual `handleMemoryLimitChange(pendingValue)` once — single IPC round-trip instead of ~60.

### D3 — ClickableTranslationSemantic: async cancellation guard

- Added `let cancelled = false` before the async IIFE in `useEffect`. `setSegments` is guarded by `if (!cancelled)`. Cleanup function returns `() => { cancelled = true; }` to prevent stale state updates after unmount or prop change.

### D4 — StreamingTranslationDisplay: stable keys

- `key={index}` on `.slice(-maxVisibleLines)` caused all DOM nodes to re-key when a new line was appended (indices shifted). Changed to `key={lines.length - visibleLines.length + index}` — absolute line indices, stable across slicing.

### D5 — AppearanceManager: delegated event handlers

- 24 inline arrow functions (`onChange={(e) => handleFontChange(…)}`, `onClick={() => resetToDefault(…)}`) replaced with 2 delegated handlers (`handleInputChange`, `handleResetClick`). Each `<input>` and reset `<button>` now carries `data-section` and `data-property` attributes; the handlers read these from `e.target.dataset` / `e.currentTarget.dataset`. Reduces per-render function object allocation from 24 to 2.
- Preview div inline styles retained: `applyStylesToDocument` runs in `useEffect` (after paint), so inline styles on previews are needed for immediate visual feedback during editing.

### E1 — dictionary_commands.rs: file-size validation in parallel path

- `load_dictionaries_parallel` was missing `validate_file_size(&file_path, MAX_JSON_SIZE_BYTES)` before `fs::read_to_string` — the serial path had it. Added the same validation gate.
