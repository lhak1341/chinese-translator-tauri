// WASM Translation Acceleration - ACTIVE
//
// This module provides WASM-accelerated translation features:
//
// ✅ ACTIVE SYSTEMS:
// 1. NumberProcessor - Rust-side parity spec for JS NumberProcessor.js
//    - No WASM export (#[wasm_bindgen] intentionally removed, see wasm-core/CLAUDE.md)
//    - 155 tests validate parity against the JS implementation, which runs in production
//    - Converts: 三千万 → "3,000 vạn", 百分之三十 → "30%"
//
// 2. DictionaryEngine - Dictionary lookup acceleration
//    - Trie-based dictionary lookups
//    - Loads 7 dictionaries with 27,000+ entries
//    - Used by EnhancedDictionaryManager via WasmDictionaryManager wrapper
//    - Provides faster lookups than pure JavaScript tries
//
// ❌ REMOVED SYSTEMS:
// - Full translation pipeline (Phase 6-7) - Removed due to complexity/reliability issues
// - See WASM_REMOVAL_MIGRATION_GUIDE.md for historical context
//
// Architecture: Focused WASM features with JavaScript fallbacks
// See: WASM_RUST_SYSTEMS_MAP.md for complete system documentation

pub mod trie;
pub mod number_processor;
pub mod pattern_processor;
pub mod text_tokenizer;
pub mod string_processor;
pub mod text_assembly;
pub mod text_chunker;
pub mod conflict_resolution;

// Re-export WASM wrappers for JavaScript
pub use pattern_processor::wasm_wrapper::WasmPatternProcessor;
pub use text_tokenizer::tokenize_text;
pub use string_processor::StringProcessor;
pub use text_assembly::TextAssembler;
pub use text_chunker::TextChunker;

use wasm_bindgen::prelude::*;
use trie::TrieNode;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// Shared entry-count cap — mirrors MAX_DICTIONARY_ENTRIES in the Tauri backend.
const MAX_DICTIONARY_ENTRIES: usize = 50_000;

// Enable better error messages in debug mode
pub use console_error_panic_hook::set_once as set_panic_hook;

// Define types for JavaScript interop
#[derive(Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub chinese: String,
    pub vietnamese: String,
    pub metadata: Option<String>,
}

#[wasm_bindgen]
pub struct DictionaryEngine {
    dictionaries: HashMap<String, VersionedDictionary>,
    total_entries: usize,
    performance_stats: PerformanceStats,
    memory_limit_mb: usize,
}

#[derive(Debug, Clone)]
struct PerformanceStats {
    total_lookups: u64, // u64 prevents silent wrap-around in long sessions (u32 overflows after ~4B lookups)
    total_time_ms: f64,
    memory_usage_bytes: usize,
    memory_limit_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryVersion {
    pub version: u64,
    pub timestamp: u64,
    pub entry_count: usize,
    pub checksum: u64,
}

struct VersionedDictionary {
    trie: TrieNode,
    version: DictionaryVersion,
    /// What this dictionary added to `PerformanceStats::memory_usage_bytes` when it was
    /// inserted. Kept so replacing it can subtract exactly what it contributed rather than
    /// re-deriving an estimate from entries that have already been consumed into the trie.
    estimated_size: usize,
}


impl PerformanceStats {
    fn new(memory_limit_mb: usize) -> Self {
        Self {
            total_lookups: 0,
            total_time_ms: 0.0,
            memory_usage_bytes: 0,
            memory_limit_bytes: memory_limit_mb * 1024 * 1024,
        }
    }
    
    fn check_memory_limit(&self) -> bool {
        self.memory_usage_bytes <= self.memory_limit_bytes
    }

    fn record_lookup(&mut self, time_ms: f64) {
        self.total_lookups += 1;
        self.total_time_ms += time_ms;
    }

    fn average_time_ms(&self) -> f64 {
        if self.total_lookups == 0 {
            0.0
        } else {
            self.total_time_ms / (self.total_lookups as f64)
        }
    }
}

#[wasm_bindgen]
impl DictionaryEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> DictionaryEngine {
        // Set up better error messages for debugging
        console_error_panic_hook::set_once();
        
