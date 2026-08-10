/**
 * Integration tests for pattern processor with real patterns.json data
 *
 * Tests the complete workflow of parsing and indexing patterns from
 * the actual patterns.json dictionary file.
 */

use translation_wasm_core::pattern_processor::{parse_patterns_dict, PatternIndex};
use std::collections::HashMap;

#[test]
fn test_parse_real_patterns_json() {
    // Simulate loading patterns.json content
    // In actual usage, this would be loaded from the file system
    let patterns_json = r#"{
        "X的右手": "tay phải của X",
        "X的左手": "tay trái của X",
        "X的眼睛": "mắt của X",
        "X的手": "tay của X",
        "X的脖子上": "trên cổ X",
        "这些X": "những X này",
        "那些Y": "những Y kia",
        "X的Y": "Y của X",
        "在XY中": "ở trong X Y"
    }"#;

    // Parse JSON into HashMap
    let patterns_dict: HashMap<String, serde_json::Value> =
        serde_json::from_str(patterns_json).expect("Failed to parse patterns JSON");

    // Parse patterns
    let patterns = parse_patterns_dict(patterns_dict);

    // Verify all patterns were parsed
    assert!(
        patterns.len() >= 9,
        "Expected at least 9 patterns, got {}",
        patterns.len()
    );

    // Verify specific patterns exist
    let pattern_texts: Vec<String> = patterns.iter().map(|p| p.original_pattern.clone()).collect();
    assert!(pattern_texts.contains(&"X的右手".to_string()));
    assert!(pattern_texts.contains(&"这些X".to_string()));
    assert!(pattern_texts.contains(&"在XY中".to_string()));

    // Verify priority calculation
    let zai_xy_zhong = patterns
        .iter()
        .find(|p| p.original_pattern == "在XY中")
        .expect("Pattern '在XY中' not found");
    assert_eq!(
        zai_xy_zhong.priority, 29,
        "Pattern '在XY中' should have priority 29 (2*10 + 4 + 5)"
    );
}

#[test]
fn test_index_real_patterns() {
    // Create test patterns
    let patterns_json = r#"{
        "X的右手": "tay phải của X",
        "X的左手": "tay trái của X",
        "X的眼睛": "mắt của X",
        "这些X": "những X này",
        "那些Y": "những Y kia",
        "在XY中": "ở trong X Y"
    }"#;

    let patterns_dict: HashMap<String, serde_json::Value> =
        serde_json::from_str(patterns_json).expect("Failed to parse patterns JSON");

    // Parse and index patterns
    let patterns = parse_patterns_dict(patterns_dict);
    let mut index = PatternIndex::new();
    index.index_patterns(&patterns);

    // Verify indexing
    assert!(
        index.len() >= 6,
        "Expected at least 6 patterns indexed, got {}",
        index.len()
    );

    // Test lookup by literal first token
    let zhe_patterns = index.get_patterns_by_first_token("这");
    assert_eq!(zhe_patterns.len(), 1, "Expected 1 pattern starting with '这'");
    assert_eq!(zhe_patterns[0].original_pattern, "这些X");

    let na_patterns = index.get_patterns_by_first_token("那");
    assert_eq!(na_patterns.len(), 1, "Expected 1 pattern starting with '那'");
    assert_eq!(na_patterns[0].original_pattern, "那些Y");

    let zai_patterns = index.get_patterns_by_first_token("在");
    assert_eq!(zai_patterns.len(), 1, "Expected 1 pattern starting with '在'");
    assert_eq!(zai_patterns[0].original_pattern, "在XY中");

    // Test variable-starting patterns
    let var_patterns = index.get_variable_patterns();
    assert!(
        var_patterns.len() >= 3,
        "Expected at least 3 variable-starting patterns"
    );

    // Verify variable patterns include X的右手, X的左手, X的眼睛
    let var_pattern_texts: Vec<String> =
        var_patterns.iter().map(|p| p.original_pattern.clone()).collect();
    assert!(var_pattern_texts.contains(&"X的右手".to_string()));
    assert!(var_pattern_texts.contains(&"X的左手".to_string()));
    assert!(var_pattern_texts.contains(&"X的眼睛".to_string()));
}

#[test]
fn test_complete_workflow() {
    // Complete workflow: Parse → Index → Lookup
    let patterns_json = r#"{
        "X的右手": "tay phải của X",
        "X的左手": "tay trái của X",
        "这些X": "những X này",
        "在XY中": "ở trong X Y"
    }"#;

    // Step 1: Parse JSON
    let patterns_dict: HashMap<String, serde_json::Value> =
        serde_json::from_str(patterns_json).expect("Failed to parse patterns JSON");

    // Step 2: Parse patterns
    let patterns = parse_patterns_dict(patterns_dict);
    assert_eq!(patterns.len(), 4);

    // Step 3: Create and populate index
    let mut index = PatternIndex::new();
    index.index_patterns(&patterns);

    // Step 4: Verify lookup performance
    // Simulate looking up patterns for text starting with "这"
    let candidates = index.get_patterns_by_first_token("这");
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].template, "những X này");

    // Simulate looking up variable-starting patterns
    let var_candidates = index.get_variable_patterns();
    assert_eq!(var_candidates.len(), 2); // X的右手, X的左手

    // Verify statistics
    assert_eq!(index.unique_first_tokens(), 3); // "这", "在", "__VARIABLE__"
    assert_eq!(index.len(), 4);
}
