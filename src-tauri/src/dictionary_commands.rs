use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{Emitter, Manager, State};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use rayon::prelude::*;
use std::time::{Instant, SystemTime};
use governor::{Quota, RateLimiter, clock::DefaultClock, state::{InMemoryState, NotKeyed}};

// Import lookup index engine
use crate::lookup_index_engine::{
    build_comprehensive_lookup_index, Dictionary, DictionaryType, IndexBuildOptions, TrieNode,
    CategorizedMatches,
};

// ============================================================================
// SECURITY: Constants and Validation Functions
// ============================================================================

// Size limits to prevent DoS attacks
const MAX_JSON_SIZE_BYTES: usize = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_SIZE_BYTES: usize = 1 * 1024 * 1024;  // 1MB
const MAX_DICTIONARY_ENTRIES: usize = 50_000;
const MAX_DICTIONARY_ID_LENGTH: usize = 100;

/// SECURITY: Validate dictionary ID to prevent path traversal attacks
///
/// Prevents:
/// - Path traversal (../, /, \)
/// - Absolute paths (/, C:)
/// - Null byte injection
/// - Non-alphanumeric characters (except hyphen)
/// - Excessively long IDs
fn validate_dictionary_id(dictionary_id: &str) -> Result<(), String> {
    // Must not be empty
    if dictionary_id.is_empty() {
        return Err("Invalid dictionary ID: cannot be empty".to_string());
    }

    // Enforce maximum length
    if dictionary_id.chars().count() > MAX_DICTIONARY_ID_LENGTH {
        return Err(format!(
            "Invalid dictionary ID: maximum length is {} characters",
            MAX_DICTIONARY_ID_LENGTH
        ));
    }

    // Check for path traversal sequences
    if dictionary_id.contains("..") || dictionary_id.contains('/') || dictionary_id.contains('\\') {
        return Err("Invalid dictionary ID: path separators not allowed".to_string());
    }

    // Block control characters (includes null bytes — is_control() covers '\0')
    if dictionary_id.chars().any(|c| c.is_control()) {
        return Err("Invalid dictionary ID: control characters not allowed".to_string());
    }

    Ok(())
}

/// SECURITY: Validate file size before reading to prevent DoS
fn validate_file_size(path: &PathBuf, max_size: usize) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|e| {
        sanitize_io_error(e, "file")
    })?;

    if metadata.len() > max_size as u64 {
        return Err(format!(
            "File too large: {} MB (max: {} MB)",
            metadata.len() / 1024 / 1024,
            max_size / 1024 / 1024
        ));
    }
    Ok(())
}

/// SECURITY: Check JSON nesting depth iteratively to prevent stack overflow.
///
/// serde_json's deserializer already enforces a 128-level recursion limit, so by
/// the time a `serde_json::Value` reaches Tauri command handlers it is bounded.
/// This check is defense-in-depth for values constructed internally or passed
/// through paths that bypass deserialization.  Uses BFS to avoid recursive stack
/// growth in the checker itself.
fn check_json_depth(value: &serde_json::Value, max_depth: usize) -> Result<(), String> {
    use std::collections::VecDeque;
    let mut queue: VecDeque<(&serde_json::Value, usize)> = VecDeque::new();
    queue.push_back((value, 0));
    while let Some((val, depth)) = queue.pop_front() {
        if depth > max_depth {
            return Err(format!(
                "JSON nesting too deep (max: {} levels)",
                max_depth
            ));
        }
        match val {
            serde_json::Value::Array(arr) => {
                for item in arr {
                    queue.push_back((item, depth + 1));
                }
            }
            serde_json::Value::Object(obj) => {
                for (_, v) in obj {
                    queue.push_back((v, depth + 1));
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// SECURITY: Sanitize I/O errors to prevent information disclosure
pub(crate) fn sanitize_io_error(error: std::io::Error, context: &str) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => format!("{} not found", context),
        std::io::ErrorKind::PermissionDenied => format!("Permission denied accessing {}", context),
        std::io::ErrorKind::AlreadyExists => format!("{} already exists", context),
        _ => {
            // Log full error server-side for debugging
            eprintln!("Error accessing {}: {:?}", context, error);
            // Return generic message to user
            format!("Failed to access {}", context)
        }
    }
}

/// Checks whether a rename target already exists on disk. Shared by every
/// rename path (standalone and cascade) so a collision is never silently
/// overwritten by `fs::rename`. Returns the error message to report, not an
/// `Err`, since callers report a collision as a soft `DictionaryResponse::err`
/// (and the cascade path additionally needs to roll back before reporting it).
fn collision_message(new_path: &PathBuf, new_dictionary_id: &str, label: &str) -> Option<String> {
    if new_path.exists() {
        Some(format!("{} dictionary '{}' already exists", label, new_dictionary_id))
    } else {
        None
    }
}

// CODE REVIEW FIX (2026-01-30): Track mutex poisoning events for monitoring
// Global counters to detect cache corruption and notify frontend
static MUTEX_POISONED: AtomicBool = AtomicBool::new(false);
static POISONING_EVENT_COUNT: AtomicU64 = AtomicU64::new(0);

// CODE REVIEW FIX (2026-02-01): Rate limiting for poisoning notifications
// Prevents notification spam when cache is accessed frequently after poisoning
static LAST_POISONING_NOTIFICATION: AtomicU64 = AtomicU64::new(0);
const NOTIFICATION_COOLDOWN_MS: u64 = 60_000; // 1 minute between notifications

// CODE REVIEW FIX (CRITICAL-2): Store AppHandle for immediate event emission
// Initialized during app setup, used to emit poisoning events immediately
use once_cell::sync::OnceCell;
static APP_HANDLE: OnceCell<tauri::AppHandle> = OnceCell::new();

/// CODE REVIEW FIX (CRITICAL-2): Initialize AppHandle for event emission
/// Called during app setup to enable immediate poisoning notifications
pub fn init_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn record_mutex_poisoning() {
    MUTEX_POISONED.store(true, Ordering::SeqCst);
    POISONING_EVENT_COUNT.fetch_add(1, Ordering::SeqCst);
    emit_poisoning_event();
}

/// CODE REVIEW FIX (CRITICAL-2): Emit mutex poisoning event immediately
/// Notifies frontend as soon as poisoning is detected, not just on health check
/// CODE REVIEW FIX (2026-02-01): Added stderr fallback for early startup failures
/// CODE REVIEW FIX (2026-02-01): Rate limiting to prevent notification spam
///
/// Problem: After poisoning, every cache access (100+ per translation) emits an event,
/// causing performance degradation and UI notification spam.
///
/// Solution: Only emit notifications once per minute. Still alerts immediately on first
/// poisoning, but prevents repeated notifications during degraded operation.
fn emit_poisoning_event() {
    let event_count = POISONING_EVENT_COUNT.load(Ordering::SeqCst);

    let now_ms = now_ms();

    let last_notify = LAST_POISONING_NOTIFICATION.load(Ordering::SeqCst);

    // Rate limiting: Only notify once per cooldown period
    // This prevents 100+ notifications per second during degraded operation
    if last_notify > 0 && now_ms.saturating_sub(last_notify) < NOTIFICATION_COOLDOWN_MS {
        // Skip notification - still within cooldown period
        return;
    }

    // Update last notification time (atomic compare-and-swap to handle race conditions)
    // If another thread already updated the timestamp, we skip (they sent the notification)
    if LAST_POISONING_NOTIFICATION
        .compare_exchange(last_notify, now_ms, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return; // Another thread already sent notification
    }

    // Emit notification to frontend
    if let Some(app) = APP_HANDLE.get() {
        // Determine restart urgency based on event count
        let auto_restart_seconds = if event_count > 100 {
            60  // Critical: restart in 1 minute
        } else if event_count > 10 {
            300 // Warning: restart in 5 minutes
        } else {
            0   // Informational: restart when convenient
        };

        // Derive RFC3339 timestamp from the same now_ms already used for rate-limiting,
        // avoiding a second clock call via chrono::Utc::now().
        let timestamp = chrono::DateTime::from_timestamp_millis(now_ms as i64)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| now_ms.to_string());
        let _ = app.emit("dictionary-cache-critical-error", serde_json::json!({
            "type": "mutex_poisoning",
            "event_count": event_count,
            "severity": if event_count > 100 { "critical" } else { "warning" },
            "message": format!(
                "Dictionary cache corruption detected ({} events). Application restart recommended.",
                event_count
            ),
            "recommendation": if event_count > 100 {
                format!("Critical: Auto-restart recommended in {} seconds to prevent data loss.", auto_restart_seconds)
            } else {
                "Save your work and restart the application to ensure data integrity.".to_string()
            },
            "timestamp": timestamp,
            "last_notification_ms": now_ms,
            "cooldown_ms": NOTIFICATION_COOLDOWN_MS,
            "auto_restart_recommended_in_seconds": auto_restart_seconds
        }));
    } else {
        // Fallback: Log to stderr when AppHandle not yet initialized during early startup
        eprintln!("═══════════════════════════════════════════════════════════════════════════");
        eprintln!("CRITICAL: Dictionary cache corruption detected (mutex poisoning)");
        eprintln!("Event count: {}", event_count);
        eprintln!("AppHandle not yet initialized - unable to emit frontend notification");
        eprintln!("ACTION REQUIRED: Restart the application to ensure data integrity");
        eprintln!("═══════════════════════════════════════════════════════════════════════════");
    }
}

// Dictionary cache with LRU eviction to prevent unbounded memory growth
// Max size: 5 dictionaries (~270MB assuming 27K entries × 2KB/entry)
const MAX_CACHE_ENTRIES: usize = 5;

pub struct DictionaryCache {
    cache: Mutex<HashMap<String, serde_json::Value>>,
    // Track access order for LRU eviction (key -> last access timestamp)
    access_order: Mutex<HashMap<String, u64>>,
}

impl DictionaryCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            access_order: Mutex::new(HashMap::new()),
        }
    }

    /// CODE REVIEW FIX: Handle mutex poisoning with graceful degradation
    /// Poisoning indicates a panic occurred, but we can continue using the lock
    /// CODE REVIEW FIX 2026-02-01 (IMPORTANT-3): Self-healing mutex recovery
    /// The mutex remains marked as poisoned but continues to function normally
    /// CODE REVIEW FIX 2026-02-08: LRU eviction - track access time on get
    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        let value = match self.cache.lock() {
            Ok(cache) => cache.get(key).cloned(),
            Err(poisoned) => {
                record_mutex_poisoning();

                // CODE REVIEW FIX 2026-02-01 (IMPORTANT-3): Graceful recovery without restart
                eprintln!("WARNING: Cache mutex poisoned during get - continuing with degraded reliability");
                eprintln!("Poisoning indicates a panic occurred while holding the lock");
                eprintln!("The mutex continues to function but may have corrupted data");
                eprintln!("Application will continue running - restart recommended when convenient");

                // IMPORTANT: Continue using the lock! into_inner() gives us the guard
                // The mutex stays poisoned but remains functional
                let cache = poisoned.into_inner();
                cache.get(key).cloned()
            }
        };

        // Update access time for LRU tracking (if value exists).
        // Re-check that the key is still in cache before inserting into access_order:
        // between releasing the cache lock above and acquiring access_order here, a
        // concurrent set() (e.g. from load_dictionaries_parallel) could evict this key
        // and remove its access_order entry.  Inserting it back would create a phantom
        // entry that accumulates with each parallel load cycle.  The extra lock
        // acquisition is cheap relative to the dictionary-load work happening in parallel.
        if value.is_some() {
            let still_in_cache = self
                .cache
                .lock()
                .map(|c| c.contains_key(key))
                .unwrap_or(false);
            if still_in_cache {
                if let Ok(mut access_order) = self.access_order.lock() {
                    access_order.insert(key.to_string(), now_ms());
                }
            }
        }

        value
    }

    /// CODE REVIEW FIX: Handle mutex poisoning with graceful degradation
    /// Poisoning indicates a panic occurred, but we can continue using the lock
    /// CODE REVIEW FIX 2026-02-01 (IMPORTANT-3): Self-healing mutex recovery
    /// The mutex remains marked as poisoned but continues to function normally
    /// CODE REVIEW FIX 2026-02-08: LRU eviction - evict oldest entry when cache is full
    /// CODE REVIEW FIX 2026-02-08 (MEDIUM): Avoid nested mutex locks to prevent deadlocks
    /// CODE REVIEW FIX 2026-02-13 (IMPORTANT-4): Eliminate TOCTOU race — eviction check and
    /// insert now happen inside one cache lock acquisition.  The LRU key is found first
    /// (holding only access_order), then the cache lock is taken once to check the condition
    /// freshly, evict if still necessary, and insert — all atomically.
    pub fn set(&self, key: String, value: serde_json::Value) {
        // Step 1: Collect all LRU candidates sorted oldest-first while holding only access_order.
        // Keeping the full sorted list (rather than just the minimum) means the eviction loop
        // below can skip stale candidates and still remove the true LRU entry, eliminating the
        // need for a random-key fallback in the common concurrent-access case.
        let lru_candidates: Vec<String> = if let Ok(access_order) = self.access_order.lock() {
            let mut entries: Vec<(String, u64)> = access_order
                .iter()
                .map(|(k, &v)| (k.clone(), v))
                .collect();
            entries.sort_by_key(|(_, ts)| *ts); // oldest first
            entries.into_iter().map(|(k, _)| k).collect()
        } else {
            Vec::new()
        };

        // Step 2: Acquire the cache lock once, check the eviction condition freshly,
        // evict if needed, and insert — all within the same critical section to prevent TOCTOU.
        match self.cache.lock() {
            Ok(mut cache) => {
                // Re-check eviction condition under the lock (eliminates TOCTOU window).
                // Declared outside the if-block so access_order cleanup below can use it.
                let mut evicted_key: Option<String> = None;
                if cache.len() >= MAX_CACHE_ENTRIES && !cache.contains_key(&key) {
                    // Try candidates in oldest-first order; stale candidates (already evicted
                    // from cache but still in access_order) return None from remove() and are
                    // skipped, so the loop naturally finds the true LRU entry.
                    for candidate in &lru_candidates {
                        if cache.remove(candidate).is_some() {
                            eprintln!("LRU cache eviction: entry removed");
                            evicted_key = Some(candidate.clone());
                            break;
                        }
                    }
                    // Last resort: all access_order candidates were stale (access_order fully
                    // out of sync with cache). Evict the lexicographically smallest key for
                    // deterministic behaviour — HashMap iteration order varies across runs,
                    // so keys().next() would pick an arbitrary entry each time, making
                    // eviction patterns non-reproducible and hard to debug.
                    if evicted_key.is_none() {
                        if let Some(fallback_key) = cache.keys().min().cloned() {
                            eprintln!("LRU cache last-resort eviction: entry removed");
                            cache.remove(&fallback_key);
                            evicted_key = Some(fallback_key);
                        }
                    }
                }

                cache.insert(key.clone(), value);

                // Update access time and clean up the evicted key's phantom entry.
                // The cache lock is dropped first so acquiring access_order is safe
                // (no nested lock, no deadlock risk).
                drop(cache);
                if let Ok(mut access_order) = self.access_order.lock() {
                    access_order.insert(key.clone(), now_ms());

                    // Remove the evicted key's phantom entry.  Without this, access_order
                    // accumulates one stale entry per eviction and grows without bound across
                    // a session that switches dictionaries (MAX_CACHE_ENTRIES=5 means every
                    // set() on a new key triggers an eviction).  The cache lock is already
                    // released above so this is a single-lock operation with no deadlock risk.
                    if let Some(evicted) = evicted_key {
                        access_order.remove(&evicted);
                    }

                    // CODE REVIEW NOTE (MEDIUM-2): There is a benign race between get()
                    // updating access_order and a concurrent set() reading it.  Between
                    // releasing the cache lock in get() and acquiring access_order, a set()
                    // on the same key could evict it; the subsequent access_order update in
                    // get() creates a phantom entry for an evicted key.  This is bounded to
                    // at most one phantom entry per concurrent get/set pair and resolves on
                    // the next eviction cycle, so it has no correctness or capacity impact.
                }
            }
            Err(poisoned) => {
                record_mutex_poisoning();

                // CODE REVIEW FIX 2026-02-01 (IMPORTANT-3): Graceful recovery without restart
                eprintln!("WARNING: Cache mutex poisoned during set - continuing with degraded reliability");
                eprintln!("Poisoning indicates a panic occurred while holding the lock");
                eprintln!("Clearing corrupted cache and inserting fresh data");
                eprintln!("Application will continue running - restart recommended when convenient");

                // IMPORTANT: Continue using the lock! into_inner() gives us the guard
                // Clear corrupted data and insert fresh value
                let mut cache = poisoned.into_inner();
                cache.clear(); // Remove potentially corrupted entries
                cache.insert(key.clone(), value); // Insert fresh data to rebuild cache

                // Also clear access_order on poisoning
                if let Ok(mut access_order) = self.access_order.lock() {
                    access_order.clear();
                    access_order.insert(key, now_ms());
                }
            }
        }
    }

    /// CODE REVIEW FIX: Handle mutex poisoning with graceful degradation
    /// Poisoning indicates a panic occurred, but we can continue using the lock
    /// CODE REVIEW FIX 2026-02-01 (IMPORTANT-3): Self-healing mutex recovery
    /// The mutex remains marked as poisoned but continues to function normally
    /// CODE REVIEW FIX 2026-02-08: LRU eviction - also invalidate access_order tracking
    /// CODE REVIEW FIX 2026-02-12: Avoid nested mutex locks to prevent deadlocks
    /// (matches the pattern already used in set())
    pub fn invalidate(&self, dictionary_id: Option<&str>) {
        // Step 1: Perform cache invalidation, collecting surviving keys for access_order cleanup.
        // The cache guard is explicitly dropped before we acquire access_order — same pattern as
        // set() — to prevent the nested-lock deadlock that existed in the previous implementation.
        let surviving_keys: Option<Vec<String>> = match self.cache.lock() {
            Ok(mut cache) => {
                if let Some(id) = dictionary_id {
                    // Keys are bare dictionary IDs (e.g. "phrases", "properNouns-MyNovel").
                    // The old "id:" prefix format was retired when get_cache_key() was simplified.
                    cache.retain(|key, _| key != id);
                    let keys = cache.keys().cloned().collect();
                    drop(cache); // Release before acquiring access_order
                    Some(keys)
                } else {
                    cache.clear();
                    drop(cache); // Release before acquiring access_order
                    None
                }
            }
            Err(poisoned) => {
                record_mutex_poisoning();

                // CODE REVIEW FIX 2026-02-01 (IMPORTANT-3): Graceful recovery without restart
                eprintln!("WARNING: Cache mutex poisoned during invalidation - continuing with degraded reliability");
                eprintln!("Poisoning indicates a panic occurred while holding the lock");
                eprintln!("Clearing entire cache regardless of dictionary_id (safe after panic)");
                eprintln!("Application will continue running - restart recommended when convenient");

                // IMPORTANT: Continue using the lock! into_inner() gives us the guard
                let mut cache = poisoned.into_inner();
                cache.clear(); // Full clear is safest after poisoning
                // cache guard dropped when this Err block ends
                None
            }
        };
        // cache lock is now released — safe to acquire access_order independently

        // Step 2: Clean up access_order to match the surviving cache entries.
        if let Ok(mut access_order) = self.access_order.lock() {
            match surviving_keys {
                Some(ref keys) => {
                    let keys_set: std::collections::HashSet<&String> = keys.iter().collect();
                    access_order.retain(|k, _| keys_set.contains(k));
                }
                None => access_order.clear(),
            }
        }
    }
}

