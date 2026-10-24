//! Candidate finder IPC: run, cancel, the progress event, and the book index (sidecars). The analysis is
//! `candidate_finder.rs` (pure); this file holds what needs Tauri and state — the open
//! book's handle, the per-run cancel flags and the event emitter.
//!
//! Reads the open book via `book_commands::open_book_handle`, as the chapter outline does:
//! a shared handle, the cache lock released before the scan starts.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::book_commands::{self, BookCache};
use crate::book_index::{self, BackgroundBook};
use crate::book_loader::{self, BookContent, LoadOutcome};
use crate::candidate_finder::{
    self, Background, Candidate, Coverage, InactiveDictionary, KeySet, Progress,
};
use crate::dictionary_commands::get_app_data_dir;

const PROGRESS_EVENT: &str = "candidate-finder-progress";

/// Cancel flags of the runs in flight, by the run id the frontend chose. A cancel that
/// arrives before its run has registered leaves a set flag behind, which the run then
/// finds and stops on; the run removes its flag when it ends.
pub struct CandidateRuns {
    flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl CandidateRuns {
    pub fn new() -> Self {
        Self { flags: Mutex::new(HashMap::new()) }
    }

    fn with_flags<T>(&self, f: impl FnOnce(&mut HashMap<String, Arc<AtomicBool>>) -> T) -> T {
        f(&mut self.flags.lock().unwrap_or_else(PoisonError::into_inner))
    }

    fn flag_for(&self, run_id: &str) -> Arc<AtomicBool> {
        self.with_flags(|flags| Arc::clone(flags.entry(run_id.to_string()).or_default()))
    }

    fn cancel(&self, run_id: &str) {
        self.flag_for(run_id).store(true, Ordering::Relaxed);
    }

    fn finish(&self, run_id: &str) {
        self.with_flags(|flags| flags.remove(run_id));
    }
}

impl Default for CandidateRuns {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent<'a> {
    run_id: &'a str,
    #[serde(flatten)]
    progress: Progress,
}

/// What a run gives back: the survivors, and whether the spread gate was skipped for lack of
/// other indexed books (the panel then says common-word filtering is weak).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindOutcome {
    pub candidates: Vec<Candidate>,
    pub weak_filtering: bool,
}

/// Share of the percent bar the background table takes when it had sidecars to build; the
/// analysis stages fill the rest.
const BACKGROUND_SHARE: u32 = 40;

/// The whole run, past IPC: backfill the background sidecars, then analyse `book`. `read_other`
/// decodes another book for a sidecar that must be built.
fn analyse(
    book: &BookContent,
    fingerprint: &str,
    flag: &AtomicBool,
    phrases: &HashSet<String>,
    coverage: &Coverage,
    index_dir: &Path,
    background_books: &[BackgroundBook],
    read_other: &dyn Fn(&BackgroundBook) -> Option<BookContent>,
    emit: &mut dyn FnMut(Progress),
) -> Option<FindOutcome> {
    let cancelled = || flag.load(Ordering::Relaxed);

    // Another book once, and never the analyzed one.
    let mut seen = HashSet::from([fingerprint.to_string()]);
    let others: Vec<BackgroundBook> = background_books
        .iter()
        .filter(|b| seen.insert(b.fingerprint.clone()))
        .cloned()
        .collect();

    let mut floor = 0;
    let sidecars = book_index::load_background(index_dir, &others, read_other, &mut |progress| {
        floor = BACKGROUND_SHARE;
        emit(Progress { percent: (u32::from(progress.percent) * BACKGROUND_SHARE / 100) as u8, ..progress });
    }, &cancelled)?;
    let background = Background::new(sidecars);

    let candidates = candidate_finder::find_candidates(
        &book.line_slices(),
        phrases,
        coverage,
        &background,
        &mut |progress| {
            emit(Progress {
                percent: (floor + u32::from(progress.percent) * (100 - floor) / 100) as u8,
                ..progress
            })
        },
        &cancelled,
    )?;
    Some(FindOutcome { candidates, weak_filtering: background.is_weak() })
}

