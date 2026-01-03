/**
 * Integration tests for two-phase pattern processing
 *
 * Tests the complete two-phase workflow including:
 * - Phase A: Variable patterns only (allowAsPatternVariable: true)
 * - Phase B: All patterns with Phase A results as enhanced variables
 * - Hierarchical composition detection
 * - Result selection with overlap removal
 */

use translation_wasm_core::pattern_processor::{
    parse_pattern, SemanticToken, TwoPhasePatternProcessor, VariableCacheEntry,
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
    }
}

#[test]
fn test_pattern_categorization() {
    // Pattern 1: "X的Y" with allowAsPatternVariable: true (Phase A pattern)
    let pattern1 = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        None,
        true, // allowAsPatternVariable
        false,
    );

    // Pattern 2: "这些X" without allowAsPatternVariable (Phase B only)
    let pattern2 = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
    );

    // Pattern 3: "在X眼中" without allowAsPatternVariable (Phase B only)
    let pattern3 = parse_pattern(
        "在X眼中".to_string(),
        "ở trong mắt X".to_string(),
        None,
        false,
        false,
    );

    let patterns = vec![pattern1, pattern2, pattern3];
    let processor = TwoPhasePatternProcessor::new(patterns);

    // Check categorization
    let stats = processor.get_statistics();
    assert_eq!(stats.variable_patterns, 1); // Only "X的Y" has allowAsPatternVariable
    assert_eq!(stats.composite_eligible, 2); // "这些X" and "在X眼中" (single-variable)
    assert_eq!(stats.total_patterns, 3);
}

#[test]
fn test_phase_a_processing() {
    // Pattern: "X的Y" → "Y của X" (Phase A pattern)
    let pattern = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        None,
        true, // allowAsPatternVariable
        false,
    );

    // Tokens: ["张三", "的", "手"]
    let mut tokens = vec![
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

    let patterns = vec![pattern];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should have 1 Phase A result
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].source, "phaseA");
    assert_eq!(results[0].original_text, "张三的手");
    assert_eq!(results[0].translation, "tay của Trương Tam");
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 2);
}

#[test]
fn test_phase_b_processing_without_phase_a() {
    // Pattern: "这些X" → "những X này" (Phase B only, no Phase A patterns)
    let pattern = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
    );

    // Tokens: ["这", "些", "人"]
    let mut tokens = vec![
        create_token("这", 0),
        create_token("些", 1),
        create_token("人", 2),
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

    let patterns = vec![pattern];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should have 1 Phase B result
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].source, "phaseB");
    assert_eq!(results[0].original_text, "这些人");
    assert_eq!(results[0].translation, "những người này");
}

#[test]
fn test_hierarchical_composition_detection() {
    // Phase A pattern: "可怕的X" → "X đáng sợ"
    let phase_a_pattern = parse_pattern(
        "可怕的X".to_string(),
        "X đáng sợ".to_string(),
        None,
        true, // allowAsPatternVariable
        false,
    );

    // Phase B pattern: "在X中" → "ở trong X"
    let phase_b_pattern = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        None,
        false,
        false,
    );

    // Tokens: ["在", "可", "怕", "的", "声波", "振荡", "中"]
    // Note: "可怕" must be tokenized as ["可", "怕"] to match pattern "可怕的X"
    // Phase A should match "可怕的声波振荡" → "sóng âm chấn đãng đáng sợ"
    // Phase B should then use that as variable X in "在X中"
    let mut tokens = vec![
        create_token("在", 0),
        create_token("可", 1),
        create_token("怕", 2),
        create_token("的", 3),
        create_token("声波", 4),
        create_token("振荡", 5),
        create_token("中", 6),
    ];

    // Variable cache
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "声波振荡".to_string(),
        VariableCacheEntry {
            translation: "sóng âm chấn đãng".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let patterns = vec![phase_a_pattern, phase_b_pattern];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should detect hierarchical composition
    // Expected: Phase B "ở trong X" uses Phase A "X đáng sợ" result
    // Final: "ở trong sóng âm chấn đãng đáng sợ"

    // Find the hierarchical composition result
    let hierarchical = results
        .iter()
        .find(|r| r.source == "hierarchical_composition");

    assert!(
        hierarchical.is_some(),
        "Should detect hierarchical composition"
    );

    let result = hierarchical.unwrap();
    assert_eq!(
        result.translation,
        "ở trong sóng âm chấn đãng đáng sợ"
    );
    assert!(result.phase_a.is_some());
    assert!(result.phase_b.is_some());

    // Verify Phase A component
    let phase_a = result.phase_a.as_ref().unwrap();
    assert_eq!(phase_a.translation, "sóng âm chấn đãng đáng sợ");
    assert_eq!(phase_a.original_text, "可怕的声波振荡");

    // Verify Phase B component
    let phase_b = result.phase_b.as_ref().unwrap();
    assert_eq!(phase_b.original_text, "在可怕的声波振荡中"); // Full span including variable
}

