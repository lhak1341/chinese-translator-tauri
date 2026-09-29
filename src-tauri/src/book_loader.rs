//! Book loading: raw bytes in, decoded lines + line index + encoding report out.
//!
//! This module is deliberately pure — no Tauri, no filesystem, no state. The Tauri
//! commands in `book_commands.rs` are thin wrappers that read a file and call in here,
//! so everything worth testing is testable from a byte slice.
//!
//! Three decisions are load-bearing and documented where they are implemented:
//!
//! 1. Detection runs on a 64 KiB prefix, not the whole file. Detection is roughly two
//!    orders of magnitude slower than decoding, and a prefix is equally decisive.
//! 2. GB2312, GBK and GB18030 are three labels but one decoder. We report `GBK` plus a
//!    `strictly_clean` flag rather than inventing a distinction the decoder cannot make.
//! 3. A single-byte detection result (`windows-1252` and friends) is a red flag, not an
//!    answer: one malformed byte anywhere disqualifies the correct multi-byte encoding in
//!    the detector, and a single-byte encoding then decodes every byte without error,
//!    producing whole-file mojibake that looks like success.

use chardetng::EncodingDetector;
use encoding_rs::Encoding;
use serde::{Deserialize, Serialize};

/// Bytes of the file used for encoding detection and for the fingerprint prefix hash.
pub const PREFIX_BYTES: usize = 64 * 1024;

/// Encodings a user may pick manually, and the pool the multi-byte tiebreak ranks over.
/// Every entry is multi-byte on purpose — see `rank_multibyte_candidates`.
pub const CANDIDATE_ENCODINGS: [&str; 3] = ["GBK", "UTF-8", "Big5"];

// ============================================================================
// Fingerprint
// ============================================================================

/// FNV-1a, 64-bit. The existing content-hash helper is unusable here: it is a 32-bit
/// hash over *decoded text*, and the fingerprint has to exist before the encoding is
/// trusted. This one takes raw bytes and never decodes.
fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// A book's identity: byte size plus a hash of its first 64 KB of raw bytes.
///
/// Size is free — the library listing already needs it — and it removes the one
/// realistic prefix collision, two files that share a boilerplate header.
pub fn fingerprint(size: u64, prefix: &[u8]) -> String {
    let head = &prefix[..prefix.len().min(PREFIX_BYTES)];
    format!("{:016x}-{:016x}", size, fnv1a64(head))
}

// ============================================================================
// Encoding report
// ============================================================================

/// Why an encoding choice is or is not trustworthy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EncodingConfidence {
    /// A BOM, or a multi-byte detection that decodes the prefix without errors.
    High,
    /// The detector's answer decodes the prefix but with malformed sequences in it.
    Medium,
    /// The detector answered with a single-byte encoding, or nothing decodes cleanly.
    /// The book must not be opened on this answer alone.
    Low,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodingReport {
    /// The label the book will actually be decoded with.
    pub label: String,
    /// What the detector said, before any of our own correction. Kept so the UI can
    /// explain *why* an override is being asked for.
    pub detected_label: String,
    pub confidence: EncodingConfidence,
    /// GB-family only: true when the bytes stay inside GBK proper — no GB18030-only
    /// four-byte sequences, no user-defined code points, no malformed sequences. Always
    /// false for other encodings, where the distinction is meaningless.
    ///
    /// Detection only ever sees the 64 KiB prefix, so the value a report carries out of
    /// `detect_encoding` is provisional: a book can be clean for its whole first chapter
    /// and reach outside GBK thousands of pages later. `load_book` re-decides it over the
    /// whole file once the text exists — which is the value that reaches the UI.
    pub strictly_clean: bool,
    /// Set when the user (not the detector) chose the encoding.
    pub overridden: bool,
    /// Human-readable justification, shown next to the override control.
    pub reason: Option<String>,
    /// Encodings offered in the manual override, best guess first.
    pub candidates: Vec<String>,
}

impl EncodingReport {
    /// A book at `Low` confidence must never be rendered on the detector's word alone —
    /// that is exactly the whole-file-mojibake case.
    pub fn needs_manual_choice(&self) -> bool {
        !self.overridden && self.confidence == EncodingConfidence::Low
    }
}