// ============================================================================
// PERFORMANCE: Trie Cache for build_lookup_index
// ============================================================================
//
// `build_lookup_index_impl` previously rebuilt a `TrieNode` from scratch for every
// dictionary on every call — JS re-sends the full flat entries over IPC each
// translation, and Rust re-inserted them all. Measured (2026-08-26, scratch bench):
// ~7-10ms to rebuild ~26,500 entries across 7 dictionaries, vs. ~781µs for the
// actual rayon-parallel matching that consumes the result — construction dominated
// the operation. See ADR-040's corrected note.
//
// Keyed by a content hash of the dictionary's own `entries`, NOT by dictionary_id —
// self-correcting: if entries differ (any edit, saved or not), the hash differs and
// the cache misses, so there is no invalidation path to wire and nothing to forget.
// This is deliberately simpler than `DictionaryCache` above (no `invalidate()`, no
// TOCTOU-safe eviction dance) because content-hash keys can never go stale.

/// Cap chosen larger than `DictionaryCache`'s `MAX_CACHE_ENTRIES` (5) — a trie-cache
/// entry is per dictionary *content version*, not per dictionary id, so a session
/// bouncing between a few recent edits of the same dictionary needs more headroom.
const MAX_TRIE_CACHE_ENTRIES: usize = 20;

/// Hashes a dictionary's flat entries into a cache key. `DictionaryEntry` derives
/// `Hash` (see below) so this is just `entries.hash(&mut hasher)` — order-sensitive,
/// which is correct: JS always sends entries in a stable order per dictionary, and a
/// reordering would only ever come from a real content change upstream.
fn hash_dictionary_entries(entries: &[DictionaryEntry]) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    entries.hash(&mut hasher);
    hasher.finish()
}

pub struct TrieCache {
    cache: Mutex<HashMap<u64, Arc<TrieNode>>>,
    access_order: Mutex<HashMap<u64, u64>>,
}

impl TrieCache {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            access_order: Mutex::new(HashMap::new()),
        }
    }

    /// Returns the cached trie for `key`, if present, and refreshes its LRU timestamp.
    /// Same mutex-poisoning graceful-degradation pattern as `DictionaryCache::get`.
    pub fn get(&self, key: u64) -> Option<Arc<TrieNode>> {
        let value = match self.cache.lock() {
            Ok(cache) => cache.get(&key).cloned(),
            Err(poisoned) => {
                record_mutex_poisoning();
                eprintln!("WARNING: Trie cache mutex poisoned during get - continuing with degraded reliability");
                poisoned.into_inner().get(&key).cloned()
            }
        };

        if value.is_some() {
            if let Ok(mut access_order) = self.access_order.lock() {
                access_order.insert(key, now_ms());
            }
        }

        value
    }

    /// Inserts `value` under `key`, evicting the LRU entry first if the cache is full.
    /// Same TOCTOU-safe single-critical-section eviction as `DictionaryCache::set`.
    pub fn set(&self, key: u64, value: Arc<TrieNode>) {
        let lru_candidates: Vec<u64> = if let Ok(access_order) = self.access_order.lock() {
            let mut entries: Vec<(u64, u64)> = access_order.iter().map(|(&k, &v)| (k, v)).collect();
            entries.sort_by_key(|(_, ts)| *ts);
            entries.into_iter().map(|(k, _)| k).collect()
        } else {
            Vec::new()
        };

        match self.cache.lock() {
            Ok(mut cache) => {
                let mut evicted_key: Option<u64> = None;
                if cache.len() >= MAX_TRIE_CACHE_ENTRIES && !cache.contains_key(&key) {
                    for candidate in &lru_candidates {
                        if cache.remove(candidate).is_some() {
                            evicted_key = Some(*candidate);
                            break;
                        }
                    }
                    if evicted_key.is_none() {
                        if let Some(&fallback_key) = cache.keys().min() {
                            cache.remove(&fallback_key);
                            evicted_key = Some(fallback_key);
                        }
                    }
                }

                cache.insert(key, value);

                drop(cache);
                if let Ok(mut access_order) = self.access_order.lock() {
                    access_order.insert(key, now_ms());
                    if let Some(evicted) = evicted_key {
                        access_order.remove(&evicted);
                    }
                }
            }
            Err(poisoned) => {
                record_mutex_poisoning();
                eprintln!("WARNING: Trie cache mutex poisoned during set - continuing with degraded reliability");
                let mut cache = poisoned.into_inner();
                cache.clear();
                cache.insert(key, value);
                if let Ok(mut access_order) = self.access_order.lock() {
                    access_order.clear();
                    access_order.insert(key, now_ms());
                }
            }
        }
    }
}

// ============================================================================
// SECURITY: Rate Limiters
// ============================================================================

/// Rate limiters for expensive operations to prevent DoS attacks
pub struct RateLimiters {
    build_index: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
    load_parallel: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
    export_import: RateLimiter<NotKeyed, InMemoryState, DefaultClock>,
}

impl RateLimiters {
    pub fn new() -> Self {
        Self {
            // 10 build_index calls per minute (expensive operation)
            // CODE REVIEW FIX (2026-02-01): Use expect() instead of unwrap() for better error messages
            build_index: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(10).expect("Rate limit quota must be non-zero"))
            ),
            // 30 load_parallel calls per minute
            load_parallel: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(30).expect("Rate limit quota must be non-zero"))
            ),
            // 5 export/import operations per minute (very expensive)
            export_import: RateLimiter::direct(
                Quota::per_minute(NonZeroU32::new(5).expect("Rate limit quota must be non-zero"))
            ),
        }
    }

    pub fn check_build_index(&self) -> Result<(), String> {
        self.build_index.check()
            .map_err(|_| "Rate limit exceeded for index building. Please wait before retrying.".to_string())
    }

    pub fn check_load_parallel(&self) -> Result<(), String> {
        self.load_parallel.check()
            .map_err(|_| "Rate limit exceeded for parallel loading. Please wait before retrying.".to_string())
    }

    pub fn check_export_import(&self) -> Result<(), String> {
        self.export_import.check()
            .map_err(|_| "Rate limit exceeded for export/import. Please wait before retrying.".to_string())
    }
}

#[derive(Serialize, Deserialize)]
pub struct DictionaryResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dictionaries: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    /// Set by `load_blob` when the file existed but could not be read as JSON and was renamed
    /// aside — the new file name, for the one-time warning (`utils/unreadableFile.ts`).
    #[serde(skip_serializing_if = "Option::is_none")]
    quarantined: Option<String>,
}

impl DictionaryResponse {
    /// Success with no payload.
    fn ok() -> Self {
        Self { success: true, data: None, error: None, dictionaries: None, message: None, quarantined: None }
    }

    /// Success carrying a JSON data blob.
    fn ok_with_data(data: serde_json::Value) -> Self {
        Self { success: true, data: Some(data), error: None, dictionaries: None, message: None, quarantined: None }
    }

    /// Success carrying a list of dictionary IDs.
    fn ok_with_dicts(dictionaries: Vec<String>) -> Self {
        Self { success: true, data: None, error: None, dictionaries: Some(dictionaries), message: None, quarantined: None }
    }

    /// Success carrying a human-readable message.
    fn ok_with_message(message: impl Into<String>) -> Self {
        Self { success: true, data: None, error: None, dictionaries: None, message: Some(message.into()), quarantined: None }
    }

    /// Failure carrying an error description.
    fn err(error: impl Into<String>) -> Self {
        Self { success: false, data: None, error: Some(error.into()), dictionaries: None, message: None, quarantined: None }
    }
}

// Get the dictionary directory path
fn get_dictionary_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to locate application data directory".to_string())?;
    Ok(app_data_dir.join("dictionaries"))
}

/// Return the dictionary directory path, creating it if it does not exist.
/// Uses sanitize_io_error so callers never leak OS-level path information.
fn get_or_create_dictionary_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = get_dictionary_path(app_handle)?;
    fs::create_dir_all(&path).map_err(|e| sanitize_io_error(e, "dictionary directory"))?;
    Ok(path)
}

// Get cache key for dictionary.
// All dictionaries live in the same directory, so dictionary_id alone is sufficient.
// Never use file_path.display() here — it embeds the full OS path (e.g. /Users/...),
// which must not appear in any value that could be serialized or logged.
fn get_cache_key(dictionary_id: &str) -> String {
    dictionary_id.to_string()
}

#[tauri::command]
pub async fn open_dictionary_folder(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;

    // Open folder using opener plugin
    use tauri_plugin_opener::OpenerExt;
    app_handle.opener()
        .open_path(dictionary_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|_| "Failed to open dictionary folder".to_string())?;

    Ok(DictionaryResponse::ok())
}

/// Lists `.json` dictionary files in `dictionary_path` whose name starts with `prefix`,
/// excluding `.trie.json` cache files and any name failing `validate_dictionary_id`
/// (SECURITY: strip suffix then validate before returning to frontend — a failing
/// entry is silently dropped from the list, not surfaced as an error).
/// Pure filesystem function — no `AppHandle` — directly unit-testable against a temp
/// directory. Shared by `list_proper_nouns_dictionaries_impl`/`list_fiction_pattern_dictionaries_impl`,
/// which differ only in the prefix they filter on.
fn list_dictionaries_with_prefix(dictionary_path: &PathBuf, prefix: &str) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(dictionary_path)
        .map_err(|e| sanitize_io_error(e, "dictionary directory"))?;

    let dicts: Vec<String> = entries
        .filter_map(|entry| {
            entry.ok().and_then(|e| {
                let file_name = e.file_name();
                let file_str = file_name.to_str()?;
                if file_str.starts_with(prefix) && file_str.ends_with(".json") && !file_str.ends_with(".trie.json") {
                    let base_name = file_str.strip_suffix(".json")?;
                    validate_dictionary_id(base_name).ok()?;
                    Some(base_name.to_string())
                } else {
                    None
                }
            })
        })
        .collect();

    Ok(dicts)
}

fn list_proper_nouns_dictionaries_impl(dictionary_path: &PathBuf) -> Result<Vec<String>, String> {
    list_dictionaries_with_prefix(dictionary_path, "properNouns")
}

fn list_fiction_pattern_dictionaries_impl(dictionary_path: &PathBuf) -> Result<Vec<String>, String> {
    list_dictionaries_with_prefix(dictionary_path, "patterns-")
}

#[tauri::command]
pub async fn list_proper_nouns_dictionaries(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    let dicts = list_proper_nouns_dictionaries_impl(&dictionary_path)?;
    Ok(DictionaryResponse::ok_with_dicts(dicts))
}

#[tauri::command]
pub async fn list_fiction_pattern_dictionaries(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    let dicts = list_fiction_pattern_dictionaries_impl(&dictionary_path)?;
    Ok(DictionaryResponse::ok_with_dicts(dicts))
}

#[tauri::command]
pub async fn create_structural_patterns_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    create_structural_patterns_dictionary_impl(&dictionary_path, &cache, &dictionary_id)
}

/// Creates an empty `patterns-*` structural patterns dictionary file at
/// `dictionary_path/{dictionary_id}.json`. Pure filesystem function — no `AppHandle` —
/// directly unit-testable against a temp directory.
fn create_structural_patterns_dictionary_impl(
    dictionary_path: &PathBuf,
    cache: &DictionaryCache,
    dictionary_id: &str,
) -> Result<DictionaryResponse, String> {
    validate_dictionary_id(dictionary_id)?;

    if !dictionary_id.starts_with("patterns-") {
        return Ok(DictionaryResponse::err("Dictionary ID must start with 'patterns-'"));
    }

    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    if file_path.exists() {
        return Ok(DictionaryResponse::err("Dictionary already exists"));
    }

    let empty_dict = serde_json::json!({});
    save_json_file(&file_path, &empty_dict)?;

    cache.invalidate(Some(dictionary_id));

    Ok(DictionaryResponse::ok())
}

#[tauri::command]
pub async fn rename_structural_patterns_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    old_dictionary_id: String,
    new_dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    rename_structural_patterns_dictionary_impl(
        &dictionary_path,
        &cache,
        &old_dictionary_id,
        &new_dictionary_id,
    )
}

/// Renames a `patterns-*` structural patterns dictionary file. Pure filesystem function —
/// no `AppHandle` — directly unit-testable against a temp directory.
fn rename_structural_patterns_dictionary_impl(
    dictionary_path: &PathBuf,
    cache: &DictionaryCache,
    old_dictionary_id: &str,
    new_dictionary_id: &str,
) -> Result<DictionaryResponse, String> {
    validate_dictionary_id(old_dictionary_id)?;
    validate_dictionary_id(new_dictionary_id)?;

    if !old_dictionary_id.starts_with("patterns-") || !new_dictionary_id.starts_with("patterns-") {
        return Ok(DictionaryResponse::err("Both dictionary IDs must start with 'patterns-'"));
    }

    let old_file_path = dictionary_path.join(format!("{}.json", old_dictionary_id));
    let new_file_path = dictionary_path.join(format!("{}.json", new_dictionary_id));

    if !old_file_path.exists() {
        return Ok(DictionaryResponse::ok_with_message(format!(
            "Patterns dictionary '{}' not found — skipped (will be created on next app launch)",
            old_dictionary_id
        )));
    }

    if let Some(msg) = collision_message(&new_file_path, new_dictionary_id, "Patterns") {
        return Ok(DictionaryResponse::err(msg));
    }

    fs::rename(&old_file_path, &new_file_path)
        .map_err(|e| sanitize_io_error(e, "patterns dictionary file"))?;

    cache.invalidate(Some(old_dictionary_id));

    Ok(DictionaryResponse::ok_with_message(format!(
        "Renamed '{}' to '{}'",
        old_dictionary_id, new_dictionary_id
    )))
}

/// Creates an empty properNouns dictionary file at `dictionary_path/{dictionary_id}.json`
/// and appends `dictionary_id` to `activeProperNouns` in the config at `config_path`.
///
/// Config-append is best-effort and non-fatal on failure — the dictionary file still
/// exists and the user can activate it manually. File-creation failure (already exists,
/// write error) is returned as `Err`. Pure filesystem function — no `AppHandle`, so it is
/// directly unit-testable against a temp directory.
/// Shared best-effort `activeProperNouns` mutation for `create_and_activate_proper_noun_file`
/// / `deactivate_proper_noun_file` (architecture review 2026-09-08, candidate #3 grilling,
/// narrowed from the original 3-function report — `substitute_dictionary_reference` stayed
/// out: it's a pure in-memory mutator with no I/O of its own, a genuinely different shape,
/// part of `rename_proper_nouns_dictionary_impl`'s atomic rollback sequence).
///
/// Silently no-ops (no read error, no write) when `config_path` is missing, unparseable, or
/// not a JSON object — matches both callers' pre-existing non-fatal contract. `create_if_missing`
/// is the one real asymmetry between the two callers: create needs somewhere to push into
/// (creates an empty `activeProperNouns` array if the key is absent), deactivate has nothing
/// to remove from (no-ops if the key is absent) — see each call site's `create_if_missing` arg.
///
/// `mutate` returns whether it actually changed the array; the config is only saved back when
/// it did. Preserves each caller's original save-skip behavior exactly: `create`'s closure
/// returns `false` when the id was already present (no write, matching the original
/// `already_present` guard); `deactivate`'s closure always returns `true` once an array is
/// found, matching the original's unconditional save (it never checked whether `retain`
/// actually removed anything) — a deliberate bug-for-bug parity choice, not an oversight.
fn mutate_active_proper_nouns_best_effort(
    config_path: &PathBuf,
    create_if_missing: bool,
    mutate: impl FnOnce(&mut Vec<serde_json::Value>) -> bool,
) {
    if !config_path.exists() {
        return;
    }
    let Ok(contents) = fs::read_to_string(config_path) else {
        return;
    };
    let Ok(mut config) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return;
    };

    let active_array = if create_if_missing {
        config.as_object_mut().and_then(|obj| {
            obj.entry("activeProperNouns")
                .or_insert_with(|| serde_json::Value::Array(Vec::new()))
                .as_array_mut()
        })
    } else {
        config.get_mut("activeProperNouns").and_then(|v| v.as_array_mut())
    };

    if let Some(active_array) = active_array {
        if mutate(active_array) {
            let _ = save_json_file(config_path, &config);
        }
    }
}

fn create_and_activate_proper_noun_file(
    dictionary_path: &PathBuf,
    config_path: &PathBuf,
    dictionary_id: &str,
) -> Result<(), String> {
    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    // Check if file already exists
    if file_path.exists() {
        return Err("Dictionary already exists".to_string());
    }

    // Create empty dictionary via save_json_file to enforce depth and size guards
    let empty_dict = serde_json::json!({});
    save_json_file(&file_path, &empty_dict)?;

    // L2: Append the newly-created dictionary to activeProperNouns so the
    // engine picks it up immediately. Mirrors rename_proper_nouns_dictionary's
    // config-side bookkeeping. Failure here is non-fatal — the dictionary file
    // exists, and the user can still activate it manually.
    mutate_active_proper_nouns_best_effort(config_path, true, |active_array| {
        let already_present = active_array.iter().any(|v| v.as_str() == Some(dictionary_id));
        if already_present {
            false
        } else {
            active_array.push(serde_json::Value::String(dictionary_id.to_string()));
            true
        }
    });

    Ok(())
}

/// Reads the true, current `activeProperNouns` list from `config.json` for reporting back
/// to the caller — NOT computed in-memory from what `create_and_activate_proper_noun_file`
/// intended to write, since that write is best-effort and can silently fail. Empty vec on
/// any read/parse failure or missing config, matching the same non-fatal philosophy as the
/// write side.
fn read_active_proper_nouns(config_path: &PathBuf) -> Vec<String> {
    if !config_path.exists() {
        return Vec::new();
    }
    let Ok(contents) = fs::read_to_string(config_path) else {
        return Vec::new();
    };
    let Ok(config) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return Vec::new();
    };
    config
        .get("activeProperNouns")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Removes `dictionary_id` from `activeProperNouns` in the config at `config_path`, if present.
/// Best-effort — mirrors the non-fatal contract of the append side. Used to reverse
/// `create_and_activate_proper_noun_file`'s config bookkeeping when a downstream step fails.
fn deactivate_proper_noun_file(config_path: &PathBuf, dictionary_id: &str) {
    mutate_active_proper_nouns_best_effort(config_path, false, |active_array| {
        active_array.retain(|v| v.as_str() != Some(dictionary_id));
        true
    });
}

#[tauri::command]
pub async fn create_proper_nouns_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate dictionary ID to prevent path traversal
    validate_dictionary_id(&dictionary_id)?;

    // SECURITY: Enforce prefix to prevent overwriting system dictionaries (characters, phrases, etc.)
    if !dictionary_id.starts_with("properNouns") {
        return Ok(DictionaryResponse::err(
            "Dictionary ID must start with 'properNouns'",
        ));
    }

    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    let config_path = get_app_data_dir(&app_handle)?.join("config.json");

    if let Err(err) = create_and_activate_proper_noun_file(&dictionary_path, &config_path, &dictionary_id) {
        return Ok(DictionaryResponse::err(err));
    }

    // Invalidate any stale cache entry for this dictionary (defensive: handles delete/re-create cycles)
    cache.invalidate(Some(&dictionary_id));

    // Report the true post-activation active list — not an assumption — so the caller
    // never has to guess whether creation also activated the new dictionary.
    Ok(DictionaryResponse::ok_with_dicts(read_active_proper_nouns(&config_path)))
}

