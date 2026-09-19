//! Chapter-outline IPC: two thin commands over the book `chapter_outline.rs` (pure
//! detection logic) can't see on its own, since that module has no Tauri, no state, no
//! filesystem — only regexes over a line slice it's handed.
//!
//! Reads the open book via `book_commands::snapshot_open_book` (`pub(crate)`, copies the
//! text and line index out, releases the lock immediately) rather than touching
//! `BookCache`'s internals directly — those stay private to `book_commands.rs`.

use tauri::State;

use crate::book_commands::{self, BookCache};
use crate::chapter_outline::{self, ChapterHeader, ChapterOutline, PatternId};

fn line_slices_of<'a>(text: &'a str, lines: &[(usize, usize)]) -> Vec<&'a str> {
    lines.iter().map(|&(start, end)| &text[start..end]).collect()
}

fn detect_chapter_outline_impl(cache: &BookCache, fingerprint: &str) -> Result<ChapterOutline, String> {
    let (text, lines) = book_commands::snapshot_open_book(cache, fingerprint)?;
    Ok(chapter_outline::elect(&line_slices_of(&text, &lines)))
}

fn chapter_headers_for_pattern_impl(
    cache: &BookCache,
    fingerprint: &str,
    pattern: PatternId,
) -> Result<Vec<ChapterHeader>, String> {
    let (text, lines) = book_commands::snapshot_open_book(cache, fingerprint)?;
    Ok(chapter_outline::headers_for_pattern(&line_slices_of(&text, &lines), pattern))
}

/// Run the full chapter-pattern election over the open book.
///
/// Called once per fingerprint — the first time a book is opened, or after its content
/// changes and the fingerprint changes with it — since the frontend caches the winner
/// (and every candidate's stats) in the book record and skips this call on every later
/// open of the same, unchanged fingerprint, calling `chapter_headers_for_pattern` instead.
#[tauri::command]
pub async fn detect_chapter_outline(
    cache: State<'_, BookCache>,
    fingerprint: String,
) -> Result<ChapterOutline, String> {
    detect_chapter_outline_impl(&cache, &fingerprint)
}

/// Headers for one specific pattern, bypassing election entirely.
///
/// Two callers: refreshing the header list on a later open of a book whose pattern was
/// already elected (or overridden) on a previous open, and applying a manual override the
/// user picks from `detect_chapter_outline`'s candidate list.
#[tauri::command]
pub async fn chapter_headers_for_pattern(
    cache: State<'_, BookCache>,
    fingerprint: String,
    pattern: PatternId,
) -> Result<Vec<ChapterHeader>, String> {
    chapter_headers_for_pattern_impl(&cache, &fingerprint, pattern)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book_commands::tests::cache_with_open_book;

    fn eight_chapter_book() -> String {
        let mut text = String::new();
        for n in 1..=8 {
            text.push_str(&format!("第{n}章 标题{n}\r\n"));
            for _ in 0..10 {
                text.push_str("正文正文正文\r\n");
            }
        }
        text
    }

    #[test]
    fn detect_chapter_outline_elects_over_the_open_book() {
        let (cache, fingerprint) = cache_with_open_book(&eight_chapter_book());
        let outline = detect_chapter_outline_impl(&cache, &fingerprint).expect("election succeeds");
        assert_eq!(outline.elected, Some(PatternId::Chapter));
        assert_eq!(outline.headers.len(), 8);
    }

    #[test]
    fn detect_chapter_outline_rejects_a_fingerprint_mismatch() {
        let (cache, _) = cache_with_open_book(&eight_chapter_book());
        let error = detect_chapter_outline_impl(&cache, "some-other-fingerprint").unwrap_err();
        assert_eq!(error, "A different book is open");
    }

    #[test]
    fn detect_chapter_outline_reports_no_open_book() {
        let cache = BookCache::new();
        let error = detect_chapter_outline_impl(&cache, "anything").unwrap_err();
        assert_eq!(error, "No book is open");
    }

    #[test]
    fn chapter_headers_for_pattern_bypasses_election() {
        let mut text = eight_chapter_book();
        text.push_str("第1卷 卷标题\r\n");
        let (cache, fingerprint) = cache_with_open_book(&text);

        let headers =
            chapter_headers_for_pattern_impl(&cache, &fingerprint, PatternId::Volume)
                .expect("headers succeed");
        assert_eq!(headers.len(), 1);
        assert_eq!(headers[0].title, "第1卷 卷标题");
    }

    #[test]
    fn chapter_headers_for_pattern_rejects_a_fingerprint_mismatch() {
        let (cache, _) = cache_with_open_book(&eight_chapter_book());
        let error =
            chapter_headers_for_pattern_impl(&cache, "some-other-fingerprint", PatternId::Chapter)
                .unwrap_err();
        assert_eq!(error, "A different book is open");
    }
}
