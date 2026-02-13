// Lookup Index Engine - High-Performance Dictionary Index Builder
//
// This module implements a fast Rust/Rayon-based lookup index builder
// to pre-compute all dictionary matches for every text position.
//
// Performance target: 200-800ms for 10KB text (vs 5-10 seconds in JavaScript)
//
// Algorithm:
// - For each position in text (0..n):
//   - Find all dictionary matches starting at that position
//   - Categorize matches by dictionary type
//   - Store in index: position -> categorized matches
//
// Parallelization:
// - Uses Rayon to process positions in parallel
// - Each position is independent (no shared mutable state)
// - Results collected into HashMap at the end

use hashbrown::HashMap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// A single dictionary match result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DictionaryMatch {
    pub word: String,
    pub translation: String,
    pub end_pos: usize,
    pub metadata: Option<String>,
    pub dictionary: String,
    pub priority: u32,
}

/// Categorized matches at a position
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CategorizedMatches {
    pub patterns: Vec<DictionaryMatch>,
    pub proper_nouns: Vec<DictionaryMatch>,
    pub phrases: Vec<DictionaryMatch>,
    pub characters: Vec<DictionaryMatch>,
    pub numbers: Vec<DictionaryMatch>,
}

/// Trie node for dictionary storage
#[derive(Debug, Clone)]
pub struct TrieNode {
    pub children: HashMap<char, TrieNode>,
    pub is_end_of_word: bool,
    pub translation: Option<String>,
    pub metadata: Option<String>,
}

impl TrieNode {
    pub fn new() -> Self {
        Self {
            children: HashMap::new(),
            is_end_of_word: false,
            translation: None,
            metadata: None,
        }
    }

    /// Find all matches starting at a position in a pre-collected char slice.
    /// Callers must pre-collect `text.chars()` once and pass `&[char]` to avoid
    /// O(n) allocation per call inside parallel loops.
    pub fn find_matches(&self, chars: &[char], start_pos: usize) -> Vec<DictionaryMatch> {
        let mut matches = Vec::new();

        if start_pos >= chars.len() {
            return matches;
        }

        let mut current = self;
        let mut word = String::new();

        for i in start_pos..chars.len() {
            let ch = chars[i];

            // Traverse trie
            if let Some(child) = current.children.get(&ch) {
                current = child;
                word.push(ch);

                // Found a match
                if current.is_end_of_word {
                    if let Some(translation) = &current.translation {
                        matches.push(DictionaryMatch {
                            word: word.clone(),
                            translation: translation.clone(),
                            end_pos: i + 1,
                            metadata: current.metadata.clone(),
                            dictionary: String::new(), // Will be set by caller
                            priority: 0,              // Will be set by caller
                        });
                    }
                }
            } else {
                break;
            }
        }

        matches
    }
}

/// Dictionary with metadata
#[derive(Debug, Clone)]
pub struct Dictionary {
    pub name: String,
    pub trie: Arc<TrieNode>,
    pub priority: u32,
    #[allow(dead_code)]
    pub dict_type: DictionaryType,  // Used for categorization logic (may be used in future extensions)
}

/// Dictionary type for categorization
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DictionaryType {
    Patterns,
    ProperNouns,
    Phrases,
    Characters,
    Numbers,
}

impl DictionaryType {
    /// Determine dictionary type from name
    pub fn from_name(name: &str) -> Self {
        if name.starts_with("patterns") {
            DictionaryType::Patterns
        } else if name.starts_with("properNouns") {
            DictionaryType::ProperNouns
        } else if name == "phrases" {
            DictionaryType::Phrases
        } else if name == "characters" {
            DictionaryType::Characters
        } else if name == "numbers" {
            DictionaryType::Numbers
        } else {
            // Default to phrases for unknown types
            DictionaryType::Phrases
        }
    }
}

/// Options for lookup index building
#[derive(Debug, Clone)]
pub struct IndexBuildOptions {
    pub min_text_length: usize,
    pub enable_indexing: bool,
    pub use_parallel: bool,
}

impl Default for IndexBuildOptions {
    fn default() -> Self {
        Self {
            min_text_length: 50,
            enable_indexing: true,
            use_parallel: true,
        }
    }
}

/// Result of index building operation
#[derive(Debug, Serialize, Deserialize)]
pub struct IndexBuildResult {
    pub success: bool,
    pub index_size: usize,
    pub positions_indexed: usize,
    pub build_time_ms: u128,
    pub index: HashMap<u32, CategorizedMatches>,
}