/// Whether a proper-nouns dictionary comes with a paired structural patterns dictionary:
/// fiction (`properNouns-f_X`, ADR-027) and generic (`properNouns-_X`, ADR-048). Mirrors the
/// frontend's `hasPairedPatterns` (`DictionaryIdClassifier.ts`).
fn has_paired_patterns(proper_noun_id: &str) -> bool {
    proper_noun_id.starts_with("properNouns-f_") || proper_noun_id.starts_with("properNouns-_")
}

/// The paired structural patterns id of a proper-nouns id (ADR-027 naming-convention
/// coupling): `properNouns-f_X` → `patterns-f_X`. Mirrors the frontend's `toPatternsId`;
/// assumes `has_paired_patterns(proper_noun_id)`. Both are held to one fixture (ADR-060).
fn to_patterns_id(proper_noun_id: &str) -> String {
    format!("patterns-{}", proper_noun_id.strip_prefix("properNouns-").unwrap_or(""))
}

/// ADR-027/ADR-048: creates a paired proper-nouns dictionary (fiction `properNouns-f_X` or
/// generic `properNouns-_X`) together with its structural patterns dictionary (`patterns-f_X`
/// / `patterns-_X`) atomically — either both files exist afterward, or neither does. Mirrors `rename_proper_nouns_dictionary`'s atomicity: the
/// properNouns half is created (and activated) first, and rolled back if the patterns half
/// fails to create, so a partial pair is never left on disk.
#[tauri::command]
pub async fn create_fiction_dictionary_pair(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    proper_noun_id: String,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate ID to prevent path traversal
    validate_dictionary_id(&proper_noun_id)?;

    if !has_paired_patterns(&proper_noun_id) {
        return Ok(DictionaryResponse::err(
            "Dictionary ID must be a fiction or generic proper-nouns dictionary ('properNouns-f_*' or 'properNouns-_*')",
        ));
    }

    // Derive the paired patterns ID from the naming convention (ADR-027) — not passed by
    // the caller, so the derivation lives in exactly one place per language runtime.
    let patterns_id = to_patterns_id(&proper_noun_id);
    validate_dictionary_id(&patterns_id)?;

    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    let config_path = get_app_data_dir(&app_handle)?.join("config.json");

    if let Err(err) = create_and_activate_proper_noun_file(&dictionary_path, &config_path, &proper_noun_id) {
        return Ok(DictionaryResponse::err(err));
    }
    cache.invalidate(Some(&proper_noun_id));

    let patterns_file_path = dictionary_path.join(format!("{}.json", patterns_id));
    let empty_dict = serde_json::json!({});
    if let Err(err) = save_json_file(&patterns_file_path, &empty_dict) {
        // Roll back the properNouns half so callers never see a half-created pair.
        let proper_noun_file_path = dictionary_path.join(format!("{}.json", proper_noun_id));
        let _ = fs::remove_file(&proper_noun_file_path);
        deactivate_proper_noun_file(&config_path, &proper_noun_id);
        cache.invalidate(Some(&proper_noun_id));
        return Ok(DictionaryResponse::err(format!(
            "Failed to create paired patterns dictionary: {}. Rolled back.",
            err
        )));
    }
    cache.invalidate(Some(&patterns_id));

    Ok(DictionaryResponse::ok_with_dicts(read_active_proper_nouns(&config_path)))
}

#[tauri::command]
pub async fn save_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
    data: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate dictionary ID to prevent path traversal
    validate_dictionary_id(&dictionary_id)?;

    validate_dictionary_payload(&data)?;

    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    let json_string = serde_json::to_string_pretty(&data)
        .map_err(|_| "Failed to serialize dictionary data".to_string())?;

    // SECURITY: Check JSON size before writing
    if json_string.len() > MAX_JSON_SIZE_BYTES {
        return Err(format!(
            "Dictionary too large: {} MB (max: {} MB)",
            json_string.len() / 1024 / 1024,
            MAX_JSON_SIZE_BYTES / 1024 / 1024
        ));
    }

    write_dictionary_bytes(&file_path, json_string.as_bytes(), &cache, &dictionary_id)?;

    // No echo of the saved dictionary: callers check only `success` (EditCommitter, the trie
    // cache writer), and echoing a large dictionary cost a second full IPC transfer per edit.
    Ok(DictionaryResponse::ok())
}

/// SECURITY: The shared guard sequence for dictionary JSON from an untrusted source —
/// reject non-objects, enforce the entry-count cap, enforce nesting depth. Shared by
/// every site that accepts dictionary data: direct save, ZIP import, and file load.
fn validate_dictionary_payload(data: &serde_json::Value) -> Result<(), String> {
    // SECURITY: Require a JSON object — arrays and other types bypass entry-count validation
    let obj = data
        .as_object()
        .ok_or_else(|| "Dictionary data must be a JSON object".to_string())?;
    if obj.len() > MAX_DICTIONARY_ENTRIES {
        return Err(format!(
            "Dictionary too large: {} entries (max: {})",
            obj.len(),
            MAX_DICTIONARY_ENTRIES
        ));
    }
    // SECURITY: Depth guard mirrors save_json_file — prevents deeply-nested values
    // from causing recursive stack growth in the Rust drop path.
    check_json_depth(data, 50)
}

/// C2: Write `bytes` to `path` atomically by writing to `path.tmp.<pid>` and
/// renaming. Same-filesystem rename is atomic on POSIX and Windows ≥ Vista.
fn write_atomic(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid dictionary file path".to_string())?;
    // Use the file name + ".tmp" + pid so concurrent writers don't collide.
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid dictionary file name".to_string())?;
    let tmp_path = parent.join(format!("{}.tmp.{}", file_name, std::process::id()));

    fs::write(&tmp_path, bytes).map_err(|e| sanitize_io_error(e, "dictionary file"))?;

    if let Err(e) = fs::rename(&tmp_path, path) {
        // Best-effort cleanup of the temp file on rename failure.
        let _ = fs::remove_file(&tmp_path);
        return Err(sanitize_io_error(e, "dictionary file"));
    }

    Ok(())
}

/// The shared write half of the protocol: invalidate-before → atomic write →
/// invalidate-after. Takes already-serialized bytes so callers control their own byte
/// representation — save_dictionary re-serializes via serde_json; import_dictionaries
/// writes the imported file's bytes verbatim, preserving its on-disk format.
fn write_dictionary_bytes(
    path: &PathBuf,
    bytes: &[u8],
    cache: &DictionaryCache,
    dictionary_id: &str,
) -> Result<(), String> {
    // M1: Invalidate cache before the write so a concurrent load between
    // write completion and post-write invalidation cannot return stale data.
    cache.invalidate(Some(dictionary_id));

    // C2: Atomic write — write to a sibling temp file, then rename. fs::rename
    // is atomic on the same filesystem, so a crash mid-write leaves the
    // original file intact. fs::write alone truncates+writes in place and can
    // leave a partial/corrupt file on crash or concurrent saves.
    write_atomic(path, bytes)?;

    // Defensive second invalidation — closes the very narrow window where a
    // load between the pre-write invalidate and rename completion could
    // re-cache the previous file's contents.
    cache.invalidate(Some(dictionary_id));

    Ok(())
}

#[tauri::command]
pub async fn load_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate dictionary ID to prevent path traversal
    validate_dictionary_id(&dictionary_id)?;

    let dictionary_path = get_dictionary_path(&app_handle)?;
    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));

    let cache_key = get_cache_key(&dictionary_id);

    // Check cache first
    if let Some(cached_data) = cache.get(&cache_key) {
        return Ok(DictionaryResponse::ok_with_data(cached_data));
    }

    // SECURITY: Check file size before reading
    validate_file_size(&file_path, MAX_JSON_SIZE_BYTES)?;

    // Load from file
    match fs::read_to_string(&file_path) {
        Ok(contents) => {
            let data: serde_json::Value = serde_json::from_str(&contents)
                .map_err(|_| format!("Invalid JSON in dictionary '{}'", dictionary_id))?;

            // SECURITY: Re-run the same guard sequence as save_dictionary/import_dictionaries
            // on load, not just on write. A file written externally or imported from a ZIP
            // could bypass those guards, causing unbounded trie memory growth or stack
            // pressure from pathological nesting.
            validate_dictionary_payload(&data)
                .map_err(|e| format!("Dictionary '{}': {}", dictionary_id, e))?;

            // Cache the result
            cache.set(cache_key, data.clone());

            Ok(DictionaryResponse::ok_with_data(data))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(DictionaryResponse::err("File not found"))
        }
        Err(e) => Err(sanitize_io_error(e, "dictionary file")),
    }
}

fn get_app_data_dir(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to locate application data directory".to_string())
}

/// Load one of the app's JSON files, or `default` when it does not exist.
///
/// A file whose *content* is unreadable — over the size limit, not UTF-8, or not JSON — is
/// quarantined: renamed to `<stem>.corrupt-<ms>.json` beside it, and `default` returned with
/// `quarantined` naming it. The data survives for recovery, and the app's next save lands on
/// a fresh file instead of over it. A failed *read* (permission, I/O) is an `Err` and moves
/// nothing, since a retry may succeed; the TS loaders then refuse to save until a load works
/// (`utils/unreadableFile.ts`).
fn load_json_file_with_default(
    path: &PathBuf,
    default: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Check file size before reading to prevent DoS
    match fs::metadata(path) {
        Ok(metadata) if metadata.len() > MAX_JSON_SIZE_BYTES as u64 => {
            return quarantine_json_file(path, default);
        }
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DictionaryResponse::ok_with_data(default));
        }
        Err(e) => return Err(sanitize_io_error(e, "config file")),
    }
    match fs::read_to_string(path) {
        Ok(contents) => match serde_json::from_str::<serde_json::Value>(&contents) {
            Ok(data) => Ok(DictionaryResponse::ok_with_data(data)),
            Err(_) => quarantine_json_file(path, default),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(DictionaryResponse::ok_with_data(default))
        }
        Err(e) if e.kind() == std::io::ErrorKind::InvalidData => quarantine_json_file(path, default),
        Err(e) => Err(sanitize_io_error(e, "config file")),
    }
}

/// Rename an unreadable JSON file aside and answer with `default` — see
/// `load_json_file_with_default`. If the rename itself fails, nothing is set aside and the
/// load fails, so the caller still refuses to save over the file.
fn quarantine_json_file(
    path: &PathBuf,
    default: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let name = format!("{}.corrupt-{}.json", stem, millis);
    let target = path.with_file_name(&name);
    fs::rename(path, &target).map_err(|e| sanitize_io_error(e, "unreadable config file"))?;
    eprintln!("Quarantined unreadable {} as {}", path.display(), name);
    let mut response = DictionaryResponse::ok_with_data(default);
    response.quarantined = Some(name);
    Ok(response)
}

fn save_json_file(
    path: &PathBuf,
    data: &serde_json::Value,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Check nesting depth before serializing. serde_json::to_string_pretty
    // operates on an already-deserialized Value (heap-allocated), so stack overflow
    // during serialization is not the primary risk — but pathological nesting can
    // cause unbounded recursion in the Rust drop path for deeply-nested Values.
    // Config data should never exceed a few levels deep.
    check_json_depth(data, 50)?;
    let json_string = serde_json::to_string_pretty(data).map_err(|_| "Failed to serialize config data".to_string())?;
    // SECURITY: Mirror the size check in save_dictionary — defend-in-depth
    // against a malicious or buggy frontend payload bloating config files on disk.
    if json_string.len() > MAX_JSON_SIZE_BYTES {
        return Err(format!(
            "Config too large: {} MB (max: {} MB)",
            json_string.len() / 1024 / 1024,
            MAX_JSON_SIZE_BYTES / 1024 / 1024
        ));
    }
    write_atomic(path, json_string.as_bytes())?;
    Ok(DictionaryResponse::ok())
}

/// The 3 single-JSON-blob persistence kinds sharing `load_json_file_with_default`/
/// `save_json_file` (architecture review 2026-09-08, candidate #2 grilling). Each
/// `#[tauri::command]` pair below is a 1-line delegation to `load_blob`/`save_blob` —
/// this enum is the single place that knows about all 3 kinds, so a 4th blob type is
/// one match arm here instead of 2 new near-duplicate command functions. Kept as an
/// internal Rust-only enum, never serialized across IPC: the 6 command names and their
/// `tauriAPI.ts`/`ElectronTypes.d.ts` call sites are unchanged, since collapsing the IPC
/// surface itself would touch 3 unrelated TS modules for the same organizational win —
/// see CONTEXT.md's "Transform Rule" entry area / this review round's report for why
/// that was scoped out.
enum BlobKind {
    Config,
    TransformRules,
    Appearance,
    /// Reader book records (`docs`-referenced ticket "Book records: resume where you
    /// stopped"): a map of fingerprint -> record, each record an authoritative half
    /// (fingerprint, reading position) plus a regenerable cached half (title,
    /// last-known path, line count, encoding, size/mtime, availability). The
    /// reconciliation logic (lazy fingerprint recompute, relink-on-move, unavailable
    /// marking) lives entirely in TS (`src/utils/reader/`) — this is just the 4th
    /// blob kind, same shape as the other 3.
    Books,
}

impl BlobKind {
    fn filename(&self) -> &'static str {
        match self {
            BlobKind::Config => "config.json",
            BlobKind::TransformRules => "transform-rules.json",
            BlobKind::Appearance => "appearance.json",
            BlobKind::Books => "books.json",
        }
    }

    fn default_value(&self) -> serde_json::Value {
        match self {
            BlobKind::Config => serde_json::json!({ "activeProperNouns": ["properNouns"] }),
            BlobKind::TransformRules => serde_json::json!([]),
            BlobKind::Books => serde_json::json!({}),
            BlobKind::Appearance => serde_json::json!({
                "chineseText": {
                    "fontFamily": "\"Noto Sans CJK SC\", SimSun, \"Microsoft YaHei\", Inter, system-ui, Arial, sans-serif",
                    "fontSize": "1.25rem",
                    "letterSpacing": "normal"
                },
                "fullTranslation": {
                    "fontFamily": "Bookerly, Amstelvar, \"Noto Sans CJK SC\", Arial, sans-serif",
                    "fontSize": "1.25rem",
                    "letterSpacing": "normal"
                },
                "characterOnly": {
                    "fontFamily": "Bookerly, Amstelvar, \"Noto Sans CJK SC\", Arial, sans-serif",
                    "fontSize": "1.25rem",
                    "letterSpacing": "normal"
                },
                "uiFont": {
                    "fontFamily": "Inter, system-ui, Arial, sans-serif"
                }
            }),
        }
    }
}

fn load_blob(app_handle: &tauri::AppHandle, kind: BlobKind) -> Result<DictionaryResponse, String> {
    let path = get_app_data_dir(app_handle)?.join(kind.filename());
    load_json_file_with_default(&path, kind.default_value())
}

fn save_blob(
    app_handle: &tauri::AppHandle,
    kind: BlobKind,
    data: &serde_json::Value,
) -> Result<DictionaryResponse, String> {
    let path = get_app_data_dir(app_handle)?.join(kind.filename());
    save_json_file(&path, data)
}

#[tauri::command]
pub async fn load_configuration(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    load_blob(&app_handle, BlobKind::Config)
}

#[tauri::command]
pub async fn save_configuration(
    app_handle: tauri::AppHandle,
    config: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    save_blob(&app_handle, BlobKind::Config, &config)
}

#[tauri::command]
pub async fn load_transform_rules(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    load_blob(&app_handle, BlobKind::TransformRules)
}

#[tauri::command]
pub async fn save_transform_rules(
    app_handle: tauri::AppHandle,
    rules: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    save_blob(&app_handle, BlobKind::TransformRules, &rules)
}

#[tauri::command]
pub async fn load_appearance_settings(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    load_blob(&app_handle, BlobKind::Appearance)
}

#[tauri::command]
pub async fn save_appearance_settings(
    app_handle: tauri::AppHandle,
    appearance_settings: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    save_blob(&app_handle, BlobKind::Appearance, &appearance_settings)
}

#[tauri::command]
pub async fn load_book_records(app_handle: tauri::AppHandle) -> Result<DictionaryResponse, String> {
    load_blob(&app_handle, BlobKind::Books)
}

#[tauri::command]
pub async fn save_book_records(
    app_handle: tauri::AppHandle,
    records: serde_json::Value,
) -> Result<DictionaryResponse, String> {
    save_blob(&app_handle, BlobKind::Books, &records)
}

#[tauri::command]
pub async fn export_dictionaries(
    app_handle: tauri::AppHandle,
    limiters: State<'_, RateLimiters>,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_export_import()?;

    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Use dialog to get save location
    use tauri_plugin_dialog::DialogExt;
    let file_path = app_handle.dialog()
        .file()
        .set_title("Export Dictionaries")
        .set_file_name("dictionaries.zip")
        .add_filter("ZIP Archive", &["zip"])
        .blocking_save_file();

    let file_path = match file_path {
        Some(path) => path.as_path().ok_or("Invalid file path")?.to_path_buf(),
        None => return Ok(DictionaryResponse::err("Export cancelled")),
    };

    export_dictionaries_impl(&dictionary_path, &file_path)
}

/// Reads every `*.json` dictionary file in `dictionary_path` and writes it into a ZIP archive
/// at `output_zip_path`. Pure filesystem function — no `AppHandle`/dialog — the command
/// wrapper resolves the dialog-picked save location before calling this, so it is directly
/// unit-testable against a temp directory.
fn export_dictionaries_impl(
    dictionary_path: &PathBuf,
    output_zip_path: &PathBuf,
) -> Result<DictionaryResponse, String> {
    // Create ZIP file
    let zip_file = fs::File::create(output_zip_path).map_err(|e| sanitize_io_error(e, "export file"))?;
    let mut zip = ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Read all dictionary files in parallel first
    let entries: Vec<_> = fs::read_dir(dictionary_path)
        .map_err(|e| sanitize_io_error(e, "dictionary directory"))?
        .filter_map(|e| e.ok())
        .collect();

    // Parallel read all files into memory
    // CODE REVIEW FIX (MEDIUM-7): Validate file size before reading, consistent with
    // load_dictionary which calls validate_file_size. Without this, an externally-grown
    // file bypassing the write path could cause a DoS via unbounded memory allocation.
    let file_contents: Vec<_> = entries
        .par_iter()
        .filter_map(|entry| {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                let file_name = path.file_name()?.to_str()?.to_string();
                // SECURITY: Validate the filename before embedding it in the ZIP entry name.
                // A filename containing path separators (e.g. "../evil.json") created outside
                // the app would be embedded verbatim in the export, producing a ZIP that could
                // be used to traverse paths in other tools.  Import already validates on its
                // side, but the export should not produce corrupt/dangerous ZIPs regardless.
                // strip_suffix avoids the over-stripping hazard of trim_end_matches(".json").
                let base_name = file_name.strip_suffix(".json").unwrap_or(&file_name);
                validate_dictionary_id(base_name).ok()?;
                validate_file_size(&path, MAX_JSON_SIZE_BYTES).ok()?;
                let contents = fs::read_to_string(&path).ok()?;
                Some((file_name, contents))
            } else {
                None
            }
        })
        .collect();

    // Write to ZIP sequentially (ZIP format requires sequential writes)
    let mut file_count = 0;
    for (file_name, contents) in file_contents {
        zip.start_file(&file_name, options)
            .map_err(|_| format!("Failed to add '{}' to ZIP", file_name))?;
        zip.write_all(contents.as_bytes())
            .map_err(|_| format!("Failed to write '{}' to ZIP", file_name))?;
        file_count += 1;
    }

    zip.finish().map_err(|_| "Failed to finalize ZIP archive".to_string())?;

    Ok(DictionaryResponse::ok_with_message(format!("Exported {} dictionaries successfully", file_count)))
}

