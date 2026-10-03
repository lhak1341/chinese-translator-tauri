# ADR-031: Skip Splitting dictionary_commands.rs by Concern

**Status:** Decided
**Date:** 2026-07-18

## Context

`src-tauri/src/dictionary_commands.rs` is 3393 lines total — but ~1977 lines are production code, the rest is an inline `#[cfg(test)] mod tests` (Rust convention, colocated intentionally per `src-tauri/CLAUDE.md`'s testing guidance). The production code spans roughly 7 concerns: shared validation helpers (`validate_dictionary_id`, `validate_file_size`, `check_json_depth`, `validate_dictionary_payload`), cache management (`DictionaryCache`), rate limiting (`RateLimiters`), dictionary CRUD + config I/O, ZIP import/export, batch/parallel loading, and lookup-index building.

A candidate proposed splitting the file into per-concern modules (e.g. `dictionary_zip.rs`, `dictionary_cache.rs`, `dictionary_config.rs`), reasoning that a "dictionary CRUD" change and a "ZIP import security" change currently land in the same diff, and that `validate_dictionary_id()` must be manually remembered at 16 separate call sites with no compiler enforcement.

## Decision

Do not split `dictionary_commands.rs` by concern. Do not introduce a type-level wrapper (e.g. a `ValidatedDictionaryId` newtype) for `validate_dictionary_id` specifically.

## Reasoning

**Deletion test fails for the file split.** Splitting relocates the coordination cost (which file, which diff) without removing it — the `_impl` extraction convention already separates thin Tauri-wrapper concerns from testable core logic within the file; the remaining organization is a directory-boundary preference, not a concentrated-complexity problem a deep module would solve.

**`validate_dictionary_id` is not uniquely risky — it's one of at least 6 equivalent guards.** `src-tauri/CLAUDE.md` documents the same "must call this manually, no compiler enforcement" shape for `sanitize_io_error`, `write_atomic`, `get_or_create_dictionary_dir`, `save_json_file`, `validate_dictionary_payload`, and `emit_poisoning_event` — all established, accepted, and already caught real bugs in this exact file via code review (`save_json_file` and `import_dictionaries` were documented as past gaps for `write_atomic`). Fixing dictionary-ID validation alone with a newtype would be inconsistent with how every other guard in this file works, and wouldn't close the analogous risk on the other 5.

**No real bug found.** Unlike ADR-020, ADR-027, or the 2026-07-18f review round's other candidates, no confirmed drift, missed call site, or test gap was found in this file during the grill — the candidate was speculative from the outset (report card marked it `Speculative`, not `Strong`).

## Consequence

Future architecture reviews should not re-propose splitting `dictionary_commands.rs` by concern, nor a one-off type-safety wrapper for `validate_dictionary_id`, without new evidence (a real missed-validation bug, or a second file organized the same way that reveals the split actually helps). If the codebase later adopts a systematic type-level enforcement pattern across all 6+ manual-discipline guards in this file, revisit as a batch — not as a single-guard exception.

**2026-10-03 addendum (architecture review round 6, candidate #4 grilling).** Re-proposed as an `app_files` module (atomic write, quarantine, the four JSON blob kinds, `sanitize_io_error`) on the grounds that `book_commands.rs` imports `sanitize_io_error` from here, and declined again. That import is one `pub(crate)` helper used for 7 reads; `book_commands.rs` writes no app file, so it is not "a second file organized the same way". The testability claim was also wrong: the inline tests (`test_blob_load_save_round_trip_for_every_kind`, `test_blob_with_invalid_json_is_set_aside...`, the not-UTF-8 and over-limit cases) already run the blob protocol against a plain temp dir with no cache or `AppHandle`. The grill did find one real defect, fixed instead of split: `write_atomic` hardcoded "dictionary file" in its errors, so a failed `config.json`/`appearance.json`/`transform-rules.json`/`books.json` save reported a dictionary failure. It now takes a `context` label.
