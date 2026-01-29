/**
 * Segment Matcher - WASM Trie-Based Matching
 *
 * Provides O(n+k) segment matching instead of O(n*m*k) JavaScript implementation.
 *
 * Algorithm:
 * 1. Build trie from semantic units (done once per translation)
 * 2. Walk trie while scanning text (O(n+k) where n=text length, k=match length)
 * 3. Return all matches with positions
 *
 * Expected speedup: 8-20x for 1000+ char texts with 100+ semantic units
 */

use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/**
 * Trie node for segment matching
 */
#[derive(Default, Clone)]
struct TrieNode {
    /// Child nodes indexed by character
    children: HashMap<char, TrieNode>,

    /// Unit index if this node represents a complete unit (None otherwise)
    unit_index: Option<usize>,

    /// Unit length (number of characters)
    unit_length: usize,
}

/**
 * Semantic unit input from JavaScript
 */
#[derive(Clone, Serialize, Deserialize)]
pub struct SemanticUnit {
    /// Translated text to match
    pub unit: String,

    /// Index in semantic array
    pub index: usize,

    /// Original text
    pub original: String,

    /// Metadata (serialized as JSON string)
    #[serde(skip)]
    pub metadata: Option<String>,
}

/**
 * Match result returned to JavaScript
 */
#[derive(Serialize, Deserialize)]
pub struct SegmentMatch {
    /// Position in text where match starts
    pub position: usize,

    /// Length of matched text (characters)
    pub length: usize,

    /// Offset from search position (for punctuation handling)
    pub offset: usize,

    /// Index in semantic array
    pub unit_index: usize,

    /// Original text
    pub original: String,

    /// Translated text (matched text)
    pub translated: String,

    /// Metadata (passed through from input)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<String>,
}

/**
 * Segment Matcher - builds trie and performs fast matching
 */
#[wasm_bindgen]
pub struct SegmentMatcher {
    root: TrieNode,
    units: Vec<SemanticUnit>,
}

#[wasm_bindgen]
impl SegmentMatcher {
    /**
     * Create new segment matcher
     */
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        SegmentMatcher {
            root: TrieNode::default(),
            units: Vec::new(),
        }
    }

    /**
     * Build trie index from semantic units
     *
     * @param units_js - JavaScript array of semantic units
     * @returns Success status
     */
    #[wasm_bindgen(js_name = buildIndex)]
    pub fn build_index(&mut self, units_js: JsValue) -> Result<bool, JsValue> {
        // Deserialize units from JavaScript
        let units: Vec<SemanticUnit> = serde_wasm_bindgen::from_value(units_js)
            .map_err(|e| JsValue::from_str(&format!("Failed to deserialize units: {}", e)))?;

        // Clear existing trie
        self.root = TrieNode::default();
        self.units = units.clone();

        // Build trie from units
        for unit in &units {
            if unit.unit.is_empty() {
                continue;  // Skip empty units
            }

            let mut node = &mut self.root;
            let chars: Vec<char> = unit.unit.chars().collect();

            // Traverse/create trie path
            for ch in &chars {
                node = node.children.entry(*ch).or_default();
            }

            // Mark end of unit
            node.unit_index = Some(unit.index);
            node.unit_length = chars.len();
        }

        Ok(true)
    }

    /**
     * Find all matches in text using trie
     *
     * @param text - Text to search
     * @returns Array of match results
     */
    #[wasm_bindgen(js_name = findMatches)]
    pub fn find_matches(&self, text: &str) -> Result<JsValue, JsValue> {
        let mut matches = Vec::new();
        let chars: Vec<char> = text.chars().collect();
        let mut used_indices = std::collections::HashSet::new();

        let mut position = 0;

        while position < chars.len() {
            let mut node = &self.root;
            let mut last_match: Option<(usize, usize, usize)> = None;  // (unit_index, length, offset)

            // Walk trie to find longest match at this position
            for (offset, &ch) in chars[position..].iter().enumerate() {
                if let Some(next_node) = node.children.get(&ch) {
                    node = next_node;

                    // Record match if this node represents a complete unit
                    if let Some(unit_index) = node.unit_index {
                        // Only use if not already used (handles duplicates)
                        if !used_indices.contains(&unit_index) {
                            last_match = Some((unit_index, node.unit_length, offset + 1));
                        }
                    }
                } else {
                    break;  // No more matches possible at this position
                }
            }

            if let Some((unit_index, length, offset)) = last_match {
                // Found a match - add to results
                let unit = &self.units[unit_index];

                matches.push(SegmentMatch {
                    position,
                    length,
                    offset: 0,  // Offset is always 0 in trie matching
                    unit_index,
                    original: unit.original.clone(),
                    translated: unit.unit.clone(),
                    metadata: unit.metadata.clone(),
                });

                used_indices.insert(unit_index);
                position += offset;  // Skip matched text
            } else {
                position += 1;  // No match, advance one character
            }
        }

        serde_wasm_bindgen::to_value(&matches)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize matches: {}", e)))
    }

    /**
     * Get statistics about the trie
     *
     * @returns Statistics object
     */
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> Result<JsValue, JsValue> {
        let node_count = self.count_nodes(&self.root);
        let unit_count = self.units.len();

        let stats = serde_json::json!({
            "nodeCount": node_count,
            "unitCount": unit_count,
            "averageBranchingFactor": if node_count > 0 {
                self.count_edges(&self.root) as f64 / node_count as f64
            } else {
                0.0
            }
        });

        serde_wasm_bindgen::to_value(&stats)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize stats: {}", e)))
    }
}

// Helper methods (not exposed to JavaScript)
impl SegmentMatcher {
    /**
     * Count total nodes in trie
     */
    fn count_nodes(&self, node: &TrieNode) -> usize {
        1 + node.children.values().map(|child| self.count_nodes(child)).sum::<usize>()
    }

    /**
     * Count total edges in trie
     */
    fn count_edges(&self, node: &TrieNode) -> usize {
        let children_edges: usize = node.children.values()
            .map(|child| self.count_edges(child))
            .sum();
        node.children.len() + children_edges
    }
}
