use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub word: String,
    pub translation: String,
    pub start_pos: usize,
    pub end_pos: usize,
    pub priority: u8,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TrieNode {
    children: HashMap<char, TrieNode>,
    is_end_of_word: bool,
    translation: Option<String>,
    metadata: Option<String>,
    priority: u8,
}

impl TrieNode {
    pub fn new() -> Self {
        Self {
            children: HashMap::new(),
            is_end_of_word: false,
            translation: None,
            metadata: None,
            priority: 5,
        }
    }

    pub fn insert(&mut self, word: &str, translation: String, metadata: Option<String>) {
        self.insert_with_priority(word, translation, 5, metadata);
    }

    pub fn insert_with_priority(
        &mut self,
        word: &str,
        translation: String,
        priority: u8,
        metadata: Option<String>,
    ) {
        let mut current = self;

        for ch in word.chars() {
            current = current.children.entry(ch).or_insert_with(TrieNode::new);
        }

        current.is_end_of_word = true;
        current.translation = Some(translation);
        current.metadata = metadata;
        current.priority = priority;
    }

    pub fn find_matches(&self, text: &str, start_pos: usize) -> Vec<MatchResult> {
        let chars: Vec<char> = text.chars().collect();
        self.find_matches_slice(&chars, start_pos)
    }

    /// Find all prefix matches starting at `start_pos` in a pre-collected char slice.
    /// Callers that iterate over multiple start positions on the same text should
    /// collect chars once and call this method directly — avoids a Vec<char>
    /// allocation per position.
    pub fn find_matches_slice(&self, chars: &[char], start_pos: usize) -> Vec<MatchResult> {
        let mut matches = Vec::new();

        if start_pos >= chars.len() {
            return matches;
        }

        let mut current = self;

        for i in start_pos..chars.len() {
            match current.children.get(&chars[i]) {
                Some(node) => {
                    current = node;

                    if current.is_end_of_word {
                        if let Some(translation) = &current.translation {
                            matches.push(MatchResult {
                                word: chars[start_pos..=i].iter().collect(),
                                translation: translation.clone(),
                                start_pos,
                                end_pos: i + 1,
                                priority: current.priority,
                                metadata: current.metadata.clone(),
                            });
                        }
                    }
                }
                None => break,
            }
        }

        // Matches are accumulated in increasing length order; reverse for longest-first
        matches.reverse();

        matches
    }

    /// Find the single longest match starting at `start_pos` — walks the trie once,
    /// collecting only the final longest match rather than all prefix matches.
    pub fn find_longest_match(&self, text: &str, start_pos: usize) -> Option<MatchResult> {
        let chars: Vec<char> = text.chars().collect();
        self.find_longest_match_slice(&chars, start_pos)
    }

    /// Find the single longest match in a pre-collected char slice.
    /// Prefer this over `find_longest_match` when the same text is searched
    /// at multiple positions — collect chars once and reuse the slice.
    pub fn find_longest_match_slice(&self, chars: &[char], start_pos: usize) -> Option<MatchResult> {
        if start_pos >= chars.len() {
            return None;
        }

        let mut current = self;
        let mut longest: Option<MatchResult> = None;

        for i in start_pos..chars.len() {
            match current.children.get(&chars[i]) {
                Some(node) => {
                    current = node;
                    if current.is_end_of_word {
                        if let Some(translation) = &current.translation {
                            longest = Some(MatchResult {
                                word: chars[start_pos..=i].iter().collect(),
                                translation: translation.clone(),
                                start_pos,
                                end_pos: i + 1,
                                priority: current.priority,
                                metadata: current.metadata.clone(),
                            });
                        }
                    }
                }
                None => break,
            }
        }

        longest
    }

    pub fn get_entry_count(&self) -> usize {
        // Iterative BFS/DFS to avoid stack overflow on deep tries (e.g. crafted long keys).
        let mut count = 0;
        let mut stack: Vec<&TrieNode> = vec![self];
        while let Some(node) = stack.pop() {
            if node.is_end_of_word {
                count += 1;
            }
            stack.extend(node.children.values());
        }
        count
    }