/// Build comprehensive lookup index for text
///
/// This is the main entry point for the lookup index builder.
/// It processes each position in the text and finds all dictionary matches.
///
/// # Arguments
/// * `text` - The input text to index
/// * `dictionaries` - List of dictionaries to search
/// * `dictionary_order` - Order to search dictionaries
/// * `options` - Build options
///
/// # Returns
/// HashMap mapping position -> categorized matches
pub fn build_comprehensive_lookup_index(
    text: &str,
    dictionaries: &[Dictionary],
    dictionary_order: &[String],
    options: &IndexBuildOptions,
) -> HashMap<u32, CategorizedMatches> {
    // Skip for short texts
    if text.len() < options.min_text_length || !options.enable_indexing {
        return HashMap::new();
    }

    // Order dictionaries according to search order
    let ordered_dicts = order_dictionaries(dictionaries, dictionary_order);

    // Build index (parallel or serial)
    if options.use_parallel {
        build_index_parallel(text, &ordered_dicts)
    } else {
        build_index_serial(text, &ordered_dicts)
    }
}

/// Order dictionaries according to search order
fn order_dictionaries(
    dictionaries: &[Dictionary],
    dictionary_order: &[String],
) -> Vec<Dictionary> {
    let mut ordered = Vec::new();
    let dict_map: HashMap<_, _> = dictionaries
        .iter()
        .map(|d| (d.name.as_str(), d.clone()))
        .collect();

    // HashSet for O(1) membership test when adding unordered dictionaries
    let order_set: std::collections::HashSet<&str> =
        dictionary_order.iter().map(|s| s.as_str()).collect();

    for name in dictionary_order {
        if let Some(dict) = dict_map.get(name.as_str()) {
            ordered.push(dict.clone());
        }
    }

    // Add any dictionaries not in the explicit order
    for dict in dictionaries {
        if !order_set.contains(dict.name.as_str()) {
            ordered.push(dict.clone());
        }
    }

    ordered
}

/// Build index using serial processing
fn build_index_serial(
    text: &str,
    dictionaries: &[Dictionary],
) -> HashMap<u32, CategorizedMatches> {
    let mut index = HashMap::new();
    let chars: Vec<char> = text.chars().collect();

    for pos in 0..chars.len() {
        let matches = find_all_matches_at_position(&chars, pos, dictionaries);

        if !matches.is_empty() {
            let categorized = categorize_matches(matches);
            index.insert(pos as u32, categorized);
        }
    }

    index
}

/// Build index using parallel processing with Rayon
fn build_index_parallel(
    text: &str,
    dictionaries: &[Dictionary],
) -> HashMap<u32, CategorizedMatches> {
    // Pre-collect chars once; shared read-only across all Rayon threads
    let chars: Vec<char> = text.chars().collect();

    // Process positions in parallel
    let results: Vec<(u32, CategorizedMatches)> = (0..chars.len())
        .into_par_iter()
        .filter_map(|pos| {
            let matches = find_all_matches_at_position(&chars, pos, dictionaries);

            if !matches.is_empty() {
                let categorized = categorize_matches(matches);
                Some((pos as u32, categorized))
            } else {
                None
            }
        })
        .collect();

    // Collect results into HashMap
    results.into_iter().collect()
}

/// Find all dictionary matches at a specific position
fn find_all_matches_at_position(
    chars: &[char],
    start_pos: usize,
    dictionaries: &[Dictionary],
) -> Vec<DictionaryMatch> {
    let mut all_matches = Vec::new();

    for dict in dictionaries {
        let mut matches = dict.trie.find_matches(chars, start_pos);

        // Set dictionary name and priority
        for match_item in &mut matches {
            match_item.dictionary = dict.name.clone();
            match_item.priority = dict.priority;
        }

        all_matches.extend(matches);
    }

    all_matches
}

