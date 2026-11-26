/*!
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
            ordinal: None,
        },
    );
    variable_cache.insert(
        "手".to_string(),
        VariableCacheEntry {
            translation: "tay".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
            ordinal: None,
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
            ordinal: None,
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
            ordinal: None,
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
            ordinal: None,
        },
    );
    variable_cache.insert(
        "手".to_string(),
        VariableCacheEntry {
            translation: "tay".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
            ordinal: None,
        },
    );
    variable_cache.insert(
        "样子".to_string(),
        VariableCacheEntry {
            translation: "dáng vẻ".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
            ordinal: None,
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
            ordinal: None,
        },
    );
    variable_cache.insert(
        "手".to_string(),
        VariableCacheEntry {
            translation: "tay".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
            ordinal: None,
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
            ordinal: None,
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
    // Pattern 1: "这些X" → "những X này" (priority -2)
    let pattern1 = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        None,
    );

    // Pattern 2: "这些XY" → "những X Y này" (priority -11)
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
            ordinal: None,
        },
    );
    variable_cache.insert(
        "强大".to_string(),
        VariableCacheEntry {
            translation: "mạnh mẽ".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
            ordinal: None,
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
            ordinal: None,
        },
    );
    variable_cache.insert(
        "这里".to_string(),
        VariableCacheEntry {
            translation: "đây".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
            ordinal: None,
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
            ordinal: None,
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
            ordinal: None,
        },
    );
    variable_cache.insert(
        "武器".to_string(),
        VariableCacheEntry {
            translation: "vũ khí".to_string(),
            source: "phrase".to_string(),
            var_type: Some("object".to_string()),
            ordinal: None,
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
            ordinal: None,
        },
    );
    variable_cache.insert(
        "武器".to_string(),
        VariableCacheEntry {
            translation: "vũ khí".to_string(),
            source: "phrase".to_string(),
            var_type: Some("object".to_string()),
            ordinal: None,
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
            ordinal: None,
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
            ordinal: None,
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
///
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
            ordinal: None,
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

#[test]
fn test_phase_a_priority_tiebreak_lets_inner_wrapper_compose_with_outer_pattern() {
    // Regression for "这位前辈的丹药" (2026-08-29): unlike the composite-bonus test above,
    // here BOTH the inner wrapper "这位X" and the outer "X的Y" have
    // allowAsPatternVariable=true, so they compete directly in Phase A over overlapping
    // spans, and their composite scores land on an EXACT TIE:
    //   "这位X"  matches "这位前辈" — own 4 chars + bonus 1 (trailing "的" from "X的Y") = 5
    //   "X的Y"   matches "前辈的丹药" — own 5 chars + bonus 0 = 5
    // Before `calculate_priority` was fixed to favor fewer variables, the tie-break
    // picked "X的Y" (2 vars) over "这位X" (1 var), so "这位" translated standalone and
    // never composed with the outer pattern. It must now resolve to one 7-char
    // hierarchical composite: "đan dược của vị tiền bối này".
    let mut inner_types = HashMap::new();
    inner_types.insert(
        "X".to_string(),
        vec![
            "character".to_string(),
            "creature".to_string(),
            "organization".to_string(),
        ],
    );
    let pattern_inner = parse_pattern(
        "这位X".to_string(),
        "vị X này".to_string(),
        Some(inner_types),
        true, // allowAsPatternVariable
        Some("$X".to_string()),
    );

    let mut outer_types = HashMap::new();
    outer_types.insert(
        "X".to_string(),
        vec!["character".to_string(), "creature".to_string()],
    );
    outer_types.insert("Y".to_string(), vec!["object".to_string()]);
    let pattern_outer = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        Some(outer_types),
        true, // allowAsPatternVariable — races against "这位X" in Phase A
        Some("object".to_string()),
    );

    let mut tokens = vec![
        create_token("这", 0),
        create_token("位", 1),
        create_token("前", 2),
        create_token("辈", 3),
        create_token("的", 4),
        create_token("丹", 5),
        create_token("药", 6),
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "前辈".to_string(),
        VariableCacheEntry {
            translation: "tiền bối".to_string(),
            source: "character".to_string(),
            var_type: Some("character".to_string()),
            ordinal: None,
        },
    );
    variable_cache.insert(
        "丹药".to_string(),
        VariableCacheEntry {
            translation: "đan dược".to_string(),
            source: "phrase".to_string(),
            var_type: Some("object".to_string()),
            ordinal: None,
        },
    );

    let processor = TwoPhasePatternProcessor::new(vec![pattern_inner, pattern_outer]);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    assert_eq!(
        results.len(),
        1,
        "Expected 1 hierarchical composite. Got {} result(s): {:?}",
        results.len(),
        results
            .iter()
            .map(|r| format!(
                "[{}-{}] {} \"{}\"",
                r.start_index, r.end_index, r.source, r.translation
            ))
            .collect::<Vec<_>>()
    );

    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 6);
    assert_eq!(results[0].translation, "đan dược của vị tiền bối này");

    let phase_a_component = results[0].phase_a.as_ref().unwrap();
    assert_eq!(phase_a_component.original_text, "这位前辈");
    assert_eq!(phase_a_component.translation, "vị tiền bối này");
}

#[test]
fn test_composite_bonus_requires_both_sides_of_a_two_sided_pattern() {
    // Regression for "肖姓女子手中的法盘中" (live bug, one char longer than the
    // correctly-translating "肖姓女子手中的法盘"): `compute_composite_bonus`
    // (two_phase.rs) used to sum a pattern's leading and trailing literal bonuses
    // independently. A decoy pattern shaped "在X中" (leading "在" + trailing "中")
    // could contribute its full trailing bonus from the coincidental extra "中"
    // token alone, even though its required leading "在" was nowhere near the
    // candidate — because a failed/inapplicable leading check silently zeroed
    // only its own term instead of disqualifying the pattern's bonus entirely.
    //
    // "X手中的Y" (own 7 chars) ties "肖姓X" (own 4 + real bonus 3 = 7) without the
    // decoy. With the decoy's phantom trailing bonus (pre-fix), "X手中的Y" wins
    // outright at 8, "肖姓X" is discarded, and the composite never forms — "肖姓"
    // is left untranslated by this pattern set. The fix requires the decoy's
    // leading "在" to also match before granting any bonus from it.
    let mut surname_types = HashMap::new();
    surname_types.insert("X".to_string(), vec!["character".to_string()]);
    let pattern_surname = parse_pattern(
        "肖姓X".to_string(),
        "X họ Tiêu".to_string(),
        Some(surname_types),
        true, // allowAsPatternVariable — competes in Phase A
        Some("$X".to_string()), // resolved type = X's type ("character"), so "X手中的Y" accepts it as its own X
    );

    let mut hand_types = HashMap::new();
    hand_types.insert(
        "X".to_string(),
        vec![
            "person".to_string(),
            "character".to_string(),
            "creature".to_string(),
        ],
    );
    hand_types.insert("Y".to_string(), vec!["object".to_string()]);
    let pattern_hand = parse_pattern(
        "X手中的Y".to_string(),
        "Y trong tay X".to_string(),
        Some(hand_types),
        true, // allowAsPatternVariable — races "肖姓X" directly in Phase A
        None,
    );

    // Decoy: Phase-B-only, two-sided ("在" ... "中"). Never actually applicable
    // here (no "在" anywhere in the sentence) but must not phantom-contribute
    // a bonus off the trailing "中" alone.
    let pattern_decoy = parse_pattern(
        "在X中".to_string(),
        "trong X".to_string(),
        None,
        false, // Phase B only
        None,
    );

    let mut tokens = vec![
        create_token("肖", 0),
        create_token("姓", 1),
        create_token("女子", 2),
        create_token("手", 3),
        create_token("中", 4),
        create_token("的", 5),
        create_token("法盘", 6),
        create_token("中", 7), // the extra trailing char that triggers the bug
    ];

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "女子".to_string(),
        VariableCacheEntry {
            translation: "nữ tử".to_string(),
            source: "phrase".to_string(),
            var_type: Some("character".to_string()),
            ordinal: None,
        },
    );
    variable_cache.insert(
        "法盘".to_string(),
        VariableCacheEntry {
            translation: "pháp bàn".to_string(),
            source: "proper-noun".to_string(),
            var_type: Some("object".to_string()),
            ordinal: None,
        },
    );

    let processor =
        TwoPhasePatternProcessor::new(vec![pattern_surname, pattern_hand, pattern_decoy]);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    assert_eq!(
        results.len(),
        1,
        "Expected 1 hierarchical composite covering '肖姓女子手中的法盘'. Got {} result(s): {:?}",
        results.len(),
        results
            .iter()
            .map(|r| format!(
                "[{}-{}] {} \"{}\"",
                r.start_index, r.end_index, r.source, r.translation
            ))
            .collect::<Vec<_>>()
    );

    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 6); // stops before the trailing decoy "中" at index 7
    assert_eq!(results[0].translation, "pháp bàn trong tay nữ tử họ Tiêu");

    let phase_a_component = results[0].phase_a.as_ref().unwrap();
    assert_eq!(phase_a_component.original_text, "肖姓女子");
    assert_eq!(phase_a_component.translation, "nữ tử họ Tiêu");
}

/// The trailing composite bonus must also count the variable that follows the literal run.
///
/// Input: "肖姓女子手中的厨师帽子" (11 tokens). Phase A candidates that overlap:
///   - "女子手中的厨师帽子" (tokens 2-10, 9 chars) — "X手中的Y", X="女子", Y="厨师帽子".
///   - "肖姓女子" (tokens 0-3, 4 chars) — "肖姓X", X="女子" → "character". "X手中的Y"
///     accepts it as X; trailing literal "手中的" (3) plus Y's cache hit "厨师帽子" (4) →
///     bonus 7 → score 11.
///
/// Counting only the literal run gave "肖姓女子" 4+3=7 < 9, stranding "肖姓".
#[test]
fn test_phase_a_trailing_bonus_counts_following_variable() {
    let mut wrapper_types = HashMap::new();
    wrapper_types.insert("X".to_string(), vec!["character".to_string()]);
    let mut outer_types = HashMap::new();
    outer_types.insert("X".to_string(), vec!["character".to_string(), "creature".to_string()]);
    outer_types.insert("Y".to_string(), vec!["object".to_string()]);

    let pattern_wrapper = parse_pattern(
        "肖姓X".to_string(),
        "X họ Tiêu".to_string(),
        Some(wrapper_types),
        true,
        Some("character".to_string()),
    );
    let pattern_outer = parse_pattern(
        "X手中的Y".to_string(),
        "Y trong tay X".to_string(),
        Some(outer_types),
        true,
        Some("object".to_string()),
    );

    let mut tokens: Vec<SemanticToken> = "肖姓女子手中的厨师帽子"
        .chars()
        .enumerate()
        .map(|(i, c)| create_token(&c.to_string(), i))
        .collect();

    let mut variable_cache = HashMap::new();
    for (key, translation, var_type) in [
        ("女子", "nữ tử", "character"),
        ("厨师", "đầu bếp", "character"),
        ("帽子", "mũ", "object"),
        ("厨师帽子", "mũ đầu bếp", "object"),
    ] {
        variable_cache.insert(
            key.to_string(),
            VariableCacheEntry {
                translation: translation.to_string(),
                source: "phrase".to_string(),
                var_type: Some(var_type.to_string()),
                ordinal: None,
            },
        );
    }

    let processor = TwoPhasePatternProcessor::new(vec![pattern_wrapper, pattern_outer]);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    assert_eq!(
        results.len(),
        1,
        "Expected 1 hierarchical composite. Got: {:?}",
        results.iter().map(|r| format!("[{}-{}] {} \"{}\"", r.start_index, r.end_index, r.source, r.translation)).collect::<Vec<_>>()
    );
    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!(results[0].start_index, 0);
    assert_eq!(results[0].end_index, 10);
    assert_eq!(results[0].translation, "mũ đầu bếp trong tay nữ tử họ Tiêu");
}

fn cache_entry(translation: &str, var_type: &str) -> VariableCacheEntry {
    VariableCacheEntry {
        translation: translation.to_string(),
        source: "test".to_string(),
        var_type: Some(var_type.to_string()),
        ordinal: None,
    }
}

/// A pattern, its template, and its per-variable allowed types.
type PatternSpec<'a> = (&'a str, &'a str, Option<HashMap<String, Vec<String>>>);

fn run_patterns(
    patterns: Vec<PatternSpec<'_>>,
    text: &str,
    cache: &HashMap<String, VariableCacheEntry>,
) -> Vec<String> {
    let parsed = patterns
        .into_iter()
        .map(|(p, t, types)| parse_pattern(p.to_string(), t.to_string(), types, false, None))
        .collect();
    let processor = TwoPhasePatternProcessor::new(parsed);
    let mut tokens: Vec<SemanticToken> = text
        .chars()
        .enumerate()
        .map(|(i, c)| create_token(&c.to_string(), i))
        .collect();
    processor
        .process_tokens(&mut tokens, cache)
        .into_iter()
        .map(|r| format!("[{}-{}] {}", r.start_index, r.end_index, r.translation))
        .collect()
}

#[test]
fn test_number_variable_parses_as_variable_restricted_to_numbers() {
    let pattern = parse_pattern("#大X之一".to_string(), "một trong # đại X".to_string(), None, false, None);
    assert_eq!(pattern.variables, vec!["#".to_string(), "X".to_string()]);
    let types = pattern.metadata.allowed_variable_types.expect("# injects a type constraint");
    assert_eq!(types.get("#"), Some(&vec!["number".to_string()]));
    assert_eq!(types.get("X"), None);
}

#[test]
fn test_number_variable_fills_from_number_cache_entry() {
    let mut cache = HashMap::new();
    cache.insert("七".to_string(), cache_entry("bảy", "number"));
    cache.insert("禁地".to_string(), cache_entry("cấm địa", "location"));
    let results = run_patterns(vec![("#大X之一", "một trong # đại X", None)], "七大禁地之一", &cache);
    assert_eq!(results, vec!["[0-5] một trong bảy đại cấm địa"]);
}

#[test]
fn test_number_variable_rejects_non_number_entry() {
    let mut cache = HashMap::new();
    cache.insert("七".to_string(), cache_entry("bảy", "concept"));
    cache.insert("禁地".to_string(), cache_entry("cấm địa", "location"));
    let results = run_patterns(vec![("#大X之一", "một trong # đại X", None)], "七大禁地之一", &cache);
    assert!(results.is_empty(), "got {:?}", results);
}

#[test]
fn test_letter_variable_rejects_number_entry() {
    // Unconstrained X/Y would otherwise accept any cache entry, numbers included.
    let mut cache = HashMap::new();
    cache.insert("七".to_string(), cache_entry("bảy", "number"));
    cache.insert("禁地".to_string(), cache_entry("cấm địa", "location"));
    let results = run_patterns(vec![("X大Y之一", "một trong X đại Y", None)], "七大禁地之一", &cache);
    assert!(results.is_empty(), "got {:?}", results);
}

#[test]
fn test_literal_number_pattern_beats_number_variable_pattern() {
    // Ordinal exceptions (第一 → "thứ nhất") stay as literal patterns and must win.
    let mut cache = HashMap::new();
    cache.insert("一".to_string(), cache_entry("một", "number"));
    cache.insert("三".to_string(), cache_entry("ba", "number"));
    cache.insert("禁地".to_string(), cache_entry("cấm địa", "location"));
    let patterns = || {
        vec![
            ("第一层的X", "X tầng thứ nhất", None),
            ("第#层的X", "X tầng thứ #", None),
        ]
    };
    assert_eq!(run_patterns(patterns(), "第一层的禁地", &cache), vec!["[0-5] cấm địa tầng thứ nhất"]);
    assert_eq!(run_patterns(patterns(), "第三层的禁地", &cache), vec!["[0-5] cấm địa tầng thứ ba"]);
}

#[test]
fn test_ordinal_marker_reads_the_ordinal_form_of_a_number() {
    // `#` keeps the cardinal; `#o` takes the entry's ordinal, or the cardinal when it has none.
    let mut cache = HashMap::new();
    cache.insert(
        "一".to_string(),
        VariableCacheEntry {
            translation: "một".to_string(),
            source: "test".to_string(),
            var_type: Some("number".to_string()),
            ordinal: Some("nhất".to_string()),
        },
    );
    cache.insert("三".to_string(), cache_entry("ba", "number"));
    cache.insert("禁地".to_string(), cache_entry("cấm địa", "location"));
    let patterns = || vec![("第#层的X", "X tầng thứ #o (#)", None)];
    assert_eq!(run_patterns(patterns(), "第一层的禁地", &cache), vec!["[0-5] cấm địa tầng thứ nhất (một)"]);
    assert_eq!(run_patterns(patterns(), "第三层的禁地", &cache), vec!["[0-5] cấm địa tầng thứ ba (ba)"]);
}

// A `#` variable can take a numeral longer than a letter variable can take any value: the cache
// holds numerals up to 8 characters (`NumberVariable.js`'s MAX_NUMERAL_SPAN), and a heading such
// as 第一千二百三十四章 has a 7-character one. With the letter variable's cap of 6 it never matched
// on the WASM path while the JS fallback matched it.

fn numeral_cache(numeral: &str) -> HashMap<String, VariableCacheEntry> {
    let mut cache = HashMap::new();
    cache.insert(numeral.to_string(), cache_entry("N", "number"));
    cache
}

#[test]
fn test_number_variable_binds_numerals_of_six_to_eight_characters() {
    for numeral in ["一千二百三十", "一千二百三十四", "一万二千三百四十"] {
        let text = format!("第{numeral}章");
        let end = text.chars().count() - 1;
        let results = run_patterns(vec![("第#章", "chương thứ #", None)], &text, &numeral_cache(numeral));
        assert_eq!(
            results,
            vec![format!("[0-{end}] chương thứ N")],
            "numeral {numeral} ({} chars)",
            numeral.chars().count()
        );
    }
}

#[test]
fn test_number_variable_stops_at_eight_characters() {
    let numeral = "一万二千三百四十五"; // 9 characters
    let results = run_patterns(
        vec![("第#章", "chương thứ #", None)],
        &format!("第{numeral}章"),
        &numeral_cache(numeral),
    );
    assert!(results.is_empty(), "got {:?}", results);
}

#[test]
fn test_letter_variable_still_stops_at_six_characters() {
    let mut cache = HashMap::new();
    cache.insert("甲乙丙丁戊己".to_string(), cache_entry("six", "location"));
    cache.insert("甲乙丙丁戊己庚".to_string(), cache_entry("seven", "location"));
    // Seven characters is out of reach for X, so the six-character entry cannot bind either:
    // the literal 章 does not follow it.
    let results = run_patterns(vec![("第X章", "chương X", None)], "第甲乙丙丁戊己庚章", &cache);
    assert!(results.is_empty(), "got {:?}", results);
    let results = run_patterns(vec![("第X章", "chương X", None)], "第甲乙丙丁戊己章", &cache);
    assert_eq!(results, vec!["[0-7] chương six"]);
}

#[test]
fn test_leading_number_variable_is_found_through_the_candidate_index() {
    // `#大X之一` starts with a variable, so it is reached through the first-literal index, whose
    // window must cover a seven-character numeral before the literal 大.
    let mut cache = numeral_cache("一千二百三十四");
    cache.insert("禁地".to_string(), cache_entry("cấm địa", "location"));
    let results = run_patterns(
        vec![("#大X之一", "một trong # đại X", None)],
        "一千二百三十四大禁地之一",
        &cache,
    );
    assert_eq!(results, vec!["[0-11] một trong N đại cấm địa"]);
}

// Pattern results carry ORIGINAL token indices (`SemanticToken::original_index`, the position in
// the caller's token array, where whitespace and punctuation tokens still sit). `semantic_tokens`
// holds only the semantic tokens, so its positions run behind those indices by the number of
// non-semantic tokens before them. The tests below give tokens gapped `original_index` values to
// stand for such tokens; the scoring and the Phase B loop used to read a result's index as a
// position in `semantic_tokens`.

#[test]
fn test_scoring_phase_a_candidates_far_into_a_gapped_array_does_not_panic() {
    // 300 filler tokens with a non-semantic token between each, then two candidates: the
    // second's original index (606) is past the 306 semantic tokens, so slicing
    // `semantic_tokens[..606]` for the leading bonus panicked.
    let candidate_a = parse_pattern("候选甲".to_string(), "A".to_string(), None, true, None);
    let candidate_b = parse_pattern("候选乙".to_string(), "B".to_string(), None, true, None);
    let wrapper = parse_pattern("在X中".to_string(), "trong X".to_string(), None, false, None);

    let mut tokens: Vec<SemanticToken> = (0..300).map(|i| create_token("空", i * 2)).collect();
    tokens.push(create_token("候", 600));
    tokens.push(create_token("选", 602));
    tokens.push(create_token("甲", 604));
    tokens.push(create_token("候", 606));
    tokens.push(create_token("选", 608));
    tokens.push(create_token("乙", 610));

    let processor = TwoPhasePatternProcessor::new(vec![candidate_a, candidate_b, wrapper]);
    let results = processor.process_tokens(&mut tokens, &HashMap::new());

    let spans: Vec<(usize, usize, String)> = results
        .iter()
        .map(|r| (r.start_index, r.end_index, r.translation.clone()))
        .collect();
    assert_eq!(spans, vec![(600, 604, "A".to_string()), (606, 610, "B".to_string())]);
}

#[test]
fn test_composite_bonus_is_the_same_with_non_semantic_tokens_ahead() {
    // test_phase_a_composite_bonus_wins_over_larger_own_span, with five non-semantic tokens in
    // front of the sentence: the winner must not change because of tokens before it.
    let mut literal_type = HashMap::new();
    literal_type.insert("X".to_string(), vec!["character".to_string()]);
    let pattern_literal = parse_pattern(
        "刍吾的速度".to_string(),
        "tốc độ của sinh vật".to_string(),
        None,
        true,
        Some("concept".to_string()),
    );
    let pattern_wrapper = parse_pattern(
        "这只X".to_string(),
        "con X này".to_string(),
        Some(literal_type.clone()),
        true,
        Some("$X".to_string()),
    );
    let pattern_phase_b = parse_pattern(
        "X的速度".to_string(),
        "tốc độ của X".to_string(),
        Some(literal_type),
        false,
        None,
    );
    let gap = 5;
    let mut tokens: Vec<SemanticToken> = ["这", "只", "刍", "吾", "的", "速", "度"]
        .iter()
        .enumerate()
        .map(|(i, v)| create_token(v, i + gap))
        .collect();
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "刍吾".to_string(),
        VariableCacheEntry {
            translation: "sinh vật".to_string(),
            source: "phrase".to_string(),
            var_type: Some("character".to_string()),
            ordinal: None,
        },
    );

    let processor =
        TwoPhasePatternProcessor::new(vec![pattern_literal, pattern_wrapper, pattern_phase_b]);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    assert_eq!(results.len(), 1, "got {:?}", results.iter().map(|r| &r.translation).collect::<Vec<_>>());
    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!((results[0].start_index, results[0].end_index), (gap, gap + 6));
    assert_eq!(results[0].phase_a.as_ref().unwrap().original_text, "这只刍吾");
}

#[test]
fn test_phase_b_finds_the_next_match_after_a_gap() {
    // Semantic tokens 空 候 选 甲 乙 sit at original indices 0 5 6 7 8. After "候选" (original
    // 5-6) the loop must move to the semantic token 甲, not to position 7 (past the array).
    let first = parse_pattern("候选".to_string(), "ứng viên".to_string(), None, false, None);
    let second = parse_pattern("甲乙".to_string(), "giáp ất".to_string(), None, false, None);
    let mut tokens = vec![
        create_token("空", 0),
        create_token("候", 5),
        create_token("选", 6),
        create_token("甲", 7),
        create_token("乙", 8),
    ];

    let processor = TwoPhasePatternProcessor::new(vec![first, second]);
    let results = processor.process_tokens(&mut tokens, &HashMap::new());

    let spans: Vec<(usize, usize, String)> = results
        .iter()
        .map(|r| (r.start_index, r.end_index, r.translation.clone()))
        .collect();
    assert_eq!(
        spans,
        vec![(5, 6, "ứng viên".to_string()), (7, 8, "giáp ất".to_string())]
    );
}

#[test]
fn test_phase_a_scores_a_long_numeral_for_the_candidate_that_composes_with_it() {
    // Wrapper "X第#章" (Phase B only), tokens 候选第一千二百三十四章. Two Phase A candidates
    // share 选: "候选" (2 characters) and "选第一千" (4). "候选" can be the wrapper's X, and
    // after the literal 第 the wrapper's `#` takes a 7-character numeral, so its composite
    // bonus is 1 + 7 and it scores 10 against 4. If the bonus estimator stopped at the letter
    // variables' span of 6 it would score 3, the longer candidate would win, and the heading
    // would never compose.
    let candidate = parse_pattern("候选".to_string(), "ứng viên".to_string(), None, true, None);
    let longer = parse_pattern("选第一千".to_string(), "chọn thứ nghìn".to_string(), None, true, None);
    let wrapper = parse_pattern("X第#章".to_string(), "X chương thứ #".to_string(), None, false, None);

    let mut tokens: Vec<SemanticToken> = "候选第一千二百三十四章"
        .chars()
        .enumerate()
        .map(|(i, c)| create_token(&c.to_string(), i))
        .collect();
    let mut cache = HashMap::new();
    cache.insert("一千二百三十四".to_string(), cache_entry("N", "number"));

    let processor = TwoPhasePatternProcessor::new(vec![candidate, longer, wrapper]);
    let results = processor.process_tokens(&mut tokens, &cache);

    assert_eq!(
        results.len(),
        1,
        "got {:?}",
        results
            .iter()
            .map(|r| format!("[{}-{}] {} \"{}\"", r.start_index, r.end_index, r.source, r.translation))
            .collect::<Vec<_>>()
    );
    assert_eq!(results[0].source, "hierarchical_composition");
    assert_eq!((results[0].start_index, results[0].end_index), (0, 10));
    assert_eq!(results[0].translation, "ứng viên chương thứ N");
    assert_eq!(results[0].phase_a.as_ref().unwrap().original_text, "候选");
}
