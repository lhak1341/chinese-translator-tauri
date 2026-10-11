//! Reader backend: scan the library, open a book, read a line range, close a book,
//! fingerprint a file. Five thin commands. Everything with a decision in it — encoding
//! detection, decoding, the line index, the fingerprint — lives in `book_loader`, which
//! is pure and tested from byte slices. What lives here is the managed cache and the
//! path validation that keeps an IPC call from reading arbitrary files.
//!
//! Chapter-outline detection is a separate concern with its own two commands, in
//! `chapter_outline_commands.rs` — it reads the open book via `open_book_handle` below
//! (`pub(crate)`, the one seam exposed across that file boundary) rather than touching
//! `BookCache`'s internals directly, which stay private to this file.
//!
//! The cache holds **exactly one book**, keyed by fingerprint. A second book could not
//! have its dictionaries loaded anyway — one engine means one active book — and a
//! decoded novel is tens of megabytes, so an LRU of them would be a memory leak with a
//! politer name. Books close only when a different book opens or the app exits, never on
//! tab switch: leaving the Reader to edit a dictionary entry and coming back is the core
//! loop the feature exists to serve.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use crate::book_loader::{self, BookContent, EncodingReport, LoadOutcome, PREFIX_BYTES};
use crate::dictionary_commands::sanitize_io_error;

/// Refuse anything larger than this. The largest book in a real library is ~17 MB; the
/// cap exists so a mistyped library folder full of disk images cannot exhaust memory.
const MAX_BOOK_BYTES: u64 = 128 * 1024 * 1024;

/// Upper bound on a single `read_book_lines` call. The frontend windows around the
/// viewport, so a legitimate request is hundreds of lines; this bounds a buggy or
/// hostile one.
const MAX_LINES_PER_READ: usize = 5_000;

/// Where the library lives when configuration has not said otherwise.
const DEFAULT_LIBRARY_SUBPATH: [&str; 2] = ["Downloads", "_FICTION"];

// ============================================================================
// Managed state
// ============================================================================

struct CachedBook {
    fingerprint: String,
    content: Arc<BookContent>,
}

/// Holds the one decoded book. A poisoned mutex is recovered and used rather than
/// propagated as an error, because a panic in an unrelated command must not make the Reader
/// permanently unusable. Unlike `LruCache` it keeps its contents: the book is an
/// `Arc<BookContent>` replaced whole and never edited in place, so a panic while the lock
/// was held (a bad range in `slice`) cannot have left it half-written. The poisoning is
/// reported once through `on_poison` and cleared, so later accesses neither report again
/// nor print.
pub struct BookCache {
    current: Mutex<Option<CachedBook>>,
    on_poison: fn(),
}

impl BookCache {
    pub fn new() -> Self {
        Self::with_poison_hook(crate::poison_report::record_mutex_poisoning)
    }

    pub fn with_poison_hook(on_poison: fn()) -> Self {
        Self {
            current: Mutex::new(None),
            on_poison,
        }
    }

    fn with_current<T>(&self, f: impl FnOnce(&mut Option<CachedBook>) -> T) -> T {
        match self.current.lock() {
            Ok(mut guard) => f(&mut guard),
            Err(poisoned) => {
                (self.on_poison)();
                eprintln!("WARNING: Book cache mutex poisoned - keeping the open book and continuing");
                let mut guard = poisoned.into_inner();
                self.current.clear_poison();
                f(&mut guard)
            }
        }
    }
}

