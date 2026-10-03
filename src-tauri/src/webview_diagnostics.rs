//! Records when macOS kills the web view's content process.
//!
//! The Reader sometimes reloads by itself mid-session. Tauri's macOS runtime reloads the page
//! whenever WebKit terminates its web-content process (memory pressure, a crash or a
//! watchdog), and logs that only at debug level. Setting our own handler replaces that default,
//! so this one reloads too, after appending a line to `webview-terminations.log` in the app data
//! folder. A `launch` line is written at startup, so the log shows reloads against restarts.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

use tauri::Manager;

const LOG_FILE: &str = "webview-terminations.log";

static STARTED: OnceLock<Instant> = OnceLock::new();
#[cfg(target_os = "macos")]
static TERMINATIONS: AtomicU32 = AtomicU32::new(0);

/// One log line: when, what happened, and how long the app had been running.
fn format_line(timestamp: &str, event: &str, uptime_secs: u64, terminations: u32) -> String {
    format!("{timestamp} {event} uptime={uptime_secs}s terminations_this_run={terminations}\n")
}

fn uptime_secs() -> u64 {
    STARTED.get().map_or(0, |started| started.elapsed().as_secs())
}

fn append(log_path: &Path, line: &str) -> std::io::Result<()> {
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(log_path)?;
    file.write_all(line.as_bytes())
}

fn record<M: Manager<R>, R: tauri::Runtime>(manager: &M, event: &str, terminations: u32) {
    let timestamp = chrono::Local::now().to_rfc3339();
    let line = format_line(&timestamp, event, uptime_secs(), terminations);
    let result = manager
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))
        .and_then(|dir| append(&dir.join(LOG_FILE), &line));
    if let Err(error) = result {
        // Diagnostics must never take the app down; stderr is the fallback.
        eprintln!("webview diagnostics: could not write {LOG_FILE}: {error}");
    }
}

/// Call once at startup, from the setup hook.
pub fn record_launch<M: Manager<R>, R: tauri::Runtime>(manager: &M) {
    let _ = STARTED.set(Instant::now());
    record(manager, "launch", 0);
}

/// The web-content-terminate handler: log it, then reload as Tauri's default would.
/// macOS only, the one platform whose runtime has the hook (lib.rs registers it under the same cfg).
#[cfg(target_os = "macos")]
pub fn on_web_content_terminated<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    let count = TERMINATIONS.fetch_add(1, Ordering::SeqCst) + 1;
    record(webview, "web-content-terminated", count);
    if let Err(error) = webview.reload() {
        eprintln!("webview diagnostics: failed to reload the web view: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_names_the_event_the_uptime_and_the_count() {
        assert_eq!(
            format_line("2026-10-03T22:14:28+07:00", "web-content-terminated", 5400, 2),
            "2026-10-03T22:14:28+07:00 web-content-terminated uptime=5400s terminations_this_run=2\n"
        );
    }

    #[test]
    fn appending_creates_the_folder_and_keeps_earlier_lines() {
        let dir = std::env::temp_dir().join(format!(
            "webview-diagnostics-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        let path = dir.join("nested").join(LOG_FILE);

        append(&path, "first\n").unwrap();
        append(&path, "second\n").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "first\nsecond\n");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