        // Default memory limit: 15MB per dictionary (matches existing system)
        let memory_limit_mb = 15;
        
        // Log initialization
        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&format!(
            "🦀 WASM Dictionary Engine initialized (Memory limit: {}MB)",
            memory_limit_mb
        ).into());
        
        DictionaryEngine {
            dictionaries: HashMap::new(),
            total_entries: 0,
            performance_stats: PerformanceStats::new(memory_limit_mb),
            memory_limit_mb,
        }
    }

    #[wasm_bindgen]
    pub fn new_with_config(memory_limit_mb: usize) -> DictionaryEngine {
        console_error_panic_hook::set_once();
        
        #[cfg(target_arch = "wasm32")]
        web_sys::console::log_1(&format!(
            "🦀 WASM Dictionary Engine initialized with custom config (Memory limit: {}MB)",
            memory_limit_mb
        ).into());
        
        DictionaryEngine {
            dictionaries: HashMap::new(),
            total_entries: 0,
            performance_stats: PerformanceStats::new(memory_limit_mb),
            memory_limit_mb,
        }
    }

    /// JS interop contract: `entries_json` is a JSON string (`JSON.stringify(wasmEntries)`).
    /// Pure Rust deserialization — zero JS interop while RcRefMut<DictionaryEngine> borrow is live.
    #[wasm_bindgen]
    pub fn load_dictionary(&mut self, name: &str, entries_json: &str) -> Result<bool, JsValue> {
        let entries: Vec<DictionaryEntry> = serde_json::from_str(entries_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse dictionary entries: {}", e)))?;

        // SECURITY: Entry-count cap — mirrors the Tauri backend limit.
        // The backend enforces this before sending data to JS, but the WASM engine
        // is callable directly from JS (dev tools, tests), so we defend here too.
        if entries.len() > MAX_DICTIONARY_ENTRIES {
            return Err(JsValue::from_str(&format!(
                "Dictionary '{}' too large: {} entries (max: {})",
                name, entries.len(), MAX_DICTIONARY_ENTRIES
            )));
        }

        let estimated_size = self.estimate_dictionary_size(&entries);
        if estimated_size > self.memory_limit_mb * 1024 * 1024 {
            return Err(JsValue::from_str(&format!(
                "Dictionary '{}' estimated size ({}MB) exceeds limit ({}MB)",
                name,
                estimated_size / (1024 * 1024),
                self.memory_limit_mb
            )));
        }

        let versioned_dict = Self::build_versioned_dictionary(&entries, estimated_size);
        let entry_count = versioned_dict.version.entry_count;

        self.untrack_dictionary(name);
        self.performance_stats.memory_usage_bytes += estimated_size;
        self.total_entries += entry_count;
        self.dictionaries.insert(name.to_string(), versioned_dict);

        Ok(true)
    }
    
    /// Load multiple dictionaries in a single batch operation.
    ///
    /// JS interop contract: `batch_data_json` is a JSON string (`JSON.stringify(batchData)`).
    /// Pure Rust deserialization — zero JS interop while RcRefMut<DictionaryEngine> borrow is live.
    #[wasm_bindgen]
    pub fn load_dictionaries_batch(&mut self, batch_data_json: &str) -> Result<bool, JsValue> {
        #[derive(serde::Deserialize)]
        struct BatchDictionary {
            name: String,
            entries: Vec<DictionaryEntry>,
        }

        let batch: Vec<BatchDictionary> = serde_json::from_str(batch_data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse batch data: {}", e)))?;

        let mut loaded_count = 0;
        let mut failed_dictionaries = Vec::new();

        for dict in &batch {
            // SECURITY: Entry-count cap (same limit as Tauri backend and load_dictionary).
            if dict.entries.len() > MAX_DICTIONARY_ENTRIES {
                failed_dictionaries.push(dict.name.clone());
                continue;
            }

            let estimated_size = self.estimate_dictionary_size(&dict.entries);

            // Untracked first, so the headroom check sees the total *without* the copy this
            // load replaces. Checking before untracking makes a re-sync of an unchanged
            // dictionary look like it needs twice the room it actually does.
            self.untrack_dictionary(&dict.name);

            if self.performance_stats.memory_usage_bytes + estimated_size
                > self.performance_stats.memory_limit_bytes
            {
                failed_dictionaries.push(dict.name.clone());
                continue;
            }

            let versioned_dict = Self::build_versioned_dictionary(&dict.entries, estimated_size);
            let entry_count = versioned_dict.version.entry_count;

            self.performance_stats.memory_usage_bytes += estimated_size;
            self.total_entries += entry_count;
            self.dictionaries.insert(dict.name.clone(), versioned_dict);

            loaded_count += 1;
        }

        let _ = failed_dictionaries; // retained for future error reporting
        Ok(loaded_count == batch.len())
    }

    /// Build a VersionedDictionary from a slice of entries.
    /// Shared by load_dictionary and load_dictionaries_batch to eliminate duplicated
    /// trie-build + checksum + versioning logic.
    fn build_versioned_dictionary(
        entries: &[DictionaryEntry],
        estimated_size: usize,
    ) -> VersionedDictionary {
        let mut trie = TrieNode::new();
        let mut checksum = 0u64;
        for entry in entries {
            trie.insert(&entry.chinese, entry.vietnamese.clone(), entry.metadata.clone());
            checksum = checksum.wrapping_add(entry.chinese.chars().count() as u64);
            checksum = checksum.wrapping_add(entry.vietnamese.chars().count() as u64);
        }
        let entry_count = trie.get_entry_count();
        // Use content checksum as version ID — no JS FFI call while Rc borrow may be live.
        let version_id = checksum;
        let version = DictionaryVersion {
            version: version_id,
            timestamp: version_id,
            entry_count,
            checksum,
        };
        VersionedDictionary { trie, version, estimated_size }
    }

    /// Drop a dictionary's contribution to the running totals, if it is currently loaded.
    ///
    /// Every insert path replaces whatever `dictionaries` already held under that name, and
    /// the replaced value's accounting has to come back off the totals or they only ever
    /// climb. That mattered: `load_dictionaries_batch` refuses a dictionary once
    /// `memory_usage_bytes + estimated_size` passes the limit, and the JS side re-syncs
    /// every dictionary on every entry add, so an inflated total eventually starts
    /// rejecting loads that fit perfectly well. `get_performance_report`'s `isWithinLimit`
    /// went the same way.
    ///
    /// Call before inserting; `remove` is what makes it idempotent for a fresh name.
    fn untrack_dictionary(&mut self, name: &str) {
        if let Some(previous) = self.dictionaries.remove(name) {
            self.performance_stats.memory_usage_bytes = self
                .performance_stats
                .memory_usage_bytes
                .saturating_sub(previous.estimated_size);
            self.total_entries = self
                .total_entries
                .saturating_sub(previous.version.entry_count);
        }
    }

    // Helper method to estimate dictionary memory usage
    fn estimate_dictionary_size(&self, entries: &[DictionaryEntry]) -> usize {
        let mut size = 0;
        for entry in entries {
            // Estimate: each character ~4 bytes (trie node pointer overhead), plus trie node overhead
            size += entry.chinese.chars().count() * 4;
            size += entry.vietnamese.chars().count() * 4;
            size += entry.metadata.as_ref().map(|m| m.chars().count() * 2).unwrap_or(0);
            size += 64; // Estimated trie node overhead
        }
        size
    }

    // js_sys::Date::now() and serde_wasm_bindgen::to_value call JS FFI while
    // RcRefMut<DictionaryEngine> is live — same Rust 1.84 assert_unchecked / heap
    // corruption class as chunk_text / process_tokens. Return JSON strings instead;
    // JS side: JSON.parse(this.engine.find_matches(...)).
    #[wasm_bindgen]
    pub fn find_matches(&mut self, dictionary_name: &str, text: &str, start_pos: usize) -> String {
        let matches = match self.dictionaries.get(dictionary_name) {
            Some(versioned_dict) => versioned_dict.trie.find_matches(text, start_pos),
            None => Vec::new(),
        };
        // Timing removed: js_sys::Date::now() is JS FFI — unsafe while RcRefMut is live
        self.performance_stats.record_lookup(0.0);
        serde_json::to_string(&matches).unwrap_or_else(|_| "[]".to_string())
    }

    #[wasm_bindgen]
    pub fn find_longest_match(&mut self, dictionary_name: &str, text: &str, start_pos: usize) -> String {
        let longest_match = match self.dictionaries.get(dictionary_name) {
            Some(versioned_dict) => versioned_dict.trie.find_longest_match(text, start_pos),
            None => None,
        };
        self.performance_stats.record_lookup(0.0);
        serde_json::to_string(&longest_match).unwrap_or_else(|_| "null".to_string())
    }

    #[wasm_bindgen]
    pub fn get_dictionary_count(&self) -> usize {
        self.dictionaries.len()
    }

    #[wasm_bindgen]
    pub fn get_total_entries(&self) -> usize {
        self.total_entries
    }

    /// Returns a JSON string — caller: `JSON.parse(engine.get_performance_stats())`.
    #[wasm_bindgen]
    pub fn get_performance_stats(&self) -> String {
        serde_json::json!({
            "totalLookups": self.performance_stats.total_lookups,
            "totalTimeMs": self.performance_stats.total_time_ms,
            "averageTimeMs": self.performance_stats.average_time_ms(),
            "memoryUsageBytes": self.performance_stats.memory_usage_bytes,
            "dictionariesLoaded": self.dictionaries.len(),
            "totalEntries": self.total_entries
        })
        .to_string()
    }

    #[wasm_bindgen]
    pub fn clear_all_dictionaries(&mut self) {
        self.dictionaries.clear();
        self.total_entries = 0;
        self.performance_stats.memory_usage_bytes = 0;
    }

    #[wasm_bindgen]
    pub fn has_dictionary(&self, name: &str) -> bool {
        self.dictionaries.contains_key(name)
    }

    /// Returns a JSON string or "null" — caller: `JSON.parse(engine.get_dictionary_version(name))`.
    #[wasm_bindgen]
    pub fn get_dictionary_version(&self, name: &str) -> String {
        match self.dictionaries.get(name) {
            Some(versioned_dict) => {
                serde_json::to_string(&versioned_dict.version).unwrap_or_else(|_| "null".to_string())
            }
            None => "null".to_string(),
        }
    }

    /// JS interop contract: `entries_json` is a JSON string (`JSON.stringify(wasmEntries)`).
    #[wasm_bindgen]
    pub fn reload_dictionary(&mut self, name: &str, entries_json: &str) -> Result<bool, JsValue> {
        // `load_dictionary` untracks the previous copy itself, by the size it was actually
        // accounted at. This used to subtract `entry_count * 200` instead — a guess
        // unrelated to `estimate_dictionary_size`, so it corrected the totals in the wrong
        // direction as often as the right one.
        self.load_dictionary(name, entries_json)
    }

    #[wasm_bindgen]
    pub fn get_memory_usage(&self) -> usize {
        self.performance_stats.memory_usage_bytes
    }

    #[wasm_bindgen]
    pub fn get_memory_limit(&self) -> usize {
        self.performance_stats.memory_limit_bytes
    }

    /// Returns a JSON string — caller: `JSON.parse(engine.check_memory_health())`.
    #[wasm_bindgen]
    pub fn check_memory_health(&self) -> String {
        let usage_percent = if self.performance_stats.memory_limit_bytes > 0 {
            (self.performance_stats.memory_usage_bytes as f64
                / self.performance_stats.memory_limit_bytes as f64)
                * 100.0
        } else {
            0.0
        };
        let is_within_limit = self.performance_stats.check_memory_limit();
        serde_json::json!({
            "memoryUsageBytes": self.performance_stats.memory_usage_bytes,
            "memoryLimitBytes": self.performance_stats.memory_limit_bytes,
            "usagePercent": usage_percent,
            "isHealthy": usage_percent < 80.0 && is_within_limit,
            "withinMemoryLimit": is_within_limit,
            "dictionariesLoaded": self.dictionaries.len(),
            "totalEntries": self.total_entries
        })
        .to_string()
    }
}

// Enhanced Dictionary Manager removed - used deleted dictionary module

// EnhancedDictionaryManager and PatternManager removed - depended on deleted modules
// (cache.rs, dictionary.rs, pattern_*.rs, etc.)

#[cfg(test)]
mod dictionary_accounting_tests {
    use super::*;

    const ENTRIES: &str = r#"[
        {"chinese":"你好","vietnamese":"xin chào","metadata":null},
        {"chinese":"世界","vietnamese":"thế giới","metadata":null}
    ]"#;

    const LONGER: &str = r#"[
        {"chinese":"你好","vietnamese":"xin chào","metadata":null},
        {"chinese":"世界","vietnamese":"thế giới","metadata":null},
        {"chinese":"天空","vietnamese":"bầu trời","metadata":null}
    ]"#;

    /// The JS side re-syncs every dictionary on every entry add, so the same name is loaded
    /// over and over for the life of the process. Each load replaces the previous trie, so
    /// the totals must replace too — they used to only ever add.
    #[test]
    fn reloading_the_same_dictionary_replaces_its_accounting() {
        let mut engine = DictionaryEngine::new();

        engine.load_dictionary("characters", ENTRIES).unwrap();
        let entries_after_first = engine.get_total_entries();
        let bytes_after_first = engine.get_memory_usage();
        assert_eq!(engine.get_dictionary_count(), 1);

        for _ in 0..20 {
            engine.load_dictionary("characters", ENTRIES).unwrap();
        }

        assert_eq!(engine.get_dictionary_count(), 1);
        assert_eq!(engine.get_total_entries(), entries_after_first);
        assert_eq!(engine.get_memory_usage(), bytes_after_first);
    }

    /// Replacing with a *different* set must still land on that set's own accounting, not
    /// on a difference applied to a stale figure.
    #[test]
    fn replacing_with_a_different_set_accounts_for_the_new_one() {
        let mut engine = DictionaryEngine::new();

        engine.load_dictionary("characters", LONGER).unwrap();
        let longer_entries = engine.get_total_entries();
        let longer_bytes = engine.get_memory_usage();

        engine.load_dictionary("characters", ENTRIES).unwrap();
        assert!(engine.get_total_entries() < longer_entries);
        assert!(engine.get_memory_usage() < longer_bytes);

        engine.load_dictionary("characters", LONGER).unwrap();
        assert_eq!(engine.get_total_entries(), longer_entries);
        assert_eq!(engine.get_memory_usage(), longer_bytes);
    }

    /// Distinct names still accumulate — the subtraction must key on the name being
    /// replaced, not fire on every load.
    #[test]
    fn distinct_dictionaries_still_accumulate() {
        let mut engine = DictionaryEngine::new();

        engine.load_dictionary("characters", ENTRIES).unwrap();
        let one = engine.get_total_entries();
        engine.load_dictionary("phrases", ENTRIES).unwrap();

        assert_eq!(engine.get_dictionary_count(), 2);
        assert_eq!(engine.get_total_entries(), one * 2);
    }

    /// The batch path shares the rule, and its headroom check must not count the copy it is
    /// about to replace — otherwise re-syncing an unchanged dictionary looks like it needs
    /// twice the room it does.
    #[test]
    fn batch_reload_does_not_inflate_totals() {
        let mut engine = DictionaryEngine::new();
        let batch = format!(
            r#"[{{"name":"characters","entries":{}}}]"#,
            ENTRIES
        );

        engine.load_dictionaries_batch(&batch).unwrap();
        let entries_after_first = engine.get_total_entries();
        let bytes_after_first = engine.get_memory_usage();

        for _ in 0..20 {
            engine.load_dictionaries_batch(&batch).unwrap();
        }

        assert_eq!(engine.get_dictionary_count(), 1);
        assert_eq!(engine.get_total_entries(), entries_after_first);
        assert_eq!(engine.get_memory_usage(), bytes_after_first);
    }

    /// `clear_all_dictionaries` is what engine teardown calls; it must zero both counters so
    /// a retired engine leaves nothing behind in the figures.
    #[test]
    fn clearing_zeroes_the_counters() {
        let mut engine = DictionaryEngine::new();
        engine.load_dictionary("characters", ENTRIES).unwrap();
        engine.clear_all_dictionaries();

        assert_eq!(engine.get_dictionary_count(), 0);
        assert_eq!(engine.get_total_entries(), 0);
        assert_eq!(engine.get_memory_usage(), 0);
    }
}