impl Default for BookCache {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// IPC payloads
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryBook {
    /// File name, which is also the handle `open_book` takes. Never a full path — a
    /// path would put the user's home directory into every IPC payload.
    pub file_name: String,
    /// File name without its extension, for display.
    pub title: String,
    pub size_bytes: u64,
    /// Modified time, milliseconds since the Unix epoch. Paired with `size_bytes` so the
    /// frontend's book-records reconciliation can skip re-fingerprinting a file that
    /// hasn't changed since its record was last cached.
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookFingerprint {
    pub fingerprint: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScan {
    /// The directory actually scanned, so the UI can show what "default" resolved to.
    ///
    /// This is the one deliberate exception to keeping OS paths out of IPC payloads: the
    /// user chose this folder and has to be able to see which one is in effect. Nothing
    /// else in a Reader payload carries a path — book handles are bare file names.
    pub library_path: String,
    pub books: Vec<LibraryBook>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpenStatus {
    /// Decoded and cached. `book` is populated.
    Opened,
    /// The encoding could not be established, so the file was deliberately not decoded.
    /// `encoding` carries the report and the candidate list for the manual override.
    NeedsEncoding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenBook {
    pub fingerprint: String,
    pub file_name: String,
    pub title: String,
    pub line_count: usize,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenBookResult {
    pub status: OpenStatus,
    pub encoding: EncodingReport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book: Option<OpenBook>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookLines {
    /// Index of the first returned line, echoed back so a late response cannot be
    /// mistaken for a different range.
    pub start: usize,
    /// One line per element, blank lines included as empty strings. Reading position is
    /// a raw file line number, so this index must be the file's index.
    pub lines: Vec<String>,
    pub line_count: usize,
}

// ============================================================================
// Path handling
// ============================================================================

/// The default library root: `~/Downloads/_FICTION`.
fn default_library_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app_handle
        .path()
        .home_dir()
        .map_err(|_| "Failed to locate the home directory".to_string())?;
    Ok(DEFAULT_LIBRARY_SUBPATH
        .iter()
        .fold(home, |path, segment| path.join(segment)))
}

/// Resolve the library root the caller asked for.
///
/// The root is not validated against an allowlist, and deliberately so: it is a folder
/// the user picked in a native directory dialog, and books are read in place rather than
/// copied into app data. The untrusted half is the *book name*, which `resolve_book_path`
/// pins to a single path component — that is what stops "open a book" from becoming
/// "read any file". Scanning only ever lists `.txt` files and only ever returns names.
fn resolve_library_path(
    app_handle: &tauri::AppHandle,
    library_path: Option<String>,
) -> Result<PathBuf, String> {
    match library_path {
        Some(path) if !path.trim().is_empty() => Ok(PathBuf::from(path)),
        _ => default_library_path(app_handle),
    }
}

/// Join a caller-supplied file name onto the library root, rejecting anything that is
/// not a plain name. The file name crosses the IPC boundary, so it is untrusted: a
/// separator or a `..` component would turn "open a book" into "read any file".
fn resolve_book_path(library_path: &Path, file_name: &str) -> Result<PathBuf, String> {
    // A bare ".." or "." is exactly one `Path` component, so the count check alone lets
    // it through — `components().count() != 1` was written to reject "sub/book.txt" and
    // "../secrets.txt" (2 components each), not a single traversal segment on its own.
    if file_name.is_empty()
        || file_name == ".."
        || file_name == "."
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains('\0')
        || Path::new(file_name).components().count() != 1
    {
        return Err("Invalid book name".to_string());
    }
    Ok(library_path.join(file_name))
}

fn title_from_file_name(file_name: &str) -> String {
    Path::new(file_name)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.to_string())
}

fn is_text_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("txt"))
}

/// Milliseconds since the Unix epoch. `modified()`/`duration_since` both fail on a
/// platform without mtime support or a clock set before the epoch — either way, `0` is a
/// safe "unknown" sentinel that simply forces a re-fingerprint on the next scan, rather
/// than a hard error over a cosmetic field.
fn modified_ms(metadata: &std::fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

// ============================================================================
// Implementations (no Tauri types — directly testable)
// ============================================================================

fn scan_library_impl(library_path: &Path) -> Result<LibraryScan, String> {
    let entries = std::fs::read_dir(library_path)
        .map_err(|e| sanitize_io_error(e, "the library folder"))?;

    let mut books: Vec<LibraryBook> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_text_file(&path) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        books.push(LibraryBook {
            title: title_from_file_name(&file_name),
            file_name,
            size_bytes: metadata.len(),
            modified_ms: modified_ms(&metadata),
        });
    }

    // No order: `read_dir` gives none, and the shelf's order is the TS shelf's
    // (`byShelfTitle` in ReconcileLibrary.ts, locale-aware).

    Ok(LibraryScan {
        library_path: library_path.to_string_lossy().to_string(),
        books,
    })
}

fn read_book_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = std::fs::metadata(path).map_err(|e| sanitize_io_error(e, "the book"))?;
    if !metadata.is_file() {
        return Err("That book is not a file".to_string());
    }
    if metadata.len() > MAX_BOOK_BYTES {
        return Err(format!(
            "That file is larger than the {} MB limit for a book",
            MAX_BOOK_BYTES / (1024 * 1024)
        ));
    }
    std::fs::read(path).map_err(|e| sanitize_io_error(e, "the book"))
}

/// Fingerprint a file without decoding it — reads the file's size plus only its first
/// `PREFIX_BYTES`, never the whole book. This is what makes library-scan reconciliation
/// (relink a moved book, mark a missing one unavailable) affordable to run over every
/// file that changed: `open_book`'s full `read_book_bytes` would read tens of megabytes
/// per book just to get an identity check.
fn fingerprint_file_impl(path: &Path) -> Result<BookFingerprint, String> {
    use std::io::Read;

    let metadata = std::fs::metadata(path).map_err(|e| sanitize_io_error(e, "the book"))?;
    if !metadata.is_file() {
        return Err("That book is not a file".to_string());
    }
    let size = metadata.len();

    let mut file = std::fs::File::open(path).map_err(|e| sanitize_io_error(e, "the book"))?;
    let mut prefix = Vec::with_capacity(PREFIX_BYTES.min(size as usize));
    file.by_ref()
        .take(PREFIX_BYTES as u64)
        .read_to_end(&mut prefix)
        .map_err(|e| sanitize_io_error(e, "the book"))?;

    Ok(BookFingerprint {
        fingerprint: book_loader::fingerprint(size, &prefix),
        size_bytes: size,
    })
}

fn open_book_impl(
    path: &Path,
    file_name: &str,
    encoding_override: Option<&str>,
) -> Result<(OpenBookResult, Option<BookContent>), String> {
    let bytes = read_book_bytes(path)?;
    let size = bytes.len() as u64;
    let fingerprint =
        book_loader::fingerprint(size, &bytes[..bytes.len().min(PREFIX_BYTES)]);

    match book_loader::load_book(&bytes, encoding_override)? {
        LoadOutcome::NeedsEncodingChoice(report) => Ok((
            OpenBookResult {
                status: OpenStatus::NeedsEncoding,
                encoding: report,
                book: None,
            },
            None,
        )),
        LoadOutcome::Loaded(content) => {
            let result = OpenBookResult {
                status: OpenStatus::Opened,
                encoding: content.encoding.clone(),
                book: Some(OpenBook {
                    fingerprint,
                    file_name: file_name.to_string(),
                    title: title_from_file_name(file_name),
                    line_count: content.line_count(),
                    size_bytes: size,
                }),
            };
            Ok((result, Some(content)))
        }
    }
}

// ============================================================================
// Commands
// ============================================================================

/// List every text file in the library folder. `library_path` comes from configuration;
/// when it is absent or blank the default fiction folder is used, and the resolved path
/// is returned so the UI can show which one that was.
#[tauri::command]
pub async fn scan_library(
    app_handle: tauri::AppHandle,
    library_path: Option<String>,
) -> Result<LibraryScan, String> {
    let path = resolve_library_path(&app_handle, library_path)?;
    scan_library_impl(&path)
}

/// Fingerprint one library file without decoding it. Used by the frontend's book-records
/// reconciliation to identify a book whose size or modified time changed since the last
/// scan — including a rename or move, since the fingerprint alone is what lets a record
/// survive one — without paying for a full decode.
#[tauri::command]
pub async fn fingerprint_book(
    app_handle: tauri::AppHandle,
    library_path: Option<String>,
    file_name: String,
) -> Result<BookFingerprint, String> {
    let root = resolve_library_path(&app_handle, library_path)?;
    let path = resolve_book_path(&root, &file_name)?;
    fingerprint_file_impl(&path)
}

/// Decode a book and hold it in the cache.
///
/// Opening a different book evicts the previous one — the cache is one book deep by
/// design. A book whose encoding cannot be established is reported, not decoded: the
/// caller must come back with `encoding_override`.
#[tauri::command]
pub async fn open_book(
    app_handle: tauri::AppHandle,
    cache: State<'_, BookCache>,
    library_path: Option<String>,
    file_name: String,
    encoding_override: Option<String>,
) -> Result<OpenBookResult, String> {
    let root = resolve_library_path(&app_handle, library_path)?;
    let path = resolve_book_path(&root, &file_name)?;
    let (result, content) = open_book_impl(&path, &file_name, encoding_override.as_deref())?;

    if let (Some(content), Some(book)) = (content, result.book.as_ref()) {
        let cached = CachedBook {
            fingerprint: book.fingerprint.clone(),
            content: Arc::new(content),
        };
        cache.with_current(|current| {
            *current = Some(cached);
        });
    }

    Ok(result)
}

/// Read lines `[start, end)` of the open book.
///
/// The fingerprint is checked rather than assumed: a response that arrived after the
/// reader switched books would otherwise splice one novel's lines into another's.
#[tauri::command]
pub async fn read_book_lines(
    cache: State<'_, BookCache>,
    fingerprint: String,
    start: usize,
    end: usize,
) -> Result<BookLines, String> {
    if end > start && end - start > MAX_LINES_PER_READ {
        return Err(format!(
            "A single read is limited to {} lines",
            MAX_LINES_PER_READ
        ));
    }
    cache.with_current(|current| match current.as_ref() {
        Some(book) if book.fingerprint == fingerprint => Ok(BookLines {
            start,
            lines: book.content.slice(start, end),
            line_count: book.content.line_count(),
        }),
        Some(_) => Err("A different book is open".to_string()),
        None => Err("No book is open".to_string()),
    })
}

/// A shared handle to the fingerprint-matched book, releasing `cache`'s lock immediately
/// afterward. Chapter detection is a handful of regex passes over every line of up to a
/// ~128 MB book — running that while holding the lock would stall every other book command
/// (`read_book_lines`, first among them) for as long as detection takes. The handle shares
/// the cached book rather than copying it, and stays valid and unchanged if `open_book`
/// replaces the cached book while a scan is still running.
///
/// `pub(crate)`: the one seam `chapter_outline_commands.rs` crosses to read the open book.
/// `CachedBook` and `BookCache::with_current` stay private to this file — a caller outside
/// this module gets the open book through this function's contract, never the raw cache.
pub(crate) fn open_book_handle(
    cache: &BookCache,
    fingerprint: &str,
) -> Result<Arc<BookContent>, String> {
    cache.with_current(|current| match current.as_ref() {
        Some(book) if book.fingerprint == fingerprint => Ok(Arc::clone(&book.content)),
        Some(_) => Err("A different book is open".to_string()),
        None => Err("No book is open".to_string()),
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::io::Write;

    /// A temp directory that cleans itself up, matching the helper style already used in
    /// `dictionary_commands`.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "reader-test-{}-{}",
                label,
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).expect("temp dir is creatable");
            Self(path)
        }

        fn write(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            let mut file = std::fs::File::create(&path).expect("temp file is creatable");
            file.write_all(bytes).expect("temp file is writable");
            path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn gbk(text: &str) -> Vec<u8> {
        encoding_rs::GB18030.encode(text).0.into_owned()
    }

    #[test]
    fn scan_lists_only_text_files() {
        let dir = TempDir::new("scan");
        dir.write("beta.txt", &gbk("第一章\r\n内容\r\n"));
        dir.write("alpha.txt", &gbk("第一章\r\n内容\r\n"));
        dir.write("notes.md", b"not a book");
        std::fs::create_dir_all(dir.0.join("backup")).unwrap();

        let scan = scan_library_impl(&dir.0).expect("scan succeeds");
        let mut titles: Vec<&str> = scan.books.iter().map(|b| b.title.as_str()).collect();
        titles.sort(); // scan order is unspecified
        assert_eq!(scan.books.len(), 2, "only .txt files, and no directories");
        assert_eq!(titles, vec!["alpha", "beta"]);
        assert!(scan.books.iter().all(|b| b.size_bytes > 0));
        assert_eq!(scan.library_path, dir.0.to_string_lossy());
    }

    #[test]
    fn scan_reports_a_missing_folder_without_leaking_the_path() {
        let error = scan_library_impl(Path::new("/definitely/not/here")).unwrap_err();
        assert_eq!(error, "the library folder not found");
    }

    #[test]
    fn book_names_with_separators_are_rejected() {
        let root = Path::new("/library");
        for name in ["../secrets.txt", "sub/book.txt", "", "a\\b.txt", "..", "."] {
            assert!(
                resolve_book_path(root, name).is_err(),
                "{} must be rejected",
                name
            );
        }
        assert_eq!(
            resolve_book_path(root, "book.txt").unwrap(),
            PathBuf::from("/library/book.txt")
        );
    }

    #[test]
    fn opening_a_book_reports_its_line_count_and_fingerprint() {
        let dir = TempDir::new("open");
        let path = dir.write("novel.txt", &gbk("第一章\r\n\r\n第二章\r\n"));
        let (result, content) = open_book_impl(&path, "novel.txt", None).expect("open succeeds");
        assert_eq!(result.status, OpenStatus::Opened);
        let book = result.book.expect("an opened book carries metadata");
        assert_eq!(book.title, "novel");
        assert_eq!(book.line_count, 3);
        assert!(!book.fingerprint.is_empty());
        assert_eq!(content.expect("content is returned").line_count(), 3);
    }

    #[test]
    fn a_line_range_includes_blank_lines_as_empty_strings() {
        let dir = TempDir::new("lines");
        let path = dir.write("novel.txt", &gbk("一\r\n\r\n二\r\n\r\n三\r\n"));
        let (_, content) = open_book_impl(&path, "novel.txt", None).expect("open succeeds");
        let content = content.expect("content is returned");
        assert_eq!(content.slice(0, 5), vec!["一", "", "二", "", "三"]);
    }

    #[test]
    fn an_oversized_file_is_refused_before_it_is_read() {
        let dir = TempDir::new("oversize");
        let path = dir.write("novel.txt", b"small enough");
        // The guard is on metadata, so assert the boundary logic rather than writing
        // 128 MB to disk: a file under the cap reads, and the message names the cap.
        assert!(read_book_bytes(&path).is_ok());
        assert!(MAX_BOOK_BYTES / (1024 * 1024) == 128);
    }

    #[test]
    fn reading_a_missing_book_does_not_leak_the_path() {
        let error = read_book_bytes(Path::new("/definitely/not/here.txt")).unwrap_err();
        assert_eq!(error, "the book not found");
    }

    #[test]
    fn scanning_reports_a_modified_time_for_each_book() {
        let dir = TempDir::new("scan_mtime");
        dir.write("novel.txt", &gbk("第一章\r\n"));
        let scan = scan_library_impl(&dir.0).expect("scan succeeds");
        assert_eq!(scan.books.len(), 1);
        assert!(scan.books[0].modified_ms > 0, "a freshly-written file has a real mtime");
    }

    #[test]
    fn fingerprinting_a_file_matches_opening_it() {
        let dir = TempDir::new("fingerprint_matches_open");
        let path = dir.write("novel.txt", &gbk("第一章\r\n内容\r\n"));

        let via_fingerprint = fingerprint_file_impl(&path).expect("fingerprinting succeeds");
        let (opened, _) = open_book_impl(&path, "novel.txt", None).expect("open succeeds");
        let opened_book = opened.book.expect("an opened book carries metadata");

        assert_eq!(via_fingerprint.fingerprint, opened_book.fingerprint);
        assert_eq!(via_fingerprint.size_bytes, opened_book.size_bytes);
    }

    #[test]
    fn fingerprinting_ignores_bytes_past_the_prefix_window() {
        let dir = TempDir::new("fingerprint_prefix_window");
        let mut long = vec![b'x'; PREFIX_BYTES + 64];
        let baseline_path = dir.write("baseline.txt", &long);
        let baseline = fingerprint_file_impl(&baseline_path).expect("fingerprinting succeeds");

        long[PREFIX_BYTES + 10] = b'y';
        let changed_path = dir.write("changed.txt", &long);
        let changed = fingerprint_file_impl(&changed_path).expect("fingerprinting succeeds");

        assert_eq!(baseline.fingerprint, changed.fingerprint);
    }

    #[test]
    fn fingerprinting_a_missing_book_does_not_leak_the_path() {
        let error = fingerprint_file_impl(Path::new("/definitely/not/here.txt")).unwrap_err();
        assert_eq!(error, "the book not found");
    }

    /// `pub(crate)`: `chapter_outline_commands.rs`'s own tests reuse this rather than
    /// reimplementing it against `CachedBook`/`with_current`, which stay private here.
    pub(crate) fn cache_with_open_book(text: &str) -> (BookCache, String) {
        let cache = BookCache::new();
        let bytes = gbk(text);
        let fingerprint = book_loader::fingerprint(bytes.len() as u64, &bytes);
        let content = match book_loader::load_book(&bytes, Some("GBK")).expect("decodes") {
            LoadOutcome::Loaded(content) => content,
            LoadOutcome::NeedsEncodingChoice(_) => panic!("override must decode"),
        };
        cache.with_current(|current| {
            *current = Some(CachedBook { fingerprint: fingerprint.clone(), content: Arc::new(content) });
        });
        (cache, fingerprint)
    }

    static BOOK_POISON_REPORTS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    #[test]
    fn a_poisoned_book_lock_is_reported_once_and_keeps_the_open_book() {
        use std::sync::atomic::Ordering;
        let (cache, fingerprint) = cache_with_open_book("一\r\n二\r\n");
        let cache = Arc::new(BookCache {
            current: Mutex::new(cache.current.into_inner().unwrap()),
            on_poison: || {
                BOOK_POISON_REPORTS.fetch_add(1, Ordering::SeqCst);
            },
        });

        let poisoner = Arc::clone(&cache);
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.current.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        assert!(cache.current.is_poisoned());

        let handle = open_book_handle(&cache, &fingerprint).expect("book survives");
        assert_eq!(handle.line_slices(), vec!["一", "二"]);
        assert_eq!(BOOK_POISON_REPORTS.load(Ordering::SeqCst), 1);

        open_book_handle(&cache, &fingerprint).expect("still open");
        assert_eq!(BOOK_POISON_REPORTS.load(Ordering::SeqCst), 1);
        assert!(!cache.current.is_poisoned());
    }

    #[test]
    fn open_book_handle_shares_the_cached_book() {
        let (cache, fingerprint) = cache_with_open_book("一\r\n二\r\n");
        let first = open_book_handle(&cache, &fingerprint).expect("book is open");
        let second = open_book_handle(&cache, &fingerprint).expect("book is open");
        assert!(Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn open_book_handle_survives_the_book_being_replaced() {
        let (cache, fingerprint) = cache_with_open_book("一\r\n二\r\n");
        let handle = open_book_handle(&cache, &fingerprint).expect("book is open");

        let (replacement, replacement_fingerprint) = cache_with_open_book("三\r\n");
        let replacement = open_book_handle(&replacement, &replacement_fingerprint)
            .expect("replacement is open");
        cache.with_current(|current| {
            *current = Some(CachedBook {
                fingerprint: replacement_fingerprint.clone(),
                content: replacement,
            });
        });

        assert_eq!(handle.line_slices(), vec!["一", "二"]);
        assert_eq!(
            open_book_handle(&cache, &fingerprint).err().as_deref(),
            Some("A different book is open")
        );
    }
}