/// Categorize matches by dictionary type
fn categorize_matches(matches: Vec<DictionaryMatch>) -> CategorizedMatches {
    let mut categorized = CategorizedMatches::default();

    for match_item in matches {
        let dict_type = DictionaryType::from_name(&match_item.dictionary);

        match dict_type {
            DictionaryType::Patterns => categorized.patterns.push(match_item),
            DictionaryType::ProperNouns => categorized.proper_nouns.push(match_item),
            DictionaryType::Phrases => categorized.phrases.push(match_item),
            DictionaryType::Characters => categorized.characters.push(match_item),
            DictionaryType::Numbers => categorized.numbers.push(match_item),
        }
    }

    categorized
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Trie helpers
    // -----------------------------------------------------------------------

    /// Insert a single word→translation into a TrieNode tree.
    fn insert(root: &mut TrieNode, word: &str, translation: &str) {
        let mut node = root;
        for ch in word.chars() {
            node = node.children.entry(ch).or_insert_with(TrieNode::new);
        }
        node.is_end_of_word = true;
        node.translation = Some(translation.to_string());
    }

    /// Build a single-dictionary Dictionary from word→translation pairs.
    fn make_dict(name: &str, entries: &[(&str, &str)], dict_type: DictionaryType, priority: u32) -> Dictionary {
        let mut trie = TrieNode::new();
        for (word, trans) in entries {
            insert(&mut trie, word, trans);
        }
        Dictionary {
            name: name.to_string(),
            trie: Arc::new(trie),
            priority,
            dict_type,
        }
    }

    // -----------------------------------------------------------------------
    // Existing tests (preserved)
    // -----------------------------------------------------------------------

    #[test]
    fn test_trie_find_matches() {
        let mut trie = TrieNode::new();

        // Insert test data
        let mut node = &mut trie;
        for ch in "你好".chars() {
            node = node
                .children
                .entry(ch)
                .or_insert_with(TrieNode::new);
        }
        node.is_end_of_word = true;
        node.translation = Some("xin chào".to_string());

        // Test finding matches
        let chars: Vec<char> = "你好世界".chars().collect();
        let matches = trie.find_matches(&chars, 0);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].word, "你好");
        assert_eq!(matches[0].translation, "xin chào");
    }

    #[test]
    fn test_dictionary_type_from_name() {
        assert_eq!(
            DictionaryType::from_name("patterns-test"),
            DictionaryType::Patterns
        );
        assert_eq!(
            DictionaryType::from_name("properNouns-Names"),
            DictionaryType::ProperNouns
        );
        assert_eq!(
            DictionaryType::from_name("phrases"),
            DictionaryType::Phrases
        );
        assert_eq!(
            DictionaryType::from_name("characters"),
            DictionaryType::Characters
        );
    }

    #[test]
    fn test_build_index_serial() {
        // Create a simple dictionary
        let mut trie = TrieNode::new();
        let mut node = &mut trie;
        for ch in "测试".chars() {
            node = node
                .children
                .entry(ch)
                .or_insert_with(TrieNode::new);
        }
        node.is_end_of_word = true;
        node.translation = Some("test".to_string());

        let dict = Dictionary {
            name: "test".to_string(),
            trie: Arc::new(trie),
            priority: 1,
            dict_type: DictionaryType::Phrases,
        };

        let index = build_index_serial("测试文本", &[dict]);
        assert!(index.contains_key(&0));
    }

    // -----------------------------------------------------------------------
    // TrieNode::find_matches — new coverage
    // -----------------------------------------------------------------------

    #[test]
    fn test_trie_no_match_returns_empty() {
        let trie = TrieNode::new(); // empty trie
        let chars: Vec<char> = "你好".chars().collect();
        let matches = trie.find_matches(&chars, 0);
        assert!(matches.is_empty(), "Empty trie should return no matches");
    }

    #[test]
    fn test_trie_start_pos_beyond_end_returns_empty() {
        let mut trie = TrieNode::new();
        insert(&mut trie, "你好", "xin chào");
        let chars: Vec<char> = "你好".chars().collect();
        // start_pos == chars.len() should return empty immediately
        let matches = trie.find_matches(&chars, chars.len());
        assert!(matches.is_empty());
    }

    #[test]
    fn test_trie_finds_prefix_and_full_match() {
        // Both "你" and "你好" are in the trie — both should be returned as matches
        let mut trie = TrieNode::new();
        insert(&mut trie, "你", "bạn");
        insert(&mut trie, "你好", "xin chào");

        let chars: Vec<char> = "你好世界".chars().collect();
        let matches = trie.find_matches(&chars, 0);

        // Should return 2 matches: "你" (end_pos 1) and "你好" (end_pos 2)
        assert_eq!(matches.len(), 2);
        let words: Vec<&str> = matches.iter().map(|m| m.word.as_str()).collect();
        assert!(words.contains(&"你"));
        assert!(words.contains(&"你好"));
    }

    #[test]
    fn test_trie_match_end_pos_is_exclusive() {
        let mut trie = TrieNode::new();
        insert(&mut trie, "你好", "xin chào");
        let chars: Vec<char> = "你好世界".chars().collect();
        let matches = trie.find_matches(&chars, 0);
        assert_eq!(matches[0].end_pos, 2, "end_pos should be char index after last matched char");
    }

    #[test]
    fn test_trie_match_at_non_zero_start() {
        let mut trie = TrieNode::new();
        insert(&mut trie, "世界", "thế giới");
        let chars: Vec<char> = "你好世界".chars().collect();
        // Match starts at position 2 (char '世')
        let matches = trie.find_matches(&chars, 2);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].word, "世界");
        assert_eq!(matches[0].end_pos, 4);
    }

    /// Critical: Chinese characters are 3 bytes each in UTF-8.
    /// Positions must be in char indices (not byte indices).
    #[test]
    fn test_trie_positions_are_char_indices_not_byte_indices() {
        let mut trie = TrieNode::new();
        insert(&mut trie, "界", "giới");

        // "你好世界" has 4 chars; "界" is char index 3, byte index 9.
        let text = "你好世界";
        let chars: Vec<char> = text.chars().collect();

        // Start at char index 3 (NOT byte index 9)
        let matches = trie.find_matches(&chars, 3);
        assert_eq!(matches.len(), 1, "Should match '界' at char index 3");
        assert_eq!(matches[0].end_pos, 4, "end_pos should be char index 4, not byte index 12");
    }

    // -----------------------------------------------------------------------
    // DictionaryType::from_name — edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn test_dictionary_type_numbers() {
        assert_eq!(DictionaryType::from_name("numbers"), DictionaryType::Numbers);
    }

    #[test]
    fn test_dictionary_type_unknown_defaults_to_phrases() {
        assert_eq!(DictionaryType::from_name("unknown-dict"), DictionaryType::Phrases);
        assert_eq!(DictionaryType::from_name(""), DictionaryType::Phrases);
    }

    // -----------------------------------------------------------------------
    // categorize_matches
    // -----------------------------------------------------------------------

    #[test]
    fn test_categorize_matches_routes_by_dictionary_name() {
        let matches = vec![
            DictionaryMatch { word: "a".to_string(), translation: "t".to_string(), end_pos: 1, metadata: None, dictionary: "characters".to_string(), priority: 1 },
            DictionaryMatch { word: "b".to_string(), translation: "t".to_string(), end_pos: 1, metadata: None, dictionary: "phrases".to_string(), priority: 1 },
            DictionaryMatch { word: "c".to_string(), translation: "t".to_string(), end_pos: 1, metadata: None, dictionary: "properNouns-Test".to_string(), priority: 1 },
            DictionaryMatch { word: "d".to_string(), translation: "t".to_string(), end_pos: 1, metadata: None, dictionary: "patterns-base".to_string(), priority: 1 },
            DictionaryMatch { word: "e".to_string(), translation: "t".to_string(), end_pos: 1, metadata: None, dictionary: "numbers".to_string(), priority: 1 },
        ];
        let cat = categorize_matches(matches);
        assert_eq!(cat.characters.len(), 1);
        assert_eq!(cat.phrases.len(), 1);
        assert_eq!(cat.proper_nouns.len(), 1);
        assert_eq!(cat.patterns.len(), 1);
        assert_eq!(cat.numbers.len(), 1);
    }

    // -----------------------------------------------------------------------
    // order_dictionaries
    // -----------------------------------------------------------------------

    #[test]
    fn test_order_dictionaries_respects_explicit_order() {
        let dicts = vec![
            make_dict("phrases", &[], DictionaryType::Phrases, 2),
            make_dict("characters", &[], DictionaryType::Characters, 1),
        ];
        let order = vec!["characters".to_string(), "phrases".to_string()];
        let ordered = order_dictionaries(&dicts, &order);
        assert_eq!(ordered[0].name, "characters");
        assert_eq!(ordered[1].name, "phrases");
    }

    #[test]
    fn test_order_dictionaries_appends_unordered_at_end() {
        let dicts = vec![
            make_dict("phrases", &[], DictionaryType::Phrases, 2),
            make_dict("extra", &[], DictionaryType::Phrases, 3),
        ];
        let order = vec!["phrases".to_string()]; // "extra" not in order list
        let ordered = order_dictionaries(&dicts, &order);
        assert_eq!(ordered.len(), 2);
        assert_eq!(ordered[0].name, "phrases");
        assert_eq!(ordered[1].name, "extra");
    }

    // -----------------------------------------------------------------------
    // build_index_serial — new coverage
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_index_serial_empty_text_returns_empty() {
        let dict = make_dict("characters", &[("你", "bạn")], DictionaryType::Characters, 1);
        let index = build_index_serial("", &[dict]);
        assert!(index.is_empty());
    }

    #[test]
    fn test_build_index_serial_no_match_at_position_is_absent() {
        // "你好" at position 0; position 1 ('好') has no standalone match
        let dict = make_dict("characters", &[("你好", "xin chào")], DictionaryType::Characters, 1);
        let index = build_index_serial("你好", &[dict]);
        assert!(index.contains_key(&0), "Position 0 should have a match");
        assert!(!index.contains_key(&1), "Position 1 has no standalone entry for '好'");
    }

    #[test]
    fn test_build_index_serial_multiple_positions() {
        // "你" appears at position 0 and "好" at position 1
        let dict = make_dict("characters", &[("你", "bạn"), ("好", "tốt")], DictionaryType::Characters, 1);
        let index = build_index_serial("你好", &[dict]);
        assert!(index.contains_key(&0));
        assert!(index.contains_key(&1));
    }

    #[test]
    fn test_build_index_serial_match_placed_in_correct_category() {
        let dict = make_dict("phrases", &[("不知道", "không biết")], DictionaryType::Phrases, 1);
        let index = build_index_serial("不知道", &[dict]);
        let cat = index.get(&0).expect("Position 0 should have matches");
        assert_eq!(cat.phrases.len(), 1);
        assert_eq!(cat.phrases[0].word, "不知道");
    }

    // -----------------------------------------------------------------------
    // Serial / parallel parity
    // -----------------------------------------------------------------------

    #[test]
    fn test_serial_parallel_produce_same_index() {
        let entries = &[("你", "bạn"), ("好", "tốt"), ("世界", "thế giới")];
        let text = "你好世界";

        let dict_serial = make_dict("characters", entries, DictionaryType::Characters, 1);
        let dict_parallel = make_dict("characters", entries, DictionaryType::Characters, 1);

        let serial = build_index_serial(text, &[dict_serial]);
        let parallel = build_index_parallel(text, &[dict_parallel]);

        assert_eq!(serial.len(), parallel.len(), "Serial and parallel must produce same number of indexed positions");

        for (pos, serial_cat) in &serial {
            let par_cat = parallel.get(pos).expect("Parallel index should have same position");
            // Compare by word sets to avoid ordering sensitivity
            let mut serial_words: Vec<&str> = serial_cat.characters.iter().map(|m| m.word.as_str()).collect();
            let mut par_words: Vec<&str> = par_cat.characters.iter().map(|m| m.word.as_str()).collect();
            serial_words.sort();
            par_words.sort();
            assert_eq!(serial_words, par_words, "Mismatch at position {pos}");
        }
    }

    // -----------------------------------------------------------------------
    // build_comprehensive_lookup_index — min_text_length guard
    // -----------------------------------------------------------------------

    #[test]
    fn test_comprehensive_index_skips_short_text() {
        let dict = make_dict("characters", &[("你", "bạn")], DictionaryType::Characters, 1);
        let options = IndexBuildOptions {
            min_text_length: 100, // text is shorter than this
            enable_indexing: true,
            use_parallel: false,
        };
        let index = build_comprehensive_lookup_index("你好", &[dict], &[], &options);
        assert!(index.is_empty(), "Short text should be skipped");
    }

    #[test]
    fn test_comprehensive_index_skips_when_disabled() {
        let dict = make_dict("characters", &[("你", "bạn")], DictionaryType::Characters, 1);
        let options = IndexBuildOptions {
            min_text_length: 0,
            enable_indexing: false,
            use_parallel: false,
        };
        let index = build_comprehensive_lookup_index(
            "你好世界你好世界你好世界你好世界你好世界你好世界你好世界你好世界你好世界你好世界你好世界",
            &[dict],
            &[],
            &options,
        );
        assert!(index.is_empty(), "Disabled indexing should return empty");
    }
}
