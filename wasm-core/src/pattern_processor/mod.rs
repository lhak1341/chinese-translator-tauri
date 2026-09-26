/**
 * Pattern Processor Module
 *
 * Semantic pattern matching system for Chinese-Vietnamese translation.
 * Phase 1: Foundation - Pattern data structures, parsing, and indexing.
 *
 * This module provides:
 * - Pattern data structures (SemanticPattern, PatternToken, etc.)
 * - Pattern parsing from JSON dictionary format
 * - Pattern indexing for O(1) first-token lookup
 *
 * Future phases will add:
 * - Pattern matching algorithm (Phase 2)
 * - Two-phase hierarchical processing (Phase 3)
 * - Performance optimizations (Phase 4)
 * - WASM integration (Phase 5)
 */

// Module declarations
pub mod index;
pub mod matcher;
pub mod parser;
pub mod pattern;
pub mod two_phase;
pub mod variable;
pub mod wasm_wrapper;

// Re-exports for convenience
pub use index::{PatternIndex, VARIABLE_KEY};
pub use matcher::{
    build_result,
    find_best_pattern_match, find_best_pattern_match_iter, PatternMatchResult, PatternMatcher, PhaseAPattern,
    PhaseAResult,
    SemanticToken, VariableCacheEntry, DEFAULT_MAX_VARIABLE_SPAN, NUMBER_VARIABLE,
    NUMBER_VARIABLE_TYPE,
};
pub use parser::{parse_pattern, parse_patterns_dict};
pub use pattern::{
    PatternMetadata, PatternToken, PatternUsage, SemanticPattern, TokenType,
};
pub use two_phase::{PatternProcessingResult, TwoPhasePatternProcessor, TwoPhaseStats};
pub use variable::is_variable_at;

#[cfg(test)]
mod integration_tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_parse_and_index_workflow() {
        // Step 1: Parse patterns
        let pattern1 = parse_pattern(
            "这些X".to_string(),
            "những X này".to_string(),
            None,
            false,
            None,
        );
        let pattern2 = parse_pattern(
            "X的Y".to_string(),
            "Y của X".to_string(),
            None,
            false,
            None,
        );

        // Step 2: Create index
        let mut index = PatternIndex::new();

        // Step 3: Index patterns
        index.index_pattern(pattern1.clone());
        index.index_pattern(pattern2.clone());

        // Step 4: Lookup patterns
        let literal_patterns = index.get_patterns_by_first_token("这");
        assert_eq!(literal_patterns.len(), 1);
        assert_eq!(literal_patterns[0].original_pattern, "这些X");

        let variable_patterns = index.get_variable_patterns();
        assert_eq!(variable_patterns.len(), 1);
        assert_eq!(variable_patterns[0].original_pattern, "X的Y");
    }

    #[test]
    fn test_full_dictionary_parsing() {
        // Simulate patterns.json format
        let mut dict = HashMap::new();
        dict.insert("X的右手".to_string(), json!("tay phải của X"));
        dict.insert("X的左手".to_string(), json!("tay trái của X"));
        dict.insert("X的眼睛".to_string(), json!("mắt của X"));
        dict.insert(
            "在XY中".to_string(),
            json!({
                "translation": "ở trong X Y"
            }),
        );

        // Parse all patterns
        let patterns = parse_patterns_dict(dict);
        assert_eq!(patterns.len(), 4);

        // Index all patterns
        let mut index = PatternIndex::new();
        index.index_patterns(&patterns);

        // Verify indexing
        assert_eq!(index.unique_first_tokens(), 2); // "X", "在"
        assert_eq!(index.len(), 4);

        // Verify variable-starting patterns
        let var_patterns = index.get_variable_patterns();
        assert_eq!(var_patterns.len(), 3); // X的右手, X的左手, X的眼睛

        // Verify literal-starting patterns
        let zai_patterns = index.get_patterns_by_first_token("在");
        assert_eq!(zai_patterns.len(), 1);
    }

    #[test]
    fn test_priority_ordering() {
        let mut dict = HashMap::new();
        dict.insert("这些X".to_string(), json!("những X này")); // 1 var, 3 tokens, literal first → -1*10 + 3 + 5 = -2
        dict.insert("这些XY".to_string(), json!("những X Y này")); // 2 vars, 4 tokens, literal first → -2*10 + 4 + 5 = -11

        let patterns = parse_patterns_dict(dict);

        // Find specific patterns
        let pattern_one_var = patterns.iter().find(|p| p.original_pattern == "这些X").unwrap();
        let pattern_two_var = patterns.iter().find(|p| p.original_pattern == "这些XY").unwrap();

        assert_eq!(pattern_one_var.priority, -2);
        assert_eq!(pattern_two_var.priority, -11);
        // Fewer variables must still outrank more variables at comparable length.
        assert!(pattern_one_var.priority > pattern_two_var.priority);
    }
}