/// Another library book, decoded with the encoding its record names; `None` for anything
/// unreadable or undecodable, which then simply is not background.
fn read_other_book(library_root: &Path, other: &BackgroundBook) -> Option<BookContent> {
    let path = book_commands::resolve_book_path(library_root, &other.file_name).ok()?;
    let bytes = book_commands::read_book_bytes(&path).ok()?;
    match book_loader::load_book(&bytes, Some(&other.encoding_label)).ok()? {
        LoadOutcome::Loaded(content) => Some(content),
        LoadOutcome::NeedsEncodingChoice(_) => None,
    }
}

/// Run the finder over the open book. `phrases` are the keys of the `phrases` dictionary;
/// `active_keys` are the keys of the book's active proper-noun dictionaries (the coverage
/// mask) and `inactive` the other proper-noun dictionaries, used only for the Also-in tag.
/// `background` lists the other indexed books for the spread gate (the frontend leaves out
/// books bound to the same fiction dictionary); a missing sidecar is built here and reported
/// as the `background table` stage. The finder never calls the JS trie. Resolves to `null`
/// when the run was cancelled.
#[tauri::command]
pub async fn find_candidates(
    app: AppHandle,
    cache: State<'_, BookCache>,
    runs: State<'_, CandidateRuns>,
    fingerprint: String,
    run_id: String,
    phrases: Vec<String>,
    active_keys: Vec<String>,
    inactive: Vec<InactiveDictionary>,
    library_path: Option<String>,
    background: Vec<BackgroundBook>,
) -> Result<Option<FindOutcome>, String> {
    let book = book_commands::open_book_handle(&cache, &fingerprint)?;
    let flag = runs.flag_for(&run_id);
    let phrases: HashSet<String> = phrases.into_iter().collect();
    let coverage = Coverage { active: KeySet::new(active_keys), inactive };
    let index_dir = get_app_data_dir(&app)?.join(book_index::DIR_NAME);
    let library_root = book_commands::resolve_library_path(&app, library_path)?;

    let event_run_id = run_id.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        analyse(
            &book,
            &fingerprint,
            &flag,
            &phrases,
            &coverage,
            &index_dir,
            &background,
            &|other| read_other_book(&library_root, other),
            &mut |progress| {
                // A lost event only skips a progress tick.
                let _ = app.emit(
                    PROGRESS_EVENT,
                    ProgressEvent { run_id: &event_run_id, progress },
                );
            },
        )
    })
    .await;

    runs.finish(&run_id);
    joined.map_err(|_| "Candidate finder stopped unexpectedly".to_string())
}

/// Store the sidecar of the open book (its text is already in memory) unless a valid one is
/// there. Called when the Reader opens a book; a failure only means the first finder run
/// builds it instead.
fn index_book(book: &BookContent, dir: &Path, fingerprint: &str) -> Result<(), String> {
    let label = &book.encoding.label;
    if book_index::read_valid(dir, fingerprint, label).is_some() {
        return Ok(());
    }
    let hashes = candidate_finder::build_sidecar(&book.line_slices(), &|| false)
        .ok_or_else(|| "Book index build stopped".to_string())?;
    book_index::write(dir, fingerprint, label, &hashes)
}

#[tauri::command]
pub async fn index_open_book(
    app: AppHandle,
    cache: State<'_, BookCache>,
    fingerprint: String,
) -> Result<(), String> {
    let book = book_commands::open_book_handle(&cache, &fingerprint)?;
    let dir = get_app_data_dir(&app)?.join(book_index::DIR_NAME);
    tauri::async_runtime::spawn_blocking(move || index_book(&book, &dir, &fingerprint))
        .await
        .map_err(|_| "Book index stopped unexpectedly".to_string())?
}

