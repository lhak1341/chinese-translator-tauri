# Rust Trie Dictionary Migration Plan

**Task #4**: Expose Rust Trie to WASM for Dictionaries (Critical #3)
**Status**: HIGH PRIORITY
**Confidence**: 88%
**Expected Impact**: 2-4x speedup for Phase 5, 30-50% memory reduction

---

## Problem Analysis

### Current State: Dual Implementation

**Rust Trie** (`src-tauri/src/lookup_index_engine.rs`):

- ✅ Used for character-only translation mode (bottom-left panel)
- ✅ O(k) HashMap-based trie lookups
- ✅ Handles 27,000+ character entries
- ✅ Proven performance: 6-50x speedup
- ❌ **Only accessible via Tauri backend**

**JavaScript Trie** (`src/utils/EnhancedDictionaryManager.js`):

- ❌ Used for full translation mode (right panel - main use case)
- ❌ O(k \* log(n)) Map-based lookups
- ❌ Higher memory overhead
- ❌ Duplicates Rust functionality

### Performance Impact

**Current** (JavaScript Map trie):

- Lookup complexity: O(k \* log(n)) where k = key length, n = entries
- For 27,000 entries: log(27000) ≈ 15 operations per character
- For 5-char lookup: 5 \* 15 = 75 operations
- Memory: ~50-60MB for 27,000 entries (JavaScript objects overhead)

**Target** (Rust HashMap trie):

- Lookup complexity: O(k) average case
- For 5-char lookup: 5 operations (constant factor)
- **Speedup: 15x per lookup** (75 → 5 operations)
- Memory: ~20-30MB for 27,000 entries (**40-50% reduction**)

**Impact on Phase 5** (Character Dictionary):

- Current: ~20-40ms for 2000-char text
- Target: ~5-15ms for 2000-char text
- **Savings: 15-25ms per translation**

---

## Architecture Decision

### Why Not Port Tauri Code Directly?

The existing `lookup_index_engine.rs` uses Tauri-specific patterns:

```rust
// Tauri command pattern
#[tauri::command]
pub async fn build_lookup_index(...)
```

### Better Approach: Create Shared WASM Module

Create `wasm-core/src/dictionary_trie.rs` that:

1. ✅ Works in both WASM and Tauri contexts
2. ✅ Exposes consistent API
3. ✅ Shares core trie logic between platforms
4. ✅ Enables future code reuse

---

## Implementation Strategy

### Phase 1: Create Shared Trie Module

**File**: `wasm-core/src/dictionary_trie.rs`

