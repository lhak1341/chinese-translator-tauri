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
    parse_pattern, parse_patterns_dict, SemanticToken, TwoPhasePatternProcessor, VariableCacheEntry,
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
fn test_pattern_categorization() {
    // Pattern 1: "X的Y" with allowAsPatternVariable: true (Phase A pattern)
    let pattern1 = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        None,
        true, // allowAsPatternVariable
        None,
    );

    // Pattern 2: "这些X" without allowAsPatternVariable (Phase B only)
    let pattern2 = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        None,
    );

    // Pattern 3: "在X眼中" without allowAsPatternVariable (Phase B only)
    let pattern3 = parse_pattern(
        "在X眼中".to_string(),
        "ở trong mắt X".to_string(),
        None,
        false,
        None,
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
        None,
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
        None,
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
        None,
    );

    // Phase B pattern: "在X中" → "ở trong X"
    let phase_b_pattern = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        None,
        false,
        None,
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
        None,
    );

    // Phase A pattern 2: "可怕的X" → "X đáng sợ"
    let pattern2 = parse_pattern(
        "可怕的X".to_string(),
        "X đáng sợ".to_string(),
        None,
        true,
        None,
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
        None,
    );

    // Phase B pattern: "X的" → "của X" (should NOT match if "X的Y" already matched)
    let phase_b_pattern = parse_pattern(
        "X的".to_string(),
        "của X".to_string(),
        None,
        false,
        None,
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
        None,
    );

    // Phase B pattern: "在X中" → "ở trong X"
    let phase_b_pattern = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        None,
        false,
        None,
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
        None,
    );

    // Pattern 2: "这些XY" → "những X Y này" (priority 29)
    let pattern2 = parse_pattern(
        "这些XY".to_string(),
        "những X Y này".to_string(),
        None,
        false,
        None,
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
        None,
    );

    // Pattern 2: "在X中" → "ở trong X"
    let pattern2 = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        None,
        false,
        None,
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