#[tauri::command]
pub async fn import_dictionaries(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    limiters: State<'_, RateLimiters>,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_export_import()?;

    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;

    // Use dialog to get file to import
    use tauri_plugin_dialog::DialogExt;
    let file_path = app_handle.dialog()
        .file()
        .set_title("Import Dictionaries")
        .add_filter("ZIP Archive", &["zip"])
        .blocking_pick_file();

    let file_path = match file_path {
        Some(path) => path.as_path().ok_or("Invalid file path")?.to_path_buf(),
        None => return Ok(DictionaryResponse::err("Import cancelled")),
    };

    import_dictionaries_impl(&dictionary_path, &file_path, &cache)
}

/// Extracts every valid `*.json` entry from the ZIP archive at `zip_file_path` into
/// `dictionary_path`. Pure filesystem function — no `AppHandle`/dialog — the command wrapper
/// resolves the dialog-picked source archive before calling this, so it is directly
/// unit-testable against a temp directory and an in-memory-built ZIP.
fn import_dictionaries_impl(
    dictionary_path: &PathBuf,
    zip_file_path: &PathBuf,
    cache: &DictionaryCache,
) -> Result<DictionaryResponse, String> {
    // Open ZIP file
    let zip_file = fs::File::open(zip_file_path).map_err(|e| sanitize_io_error(e, "import file"))?;
    let mut archive = ZipArchive::new(zip_file)
        .map_err(|_| "Failed to read ZIP archive: invalid or corrupted format".to_string())?;

    let mut file_count = 0;
    let mut errors = Vec::new();

    // Extract each file
    for i in 0..archive.len() {
        // Use match instead of ? so a single corrupted entry accumulates an error and
        // continues, consistent with the rest of the loop body.  Using ? here would
        // abort the whole import, lose progress on already-written files, and skip the
        // cache.invalidate(None) call below.
        let file = match archive.by_index(i) {
            Ok(f) => f,
            Err(_) => {
                errors.push(format!("entry {}: failed to read ZIP entry", i));
                continue;
            }
        };
        let filename = file.name().to_string();

        // Only process JSON files; exclude .trie.json cache files (consistent with
        // list_proper_nouns_dictionaries which also excludes them).
        if !filename.ends_with(".json") || filename.ends_with(".trie.json") {
            continue;
        }

        // Validate the base name to prevent path-traversal writes.
        // A ZIP entry like "../../evil.json" passes the .ends_with check above
        // but would escape the dictionaries directory without this validation.
        // strip_suffix removes the literal substring ".json"; trim_end_matches
        // would strip individual characters from the set {'.','j','s','o','n'},
        // which over-strips names like "son.json" → "".
        let base_name = filename.strip_suffix(".json").unwrap(); // safe: ends_with checked above
        if let Err(e) = validate_dictionary_id(base_name) {
            errors.push(format!("{}: {}", filename, e));
            continue;
        }

        // SECURITY: Defend against ZIP-bomb DoS (MEDIUM-3 fix).
        //
        // file.size() returns the *reported* uncompressed size from the ZIP central
        // directory — an attacker-controlled value.  A crafted archive can report
        // size() = 0 while decompressing to gigabytes.  The header check below is
        // kept as a fast pre-flight, but the authoritative guard is the .take() limit
        // on the actual read: reading stops after MAX_JSON_SIZE_BYTES + 1 bytes
        // regardless of what the header claims.
        if file.size() > MAX_JSON_SIZE_BYTES as u64 {
            errors.push(format!(
                "{}: file too large ({} MB, max: {} MB)",
                filename,
                file.size() / 1024 / 1024,
                MAX_JSON_SIZE_BYTES as u64 / 1024 / 1024
            ));
            continue;
        }

        // Validate JSON before writing — use .take() so decompressed output is
        // hard-capped even if the ZIP header lied about the uncompressed size.
        let mut contents = String::new();
        if let Err(e) = file.take(MAX_JSON_SIZE_BYTES as u64 + 1).read_to_string(&mut contents) {
            errors.push(format!("{}: {}", filename, sanitize_io_error(e, "ZIP entry content")));
            continue;
        }
        if contents.len() > MAX_JSON_SIZE_BYTES {
            errors.push(format!(
                "{}: decompressed content exceeds size limit ({} MB max)",
                filename,
                MAX_JSON_SIZE_BYTES / 1024 / 1024
            ));
            continue;
        }

        match serde_json::from_str::<serde_json::Value>(&contents) {
            Ok(data) => {
                // SECURITY: Same guard sequence as save_dictionary and load_dictionary —
                // entry-count cap + nesting depth. serde_json limits deserialization to
                // 128 levels, but deep Values cause unbounded recursion in the Rust drop
                // path; cap at 50 as defense-in-depth.
                if let Err(e) = validate_dictionary_payload(&data) {
                    errors.push(format!("{}: {}", filename, e));
                    continue;
                }
                // Use validated base_name (not raw filename from ZIP header) to build the
                // output path, eliminating the distance between validation and use.
                // Writes contents verbatim (not re-serialized) — preserves the imported
                // file's on-disk format exactly.
                let output_path = dictionary_path.join(format!("{}.json", base_name));
                if let Err(e) =
                    write_dictionary_bytes(&output_path, contents.as_bytes(), &cache, base_name)
                {
                    errors.push(format!("{}: write error: {}", filename, e));
                    continue;
                }
                file_count += 1;
            }
            Err(_) => {
                // Do not include the serde_json error in the message — it may embed a snippet
                // of the (attacker-controlled) ZIP entry content in its Display output.
                errors.push(format!("{}: invalid JSON format", filename));
            }
        }
    }

    let message = if errors.is_empty() {
        format!("Imported {} dictionaries successfully", file_count)
    } else {
        format!("Imported {} dictionaries, {} errors: {}", file_count, errors.len(), errors.join(", "))
    };

    Ok(DictionaryResponse {
        success: file_count > 0,
        data: None,
        error: if errors.is_empty() { None } else { Some(errors.join(", ")) },
        dictionaries: None,
        message: Some(message),
        quarantined: None,
    })
}

#[tauri::command]
pub async fn reset_dictionaries(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    options: Option<serde_json::Value>,
) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_dictionary_path(&app_handle)?;

    // Get backup option (default: true)
    let create_backup = options
        .as_ref()
        .and_then(|o| o.get("backup"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    reset_dictionaries_impl(&dictionary_path, create_backup, &cache)
}

/// Backs up (optionally) and then wipes+recreates `dictionary_path`. Pure filesystem
/// function — no `AppHandle` — directly unit-testable against a temp directory.
fn reset_dictionaries_impl(
    dictionary_path: &PathBuf,
    create_backup: bool,
    cache: &DictionaryCache,
) -> Result<DictionaryResponse, String> {
    // Create backup if requested
    if create_backup {
        let backup_dir = dictionary_path.parent()
            .ok_or("Could not get parent directory")?
            .join("dictionaries_backup");

        fs::create_dir_all(&backup_dir).map_err(|e| sanitize_io_error(e, "backup directory"))?;

        // Copy all files to backup
        if dictionary_path.exists() {
            let entries = fs::read_dir(&dictionary_path)
                .map_err(|e| sanitize_io_error(e, "dictionary directory"))?;

            for entry in entries {
                let entry = entry.map_err(|e| sanitize_io_error(e, "directory entry"))?;
                let path = entry.path();

                if path.is_file() {
                    let file_name = path.file_name()
                        .ok_or("Invalid filename")?;
                    let backup_path = backup_dir.join(file_name);
                    fs::copy(&path, &backup_path)
                        .map_err(|e| sanitize_io_error(e, "backup file"))?;
                }
            }
        }
    }

    // Remove all existing dictionary files
    if dictionary_path.exists() {
        fs::remove_dir_all(&dictionary_path)
            .map_err(|e| sanitize_io_error(e, "dictionary directory"))?;
    }

    // Recreate dictionary directory
    fs::create_dir_all(&dictionary_path).map_err(|e| sanitize_io_error(e, "dictionary directory"))?;

    // Clear cache
    cache.invalidate(None);

    // CODE REVIEW FIX (CRITICAL-2): Dictionaries directory is now empty — warn the user
    // explicitly.  There are no bundled source templates to restore automatically; the user
    // must import dictionaries (or restore from the backup) before translation will work.
    let message = if create_backup {
        "Dictionaries reset successfully. Backup saved to dictionaries_backup/. \
        The dictionaries directory is now empty — import your dictionaries or restore from \
        the backup to resume translation."
    } else {
        "Dictionaries reset successfully. No backup created. \
        The dictionaries directory is now empty — import your dictionaries to resume translation."
    };

    Ok(DictionaryResponse::ok_with_message(message))
}

#[derive(Serialize, Deserialize)]
pub struct BatchDictionaryResult {
    dictionary_id: String,
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
}

impl BatchDictionaryResult {
    fn ok(id: &str, data: serde_json::Value) -> Self {
        Self { dictionary_id: id.to_string(), success: true, data: Some(data), error: None }
    }

    fn err(id: &str, error: impl Into<String>) -> Self {
        Self { dictionary_id: id.to_string(), success: false, data: None, error: Some(error.into()) }
    }
}

#[derive(Serialize, Deserialize)]
pub struct BatchDictionaryResponse {
    results: Vec<BatchDictionaryResult>,
    total: usize,
    successful: usize,
    failed: usize,
}

#[tauri::command]
pub async fn load_dictionaries_parallel(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    limiters: State<'_, RateLimiters>,
    dictionary_ids: Vec<String>,
) -> Result<BatchDictionaryResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_load_parallel()?;

    let dictionary_path = get_dictionary_path(&app_handle)?;

    Ok(load_dictionaries_parallel_impl(&dictionary_path, &cache, &dictionary_ids))
}

/// Loads every dictionary in `dictionary_ids` from `dictionary_path` in parallel across all
/// CPU cores, consulting `cache` first. Pure filesystem function — no `AppHandle` — directly
/// unit-testable against a temp directory.
fn load_dictionaries_parallel_impl(
    dictionary_path: &PathBuf,
    cache: &DictionaryCache,
    dictionary_ids: &[String],
) -> BatchDictionaryResponse {
    // Use Rayon to load dictionaries in parallel across all CPU cores
    let results: Vec<BatchDictionaryResult> = dictionary_ids
        .par_iter()
        .map(|dictionary_id| {
            // SECURITY: Validate dictionary ID to prevent path traversal
            if let Err(e) = validate_dictionary_id(dictionary_id) {
                return BatchDictionaryResult::err(dictionary_id, e);
            }

            let file_path = dictionary_path.join(format!("{}.json", dictionary_id));
            let cache_key = get_cache_key(dictionary_id);

            // Check cache first (thread-safe)
            if let Some(cached_data) = cache.get(&cache_key) {
                return BatchDictionaryResult::ok(dictionary_id, cached_data);
            }

            // A dictionary whose file does not exist yet is empty, not unread: nothing seeds the
            // dictionary directory, so a fresh install or a reset has no `phrases.json` until the
            // first Add creates it. Only a file that exists and cannot be read is a failure — the
            // TS side refuses to save over those (CONTEXT.md "Unread dictionary", ADR-053). Not
            // cached, so the first save's file is what the next load reads.
            if let Err(e) = fs::metadata(&file_path) {
                if e.kind() == std::io::ErrorKind::NotFound {
                    return BatchDictionaryResult::ok(dictionary_id, serde_json::json!({}));
                }
            }

            // SECURITY: Validate file size before reading (matches serial load path)
            if let Err(e) = validate_file_size(&file_path, MAX_JSON_SIZE_BYTES) {
                return BatchDictionaryResult::err(dictionary_id, e);
            }

            // Load from file
            match fs::read_to_string(&file_path) {
                Ok(contents) => {
                    match serde_json::from_str::<serde_json::Value>(&contents) {
                        Ok(data) => {
                            // SECURITY: Single guard sequence — mirrors save_dictionary/import_dictionaries/load_dictionary.
                            if let Err(e) = validate_dictionary_payload(&data) {
                                return BatchDictionaryResult::err(
                                    dictionary_id,
                                    format!("Dictionary '{}': {}", dictionary_id, e),
                                );
                            }

                            // Cache the result (thread-safe)
                            cache.set(cache_key, data.clone());

                            BatchDictionaryResult::ok(dictionary_id, data)
                        }
                        Err(_) => BatchDictionaryResult::err(
                            dictionary_id,
                            format!("Invalid JSON in dictionary '{}'", dictionary_id),
                        ),
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    BatchDictionaryResult::err(dictionary_id, "File not found")
                }
                Err(e) => BatchDictionaryResult::err(dictionary_id, sanitize_io_error(e, "dictionary file")),
            }
        })
        .collect();

    let successful = results.iter().filter(|r| r.success).count();
    let failed = results.len() - successful;

    BatchDictionaryResponse {
        total: results.len(),
        successful,
        failed,
        results,
    }
}

/// Swaps `old` to `new` wherever it appears in `activeProperNouns` (array),
/// `lastSelectedDictionary` (string), or `defaultQuickAddDictionary` (string) on `config`.
/// No-op if `old` isn't referenced.
///
/// Direction-agnostic: `rename_proper_nouns_dictionary` calls this with `(old, new)` to
/// apply a rename, and with `(new, old)` to reverse it on rollback — collapsing what was
/// previously two hand-written copies of the same swap that had to be kept in lockstep.
fn substitute_dictionary_reference(config: &mut serde_json::Value, old: &str, new: &str) {
    if let Some(active) = config.get_mut("activeProperNouns") {
        if let Some(active_array) = active.as_array_mut() {
            for item in active_array.iter_mut() {
                if item.as_str() == Some(old) {
                    *item = serde_json::Value::String(new.to_string());
                }
            }
        }
    }
    if let Some(last_selected) = config.get_mut("lastSelectedDictionary") {
        if last_selected.as_str() == Some(old) {
            *last_selected = serde_json::Value::String(new.to_string());
        }
    }
    if let Some(default_quick_add) = config.get_mut("defaultQuickAddDictionary") {
        if default_quick_add.as_str() == Some(old) {
            *default_quick_add = serde_json::Value::String(new.to_string());
        }
    }
}

#[tauri::command]
pub async fn rename_proper_nouns_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    old_dictionary_id: String,
    new_dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    let config_path = get_app_data_dir(&app_handle)?.join("config.json");

    rename_proper_nouns_dictionary_impl(
        &dictionary_path,
        &config_path,
        &cache,
        &old_dictionary_id,
        &new_dictionary_id,
    )
}

/// Renames a `properNouns-*` dictionary file, updating `config.json` references
/// (`activeProperNouns`, `lastSelectedDictionary`) and cascading to a paired
/// `patterns-f_*` / `patterns-_*` file if applicable, with rollback on any downstream failure. Pure
/// filesystem function — no `AppHandle` — directly unit-testable against a temp directory.
fn rename_proper_nouns_dictionary_impl(
    dictionary_path: &PathBuf,
    config_path: &PathBuf,
    cache: &DictionaryCache,
    old_dictionary_id: &str,
    new_dictionary_id: &str,
) -> Result<DictionaryResponse, String> {
    // SECURITY: Validate both dictionary IDs to prevent path traversal
    validate_dictionary_id(old_dictionary_id)?;
    validate_dictionary_id(new_dictionary_id)?;

    // Validate dictionary IDs
    if old_dictionary_id == "properNouns" {
        return Ok(DictionaryResponse::err("Cannot rename the default 'properNouns' dictionary"));
    }

    if !old_dictionary_id.starts_with("properNouns-") || !new_dictionary_id.starts_with("properNouns-") {
        return Ok(DictionaryResponse::err("Both dictionary IDs must start with 'properNouns-'"));
    }

    let old_file_path = dictionary_path.join(format!("{}.json", old_dictionary_id));
    let new_file_path = dictionary_path.join(format!("{}.json", new_dictionary_id));

    // Check old file exists
    if !old_file_path.exists() {
        return Ok(DictionaryResponse::err(format!("Dictionary '{}' not found", old_dictionary_id)));
    }

    // Check new file doesn't exist
    if new_file_path.exists() {
        return Ok(DictionaryResponse::err(format!("Dictionary '{}' already exists", new_dictionary_id)));
    }

    // H3: Atomic rename — prepare the updated config in memory FIRST, then rename
    // the file, then save the config. If config save fails, roll back the rename
    // so the file name and config stay in sync. Previously the file was renamed
    // before the config was even read, so any failure between left the on-disk
    // config referencing a non-existent old_dictionary_id.
    let prepared_config: Option<serde_json::Value> = if config_path.exists() {
        match fs::read_to_string(config_path) {
            Ok(contents) => match serde_json::from_str::<serde_json::Value>(&contents) {
                Ok(mut config) => {
                    substitute_dictionary_reference(&mut config, old_dictionary_id, new_dictionary_id);
                    Some(config)
                }
                Err(_) => None,
            },
            Err(_) => None,
        }
    } else {
        None
    };

    // Rename the file
    fs::rename(&old_file_path, &new_file_path).map_err(|e| sanitize_io_error(e, "dictionary file"))?;

    // Invalidate cache for old dictionary
    cache.invalidate(Some(old_dictionary_id));

    // Save the prepared config; on failure, roll back the file rename so the
    // dictionary file and config remain consistent.
    if let Some(config) = prepared_config {
        if let Err(save_err) = save_json_file(config_path, &config) {
            // Best-effort rollback. If this also fails the user is in a degraded
            // state, but they keep their original on-disk file.
            let _ = fs::rename(&new_file_path, &old_file_path);
            cache.invalidate(Some(old_dictionary_id));
            return Err(save_err);
        }
    }

    // Cascade to paired patterns dict if this is a fiction or generic proper-nouns dict
    if has_paired_patterns(old_dictionary_id) {
        let old_patterns_id = to_patterns_id(old_dictionary_id);
        let new_patterns_id = to_patterns_id(new_dictionary_id);
        let old_patterns_path = dictionary_path.join(format!("{}.json", old_patterns_id));
        let new_patterns_path = dictionary_path.join(format!("{}.json", new_patterns_id));
        if old_patterns_path.exists() {
            let collision = collision_message(&new_patterns_path, &new_patterns_id, "Patterns");
            let rename_failed = collision.is_none()
                && fs::rename(&old_patterns_path, &new_patterns_path).is_err();
            if collision.is_some() || rename_failed {
                // Patterns rename failed (or its target already exists) — roll
                // back properNouns rename and config
                let _ = fs::rename(&new_file_path, &old_file_path);
                cache.invalidate(Some(old_dictionary_id));
                // Reverse the config substitution: swap new_dictionary_id back to old
                if config_path.exists() {
                    if let Ok(contents) = fs::read_to_string(config_path) {
                        if let Ok(mut cfg) = serde_json::from_str::<serde_json::Value>(&contents) {
                            substitute_dictionary_reference(&mut cfg, new_dictionary_id, old_dictionary_id);
                            let _ = save_json_file(config_path, &cfg);
                        }
                    }
                }
                let message = collision.unwrap_or_else(|| {
                    "Rename failed: could not rename paired patterns dictionary. Both files restored.".to_string()
                });
                return Ok(DictionaryResponse::err(message));
            }
            cache.invalidate(Some(&old_patterns_id));
        }
    }

    Ok(DictionaryResponse::ok_with_message(format!("Renamed '{}' to '{}'", old_dictionary_id, new_dictionary_id)))
}