/// Normalize the three GB labels onto the one decoder that serves all of them, and
/// give every other encoding its canonical name.
fn canonical_label(encoding: &'static Encoding) -> String {
    match encoding.name() {
        "GBK" | "gb18030" | "GB18030" => "GBK".to_string(),
        other => other.to_string(),
    }
}

/// The `encoding_rs` decoder for a label, with the GB labels collapsed onto GB18030 —
/// the superset decoder, which is byte-for-byte the GBK decoder over GBK input.
pub fn encoding_for_label(label: &str) -> Option<&'static Encoding> {
    match label.to_ascii_lowercase().as_str() {
        "gbk" | "gb2312" | "gb18030" => Some(encoding_rs::GB18030),
        _ => Encoding::for_label(label.as_bytes()),
    }
}

/// True for encodings that map every possible byte to some character. They can never
/// fail, so they can never lose a "which encoding produced fewer replacement characters"
/// contest — which is why such a tiebreak must exclude them rather than rank them.
fn is_single_byte(encoding: &'static Encoding) -> bool {
    encoding.is_single_byte()
}

/// Rank multi-byte candidates by how cleanly they decode `bytes`, fewest malformed
/// sequences first. Single-byte encodings are excluded from the pool entirely, not
/// merely scored low: they produce zero replacement characters on any input and would
/// win every tiebreak with mojibake.
pub fn rank_multibyte_candidates(bytes: &[u8]) -> Vec<(String, usize)> {
    let mut ranked: Vec<(String, usize)> = CANDIDATE_ENCODINGS
        .iter()
        .filter_map(|label| {
            let encoding = encoding_for_label(label)?;
            if is_single_byte(encoding) {
                return None;
            }
            Some((canonical_label(encoding), count_malformed(encoding, bytes)))
        })
        .collect();
    // Stable sort: ties keep CANDIDATE_ENCODINGS order, which puts the encoding this
    // library actually uses first. Alphabetical tiebreaking would hand a tie to Big5.
    ranked.sort_by_key(|(_, malformed)| *malformed);
    ranked
}

/// Number of U+FFFD replacement characters `encoding` emits over `bytes`.
fn count_malformed(encoding: &'static Encoding, bytes: &[u8]) -> usize {
    let (text, _, had_errors) = encoding.decode(bytes);
    if !had_errors {
        return 0;
    }
    text.chars().filter(|c| *c == '\u{FFFD}').count()
}

/// True when the GB decoder stays inside GBK proper: no malformed sequences, no
/// GB18030-only four-byte sequences, and no user-defined code points (which decode into
/// the Unicode private use area and render as blanks or as whatever font happens to be
/// loaded). One decoder serves GB2312, GBK and GB18030, so this flag — not a separate
/// label — is the only honest way to say how far outside GBK proper a file reaches.
fn gb_strictly_clean(bytes: &[u8]) -> bool {
    if has_gb18030_four_byte_sequence(bytes) {
        return false;
    }
    let (text, _, had_errors) = encoding_rs::GB18030.decode(bytes);
    !had_errors && !text.chars().any(is_private_use)
}

/// Unicode private use area, including the two supplementary planes. GB18030 maps its
/// user-defined byte ranges here.
fn is_private_use(c: char) -> bool {
    matches!(c, '\u{E000}'..='\u{F8FF}' | '\u{F0000}'..='\u{FFFFD}' | '\u{100000}'..='\u{10FFFD}')
}

/// True when `bytes` contain a GB18030 four-byte sequence — the part of GB18030 that
/// GBK proper does not have.
fn has_gb18030_four_byte_sequence(bytes: &[u8]) -> bool {
    let mut i = 0;
    while i < bytes.len() {
        let byte = bytes[i];
        if byte < 0x80 {
            i += 1;
        } else if (0x81..=0xFE).contains(&byte) && i + 1 < bytes.len() {
            let second = bytes[i + 1];
            if (0x30..=0x39).contains(&second) {
                return true;
            }
            i += 2;
        } else {
            i += 1;
        }
    }
    false
}

