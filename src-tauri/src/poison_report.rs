//! Tells the frontend that a lock was poisoned, at most once a minute.
//!
//! Every cache that recovers from a poisoned lock (`LruCache`, `BookCache`) calls
//! `record_mutex_poisoning` as its `on_poison` hook. After a poisoning, every cache access
//! (100+ per translation) can find the lock poisoned again, so the report is rate limited:
//! the first one emits at once, later ones inside the cooldown only count.
//!
//! The decision is `PoisonGate::record`, a pure function of the count, the last notification
//! time and `now_ms`, so the cooldown is tested without an `AppHandle` or a clock. The emit
//! is a thin shell over it. The frontend reads exactly the three payload fields below
//! (`useCachePoisoningGuard.ts`); the event keeps its historical name.

use once_cell::sync::OnceCell;
use serde::Serialize;
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::Emitter;

const NOTIFICATION_COOLDOWN_MS: u64 = 60_000;
const EVENT_NAME: &str = "dictionary-cache-critical-error";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PoisonPayload {
    pub event_count: u64,
    pub message: String,
    pub recommendation: String,
}

#[derive(Debug, Default)]
pub struct PoisonGate {
    events: u64,
    /// 0 until the first notification.
    last_notify_ms: u64,
}

impl PoisonGate {
    /// Count one poisoning. `Some` when the frontend should be told now, `None` inside the
    /// cooldown after the previous notification.
    pub fn record(&mut self, now_ms: u64) -> Option<PoisonPayload> {
        self.events += 1;
        if self.last_notify_ms > 0
            && now_ms.saturating_sub(self.last_notify_ms) < NOTIFICATION_COOLDOWN_MS
        {
            return None;
        }
        self.last_notify_ms = now_ms;
        Some(PoisonPayload {
            event_count: self.events,
            message: format!(
                "Cache corruption detected ({} events). Application restart recommended.",
                self.events
            ),
            recommendation: "Save your work and restart the application to ensure data integrity."
                .to_string(),
        })
    }
}

static GATE: Mutex<PoisonGate> = Mutex::new(PoisonGate { events: 0, last_notify_ms: 0 });
static APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();

/// Called during app setup so a report can reach the frontend. Before it runs, a report
/// goes to stderr only.
pub fn init_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// The `on_poison` hook for every cache.
pub fn record_mutex_poisoning() {
    // Nothing panics while the gate is held, so a poisoned gate still holds valid counters.
    let payload = GATE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .record(now_ms());
    let Some(payload) = payload else { return };

    match APP_HANDLE.get() {
        Some(app) => {
            let _ = app.emit(EVENT_NAME, payload);
        }
        None => eprintln!(
            "CRITICAL: cache corruption detected (mutex poisoning, {} events). \
             AppHandle not yet initialized - unable to emit frontend notification. \
             Restart the application to ensure data integrity.",
            payload.event_count
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_report_notifies_at_once() {
        let mut gate = PoisonGate::default();
        let payload = gate.record(1_000).expect("first report emits");
        assert_eq!(payload.event_count, 1);
    }

    #[test]
    fn reports_inside_the_cooldown_count_but_stay_silent() {
        let mut gate = PoisonGate::default();
        gate.record(1_000);
        assert_eq!(gate.record(1_000 + NOTIFICATION_COOLDOWN_MS - 1), None);
        assert_eq!(gate.record(1_000 + 5), None);
    }

    #[test]
    fn a_report_after_the_cooldown_notifies_with_the_running_count() {
        let mut gate = PoisonGate::default();
        gate.record(1_000);
        gate.record(2_000);
        let payload = gate
            .record(1_000 + NOTIFICATION_COOLDOWN_MS)
            .expect("cooldown over");
        assert_eq!(payload.event_count, 3);
    }

    #[test]
    fn the_cooldown_runs_from_the_last_notification_not_the_last_report() {
        let mut gate = PoisonGate::default();
        gate.record(1_000);
        gate.record(1_000 + NOTIFICATION_COOLDOWN_MS - 1); // silent
        assert!(gate.record(1_000 + NOTIFICATION_COOLDOWN_MS).is_some());
    }

    #[test]
    fn the_payload_has_exactly_the_three_fields_the_frontend_reads() {
        let mut gate = PoisonGate::default();
        let json = serde_json::to_value(gate.record(1).unwrap()).unwrap();
        let mut keys: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, ["event_count", "message", "recommendation"]);
    }
}
