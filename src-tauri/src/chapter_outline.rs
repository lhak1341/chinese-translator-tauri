//! Chapter-structure detection: elect a header pattern per book, deterministically.
//!
//! No model call, no network — five regexes run once over the book's own line index and
//! the winner is chosen by a fixed statistical rule:
//!
//! ```text
//! among patterns with >= 5 hits and gap-regularity >= 0.8,
//! elect the one with the smallest median inter-header gap,
//! where medians within 5% of the smallest count as tied and the
//! earliest in PATTERN_ORDER wins the tie
//! ```
//!
//! where gap-regularity is the fraction of positive inter-header gaps within 4x the
//! median. Median gap is the granularity signal: chapters land at tens-to-low-hundreds of
//! lines, volumes at low thousands — so among evenly-spaced candidates, the finest-grained
//! one wins. This rule (and the pattern list below) was derived from a prototype run
//! against the reader corpus when it held 23 books, and is pinned against the whole
//! corpus (55 books as of 2026-09-29) by `tests::corpus`.
//!
//! The near-tie band exists for books that print the volume marker on or beside every
//! chapter heading ("第一卷 第一章 时空机器", or a "第一卷 在澹州" line before each chapter).
//! Chapter and volume then hit almost the same lines, and one stray volume-only line (a
//! "第二十五卷 后记") is enough to make the volume median a line or two smaller — 114 vs
//! 114.5 in `Tầm Tần ký 寻秦记`, 146 vs 148 in `Khánh dư niên 庆余年`. A real volume median
//! is many times a chapter's, never within 5%.
//!
//! Two simpler rules were tried and both fail — see `tests::naive_rules_fail`, which pins
//! the specific book that defeats each one. Both failures have the same root cause: a book
//! whose header line carries two markers at once (its chapter number *and* its volume
//! number, e.g. "第一卷 第一章"), with chapter numbering restarting at the top of every
//! volume. Raw hit count is fooled because the volume marker is repeated once per chapter,
//! not once per volume, so it can out-count the chapter marker. Distinct header count is
//! fooled the other way: chapter numbers repeat across volumes (every volume has a "第一
//!章"), so the number of *distinct* chapter headers collapses to "most chapters in any one
//! volume," well under the number of distinct volume headers.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

/// A header convention this detector recognizes.
///
/// Declaration order in `PATTERN_ORDER` is the tie-break when two candidates' median gaps
/// are within `NEAR_TIE` of each other — see `elect`. `Chapter` and `Section` before
/// `Volume` is what keeps the finer-grained pattern winning on the doubled-header books
/// described above.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PatternId {
    Chapter,
    Section,
    Volume,
    Hui,
    BareNumber,
}

pub const PATTERN_ORDER: [PatternId; 5] = [
    PatternId::Chapter,
    PatternId::Section,
    PatternId::Volume,
    PatternId::Hui,
    PatternId::BareNumber,
];

// Chinese numeral characters a chapter/section/volume number can be written with, on top
// of plain arabic digits — real books mix both freely ("第01章", "第一章").
const CJK_NUMERALS: &str = "0-9〇零一二三四五六七八九十百千两";

static CHAPTER_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(&format!("第[{CJK_NUMERALS}]+章")).unwrap());
static SECTION_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(&format!("第[{CJK_NUMERALS}]+节")).unwrap());
static VOLUME_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(&format!("第[{CJK_NUMERALS}]+卷")).unwrap());
static HUI_RE: Lazy<Regex> = Lazy::new(|| Regex::new(&format!("第[{CJK_NUMERALS}]+回")).unwrap());
// The "prefix" convention: a header that is nothing but a bare number on its own line
// (some scrapes separate chapters this way instead of writing 第...章 at all). Anchored to
// the whole line — an unanchored `\d+` would match any numbered list in the prose (author's
// notes, in-story rules) with the ruinous property that such lines sit one apart, giving a
// tiny, falsely "regular" median gap that can outrank every real header pattern.
static BARE_NUMBER_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\s*\d{1,6}\s*$").unwrap());

fn regex_for(pattern: PatternId) -> &'static Regex {
    match pattern {
        PatternId::Chapter => &CHAPTER_RE,
        PatternId::Section => &SECTION_RE,
        PatternId::Volume => &VOLUME_RE,
        PatternId::Hui => &HUI_RE,
        PatternId::BareNumber => &BARE_NUMBER_RE,
    }
}

