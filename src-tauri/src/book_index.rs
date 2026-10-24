//! Per-book index sidecars for the Candidate finder's spread gate (ADR-111): one file per
//! book, `book-index/<fingerprint>.bin`, holding the sorted 32-bit hashes of the book's
//! frequent 2-8 character strings (`candidate_finder::build_sidecar`). A cache, never data:
//! deleting the folder only means the next run rebuilds it.
//!
//! A sidecar is valid while its fingerprint (the file name), the encoding label it was
//! decoded with and `FORMAT_VERSION` all match; otherwise it is rebuilt. Files are written
//! atomically, so a cancelled or crashed build leaves no partial sidecar.
//!
//! Everything here takes a directory, so tests run in a temp dir with no `AppHandle`.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::book_loader::BookContent;
use crate::candidate_finder::{build_sidecar, Progress, Stage};
use crate::dictionary_commands::{sanitize_io_error, write_atomic};

/// Bump when the hashing, the string set or the file layout changes: older sidecars rebuild.
const FORMAT_VERSION: u32 = 1;
const MAGIC: &[u8; 4] = b"CFIX";
pub const DIR_NAME: &str = "book-index";

/// Another indexed book, as the frontend's records know it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundBook {
    pub fingerprint: String,
    pub file_name: String,
    /// The encoding the book's record says it was decoded with.
    pub encoding_label: String,
}