#[test]
fn test_hierarchical_composite_suppresses_phase_a_sub_match_within_its_span() {
    // Regression test: before fix, a Phase A result whose tokens fall inside the composite
    // span but OUTSIDE the specific Phase A component's tokens (hr.phase_a) would slip
    // through the used_phase_a_indices filter, producing a duplicate result alongside the
    // composite and corrupting the final output.
    //
    // Scenario (mirrors real "这栋别院中的那个男人" bug):
    //   Phase A pattern 1: "别院" → "biệt viện"   (tokens 1-2, absorbed into composite)
    //   Phase A pattern 2: "那个X" → "CÁI X KIA"  (tokens 5-7, NOT absorbed — case mismatch)
    //   Phase B pattern:   "在X中的那个人" → "cái người kia trong X"   (tokens 0-7)
    //   Composite: Phase B 0-7 + Phase A 1-2 → "cái người kia trong biệt viện"
    //   Bug: Phase A 5-7 ("CÁI NGƯỜI KIA") leaks into final results → 2 results instead of 1.

    let phase_a_pattern1 = parse_pattern(
        "别院".to_string(),
        "biệt viện".to_string(),
        None,
        true,  // allowAsPatternVariable — absorbed into composite
        None,
    );

    // Uppercase output so "CÁI NGƯỜI KIA" is not a substring of the composite's lowercase
    // translation — preventing a second hierarchical composition detection.
    let phase_a_pattern2 = parse_pattern(
        "那个X".to_string(),
        "CÁI X KIA".to_string(),
        None,
        true,  // allowAsPatternVariable — within composite span but NOT absorbed
        None,
    );

    let phase_b_pattern = parse_pattern(
        "在X中的那个人".to_string(),
        "cái người kia trong X".to_string(),
        None,
        false,
        None,
    );

    // Tokens: 在(0) 别(1) 院(2) 中(3) 的(4) 那(5) 个(6) 人(7)
    let mut tokens = vec![
        create_token("在", 0),
        create_token("别", 1),
        create_token("院", 2),
        create_token("中", 3),
        create_token("的", 4),
        create_token("那", 5),
        create_token("个", 6),
        create_token("人", 7),
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "人".to_string(),
        VariableCacheEntry {
            translation: "người".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let patterns = vec![phase_a_pattern1, phase_a_pattern2, phase_b_pattern];
    let processor = TwoPhasePatternProcessor::new(patterns);

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Must have exactly 1 result: the composite covering the full 0-7 span.
    // Before the fix this returned 2 — composite + the leaking Phase A 5-7 sub-match.
    assert_eq!(
        results.len(),
        1,
        "Composite must suppress Phase A sub-matches within its span. Got {} result(s): {:?}",
        results.len(),
        results
            .iter()
            .map(|r| format!("[{}-{}] \"{}\"", r.start_index, r.end_index, r.translation))
            .collect::<Vec<_>>()
    );

    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 7);
    assert_eq!(results[0].translation, "cái người kia trong biệt viện");
}

/// Regression test: Phase A must select the longest-span candidate globally, not the leftmost.
///
/// Before fix: greedy Phase A matched "这种X" at position 0 with X=传奇 (span=3),
/// advancing past position 2 so "传奇级X" was never tried → 传奇级武器 never entered
/// enhanced_cache → Phase B's "这种X" couldn't nest it → wrong output.
///
/// After fix: all candidates collected first; 传奇级武器 (span=4) beats 这种传奇 (span=3)
/// → Phase A selects 传奇级武器 → Phase B wraps with 这种X → hierarchical composite.
#[test]
fn test_phase_a_longest_span_wins_over_leftmost_shorter_match() {
    let phase_a_outer = parse_pattern(
        "这种X".to_string(),
        "loại X này".to_string(),
        None,
        true, // allowAsPatternVariable — kept for use as outer variable in other patterns
        None,
    );

    let phase_a_inner = parse_pattern(
        "传奇级X".to_string(),
        "X cấp truyền kỳ".to_string(),
        None,
        true, // allowAsPatternVariable — inner, feeds Phase B as variable
        None,
    );

    // Tokens: 这(0) 种(1) 传(2) 奇(3) 级(4) 武(5) 器(6)
    let mut tokens = vec![
        create_token("这", 0),
        create_token("种", 1),
        create_token("传", 2),
        create_token("奇", 3),
        create_token("级", 4),
        create_token("武", 5),
        create_token("器", 6),
    ];

    let mut variable_cache = HashMap::new();
    // 传奇 in static cache: greedy Phase A used to steal this as X in "这种X"
    variable_cache.insert(
        "传奇".to_string(),
        VariableCacheEntry {
            translation: "truyền kỳ".to_string(),
            source: "phrase".to_string(),
            var_type: Some("concept".to_string()),
        },
    );
    variable_cache.insert(
        "武器".to_string(),
        VariableCacheEntry {
            translation: "vũ khí".to_string(),
            source: "phrase".to_string(),
            var_type: Some("object".to_string()),
        },
    );

    let patterns = vec![phase_a_outer, phase_a_inner];
    let processor = TwoPhasePatternProcessor::new(patterns);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Must produce exactly one hierarchical composite covering all 7 tokens.
    assert_eq!(
        results.len(),
        1,
        "Expected 1 hierarchical composite. Got {} result(s): {:?}",
        results.len(),
        results.iter().map(|r| format!("[{}-{}] {} \"{}\"", r.start_index, r.end_index, r.source, r.translation)).collect::<Vec<_>>()
    );

    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 6);
    assert_eq!(results[0].translation, "loại vũ khí cấp truyền kỳ này");

    // Phase A component must be 传奇级武器, not 这种传奇
    let phase_a_component = results[0].phase_a.as_ref().unwrap();
    assert_eq!(phase_a_component.original_text, "传奇级武器");
    assert_eq!(phase_a_component.translation, "vũ khí cấp truyền kỳ");
}