#[test]
fn test_multiple_phase_a_results() {
    // Phase A pattern 1: "X的Y" → "Y của X"
    let pattern1 = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        None,
        true,
        false,
    );

    // Phase A pattern 2: "可怕的X" → "X đáng sợ"
    let pattern2 = parse_pattern(
        "可怕的X".to_string(),
        "X đáng sợ".to_string(),
        None,
        true,
        false,
    );

    // Tokens: ["张三", "的", "手", "可", "怕", "的", "样子"]
    // Note: "可怕" must be tokenized as ["可", "怕"] to match pattern "可怕的X"
    let mut tokens = vec![
        create_token("张三", 0),
        create_token("的", 1),
        create_token("手", 2),
        create_token("可", 3),
        create_token("怕", 4),
        create_token("的", 5),
        create_token("样子", 6),
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
    variable_cache.insert(
        "样子".to_string(),
        VariableCacheEntry {
            translation: "dáng vẻ".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let patterns = vec![pattern1, pattern2];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should have 2 Phase A results (both patterns match)
    let phase_a_results: Vec<_> = results.iter().filter(|r| r.source == "phaseA").collect();
    assert_eq!(phase_a_results.len(), 2);

    // First result: "张三的手" → "tay của Trương Tam"
    let result1 = phase_a_results
        .iter()
        .find(|r| r.original_text == "张三的手")
        .unwrap();
    assert_eq!(result1.translation, "tay của Trương Tam");

    // Second result: "可怕的样子" → "dáng vẻ đáng sợ"
    let result2 = phase_a_results
        .iter()
        .find(|r| r.original_text == "可怕的样子")
        .unwrap();
    assert_eq!(result2.translation, "dáng vẻ đáng sợ");
}

#[test]
fn test_token_protection_by_phase_a() {
    // Phase A pattern: "X的Y" → "Y của X"
    let phase_a_pattern = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        None,
        true,
        false,
    );

    // Phase B pattern: "X的" → "của X" (should NOT match if "X的Y" already matched)
    let phase_b_pattern = parse_pattern(
        "X的".to_string(),
        "của X".to_string(),
        None,
        false,
        false,
    );

    // Tokens: ["张三", "的", "手"]
    let mut tokens = vec![
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

    let patterns = vec![phase_a_pattern, phase_b_pattern];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should have 1 result (Phase A "X的Y"), Phase B "X的" should be blocked
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].source, "phaseA");
    assert_eq!(results[0].translation, "tay của Trương Tam");

    // Verify tokens are marked as protected
    assert_eq!(tokens[0].protected_by_phase_a, Some(true));
    assert_eq!(tokens[1].protected_by_phase_a, Some(true));
    assert_eq!(tokens[2].protected_by_phase_a, Some(true));
}

#[test]
fn test_phase_b_enhanced_variable_resolution() {
    // Phase A pattern: "可怕的X" → "X đáng sợ"
    let phase_a_pattern = parse_pattern(
        "可怕的X".to_string(),
        "X đáng sợ".to_string(),
        None,
        true,
        false,
    );

    // Phase B pattern: "在X中" → "ở trong X"
    let phase_b_pattern = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        None,
        false,
        false,
    );

    // Tokens: ["在", "可", "怕", "的", "声波", "中"]
    // Note: "可怕" must be tokenized as ["可", "怕"] to match pattern "可怕的X"
    let mut tokens = vec![
        create_token("在", 0),
        create_token("可", 1),
        create_token("怕", 2),
        create_token("的", 3),
        create_token("声波", 4),
        create_token("中", 5),
    ];

    // Variable cache (only has "声波" individually)
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "声波".to_string(),
        VariableCacheEntry {
            translation: "sóng âm".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let patterns = vec![phase_a_pattern, phase_b_pattern];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Phase A should match "可怕的声波" → "sóng âm đáng sợ"
    // Phase B should then be able to use "可怕的声波" as a variable (from Phase A result)
    // Phase B should match "在X中" where X="可怕的声波" (enhanced variable cache)

    // Find hierarchical composition result
    let hierarchical = results
        .iter()
        .find(|r| r.source == "hierarchical_composition");

    assert!(
        hierarchical.is_some(),
        "Phase B should use Phase A result as enhanced variable"
    );

    let result = hierarchical.unwrap();
    assert_eq!(result.translation, "ở trong sóng âm đáng sợ");
}

#[test]
fn test_result_selection_with_overlaps() {
    // Pattern 1: "这些X" → "những X này" (priority 18)
    let pattern1 = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
    );

    // Pattern 2: "这些XY" → "những X Y này" (priority 29)
    let pattern2 = parse_pattern(
        "这些XY".to_string(),
        "những X Y này".to_string(),
        None,
        false,
        false,
    );

    // Tokens: ["这", "些", "人", "强大"]
    let mut tokens = vec![
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
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should select longer pattern "这些XY" over "这些X" (overlap removal)
    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].pattern.as_ref().unwrap().original_pattern,
        "这些XY"
    );
    assert_eq!(results[0].translation, "những người mạnh mẽ này");
}

#[test]
fn test_non_overlapping_patterns() {
    // Pattern 1: "这些X" → "những X này"
    let pattern1 = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        false,
    );

    // Pattern 2: "在X中" → "ở trong X"
    let pattern2 = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        None,
        false,
        false,
    );

    // Tokens: ["这", "些", "人", "在", "这", "里", "中"]
    // Two non-overlapping patterns should both be selected
    let mut tokens = vec![
        create_token("这", 0),
        create_token("些", 1),
        create_token("人", 2),
        create_token("在", 3),
        create_token("这", 4),
        create_token("里", 5),
        create_token("中", 6),
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
        "这里".to_string(),
        VariableCacheEntry {
            translation: "đây".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let patterns = vec![pattern1, pattern2];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should have 2 results (no overlap)
    assert_eq!(results.len(), 2);

    // Verify both patterns matched
    let result1 = results.iter().find(|r| r.start_index == 0).unwrap();
    assert_eq!(result1.translation, "những người này");

    let result2 = results.iter().find(|r| r.start_index == 3).unwrap();
    assert_eq!(result2.translation, "ở trong đây");
}