    /// Find all matches starting at `start_pos`, ordered shortest to longest.
    /// Use this when the caller needs all prefix matches in ascending length order.
    /// For longest-first ordering use `find_matches` / `find_matches_slice`.
    pub fn find_all_matches(&self, text: &str, start_pos: usize) -> Vec<MatchResult> {
        let chars: Vec<char> = text.chars().collect();
        self.find_all_matches_slice(&chars, start_pos)
    }

    /// Slice variant of `find_all_matches` — avoids repeated `Vec<char>` allocation.
    pub fn find_all_matches_slice(&self, chars: &[char], start_pos: usize) -> Vec<MatchResult> {
        let mut matches = Vec::new();

        if start_pos >= chars.len() {
            return matches;
        }

        let mut current = self;

        for i in start_pos..chars.len() {
            match current.children.get(&chars[i]) {
                Some(node) => {
                    current = node;
                    if current.is_end_of_word {
                        if let Some(translation) = &current.translation {
                            matches.push(MatchResult {
                                word: chars[start_pos..=i].iter().collect(),
                                translation: translation.clone(),
                                start_pos,
                                end_pos: i + 1,
                                priority: current.priority,
                                metadata: current.metadata.clone(),
                            });
                        }
                    }
                }
                None => break,
            }
        }

        // Shortest to longest (natural accumulation order — no reversal)
        matches
    }

    /// Returns `(node_count, entry_count, max_depth)` for debugging / statistics.
    pub fn get_stats(&self) -> (usize, usize, usize) {
        let mut node_count = 0;
        let mut max_depth = 0;
        self.get_stats_recursive(0, &mut max_depth, &mut node_count);
        let entry_count = self.get_entry_count();
        (node_count, entry_count, max_depth)
    }

    fn get_stats_recursive(&self, _start_depth: usize, max_depth: &mut usize, node_count: &mut usize) {
        // Iterative DFS with explicit depth tracking to avoid stack overflow on deep tries.
        let mut stack: Vec<(&TrieNode, usize)> = vec![(self, 0)];
        while let Some((node, depth)) = stack.pop() {
            *node_count += 1;
            *max_depth = (*max_depth).max(depth);
            for child in node.children.values() {
                stack.push((child, depth + 1));
            }
        }
    }

    /// Clear all entries, resetting to an empty trie.
    pub fn clear(&mut self) {
        self.children.clear();
        self.translation = None;
        self.metadata = None;
        self.is_end_of_word = false;
        self.priority = 5;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_insertion_and_lookup() {
        let mut trie = TrieNode::new();
        
        // Insert test entries
        trie.insert("你好", "xin chào".to_string(), Some("greeting".to_string()));
        trie.insert("世界", "thế giới".to_string(), Some("world".to_string()));
        trie.insert("你", "bạn".to_string(), Some("you".to_string()));
        
        // Test longest match first
        let matches = trie.find_matches("你好", 0);
        assert_eq!(matches.len(), 2); // Should find both "你好" and "你"
        assert_eq!(matches[0].word, "你好"); // Longest first
        assert_eq!(matches[0].translation, "xin chào");
        assert_eq!(matches[1].word, "你");
        assert_eq!(matches[1].translation, "bạn");
        
        // Test single longest match
        let longest = trie.find_longest_match("你好", 0);
        assert!(longest.is_some());
        assert_eq!(longest.unwrap().word, "你好");
    }

    #[test]
    fn test_no_match() {
        let mut trie = TrieNode::new();
        trie.insert("你好", "xin chào".to_string(), None);
        
        let matches = trie.find_matches("测试", 0);
        assert_eq!(matches.len(), 0);
    }

    #[test]
    fn test_entry_count() {
        let mut trie = TrieNode::new();
        assert_eq!(trie.get_entry_count(), 0);
        
        trie.insert("你好", "xin chào".to_string(), None);
        assert_eq!(trie.get_entry_count(), 1);
        
        trie.insert("你", "bạn".to_string(), None);
        assert_eq!(trie.get_entry_count(), 2);
    }
}