/// Regression test: compound-word tokens must not cause equal-span tie where
/// shorter-coverage pattern wins.
///
/// Tokenizer may produce "传奇" as a single 2-char token and "武器" as a single
/// 2-char token (type chinese_word).  In that case:
///   tokens: 这(0) 种(1) 传奇(2) 级(3) 武器(4)   — 5 original tokens
///   这种X  (X=传奇): covers tokens 0-2 → original-index span = 2, chars = 4
///   传奇级X (X=武器): covers tokens 2-4 → original-index span = 2, chars = 5
/// Token-span tie (2 = 2) was previously indeterminate; char-count (4 < 5) now
/// correctly selects 传奇级X, enabling Phase B to form the correct composite.
#[test]
fn test_phase_a_char_count_wins_over_token_span_with_compound_tokens() {
    let phase_a_outer = parse_pattern(
        "这种X".to_string(),
        "loại X này".to_string(),
        None,
        true,
        None,
    );
    let phase_a_inner = parse_pattern(
        "传奇级X".to_string(),
        "X cấp truyền kỳ".to_string(),
        None,
        true,
        None,
    );

    // Compound tokens: "传奇" is a single 2-char token (original_index=2),
    // "武器" is a single 2-char token (original_index=4).
    let mut tokens = vec![
        create_token("这", 0),
        create_token("种", 1),
        create_token("传奇", 2), // compound word — 2 chars, 1 token
        create_token("级", 3),
        create_token("武器", 4), // compound word — 2 chars, 1 token
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "传奇".to_string(),
        VariableCacheEntry {
            translation: "truyền kỳ".to_string(),
            source: "phrase".to_string(),
            var_type: Some("concept".to_string()),
        },
    );
    variable_cache.insert(
        "武器".to_string(),
        VariableCacheEntry {
            translation: "vũ khí".to_string(),
            source: "phrase".to_string(),
            var_type: Some("object".to_string()),
        },
    );

    let patterns = vec![phase_a_outer, phase_a_inner];
    let processor = TwoPhasePatternProcessor::new(patterns);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Must produce exactly one hierarchical composite covering all 5 original tokens.
    assert_eq!(
        results.len(),
        1,
        "Expected 1 hierarchical composite. Got {} result(s): {:?}",
        results.len(),
        results.iter().map(|r| format!("[{}-{}] {} \"{}\"", r.start_index, r.end_index, r.source, r.translation)).collect::<Vec<_>>()
    );

    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 4);
    assert_eq!(results[0].translation, "loại vũ khí cấp truyền kỳ này");

    // Phase A component must be 传奇级武器, not 这种传奇
    let phase_a_component = results[0].phase_a.as_ref().unwrap();
    assert_eq!(phase_a_component.original_text, "传奇级武器");
}

/// Regression test: Phase B variable resolution must cover Phase A results longer than
/// DEFAULT_MAX_VARIABLE_SPAN (6 tokens).
///
/// Input: 在(0) 菲(1) 利(2) 克(3) 斯(4) 的(5) 猜(6) 测(7) 中(8)
/// Phase A: "X斯的猜测" → matches tokens 1-7 ("菲利克斯的猜测") → "suy đoán của Felix" (7 tokens)
/// Phase B: "在X中" → X must bind to the 7-token Phase A key in the enhanced cache.
/// Before the fix, MAX_VARIABLE_SPAN=6 caused the resolver to never try span=7,
/// so Phase B silently failed and tokens fell through to character-level translation.
#[test]
fn test_phase_b_variable_span_covers_long_phase_a_result() {
    // Phase A pattern: "X斯的猜测" — allowAsPatternVariable so it feeds Phase B
    let phase_a_pattern = parse_pattern(
        "X斯的猜测".to_string(),
        "suy đoán của X".to_string(),
        None,
        true,  // allowAsPatternVariable
        None,
    );

    // Phase B pattern: "在X中" — wraps the Phase A result
    let phase_b_pattern = parse_pattern(
        "在X中".to_string(),
        "Ở trong X".to_string(),
        None,
        false,
        None,
    );

    // Tokens: 在 菲 利 克 斯 的 猜 测 中  (9 tokens, indices 0-8)
    let mut tokens = vec![
        create_token("在", 0),
        create_token("菲", 1),
        create_token("利", 2),
        create_token("克", 3),
        create_token("斯", 4),
        create_token("的", 5),
        create_token("猜", 6),
        create_token("测", 7),
        create_token("中", 8),
    ];

    // Variable cache: "菲利克" (3 chars) → "Felix" so Phase A variable X resolves
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "菲利克".to_string(),
        VariableCacheEntry {
            translation: "Felix".to_string(),
            source: "proper_noun".to_string(),
            var_type: Some("person".to_string()),
        },
    );

    let patterns = vec![phase_a_pattern, phase_b_pattern];
    let processor = TwoPhasePatternProcessor::new(patterns);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Expect exactly one composite result spanning all 9 tokens (0-8)
    assert_eq!(
        results.len(),
        1,
        "Phase B '在X中' must absorb 7-token Phase A result. Got {} result(s): {:?}",
        results.len(),
        results.iter().map(|r| format!("[{}-{}] \"{}\"", r.start_index, r.end_index, r.translation)).collect::<Vec<_>>()
    );
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 8);
    assert_eq!(results[0].translation, "Ở trong suy đoán của Felix");
    assert_eq!(results[0].source, "hierarchical_composition");
}