/// Detect the encoding of a file from its prefix.
///
/// `prefix` is the first `PREFIX_BYTES` of the file (or the whole file, if shorter);
/// `is_whole_file` tells the detector whether more bytes follow.
pub fn detect_encoding(prefix: &[u8], is_whole_file: bool) -> EncodingReport {
    let mut detector = EncodingDetector::new();
    detector.feed(prefix, is_whole_file);
    report_from_detection(detector.guess(None, true), prefix)
}

/// Turn one detector answer into a report. Split out from `detect_encoding` so the
/// single-byte policy below can be tested directly: chardetng tolerates a stray byte or
/// two and keeps its multi-byte answer, so a synthetic fixture cannot be relied on to
/// drive the detector down this branch.
pub fn report_from_detection(detected: &'static Encoding, prefix: &[u8]) -> EncodingReport {
    let detected_label = detected.name().to_string();

    let ranked = rank_multibyte_candidates(prefix);
    let candidates: Vec<String> = ranked.iter().map(|(label, _)| label.clone()).collect();

    // A single-byte guess is the mojibake trap: it decodes anything, so the detector
    // reaching for one means every multi-byte encoding was disqualified by a stray byte.
    // Fall back to the best-decoding multi-byte encoding as a *suggestion* only, and
    // report Low so the caller has to ask the user.
    if is_single_byte(detected) {
        let suggestion = candidates
            .first()
            .cloned()
            .unwrap_or_else(|| "UTF-8".to_string());
        return EncodingReport {
            label: suggestion,
            detected_label,
            confidence: EncodingConfidence::Low,
            strictly_clean: false,
            overridden: false,
            reason: Some(
                "The detector fell back to a single-byte Western encoding, which decodes \
                 any byte sequence without error. That usually means one malformed byte \
                 disqualified the real encoding. Choose the encoding manually."
                    .to_string(),
            ),
            candidates,
        };
    }

    let label = canonical_label(detected);
    let malformed = count_malformed(detected, prefix);
    let confidence = if malformed == 0 {
        EncodingConfidence::High
    } else {
        EncodingConfidence::Medium
    };
    let strictly_clean = label == "GBK" && gb_strictly_clean(prefix);
    let reason = if malformed > 0 {
        Some(format!(
            "{} decoded the sample with {} malformed sequence(s).",
            label, malformed
        ))
    } else {
        None
    };

    EncodingReport {
        label,
        detected_label,
        confidence,
        strictly_clean,
        overridden: false,
        reason,
        candidates,
    }
}

/// Build the report for a user-chosen encoding. No detection runs — the user's answer
/// is authoritative — but the strictness flag and malformed count are still reported.
pub fn report_for_override(bytes: &[u8], label: &str) -> Result<EncodingReport, String> {
    let encoding = encoding_for_label(label)
        .ok_or_else(|| format!("Unknown encoding label: {}", label))?;
    let canonical = canonical_label(encoding);
    let malformed = count_malformed(encoding, bytes);
    let strictly_clean = canonical == "GBK" && gb_strictly_clean(bytes);
    Ok(EncodingReport {
        label: canonical,
        detected_label: label.to_string(),
        confidence: if malformed == 0 {
            EncodingConfidence::High
        } else {
            EncodingConfidence::Medium
        },
        strictly_clean,
        overridden: true,
        reason: if malformed > 0 {
            Some(format!(
                "Decoded with {} malformed sequence(s) at your chosen encoding.",
                malformed
            ))
        } else {
            None
        },
        candidates: CANDIDATE_ENCODINGS.iter().map(|s| s.to_string()).collect(),
    })
}

// ============================================================================
// Decoding and the line index
// ============================================================================

/// A decoded book: one text buffer plus an index of logical lines into it.
///
/// Lines are stored as offsets rather than owned `String`s — a 16 MB novel is ~190,000
/// lines, and one allocation per line is pure overhead when every read is a range.
pub struct BookContent {
    pub text: String,
    /// `(start, end)` byte offsets into `text`, terminators already stripped.
    pub lines: Vec<(usize, usize)>,
    pub encoding: EncodingReport,
}

