// ─── Integration tests: Phase B allowedVariableTypes uses actual semanticType ───

/// A Phase A pattern with semanticType "concept" should satisfy a Phase B
/// allowedVariableTypes constraint of ["concept"].
///
/// Setup:
///   Pattern A: "X号" → "số X",  allowAsPatternVariable: true,  semanticType: "concept"
///   Pattern B: "在X中" → "ở trong X",  allowedVariableTypes: {X: ["concept"]}
///   Variable cache: "三" → {translation: "ba", type: None}
///   Input tokens: ["在", "三", "号", "中"]
///
/// Expected (bug fixed): Phase A matches ["三","号"] → "số ba" (semanticType "concept");
///   Phase B matches ["在","三","号","中"] → "ở trong số ba" because "concept" ∈ ["concept"].
#[test]
fn phase_a_semantic_type_satisfies_phase_b_constraint() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::{
        parse_pattern, SemanticToken, TwoPhasePatternProcessor, VariableCacheEntry,
    };

    // Pattern A: "X号" → "số X", Phase A only, semanticType: "concept"
    let pattern_a = parse_pattern(
        "X号".to_string(),
        "số X".to_string(),
        None,              // no allowedVariableTypes on A itself
        true,              // allowAsPatternVariable
        false,
        Some("concept".to_string()),  // semanticType
    );

    // Pattern B: "在X中" → "ở trong X", allowedVariableTypes: {X: ["concept"]}
    let mut avt: HashMap<String, Vec<String>> = HashMap::new();
    avt.insert("X".to_string(), vec!["concept".to_string()]);
    let pattern_b = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        Some(avt),
        false,
        false,
        None,
    );

    // Variable cache: only "三" is known (var_type not set → None)
    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "三".to_string(),
        VariableCacheEntry {
            translation: "ba".to_string(),
            source: "character".to_string(),
            var_type: None,
        },
    );

    // Input: ["在", "三", "号", "中"]
    let mut tokens = vec![
        SemanticToken {
            value: "在".to_string(),
            original_index: 0,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
        SemanticToken {
            value: "三".to_string(),
            original_index: 1,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
        SemanticToken {
            value: "号".to_string(),
            original_index: 2,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
        SemanticToken {
            value: "中".to_string(),
            original_index: 3,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
    ];

    let processor = TwoPhasePatternProcessor::new(vec![pattern_a, pattern_b]);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Should produce a hierarchical composition covering all 4 tokens
    let hierarchical = results
        .iter()
        .find(|r| r.source == "hierarchical_composition");

    assert!(
        hierarchical.is_some(),
        "Expected hierarchical composition: Phase B 'ở trong X' should use Phase A 'số ba' \
         (semanticType='concept') as its variable because 'concept' ∈ allowedVariableTypes['X']. \
         Results: {:?}",
        results.iter().map(|r| (&r.source, &r.translation)).collect::<Vec<_>>()
    );

    let result = hierarchical.unwrap();
    assert_eq!(
        result.translation, "ở trong số ba",
        "Unexpected translation: {}", result.translation
    );
    assert_eq!(result.start_index, 0);
    assert_eq!(result.end_index, 3);
}

/// A Phase A pattern with no semanticType should default to "structural_pattern" in the
/// Phase B enhanced cache, and a Phase B constraint of ["structural_pattern"] should match.
/// This verifies backward compatibility with patterns that have no semanticType.
#[test]
fn phase_a_without_semantic_type_defaults_to_structural_pattern() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::{
        parse_pattern, SemanticToken, TwoPhasePatternProcessor, VariableCacheEntry,
    };

    // Pattern A: "X号" → "số X", Phase A only, NO semanticType (defaults to "structural_pattern")
    let pattern_a = parse_pattern(
        "X号".to_string(),
        "số X".to_string(),
        None,
        true,  // allowAsPatternVariable
        false,
        None,  // no semanticType → defaults to "structural_pattern" in enhanced cache
    );

    // Pattern B: "在X中" → "ở trong X", allowedVariableTypes: {X: ["structural_pattern"]}
    let mut avt: HashMap<String, Vec<String>> = HashMap::new();
    avt.insert("X".to_string(), vec!["structural_pattern".to_string()]);
    let pattern_b = parse_pattern(
        "在X中".to_string(),
        "ở trong X".to_string(),
        Some(avt),
        false,
        false,
        None,
    );

    let mut variable_cache = HashMap::new();
    variable_cache.insert(
        "三".to_string(),
        VariableCacheEntry {
            translation: "ba".to_string(),
            source: "character".to_string(),
            var_type: None,
        },
    );

    let mut tokens = vec![
        SemanticToken {
            value: "在".to_string(),
            original_index: 0,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
        SemanticToken {
            value: "三".to_string(),
            original_index: 1,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
        SemanticToken {
            value: "号".to_string(),
            original_index: 2,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
        SemanticToken {
            value: "中".to_string(),
            original_index: 3,
            protected_by_phase_a: None,
            phase_a_result: None,
            translation_source: None,
        },
    ];

    let processor = TwoPhasePatternProcessor::new(vec![pattern_a, pattern_b]);
    let results = processor.process_tokens(&mut tokens, &variable_cache);

    // Phase A semanticType is None → enhanced cache uses "structural_pattern" as fallback.
    // Phase B constraint is ["structural_pattern"] → should still match.
    let hierarchical = results
        .iter()
        .find(|r| r.source == "hierarchical_composition");

    assert!(
        hierarchical.is_some(),
        "Expected hierarchical composition: Phase A with no semanticType should default to \
         'structural_pattern', satisfying Phase B constraint ['structural_pattern']. \
         Results: {:?}",
        results.iter().map(|r| (&r.source, &r.translation)).collect::<Vec<_>>()
    );

    let result = hierarchical.unwrap();
    assert_eq!(result.translation, "ở trong số ba");
}

// ─── Variable-derived semantic type ($X/$Y) tests ────────���───────────────

/// Pattern with semanticType "$X" should resolve to X's var_type from cache.
#[test]
fn dollar_x_resolves_to_variable_type_from_cache() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::{
        parse_pattern, find_best_pattern_match, SemanticToken, VariableCacheEntry,
    };

    // Pattern: "X的家" → "nhà của X", semanticType: "$X"
    let pattern = parse_pattern(
        "X的家".to_string(),
        "nhà của X".to_string(),
        None,
        false,
        false,
        Some("$X".to_string()),
    );

    // Cache: "张三" → character type
    let mut cache = HashMap::new();
    cache.insert(
        "张三".to_string(),
        VariableCacheEntry {
            translation: "Trương Tam".to_string(),
            source: "properNouns".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let tokens = vec![
        SemanticToken { value: "张".to_string(), original_index: 0, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "三".to_string(), original_index: 1, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "的".to_string(), original_index: 2, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "家".to_string(), original_index: 3, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
    ];

    let result = find_best_pattern_match(&[pattern], &tokens, 0, &cache);
    assert!(result.is_some(), "Pattern should match");
    let m = result.unwrap();
    assert!(m.success);
    assert_eq!(m.pattern_semantic_type.as_deref(), Some("character"),
        "semanticType '$X' should resolve to X's var_type 'character'");
}

/// Pattern with semanticType "$Y" should resolve to Y's var_type from cache.
#[test]
fn dollar_y_resolves_to_variable_type_from_cache() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::{
        parse_pattern, find_best_pattern_match, SemanticToken, VariableCacheEntry,
    };

    // Pattern: "X去Y" → "X đi Y", semanticType: "$Y"
    let pattern = parse_pattern(
        "X去Y".to_string(),
        "X đi Y".to_string(),
        None,
        false,
        false,
        Some("$Y".to_string()),
    );

    let mut cache = HashMap::new();
    cache.insert(
        "张三".to_string(),
        VariableCacheEntry {
            translation: "Trương Tam".to_string(),
            source: "properNouns".to_string(),
            var_type: Some("character".to_string()),
        },
    );
    cache.insert(
        "北京".to_string(),
        VariableCacheEntry {
            translation: "Bắc Kinh".to_string(),
            source: "properNouns".to_string(),
            var_type: Some("location".to_string()),
        },
    );

    let tokens = vec![
        SemanticToken { value: "张".to_string(), original_index: 0, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "三".to_string(), original_index: 1, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "去".to_string(), original_index: 2, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "北".to_string(), original_index: 3, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "京".to_string(), original_index: 4, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
    ];

    let result = find_best_pattern_match(&[pattern], &tokens, 0, &cache);
    assert!(result.is_some(), "Pattern should match");
    let m = result.unwrap();
    assert!(m.success);
    assert_eq!(m.pattern_semantic_type.as_deref(), Some("location"),
        "semanticType '$Y' should resolve to Y's var_type 'location'");
}

/// Pattern with semanticType "$X" where X has no var_type → resolves to None.
#[test]
fn dollar_x_resolves_to_none_when_variable_untyped() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::{
        parse_pattern, find_best_pattern_match, SemanticToken, VariableCacheEntry,
    };

    let pattern = parse_pattern(
        "X的家".to_string(),
        "nhà của X".to_string(),
        None,
        false,
        false,
        Some("$X".to_string()),
    );

    // Cache entry with no var_type
    let mut cache = HashMap::new();
    cache.insert(
        "他".to_string(),
        VariableCacheEntry {
            translation: "anh ấy".to_string(),
            source: "characters".to_string(),
            var_type: None,
        },
    );

    let tokens = vec![
        SemanticToken { value: "他".to_string(), original_index: 0, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "的".to_string(), original_index: 1, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "家".to_string(), original_index: 2, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
    ];

    let result = find_best_pattern_match(&[pattern], &tokens, 0, &cache);
    assert!(result.is_some(), "Pattern should match");
    let m = result.unwrap();
    assert!(m.success);
    assert_eq!(m.pattern_semantic_type, None,
        "semanticType '$X' with untyped variable should resolve to None");
}

/// Fixed semanticType (not a $-reference) should pass through unchanged.
#[test]
fn fixed_semantic_type_unchanged() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::{
        parse_pattern, find_best_pattern_match, SemanticToken, VariableCacheEntry,
    };

    let pattern = parse_pattern(
        "X的家".to_string(),
        "nhà của X".to_string(),
        None,
        false,
        false,
        Some("location".to_string()),
    );

    let mut cache = HashMap::new();
    cache.insert(
        "张三".to_string(),
        VariableCacheEntry {
            translation: "Trương Tam".to_string(),
            source: "properNouns".to_string(),
            var_type: Some("character".to_string()),
        },
    );

    let tokens = vec![
        SemanticToken { value: "张".to_string(), original_index: 0, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "三".to_string(), original_index: 1, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "的".to_string(), original_index: 2, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
        SemanticToken { value: "家".to_string(), original_index: 3, protected_by_phase_a: None, phase_a_result: None, translation_source: None },
    ];

    let result = find_best_pattern_match(&[pattern], &tokens, 0, &cache);
    assert!(result.is_some());
    let m = result.unwrap();
    assert!(m.success);
    assert_eq!(m.pattern_semantic_type.as_deref(), Some("location"),
        "Fixed semanticType 'location' should pass through regardless of variable type");
}

// ─── Existing unit tests ───────────────────────────────────────────────────

#[test]
fn pattern_metadata_has_semantic_type_field() {
    use translation_wasm_core::pattern_processor::pattern::PatternMetadata;
    let meta = PatternMetadata {
        priority: 0,
        complexity: 1,
        length: 3,
        allowed_variable_types: None,
        low_priority: false,
        semantic_type: Some("person".to_string()),
    };
    assert_eq!(meta.semantic_type.as_deref(), Some("person"));
}

#[test]
fn parser_reads_semantic_type_from_object_format() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::parser::parse_patterns_dict;

    let mut dict: HashMap<String, serde_json::Value> = HashMap::new();
    dict.insert(
        "X的Y".to_string(),
        serde_json::json!({
            "translation": "Y của X",
            "semanticType": "person"
        }),
    );

    let patterns = parse_patterns_dict(dict);
    assert_eq!(patterns.len(), 1);
    assert_eq!(patterns[0].metadata.semantic_type.as_deref(), Some("person"));
}

#[test]
fn parser_leaves_semantic_type_none_when_absent() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::parser::parse_patterns_dict;

    let mut dict: HashMap<String, serde_json::Value> = HashMap::new();
    dict.insert(
        "X的Y".to_string(),
        serde_json::json!({ "translation": "Y của X" }),
    );

    let patterns = parse_patterns_dict(dict);
    assert_eq!(patterns.len(), 1);
    assert!(patterns[0].metadata.semantic_type.is_none());
}

#[test]
fn parser_leaves_semantic_type_none_for_simple_string_format() {
    use std::collections::HashMap;
    use translation_wasm_core::pattern_processor::parser::parse_patterns_dict;

    let mut dict: HashMap<String, serde_json::Value> = HashMap::new();
    dict.insert(
        "X的Y".to_string(),
        serde_json::Value::String("Y của X".to_string()),
    );

    let patterns = parse_patterns_dict(dict);
    assert_eq!(patterns.len(), 1);
    assert!(patterns[0].metadata.semantic_type.is_none());
}
