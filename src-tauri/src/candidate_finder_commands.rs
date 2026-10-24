//! Candidate finder IPC: run, cancel, and the progress event. The analysis is
//! `candidate_finder.rs` (pure); this file holds what needs Tauri and state — the open
//! book's handle, the per-run cancel flags and the event emitter.
//!
//! Reads the open book via `book_commands::open_book_handle`, as the chapter outline does:
//! a shared handle, the cache lock released before the scan starts.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::book_commands::{self, BookCache};
use crate::book_loader::BookContent;
use crate::candidate_finder::{self, Candidate, Coverage, InactiveDictionary, KeySet, Progress};

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

fn analyse(
    book: &BookContent,
    flag: &AtomicBool,
    phrases: &HashSet<String>,
    coverage: &Coverage,
    progress: &mut dyn FnMut(Progress),
) -> Option<Vec<Candidate>> {
    candidate_finder::find_candidates(&book.line_slices(), phrases, coverage, progress, &|| {
        flag.load(Ordering::Relaxed)
    })
}

/// Run the finder over the open book. `phrases` are the keys of the `phrases` dictionary;
/// `active_keys` are the keys of the book's active proper-noun dictionaries (the coverage
/// mask) and `inactive` the other proper-noun dictionaries, used only for the Also-in tag.
/// The finder never calls the JS trie. Resolves to `null` when the run was cancelled.
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
) -> Result<Option<Vec<Candidate>>, String> {
    let book = book_commands::open_book_handle(&cache, &fingerprint)?;
    let flag = runs.flag_for(&run_id);
    let phrases: HashSet<String> = phrases.into_iter().collect();
    let coverage = Coverage { active: KeySet::new(active_keys), inactive };

    let event_run_id = run_id.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        analyse(&book, &flag, &phrases, &coverage, &mut |progress| {
            // A lost event only skips a progress tick.
            let _ = app.emit(
                PROGRESS_EVENT,
                ProgressEvent { run_id: &event_run_id, progress },
            );
        })
    })
    .await;

    runs.finish(&run_id);
    joined.map_err(|_| "Candidate finder stopped unexpectedly".to_string())
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

    fn analyse_open_book(flag: &AtomicBool, events: &mut Vec<Progress>) -> Option<Vec<Candidate>> {
        let (cache, fingerprint) = cache_with_open_book(&book_with_a_name());
        let book = book_commands::open_book_handle(&cache, &fingerprint).expect("book is open");
        analyse(&book, flag, &HashSet::new(), &Coverage::default(), &mut |p| events.push(p))
    }

    #[test]
    fn analyse_ranks_the_open_books_names_and_reports_progress() {
        let mut events = Vec::new();
        let found = analyse_open_book(&AtomicBool::new(false), &mut events).expect("not cancelled");

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
}