impl BookContent {
    pub fn line_count(&self) -> usize {
        self.lines.len()
    }

    /// Every line as a borrowed slice, in file order — line N here is line N everywhere
    /// else a line number is used (reading position, chapter headers). Used by chapter
    /// detection, which scans the whole book rather than a viewport window.
    pub fn line_slices(&self) -> Vec<&str> {
        self.lines.iter().map(|&(start, end)| &self.text[start..end]).collect()
    }

    /// Lines `[start, end)`, clamped to the book. Blank lines come back as empty
    /// strings: roughly half of a novel is blank, reading position is a raw file line
    /// number, and dropping them server-side would create two numbering systems.
    pub fn slice(&self, start: usize, end: usize) -> Vec<String> {
        if start >= self.lines.len() || end <= start {
            return Vec::new();
        }
        let end = end.min(self.lines.len());
        self.lines[start..end]
            .iter()
            .map(|(from, to)| self.text[*from..*to].to_string())
            .collect()
    }
}

/// Index logical lines, stripping `\r\n` and `\n` terminators.
///
/// Line endings are not uniform across a real library: most files are CRLF, some are
/// LF-only. Normalizing here means the frontend never sees the difference. A trailing
/// terminator does not produce a phantom final line.
pub fn index_lines(text: &str) -> Vec<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut lines = Vec::new();
    let mut start = 0usize;
    for (i, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' {
            let mut end = i;
            if end > start && bytes[end - 1] == b'\r' {
                end -= 1;
            }
            lines.push((start, end));
            start = i + 1;
        }
    }
    if start < bytes.len() {
        let mut end = bytes.len();
        if end > start && bytes[end - 1] == b'\r' {
            end -= 1;
        }
        lines.push((start, end));
    }
    lines
}

/// What `open_book` does with a file, once its bytes are in hand.
pub enum LoadOutcome {
    /// Decoded and ready to read.
    Loaded(BookContent),
    /// The encoding could not be established. The book is *not* decoded — surfacing
    /// mojibake as if it were the book is the failure this branch exists to prevent.
    NeedsEncodingChoice(EncodingReport),
}

