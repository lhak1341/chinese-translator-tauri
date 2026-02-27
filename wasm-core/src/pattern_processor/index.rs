/**
 * Pattern indexing for O(1) first-token lookup
 *
 * Indexes patterns by their first token to enable fast pattern matching.
 * Mirrors JavaScript SemanticPatternProcessor.indexPattern() logic.
 */

use super::pattern::{SemanticPattern, TokenType};
use std::collections::HashMap;

/// Special key for variable-starting patterns
pub const VARIABLE_KEY: &str = "__VARIABLE__";

/// Pattern index for O(1) first-token lookup
pub struct PatternIndex {
    /// Maps first token value -> patterns starting with that token
    index: HashMap<String, Vec<SemanticPattern>>,
}

impl PatternIndex {
    /// Create a new pattern index
    pub fn new() -> Self {
        Self {
            index: HashMap::new(),
        }
    }

    /// Index a pattern by its first token
    ///
    /// # Arguments
    /// * `pattern` - Pattern to index
    ///
    /// # Example
    /// ```ignore
    /// let mut index = PatternIndex::new();
    /// index.index_pattern(pattern);
    /// ```
    pub fn index_pattern(&mut self, pattern: SemanticPattern) {
        let key = Self::get_index_key(&pattern);

        self.index
            .entry(key)
            .or_insert_with(Vec::new)
            .push(pattern);
    }

    /// Index multiple patterns
    ///
    /// # Arguments
    /// * `patterns` - Slice of patterns to index (each is cloned into the index)
    pub fn index_patterns(&mut self, patterns: &[SemanticPattern]) {
        for pattern in patterns {
            self.index_pattern(pattern.clone());
        }
    }

    /// Get index key for a pattern
    ///
    /// Returns the first character of the first token if literal, or VARIABLE_KEY if variable
    fn get_index_key(pattern: &SemanticPattern) -> String {
        match &pattern.first_token.token_type {
            TokenType::Literal => {
                // Use first character of literal value as key (for multi-char literal support)
                pattern
                    .first_token
                    .value
                    .as_ref()
                    .and_then(|v| v.chars().next())
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "".to_string())
            }
            TokenType::Variable => {
                // Use special variable key
                VARIABLE_KEY.to_string()
            }
        }
    }

    /// Get patterns that start with a specific token
    ///
    /// # Arguments
    /// * `first_char` - First character to look up
    ///
    /// # Returns
    /// * `&[SemanticPattern]` - Patterns starting with that character (empty if none)
    pub fn get_patterns_by_first_token(&self, first_char: &str) -> &[SemanticPattern] {
        self.index
            .get(first_char)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    /// Get all variable-starting patterns
    ///
    /// # Returns
    /// * `&[SemanticPattern]` - Patterns starting with a variable
    pub fn get_variable_patterns(&self) -> &[SemanticPattern] {
        self.index
            .get(VARIABLE_KEY)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    /// Get all indexed patterns (flattened)
    ///
    /// # Returns
    /// * `Vec<&SemanticPattern>` - All patterns in the index
    pub fn get_all_patterns(&self) -> Vec<&SemanticPattern> {
        self.index
            .values()
            .flat_map(|patterns| patterns.iter())
            .collect()
    }

    /// Get total number of patterns indexed
    pub fn len(&self) -> usize {
        self.index.values().map(|v| v.len()).sum()
    }

    /// Check if index is empty
    pub fn is_empty(&self) -> bool {
        self.index.is_empty()
    }

    /// Clear the index
    pub fn clear(&mut self) {
        self.index.clear();
    }

    /// Get number of unique first tokens
    pub fn unique_first_tokens(&self) -> usize {
        self.index.len()
    }
}

impl Default for PatternIndex {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern_processor::parser::parse_pattern;

    #[test]
    fn test_index_literal_starting_pattern() {
        let mut index = PatternIndex::new();
        let pattern = parse_pattern(
            "这些X".to_string(),
            "những X này".to_string(),
            None,
            false,
            false,
            None,
        );

        index.index_pattern(pattern);

        // Should be indexed under "这"
        let patterns = index.get_patterns_by_first_token("这");
        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].original_pattern, "这些X");
    }

    #[test]
    fn test_index_variable_starting_pattern() {
        let mut index = PatternIndex::new();
        let pattern = parse_pattern(
            "X的Y".to_string(),
            "Y của X".to_string(),
            None,
            false,
            false,
            None,
        );

        index.index_pattern(pattern);

        // Should be indexed under __VARIABLE__
        let patterns = index.get_variable_patterns();
        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].original_pattern, "X的Y");
    }

    #[test]
    fn test_index_multiple_patterns_same_first_token() {
        let mut index = PatternIndex::new();

        let pattern1 = parse_pattern("这些X".to_string(), "những X này".to_string(), None, false, false, None);
        let pattern2 = parse_pattern("这个Y".to_string(), "cái Y này".to_string(), None, false, false, None);

        index.index_pattern(pattern1);
        index.index_pattern(pattern2);

        // Both should be indexed under "这"
        let patterns = index.get_patterns_by_first_token("这");
        assert_eq!(patterns.len(), 2);

        let pattern_texts: Vec<String> = patterns.iter().map(|p| p.original_pattern.clone()).collect();
        assert!(pattern_texts.contains(&"这些X".to_string()));
        assert!(pattern_texts.contains(&"这个Y".to_string()));
    }

    #[test]
    fn test_index_mixed_patterns() {
        let mut index = PatternIndex::new();

        let patterns = vec![
            parse_pattern("这些X".to_string(), "những X này".to_string(), None, false, false, None),
            parse_pattern("X的Y".to_string(), "Y của X".to_string(), None, false, false, None),
            parse_pattern("在XY中".to_string(), "ở trong X Y".to_string(), None, false, false, None),
            parse_pattern("Y是Z".to_string(), "Z là Y".to_string(), None, false, false, None),
        ];

        index.index_patterns(&patterns);

        // Check literal-starting patterns
        assert_eq!(index.get_patterns_by_first_token("这").len(), 1);
        assert_eq!(index.get_patterns_by_first_token("在").len(), 1);

        // Check variable-starting patterns
        assert_eq!(index.get_variable_patterns().len(), 2); // X的Y and Y是Z

        // Check total
        assert_eq!(index.len(), 4);
        assert_eq!(index.unique_first_tokens(), 3); // "这", "在", "__VARIABLE__"
    }

    #[test]
    fn test_get_nonexistent_pattern() {
        let index = PatternIndex::new();

        // Should return empty slice for nonexistent key
        let patterns = index.get_patterns_by_first_token("不");
        assert_eq!(patterns.len(), 0);
    }

    #[test]
    fn test_clear_index() {
        let mut index = PatternIndex::new();

        let pattern = parse_pattern("这些X".to_string(), "những X này".to_string(), None, false, false, None);
        index.index_pattern(pattern);

        assert_eq!(index.len(), 1);

        index.clear();

        assert_eq!(index.len(), 0);
        assert!(index.is_empty());
    }

    #[test]
    fn test_get_all_patterns() {
        let mut index = PatternIndex::new();

        let patterns = vec![
            parse_pattern("这些X".to_string(), "những X này".to_string(), None, false, false, None),
            parse_pattern("那些Y".to_string(), "những Y kia".to_string(), None, false, false, None),
            parse_pattern("X的Y".to_string(), "Y của X".to_string(), None, false, false, None),
        ];

        index.index_patterns(&patterns);

        let all_patterns = index.get_all_patterns();
        assert_eq!(all_patterns.len(), 3);
    }
}