/// Same as test_longer_pattern_beats_shorter_phase_a but via JSON round-trip (mirrors WASM path)
#[test]
fn test_longer_pattern_via_json_roundtrip() {
    let patterns_json = r#"{
        "X的手腕": {"allowAsPatternVariable":true,"allowedVariableTypes":{"X":["person","character"]},"semanticType":"object","translation":"cổ tay X"},
        "X的手腕上": {"allowAsPatternVariable":false,"allowedVariableTypes":{"X":["character"]},"translation":"trên cổ tay X"}
    }"#;
    let tokens_json = r#"[
        {"value":"还","originalIndex":0,"hasPrecedingBoundary":false},
        {"value":"有","originalIndex":1,"hasPrecedingBoundary":false},
        {"value":"他","originalIndex":2,"hasPrecedingBoundary":false},
        {"value":"的","originalIndex":3,"hasPrecedingBoundary":false},
        {"value":"手","originalIndex":4,"hasPrecedingBoundary":false},
        {"value":"腕","originalIndex":5,"hasPrecedingBoundary":false},
        {"value":"上","originalIndex":6,"hasPrecedingBoundary":false}
    ]"#;
    let cache_json = r#"{"他":{"translation":"hắn","source":"phrases_pattern_variable","type":"character"}}"#;

    let patterns_map: std::collections::HashMap<String, serde_json::Value> = serde_json::from_str(patterns_json).unwrap();
    let patterns = parse_patterns_dict(patterns_map);
    let processor = TwoPhasePatternProcessor::new(patterns);

    let mut tokens: Vec<SemanticToken> = serde_json::from_str(tokens_json).unwrap();
    let cache: HashMap<String, VariableCacheEntry> = serde_json::from_str(cache_json).unwrap();

    let results = processor.process_tokens(&mut tokens, &cache);

    assert_eq!(results.len(), 1, "Expected 1 result, got: {:?}", results.iter().map(|r| format!("{} -> {}", r.original_text, r.translation)).collect::<Vec<_>>());
    assert_eq!(results[0].original_text, "他的手腕上");
    assert_eq!(results[0].translation, "trên cổ tay hắn");
}

