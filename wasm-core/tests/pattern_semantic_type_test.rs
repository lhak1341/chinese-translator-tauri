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
