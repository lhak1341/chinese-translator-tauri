// WASM Translation DISABLED
// Phase 6 & 7 WASM translation acceleration removed due to:
// - Dictionary lookups returning 0 matches
// - Pattern matching integration issues
// - Better reliability with pure JavaScript implementation
//
// This WASM module is kept for potential future use but is not currently
// used by the translation engine. The app uses pure JavaScript translation.
// Tauri Rust backend (file I/O, parallel loading) remains active and working.

mod trie;

use wasm_bindgen::prelude::*;
use trie::TrieNode;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

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
    total_lookups: u32,
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

    #[wasm_bindgen]
    pub fn load_dictionary(&mut self, name: &str, entries: JsValue) -> Result<bool, JsValue> {
        // Parse JavaScript dictionary entries
        let entries: Vec<DictionaryEntry> = serde_wasm_bindgen::from_value(entries)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse dictionary entries: {}", e)))?;
        
        // Check memory limit before loading
        let estimated_size = self.estimate_dictionary_size(&entries);
        if estimated_size > self.memory_limit_mb * 1024 * 1024 {
            return Err(JsValue::from_str(&format!(
                "Dictionary '{}' estimated size ({}MB) exceeds limit ({}MB)",
                name,
                estimated_size / (1024 * 1024),
                self.memory_limit_mb
            )));
        }
        
        let mut trie = TrieNode::new();
        
        // Calculate checksum for integrity verification
        let mut checksum = 0u64;
        for entry in &entries {
            trie.insert(
                &entry.chinese,
                entry.vietnamese.clone(),
                entry.metadata.clone(),
            );
            
            // Simple checksum calculation
            checksum = checksum.wrapping_add(entry.chinese.len() as u64);
            checksum = checksum.wrapping_add(entry.vietnamese.len() as u64);
        }
        
        let entry_count = trie.get_entry_count();
        
        // Create versioned dictionary
        let version_id = js_sys::Date::now() as u64; // Use timestamp as version
        let version = DictionaryVersion {
            version: version_id,
            timestamp: version_id,
            entry_count,
            checksum,
        };
        
        let versioned_dict = VersionedDictionary {
            trie,
            version,
        };
        
        // Update memory usage tracking
        self.performance_stats.memory_usage_bytes += estimated_size;
        
        // Verify we're still within memory limits after loading
        if !self.performance_stats.check_memory_limit() {
            web_sys::console::warn_1(&format!(
                "⚠️ Memory usage ({:.1}MB) exceeded limit ({:.1}MB) for dictionary '{}'",
                self.performance_stats.memory_usage_bytes as f64 / (1024.0 * 1024.0),
                self.performance_stats.memory_limit_bytes as f64 / (1024.0 * 1024.0),
                name
            ).into());
        }
        
        self.total_entries += entry_count;
        self.dictionaries.insert(name.to_string(), versioned_dict);
        web_sys::console::log_1(&format!(
            "📚 Loaded dictionary '{}': {} entries (v{}, {}KB)",
            name,
            entry_count,
            version_id,
            estimated_size / 1024
        ).into());
        
        Ok(true)
    }
    
    // Helper method to estimate dictionary memory usage
    fn estimate_dictionary_size(&self, entries: &[DictionaryEntry]) -> usize {
        let mut size = 0;
        for entry in entries {
            // Estimate: each character ~4 bytes (UTF-8), plus trie node overhead
            size += entry.chinese.len() * 4;
            size += entry.vietnamese.len() * 4;
            size += entry.metadata.as_ref().map(|m| m.len() * 2).unwrap_or(0);
            size += 64; // Estimated trie node overhead
        }
        size
    }

    #[wasm_bindgen]
    pub fn find_matches(&mut self, dictionary_name: &str, text: &str, start_pos: usize) -> JsValue {
        let start_time = js_sys::Date::now();
        
        let matches = match self.dictionaries.get(dictionary_name) {
            Some(versioned_dict) => versioned_dict.trie.find_matches(text, start_pos),
            None => {
                web_sys::console::warn_1(&format!(
                    "Dictionary '{}' not found",
                    dictionary_name
                ).into());
                Vec::new()
            }
        };
        
        let elapsed_ms = js_sys::Date::now() - start_time;
        self.performance_stats.record_lookup(elapsed_ms);
        
        serde_wasm_bindgen::to_value(&matches).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn find_longest_match(&mut self, dictionary_name: &str, text: &str, start_pos: usize) -> JsValue {
        let start_time = js_sys::Date::now();
        
        let longest_match = match self.dictionaries.get(dictionary_name) {
            Some(versioned_dict) => versioned_dict.trie.find_longest_match(text, start_pos),
            None => {
                web_sys::console::warn_1(&format!(
                    "Dictionary '{}' not found",
                    dictionary_name
                ).into());
                None
            }
        };
        
        let elapsed_ms = js_sys::Date::now() - start_time;
        self.performance_stats.record_lookup(elapsed_ms);
        
        serde_wasm_bindgen::to_value(&longest_match).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn get_dictionary_count(&self) -> usize {
        self.dictionaries.len()
    }

    #[wasm_bindgen]
    pub fn get_total_entries(&self) -> usize {
        self.total_entries
    }

    #[wasm_bindgen]
    pub fn get_performance_stats(&self) -> JsValue {
        let stats = serde_json::json!({
            "totalLookups": self.performance_stats.total_lookups,
            "totalTimeMs": self.performance_stats.total_time_ms,
            "averageTimeMs": self.performance_stats.average_time_ms(),
            "memoryUsageBytes": self.performance_stats.memory_usage_bytes,
            "dictionariesLoaded": self.dictionaries.len(),
            "totalEntries": self.total_entries
        });
        
        serde_wasm_bindgen::to_value(&stats).unwrap_or(JsValue::NULL)
    }

    #[wasm_bindgen]
    pub fn clear_all_dictionaries(&mut self) {
        self.dictionaries.clear();
        self.total_entries = 0;
        web_sys::console::log_1(&"🗑️ All dictionaries cleared".into());
    }

    #[wasm_bindgen]
    pub fn has_dictionary(&self, name: &str) -> bool {
        self.dictionaries.contains_key(name)
    }

    #[wasm_bindgen]
    pub fn get_dictionary_version(&self, name: &str) -> JsValue {
        match self.dictionaries.get(name) {
            Some(versioned_dict) => {
                serde_wasm_bindgen::to_value(&versioned_dict.version).unwrap_or(JsValue::NULL)
            }
            None => JsValue::NULL
        }
    }

    #[wasm_bindgen]
    pub fn reload_dictionary(&mut self, name: &str, entries: JsValue) -> Result<bool, JsValue> {
        // Remove old dictionary first to free memory
        if let Some(old_dict) = self.dictionaries.remove(name) {
            // Estimate old size for memory tracking
            let old_size = old_dict.version.entry_count * 200; // Rough estimate
            self.performance_stats.memory_usage_bytes = 
                self.performance_stats.memory_usage_bytes.saturating_sub(old_size);
            self.total_entries = self.total_entries.saturating_sub(old_dict.version.entry_count);
            
            web_sys::console::log_1(&format!(
                "🗑️ Removed old dictionary '{}' (v{})", 
                name, 
                old_dict.version.version
            ).into());
        }

        // Load new dictionary
        self.load_dictionary(name, entries)
    }

    #[wasm_bindgen]
    pub fn get_memory_usage(&self) -> usize {
        self.performance_stats.memory_usage_bytes
    }

    #[wasm_bindgen]
    pub fn get_memory_limit(&self) -> usize {
        self.performance_stats.memory_limit_bytes
    }

    #[wasm_bindgen]
    pub fn check_memory_health(&self) -> JsValue {
        let usage_percent = if self.performance_stats.memory_limit_bytes > 0 {
            (self.performance_stats.memory_usage_bytes as f64 / 
             self.performance_stats.memory_limit_bytes as f64) * 100.0
        } else {
            0.0
        };

        let is_within_limit = self.performance_stats.check_memory_limit();
        let health_info = serde_json::json!({
            "memoryUsageBytes": self.performance_stats.memory_usage_bytes,
            "memoryLimitBytes": self.performance_stats.memory_limit_bytes,
            "usagePercent": usage_percent,
            "isHealthy": usage_percent < 80.0 && is_within_limit,
            "withinMemoryLimit": is_within_limit,
            "dictionariesLoaded": self.dictionaries.len(),
            "totalEntries": self.total_entries
        });

        serde_wasm_bindgen::to_value(&health_info).unwrap_or(JsValue::NULL)
    }
}

// Enhanced Dictionary Manager removed - used deleted dictionary module

// EnhancedDictionaryManager and PatternManager removed - depended on deleted modules
// (cache.rs, dictionary.rs, pattern_*.rs, etc.)