/// Exact production replica: uses verbatim tokens/cache JSON from the browser debug log
#[test]
fn test_production_exact_json_replica() {
    let tokens_json = r#"[
        {"translated":null,"isGrouped":false,"groupedWith":[],"groupLeader":null,"type":"chinese_char","value":"还","start":0,"end":1,"originalIndex":0,"hasPrecedingBoundary":false},
        {"translated":null,"isGrouped":false,"groupedWith":[],"groupLeader":null,"type":"chinese_char","value":"有","start":1,"end":2,"originalIndex":1,"hasPrecedingBoundary":false},
        {"translated":null,"isGrouped":false,"groupedWith":[],"groupLeader":null,"type":"chinese_char","value":"他","start":2,"end":3,"originalIndex":2,"hasPrecedingBoundary":false},
        {"translated":null,"isGrouped":false,"groupedWith":[],"groupLeader":null,"type":"chinese_char","value":"的","start":3,"end":4,"originalIndex":3,"hasPrecedingBoundary":false},
        {"translated":null,"isGrouped":false,"groupedWith":[],"groupLeader":null,"type":"chinese_char","value":"手","start":4,"end":5,"originalIndex":4,"hasPrecedingBoundary":false},
        {"translated":null,"isGrouped":false,"groupedWith":[],"groupLeader":null,"type":"chinese_char","value":"腕","start":5,"end":6,"originalIndex":5,"hasPrecedingBoundary":false},
        {"translated":null,"isGrouped":false,"groupedWith":[],"groupLeader":null,"type":"chinese_char","value":"上","start":6,"end":7,"originalIndex":6,"hasPrecedingBoundary":false}
    ]"#;
    let cache_json = r#"{"他":{"translation":"hắn","source":"phrases_pattern_variable","type":"character"}}"#;
    let patterns_json = r#"{
        "X的手腕": {"allowAsPatternVariable":true,"allowedVariableTypes":{"X":["person","character"]},"semanticType":"object","translation":"cổ tay X"},
        "X的手腕上": {"allowAsPatternVariable":false,"allowedVariableTypes":{"X":["character"]},"translation":"trên cổ tay X"}
    }"#;

    let patterns_map: std::collections::HashMap<String, serde_json::Value> = serde_json::from_str(patterns_json).unwrap();
    let patterns = parse_patterns_dict(patterns_map);
    let processor = TwoPhasePatternProcessor::new(patterns);

    let mut tokens: Vec<SemanticToken> = serde_json::from_str(tokens_json).unwrap();
    let cache: HashMap<String, VariableCacheEntry> = serde_json::from_str(cache_json).unwrap();

    let results = processor.process_tokens(&mut tokens, &cache);

    assert_eq!(results.len(), 1, "got: {:?}", results.iter().map(|r| format!("{}→{} [{}]", r.original_text, r.translation, r.source)).collect::<Vec<_>>());
    assert_eq!(results[0].original_text, "他的手腕上");
    assert_eq!(results[0].translation, "trên cổ tay hắn");
}