/// Decode a whole file. `override_label` bypasses detection entirely.
pub fn load_book(bytes: &[u8], override_label: Option<&str>) -> Result<LoadOutcome, String> {
    let prefix_len = bytes.len().min(PREFIX_BYTES);
    let report = match override_label {
        Some(label) => report_for_override(&bytes[..prefix_len], label)?,
        None => detect_encoding(&bytes[..prefix_len], bytes.len() <= PREFIX_BYTES),
    };

    if report.needs_manual_choice() {
        return Ok(LoadOutcome::NeedsEncodingChoice(report));
    }

    let encoding = encoding_for_label(&report.label)
        .ok_or_else(|| format!("Unknown encoding label: {}", report.label))?;
    let (text, _, had_errors) = encoding.decode(bytes);
    let text = text.into_owned();

    // Both reports above judged strictness from the 64 KiB prefix, because that is all
    // detection reads. Now that the whole file is decoded, re-decide it from the whole
    // file — reusing this decode rather than paying for a second one.
    let mut report = report;
    if report.label == "GBK" {
        report.strictly_clean = !had_errors
            && !has_gb18030_four_byte_sequence(bytes)
            && !text.chars().any(is_private_use);
    }

    let lines = index_lines(&text);
    Ok(LoadOutcome::Loaded(BookContent {
        text,
        lines,
        encoding: report,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // ── Corpus access ─────────────────────────────────────────────────────────
    //
    // Encoding and line-ending decisions here were derived from a real library, so the
    // real library is the fixture — a synthetic one would let a regression pass. The
    // path is overridable, and a missing corpus fails loudly rather than skipping
    // silently, unless the opt-out is set explicitly.

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

    fn corpus_file(name: &str) -> Option<Vec<u8>> {
        let dir = corpus_dir()?;
        let path = dir.join(name);
        assert!(path.is_file(), "Corpus file missing: {}", path.display());
        Some(std::fs::read(path).expect("corpus file is readable"))
    }

    /// Every `.txt` directly in the corpus root, sorted. Sub-directories (backups) are
    /// not part of the library.
    fn corpus_books() -> Vec<PathBuf> {
        let Some(dir) = corpus_dir() else {
            return Vec::new();
        };
        let mut books: Vec<PathBuf> = std::fs::read_dir(dir)
            .expect("corpus directory is readable")
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && p.extension().is_some_and(|e| e == "txt"))
            .collect();
        books.sort();
        books
    }

    // Names are identifiers, not content. Each is load-bearing for a specific decision.
    const GBK_CRLF_BOOK: &str = "Tạp đồ 卡徒.txt";
    const LF_ONLY_BOOK: &str = "Phàm nhân tu tiên truyện 凡人修仙传.txt";
    const GB18030_BOOK: &str = "Tru tiên 诛仙.txt";
    const MIXED_ENCODING_BOOK: &str = "淫荡少妇系列合集.txt";

    // ── Fingerprint ───────────────────────────────────────────────────────────

    #[test]
    fn fingerprint_is_stable_for_identical_bytes() {
        let bytes = b"chapter one\r\nchapter two\r\n";
        assert_eq!(
            fingerprint(bytes.len() as u64, bytes),
            fingerprint(bytes.len() as u64, bytes)
        );
    }

    #[test]
    fn fingerprint_distinguishes_different_content_at_equal_size() {
        let a = b"aaaaaaaa";
        let b = b"aaaaaaab";
        assert_ne!(fingerprint(8, a), fingerprint(8, b));
    }

    #[test]
    fn fingerprint_distinguishes_equal_prefixes_at_different_sizes() {
        // The realistic prefix collision: two files sharing a boilerplate header.
        let prefix = b"SHARED LIBRARY HEADER";
        assert_ne!(fingerprint(1_000, prefix), fingerprint(2_000, prefix));
    }

    #[test]
    fn fingerprint_ignores_bytes_past_the_prefix_window() {
        let mut long = vec![b'x'; PREFIX_BYTES + 64];
        let baseline = fingerprint(9_999, &long);
        long[PREFIX_BYTES + 10] = b'y';
        assert_eq!(baseline, fingerprint(9_999, &long));
    }

    #[test]
    fn fingerprint_survives_a_rename_and_separates_two_books() {
        let Some(dir) = corpus_dir() else { return };
        let bytes = std::fs::read(dir.join(GBK_CRLF_BOOK)).expect("corpus file is readable");
        let before = fingerprint(bytes.len() as u64, &bytes);

        // Copy the book somewhere else under a different name and fingerprint what comes
        // back off disk, so the rename is a real one rather than true by construction.
        let moved = std::env::temp_dir().join(format!(
            "reader-renamed-{}-{}.txt",
            std::process::id(),
            "book"
        ));
        std::fs::write(&moved, &bytes).expect("temp copy is writable");
        let reread = std::fs::read(&moved).expect("temp copy is readable");
        let _ = std::fs::remove_file(&moved);
        assert_eq!(before, fingerprint(reread.len() as u64, &reread));

        let other = std::fs::read(dir.join(GB18030_BOOK)).expect("corpus file is readable");
        assert_ne!(before, fingerprint(other.len() as u64, &other));
    }

    // ── Line index ────────────────────────────────────────────────────────────

    #[test]
    fn index_lines_strips_crlf_and_keeps_blank_lines() {
        let text = "one\r\n\r\ntwo\r\n";
        let lines = index_lines(text);
        let rendered: Vec<&str> = lines.iter().map(|(a, b)| &text[*a..*b]).collect();
        assert_eq!(rendered, vec!["one", "", "two"]);
    }

    #[test]
    fn index_lines_handles_lf_only_files() {
        let text = "one\n\ntwo\n";
        let lines = index_lines(text);
        let rendered: Vec<&str> = lines.iter().map(|(a, b)| &text[*a..*b]).collect();
        assert_eq!(rendered, vec!["one", "", "two"]);
    }

    #[test]
    fn index_lines_keeps_an_unterminated_final_line() {
        let text = "one\r\ntwo";
        assert_eq!(index_lines(text).len(), 2);
    }

    #[test]
    fn index_lines_does_not_invent_a_trailing_line() {
        assert_eq!(index_lines("one\r\n").len(), 1);
        assert_eq!(index_lines("one\n").len(), 1);
        assert_eq!(index_lines("").len(), 0);
    }

    #[test]
    fn slice_clamps_and_preserves_blank_lines_as_empty_strings() {
        let content = match load_book("a\r\n\r\nb\r\nc\r\n".as_bytes(), Some("UTF-8")).unwrap() {
            LoadOutcome::Loaded(content) => content,
            LoadOutcome::NeedsEncodingChoice(_) => panic!("override must decode"),
        };
        assert_eq!(content.line_count(), 4);
        assert_eq!(content.slice(0, 4), vec!["a", "", "b", "c"]);
        assert_eq!(content.slice(2, 99), vec!["b", "c"]);
        assert!(content.slice(99, 120).is_empty());
        assert!(content.slice(3, 1).is_empty());
    }

    // ── The replacement-character tiebreak trap ───────────────────────────────

    #[test]
    fn single_byte_encodings_never_enter_the_tiebreak() {
        // windows-1252 decodes any byte sequence with zero replacement characters, so a
        // ranking that included it would hand it every contest. The pool must exclude it.
        let bytes = encoding_rs::GB18030.encode("中文小说测试").0.into_owned();
        let ranked = rank_multibyte_candidates(&bytes);
        assert!(
            !ranked.iter().any(|(label, _)| label == "windows-1252"),
            "single-byte encoding leaked into the candidate pool: {:?}",
            ranked
        );
        assert_eq!(
            ranked.iter().find(|(label, _)| label == "GBK").map(|(_, c)| *c),
            Some(0)
        );
        // GBK wins the tie because the pool keeps declaration order, not alphabetical.
        assert_eq!(ranked.first().map(|(l, c)| (l.as_str(), *c)), Some(("GBK", 0)));
    }

    #[test]
    fn windows_1252_scores_zero_malformed_on_chinese_bytes() {
        // Pins the reason the exclusion above is structural rather than a scoring tweak.
        let bytes = encoding_rs::GB18030.encode("中文小说测试").0.into_owned();
        let windows = encoding_for_label("windows-1252").unwrap();
        assert!(is_single_byte(windows));
        assert_eq!(count_malformed(windows, &bytes), 0);
    }

    #[test]
    fn a_single_byte_detection_is_reported_low_confidence() {
        // Driven through `report_from_detection` rather than the detector: chardetng
        // tolerates a stray byte and keeps its GBK answer, so a synthetic fixture cannot
        // be relied on to reach this branch. The policy is what matters — whatever puts
        // the detector on a single-byte encoding, we must not act on that answer.
        let bytes = encoding_rs::GB18030.encode("中文小说测试内容").0.into_owned();
        let report = report_from_detection(encoding_rs::WINDOWS_1252, &bytes);
        assert_eq!(report.confidence, EncodingConfidence::Low);
        assert!(report.needs_manual_choice());
        assert_eq!(report.detected_label, "windows-1252");
        assert!(report.reason.is_some());
        // The suggestion offered instead is a multi-byte encoding that actually fits.
        assert_eq!(report.label, "GBK");
        assert!(!report.candidates.is_empty());
        assert!(report.candidates.iter().all(|c| c != "windows-1252"));
    }

    #[test]
    fn a_multibyte_detection_is_acted_on_without_asking() {
        let bytes = encoding_rs::GB18030.encode("中文小说测试内容").0.into_owned();
        let report = report_from_detection(encoding_rs::GB18030, &bytes);
        assert_eq!(report.label, "GBK");
        assert_eq!(report.confidence, EncodingConfidence::High);
        assert!(!report.needs_manual_choice());
    }

    // ── Decoding ──────────────────────────────────────────────────────────────

    #[test]
    fn utf8_round_trips_through_detection() {
        let text = "第一章 开始\r\n\r\n第二章 继续\r\n";
        let report = detect_encoding(text.as_bytes(), true);
        assert_eq!(report.label, "UTF-8");
        assert_eq!(report.confidence, EncodingConfidence::High);
        assert!(!report.strictly_clean, "strictly_clean is GB-family only");
    }

    #[test]
    fn a_low_confidence_report_blocks_decoding() {
        // The gate itself: a Low-confidence report must stop the load, and an override
        // must clear it. (The end-to-end case lives in the corpus test below, against
        // the real file that provokes it.)
        let report = report_from_detection(
            encoding_rs::WINDOWS_1252,
            &encoding_rs::GB18030.encode("中文小说").0,
        );
        assert!(report.needs_manual_choice());
        let overridden = report_for_override(&encoding_rs::GB18030.encode("中文小说").0, "GBK")
            .unwrap();
        assert!(!overridden.needs_manual_choice());
    }

    #[test]
    fn an_override_decodes_a_file_detection_refused() {
        let mut bytes = encoding_rs::GB18030.encode("中文小说测试内容中文小说").0.into_owned();
        bytes.insert(6, 0x80);
        match load_book(&bytes, Some("GBK")).unwrap() {
            LoadOutcome::Loaded(content) => {
                assert_eq!(content.encoding.label, "GBK");
                assert!(content.encoding.overridden);
            }
            LoadOutcome::NeedsEncodingChoice(_) => {
                panic!("an explicit override must never ask again")
            }
        }
    }

    #[test]
    fn unknown_override_labels_are_rejected() {
        assert!(load_book(b"abc", Some("definitely-not-an-encoding")).is_err());
    }

    #[test]
    fn gb_labels_collapse_onto_one_decoder() {
        for label in ["gbk", "GB2312", "gb18030"] {
            assert_eq!(
                encoding_for_label(label).map(|e| e.name()),
                Some(encoding_rs::GB18030.name()),
                "{} must resolve to the one GB decoder",
                label
            );
        }
    }

    // ── Corpus ────────────────────────────────────────────────────────────────

    #[test]
    fn every_corpus_book_decodes_to_readable_chinese() {
        let books = corpus_books();
        if books.is_empty() {
            return;
        }
        assert_eq!(books.len(), 55, "corpus size changed — update the expectations");

        for path in books {
            let bytes = std::fs::read(&path).expect("corpus file is readable");
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            let outcome = load_book(&bytes, None).expect("load must not error");
            match outcome {
                LoadOutcome::Loaded(content) => {
                    assert_ne!(name, MIXED_ENCODING_BOOK, "the mixed file must not open silently");
                    assert_eq!(content.encoding.label, "GBK", "{}", name);
                    assert!(content.line_count() > 1_000, "{}", name);
                    // Mojibake would be Latin-1 letters, not Han. Sample the middle of
                    // the book so a clean header cannot carry the assertion.
                    let middle = content.slice(content.line_count() / 2, content.line_count() / 2 + 200);
                    let han = middle
                        .iter()
                        .flat_map(|line| line.chars())
                        .filter(|c| ('\u{4E00}'..='\u{9FFF}').contains(c))
                        .count();
                    assert!(han > 100, "{} decoded without Chinese characters", name);
                }
                LoadOutcome::NeedsEncodingChoice(report) => {
                    assert_eq!(name, MIXED_ENCODING_BOOK, "unexpected low-confidence book: {}", name);
                    assert_eq!(report.confidence, EncodingConfidence::Low);
                }
            }
        }
    }

    #[test]
    fn the_mixed_encoding_book_is_flagged_and_overridable() {
        let Some(bytes) = corpus_file(MIXED_ENCODING_BOOK) else {
            return;
        };
        match load_book(&bytes, None).expect("load must not error") {
            LoadOutcome::NeedsEncodingChoice(report) => {
                assert_eq!(report.confidence, EncodingConfidence::Low);
                assert!(report.reason.is_some());
                assert!(!report.candidates.is_empty(), "an override needs choices");
                assert!(report.candidates.iter().all(|c| c != "windows-1252"));
            }
            LoadOutcome::Loaded(_) => panic!("the mixed-encoding book must not open silently"),
        }
        // The override is the escape hatch: the same file opens when the user insists.
        match load_book(&bytes, Some("GBK")).expect("override must not error") {
            LoadOutcome::Loaded(content) => assert!(content.line_count() > 0),
            LoadOutcome::NeedsEncodingChoice(_) => panic!("override must decode"),
        }
    }

    #[test]
    fn a_book_reaching_outside_gbk_reports_gbk_but_not_strictly_clean() {
        let Some(bytes) = corpus_file(GB18030_BOOK) else {
            return;
        };
        // This book reaches outside GBK proper via user-defined code points, which the
        // one GB decoder maps into the private use area without complaint. Those bytes
        // live thousands of lines in, so the prefix alone calls the book clean — assert
        // through `load_book`, the path the UI actually gets its answer from.
        assert!(
            detect_encoding(&bytes[..PREFIX_BYTES], false).strictly_clean,
            "precondition: the prefix is clean, which is why prefix-only would be wrong"
        );
        let content = match load_book(&bytes, None).unwrap() {
            LoadOutcome::Loaded(content) => content,
            LoadOutcome::NeedsEncodingChoice(_) => panic!("this book decodes"),
        };
        assert_eq!(content.encoding.label, "GBK");
        assert!(
            !content.encoding.strictly_clean,
            "a book reaching outside GBK proper is not strictly clean"
        );
    }

    #[test]
    fn a_plain_gbk_book_is_strictly_clean() {
        let Some(bytes) = corpus_file(GBK_CRLF_BOOK) else {
            return;
        };
        let content = match load_book(&bytes, None).unwrap() {
            LoadOutcome::Loaded(content) => content,
            LoadOutcome::NeedsEncodingChoice(_) => panic!("this book decodes"),
        };
        assert_eq!(content.encoding.label, "GBK");
        assert!(content.encoding.strictly_clean);
    }

    #[test]
    fn both_line_ending_conventions_index_identically() {
        let Some(crlf_bytes) = corpus_file(GBK_CRLF_BOOK) else {
            return;
        };
        let lf_bytes = corpus_file(LF_ONLY_BOOK).expect("corpus present");

        // The corpus really does contain both conventions — if it stopped doing so, this
        // test would be asserting nothing.
        assert!(crlf_bytes.windows(2).any(|w| w == b"\r\n"));
        assert!(!lf_bytes.windows(2).any(|w| w == b"\r\n"));

        for bytes in [crlf_bytes, lf_bytes] {
            let content = match load_book(&bytes, Some("GBK")).unwrap() {
                LoadOutcome::Loaded(content) => content,
                LoadOutcome::NeedsEncodingChoice(_) => panic!("override must decode"),
            };
            // No terminator survives into a line, in either convention.
            let sample = content.slice(0, 5_000);
            assert!(sample.iter().all(|line| !line.contains('\r')));
            assert!(sample.iter().all(|line| !line.contains('\n')));
            // Blank lines are preserved: line N in the file is line N here.
            assert!(
                sample.iter().any(|line| line.is_empty()),
                "blank lines must survive into the index"
            );
        }
    }

    #[test]
    fn line_numbers_match_the_files_own_numbering() {
        let Some(bytes) = corpus_file(LF_ONLY_BOOK) else {
            return;
        };
        let content = match load_book(&bytes, Some("GBK")).unwrap() {
            LoadOutcome::Loaded(content) => content,
            LoadOutcome::NeedsEncodingChoice(_) => panic!("override must decode"),
        };
        // The file is LF-only, so its logical line count is its LF count plus one for a
        // final line with no terminator. Line N here is line N in the file.
        let newlines = bytes.iter().filter(|b| **b == b'\n').count();
        let unterminated_tail = usize::from(*bytes.last().unwrap() != b'\n');
        assert_eq!(content.line_count(), newlines + unterminated_tail);
    }
}