/// The fingerprint is a file name here, and it crossed the IPC boundary.
fn is_safe_fingerprint(fingerprint: &str) -> bool {
    !fingerprint.is_empty() && fingerprint.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

fn sidecar_path(dir: &Path, fingerprint: &str) -> Option<PathBuf> {
    is_safe_fingerprint(fingerprint).then(|| dir.join(format!("{fingerprint}.bin")))
}

/// Layout: magic, version u32, label length u8, label, hash count u32, hashes u32 (all LE).
pub fn encode(encoding_label: &str, hashes: &[u32]) -> Vec<u8> {
    let label = encoding_label.as_bytes();
    let mut bytes = Vec::with_capacity(13 + label.len() + hashes.len() * 4);
    bytes.extend_from_slice(MAGIC);
    bytes.extend_from_slice(&FORMAT_VERSION.to_le_bytes());
    bytes.push(label.len().min(255) as u8);
    bytes.extend_from_slice(&label[..label.len().min(255)]);
    bytes.extend_from_slice(&(hashes.len() as u32).to_le_bytes());
    for hash in hashes {
        bytes.extend_from_slice(&hash.to_le_bytes());
    }
    bytes
}

/// The hashes, or `None` when the bytes are corrupt, from another format version, or were
/// decoded with another encoding than `encoding_label`.
pub fn decode(bytes: &[u8], encoding_label: &str) -> Option<Vec<u32>> {
    let rest = bytes.strip_prefix(MAGIC.as_slice())?;
    let (version, rest) = rest.split_first_chunk::<4>()?;
    if u32::from_le_bytes(*version) != FORMAT_VERSION {
        return None;
    }
    let (&label_len, rest) = rest.split_first()?;
    let (label, rest) = rest.split_at_checked(label_len as usize)?;
    if label != encoding_label.as_bytes() {
        return None;
    }
    let (count, rest) = rest.split_first_chunk::<4>()?;
    let count = u32::from_le_bytes(*count) as usize;
    if rest.len() != count.checked_mul(4)? {
        return None;
    }
    let hashes: Vec<u32> =
        rest.chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    // Binary search needs it sorted; a file that is not was not written by `encode`.
    hashes.windows(2).all(|w| w[0] < w[1]).then_some(hashes)
}

/// The stored sidecar for `fingerprint` when it is still valid for `encoding_label`.
pub fn read_valid(dir: &Path, fingerprint: &str, encoding_label: &str) -> Option<Vec<u32>> {
    decode(&fs::read(sidecar_path(dir, fingerprint)?).ok()?, encoding_label)
}

/// Atomic: a temp file, then a rename. Creates the folder, so a deleted one is recovered from.
pub fn write(dir: &Path, fingerprint: &str, encoding_label: &str, hashes: &[u32]) -> Result<(), String> {
    let path = sidecar_path(dir, fingerprint).ok_or_else(|| "Invalid book fingerprint".to_string())?;
    fs::create_dir_all(dir).map_err(|e| sanitize_io_error(e, "the book index"))?;
    write_atomic(&path, &encode(encoding_label, hashes), "book index")
}

/// Delete every sidecar (and leftover temp file) whose fingerprint has no book record.
/// Returns how many files it removed.
pub fn prune(dir: &Path, known: &HashSet<String>) -> usize {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let fingerprint = name.split('.').next().unwrap_or("");
        if !known.contains(fingerprint) && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// The sidecars of `books`: a valid stored one is used as is; a missing or stale one is built
/// from `read_book`'s decoded text and stored. Builds report `Stage::BackgroundTable`
/// progress (0-100 over the builds); a run with nothing to build reports nothing. A book
/// `read_book` cannot give is left out. `None` when cancelled, with nothing half-written.
pub fn load_background(
    dir: &Path,
    books: &[BackgroundBook],
    read_book: &dyn Fn(&BackgroundBook) -> Option<BookContent>,
    progress: &mut dyn FnMut(Progress),
    is_cancelled: &dyn Fn() -> bool,
) -> Option<Vec<Vec<u32>>> {
    let mut sidecars = Vec::with_capacity(books.len());
    let mut missing = Vec::new();
    for book in books {
        match read_valid(dir, &book.fingerprint, &book.encoding_label) {
            Some(hashes) => sidecars.push(hashes),
            None => missing.push(book),
        }
    }
    for (done, book) in missing.iter().enumerate() {
        if is_cancelled() {
            return None;
        }
        progress(Progress {
            stage: Stage::BackgroundTable,
            percent: (100 * done / missing.len()) as u8,
        });
        let Some(content) = read_book(book) else { continue };
        let hashes = build_sidecar(&content.line_slices(), is_cancelled)?;
        // A sidecar that cannot be stored still counts for this run; the next run rebuilds it.
        let _ = write(dir, &book.fingerprint, &book.encoding_label, &hashes);
        sidecars.push(hashes);
    }
    if !missing.is_empty() {
        progress(Progress { stage: Stage::BackgroundTable, percent: 100 });
    }
    Some(sidecars)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book_loader::{load_book, LoadOutcome};
    use std::cell::Cell;

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!("book-index-{}-{}", label, std::process::id()));
            let _ = fs::remove_dir_all(&path);
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const CONTEXT: [&str; 6] = ["甲", "乙", "丙", "丁", "戊", "己"];

    /// A decoded book whose only frequent string is `name`.
    fn book_with(name: &str) -> BookContent {
        let text: String = (0..30)
            .map(|i| format!("{}{}{}。\n", CONTEXT[i % 6], name, CONTEXT[(i + 1) % 6]))
            .collect();
        let bytes = encoding_rs::GB18030.encode(&text).0.into_owned();
        match load_book(&bytes, Some("GBK")).expect("loads") {
            LoadOutcome::Loaded(content) => content,
            LoadOutcome::NeedsEncodingChoice(_) => panic!("override must decode"),
        }
    }

    fn background_book(fingerprint: &str) -> BackgroundBook {
        BackgroundBook {
            fingerprint: fingerprint.into(),
            file_name: format!("{fingerprint}.txt"),
            encoding_label: "GBK".into(),
        }
    }

    #[test]
    fn a_sidecar_round_trips_and_is_refused_for_another_encoding() {
        let bytes = encode("GBK", &[1, 5, 9]);
        assert_eq!(decode(&bytes, "GBK"), Some(vec![1, 5, 9]));
        assert_eq!(decode(&bytes, "Big5"), None);
    }

    #[test]
    fn a_sidecar_of_another_format_version_or_damaged_is_refused() {
        let good = encode("GBK", &[1, 5, 9]);
        let mut other_version = good.clone();
        other_version[4] ^= 1;
        assert_eq!(decode(&other_version, "GBK"), None);
        assert_eq!(decode(&good[..good.len() - 1], "GBK"), None, "truncated");
        assert_eq!(decode(&encode("GBK", &[9, 5]), "GBK"), None, "not sorted");
        assert_eq!(decode(b"", "GBK"), None);
    }

    #[test]
    fn a_stored_sidecar_is_valid_only_for_the_encoding_it_was_built_with() {
        let dir = TempDir::new("stale");
        write(&dir.0, "abc123", "GBK", &[3, 4]).expect("writes");
        assert_eq!(read_valid(&dir.0, "abc123", "GBK"), Some(vec![3, 4]));
        assert_eq!(read_valid(&dir.0, "abc123", "UTF-8"), None);
        assert_eq!(read_valid(&dir.0, "other", "GBK"), None);
    }

    #[test]
    fn a_write_leaves_no_temp_file_and_a_fingerprint_that_is_not_a_name_is_refused() {
        let dir = TempDir::new("atomic");
        write(&dir.0, "abc123", "GBK", &[1]).expect("writes");
        let names: Vec<String> = fs::read_dir(&dir.0)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["abc123.bin".to_string()]);
        assert!(write(&dir.0, "../escape", "GBK", &[1]).is_err());
        assert_eq!(read_valid(&dir.0, "../escape", "GBK"), None);
    }

    #[test]
    fn prune_deletes_sidecars_without_a_book_record_and_keeps_the_rest() {
        let dir = TempDir::new("prune");
        write(&dir.0, "keep1", "GBK", &[1]).unwrap();
        write(&dir.0, "gone1", "GBK", &[1]).unwrap();
        fs::write(dir.0.join("gone2.bin.tmp.1.0"), b"half").unwrap();

        let known: HashSet<String> = ["keep1".to_string()].into();
        assert_eq!(prune(&dir.0, &known), 2);
        assert!(read_valid(&dir.0, "keep1", "GBK").is_some());
        assert!(read_valid(&dir.0, "gone1", "GBK").is_none());
        assert!(!dir.0.join("gone2.bin.tmp.1.0").exists());
        assert_eq!(prune(&dir.0.join("missing"), &known), 0);
    }

    #[test]
    fn the_background_is_built_and_stored_on_the_first_run_with_progress_and_reused_after() {
        let dir = TempDir::new("backfill");
        let books = [background_book("aaa"), background_book("bbb")];
        let reads = Cell::new(0);
        let read = |_: &BackgroundBook| {
            reads.set(reads.get() + 1);
            Some(book_with("滕青山"))
        };

        let mut events = Vec::new();
        let first = load_background(&dir.0, &books, &read, &mut |p| events.push(p), &|| false).unwrap();
        assert_eq!(first.len(), 2);
        assert_eq!(reads.get(), 2);
        assert!(events.iter().all(|p| p.stage == Stage::BackgroundTable));
        assert_eq!(events.last().map(|p| p.percent), Some(100));

        let mut events = Vec::new();
        let again = load_background(&dir.0, &books, &read, &mut |p| events.push(p), &|| false).unwrap();
        assert_eq!(again, first);
        assert_eq!(reads.get(), 2, "valid sidecars are not rebuilt");
        assert!(events.is_empty(), "nothing to build, nothing to report");
    }

    #[test]
    fn a_stale_sidecar_is_rebuilt_and_a_deleted_folder_is_recovered_from() {
        let dir = TempDir::new("recover");
        let books = [background_book("aaa")];
        let reads = Cell::new(0);
        let read = |_: &BackgroundBook| {
            reads.set(reads.get() + 1);
            Some(book_with("滕青山"))
        };

        write(&dir.0, "aaa", "Big5", &[7]).unwrap();
        let rebuilt = load_background(&dir.0, &books, &read, &mut |_| {}, &|| false).unwrap();
        assert_eq!(reads.get(), 1, "an encoding mismatch rebuilds");
        assert_ne!(rebuilt[0], vec![7]);

        fs::remove_dir_all(&dir.0).unwrap();
        let recovered = load_background(&dir.0, &books, &read, &mut |_| {}, &|| false).unwrap();
        assert_eq!(recovered, rebuilt);
        assert!(read_valid(&dir.0, "aaa", "GBK").is_some());
    }

    #[test]
    fn a_cancelled_backfill_returns_nothing_and_leaves_no_sidecar() {
        let dir = TempDir::new("cancel");
        let books = [background_book("aaa"), background_book("bbb")];
        let read = |_: &BackgroundBook| Some(book_with("滕青山"));
        assert_eq!(load_background(&dir.0, &books, &read, &mut |_| {}, &|| true), None);

        let polls = Cell::new(0);
        let cancel_mid_build = || {
            polls.set(polls.get() + 1);
            polls.get() > 1
        };
        assert_eq!(load_background(&dir.0, &books, &read, &mut |_| {}, &cancel_mid_build), None);
        let left = fs::read_dir(&dir.0).map(|d| d.flatten().count()).unwrap_or(0);
        assert_eq!(left, 0, "no partial sidecar");
    }

    #[test]
    fn a_book_that_cannot_be_read_is_left_out() {
        let dir = TempDir::new("unreadable");
        let books = [background_book("aaa"), background_book("bbb")];
        let read = |b: &BackgroundBook| (b.fingerprint == "aaa").then(|| book_with("滕青山"));
        let found = load_background(&dir.0, &books, &read, &mut |_| {}, &|| false).unwrap();
        assert_eq!(found.len(), 1);
    }
}
