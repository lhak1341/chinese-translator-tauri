/**
 * Integration tests for pattern matching algorithm
 *
 * Tests the complete pattern matching workflow including literal matching,
 * variable resolution, template substitution, and backtracking.
 */

use translation_wasm_core::pattern_processor::{
    build_result, find_best_pattern_match, parse_pattern, PatternMatcher, SemanticToken,
    VariableCacheEntry, DEFAULT_MAX_VARIABLE_SPAN,
};
use std::collections::HashMap;

/// Helper to create a semantic token
fn create_token(value: &str, index: usize) -> SemanticToken {
    SemanticToken {
        value: value.to_string(),
        original_index: index,
        protected_by_phase_a: None,
        phase_a_result: None,
        translation_source: None,
        has_preceding_boundary: false,
    }
}

#[test]
fn test_simple_literal_pattern_match() {
    // Pattern: "这些" (literal only, no variables)
    let pattern = parse_pattern(
        "这些".to_string(),
        "những".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["这", "些"]
    let tokens = vec![create_token("这", 0), create_token("些", 1)];

    let cache = HashMap::new();
    let matcher = PatternMatcher::new(&cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(result.success, "Pattern should match");
    assert_eq!(result.result.as_ref().unwrap(), "những");
    assert_eq!(result.matched_tokens.as_ref().unwrap().len(), 2);
}

#[test]
fn test_single_variable_pattern_match() {
    // Pattern: "这些X" → "những X này"
    let pattern = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["这", "些", "人"]
    let tokens = vec![
        create_token("这", 0),
        create_token("些", 1),
        create_token("人", 2),
    ];

    // Variable cache: "人" → "người"
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "人".to_string(),
        VariableCacheEntry {
            translation: "người".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let matcher = PatternMatcher::new(&variable_cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(result.success, "Pattern should match");
    assert_eq!(result.result.as_ref().unwrap(), "những người này");
    assert_eq!(result.matched_tokens.as_ref().unwrap().len(), 3);

    // Verify variable resolution
    let variables = result.variables.as_ref().unwrap();
    assert_eq!(variables.get("X").unwrap(), "người");
}

#[test]
fn test_multi_variable_pattern_match() {
    // Pattern: "X的Y" → "Y của X"
    let pattern = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["张三", "的", "手"]
    let tokens = vec![
        create_token("张三", 0),
        create_token("的", 1),
        create_token("手", 2),
    ];

    // Variable cache
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "张三".to_string(),
        VariableCacheEntry {
            translation: "Trương Tam".to_string(),
            source: "proper-noun".to_string(),
            var_type: Some("proper-noun".to_string()),
        },
    );
    variable_cache.insert(
        "手".to_string(),
        VariableCacheEntry {
            translation: "tay".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let matcher = PatternMatcher::new(&variable_cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(result.success, "Pattern should match");
    assert_eq!(result.result.as_ref().unwrap(), "tay của Trương Tam");

    // Verify both variables resolved
    let variables = result.variables.as_ref().unwrap();
    assert_eq!(variables.get("X").unwrap(), "Trương Tam");
    assert_eq!(variables.get("Y").unwrap(), "tay");
}

#[test]
fn test_multi_token_variable_resolution() {
    // Pattern: "在X眼中" → "ở trong mắt X"
    let pattern = parse_pattern(
        "在X眼中".to_string(),
        "ở trong mắt X".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["在", "那些", "魔帅", "眼", "中"]
    // X should resolve to "那些魔帅" (2 tokens)
    let tokens = vec![
        create_token("在", 0),
        create_token("那些", 1),
        create_token("魔帅", 2),
        create_token("眼", 3),
        create_token("中", 4),
    ];

    // Variable cache - need to cache multi-token combination
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "那些魔帅".to_string(),
        VariableCacheEntry {
            translation: "những ma soái kia".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let matcher = PatternMatcher::new(&variable_cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(result.success, "Pattern should match with multi-token variable");
    assert_eq!(
        result.result.as_ref().unwrap(),
        "ở trong mắt những ma soái kia"
    );

    // Verify X resolved to multi-token phrase
    let variables = result.variables.as_ref().unwrap();
    assert_eq!(variables.get("X").unwrap(), "những ma soái kia");

    // Verify all 5 tokens were matched
    assert_eq!(result.matched_tokens.as_ref().unwrap().len(), 5);
}

#[test]
fn test_variable_backtracking_with_lookahead() {
    // Pattern: "XY" where both X and Y are variables
    // Test that backtracking works correctly
    let pattern = parse_pattern("XY".to_string(), "X Y".to_string(), None, false, false, None);

    // Tokens: ["那些", "人"]
    let tokens = vec![create_token("那些", 0), create_token("人", 1)];

    // Variable cache - both "那些" and "那些人" exist
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "那些".to_string(),
        VariableCacheEntry {
            translation: "những kia".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );
    variable_cache.insert(
        "那些人".to_string(),
        VariableCacheEntry {
            translation: "những người kia".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );
    variable_cache.insert(
        "人".to_string(),
        VariableCacheEntry {
            translation: "người".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let matcher = PatternMatcher::new(&variable_cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(result.success, "Pattern should match with backtracking");

    // Should resolve to: X="那些", Y="人" (not X="那些人" because Y needs a token)
    let variables = result.variables.as_ref().unwrap();
    assert_eq!(variables.get("X").unwrap(), "những kia");
    assert_eq!(variables.get("Y").unwrap(), "người");
}

#[test]
fn test_pattern_match_failure_not_enough_tokens() {
    // Pattern: "这些XY"
    let pattern = parse_pattern(
        "这些XY".to_string(),
        "những X Y này".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["这", "些"] - not enough for two variables
    let tokens = vec![create_token("这", 0), create_token("些", 1)];

    let cache = HashMap::new();
    let matcher = PatternMatcher::new(&cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(!result.success, "Pattern should fail - not enough tokens");
}

#[test]
fn test_pattern_match_failure_literal_mismatch() {
    // Pattern: "这些X"
    let pattern = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["那", "些", "人"] - first literal doesn't match
    let tokens = vec![
        create_token("那", 0),
        create_token("些", 1),
        create_token("人", 2),
    ];

    let cache = HashMap::new();
    let matcher = PatternMatcher::new(&cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(!result.success, "Pattern should fail - literal mismatch");
}

#[test]
fn test_pattern_match_failure_variable_not_in_cache() {
    // Pattern: "这些X"
    let pattern = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["这", "些", "未知"]
    let tokens = vec![
        create_token("这", 0),
        create_token("些", 1),
        create_token("未知", 2),
    ];

    // Empty variable cache - "未知" not cached
    let cache = HashMap::new();
    let matcher = PatternMatcher::new(&cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(
        !result.success,
        "Pattern should fail - variable not in cache"
    );
}

#[test]
fn test_build_result_with_complex_template() {
    let template = "ở trong X Y";
    let mut variables = HashMap::new();
    variables.insert("X".to_string(), "sóng âm".to_string());
    variables.insert("Y".to_string(), "đáng sợ".to_string());

    let result = build_result(template, &variables);
    assert_eq!(result, "ở trong sóng âm đáng sợ");
}

/// Pattern competition tests
#[test]
fn test_pattern_competition_higher_priority_wins() {
    // Create two patterns with different priorities:
    // "这些X" (1 var, 3 tokens, literal first) → priority 18
    // "这些XY" (2 vars, 4 tokens, literal first) → priority 29
    let pattern1 = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
        None,
    );
    let pattern2 = parse_pattern(
        "这些XY".to_string(),
        "những X Y này".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["这", "些", "人", "强大"]
    let tokens = vec![
        create_token("这", 0),
        create_token("些", 1),
        create_token("人", 2),
        create_token("强大", 3),
    ];

    // Variable cache
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "人".to_string(),
        VariableCacheEntry {
            translation: "người".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
        },
    );
    variable_cache.insert(
        "强大".to_string(),
        VariableCacheEntry {
            translation: "mạnh mẽ".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let patterns = vec![pattern1, pattern2];
    let best_match = find_best_pattern_match(&patterns, &tokens, 0, &variable_cache, DEFAULT_MAX_VARIABLE_SPAN);

    assert!(best_match.is_some(), "Should find a match");
    let result = best_match.unwrap();
    assert_eq!(result.pattern_id.as_deref().unwrap(), "这些XY");
    assert_eq!(result.result.as_ref().unwrap(), "những người mạnh mẽ này");
}

#[test]
fn test_pattern_competition_low_priority_loses() {
    // Critical test from PATTERN_MATCHING_RUST_CONVERSION.md:
    // "在XY中" (lowPriority: true) → priority 17
    // "在X眼中" (normal priority) → priority 19
    // Should select "在X眼中" when both match
    let pattern_generic = parse_pattern(
        "在XY中".to_string(),
        "ở trong X Y".to_string(),
        None,
        false,
        true, // lowPriority = true → -12 penalty
        None,
    );
    let pattern_specific = parse_pattern(
        "在X眼中".to_string(),
        "ở trong mắt X".to_string(),
        None,
        false,
        false,
        None,
    );

    // Verify priorities are calculated correctly
    assert_eq!(pattern_generic.priority, 17); // 2*10 + 4 + 5 - 12 = 17
    assert_eq!(pattern_specific.priority, 19); // 1*10 + 4 + 5 = 19

    // Tokens: ["在", "那些", "魔帅", "眼", "中"]
    let tokens = vec![
        create_token("在", 0),
        create_token("那些", 1),
        create_token("魔帅", 2),
        create_token("眼", 3),
        create_token("中", 4),
    ];

    // Variable cache
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "那些魔帅".to_string(),
        VariableCacheEntry {
            translation: "những ma soái kia".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let patterns = vec![pattern_generic, pattern_specific];
    let best_match = find_best_pattern_match(&patterns, &tokens, 0, &variable_cache, DEFAULT_MAX_VARIABLE_SPAN);

    assert!(best_match.is_some(), "Should find a match");
    let result = best_match.unwrap();

    // Should select "在X眼中" (priority 19) over "在XY中" (priority 17)
    assert_eq!(result.pattern_id.as_deref().unwrap(), "在X眼中");
    assert_eq!(
        result.result.as_ref().unwrap(),
        "ở trong mắt những ma soái kia"
    );
}

#[test]
fn test_variable_blocked_by_preceding_punctuation_boundary() {
    // "那柄X" must NOT match "那柄『天琊』".
    // 『』 are stripped from semantic tokens, but hasPrecedingBoundary=true is set
    // on "天琊" because "『" was skipped before it.
    let pattern = parse_pattern(
        "那柄X".to_string(),
        "cái X kia".to_string(),
        None,
        false,
        false,
        None,
    );

    let tokens = vec![
        create_token("那", 0),
        create_token("柄", 1),
        // "天琊" has hasPrecedingBoundary=true because "『" (originalIndex=2) was skipped
        SemanticToken {
            value: "天琊".to_string(),
            original_index: 3,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
            has_preceding_boundary: true,
        },
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "天琊".to_string(),
        VariableCacheEntry {
            translation: "Thiên Gia".to_string(),
            source: "proper-noun".to_string(),
            var_type: Some("proper-noun".to_string()),
        },
    );

    let patterns = vec![pattern];
    let result = find_best_pattern_match(&patterns, &tokens, 0, &variable_cache, DEFAULT_MAX_VARIABLE_SPAN);
    assert!(result.is_none(), "那柄X must not match when 『』 precede the variable");
}

#[test]
fn test_variable_without_boundary_still_matches() {
    // Same pattern "那柄X" DOES match "那柄天琊" (no punctuation boundary).
    let pattern = parse_pattern(
        "那柄X".to_string(),
        "cái X kia".to_string(),
        None,
        false,
        false,
        None,
    );

    let tokens = vec![
        create_token("那", 0),
        create_token("柄", 1),
        create_token("天琊", 2),
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "天琊".to_string(),
        VariableCacheEntry {
            translation: "Thiên Gia".to_string(),
            source: "proper-noun".to_string(),
            var_type: Some("proper-noun".to_string()),
        },
    );

    let patterns = vec![pattern];
    let result = find_best_pattern_match(&patterns, &tokens, 0, &variable_cache, DEFAULT_MAX_VARIABLE_SPAN);
    assert!(result.is_some(), "那柄X must match when no punctuation boundary");
    assert_eq!(result.unwrap().result.as_deref().unwrap(), "cái Thiên Gia kia");
}

#[test]
fn test_pattern_competition_no_match() {
    // Pattern that won't match
    let pattern = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
        None,
    );

    // Tokens: ["那", "些", "人"] - first literal doesn't match
    let tokens = vec![
        create_token("那", 0),
        create_token("些", 1),
        create_token("人", 2),
    ];

    let patterns = vec![pattern];
    let best_match = find_best_pattern_match(&patterns, &tokens, 0, &HashMap::new(), DEFAULT_MAX_VARIABLE_SPAN);

    assert!(best_match.is_none(), "Should not find a match");
}
