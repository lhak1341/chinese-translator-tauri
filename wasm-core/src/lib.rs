// WASM Translation Acceleration - ACTIVE
//
// This module provides WASM-accelerated translation features:
//
// ✅ ACTIVE SYSTEMS:
// 1. NumberProcessor - Chinese number conversion (5-10x speedup)
//    - Stateless, deterministic number conversion
//    - Simple I/O boundaries, easy to test
//    - Converts: 三千万 → "3,000 vạn", 百分之三十 → "30%"
//
// 2. DictionaryEngine - Dictionary lookup acceleration
//    - Trie-based dictionary lookups
//    - Loads 7 dictionaries with 27,000+ entries
//    - Used by EnhancedDictionaryManager via WasmDictionaryManager wrapper
//    - Provides faster lookups than pure JavaScript tries
//
// 3. PositionMapper - Boyer-Moore-Horspool string search (3-5x speedup)
//    - Efficient string position finding for semantic arrays
//    - O(n/m) average case vs O(n) JavaScript indexOf
//    - Used in setPositionByMatch for clickable highlighting
//
// ❌ REMOVED SYSTEMS:
// - Full translation pipeline (Phase 6-7) - Removed due to complexity/reliability issues
// - See WASM_REMOVAL_MIGRATION_GUIDE.md for historical context
//
// Architecture: Focused WASM features with JavaScript fallbacks
// See: WASM_RUST_SYSTEMS_MAP.md for complete system documentation

mod trie;
pub mod number_processor;
pub mod pattern_processor;
pub mod text_tokenizer;
pub mod position_mapper;
pub mod string_processor;
pub mod regex_utils;
pub mod text_assembly;
pub mod text_chunker;
pub mod conflict_resolution;

#[cfg(test)]
mod content_hash_test;

// Re-export WASM wrappers for JavaScript
pub use pattern_processor::wasm_wrapper::WasmPatternProcessor;
pub use text_tokenizer::{tokenize_text, get_tokenizer_stats};
pub use position_mapper::PositionMapper;
pub use string_processor::StringProcessor;
pub use regex_utils::RegexUtils;
pub use text_assembly::TextAssembler;
pub use text_chunker::TextChunker;

use wasm_bindgen::prelude::*;
use trie::TrieNode;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

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

        let versioned_dict = Self::build_versioned_dictionary(&entries);
        let entry_count = versioned_dict.version.entry_count;

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

            if self.performance_stats.memory_usage_bytes + estimated_size
                > self.performance_stats.memory_limit_bytes
            {
                failed_dictionaries.push(dict.name.clone());
                continue;
            }

            let versioned_dict = Self::build_versioned_dictionary(&dict.entries);
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
    fn build_versioned_dictionary(entries: &[DictionaryEntry]) -> VersionedDictionary {
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
        VersionedDictionary { trie, version }
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
        if let Some(old_dict) = self.dictionaries.remove(name) {
            let old_size = old_dict.version.entry_count * 200;
            self.performance_stats.memory_usage_bytes =
                self.performance_stats.memory_usage_bytes.saturating_sub(old_size);
            self.total_entries = self.total_entries.saturating_sub(old_dict.version.entry_count);
        }

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

/**
 * WASM Batch Text Normalization
 *
 * Provides 2-5x speedup over JavaScript normalization by:
 * - Batch operations reduce WASM boundary crossings
 * - `unicode-normalization` crate is highly optimized
 * - NFC normalization ensures consistent Unicode representation
 *
 * Used for:
 * - Dictionary entry normalization
 * - Semantic array text normalization
 * - Pattern matching text preprocessing
 */

/// Normalize a batch of texts to NFC (Canonical Composition)
///
/// Takes an array of strings and returns an array of NFC-normalized strings.
/// This is more efficient than calling normalize() for each string individually
/// because it reduces WASM boundary crossings.
///
/// # Arguments
/// * `texts` - JavaScript array of strings to normalize
///
/// # Returns
/// * `Result<JsValue, JsValue>` - JavaScript array of normalized strings or error
///
/// # Example
/// ```javascript
/// const texts = ['café', '北京', 'Москва'];
/// const normalized = normalize_batch(texts);
/// // Returns: ['café', '北京', 'Москва'] (NFC normalized)
/// ```
/// JS interop contract: `texts_json` is `JSON.stringify(textsArray)`;
/// return value is a JSON string — caller: `JSON.parse(normalizeBatch(JSON.stringify(texts)))`.
#[wasm_bindgen(js_name = normalizeBatch)]
pub fn normalize_batch(texts_json: &str) -> Result<String, JsValue> {
    let texts: Vec<String> = serde_json::from_str(texts_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to deserialize texts: {}", e)))?;

    let normalized: Vec<String> = texts
        .into_iter()
        .map(|s| s.nfc().collect::<String>())
        .collect();

    serde_json::to_string(&normalized)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize normalized texts: {}", e)))
}

/// Normalize a single text to NFC (Canonical Composition)
///
/// Convenience function for normalizing a single string.
///
/// # Arguments
/// * `text` - String to normalize
///
/// # Returns
/// * `String` - NFC-normalized string
///
/// # Example
/// ```javascript
/// const text = 'café';
/// const normalized = normalizeSingle(text);
/// // Returns: 'café' (NFC normalized)
/// ```
#[wasm_bindgen(js_name = normalizeSingle)]
pub fn normalize_single(text: &str) -> String {
    text.nfc().collect::<String>()
}

/// Generate fast content hash for cache keys
///
/// Uses FNV-1a-like hash algorithm for speed and collision resistance.
/// Performance: 2-3x faster than JavaScript implementation
///
/// # Arguments
/// * `text` - String to hash
///
/// # Returns
/// * `String` - Base-36 encoded hash (lowercase alphanumeric)
///
/// # Example
/// ```javascript
/// const hash = generateContentHash('Hello World');
/// // Returns: something like "1a2b3c4d"
/// ```
#[wasm_bindgen(js_name = generateContentHash)]
pub fn generate_content_hash(text: &str) -> String {
    let mut hash: i32 = 0;

    for ch in text.chars() {
        let char_code = ch as i32;
        hash = (hash << 5).wrapping_sub(hash).wrapping_add(char_code);
    }

    // Convert to base-36 (JavaScript .toString(36) equivalent)
    // wrapping_abs avoids panic on i32::MIN in debug builds
    let abs_hash = hash.wrapping_abs() as u32;
    base36_encode(abs_hash)
}

/// Encode a number to base-36 string (0-9, a-z)
fn base36_encode(mut num: u32) -> String {
    if num == 0 {
        return "0".to_string();
    }

    const CHARS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut result = Vec::new();

    while num > 0 {
        result.push(CHARS[(num % 36) as usize]);
        num /= 36;
    }

    result.reverse();
    String::from_utf8(result).unwrap()
}