/// Minimum occurrences before a pattern is even considered for election.
const MIN_HITS: usize = 5;
/// Minimum fraction of inter-header gaps that must land within `REGULARITY_TOLERANCE`x
/// the median gap.
const MIN_REGULARITY: f64 = 0.8;
/// A gap counts as "regular" when it is no more than this many times the median gap.
const REGULARITY_TOLERANCE: f64 = 4.0;
/// Candidates whose median gap is at most this fraction above the smallest one are tied,
/// and the tie goes to the earliest in `PATTERN_ORDER`. See the module doc for why.
const NEAR_TIE: f64 = 0.05;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternCandidate {
    pub pattern: PatternId,
    pub hit_count: usize,
    /// `None` when there were too few hits (or too few gaps) to mean anything.
    pub median_gap: Option<f64>,
    pub regularity: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterHeader {
    /// The file's own line number — matches the reading-position line numbering.
    pub line: usize,
    /// The header line's own text, trimmed.
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterOutline {
    /// Every pattern's stats, in `PATTERN_ORDER`, whether or not it was elected — the
    /// manual-override control needs all of them, not just the winner.
    pub candidates: Vec<PatternCandidate>,
    /// `None` when no pattern cleared the election thresholds. The book still opens,
    /// scrolls and resumes normally; only the outline degrades.
    pub elected: Option<PatternId>,
    /// Headers for `elected`, or empty when nothing was elected.
    pub headers: Vec<ChapterHeader>,
}

fn median_of_sorted(sorted: &[i64]) -> f64 {
    let n = sorted.len();
    if n % 2 == 1 {
        sorted[n / 2] as f64
    } else {
        (sorted[n / 2 - 1] + sorted[n / 2]) as f64 / 2.0
    }
}

/// Stats for one pattern's hit-line list. `< MIN_HITS` hits, or no positive gap between
/// them (a degenerate single-cluster case), reports `None` for the gap-derived fields
/// rather than a misleading number — the caller's threshold check treats `None` as "not a
/// candidate" either way.
fn stats_for_hits(pattern: PatternId, hits: &[usize]) -> PatternCandidate {
    if hits.len() < MIN_HITS {
        return PatternCandidate { pattern, hit_count: hits.len(), median_gap: None, regularity: None };
    }
    let mut gaps: Vec<i64> = hits
        .windows(2)
        .map(|w| w[1] as i64 - w[0] as i64)
        .filter(|gap| *gap > 0)
        .collect();
    if gaps.is_empty() {
        return PatternCandidate { pattern, hit_count: hits.len(), median_gap: None, regularity: None };
    }
    gaps.sort_unstable();
    let median = median_of_sorted(&gaps);
    let tolerance = median * REGULARITY_TOLERANCE;
    let within = gaps.iter().filter(|gap| (**gap as f64) <= tolerance).count();
    let regularity = within as f64 / gaps.len() as f64;
    PatternCandidate {
        pattern,
        hit_count: hits.len(),
        median_gap: Some(median),
        regularity: Some(regularity),
    }
}

/// Line indices among `lines` where `pattern`'s regex matches — a match anywhere in the
/// line counts, not just at its start, since a header's own text (e.g. "【第一卷 花果山】")
/// is free to wrap the marker in brackets or other decoration.
fn hit_lines(lines: &[&str], pattern: PatternId) -> Vec<usize> {
    let re = regex_for(pattern);
    lines
        .iter()
        .enumerate()
        .filter(|(_, line)| re.is_match(line))
        .map(|(i, _)| i)
        .collect()
}

fn build_headers(lines: &[&str], hits: &[usize]) -> Vec<ChapterHeader> {
    hits.iter()
        .map(|&line| ChapterHeader { line, title: lines[line].trim().to_string() })
        .collect()
}

/// Among candidates clearing both thresholds, the smallest median gap wins; any candidate
/// within `NEAR_TIE` of that smallest median ties with it, and a tie goes to whichever
/// candidate comes first in `candidates` (i.e. earlier in `PATTERN_ORDER`).
fn elect_index(candidates: &[PatternCandidate]) -> Option<usize> {
    let qualifying: Vec<(usize, f64)> = candidates
        .iter()
        .enumerate()
        .filter(|(_, c)| c.hit_count >= MIN_HITS)
        .filter(|(_, c)| c.regularity.is_some_and(|r| r >= MIN_REGULARITY))
        .map(|(i, c)| (i, c.median_gap.expect("regularity implies a median gap")))
        .collect();
    let smallest = qualifying.iter().map(|&(_, m)| m).fold(f64::INFINITY, f64::min);
    qualifying
        .into_iter()
        .find(|&(_, m)| m <= smallest * (1.0 + NEAR_TIE))
        .map(|(i, _)| i)
}

/// Run the full election over every line of a decoded book, and build the winner's header
/// list. `lines` is the book's own line index — line N here must be line N everywhere else
/// a reading position is expressed, so headers can be jumped to directly.
pub fn elect(lines: &[&str]) -> ChapterOutline {
    let mut candidates = Vec::with_capacity(PATTERN_ORDER.len());
    let mut hits_by_pattern = Vec::with_capacity(PATTERN_ORDER.len());
    for &pattern in PATTERN_ORDER.iter() {
        let hits = hit_lines(lines, pattern);
        candidates.push(stats_for_hits(pattern, &hits));
        hits_by_pattern.push(hits);
    }

    let elected_index = elect_index(&candidates);
    let elected = elected_index.map(|i| candidates[i].pattern);
    let headers = elected_index
        .map(|i| build_headers(lines, &hits_by_pattern[i]))
        .unwrap_or_default();

    ChapterOutline { candidates, elected, headers }
}

/// Headers for one specific pattern, bypassing election — the manual-override path. Works
/// for any pattern regardless of its hit count; an override the user picked deliberately is
/// never second-guessed by the same thresholds election applies to itself.
pub fn headers_for_pattern(lines: &[&str], pattern: PatternId) -> Vec<ChapterHeader> {
    build_headers(lines, &hit_lines(lines, pattern))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn lines_of(text: &str) -> Vec<&str> {
        text.lines().collect()
    }

    // ── IPC parity ────────────────────────────────────────────────────────────

    /// `PATTERN_ORDER` holds every `PatternId`, and their serde names are exactly the
    /// TypeScript `CHAPTER_PATTERN_IDS` (`src/types/ReaderTypes.ts`), pinned through
    /// `test-fixtures/chapter-pattern-ids.json`. A name missing on the TypeScript side is
    /// repaired away by `validateBookRecord` on every load, silently.
    #[test]
    fn pattern_ids_match_the_typescript_list() {
        // Exhaustive: a new variant fails to compile here until it is placed in the list.
        fn listed(id: PatternId) -> bool {
            match id {
                PatternId::Chapter
                | PatternId::Section
                | PatternId::Volume
                | PatternId::Hui
                | PatternId::BareNumber => PATTERN_ORDER.contains(&id),
            }
        }
        assert!(PATTERN_ORDER.iter().all(|id| listed(*id)));
        assert_eq!(PATTERN_ORDER.len(), 5, "a variant was added: list it in PATTERN_ORDER");

        let raw = include_str!("../../test-fixtures/chapter-pattern-ids.json");
        let fixture: serde_json::Value = serde_json::from_str(raw).unwrap();
        assert_eq!(serde_json::to_value(PATTERN_ORDER).unwrap(), fixture["ids"]);
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    #[test]
    fn fewer_than_min_hits_is_not_a_candidate() {
        let hits = vec![10, 20, 30, 40];
        let stats = stats_for_hits(PatternId::Chapter, &hits);
        assert_eq!(stats.hit_count, 4);
        assert_eq!(stats.median_gap, None);
        assert_eq!(stats.regularity, None);
    }

    #[test]
    fn perfectly_regular_hits_score_full_regularity() {
        let hits: Vec<usize> = (0..10).map(|i| i * 100).collect();
        let stats = stats_for_hits(PatternId::Chapter, &hits);
        assert_eq!(stats.hit_count, 10);
        assert_eq!(stats.median_gap, Some(100.0));
        assert_eq!(stats.regularity, Some(1.0));
    }

    #[test]
    fn one_wildly_irregular_gap_drops_regularity_below_threshold() {
        // Nine gaps of 100, one gap of 500 (5x the median) — one gap out of tolerance.
        let mut hits = vec![0];
        for _ in 0..9 {
            hits.push(hits.last().unwrap() + 100);
        }
        hits.push(hits.last().unwrap() + 500);
        let stats = stats_for_hits(PatternId::Chapter, &hits);
        assert_eq!(stats.median_gap, Some(100.0));
        // 9 of 10 gaps are within 4x the median.
        assert_eq!(stats.regularity, Some(0.9));
    }

    #[test]
    fn even_hit_count_medians_between_the_two_middle_gaps() {
        let hits = vec![0, 10, 25, 45, 65]; // gaps: 10, 15, 20, 20 -> median (15+20)/2
        let stats = stats_for_hits(PatternId::Chapter, &hits);
        assert_eq!(stats.median_gap, Some(17.5));
    }

    // ── Election ──────────────────────────────────────────────────────────────

    #[test]
    fn elects_the_smallest_median_among_qualifying_candidates() {
        let fine: Vec<usize> = (0..10).map(|i| i * 50).collect(); // median 50
        let coarse: Vec<usize> = (0..10).map(|i| i * 500).collect(); // median 500
        let candidates = vec![
            stats_for_hits(PatternId::Volume, &coarse),
            stats_for_hits(PatternId::Chapter, &fine),
        ];
        let winner = elect_index(&candidates).map(|i| candidates[i].pattern);
        assert_eq!(winner, Some(PatternId::Chapter));
    }

    #[test]
    fn a_pattern_below_the_regularity_threshold_never_wins_even_with_a_smaller_median() {
        // Irregular hits with a tiny median (barely qualifies on hit count, fails on
        // regularity: 2 of 5 gaps are wild outliers) must lose to a coarser but
        // perfectly regular pattern.
        let irregular = vec![0, 1, 2, 1000, 1001, 2000];
        let regular: Vec<usize> = (0..10).map(|i| i * 300).collect();
        let candidates = vec![
            stats_for_hits(PatternId::Chapter, &irregular),
            stats_for_hits(PatternId::Volume, &regular),
        ];
        let winner = elect_index(&candidates).map(|i| candidates[i].pattern);
        assert_eq!(winner, Some(PatternId::Volume));
    }

    #[test]
    fn no_candidate_clears_the_threshold_elects_nothing() {
        let too_few = vec![10, 20];
        let candidates = vec![stats_for_hits(PatternId::Chapter, &too_few)];
        assert_eq!(elect_index(&candidates), None);
    }

    #[test]
    fn a_near_tie_goes_to_the_earlier_pattern() {
        // Tầm Tần ký's shape: the volume marker sits on every chapter heading, plus one
        // volume-only line, so Volume's median lands half a line under Chapter's.
        let chapter: Vec<usize> = (0..10).map(|i| i * 229).collect(); // median 229
        let volume: Vec<usize> = (0..10).map(|i| i * 228).collect(); // median 228
        let candidates = vec![
            stats_for_hits(PatternId::Chapter, &chapter),
            stats_for_hits(PatternId::Volume, &volume),
        ];
        let winner = elect_index(&candidates).map(|i| candidates[i].pattern);
        assert_eq!(winner, Some(PatternId::Chapter));
    }

    #[test]
    fn a_later_pattern_more_than_near_tie_finer_still_wins() {
        let chapter: Vec<usize> = (0..10).map(|i| i * 100).collect(); // median 100
        let section: Vec<usize> = (0..10).map(|i| i * 94).collect(); // 6% finer
        let candidates = vec![
            stats_for_hits(PatternId::Chapter, &chapter),
            stats_for_hits(PatternId::Section, &section),
        ];
        let winner = elect_index(&candidates).map(|i| candidates[i].pattern);
        assert_eq!(winner, Some(PatternId::Section));
    }

    #[test]
    fn an_exact_median_tie_is_broken_by_declaration_order() {
        // Both patterns land on median 100 — the earlier-declared one (Chapter, since
        // PATTERN_ORDER lists it before Volume) must win, not the later one.
        let a: Vec<usize> = (0..10).map(|i| i * 100).collect();
        let b: Vec<usize> = (0..10).map(|i| i * 100 + 5).collect();
        let candidates = vec![
            stats_for_hits(PatternId::Chapter, &a),
            stats_for_hits(PatternId::Volume, &b),
        ];
        let winner = elect_index(&candidates).map(|i| candidates[i].pattern);
        assert_eq!(winner, Some(PatternId::Chapter));

        // Reversed declaration order flips the tie-break too, proving it's position in
        // the candidate list — not some hidden property of `PatternId` — that decides.
        let candidates_reversed = vec![
            stats_for_hits(PatternId::Volume, &b),
            stats_for_hits(PatternId::Chapter, &a),
        ];
        let winner_reversed =
            elect_index(&candidates_reversed).map(|i| candidates_reversed[i].pattern);
        assert_eq!(winner_reversed, Some(PatternId::Volume));
    }

    // ── End-to-end on synthetic text ──────────────────────────────────────────

    #[test]
    fn elects_chapter_and_returns_its_headers_with_line_numbers() {
        let mut text = String::new();
        for n in 1..=8 {
            text.push_str(&format!("第{n}章 标题{n}\n"));
            for _ in 0..20 {
                text.push_str("正文正文正文\n");
            }
        }
        let lines = lines_of(&text);
        let outline = elect(&lines);
        assert_eq!(outline.elected, Some(PatternId::Chapter));
        assert_eq!(outline.headers.len(), 8);
        assert_eq!(outline.headers[0], ChapterHeader { line: 0, title: "第1章 标题1".to_string() });
        assert_eq!(outline.headers[1].line, 21);
        let chapter_stats = outline
            .candidates
            .iter()
            .find(|c| c.pattern == PatternId::Chapter)
            .unwrap();
        assert_eq!(chapter_stats.hit_count, 8);
    }

    #[test]
    fn a_book_with_no_structure_elects_nothing_but_still_reports_every_candidate() {
        let text = "just some prose\nwith no headers at all\nspanning a few lines\n";
        let lines = lines_of(text);
        let outline = elect(&lines);
        assert_eq!(outline.elected, None);
        assert!(outline.headers.is_empty());
        assert_eq!(outline.candidates.len(), PATTERN_ORDER.len());
    }

    #[test]
    fn manual_override_returns_headers_for_a_pattern_that_did_not_win() {
        let mut text = String::new();
        for n in 1..=8 {
            text.push_str(&format!("第{n}章 标题{n}\n"));
        }
        text.push_str("第1卷 卷标题\n");
        let lines = lines_of(&text);
        let headers = headers_for_pattern(&lines, PatternId::Volume);
        assert_eq!(headers.len(), 1);
        assert_eq!(headers[0].title, "第1卷 卷标题");
    }

    #[test]
    fn a_bare_arabic_line_amid_prose_is_not_mistaken_for_a_header() {
        // "5." at the start of a prose line (an author's numbered list) must not match the
        // bare-number pattern, which requires the WHOLE line to be nothing but the number.
        let lines = lines_of("5. this is prose, not a chapter marker\n");
        assert!(hit_lines(&lines, PatternId::BareNumber).is_empty());
    }

    // ── Corpus ────────────────────────────────────────────────────────────────
    //
    // Mirrors `book_loader`'s corpus access: the real library is the fixture the election
    // rule was derived against, so it is also what pins it. Skippable/overridable
    // the same way.

    fn corpus_dir() -> Option<PathBuf> {
        if std::env::var("SKIP_READER_CORPUS_TESTS").is_ok() {
            eprintln!("SKIP_READER_CORPUS_TESTS set — corpus assertions did not run");
            return None;
        }
        let dir = std::env::var("READER_CORPUS_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(std::env::var("HOME").unwrap_or_default())
                    .join("Downloads")
                    .join("_FICTION")
            });
        assert!(
            dir.is_dir(),
            "Reader corpus not found at {}. Set READER_CORPUS_DIR, or \
             SKIP_READER_CORPUS_TESTS=1 to acknowledge running without it.",
            dir.display()
        );
        Some(dir)
    }

    fn corpus_books() -> Vec<PathBuf> {
        let Some(dir) = corpus_dir() else { return Vec::new() };
        let mut books: Vec<PathBuf> = std::fs::read_dir(&dir)
            .expect("corpus directory is readable")
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && p.extension().is_some_and(|e| e == "txt"))
            .collect();
        books.sort();
        books
    }

    /// Decode a corpus file the same way `book_loader::load_book` would, using its own
    /// detector — falling back to a GBK override for the one book detection refuses (its
    /// chapter structure is real regardless of the encoding prompt this book also
    /// triggers in `book_loader`'s own tests).
    fn decode_corpus_file(path: &PathBuf) -> String {
        let bytes = std::fs::read(path).expect("corpus file is readable");
        match crate::book_loader::load_book(&bytes, None).expect("load must not error") {
            crate::book_loader::LoadOutcome::Loaded(content) => content.text,
            crate::book_loader::LoadOutcome::NeedsEncodingChoice(_) => {
                match crate::book_loader::load_book(&bytes, Some("GBK")).expect("override decodes") {
                    crate::book_loader::LoadOutcome::Loaded(content) => content.text,
                    crate::book_loader::LoadOutcome::NeedsEncodingChoice(_) => {
                        panic!("an explicit override must never ask again")
                    }
                }
            }
        }
    }

    /// The pattern a human reading each book would call its "chapter" — derived from the
    /// same prototype run that produced the election rule above, and confirmed book by
    /// book when the corpus grew to 33 (2026-09-27) and to 55 (2026-09-29). `Section` for
    /// the six books that use "第...节" as their actual chapter marker rather than "第...章".
    /// `None` for the two whose headings carry no 第 marker at all ("一、初见古伊娜！",
    /// "1.重生蜥蜴") — no pattern recognizes those, so the outline degrades, as designed.
    ///
    /// Matched on the Chinese half of the title only, never the Vietnamese half: macOS
    /// normalizes a directory listing's file names to NFD (diacritics decomposed), so a
    /// literal NFC string (as typed in this source file) can silently fail to
    /// byte-compare equal to what `read_dir` hands back. CJK characters have no
    /// decomposition, so they compare equal in both forms.
    fn expected_pattern(file_name: &str) -> Option<PatternId> {
        // A book is named by characters its title must all contain; the first match wins.
        const EXCEPTIONS: &[(&[char], Option<PatternId>)] = &[
            (&['不', '败'], Some(PatternId::Section)), // Bất bại chiến thần 不败战神
            (&['卡', '徒'], Some(PatternId::Section)), // Tạp đồ 卡徒
            // Not `修` + `真` alone: `Tu chân liêu thiên quần 修真聊天群` shares both and is
            // a "第...章" book.
            (&['修', '世', '界'], Some(PatternId::Section)), // Tu chân thế giới 修真世界
            (&['唐', '砖'], Some(PatternId::Section)), // Đường chuyên 唐砖
            (&['隐', '杀'], Some(PatternId::Section)), // Ẩn sát 隐杀
            (&['比', '蒙'], Some(PatternId::Section)), // Bỉ mông truyền kỳ 比蒙传奇
            (&['兽', '血'], None), // Hải tặc vương chi thú huyết phí đằng 海贼王之兽血沸腾
            (&['巨', '蜥'], None), // Trọng lâm cự tích 重林巨蜥
        ];
        EXCEPTIONS
            .iter()
            .find(|(chars, _)| chars.iter().all(|&c| file_name.contains(c)))
            .map_or(Some(PatternId::Chapter), |&(_, pattern)| pattern)
    }

    #[test]
    fn every_corpus_book_elects_the_pattern_a_reader_would_call_its_chapter() {
        let books = corpus_books();
        if books.is_empty() {
            return;
        }
        assert_eq!(books.len(), 55, "corpus size changed — update the expectations");

        for path in books {
            let file_name = path.file_name().unwrap().to_string_lossy().to_string();
            let text = decode_corpus_file(&path);
            let lines: Vec<&str> = text.lines().collect();
            let outline = elect(&lines);
            let expected = expected_pattern(&file_name);
            assert_eq!(outline.elected, expected, "{}", file_name);
            assert_eq!(outline.headers.is_empty(), expected.is_none(), "{}", file_name);
            // Headers must be in ascending line order — jump navigation depends on it.
            assert!(
                outline.headers.windows(2).all(|w| w[0].line < w[1].line),
                "{}: headers out of order",
                file_name
            );
        }
    }

    // ── The two naive elections that were tried and rejected ─────────────────
    //
    // Both are pinned against one book, `DOUBLED_HEADER_BOOK`, because it is the only one
    // in the corpus that defeats either. Checked 2026-09-27 against all 33 books then in
    // the library (issue #34): on every other book, raw hit count and distinct header
    // count both elect what `elect` does. Two claims in the Reader spec (#21) do not hold
    // on the current corpus, so don't go looking for them:
    //
    // - Raw hit count does not fail on `Tạp đồ 卡徒`. Its 600 repeated `第一集` lines are
    //   not a candidate at all, since `集` is not one of the patterns (`regex_for`), so
    //   they cannot outvote its 510 `第X节` headers.
    // - Distinct header count does not fail on the books whose chapter numbering restarts
    //   every volume (`Tru tiên 诛仙`, `Vô hạn khủng bố 无限恐怖`, `Cửu đỉnh ký 九鼎记`).
    //   The last two have no volume headers at all; `Tru tiên`'s 282 chapter headings still
    //   outnumber its 23 volumes as distinct strings.
    //
    // A new book that defeats a naive rule belongs here as its own pinned case.

    /// The failure mode this pins: a book whose header line carries the volume marker on
    /// every chapter heading, so raw occurrence count favors the coarser pattern.
    fn elect_by_raw_hit_count(candidates: &[PatternCandidate]) -> Option<PatternId> {
        candidates
            .iter()
            .filter(|c| c.hit_count >= MIN_HITS)
            .max_by_key(|c| c.hit_count)
            .map(|c| c.pattern)
    }

    /// The failure mode this pins: a book whose chapter numbering restarts every volume,
    /// so the number of *distinct* chapter headers collapses to "most chapters in one
    /// volume" — far below the number of distinct volume headers.
    fn elect_by_distinct_header_count(lines: &[&str]) -> Option<PatternId> {
        let mut best: Option<(PatternId, usize)> = None;
        for &pattern in PATTERN_ORDER.iter() {
            let hits = hit_lines(lines, pattern);
            if hits.len() < MIN_HITS {
                continue;
            }
            let re = regex_for(pattern);
            let distinct: std::collections::HashSet<&str> = hits
                .iter()
                .map(|&i| re.find(lines[i]).unwrap().as_str())
                .collect();
            let count = distinct.len();
            if best.is_none_or(|(_, best_count)| count > best_count) {
                best = Some((pattern, count));
            }
        }
        best.map(|(pattern, _)| pattern)
    }

    const DOUBLED_HEADER_BOOK: &str = "Đại Đường song long truyền 大唐双龙传.txt";

    #[test]
    fn raw_hit_count_election_wrongly_picks_volume_on_the_doubled_header_book() {
        let Some(dir) = corpus_dir() else { return };
        let path = dir.join(DOUBLED_HEADER_BOOK);
        assert!(path.is_file(), "fixture book missing: {}", DOUBLED_HEADER_BOOK);
        let text = decode_corpus_file(&path);
        let lines: Vec<&str> = text.lines().collect();
        let outline = elect(&lines);

        // The rule this crate actually uses gets it right.
        assert_eq!(outline.elected, Some(PatternId::Chapter));
        // The naive rule does not: it hands the win to the volume marker, because that
        // marker repeats on every chapter's own heading line, not once per volume.
        assert_eq!(elect_by_raw_hit_count(&outline.candidates), Some(PatternId::Volume));
    }

    #[test]
    fn distinct_header_count_election_wrongly_picks_volume_on_the_doubled_header_book() {
        let Some(dir) = corpus_dir() else { return };
        let path = dir.join(DOUBLED_HEADER_BOOK);
        assert!(path.is_file(), "fixture book missing: {}", DOUBLED_HEADER_BOOK);
        let text = decode_corpus_file(&path);
        let lines: Vec<&str> = text.lines().collect();
        let outline = elect(&lines);

        assert_eq!(outline.elected, Some(PatternId::Chapter));
        // The naive rule does not: chapter numbering restarts every volume, so the set of
        // distinct chapter-header strings ("第一章".."第N章" for the longest volume) is far
        // smaller than the set of distinct volume-header strings (one per volume, and they
        // never repeat).
        assert_eq!(elect_by_distinct_header_count(&lines), Some(PatternId::Volume));
    }
}
