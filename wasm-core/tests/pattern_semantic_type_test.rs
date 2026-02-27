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