```rust
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use js_sys::{Array, Object, Reflect};

/// Dictionary entry for trie
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub chars: String,
    pub translation: String,
    pub priority: Option<u8>,
    pub metadata: Option<String>,
}

/// Trie node for O(k) dictionary lookups
#[derive(Debug, Clone)]
pub struct TrieNode {
    /// Child nodes indexed by character
    pub children: HashMap<char, TrieNode>,

    /// Translation if this node represents end of word
    pub translation: Option<String>,

    /// Entry metadata
    pub metadata: Option<String>,

    /// Priority level (0-10)
    pub priority: u8,

    /// Whether this node marks end of a dictionary entry
    pub is_end: bool,
}

impl TrieNode {
    /// Create new empty trie node
    pub fn new() -> Self {
        TrieNode {
            children: HashMap::new(),
            translation: None,
            metadata: None,
            priority: 5,
            is_end: false,
        }
    }

    /// Insert entry into trie
    pub fn insert(&mut self, chars: &str, entry: DictionaryEntry) {
        let mut current = self;

        for ch in chars.chars() {
            current = current.children
                .entry(ch)
                .or_insert_with(TrieNode::new);
        }

        current.is_end = true;
        current.translation = Some(entry.translation);
        current.metadata = entry.metadata;
        current.priority = entry.priority.unwrap_or(5);
    }

    /// Find longest match starting at given position in text
    pub fn find_longest_match(&self, text: &str, start_pos: usize) -> Option<DictionaryMatch> {
        let chars: Vec<char> = text.chars().collect();

        if start_pos >= chars.len() {
            return None;
        }

        let mut current = self;
        let mut longest_match: Option<DictionaryMatch> = None;
        let mut pos = start_pos;

        while pos < chars.len() {
            let ch = chars[pos];

            match current.children.get(&ch) {
                Some(node) => {
                    pos += 1;
                    current = node;

                    // Update longest match if this node is an end
                    if current.is_end {
                        longest_match = Some(DictionaryMatch {
                            matched_text: chars[start_pos..pos].iter().collect(),
                            translation: current.translation.clone().unwrap_or_default(),
                            length: pos - start_pos,
                            start_pos,
                            end_pos: pos,
                            priority: current.priority,
                            metadata: current.metadata.clone(),
                        });
                    }
                }
                None => break,
            }
        }

        longest_match
    }

    /// Find all matches starting at given position
    pub fn find_all_matches(&self, text: &str, start_pos: usize) -> Vec<DictionaryMatch> {
        let chars: Vec<char> = text.chars().collect();

        if start_pos >= chars.len() {
            return Vec::new();
        }

        let mut matches = Vec::new();
        let mut current = self;
        let mut pos = start_pos;

        while pos < chars.len() {
            let ch = chars[pos];

            match current.children.get(&ch) {
                Some(node) => {
                    pos += 1;
                    current = node;

                    // Collect all matches
                    if current.is_end {
                        matches.push(DictionaryMatch {
                            matched_text: chars[start_pos..pos].iter().collect(),
                            translation: current.translation.clone().unwrap_or_default(),
                            length: pos - start_pos,
                            start_pos,
                            end_pos: pos,
                            priority: current.priority,
                            metadata: current.metadata.clone(),
                        });
                    }
                }
                None => break,
            }
        }

        matches
    }

    /// Get statistics about trie structure
    pub fn get_stats(&self) -> TrieStats {
        let mut stats = TrieStats {
            node_count: 1, // Count self
            entry_count: if self.is_end { 1 } else { 0 },
            total_chars: 0,
            max_depth: 0,
        };

        fn count_recursive(node: &TrieNode, depth: usize, stats: &mut TrieStats) {
            stats.max_depth = stats.max_depth.max(depth);

            for child in node.children.values() {
                stats.node_count += 1;
                stats.total_chars += 1;
                if child.is_end {
                    stats.entry_count += 1;
                }
                count_recursive(child, depth + 1, stats);
            }
        }

        count_recursive(self, 0, &mut stats);
        stats
    }
}

/// Dictionary match result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryMatch {
    pub matched_text: String,
    pub translation: String,
    pub length: usize,
    pub start_pos: usize,
    pub end_pos: usize,
    pub priority: u8,
    pub metadata: Option<String>,
}

/// Trie statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrieStats {
    pub node_count: usize,
    pub entry_count: usize,
    pub total_chars: usize,
    pub max_depth: usize,
}

/// WASM wrapper for dictionary trie
#[wasm_bindgen]
pub struct WasmDictionaryTrie {
    root: TrieNode,
    name: String,
}

#[wasm_bindgen]
impl WasmDictionaryTrie {
    /// Create new dictionary trie
    #[wasm_bindgen(constructor)]
    pub fn new(name: String) -> WasmDictionaryTrie {
        WasmDictionaryTrie {
            root: TrieNode::new(),
            name,
        }
    }

    /// Load dictionary entries into trie
    ///
    /// # Performance
    /// - O(k * n) where k = avg entry length, n = number of entries
    /// - For 27,000 entries: ~10-30ms
    ///
    /// # Arguments
    /// * `entries_array` - JavaScript array of dictionary entries
    ///
    /// # Returns
    /// * Number of entries loaded
    #[wasm_bindgen(js_name = loadEntries)]
    pub fn load_entries(&mut self, entries_array: &Array) -> Result<usize, JsValue> {
        let entry_count = entries_array.length() as usize;

        for i in 0..entry_count {
            let entry_obj = entries_array.get(i as u32);

            // Extract entry fields
            let chars = Reflect::get(&entry_obj, &JsValue::from_str("chars"))?
                .as_string()
                .ok_or_else(|| JsValue::from_str("Missing chars field"))?;

            let translation = Reflect::get(&entry_obj, &JsValue::from_str("translation"))?
                .as_string()
                .ok_or_else(|| JsValue::from_str("Missing translation field"))?;

            let priority = Reflect::get(&entry_obj, &JsValue::from_str("priority"))?
                .as_f64()
                .map(|p| p as u8);

            let metadata = Reflect::get(&entry_obj, &JsValue::from_str("metadata"))?
                .as_string();

            // Insert into trie
            self.root.insert(&chars, DictionaryEntry {
                chars,
                translation,
                priority,
                metadata,
            });
        }

        Ok(entry_count)
    }

    /// Find longest match at position
    ///
    /// # Performance
    /// - O(k) where k = match length
    /// - Typically 5-20 characters
    ///
    /// # Arguments
    /// * `text` - Text to search
    /// * `start_pos` - Starting position (character index, not byte index)
    ///
    /// # Returns
    /// * Match object or null
    #[wasm_bindgen(js_name = findLongestMatch)]
    pub fn find_longest_match(&self, text: &str, start_pos: usize) -> JsValue {
        match self.root.find_longest_match(text, start_pos) {
            Some(m) => {
                let obj = Object::new();
                Reflect::set(&obj, &JsValue::from_str("matchedText"), &JsValue::from_str(&m.matched_text)).unwrap();
                Reflect::set(&obj, &JsValue::from_str("translation"), &JsValue::from_str(&m.translation)).unwrap();
                Reflect::set(&obj, &JsValue::from_str("length"), &JsValue::from(m.length)).unwrap();
                Reflect::set(&obj, &JsValue::from_str("startPos"), &JsValue::from(m.start_pos)).unwrap();
                Reflect::set(&obj, &JsValue::from_str("endPos"), &JsValue::from(m.end_pos)).unwrap();
                Reflect::set(&obj, &JsValue::from_str("priority"), &JsValue::from(m.priority)).unwrap();

                if let Some(metadata) = m.metadata {
                    Reflect::set(&obj, &JsValue::from_str("metadata"), &JsValue::from_str(&metadata)).unwrap();
                }

                obj.into()
            }
            None => JsValue::NULL,
        }
    }

    /// Find all matches at position
    #[wasm_bindgen(js_name = findAllMatches)]
    pub fn find_all_matches(&self, text: &str, start_pos: usize) -> Array {
        let matches = self.root.find_all_matches(text, start_pos);
        let result_array = Array::new_with_length(matches.len() as u32);

        for (i, m) in matches.iter().enumerate() {
            let obj = Object::new();
            Reflect::set(&obj, &JsValue::from_str("matchedText"), &JsValue::from_str(&m.matched_text)).unwrap();
            Reflect::set(&obj, &JsValue::from_str("translation"), &JsValue::from_str(&m.translation)).unwrap();
            Reflect::set(&obj, &JsValue::from_str("length"), &JsValue::from(m.length)).unwrap();
            Reflect::set(&obj, &JsValue::from_str("startPos"), &JsValue::from(m.start_pos)).unwrap();
            Reflect::set(&obj, &JsValue::from_str("endPos"), &JsValue::from(m.end_pos)).unwrap();
            Reflect::set(&obj, &JsValue::from_str("priority"), &JsValue::from(m.priority)).unwrap();

            result_array.set(i as u32, obj.into());
        }

        result_array
    }

    /// Get trie statistics
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> Result<JsValue, JsValue> {
        let stats = self.root.get_stats();

        let obj = Object::new();
        Reflect::set(&obj, &JsValue::from_str("nodeCount"), &JsValue::from(stats.node_count))?;
        Reflect::set(&obj, &JsValue::from_str("entryCount"), &JsValue::from(stats.entry_count))?;
        Reflect::set(&obj, &JsValue::from_str("totalChars"), &JsValue::from(stats.total_chars))?;
        Reflect::set(&obj, &JsValue::from_str("maxDepth"), &JsValue::from(stats.max_depth))?;

        // Estimate memory usage
        let memory_bytes = stats.node_count * 64 + stats.total_chars * 4;
        Reflect::set(&obj, &JsValue::from_str("memoryBytes"), &JsValue::from(memory_bytes))?;

        Ok(obj.into())
    }

    /// Clear trie
    #[wasm_bindgen(js_name = clear)]
    pub fn clear(&mut self) {
        self.root = TrieNode::new();
    }
}
```