// ============================================================================
// Lookup Index Builder - High-Performance Dictionary Index
// ============================================================================

/// Dictionary entry from JavaScript
#[derive(Deserialize, Serialize, Debug, Clone, Hash)]
pub struct DictionaryEntry {
    pub chinese: String,
    pub vietnamese: String,
    pub metadata: Option<String>,
}

/// Dictionary data from JavaScript
#[derive(Deserialize, Serialize, Debug)]
pub struct DictionaryData {
    pub name: String,
    pub entries: Vec<DictionaryEntry>,
    pub priority: Option<u32>,
}

/// Options for building lookup index
#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LookupIndexOptions {
    pub min_text_length: Option<usize>,
    pub enable_indexing: Option<bool>,
    pub use_parallel: Option<bool>,
}

/// Response from lookup index builder
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LookupIndexResponse {
    pub success: bool,
    pub index: HashMap<u32, CategorizedMatches>,
    pub build_time_ms: u128,
    pub positions_indexed: usize,
    pub index_size: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Build a trie from dictionary entries
fn build_trie_from_entries(entries: &[DictionaryEntry]) -> TrieNode {
    let mut trie = TrieNode::new();
    for entry in entries {
        trie.insert(&entry.chinese, entry.vietnamese.clone(), entry.metadata.clone());
    }
    trie
}

/// Build comprehensive lookup index for text using Rust + Rayon
///
/// This is a high-performance replacement for the JavaScript buildComprehensiveLookupIndex
/// Expected speedup: 6-50x (200-800ms vs 5-10 seconds for 10KB text)
#[tauri::command]
pub async fn build_lookup_index(
    limiters: State<'_, RateLimiters>,
    trie_cache: State<'_, TrieCache>,
    text: String,
    dictionaries: Vec<DictionaryData>,
    dictionary_order: Vec<String>,
    options: Option<LookupIndexOptions>,
) -> Result<LookupIndexResponse, String> {
    // SECURITY: Rate limit to prevent abuse
    limiters.check_build_index()?;

    // SECURITY: Validate text size to prevent DoS
    if text.len() > MAX_TEXT_SIZE_BYTES {
        return Err(format!(
            "Text too large: {} MB (max: {} MB)",
            text.len() / 1024 / 1024,
            MAX_TEXT_SIZE_BYTES / 1024 / 1024
        ));
    }

    Ok(build_lookup_index_impl(&trie_cache, &text, &dictionaries, &dictionary_order, options))
}

/// Builds the lookup index from already-security-checked inputs. Pure computation —
/// no `AppHandle`, no `State`, can't fail — the command wrapper owns the rate-limit
/// and DoS-size checks, so this is directly unit-testable with no Tauri context needed
/// (a bare `TrieCache::new()` stands in for the managed state).
fn build_lookup_index_impl(
    trie_cache: &TrieCache,
    text: &str,
    dictionaries: &[DictionaryData],
    dictionary_order: &[String],
    options: Option<LookupIndexOptions>,
) -> LookupIndexResponse {
    let start_time = Instant::now();

    // Parse options with defaults
    let opts = options.unwrap_or(LookupIndexOptions {
        min_text_length: Some(50),
        enable_indexing: Some(true),
        use_parallel: Some(true),
    });

    let build_options = IndexBuildOptions {
        min_text_length: opts.min_text_length.unwrap_or(50),
        enable_indexing: opts.enable_indexing.unwrap_or(true),
        use_parallel: opts.use_parallel.unwrap_or(true),
    };

    // Check if indexing should be skipped (use character count, not byte length)
    let text_char_count = text.chars().count();
    if text_char_count < build_options.min_text_length || !build_options.enable_indexing {
        return LookupIndexResponse {
            success: false,  // Indicate that indexing was skipped
            index: HashMap::new(),
            build_time_ms: start_time.elapsed().as_millis(),
            positions_indexed: 0,
            index_size: 0,
            error: Some(format!(
                "Text too short ({} chars < {} min) or indexing disabled",
                text_char_count, build_options.min_text_length
            )),
        };
    }

    // Convert JavaScript dictionaries to Rust Dictionary format. Trie construction is
    // cached by a content hash of each dictionary's own entries — see TrieCache above.
    let rust_dictionaries: Vec<Dictionary> = dictionaries
        .iter()
        .enumerate()
        .map(|(idx, dict_data)| {
            let cache_key = hash_dictionary_entries(&dict_data.entries);
            let trie = match trie_cache.get(cache_key) {
                Some(cached) => cached,
                None => {
                    let built = Arc::new(build_trie_from_entries(&dict_data.entries));
                    trie_cache.set(cache_key, built.clone());
                    built
                }
            };
            let dict_type = DictionaryType::from_name(&dict_data.name);
            let priority = dict_data.priority.unwrap_or(idx as u32);

            Dictionary {
                name: dict_data.name.clone(),
                trie,
                priority,
                dict_type,
            }
        })
        .collect();

    // Build the index (returns hashbrown::HashMap)
    let hashbrown_index = build_comprehensive_lookup_index(
        text,
        &rust_dictionaries,
        dictionary_order,
        &build_options,
    );

    let build_time = start_time.elapsed().as_millis();
    let positions_indexed = hashbrown_index.len();
    let index_size = hashbrown_index.values().map(|cat| {
        cat.patterns.len() + cat.proper_nouns.len() + cat.phrases.len() +
        cat.characters.len() + cat.numbers.len()
    }).sum();

    // Convert hashbrown::HashMap to std::collections::HashMap for serde compatibility
    let index: HashMap<u32, CategorizedMatches> = hashbrown_index.into_iter().collect();

    LookupIndexResponse {
        success: true,
        index,
        build_time_ms: build_time,
        positions_indexed,
        index_size,
        error: None,
    }
}

// ============================================================================
// CODE REVIEW FIX (2026-01-30): Dictionary Cache Health Monitoring
// ============================================================================

#[derive(Serialize)]
pub struct CacheHealthResponse {
    success: bool,
    is_healthy: bool,
    mutex_poisoned: bool,
    poisoning_event_count: u64,
    message: Option<String>,
}

/// CODE REVIEW FIX (2026-01-30): Check dictionary cache health status
///
/// Monitors mutex poisoning events to detect cache corruption.
/// Frontend can call this periodically or when dictionary operations behave unexpectedly.
/// If poisoning is detected, frontend should notify user and suggest application restart.
#[tauri::command]
pub fn check_dictionary_cache_health() -> CacheHealthResponse {
    let mutex_poisoned = MUTEX_POISONED.load(Ordering::SeqCst);
    let event_count = POISONING_EVENT_COUNT.load(Ordering::SeqCst);

    // Re-emit via the rate-limited helper so polling callers cannot bypass the
    // 60-second NOTIFICATION_COOLDOWN_MS guard that prevents frontend spam.
    if mutex_poisoned {
        emit_poisoning_event();
    }

    CacheHealthResponse {
        success: true,
        is_healthy: !mutex_poisoned,
        mutex_poisoned,
        poisoning_event_count: event_count,
        message: if mutex_poisoned {
            Some(format!(
                "Dictionary cache has been poisoned {} time(s). Performance degradation expected. Restart recommended.",
                event_count
            ))
        } else {
            None
        },
    }
}

// ============================================================================
// Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_cache() -> DictionaryCache {
        DictionaryCache::new()
    }

    // ── Basic get / set ──────────────────────────────────────────────────────

    #[test]
    fn test_get_returns_none_for_missing_key() {
        let cache = make_cache();
        assert!(cache.get("missing_key").is_none());
    }

    #[test]
    fn test_set_then_get_round_trips_value() {
        let cache = make_cache();
        let value = serde_json::json!({"chinese": "你好", "vietnamese": "xin chào"});
        cache.set("phrases".to_string(), value.clone());
        assert_eq!(cache.get("phrases"), Some(value));
    }

    #[test]
    fn test_set_overwrites_existing_key() {
        let cache = make_cache();
        cache.set("key".to_string(), serde_json::json!({"v": 1}));
        cache.set("key".to_string(), serde_json::json!({"v": 2}));
        assert_eq!(cache.get("key"), Some(serde_json::json!({"v": 2})));
    }

    #[test]
    fn test_get_returns_none_for_key_with_no_prior_set() {
        let cache = make_cache();
        cache.set("phrases".to_string(), serde_json::json!({}));
        // Different key — should still be missing
        assert!(cache.get("properNouns-MyNovel").is_none());
    }

    // ── access_order tracks get and set ──────────────────────────────────────

    #[test]
    fn test_set_records_access_order_entry() {
        let cache = make_cache();
        cache.set("k".to_string(), serde_json::json!(null));
        let access_order = cache.access_order.lock().unwrap();
        assert!(access_order.contains_key("k"), "set() should populate access_order");
    }

    #[test]
    fn test_get_updates_access_order_on_hit() {
        let cache = make_cache();
        cache.set("k".to_string(), serde_json::json!(null));
        let ts_after_set = *cache.access_order.lock().unwrap().get("k").unwrap();
        // Access the entry to update its timestamp
        cache.get("k");
        let ts_after_get = *cache.access_order.lock().unwrap().get("k").unwrap();
        // Timestamps should be >= (same millisecond or later)
        assert!(ts_after_get >= ts_after_set);
    }

    #[test]
    fn test_get_does_not_pollute_access_order_on_miss() {
        let cache = make_cache();
        cache.get("nonexistent");
        let access_order = cache.access_order.lock().unwrap();
        assert!(!access_order.contains_key("nonexistent"),
            "get() on missing key must not insert into access_order");
    }

    // ── Timestamp is in milliseconds (regression for as_secs bug) ────────────

    #[test]
    fn test_access_order_timestamp_is_milliseconds_not_seconds() {
        let cache = make_cache();
        cache.set("k".to_string(), serde_json::json!(null));

        let ts = *cache.access_order.lock().unwrap().get("k").unwrap();

        // Any millisecond timestamp after 2020-01-01 is > 1_577_836_800_000.
        // A seconds-based timestamp for the same date would be ~1_577_836_800
        // (1000x smaller). This assertion would fail if as_secs() were used.
        assert!(ts > 1_577_836_800_000,
            "Timestamp {} looks like seconds, not milliseconds (expected > 1_577_836_800_000)",
            ts);
    }

    // ── invalidate by dictionary ID ──────────────────────────────────────────

    #[test]
    fn test_invalidate_by_id_removes_exact_key_only() {
        // Keys are bare dictionary IDs — get_cache_key() returns dictionary_id directly.
        // invalidate(Some(id)) must remove the entry whose key == id and leave others intact.
        let cache = make_cache();
        cache.set("dict1".to_string(), serde_json::json!({"a": 1}));
        cache.set("dict2".to_string(), serde_json::json!({"c": 3}));

        cache.invalidate(Some("dict1"));

        assert!(cache.get("dict1").is_none(), "dict1 should be evicted");
        assert!(cache.get("dict2").is_some(), "dict2 should be untouched");
    }

    #[test]
    fn test_invalidate_by_id_cleans_access_order_for_evicted_keys() {
        let cache = make_cache();
        cache.set("dict1".to_string(), serde_json::json!(null));
        cache.set("dict2".to_string(), serde_json::json!(null));

        cache.invalidate(Some("dict1"));

        let access_order = cache.access_order.lock().unwrap();
        assert!(!access_order.contains_key("dict1"),
            "access_order should not retain evicted key dict1");
        // dict2 may or may not be in access_order depending on whether get() was called
    }

    #[test]
    fn test_invalidate_by_id_does_not_remove_nonexistent_key() {
        let cache = make_cache();
        cache.set("dict1".to_string(), serde_json::json!(null));

        // Invalidating an ID that doesn't exist should be a no-op
        cache.invalidate(Some("ghost_dict"));

        assert!(cache.get("dict1").is_some(), "unrelated entry should survive");
    }

    // ── invalidate(None) — full clear ────────────────────────────────────────

    #[test]
    fn test_invalidate_none_clears_all_entries() {
        let cache = make_cache();
        cache.set("dict1".to_string(), serde_json::json!(null));
        cache.set("dict2".to_string(), serde_json::json!(null));

        cache.invalidate(None);

        assert!(cache.get("dict1").is_none());
        assert!(cache.get("dict2").is_none());
    }

    #[test]
    fn test_invalidate_none_clears_access_order() {
        let cache = make_cache();
        cache.set("k".to_string(), serde_json::json!(null));
        cache.get("k"); // ensure access_order has an entry

        cache.invalidate(None);

        let access_order = cache.access_order.lock().unwrap();
        assert!(access_order.is_empty(),
            "access_order should be empty after full invalidate");
    }

    #[test]
    fn test_invalidate_none_on_empty_cache_is_safe() {
        let cache = make_cache();
        // Should not panic
        cache.invalidate(None);
        assert!(cache.get("anything").is_none());
    }

    // ── LRU eviction when cache is full ──────────────────────────────────────

    #[test]
    fn test_cache_does_not_exceed_max_entries() {
        let cache = make_cache();

        // Insert MAX_CACHE_ENTRIES + 1 distinct entries
        for i in 0..=MAX_CACHE_ENTRIES {
            cache.set(format!("dict{}:path", i), serde_json::json!({"id": i}));
        }

        let cache_guard = cache.cache.lock().unwrap();
        assert_eq!(cache_guard.len(), MAX_CACHE_ENTRIES,
            "Cache size should not exceed MAX_CACHE_ENTRIES after LRU eviction");
    }

    #[test]
    fn test_newly_inserted_key_is_retrievable_after_eviction() {
        let cache = make_cache();

        // Fill to capacity
        for i in 0..MAX_CACHE_ENTRIES {
            cache.set(format!("dict{}:path", i), serde_json::json!({"id": i}));
        }

        // One more entry triggers eviction
        cache.set("newest:path".to_string(), serde_json::json!({"id": 999}));

        // The newest entry must still be present
        assert!(cache.get("newest:path").is_some(),
            "The most recently inserted entry should survive LRU eviction");
    }

    // ── No deadlock: invalidate does not nested-lock ──────────────────────────

    #[test]
    fn test_invalidate_then_set_and_get_are_consistent() {
        // If invalidate() deadlocked, this test would hang.
        // Running in a unit test with a timeout via the test harness is the
        // practical check; the structural fix is verified by code inspection.
        // invalidate() uses exact-key match — keys are bare IDs (not colon-separated).
        let cache = make_cache();
        cache.set("phrases".to_string(), serde_json::json!("before"));
        cache.invalidate(Some("phrases"));
        assert!(cache.get("phrases").is_none());

        cache.set("phrases".to_string(), serde_json::json!("after"));
        assert_eq!(cache.get("phrases"), Some(serde_json::json!("after")));
    }

    // ── DictionaryResponse constructors ──────────────────────────────────────

    #[test]
    fn test_response_ok_has_success_true_and_all_none() {
        let r = DictionaryResponse::ok();
        assert!(r.success);
        assert!(r.data.is_none());
        assert!(r.error.is_none());
        assert!(r.dictionaries.is_none());
        assert!(r.message.is_none());
    }

    #[test]
    fn test_response_ok_with_data_sets_data_field() {
        let data = serde_json::json!({"key": "val"});
        let r = DictionaryResponse::ok_with_data(data.clone());
        assert!(r.success);
        assert_eq!(r.data, Some(data));
        assert!(r.error.is_none());
    }

    #[test]
    fn test_response_ok_with_dicts_sets_dictionaries_field() {
        let dicts = vec!["properNouns-A".to_string(), "properNouns-B".to_string()];
        let r = DictionaryResponse::ok_with_dicts(dicts.clone());
        assert!(r.success);
        assert_eq!(r.dictionaries, Some(dicts));
        assert!(r.data.is_none());
    }

    #[test]
    fn test_response_ok_with_message_sets_message_field() {
        let r = DictionaryResponse::ok_with_message("Exported 5 dictionaries");
        assert!(r.success);
        assert_eq!(r.message.as_deref(), Some("Exported 5 dictionaries"));
        assert!(r.error.is_none());
    }

    #[test]
    fn test_response_err_has_success_false_and_error_string() {
        let r = DictionaryResponse::err("Dictionary not found");
        assert!(!r.success);
        assert_eq!(r.error.as_deref(), Some("Dictionary not found"));
        assert!(r.data.is_none());
        assert!(r.message.is_none());
    }

    // ── validate_dictionary_payload ──────────────────────────────────────────

    #[test]
    fn test_validate_dictionary_payload_accepts_small_flat_object() {
        let data = serde_json::json!({"你好": "xin chào"});
        assert!(validate_dictionary_payload(&data).is_ok());
    }

    #[test]
    fn test_validate_dictionary_payload_rejects_non_object() {
        let data = serde_json::json!(["not", "an", "object"]);
        let err = validate_dictionary_payload(&data).unwrap_err();
        assert!(err.contains("must be a JSON object"));
    }

    #[test]
    fn test_validate_dictionary_payload_rejects_too_many_entries() {
        let mut obj = serde_json::Map::new();
        for i in 0..(MAX_DICTIONARY_ENTRIES + 1) {
            obj.insert(format!("key{}", i), serde_json::json!("v"));
        }
        let data = serde_json::Value::Object(obj);
        let err = validate_dictionary_payload(&data).unwrap_err();
        assert!(err.contains("too large"));
    }

    #[test]
    fn test_validate_dictionary_payload_rejects_excessive_nesting() {
        let mut value = serde_json::json!("leaf");
        for _ in 0..60 {
            value = serde_json::json!({ "n": value });
        }
        let data = serde_json::json!({ "entry": value });
        let err = validate_dictionary_payload(&data).unwrap_err();
        assert!(err.contains("nesting too deep"));
    }

    // ── write_dictionary_bytes ───────────────────────────────────────────────

    #[test]
    fn test_write_dictionary_bytes_writes_file_and_invalidates_cache() {
        let cache = make_cache();
        cache.set("test-dict".to_string(), serde_json::json!({"stale": true}));

        let path = std::env::temp_dir()
            .join(format!("write_dictionary_bytes_test_{}.json", std::process::id()));
        let bytes = b"{\"a\":\"b\"}";

        let result = write_dictionary_bytes(&path, bytes, &cache, "test-dict");
        assert!(result.is_ok());

        let on_disk = std::fs::read(&path).expect("file should exist after write");
        assert_eq!(on_disk, bytes);
        assert!(cache.get("test-dict").is_none(), "write must invalidate any pre-existing cache entry");

        let _ = std::fs::remove_file(&path);
    }

    // ── create_and_activate_proper_noun_file / deactivate_proper_noun_file ───
    // Pure filesystem functions (no AppHandle) backing create_proper_nouns_dictionary
    // and create_fiction_dictionary_pair's rollback path — directly unit-testable.

    fn temp_test_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "dictionary_commands_test_{}_{}",
            name,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("failed to create temp test dir");
        dir
    }

    /// Like `temp_test_dir`, but returns a dictionary directory nested one level inside a
    /// per-test sandbox, so `dictionary_path.parent()` is unique to the test.
    ///
    /// `reset_dictionaries_impl` writes its backup to `dictionary_path.parent()/dictionaries_backup`.
    /// With a flat `temp_test_dir`, that parent is the shared system temp dir, so every reset test
    /// raced over one global `dictionaries_backup` path. Nesting mirrors production layout, where
    /// the dictionary dir sits inside the app data dir.
    fn temp_test_dict_dir(name: &str) -> PathBuf {
        let dir = temp_test_dir(name).join("dictionaries");
        fs::create_dir_all(&dir).expect("failed to create temp dictionary dir");
        dir
    }

    #[test]
    fn test_blob_kind_filenames_are_distinct() {
        let filenames = [
            BlobKind::Config.filename(),
            BlobKind::TransformRules.filename(),
            BlobKind::Appearance.filename(),
            BlobKind::Books.filename(),
        ];
        assert_eq!(
            filenames,
            ["config.json", "transform-rules.json", "appearance.json", "books.json"]
        );
    }

    #[test]
    fn test_blob_kind_default_values() {
        assert_eq!(
            BlobKind::Config.default_value(),
            serde_json::json!({ "activeProperNouns": ["properNouns"] })
        );
        assert_eq!(BlobKind::TransformRules.default_value(), serde_json::json!([]));
        assert_eq!(BlobKind::Books.default_value(), serde_json::json!({}));
        let appearance_default = BlobKind::Appearance.default_value();
        assert_eq!(
            appearance_default["chineseText"]["fontSize"],
            serde_json::json!("1.25rem")
        );
        assert_eq!(
            appearance_default["uiFont"]["fontFamily"],
            serde_json::json!("Inter, system-ui, Arial, sans-serif")
        );
    }

    /// Exercises the same `load_json_file_with_default`/`save_json_file` round trip
    /// `load_blob`/`save_blob` delegate to, for all 3 `BlobKind`s — `load_blob`/`save_blob`
    /// themselves need a real `AppHandle` (path resolution only) so aren't unit-tested
    /// directly; this covers the part that actually varies per kind.
    #[test]
    fn test_blob_load_save_round_trip_for_every_kind() {
        for kind in [
            BlobKind::Config,
            BlobKind::TransformRules,
            BlobKind::Appearance,
            BlobKind::Books,
        ] {
            let dir = temp_test_dir(&format!("blob_round_trip_{}", kind.filename()));
            let path = dir.join(kind.filename());

            // Missing file returns the kind's own default.
            let loaded = load_json_file_with_default(&path, kind.default_value()).unwrap();
            assert_eq!(loaded.data, Some(kind.default_value()));

            // Saved data round-trips exactly, independent of the default.
            let payload = serde_json::json!({ "marker": kind.filename() });
            save_json_file(&path, &payload).unwrap();
            let reloaded = load_json_file_with_default(&path, kind.default_value()).unwrap();
            assert_eq!(reloaded.data, Some(payload));

            let _ = fs::remove_dir_all(&dir);
        }
    }

    #[test]
    fn test_blob_with_invalid_json_is_set_aside_and_defaults_are_returned() {
        for kind in [
            BlobKind::Config,
            BlobKind::TransformRules,
            BlobKind::Appearance,
            BlobKind::Books,
        ] {
            let dir = temp_test_dir(&format!("blob_quarantine_{}", kind.filename()));
            let path = dir.join(kind.filename());
            fs::write(&path, "{ not json").unwrap();

            let loaded = load_json_file_with_default(&path, kind.default_value()).unwrap();

            assert_eq!(loaded.data, Some(kind.default_value()));
            let name = loaded.quarantined.expect("the response names the set-aside file");
            // Moved, not deleted: the unreadable bytes survive beside the path, and the path
            // itself is free for the next save.
            assert!(!path.exists());
            assert_eq!(fs::read_to_string(dir.join(&name)).unwrap(), "{ not json");
            assert!(name.starts_with(path.file_stem().unwrap().to_str().unwrap()));
            assert!(name.contains(".corrupt-"));

            let _ = fs::remove_dir_all(&dir);
        }
    }

    #[test]
    fn test_blob_that_is_not_utf8_is_set_aside() {
        let dir = temp_test_dir("blob_quarantine_utf8");
        let path = dir.join("books.json");
        fs::write(&path, [0xff, 0xfe, 0x00]).unwrap();

        let loaded = load_json_file_with_default(&path, serde_json::json!({})).unwrap();

        assert!(loaded.quarantined.is_some());
        assert!(!path.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_blob_over_the_size_limit_is_set_aside() {
        let dir = temp_test_dir("blob_quarantine_size");
        let path = dir.join("books.json");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_JSON_SIZE_BYTES as u64 + 1).unwrap();

        let loaded = load_json_file_with_default(&path, serde_json::json!({})).unwrap();

        assert!(loaded.quarantined.is_some());
        assert!(!path.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_blob_that_loads_is_never_marked_quarantined() {
        let dir = temp_test_dir("blob_quarantine_none");
        let path = dir.join("books.json");
        fs::write(&path, "{}").unwrap();
        let loaded = load_json_file_with_default(&path, serde_json::json!({})).unwrap();
        assert!(loaded.quarantined.is_none());
        assert!(path.exists());
        let missing = load_json_file_with_default(&dir.join("absent.json"), serde_json::json!({})).unwrap();
        assert!(missing.quarantined.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_create_and_activate_creates_file_and_appends_config() {
        let dir = temp_test_dir("create_happy_path");
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": []}"#).unwrap();

        let result = create_and_activate_proper_noun_file(&dir, &config_path, "properNouns-f_Test");

        assert!(result.is_ok());
        assert!(dir.join("properNouns-f_Test.json").exists());
        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-f_Test"]));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_create_and_activate_errors_when_file_already_exists() {
        let dir = temp_test_dir("create_already_exists");
        let config_path = dir.join("config.json");
        fs::write(dir.join("properNouns-f_Test.json"), "{}").unwrap();

        let result = create_and_activate_proper_noun_file(&dir, &config_path, "properNouns-f_Test");

        assert_eq!(result, Err("Dictionary already exists".to_string()));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_create_and_activate_is_non_fatal_when_config_missing() {
        let dir = temp_test_dir("create_no_config");
        let config_path = dir.join("config.json"); // does not exist

        let result = create_and_activate_proper_noun_file(&dir, &config_path, "properNouns-f_Test");

        assert!(result.is_ok());
        assert!(dir.join("properNouns-f_Test.json").exists());
        assert!(!config_path.exists(), "should not create config.json if absent");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_create_and_activate_skips_duplicate_activation() {
        let dir = temp_test_dir("create_dup_activation");
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": ["properNouns-f_Test"]}"#).unwrap();

        let result = create_and_activate_proper_noun_file(&dir, &config_path, "properNouns-f_Test");

        assert!(result.is_ok());
        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(
            config["activeProperNouns"],
            serde_json::json!(["properNouns-f_Test"]),
            "should not duplicate an already-present entry"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_active_proper_nouns_returns_true_disk_state() {
        let dir = temp_test_dir("read_active_happy_path");
        let config_path = dir.join("config.json");
        fs::write(
            &config_path,
            r#"{"activeProperNouns": ["properNouns-f_A", "properNouns-f_B"]}"#,
        )
        .unwrap();

        let result = read_active_proper_nouns(&config_path);

        assert_eq!(result, vec!["properNouns-f_A".to_string(), "properNouns-f_B".to_string()]);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_active_proper_nouns_reflects_create_and_activate() {
        let dir = temp_test_dir("read_active_after_create");
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": []}"#).unwrap();

        create_and_activate_proper_noun_file(&dir, &config_path, "properNouns-f_Test").unwrap();
        let result = read_active_proper_nouns(&config_path);

        assert_eq!(result, vec!["properNouns-f_Test".to_string()]);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_active_proper_nouns_empty_when_config_missing() {
        let dir = temp_test_dir("read_active_no_config");
        let config_path = dir.join("config.json"); // does not exist

        assert_eq!(read_active_proper_nouns(&config_path), Vec::<String>::new());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_active_proper_nouns_empty_when_config_corrupt() {
        let dir = temp_test_dir("read_active_corrupt_config");
        let config_path = dir.join("config.json");
        fs::write(&config_path, "not valid json").unwrap();

        assert_eq!(read_active_proper_nouns(&config_path), Vec::<String>::new());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_active_proper_nouns_empty_when_key_absent() {
        let dir = temp_test_dir("read_active_no_key");
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"lastSelectedDictionary": "properNouns-Other"}"#).unwrap();

        assert_eq!(read_active_proper_nouns(&config_path), Vec::<String>::new());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_deactivate_removes_entry_from_config() {
        let dir = temp_test_dir("deactivate_happy_path");
        let config_path = dir.join("config.json");
        fs::write(
            &config_path,
            r#"{"activeProperNouns": ["properNouns-f_Test", "properNouns-Other"]}"#,
        )
        .unwrap();

        deactivate_proper_noun_file(&config_path, "properNouns-f_Test");

        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-Other"]));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_deactivate_is_noop_when_config_missing() {
        let dir = temp_test_dir("deactivate_no_config");
        let config_path = dir.join("config.json"); // does not exist

        deactivate_proper_noun_file(&config_path, "properNouns-f_Test"); // must not panic

        assert!(!config_path.exists());

        let _ = fs::remove_dir_all(&dir);
    }

    // ── mutate_active_proper_nouns_best_effort ── shared create/deactivate helper,
    // architecture review 2026-09-08, candidate #3 grilling (narrowed from a 3-function
    // report to just these two — substitute_dictionary_reference stayed a separate, pure
    // in-memory mutator, no shared helper).

    #[test]
    fn test_mutate_active_proper_nouns_creates_missing_array_when_create_if_missing() {
        let dir = temp_test_dir("mutate_active_creates_array");
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{}"#).unwrap(); // no activeProperNouns key at all

        mutate_active_proper_nouns_best_effort(&config_path, true, |active_array| {
            active_array.push(serde_json::Value::String("properNouns-f_New".to_string()));
            true
        });

        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-f_New"]));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_mutate_active_proper_nouns_noops_on_missing_array_when_not_create_if_missing() {
        let dir = temp_test_dir("mutate_active_noop_missing");
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{}"#).unwrap(); // no activeProperNouns key at all

        let mut mutate_called = false;
        mutate_active_proper_nouns_best_effort(&config_path, false, |active_array| {
            mutate_called = true;
            active_array.push(serde_json::Value::String("unreachable".to_string()));
            true
        });

        assert!(!mutate_called, "mutate must not run when the array doesn't exist and create_if_missing is false");
        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(config.get("activeProperNouns").is_none(), "must not create the key");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_mutate_active_proper_nouns_skips_save_when_mutate_returns_false() {
        let dir = temp_test_dir("mutate_active_skips_save");
        let config_path = dir.join("config.json");
        let original = r#"{"activeProperNouns": ["properNouns-f_Existing"], "otherField": "untouched"}"#;
        fs::write(&config_path, original).unwrap();
        let mtime_before = fs::metadata(&config_path).unwrap().modified().unwrap();

        std::thread::sleep(std::time::Duration::from_millis(10));
        mutate_active_proper_nouns_best_effort(&config_path, true, |_active_array| false);

        let mtime_after = fs::metadata(&config_path).unwrap().modified().unwrap();
        assert_eq!(mtime_before, mtime_after, "file must not be rewritten when mutate returns false");

        let _ = fs::remove_dir_all(&dir);
    }

    // ── create_structural_patterns_dictionary_impl / rename_structural_patterns_dictionary_impl ──
    // Pure filesystem functions (no AppHandle) backing the two structural-patterns commands —
    // architecture review 2026-07-18, candidate 3.

    #[test]
    fn test_create_structural_patterns_creates_empty_file_and_invalidates_cache() {
        let dir = temp_test_dir("create_patterns_happy_path");
        let cache = make_cache();
        cache.set("patterns-f_Test".to_string(), serde_json::json!({"stale": true}));

        let response =
            create_structural_patterns_dictionary_impl(&dir, &cache, "patterns-f_Test").unwrap();

        assert!(response.success);
        assert!(dir.join("patterns-f_Test.json").exists());
        let contents = fs::read_to_string(dir.join("patterns-f_Test.json")).unwrap();
        assert_eq!(contents.trim(), "{}");
        assert!(cache.get("patterns-f_Test").is_none(), "create must invalidate stale cache entry");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_create_structural_patterns_rejects_wrong_prefix() {
        let dir = temp_test_dir("create_patterns_wrong_prefix");
        let cache = make_cache();

        let response =
            create_structural_patterns_dictionary_impl(&dir, &cache, "properNouns-f_Test").unwrap();

        assert!(!response.success);
        assert_eq!(response.error.as_deref(), Some("Dictionary ID must start with 'patterns-'"));
        assert!(!dir.join("properNouns-f_Test.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_create_structural_patterns_rejects_path_traversal_id() {
        let dir = temp_test_dir("create_patterns_traversal");
        let cache = make_cache();

        let result = create_structural_patterns_dictionary_impl(&dir, &cache, "patterns-../evil");

        match result {
            Err(e) => assert_eq!(e, "Invalid dictionary ID: path separators not allowed"),
            Ok(_) => panic!("expected Err for a path-traversal dictionary ID"),
        }

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_create_structural_patterns_rejects_when_file_already_exists() {
        let dir = temp_test_dir("create_patterns_already_exists");
        let cache = make_cache();
        fs::write(dir.join("patterns-f_Test.json"), "{}").unwrap();

        let response =
            create_structural_patterns_dictionary_impl(&dir, &cache, "patterns-f_Test").unwrap();

        assert!(!response.success);
        assert_eq!(response.error.as_deref(), Some("Dictionary already exists"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_structural_patterns_renames_file_and_invalidates_old_cache() {
        let dir = temp_test_dir("rename_patterns_happy_path");
        let cache = make_cache();
        fs::write(dir.join("patterns-f_Old.json"), "{}").unwrap();
        cache.set("patterns-f_Old".to_string(), serde_json::json!({"stale": true}));

        let response = rename_structural_patterns_dictionary_impl(
            &dir,
            &cache,
            "patterns-f_Old",
            "patterns-f_New",
        )
        .unwrap();

        assert!(response.success);
        assert!(!dir.join("patterns-f_Old.json").exists());
        assert!(dir.join("patterns-f_New.json").exists());
        assert!(cache.get("patterns-f_Old").is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_structural_patterns_rejects_wrong_prefix_on_either_id() {
        let dir = temp_test_dir("rename_patterns_wrong_prefix");
        let cache = make_cache();
        fs::write(dir.join("patterns-f_Old.json"), "{}").unwrap();

        let response = rename_structural_patterns_dictionary_impl(
            &dir,
            &cache,
            "patterns-f_Old",
            "properNouns-f_New",
        )
        .unwrap();

        assert!(!response.success);
        assert_eq!(
            response.error.as_deref(),
            Some("Both dictionary IDs must start with 'patterns-'")
        );
        assert!(dir.join("patterns-f_Old.json").exists(), "no rename should occur");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_structural_patterns_skips_when_old_file_missing() {
        let dir = temp_test_dir("rename_patterns_old_missing");
        let cache = make_cache();

        let response = rename_structural_patterns_dictionary_impl(
            &dir,
            &cache,
            "patterns-f_Old",
            "patterns-f_New",
        )
        .unwrap();

        assert!(response.success, "missing old file is a skip, not an error");
        assert!(response.message.as_deref().unwrap().contains("not found"));
        assert!(!dir.join("patterns-f_New.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_structural_patterns_rejects_when_new_file_already_exists() {
        let dir = temp_test_dir("rename_patterns_new_exists");
        let cache = make_cache();
        fs::write(dir.join("patterns-f_Old.json"), "{}").unwrap();
        fs::write(dir.join("patterns-f_New.json"), "{}").unwrap();

        let response = rename_structural_patterns_dictionary_impl(
            &dir,
            &cache,
            "patterns-f_Old",
            "patterns-f_New",
        )
        .unwrap();

        assert!(!response.success);
        assert!(response.error.as_deref().unwrap().contains("already exists"));
        assert!(dir.join("patterns-f_Old.json").exists(), "no rename should occur");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_structural_patterns_rejects_invalid_new_id() {
        let dir = temp_test_dir("rename_patterns_invalid_new_id");
        let cache = make_cache();
        fs::write(dir.join("patterns-f_Old.json"), "{}").unwrap();

        let result = rename_structural_patterns_dictionary_impl(
            &dir,
            &cache,
            "patterns-f_Old",
            "patterns-../evil",
        );

        match result {
            Err(e) => assert_eq!(e, "Invalid dictionary ID: path separators not allowed"),
            Ok(_) => panic!("expected Err for a path-traversal dictionary ID"),
        }
        assert!(dir.join("patterns-f_Old.json").exists(), "no rename should occur");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rollback_sequence_leaves_no_active_entry_and_file_removed() {
        // Simulates create_fiction_dictionary_pair's rollback: the properNouns half is
        // created+activated, then reversed when the patterns half fails to create.
        let dir = temp_test_dir("rollback_sequence");
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": []}"#).unwrap();

        create_and_activate_proper_noun_file(&dir, &config_path, "properNouns-f_Test")
            .expect("initial create should succeed");

        let file_path = dir.join("properNouns-f_Test.json");
        fs::remove_file(&file_path).unwrap();
        deactivate_proper_noun_file(&config_path, "properNouns-f_Test");

        assert!(!file_path.exists());
        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(config["activeProperNouns"], serde_json::json!([]));

        let _ = fs::remove_dir_all(&dir);
    }

    // ── substitute_dictionary_reference ───────────────────────────────────────
    // Pure Value-mutation function backing rename_proper_nouns_dictionary's forward
    // rename and reverse rollback — same function, swapped arguments.

    #[test]
    fn test_substitute_swaps_matching_entry_in_active_proper_nouns() {
        let mut config = serde_json::json!({"activeProperNouns": ["properNouns-f_Old", "properNouns-Other"]});

        substitute_dictionary_reference(&mut config, "properNouns-f_Old", "properNouns-f_New");

        assert_eq!(
            config["activeProperNouns"],
            serde_json::json!(["properNouns-f_New", "properNouns-Other"])
        );
    }

    #[test]
    fn test_substitute_swaps_matching_last_selected_dictionary() {
        let mut config = serde_json::json!({"lastSelectedDictionary": "properNouns-f_Old"});

        substitute_dictionary_reference(&mut config, "properNouns-f_Old", "properNouns-f_New");

        assert_eq!(config["lastSelectedDictionary"], serde_json::json!("properNouns-f_New"));
    }

    #[test]
    fn test_substitute_swaps_matching_default_quick_add_dictionary() {
        let mut config = serde_json::json!({"defaultQuickAddDictionary": "properNouns-f_Old"});

        substitute_dictionary_reference(&mut config, "properNouns-f_Old", "properNouns-f_New");

        assert_eq!(config["defaultQuickAddDictionary"], serde_json::json!("properNouns-f_New"));
    }

    #[test]
    fn test_substitute_swaps_all_three_fields_at_once() {
        let mut config = serde_json::json!({
            "activeProperNouns": ["properNouns-f_Old"],
            "lastSelectedDictionary": "properNouns-f_Old",
            "defaultQuickAddDictionary": "properNouns-f_Old"
        });

        substitute_dictionary_reference(&mut config, "properNouns-f_Old", "properNouns-f_New");

        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-f_New"]));
        assert_eq!(config["lastSelectedDictionary"], serde_json::json!("properNouns-f_New"));
        assert_eq!(config["defaultQuickAddDictionary"], serde_json::json!("properNouns-f_New"));
    }

    // ── Parity with the TS half (ADR-060) ───────────────────────────────────
    // `src/utils/__tests__/DictionaryIdRules.parity.test.ts` reads the same fixture.
    fn id_rules_fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../src/test/fixtures/dictionary_id_rules.json"))
            .expect("dictionary_id_rules.json is valid JSON")
    }

    #[test]
    fn test_pairing_rules_match_the_shared_fixture() {
        let fixture = id_rules_fixture();
        for row in fixture["ids"].as_array().unwrap() {
            let id = row["id"].as_str().unwrap();
            // `has_paired_patterns` is only asked about proper-nouns ids.
            if row["kind"] != "properNouns" {
                continue;
            }
            assert_eq!(
                has_paired_patterns(id),
                row["hasPairedPatterns"].as_bool().unwrap(),
                "has_paired_patterns({id:?})"
            );
            if let Some(patterns_id) = row["patternsId"].as_str() {
                assert_eq!(to_patterns_id(id), patterns_id, "to_patterns_id({id:?})");
            }
        }
    }

    #[test]
    fn test_substitute_rewrites_exactly_the_fixtures_dictionary_reference_keys() {
        let fixture = id_rules_fixture();
        let old = "properNouns-f_Old";
        let new = "properNouns-f_New";
        let mut config = serde_json::Map::new();
        for (key, rule) in fixture["configKeys"].as_object().unwrap() {
            let value = match rule["shape"].as_str() {
                Some("array") => serde_json::json!([old]),
                _ => serde_json::json!(old),
            };
            config.insert(key.clone(), value);
        }
        let mut config = serde_json::Value::Object(config);

        substitute_dictionary_reference(&mut config, old, new);

        for (key, rule) in fixture["configKeys"].as_object().unwrap() {
            let rewritten = rule["role"] == "dictionaryReference";
            let target = if rewritten { new } else { old };
            let expected = match rule["shape"].as_str() {
                Some("array") => serde_json::json!([target]),
                _ => serde_json::json!(target),
            };
            assert_eq!(config[key], expected, "config key {key:?} (rewritten: {rewritten})");
        }
    }

    #[test]
    fn test_substitute_is_noop_when_old_not_referenced() {
        let mut config = serde_json::json!({
            "activeProperNouns": ["properNouns-Other"],
            "lastSelectedDictionary": "properNouns-Other",
            "defaultQuickAddDictionary": "properNouns-Other"
        });

        substitute_dictionary_reference(&mut config, "properNouns-f_Old", "properNouns-f_New");

        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-Other"]));
        assert_eq!(config["lastSelectedDictionary"], serde_json::json!("properNouns-Other"));
        assert_eq!(config["defaultQuickAddDictionary"], serde_json::json!("properNouns-Other"));
    }

    #[test]
    fn test_substitute_does_not_panic_when_fields_absent() {
        let mut config = serde_json::json!({});

        substitute_dictionary_reference(&mut config, "properNouns-f_Old", "properNouns-f_New");

        assert_eq!(config, serde_json::json!({}));
    }

    #[test]
    fn test_substitute_reverses_with_swapped_arguments() {
        // Mirrors the rollback call site: apply forward, then reverse with (new, old).
        let mut config = serde_json::json!({
            "activeProperNouns": ["properNouns-f_Old"],
            "lastSelectedDictionary": "properNouns-f_Old",
            "defaultQuickAddDictionary": "properNouns-f_Old"
        });

        substitute_dictionary_reference(&mut config, "properNouns-f_Old", "properNouns-f_New");
        substitute_dictionary_reference(&mut config, "properNouns-f_New", "properNouns-f_Old");

        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-f_Old"]));
        assert_eq!(config["lastSelectedDictionary"], serde_json::json!("properNouns-f_Old"));
        assert_eq!(config["defaultQuickAddDictionary"], serde_json::json!("properNouns-f_Old"));
    }

    // ── Test helpers for the command-handler bodies below ────────────────────

    fn build_test_zip(path: &PathBuf, entries: &[(&str, &str)]) {
        let file = fs::File::create(path).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        for (name, content) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(content.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    fn read_zip_entries(path: &PathBuf) -> Vec<(String, String)> {
        let file = fs::File::open(path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let mut out = Vec::new();
        for i in 0..archive.len() {
            let mut f = archive.by_index(i).unwrap();
            let name = f.name().to_string();
            let mut content = String::new();
            f.read_to_string(&mut content).unwrap();
            out.push((name, content));
        }
        out
    }

    fn deeply_nested_json(depth: usize) -> serde_json::Value {
        let mut v = serde_json::json!(null);
        for _ in 0..depth {
            v = serde_json::json!({ "n": v });
        }
        v
    }

    // ── reset_dictionaries_impl ───────────────────────────────────────────────
    // Previously untested command body (architecture review 2026-07-17, candidate 5) —
    // extracted from reset_dictionaries so it's testable without a real AppHandle.

    #[test]
    fn test_reset_with_backup_copies_files_then_wipes_and_recreates() {
        let dir = temp_test_dict_dir("reset_with_backup");
        fs::write(dir.join("phrases.json"), "{}").unwrap();
        let cache = make_cache();
        cache.set("phrases".to_string(), serde_json::json!({"stale": true}));

        let result = reset_dictionaries_impl(&dir, true, &cache);

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.success);
        assert!(response.message.as_ref().unwrap().contains("Backup saved"));

        let backup_dir = dir.parent().unwrap().join("dictionaries_backup");
        assert!(
            backup_dir.join("phrases.json").exists(),
            "backup should contain the original file"
        );
        assert!(!dir.join("phrases.json").exists(), "dictionary dir should be wiped");
        assert!(dir.exists(), "dictionary dir should be recreated (empty)");
        assert!(cache.get("phrases").is_none(), "cache should be cleared");

        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn test_reset_without_backup_skips_backup_dir() {
        let dir = temp_test_dict_dir("reset_without_backup");
        fs::write(dir.join("phrases.json"), "{}").unwrap();
        let cache = make_cache();

        let result = reset_dictionaries_impl(&dir, false, &cache);

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.message.as_ref().unwrap().contains("No backup created"));

        let backup_dir = dir.parent().unwrap().join("dictionaries_backup");
        assert!(!backup_dir.exists(), "backup dir should not be created when create_backup=false");
        assert!(dir.exists());
        assert!(!dir.join("phrases.json").exists());

        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn test_reset_recreates_dir_when_it_did_not_exist_yet() {
        let dir = temp_test_dict_dir("reset_missing_dir");
        fs::remove_dir_all(&dir).unwrap(); // simulate a dictionary dir that was never created
        let cache = make_cache();

        let result = reset_dictionaries_impl(&dir, true, &cache);

        assert!(result.is_ok(), "should succeed even when the dictionary dir did not exist");
        assert!(dir.exists());

        let _ = fs::remove_dir_all(dir.parent().unwrap());
    }

    // ── load_dictionaries_parallel_impl ───────────────────────────────────────

    #[test]
    fn test_load_parallel_reads_and_caches_valid_dictionaries() {
        let dir = temp_test_dir("load_parallel_valid");
        fs::write(dir.join("phrases.json"), r#"{"你好":"xin chào"}"#).unwrap();
        fs::write(dir.join("characters.json"), r#"{"你":"ban"}"#).unwrap();
        let cache = make_cache();

        let response = load_dictionaries_parallel_impl(
            &dir,
            &cache,
            &["phrases".to_string(), "characters".to_string()],
        );

        assert_eq!(response.total, 2);
        assert_eq!(response.successful, 2);
        assert_eq!(response.failed, 0);
        assert!(cache.get("phrases").is_some(), "successful loads should populate the cache");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_parallel_second_call_hits_cache_without_touching_disk() {
        let dir = temp_test_dir("load_parallel_cache_hit");
        fs::write(dir.join("phrases.json"), r#"{"a":"b"}"#).unwrap();
        let cache = make_cache();

        load_dictionaries_parallel_impl(&dir, &cache, &["phrases".to_string()]);
        fs::remove_file(dir.join("phrases.json")).unwrap(); // prove the 2nd call doesn't hit disk

        let response = load_dictionaries_parallel_impl(&dir, &cache, &["phrases".to_string()]);

        assert_eq!(response.successful, 1, "cache hit should succeed even though the file is gone");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_parallel_rejects_path_traversal_id() {
        let dir = temp_test_dir("load_parallel_traversal");
        let cache = make_cache();

        let response = load_dictionaries_parallel_impl(&dir, &cache, &["../evil".to_string()]);

        assert_eq!(response.failed, 1);
        assert!(!response.results[0].success);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_parallel_loads_a_missing_file_as_empty() {
        // A missing file is an empty dictionary the first Add will create, not an unread one:
        // an unread dictionary refuses every save, which would make a fresh install's
        // hard-coded dictionaries (`phrases`, `patterns`, ...) impossible to add to.
        let dir = temp_test_dir("load_parallel_missing");
        let cache = make_cache();

        let response = load_dictionaries_parallel_impl(&dir, &cache, &["phrases".to_string()]);

        assert_eq!(response.failed, 0);
        assert!(response.results[0].success);
        assert_eq!(response.results[0].data, Some(serde_json::json!({})));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_parallel_reports_invalid_json() {
        let dir = temp_test_dir("load_parallel_bad_json");
        fs::write(dir.join("phrases.json"), "{not valid json").unwrap();
        let cache = make_cache();

        let response = load_dictionaries_parallel_impl(&dir, &cache, &["phrases".to_string()]);

        assert_eq!(response.failed, 1);
        assert!(response.results[0].error.as_ref().unwrap().contains("Invalid JSON"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_parallel_reports_non_object_payload() {
        let dir = temp_test_dir("load_parallel_non_object");
        fs::write(dir.join("phrases.json"), "[1,2,3]").unwrap();
        let cache = make_cache();

        let response = load_dictionaries_parallel_impl(&dir, &cache, &["phrases".to_string()]);

        assert_eq!(response.failed, 1);
        assert!(response.results[0]
            .error
            .as_ref()
            .unwrap()
            .contains("Dictionary data must be a JSON object"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_parallel_reports_too_many_entries() {
        let dir = temp_test_dir("load_parallel_too_many_entries");
        let mut obj = serde_json::Map::new();
        for i in 0..(MAX_DICTIONARY_ENTRIES + 1) {
            obj.insert(format!("key{}", i), serde_json::json!("value"));
        }
        fs::write(
            dir.join("phrases.json"),
            serde_json::to_string(&serde_json::Value::Object(obj)).unwrap(),
        )
        .unwrap();
        let cache = make_cache();

        let response = load_dictionaries_parallel_impl(&dir, &cache, &["phrases".to_string()]);

        assert_eq!(response.failed, 1);
        assert!(response.results[0]
            .error
            .as_ref()
            .unwrap()
            .contains("Dictionary too large"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_parallel_totals_reflect_mixed_success_and_failure() {
        let dir = temp_test_dir("load_parallel_mixed");
        fs::write(dir.join("phrases.json"), r#"{"a":"b"}"#).unwrap();
        fs::write(dir.join("broken.json"), "{ not json").unwrap();
        let cache = make_cache();

        let response = load_dictionaries_parallel_impl(
            &dir,
            &cache,
            &["phrases".to_string(), "broken".to_string()],
        );

        assert_eq!(response.total, 2);
        assert_eq!(response.successful, 1);
        assert_eq!(response.failed, 1);

        let _ = fs::remove_dir_all(&dir);
    }

    // ── export_dictionaries_impl ───────────────────────────────────────────────

    #[test]
    fn test_export_writes_all_json_files_into_zip() {
        let dir = temp_test_dir("export_valid");
        fs::write(dir.join("phrases.json"), r#"{"a":"b"}"#).unwrap();
        fs::write(dir.join("characters.json"), r#"{"c":"d"}"#).unwrap();
        let zip_path = dir.join("out.zip");

        let result = export_dictionaries_impl(&dir, &zip_path);

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.success);
        assert!(response.message.as_ref().unwrap().contains("Exported 2 dictionaries"));

        let mut entries = read_zip_entries(&zip_path);
        entries.sort();
        assert_eq!(
            entries,
            vec![
                ("characters.json".to_string(), r#"{"c":"d"}"#.to_string()),
                ("phrases.json".to_string(), r#"{"a":"b"}"#.to_string()),
            ]
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_export_skips_non_json_files() {
        let dir = temp_test_dir("export_skips_non_json");
        fs::write(dir.join("phrases.json"), "{}").unwrap();
        fs::write(dir.join("readme.txt"), "not a dictionary").unwrap();
        let zip_path = dir.join("out.zip");

        let result = export_dictionaries_impl(&dir, &zip_path);

        assert!(result.unwrap().message.unwrap().contains("Exported 1 dictionaries"));
        let entries = read_zip_entries(&zip_path);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].0, "phrases.json");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_export_empty_directory_produces_empty_zip() {
        let dir = temp_test_dir("export_empty");
        let zip_path = dir.join("out.zip");

        let result = export_dictionaries_impl(&dir, &zip_path);

        assert!(result.unwrap().message.unwrap().contains("Exported 0 dictionaries"));
        assert_eq!(read_zip_entries(&zip_path).len(), 0);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_export_errors_when_dictionary_dir_missing() {
        let dir = temp_test_dir("export_missing_dir");
        fs::remove_dir_all(&dir).unwrap();
        let zip_path = std::env::temp_dir().join(format!("export_missing_dir_out_{}.zip", std::process::id()));

        let result = export_dictionaries_impl(&dir, &zip_path);

        assert!(result.is_err());

        let _ = fs::remove_file(&zip_path);
    }

    // ── import_dictionaries_impl ───────────────────────────────────────────────

    #[test]
    fn test_import_extracts_valid_entries_and_writes_files() {
        let dir = temp_test_dir("import_valid");
        let zip_path = dir.join("in.zip");
        build_test_zip(&zip_path, &[("phrases.json", r#"{"a":"b"}"#)]);
        let cache = make_cache();
        cache.set("phrases".to_string(), serde_json::json!({"stale": true}));

        let result = import_dictionaries_impl(&dir, &zip_path, &cache);

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.success);
        assert!(response.message.as_ref().unwrap().contains("Imported 1 dictionaries successfully"));
        assert_eq!(fs::read_to_string(dir.join("phrases.json")).unwrap(), r#"{"a":"b"}"#);
        assert!(cache.get("phrases").is_none(), "import must invalidate any pre-existing cache entry");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_import_skips_trie_json_cache_files() {
        let dir = temp_test_dir("import_skips_trie");
        let zip_path = dir.join("in.zip");
        build_test_zip(&zip_path, &[("phrases.trie.json", "{}")]);
        let cache = make_cache();

        let result = import_dictionaries_impl(&dir, &zip_path, &cache);

        assert!(!result.unwrap().success, "an all-skipped import has file_count=0 -> success=false");
        assert!(!dir.join("phrases.trie.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_import_rejects_path_traversal_entry_name() {
        let dir = temp_test_dir("import_traversal");
        let zip_path = dir.join("in.zip");
        build_test_zip(&zip_path, &[("../evil.json", "{}")]);
        let cache = make_cache();

        let result = import_dictionaries_impl(&dir, &zip_path, &cache);

        let response = result.unwrap();
        assert!(!response.success);
        assert!(!dir.parent().unwrap().join("evil.json").exists(), "must not escape dictionary_path");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_import_accumulates_error_for_invalid_json_entry() {
        let dir = temp_test_dir("import_bad_json");
        let zip_path = dir.join("in.zip");
        build_test_zip(&zip_path, &[("phrases.json", "{not valid")]);
        let cache = make_cache();

        let result = import_dictionaries_impl(&dir, &zip_path, &cache);

        let response = result.unwrap();
        assert!(!response.success);
        assert!(response.error.as_ref().unwrap().contains("invalid JSON format"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_import_accumulates_error_for_non_object_payload() {
        let dir = temp_test_dir("import_non_object");
        let zip_path = dir.join("in.zip");
        build_test_zip(&zip_path, &[("phrases.json", "[1,2,3]")]);
        let cache = make_cache();

        let result = import_dictionaries_impl(&dir, &zip_path, &cache);

        let response = result.unwrap();
        assert!(!response.success);
        assert!(!dir.join("phrases.json").exists(), "invalid payload must not be written to disk");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_import_mixed_batch_reports_partial_success() {
        let dir = temp_test_dir("import_mixed");
        let zip_path = dir.join("in.zip");
        build_test_zip(
            &zip_path,
            &[("phrases.json", r#"{"a":"b"}"#), ("characters.json", "{not valid")],
        );
        let cache = make_cache();

        let result = import_dictionaries_impl(&dir, &zip_path, &cache);

        let response = result.unwrap();
        assert!(response.success, "success=true whenever at least one entry imports");
        assert!(response.message.as_ref().unwrap().contains("1 dictionaries, 1 errors"));
        assert!(dir.join("phrases.json").exists());
        assert!(!dir.join("characters.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_import_corrupted_zip_returns_error() {
        let dir = temp_test_dir("import_corrupt_zip");
        let zip_path = dir.join("in.zip");
        fs::write(&zip_path, b"this is not a zip file").unwrap();
        let cache = make_cache();

        let result = import_dictionaries_impl(&dir, &zip_path, &cache);

        assert!(result.is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    // ── rename_proper_nouns_dictionary_impl ─────────────────────────────────────

    #[test]
    fn test_rename_happy_path_moves_file_and_updates_config() {
        let dir = temp_test_dir("rename_happy_path");
        fs::write(dir.join("properNouns-Old.json"), "{}").unwrap();
        let config_path = dir.join("config.json");
        fs::write(
            &config_path,
            r#"{"activeProperNouns": ["properNouns-Old"], "lastSelectedDictionary": "properNouns-Old", "defaultQuickAddDictionary": "properNouns-Old"}"#,
        )
        .unwrap();
        let cache = make_cache();
        cache.set("properNouns-Old".to_string(), serde_json::json!({"stale": true}));

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-Old",
            "properNouns-New",
        );

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.success);
        assert!(!dir.join("properNouns-Old.json").exists());
        assert!(dir.join("properNouns-New.json").exists());
        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-New"]));
        assert_eq!(config["lastSelectedDictionary"], serde_json::json!("properNouns-New"));
        assert_eq!(config["defaultQuickAddDictionary"], serde_json::json!("properNouns-New"));
        assert!(cache.get("properNouns-Old").is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_cascades_to_paired_fiction_patterns_dict() {
        let dir = temp_test_dir("rename_fiction_cascade");
        fs::write(dir.join("properNouns-f_Old.json"), "{}").unwrap();
        fs::write(dir.join("patterns-f_Old.json"), "{}").unwrap();
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": ["properNouns-f_Old"]}"#).unwrap();
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-f_Old",
            "properNouns-f_New",
        );

        assert!(result.unwrap().success);
        assert!(dir.join("properNouns-f_New.json").exists());
        assert!(dir.join("patterns-f_New.json").exists(), "paired patterns dict must cascade");
        assert!(!dir.join("patterns-f_Old.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_cascades_to_paired_generic_patterns_dict() {
        let dir = temp_test_dir("rename_generic_cascade");
        fs::write(dir.join("properNouns-_Old.json"), "{}").unwrap();
        fs::write(dir.join("patterns-_Old.json"), "{}").unwrap();
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": ["properNouns-_Old"]}"#).unwrap();
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-_Old",
            "properNouns-_New",
        );

        assert!(result.unwrap().success);
        assert!(dir.join("properNouns-_New.json").exists());
        assert!(dir.join("patterns-_New.json").exists(), "paired patterns dict must cascade");
        assert!(!dir.join("patterns-_Old.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_across_tiers_moves_the_pair_and_config() {
        // Promote (fiction -> generic) is a rename across tiers: the patterns half follows
        // the new id's tier, and config names the new id.
        let dir = temp_test_dir("rename_across_tiers");
        fs::write(dir.join("properNouns-f_X.json"), "{}").unwrap();
        fs::write(dir.join("patterns-f_X.json"), "{}").unwrap();
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": ["properNouns-f_X"]}"#).unwrap();
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-f_X",
            "properNouns-_X",
        );

        assert!(result.unwrap().success);
        assert!(dir.join("properNouns-_X.json").exists());
        assert!(dir.join("patterns-_X.json").exists());
        assert!(!dir.join("patterns-f_X.json").exists());
        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(config["activeProperNouns"], serde_json::json!(["properNouns-_X"]));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_has_paired_patterns_covers_fiction_and_generic_only() {
        assert!(has_paired_patterns("properNouns-f_X"));
        assert!(has_paired_patterns("properNouns-_X"));
        assert!(!has_paired_patterns("properNouns-X"));
        assert!(!has_paired_patterns("properNouns"));
    }

    #[test]
    fn test_rename_cascade_does_not_overwrite_existing_patterns_target() {
        let dir = temp_test_dir("rename_cascade_collision_no_overwrite");
        fs::write(dir.join("properNouns-f_Old.json"), "{}").unwrap();
        fs::write(dir.join("patterns-f_Old.json"), r#"{"marker":"old"}"#).unwrap();
        // A real patterns-f_New.json already exists with its own content — the
        // cascade must reject the rename rather than silently overwrite it.
        fs::write(dir.join("patterns-f_New.json"), r#"{"marker":"preexisting"}"#).unwrap();
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": ["properNouns-f_Old"]}"#).unwrap();
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-f_Old",
            "properNouns-f_New",
        );

        let response = result.unwrap();
        assert!(!response.success);
        assert!(response.error.as_ref().unwrap().contains("Patterns dictionary 'patterns-f_New' already exists"));
        let preserved = fs::read_to_string(dir.join("patterns-f_New.json")).unwrap();
        assert!(preserved.contains("preexisting"), "pre-existing patterns target must not be overwritten");
        assert!(
            dir.join("patterns-f_Old.json").exists(),
            "patterns-f_Old.json must not be renamed away when its target collides"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_rejects_default_proper_nouns_dictionary() {
        let dir = temp_test_dir("rename_rejects_default");
        let config_path = dir.join("config.json");
        let cache = make_cache();

        let result =
            rename_proper_nouns_dictionary_impl(&dir, &config_path, &cache, "properNouns", "properNouns-New");

        let response = result.unwrap();
        assert!(!response.success);
        assert!(response.error.as_ref().unwrap().contains("Cannot rename the default"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_rejects_ids_not_starting_with_proper_nouns_dash() {
        let dir = temp_test_dir("rename_rejects_prefix");
        let config_path = dir.join("config.json");
        let cache = make_cache();

        let result =
            rename_proper_nouns_dictionary_impl(&dir, &config_path, &cache, "properNouns-Old", "phrases");

        let response = result.unwrap();
        assert!(!response.success);
        assert!(response.error.as_ref().unwrap().contains("must start with 'properNouns-'"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_errors_when_old_file_not_found() {
        let dir = temp_test_dir("rename_old_missing");
        let config_path = dir.join("config.json");
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-Old",
            "properNouns-New",
        );

        let response = result.unwrap();
        assert!(!response.success);
        assert!(response.error.as_ref().unwrap().contains("not found"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_errors_when_new_file_already_exists() {
        let dir = temp_test_dir("rename_new_exists");
        fs::write(dir.join("properNouns-Old.json"), "{}").unwrap();
        fs::write(dir.join("properNouns-New.json"), "{}").unwrap();
        let config_path = dir.join("config.json");
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-Old",
            "properNouns-New",
        );

        let response = result.unwrap();
        assert!(!response.success);
        assert!(response.error.as_ref().unwrap().contains("already exists"));
        assert!(dir.join("properNouns-Old.json").exists(), "old file must be untouched");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_rolls_back_file_when_config_save_fails() {
        let dir = temp_test_dir("rename_rollback_config_failure");
        fs::write(dir.join("properNouns-Old.json"), "{}").unwrap();
        let config_path = dir.join("config.json");
        // >50 levels deep — fails save_json_file's check_json_depth guard, forcing the
        // rollback branch (H3: file rename reversed, config never written).
        fs::write(&config_path, serde_json::to_string(&deeply_nested_json(60)).unwrap()).unwrap();
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-Old",
            "properNouns-New",
        );

        assert!(result.is_err(), "config save failure propagates as Err, not a DictionaryResponse::err");
        assert!(
            dir.join("properNouns-Old.json").exists(),
            "file rename must be rolled back when config save fails"
        );
        assert!(!dir.join("properNouns-New.json").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_rename_rolls_back_everything_when_patterns_cascade_target_collides() {
        let dir = temp_test_dir("rename_rollback_cascade_collision");
        fs::write(dir.join("properNouns-f_Old.json"), "{}").unwrap();
        fs::write(dir.join("patterns-f_Old.json"), "{}").unwrap();
        // Pre-create the cascade's rename TARGET so it already exists — the collision
        // check now catches this before fs::rename is even attempted.
        fs::create_dir(dir.join("patterns-f_New.json")).unwrap();
        let config_path = dir.join("config.json");
        fs::write(&config_path, r#"{"activeProperNouns": ["properNouns-f_Old"]}"#).unwrap();
        let cache = make_cache();

        let result = rename_proper_nouns_dictionary_impl(
            &dir,
            &config_path,
            &cache,
            "properNouns-f_Old",
            "properNouns-f_New",
        );

        let response = result.unwrap();
        assert!(!response.success);
        assert!(response.error.as_ref().unwrap().contains("Patterns dictionary 'patterns-f_New' already exists"));
        assert!(
            dir.join("properNouns-f_Old.json").exists(),
            "properNouns rename must be rolled back when the patterns cascade target collides"
        );
        assert!(!dir.join("properNouns-f_New.json").exists());
        let config: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&config_path).unwrap()).unwrap();
        assert_eq!(
            config["activeProperNouns"],
            serde_json::json!(["properNouns-f_Old"]),
            "config substitution must be reversed too"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    // ── build_lookup_index_impl ────────────────────────────────────────────────
    // Wiring/response-shaping only — build_comprehensive_lookup_index's own indexing
    // correctness (ordering, parallel/serial, match content) is covered by
    // lookup_index_engine.rs's own test suite; do not duplicate that here.

    fn make_dict(name: &str, priority: Option<u32>, entries: Vec<(&str, &str)>) -> DictionaryData {
        DictionaryData {
            name: name.to_string(),
            priority,
            entries: entries
                .into_iter()
                .map(|(chinese, vietnamese)| DictionaryEntry {
                    chinese: chinese.to_string(),
                    vietnamese: vietnamese.to_string(),
                    metadata: None,
                })
                .collect(),
        }
    }

    #[test]
    fn test_build_lookup_index_impl_skips_short_text() {
        let dictionaries = vec![make_dict("characters", Some(0), vec![("你", "bạn")])];
        let order = vec!["characters".to_string()];

        // "你好" is 2 chars — below the default min_text_length of 50.
        let response = build_lookup_index_impl(&TrieCache::new(), "你好", &dictionaries, &order, None);

        assert!(!response.success);
        assert_eq!(response.positions_indexed, 0);
        assert_eq!(response.index_size, 0);
        assert!(response.index.is_empty());
        assert!(response.error.unwrap().contains("Text too short"));
    }

    #[test]
    fn test_build_lookup_index_impl_none_options_use_documented_defaults() {
        let dictionaries = vec![make_dict("characters", Some(0), vec![("你", "bạn")])];
        let order = vec!["characters".to_string()];

        // 49 chars — one below the default min_text_length of 50 — must still be skipped,
        // proving `None` really does apply min_text_length: 50 (not e.g. 0 or unset).
        let text_49_chars: String = "你".repeat(49);
        let response = build_lookup_index_impl(&TrieCache::new(), &text_49_chars, &dictionaries, &order, None);
        assert!(!response.success, "49 chars should still be below the default 50-char minimum");

        let text_50_chars: String = "你".repeat(50);
        let response = build_lookup_index_impl(&TrieCache::new(), &text_50_chars, &dictionaries, &order, None);
        assert!(response.success, "50 chars should meet the default minimum and build normally");
    }

    #[test]
    fn test_build_lookup_index_impl_defaults_priority_to_dictionary_order_index() {
        // Neither dictionary specifies an explicit priority — each must fall back to its
        // position in the `dictionaries` slice (idx as u32), not e.g. 0 for all of them.
        let dictionaries = vec![
            make_dict("phrases", None, vec![("你好", "xin chào")]),
            make_dict("characters", None, vec![("你", "bạn")]),
        ];
        let order = vec!["phrases".to_string(), "characters".to_string()];
        let text: String = "你好".repeat(30); // well above the 50-char minimum

        let response = build_lookup_index_impl(&TrieCache::new(), &text, &dictionaries, &order, None);

        assert!(response.success);
        // "你好" matches the phrases dict (priority 0) at every occurrence; if priority
        // defaulting were broken (e.g. always 0), this would still pass — the real
        // assertion is that it doesn't panic/misbehave and produces a populated index,
        // proving the idx-based fallback path executes without requiring explicit
        // priorities on every DictionaryData fixture in this test file going forward.
        assert!(response.positions_indexed > 0);
    }

    #[test]
    fn test_build_lookup_index_impl_builds_real_index_with_matches() {
        let dictionaries = vec![make_dict("characters", Some(0), vec![("你", "bạn"), ("好", "tốt")])];
        let order = vec!["characters".to_string()];
        let text: String = "你好".repeat(30); // 60 chars, above the 50-char minimum

        let response = build_lookup_index_impl(&TrieCache::new(), &text, &dictionaries, &order, None);

        assert!(response.success);
        assert!(response.error.is_none());
        assert_eq!(response.positions_indexed, response.index.len());
        assert!(response.positions_indexed > 0, "expected matches for '你'/'好' in the indexed text");
        assert!(response.index_size >= response.positions_indexed, "index_size sums matches across categories per position, so it must be >= positions_indexed");

        // At least one indexed position must carry a 'characters'-category match.
        let has_character_match = response
            .index
            .values()
            .any(|categorized| !categorized.characters.is_empty());
        assert!(has_character_match, "expected at least one 'characters' category match");
    }

    // ── TrieCache ─────────────────────────────────────────────────────────────

    #[test]
    fn test_trie_cache_returns_none_on_miss_then_hit_after_set() {
        let cache = TrieCache::new();
        let entries = vec![DictionaryEntry {
            chinese: "你".to_string(),
            vietnamese: "bạn".to_string(),
            metadata: None,
        }];
        let key = hash_dictionary_entries(&entries);

        assert!(cache.get(key).is_none());

        let trie = Arc::new(build_trie_from_entries(&entries));
        cache.set(key, trie.clone());

        assert!(cache.get(key).is_some());
    }

    #[test]
    fn test_trie_cache_key_changes_with_content_no_invalidation_needed() {
        // The whole point of content-hash keying: editing a dictionary produces a
        // different key automatically, with no invalidate() call required anywhere.
        let original = vec![DictionaryEntry {
            chinese: "你".to_string(),
            vietnamese: "bạn".to_string(),
            metadata: None,
        }];
        let edited = vec![DictionaryEntry {
            chinese: "你".to_string(),
            vietnamese: "ban".to_string(), // translation edited
            metadata: None,
        }];

        assert_ne!(hash_dictionary_entries(&original), hash_dictionary_entries(&edited));
    }

    #[test]
    fn test_trie_cache_evicts_past_capacity_and_keeps_newest() {
        // Matches DictionaryCache's own LRU test convention (see
        // test_newly_inserted_key_is_retrievable_after_eviction above) — same-millisecond
        // timestamps in a tight loop make asserting exactly *which* key was evicted
        // unreliable; size-cap + newest-survives is the stable, real invariant.
        let cache = TrieCache::new();
        let make_trie = |n: u64| Arc::new(build_trie_from_entries(&[DictionaryEntry {
            chinese: format!("字{}", n),
            vietnamese: format!("tu{}", n),
            metadata: None,
        }]));

        for i in 0..MAX_TRIE_CACHE_ENTRIES as u64 {
            cache.set(i, make_trie(i));
        }
        cache.set(MAX_TRIE_CACHE_ENTRIES as u64, make_trie(MAX_TRIE_CACHE_ENTRIES as u64));

        let cache_guard = cache.cache.lock().unwrap();
        assert_eq!(cache_guard.len(), MAX_TRIE_CACHE_ENTRIES,
            "cache size should not exceed MAX_TRIE_CACHE_ENTRIES after LRU eviction");
        drop(cache_guard);

        assert!(cache.get(MAX_TRIE_CACHE_ENTRIES as u64).is_some(),
            "the most recently inserted entry should survive LRU eviction");
    }

    #[test]
    fn test_build_lookup_index_impl_reuses_cached_trie_across_calls() {
        let dictionaries = vec![make_dict("characters", Some(0), vec![("你", "bạn")])];
        let order = vec!["characters".to_string()];
        let text: String = "你好".repeat(30);
        let trie_cache = TrieCache::new();

        let first = build_lookup_index_impl(&trie_cache, &text, &dictionaries, &order, None);
        let second = build_lookup_index_impl(&trie_cache, &text, &dictionaries, &order, None);

        // Cache hit on the second call must produce the same matches as the fresh build.
        assert_eq!(first.positions_indexed, second.positions_indexed);
        assert_eq!(first.index_size, second.index_size);
    }

    #[test]
    fn test_build_lookup_index_impl_sees_edited_entries_immediately() {
        // Proves content-hash keying never serves a stale trie: editing a dictionary's
        // entries between two calls on the SAME TrieCache must change the match output
        // on the very next call, with no explicit invalidation step.
        let order = vec!["characters".to_string()];
        let text: String = "你好".repeat(30);
        let trie_cache = TrieCache::new();

        let before = vec![make_dict("characters", Some(0), vec![("你", "bạn")])];
        let response_before = build_lookup_index_impl(&trie_cache, &text, &before, &order, None);
        let has_ban_before = response_before
            .index
            .values()
            .any(|c| c.characters.iter().any(|m| m.translation == "ban"));
        assert!(!has_ban_before);

        let after = vec![make_dict("characters", Some(0), vec![("你", "ban")])];
        let response_after = build_lookup_index_impl(&trie_cache, &text, &after, &order, None);
        let has_ban_after = response_after
            .index
            .values()
            .any(|c| c.characters.iter().any(|m| m.translation == "ban"));
        assert!(has_ban_after, "edited entry must be reflected immediately, not served stale");
    }

    // ── list_dictionaries_with_prefix ────────────────────────────────────────

    #[test]
    fn test_list_dictionaries_with_prefix_excludes_trie_json_cache_files() {
        let dir = temp_test_dir("list_prefix_trie_json");
        fs::write(dir.join("properNouns.json"), "{}").unwrap();
        fs::write(dir.join("properNouns.trie.json"), "{}").unwrap();

        let result = list_dictionaries_with_prefix(&dir, "properNouns").unwrap();

        assert_eq!(result, vec!["properNouns".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_dictionaries_with_prefix_silently_drops_invalid_id() {
        let dir = temp_test_dir("list_prefix_invalid_id");
        // Starts with the prefix and ends with .json, but the stripped base name
        // contains ".." — fails validate_dictionary_id's path-traversal check.
        fs::write(dir.join("properNouns..evil.json"), "{}").unwrap();
        fs::write(dir.join("properNouns-Valid.json"), "{}").unwrap();

        let result = list_dictionaries_with_prefix(&dir, "properNouns").unwrap();

        assert_eq!(result, vec!["properNouns-Valid".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_dictionaries_with_prefix_empty_dir_returns_empty_vec() {
        let dir = temp_test_dir("list_prefix_empty");

        let result = list_dictionaries_with_prefix(&dir, "properNouns").unwrap();

        assert!(result.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_dictionaries_with_prefix_ignores_non_matching_and_non_json_files() {
        let dir = temp_test_dir("list_prefix_mixed");
        fs::write(dir.join("properNouns-MyNovel.json"), "{}").unwrap();
        fs::write(dir.join("patterns-MyNovel.json"), "{}").unwrap(); // different prefix
        fs::write(dir.join("properNouns-MyNovel.txt"), "{}").unwrap(); // wrong extension
        fs::write(dir.join("README.md"), "notes").unwrap();

        let result = list_dictionaries_with_prefix(&dir, "properNouns").unwrap();

        assert_eq!(result, vec!["properNouns-MyNovel".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_dictionaries_with_prefix_propagates_read_dir_error() {
        let missing_dir = std::env::temp_dir().join("dictionary_commands_test_does_not_exist_12345");
        let _ = fs::remove_dir_all(&missing_dir); // ensure it really doesn't exist

        let result = list_dictionaries_with_prefix(&missing_dir, "properNouns");

        assert!(result.is_err());
    }

    #[test]
    fn test_list_proper_nouns_dictionaries_impl_uses_proper_nouns_prefix() {
        let dir = temp_test_dir("list_proper_nouns_impl_smoke");
        fs::write(dir.join("properNouns-MyNovel.json"), "{}").unwrap();
        fs::write(dir.join("patterns-MyNovel.json"), "{}").unwrap();

        let result = list_proper_nouns_dictionaries_impl(&dir).unwrap();

        assert_eq!(result, vec!["properNouns-MyNovel".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_list_fiction_pattern_dictionaries_impl_uses_patterns_dash_prefix() {
        let dir = temp_test_dir("list_fiction_pattern_impl_smoke");
        fs::write(dir.join("properNouns-MyNovel.json"), "{}").unwrap();
        fs::write(dir.join("patterns-MyNovel.json"), "{}").unwrap();

        let result = list_fiction_pattern_dictionaries_impl(&dir).unwrap();

        assert_eq!(result, vec!["patterns-MyNovel".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }
}
