# ADR-092: Chapter Detection Runs Inline on the Async Runtime

**Status:** Decided
**Date:** 2026-10-10

## Context

`detect_chapter_outline` and `chapter_headers_for_pattern` (`src-tauri/src/chapter_outline_commands.rs`) are `async fn` commands that run a multi-pass regex scan over every line of the open book without `spawn_blocking`. The same is true of the other 26 `pub async fn` commands in `src-tauri/src` (none of them uses `spawn_blocking`), `open_book` and `scan_library` included. The architecture review of 2026-10-10 (round 25, candidate #1) added an `Arc<BookContent>` handle (`open_book_handle`), which makes offloading possible, since only the `Arc` would cross into a `'static` closure. It asked whether to offload.

## Decision

Do not offload. The two chapter commands keep running their scan inline on the tokio worker.

## Reasoning

**Measured: 26 ms.** A throwaway release-build test ran a synthetic book of 4000 chapters, 280,000 lines and 25.8 MB of decoded text through `elect`: 26 ms, and 6 ms for `headers_for_pattern`. That is more than the ~17 MB the largest real book reaches. A debug build took 892 ms, but the app ships release. The threshold set before measuring was 100 ms.

**The cost is a held worker.** The webview UI thread is not involved, and the runtime is multi-threaded. `detect_chapter_outline` runs once per fingerprint; later opens call `chapter_headers_for_pattern`.

**A partial change would be inconsistent.** Two commands using `spawn_blocking` among 26 that do not would be the lone exception, with `open_book` doing heavier work inline.

## Consequence

Future reviews should not re-propose `spawn_blocking` for the chapter commands from the missing call alone. Revisit if a release-build scan of a real book exceeds ~100 ms, or if a repo-wide pass over blocking command work is done (then cover `open_book` and `scan_library` too).
