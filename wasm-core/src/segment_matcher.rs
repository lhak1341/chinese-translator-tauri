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

    // CODE REVIEW FIX (CRITICAL-3): Store ALL unit indices at this trie node.
    // Using Option<usize> caused last-writer-wins: when two semantic units share
    // the same translated text (e.g. two source words both mapping to "bạn"),
    // the second build_index insert silently overwrote the first unit_index,
    // breaking click-highlighting for that unit entirely.
    /// All unit indices for units that end at this trie node
    unit_indices: Vec<usize>,

    /// Unit length (number of characters) — same for all units sharing this node
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
     * @param units_json - JSON.stringify(semanticUnits) from JavaScript
     * @returns Success status
     */
    #[wasm_bindgen(js_name = buildIndex)]
    pub fn build_index(&mut self, units_json: &str) -> Result<bool, JsValue> {
        // Deserialize units from JSON string — zero JS interop during &mut self borrow
        let units: Vec<SemanticUnit> = serde_json::from_str(units_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to deserialize units: {}", e)))?;

        // Clear existing trie
        self.root = TrieNode::default();
        self.units = units;

        // Build trie from units
        for unit in &self.units {
            if unit.unit.is_empty() {
                continue;  // Skip empty units
            }

            let mut node = &mut self.root;
            let chars: Vec<char> = unit.unit.chars().collect();

            // Traverse/create trie path
            for ch in &chars {
                node = node.children.entry(*ch).or_default();
            }

            // Mark end of unit — push so all units with identical translated text are kept
            node.unit_indices.push(unit.index);
            node.unit_length = chars.len();
        }

        Ok(true)
    }

    /**
     * Find all matches in text using trie
     *
     * @param text - Text to search
     * @returns JSON string — caller: JSON.parse(matcher.findMatches(text))
     */
    #[wasm_bindgen(js_name = findMatches)]
    pub fn find_matches(&self, text: &str) -> String {
        // CODE REVIEW FIX (HIGH-4): Bound total output size to prevent N×M explosion.
        // If N text positions match and M semantic units share the same translated text,
        // the output is N×M SegmentMatch objects.  For typical novel text this is harmless,
        // but an adversarial/unusual dictionary could produce millions of matches.
        // 100,000 matches ≈ a few MB across the WASM boundary — well beyond any real use-case.
        const MAX_MATCHES: usize = 100_000;

        let mut matches = Vec::new();
        let chars: Vec<char> = text.chars().collect();

        let mut position = 0;

        while position < chars.len() {
            let mut node = &self.root;
            // (unit_indices, length, advance_offset) — Vec because multiple units may share the same translated text
            let mut last_match: Option<(Vec<usize>, usize, usize)> = None;

            // Walk trie to find longest match at this position
            for (offset, &ch) in chars[position..].iter().enumerate() {
                if let Some(next_node) = node.children.get(&ch) {
                    node = next_node;

                    // Record match if this node represents complete unit(s).
                    // No used_indices guard: the same unit may appear at multiple text
                    // positions (e.g., "bạn" occurs twice) and each occurrence should
                    // produce a separate SegmentMatch so the JS consumer can highlight
                    // every instance correctly.
                    if !node.unit_indices.is_empty() {
                        last_match = Some((node.unit_indices.clone(), node.unit_length, offset + 1));
                    }
                } else {
                    break;  // No more matches possible at this position
                }
            }

            if let Some((unit_indices, length, offset)) = last_match {
                // Found a match — emit one SegmentMatch per unit that ends here.
                // Multiple units share a node when two source terms have the same translation.
                //
                // Output multiplier: if N text positions match and M units share the same
                // translated text, the JS consumer receives up to N×M SegmentMatch objects.
                // WasmSegmentMatcher.js handles this by indexing into semanticUnits[match.unit_index].
                if matches.len() >= MAX_MATCHES {
                    // Cap exceeded — return partial results.  Remaining text won't be
                    // highlighted, but this prevents an unbounded N×M memory allocation.
                    break;
                }
                for unit_index in &unit_indices {
                    // Re-check inside the inner loop: multiple units sharing a node
                    // can push M entries in one batch, violating the outer check.
                    if matches.len() >= MAX_MATCHES {
                        break;
                    }
                    let unit = &self.units[*unit_index];
                    matches.push(SegmentMatch {
                        position,
                        length,
                        offset: 0,  // Offset is always 0 in trie matching
                        unit_index: *unit_index,
                        original: unit.original.clone(),
                        translated: unit.unit.clone(),
                        metadata: unit.metadata.clone(),
                    });
                }

                position += offset;  // Skip matched text
            } else {
                position += 1;  // No match, advance one character
            }
        }

        serde_json::to_string(&matches).unwrap_or_else(|_| "[]".to_string())
    }

    /**
     * Get statistics about the trie
     *
     * @returns JSON string — caller: JSON.parse(matcher.getStats())
     */
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> String {
        let node_count = self.count_nodes(&self.root);
        let unit_count = self.units.len();

        serde_json::json!({
            "nodeCount": node_count,
            "unitCount": unit_count,
            "averageBranchingFactor": if node_count > 0 {
                self.count_edges(&self.root) as f64 / node_count as f64
            } else {
                0.0
            }
        })
        .to_string()
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