### Phase 2: Update wasm-core/src/lib.rs

```rust
mod dictionary_trie;

pub use dictionary_trie::{WasmDictionaryTrie, TrieNode, DictionaryEntry, DictionaryMatch};
```

### Phase 3: JavaScript Integration

**File**: `src/utils/WasmDictionaryTrie.js`

```javascript
import init, { WasmDictionaryTrie } from '../wasm/translation_wasm_core.js';
import { logger } from './logger';

/**
 * High-performance dictionary using Rust trie
 *
 * @class WasmDictionaryTrieManager
 */
export class WasmDictionaryTrieManager {
  constructor() {
    this.tries = new Map(); // Dictionary name → WasmDictionaryTrie
    this.initialized = false;
  }

  async initialize() {
    try {
      await init();
      this.initialized = true;
      logger.log('✅ WASM Dictionary Trie initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize WASM trie:', error);
      return false;
    }
  }

  /**
   * Load dictionary into Rust trie
   *
   * @param {string} name - Dictionary name
   * @param {Array} entries - Dictionary entries
   * @returns {Promise<boolean>} Success status
   */
  async loadDictionary(name, entries) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const trie = new WasmDictionaryTrie(name);
      const count = trie.loadEntries(entries);

      this.tries.set(name, trie);

      const stats = trie.getStats();
      logger.log(
        `📚 Loaded dictionary "${name}": ${count} entries, ${stats.nodeCount} nodes, ${(stats.memoryBytes / 1024).toFixed(1)}KB`
      );

      return true;
    } catch (error) {
      logger.error(`Failed to load dictionary "${name}":`, error);
      return false;
    }
  }

  /**
   * Find longest match using Rust trie (O(k) lookup)
   *
   * @param {string} dictionaryName - Dictionary to search
   * @param {string} text - Text to search
   * @param {number} startPos - Start position
   * @returns {Object|null} Match result
   */
  findLongestMatch(dictionaryName, text, startPos) {
    const trie = this.tries.get(dictionaryName);
    if (!trie) return null;

    return trie.findLongestMatch(text, startPos);
  }

  /**
   * Find all matches at position
   *
   * @param {string} dictionaryName - Dictionary to search
   * @param {string} text - Text to search
   * @param {number} startPos - Start position
   * @returns {Array} Array of matches
   */
  findAllMatches(dictionaryName, text, startPos) {
    const trie = this.tries.get(dictionaryName);
    if (!trie) return [];

    return trie.findAllMatches(text, startPos);
  }

  /**
   * Get statistics for all dictionaries
   *
   * @returns {Object} Dictionary statistics
   */
  getStats() {
    const stats = {};

    for (const [name, trie] of this.tries) {
      stats[name] = trie.getStats();
    }

    return stats;
  }

  /**
   * Clear all dictionaries
   */
  clear() {
    for (const trie of this.tries.values()) {
      trie.clear();
    }
    this.tries.clear();
  }
}

export const wasmDictionaryTrie = new WasmDictionaryTrieManager();
```

