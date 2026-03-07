# Tauri Backend + WASM Core — Gotchas

## Rust String Lengths

`.len()` is **byte count**; one Chinese char = 3 bytes. Use `.chars().count()` for character comparisons and pattern-length ranking. **Exception**: `String::with_capacity(n)` takes bytes — `.len()` for capacity hints is correct and must NOT be changed to `.chars().count()` (that would under-allocate). Affects `dictionary_commands.rs`, `lookup_index_engine.rs`, `wasm-core/src/number_processor.rs`, `two_phase.rs:select_best_results()`, `matcher.rs` (lookahead fast-path), `lib.rs` (checksum + memory estimate), `text_assembly.rs` (positions_array).

## WASM-Only Symbols Cause SIGABRT on Native Tests

`web_sys::console` (`log_1`/`error_1`/`warn_1`) and all `js_sys::*` use `#[rustc_nounwind]` FFI — panicking aborts the entire test process (not catchable). Gate every call with `#[cfg(target_arch = "wasm32")]`. Rules:

- `#[cfg(debug_assertions)]` alone is NOT sufficient — debug native builds satisfy it.
- `Drop` impls: use `#[cfg(all(debug_assertions, target_arch = "wasm32"))]`.
- When gating a `pub fn`, also gate its `pub use` in `mod.rs` AND any `#[wasm_bindgen]` wrapper in `lib.rs`.
- `js_sys::Date::now()` for timestamps: fallback `let version_id = 0u64;` on non-WASM.
- Inline `#[test]` functions calling WASM-only methods must be `#[cfg(target_arch = "wasm32")]` gated on the entire `fn` — an ungated test blocks ALL `cargo test` compilation for the crate.
- `let foo` only referenced in a `#[cfg(wasm32)]` block → gate the declaration too: `#[cfg(target_arch = "wasm32")] let foo = expr;`.

## Rust Arithmetic

- **`hash.abs()` panics on `i32::MIN` in debug builds**: wrapping arithmetic can produce `i32::MIN`; `.abs()` overflows. Always use `.wrapping_abs()`. Affects `generate_content_hash` in `wasm-core/src/lib.rs`.
- **`u64` timestamp subtraction**: `SystemTime::now()` is not monotonic on macOS. Use `.saturating_sub()` to avoid underflow. Affects `emit_poisoning_event` in `dictionary_commands.rs`.
- **Longest-match loops: use `>=` not `>`**: `if sequence.len() >= longest_length` allows multiple same-length patterns (last successful converter wins). `>` silently drops all but the first.

## WASM-Bridged Structs

`Option<T>` fields need `#[serde(default)]` — `serde` errors on absent JSON keys (not null, but absent). JS callers that omit optional fields cause `serde_wasm_bindgen::from_value` to fail for the whole batch.

## wasm-core Architecture

- **Single trie implementation**: `wasm-core/src/trie.rs::TrieNode` is the only trie node — `dictionary_trie.rs` imports and delegates to it. Do NOT add a second `TrieNode` to `dictionary_trie.rs`. `find_matches`/`find_matches_slice` return longest-first; `find_all_matches`/`find_all_matches_slice` return shortest-first.
- **Rust parity validators**: belong in `wasm-core/tests/` as standalone integration test files — compile only during `cargo test`, zero production binary weight. Examples: `conflict_resolution_parity_test.rs`, `two_phase_test.rs`.
- **`detect_hierarchical_composition` requires token range containment before substring check** (`two_phase.rs:479`): always verify `phase_a.start_index >= phase_b.start_index && phase_a.end_index <= phase_b.end_index` before `.contains()` — fires falsely on disjoint spans sharing common Vietnamese words.
- **`process_phase_a` must combine literal-starting AND variable-starting candidates** (`two_phase.rs`): hoist `variable_patterns` outside the loop and extend both slices each iteration. Fallback-only logic silently skips variable-starting Phase A patterns wherever a literal-starting one also exists.
- **Variable-before-variable span: take the SHORTEST valid span** (`matcher.rs:resolve_variable_with_lookahead`): `candidateSpans` is ordered longest→shortest; do NOT break on the first hit — let shorter spans overwrite `result` so the final value is the shortest. Taking the longest greedily exhausts tokens the next variable needs.
- **WASM `translationSource` strings in `two_phase.rs` must match JS `PHASE_PRIORITIES`**: `from_match_result()` emits `"hierarchical_pattern"` (Phase A) and `"hierarchical_patterns"` (Phase B/default). Any other string returns priority 999 in `getSourcePriority()`.

## Tauri Command Security

- **All `fs::*` calls must use `sanitize_io_error`, never `e.to_string()`**: exposes full OS paths to the frontend. Use `.map_err(|e| sanitize_io_error(e, "context label"))?` for every I/O call, including error strings pushed into response `Vec<String>`. Exceptions: Tauri API errors (no filesystem paths). Also applies to `zip::ZipError` (embeds filenames from ZIP headers — use static messages) and `serde_json` parse errors (can embed content snippets — use `format!("Invalid JSON in dictionary '{}'", id)`).
- **Tauri plugin errors** (e.g. `OpenerExt::open_path`): plugin `Display` impls may embed the path — use `.map_err(|_| "static description".to_string())`.
- **Cache keys must not embed `file_path.display()`**: `get_cache_key()` must use only `dictionary_id`. Cache keys can be serialized or logged.
- **All config.json writes must use `save_json_file()`**: enforces `check_json_depth(data, 50)` and 10MB cap. Exceptions: `import_dictionaries` (enforce guards manually in order: type check → entry-count → depth → size → write); `save_dictionary` (must return `ok_with_data`, use "dictionary file" labels — inline all guards).
- **`save_dictionary` data must be a JSON object**: `data.as_object().ok_or_else(...)` is the entry-count guard entry point. If `data` is an array, the 50K-entry limit is silently bypassed.
- **ZIP-bomb guard must use `.take()`**: `file.size()` from the `zip` crate is attacker-controlled. Use `file.take(MAX_BYTES as u64 + 1).read_to_string(&mut s)` then check `s.len()`.
- **`reset_dictionaries` leaves an empty directory**: no bundled templates exist — translation fails until the user re-imports. Never silently succeed; always warn in the response.
- **Every command writing to `dictionaries/` must call `get_or_create_dictionary_dir(&app_handle)?`**: `get_dictionary_path` only returns the path without creating the directory.
- **`DictionaryCache.invalidate` uses exact-key match**: `get_cache_key()` returns bare IDs (`"phrases"`, `"properNouns-MyNovel"`). Do NOT introduce colon-separated key formats — it makes every targeted invalidation a silent no-op.
- **`emit_poisoning_event()` is the only valid path for cache-poisoning notifications**: calling `app.emit(...)` directly bypasses the 60-second rate limiter.
- **`lookup_index_engine::TrieNode` has `pub fn insert(word, translation, metadata)`**: use it when building tries; do not write manual `for ch in word.chars()` traversal loops. Distinct from `wasm-core/src/trie.rs::TrieNode`.
