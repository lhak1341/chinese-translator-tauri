use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub word: String,
    pub translation: String,
    pub start_pos: usize,
    pub end_pos: usize,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TrieNode {
    children: HashMap<char, TrieNode>,
    is_end_of_word: bool,
    translation: Option<String>,
    metadata: Option<String>,
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

    pub fn insert(&mut self, word: &str, translation: String, metadata: Option<String>) {
        let mut current = self;
        
        for ch in word.chars() {
            current = current.children.entry(ch).or_insert_with(TrieNode::new);
        }
        
        current.is_end_of_word = true;
        current.translation = Some(translation);
        current.metadata = metadata;
    }

    pub fn find_matches(&self, text: &str, start_pos: usize) -> Vec<MatchResult> {
        let mut matches = Vec::new();
        let chars: Vec<char> = text.chars().collect();
        
        if start_pos >= chars.len() {
            return matches;
        }
        
        let mut current = self;
        
        for i in start_pos..chars.len() {
            let ch = chars[i];
            
            match current.children.get(&ch) {
                Some(node) => {
                    current = node;
                    
                    if current.is_end_of_word {
                        if let Some(translation) = &current.translation {
                            matches.push(MatchResult {
                                word: chars[start_pos..=i].iter().collect(),
                                translation: translation.clone(),
                                start_pos,
                                end_pos: i + 1,
                                metadata: current.metadata.clone(),
                            });
                        }
                    }
                }
                None => break,
            }
        }
        
        // Sort by length (longest first) for longest-match-first behavior
        matches.sort_by(|a, b| b.word.len().cmp(&a.word.len()));
        
        matches
    }

    pub fn find_longest_match(&self, text: &str, start_pos: usize) -> Option<MatchResult> {
        let matches = self.find_matches(text, start_pos);
        matches.into_iter().next() // Already sorted by length, take first
    }

    pub fn get_entry_count(&self) -> usize {
        let mut count = 0;
        
        if self.is_end_of_word {
            count += 1;
        }
        
        for child in self.children.values() {
            count += child.get_entry_count();
        }
        
        count
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