/// Regression test: "X的手腕上" (longer, Phase B only) must beat "X的手腕" (shorter, Phase A)
/// Input: 还有他的手腕上 → tokens [还,有,他,的,手,腕,上] each a single char
/// "X的手腕"  allowAsPatternVariable=true,  allowedVariableTypes={X:["person","character"]}
/// "X的手腕上" allowAsPatternVariable=false, allowedVariableTypes={X:["character"]}
/// Variable cache: 他 → {type:"character", translation:"hắn"}
/// Expected: "X的手腕上" wins → translation "trên cổ tay hắn"
#[test]
fn test_longer_pattern_beats_shorter_phase_a() {
    let mut allowed_short = HashMap::new();
    allowed_short.insert("X".to_string(), vec!["person".to_string(), "character".to_string()]);

    let mut allowed_long = HashMap::new();
    allowed_long.insert("X".to_string(), vec!["character".to_string()]);

    let pattern_short = parse_pattern(
        "X的手腕".to_string(),
        "cổ tay X".to_string(),
        Some(allowed_short),
        true,  // allowAsPatternVariable
        Some("object".to_string()),
    );
    let pattern_long = parse_pattern(
        "X的手腕上".to_string(),
        "trên cổ tay X".to_string(),
        Some(allowed_long),
        false, // NOT allowAsPatternVariable
        None,
    );

    let processor = TwoPhasePatternProcessor::new(vec![pattern_short, pattern_long]);

    // Tokens: 还(0) 有(1) 他(2) 的(3) 手(4) 腕(5) 上(6)
    let mut tokens = vec![
        create_token("还", 0),
        create_token("有", 1),
        create_token("他", 2),
        create_token("的", 3),
        create_token("手", 4),
        create_token("腕", 5),
        create_token("上", 6),
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "他".to_string(),
        VariableCacheEntry {
            translation: "hắn".to_string(),
            source: "phrases_pattern_variable".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let results = processor.process_tokens(&mut tokens, &variable_cache);

    assert_eq!(results.len(), 1, "Expected exactly one result, got: {:?}", results.iter().map(|r| format!("{} -> {}", r.original_text, r.translation)).collect::<Vec<_>>());
    assert_eq!(results[0].original_text, "他的手腕上", "Expected longer pattern to win");
    assert_eq!(results[0].translation, "trên cổ tay hắn");
}

/// Regression test: `select_non_overlapping_phase_a`'s composite-coverage bonus must let a
/// SHORTER Phase A candidate beat a longer one when the shorter one lets Phase B form a
/// longer overall composite. Own-char-count alone would pick the wrong candidate here.
///
/// Mirrors the worked example in two_phase.rs's `select_non_overlapping_phase_a` doc comment.
///
/// Input: 这(0) 只(1) 刍(2) 吾(3) 的(4) 速(5) 度(6)
///   - "刍吾的速度" (tokens 2-6, 5 chars, own) — literal Phase A phrase, type "concept".
///     No Phase B pattern accepts a "concept"-typed X here → bonus 0 → score 5.
///   - "这只刍吾" (tokens 0-3, 4 chars, own) — Phase A "这只X", X="刍吾" resolves to
///     "character" via variable_cache. Phase B "X的速度" accepts "character"-typed X and its
///     trailing literal "的速度" (3 chars) immediately follows → bonus 3 → score 7.
/// 7 > 5: "这只刍吾" must win the overlap, letting Phase B compose the full 7-char result.
#[test]
fn test_phase_a_composite_bonus_wins_over_larger_own_span() {
    let mut literal_type = HashMap::new();
    literal_type.insert("X".to_string(), vec!["character".to_string()]);

    // Literal Phase A phrase — no variable — type "concept". Only eligible as a candidate
    // in its own right; contributes nothing to any pattern's composite bonus (no "X" token).
    let pattern_literal = parse_pattern(
        "刍吾的速度".to_string(),
        "tốc độ của sinh vật".to_string(),
        None,
        true, // allowAsPatternVariable
        Some("concept".to_string()),
    );

    // Phase A wrapper — X restricted to "character" so it never contends with the
    // literal "concept"-typed candidate above.
    let pattern_wrapper = parse_pattern(
        "这只X".to_string(),
        "con X này".to_string(),
        Some(literal_type.clone()),
        true, // allowAsPatternVariable
        Some("$X".to_string()),
    );

    // Phase B-only pattern — the composite bonus source. X restricted to "character" so
    // the "concept"-typed literal candidate is type-gated out of its bonus.
    let pattern_phase_b = parse_pattern(
        "X的速度".to_string(),
        "tốc độ của X".to_string(),
        Some(literal_type),
        false, // NOT allowAsPatternVariable — Phase B only
        None,
    );

    let mut tokens = vec![
        create_token("这", 0),
        create_token("只", 1),
        create_token("刍", 2),
        create_token("吾", 3),
        create_token("的", 4),
        create_token("速", 5),
        create_token("度", 6),
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "刍吾".to_string(),
        VariableCacheEntry {
            translation: "sinh vật".to_string(),
            source: "phrase".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let processor = TwoPhasePatternProcessor::new(vec![pattern_literal, pattern_wrapper, pattern_phase_b]);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    assert_eq!(
        results.len(),
        1,
        "Expected 1 hierarchical composite. Got {} result(s): {:?}",
        results.len(),
        results.iter().map(|r| format!("[{}-{}] {} \"{}\"", r.start_index, r.end_index, r.source, r.translation)).collect::<Vec<_>>()
    );

    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 6);

    // The decisive assertion: the composite bonus must have picked "这只刍吾" (own 4 + bonus 3
    // = 7) over "刍吾的速度" (own 5 + bonus 0 = 5). Own-char-count alone would pick the latter.
    let phase_a_component = results[0].phase_a.as_ref().unwrap();
    assert_eq!(phase_a_component.original_text, "这只刍吾");
    assert_eq!(phase_a_component.translation, "con sinh vật này");
}