---

## Integration with TranslationEngine

**File**: `src/utils/TranslationEngine.js` (Phase 5 updates)

```javascript
import { wasmDictionaryTrie } from './WasmDictionaryTrie.js';

// In Phase 5 character processing:
async processCharacterDictionary(tokens, fullText, options) {
  const useWasm = options.useWasmTrie !== false; // Default: true

  if (useWasm && wasmDictionaryTrie.initialized) {
    // Use Rust trie (2-4x faster)
    return this.processCharacterDictionaryWasm(tokens, fullText);
  } else {
    // Fallback to JavaScript
    return this.processCharacterDictionaryJS(tokens, fullText);
  }
}

async processCharacterDictionaryWasm(tokens, fullText) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Skip already processed
    if (token.translated !== null) continue;

    // Find longest match using Rust trie (O(k) vs O(k*log(n)))
    const match = wasmDictionaryTrie.findLongestMatch(
      'characters',
      fullText,
      token.position
    );

    if (match) {
      token.translated = match.translation;
      token.translationSource = 'wasm_character_dict';
    }
  }
}
```

---

## Expected Impact

**Performance**:

- Phase 5 lookup: O(k \* log(27000)) → O(k) = **15x faster per lookup**
- For 2000-char text: 20-40ms → 5-15ms = **15-25ms savings**
- Memory: 50-60MB → 20-30MB = **40-50% reduction**

**System-wide**:

- Reduces Phase 5 overhead by 60-75%
- Enables larger dictionaries without performance penalty
- Unifies dictionary implementation (one codebase for both modes)

---

## Implementation Checklist

- [ ] Create `wasm-core/src/dictionary_trie.rs`
- [ ] Implement `TrieNode` with HashMap-based children
- [ ] Implement `WasmDictionaryTrie` WASM wrapper
- [ ] Update `wasm-core/src/lib.rs` exports
- [ ] Build WASM: `cd wasm-core && wasm-pack build --dev`
- [ ] Create `src/utils/WasmDictionaryTrie.js`
- [ ] Update TranslationEngine.js Phase 5
- [ ] Add fallback logic
- [ ] Test with 27,000 character entries
- [ ] Benchmark performance improvement
- [ ] Update documentation

**Estimated Effort**: 4-6 hours

**Priority**: HIGH (2-4x speedup, memory reduction, code unification)