/// Delete the sidecars of books with no record. `known` is every fingerprint in the book
/// records, available or not; call it only after a scan whose records were read.
#[tauri::command]
pub async fn prune_book_index(app: AppHandle, known: Vec<String>) -> Result<usize, String> {
    let dir = get_app_data_dir(&app)?.join(book_index::DIR_NAME);
    let known: HashSet<String> = known.into_iter().collect();
    tauri::async_runtime::spawn_blocking(move || book_index::prune(&dir, &known))
        .await
        .map_err(|_| "Book index stopped unexpectedly".to_string())
}

/// The first lines of the open book that hold `text`, for an unfolded candidate row. A scan
/// of every line, on a blocking thread over the shared book handle.
#[tauri::command]
pub async fn candidate_context(
    cache: State<'_, BookCache>,
    fingerprint: String,
    text: String,
    limit: usize,
) -> Result<candidate_finder::ContextLines, String> {
    let book = book_commands::open_book_handle(&cache, &fingerprint)?;
    tauri::async_runtime::spawn_blocking(move || {
        candidate_finder::context_lines(&book.line_slices(), &text, limit)
    })
    .await
    .map_err(|_| "Context lookup stopped unexpectedly".to_string())
}

/// Ask a run to stop. Cooperative: the run returns `null` at its next check.
#[tauri::command]
pub async fn cancel_candidate_run(
    runs: State<'_, CandidateRuns>,
    run_id: String,
) -> Result<(), String> {
    runs.cancel(&run_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::book_commands::tests::cache_with_open_book;

    fn book_with_a_name() -> String {
        let context = ["甲", "乙", "丙", "丁", "戊", "己"];
        (0..30)
            .map(|i| format!("{}滕青山{}。\r\n", context[i % 6], context[(i + 1) % 6]))
            .collect()
    }

    fn analyse_open_book(flag: &AtomicBool, events: &mut Vec<Progress>) -> Option<FindOutcome> {
        let (cache, fingerprint) = cache_with_open_book(&book_with_a_name());
        let book = book_commands::open_book_handle(&cache, &fingerprint).expect("book is open");
        analyse(
            &book,
            &fingerprint,
            flag,
            &HashSet::new(),
            &Coverage::default(),
            &std::env::temp_dir().join("finder-commands-no-index"),
            &[],
            &|_| None,
            &mut |p| events.push(p),
        )
    }

    #[test]
    fn analyse_ranks_the_open_books_names_and_reports_progress() {
        let mut events = Vec::new();
        let outcome = analyse_open_book(&AtomicBool::new(false), &mut events).expect("not cancelled");
        let found = outcome.candidates;

        assert!(found.iter().any(|c| c.text == "滕青山" && c.count == 30 && c.line_count == 30));
        assert_eq!(events.last().map(|p| p.percent), Some(100));
    }

    #[test]
    fn analyse_returns_nothing_once_the_flag_is_set() {
        let mut events = Vec::new();
        assert_eq!(analyse_open_book(&AtomicBool::new(true), &mut events), None);
    }

    #[test]
    fn a_cancel_before_the_run_registers_is_still_seen_by_the_run() {
        let runs = CandidateRuns::new();
        runs.cancel("run-1");
        assert!(runs.flag_for("run-1").load(Ordering::Relaxed));
    }

    #[test]
    fn finish_forgets_the_run() {
        let runs = CandidateRuns::new();
        runs.cancel("run-1");
        runs.finish("run-1");
        assert!(!runs.flag_for("run-1").load(Ordering::Relaxed));
    }

    #[test]
    fn progress_events_carry_the_run_id_and_stage_in_camel_case() {
        let event = ProgressEvent {
            run_id: "run-1",
            progress: Progress { stage: candidate_finder::Stage::Counting, percent: 42 },
        };
        assert_eq!(
            serde_json::to_string(&event).unwrap(),
            r#"{"runId":"run-1","stage":"counting","percent":42}"#
        );
    }

    #[test]
    fn with_no_other_books_the_outcome_says_filtering_is_weak() {
        let outcome = analyse_open_book(&AtomicBool::new(false), &mut Vec::new()).expect("not cancelled");
        assert!(outcome.weak_filtering);
    }

    struct TempIndex(std::path::PathBuf);

    impl Drop for TempIndex {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn others(n: usize) -> Vec<BackgroundBook> {
        (0..n)
            .map(|i| BackgroundBook {
                fingerprint: format!("other{i}"),
                file_name: format!("other{i}.txt"),
                encoding_label: "GBK".into(),
            })
            .collect()
    }

    #[test]
    fn four_other_books_that_repeat_the_name_drop_it_and_the_backfill_shares_the_progress_bar() {
        let index = TempIndex(std::env::temp_dir().join(format!("finder-commands-index-{}", std::process::id())));
        let (cache, fingerprint) = cache_with_open_book(&book_with_a_name());
        let book = book_commands::open_book_handle(&cache, &fingerprint).expect("book is open");
        let read_other = |_: &BackgroundBook| {
            let same = encoding_rs::GB18030.encode(&book_with_a_name()).0.into_owned();
            match book_loader::load_book(&same, Some("GBK")).ok()? {
                LoadOutcome::Loaded(content) => Some(content),
                LoadOutcome::NeedsEncodingChoice(_) => None,
            }
        };

        let mut events = Vec::new();
        let outcome = analyse(
            &book,
            &fingerprint,
            &AtomicBool::new(false),
            &HashSet::new(),
            &Coverage::default(),
            &index.0,
            &others(4),
            &read_other,
            &mut |p| events.push(p),
        )
        .expect("not cancelled");

        assert!(!outcome.weak_filtering);
        assert!(outcome.candidates.iter().all(|c| c.text != "滕青山"), "frequent in 4 other books");
        let stages: Vec<_> = events.iter().map(|p| p.stage).collect();
        assert_eq!(stages.first(), Some(&candidate_finder::Stage::BackgroundTable));
        assert!(events.windows(2).all(|w| w[0].percent <= w[1].percent), "never goes backwards");
        assert_eq!(events.last().map(|p| p.percent), Some(100));
    }

    #[test]
    fn the_analyzed_book_and_a_repeated_fingerprint_are_not_background() {
        let index = TempIndex(std::env::temp_dir().join(format!("finder-commands-self-{}", std::process::id())));
        let (cache, fingerprint) = cache_with_open_book(&book_with_a_name());
        let book = book_commands::open_book_handle(&cache, &fingerprint).expect("book is open");
        let mut listed = others(1);
        listed.push(listed[0].clone());
        listed.push(BackgroundBook { fingerprint: fingerprint.clone(), ..listed[0].clone() });
        let reads = std::cell::Cell::new(0);
        let read_other = |_: &BackgroundBook| {
            reads.set(reads.get() + 1);
            None
        };
        analyse(&book, &fingerprint, &AtomicBool::new(false), &HashSet::new(), &Coverage::default(), &index.0, &listed, &read_other, &mut |_| {})
            .expect("not cancelled");
        assert_eq!(reads.get(), 1);
    }

    #[test]
    fn index_book_stores_a_sidecar_once_and_leaves_a_valid_one_alone() {
        let index = TempIndex(std::env::temp_dir().join(format!("finder-commands-open-{}", std::process::id())));
        let (cache, fingerprint) = cache_with_open_book(&book_with_a_name());
        let book = book_commands::open_book_handle(&cache, &fingerprint).expect("book is open");
        let label = book.encoding.label.clone();

        index_book(&book, &index.0, &fingerprint).expect("indexes");
        let stored = book_index::read_valid(&index.0, &fingerprint, &label).expect("stored");
        assert!(stored.binary_search(&candidate_finder::string_hash("滕青山")).is_ok());
        index_book(&book, &index.0, &fingerprint).expect("second call is a no-op");
        assert_eq!(book_index::read_valid(&index.0, &fingerprint, &label), Some(stored));
    }
}
