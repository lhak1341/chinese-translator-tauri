//! Rust parity validator for `wasm-core/src/pattern_processor/matcher.rs`'s matching
//! decision — `PatternMatcher::test_pattern_match` / `find_best_pattern_match` — against
//! the JS-side fixture oracle.
//!
//! # Purpose
//!
//! ADR-033 deferred building this test until a trusted JS oracle for the matching
//! *decision* (not just `build_result`'s template substitution) existed. That oracle
//! landed 2026-08-25 in `src/utils/__tests__/SemanticPatternProcessor.test.js`'s
//! `testPatternMatch() / findBestPatternMatch() (fixture-based)` describe block — 3
//! fixtures asserting exact `translation`/`variables`/`matchedTokens` output. This file
//! is the Rust half ADR-033's Consequence section named as the unblock condition.
//!
//! Per ADR-007, `SemanticPatternProcessor` (JS) and `matcher.rs` (Rust) are real
//! production adapters — `applyPatterns()` falls back WASM→JS after 3 consecutive
//! failures within 5 minutes — so a silent divergence here is production-reachable,
//! not hypothetical (see `TextTokenizer`'s punctuation-classifier gap for a confirmed
//! prior instance of exactly this failure class).
//!
//! Unlike `conflict_resolution_parity_test.rs` (an independent Rust re-implementation
//! of a JS algorithm), this file calls `matcher.rs`'s real production `pub fn`s
//! directly — no `wasm_bindgen` boundary to cross, no shadow implementation to drift.
//!
//! # Fixture linkage
//!
//! Each test below hand-duplicates the literal values from its named JS fixture
//! (same convention as `conflict_resolution_parity_test.rs`), asserting only the
//! fields the JS fixture itself asserts — not `PatternMatchResult`'s Rust-only
//! `start_position`/`end_position`/`pattern_semantic_type` fields. Parity means
//! proving the same claim on both sides, not a superset.
//!
//! Fixtures 1 and 2 previously had unlabeled duplicate coverage in
//! `pattern_matching_test.rs` (`test_single_variable_pattern_match`,
//! `test_pattern_competition_higher_priority_wins`) — removed from there in the same
//! change that added this file, so the parity claim has one discoverable home instead
//! of two coincidentally-identical tests in an unrelated general test file.

use translation_wasm_core::pattern_processor::{
    find_best_pattern_match, parse_pattern, PatternMatcher, PhaseAResult, SemanticToken,
    VariableCacheEntry, DEFAULT_MAX_VARIABLE_SPAN,
};
use std::collections::HashMap;

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

/// Mirrors `SemanticPatternProcessor.test.js`'s "simple single-variable match:
/// 这些X → những người này".
#[test]
fn fixture_1_simple_single_variable_match() {
    let pattern = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        None,
    );

    let tokens = vec![
        create_token("这", 0),
        create_token("些", 1),
        create_token("人", 2),
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

    let matcher = PatternMatcher::new(&variable_cache, DEFAULT_MAX_VARIABLE_SPAN);
    let result = matcher.test_pattern_match(&pattern, &tokens, 0);

    assert!(result.success);
    assert_eq!(result.result.as_deref().unwrap(), "những người này");
    assert_eq!(result.matched_tokens.as_ref().unwrap().len(), 3);
    assert_eq!(result.variables.as_ref().unwrap().get("X").unwrap(), "người");
}

/// Mirrors `SemanticPatternProcessor.test.js`'s "overlapping-pattern priority
/// resolution: longer 这些XY beats shorter 这些X".
#[test]
fn fixture_2_overlapping_pattern_priority_resolution() {
    let pattern1 = parse_pattern(
        "这些X".to_string(),
        "những X này".to_string(),
        None,
        false,
        None,
    );
    let pattern2 = parse_pattern(
        "这些XY".to_string(),
        "những X Y này".to_string(),
        None,
        false,
        None,
    );

    let tokens = vec![
        create_token("这", 0),
        create_token("些", 1),
        create_token("人", 2),
        create_token("强大", 3),
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
    variable_cache.insert(
        "强大".to_string(),
        VariableCacheEntry {
            translation: "mạnh mẽ".to_string(),
            source: "phrase".to_string(),
            var_type: Some("phrase".to_string()),
        },
    );

    let patterns = vec![pattern1, pattern2];
    let best_match = find_best_pattern_match(
        &patterns,
        &tokens,
        0,
        &variable_cache,
        DEFAULT_MAX_VARIABLE_SPAN,
    );

    assert!(best_match.is_some());
    let result = best_match.unwrap();
    assert_eq!(result.pattern_id.as_deref().unwrap(), "这些XY");
    assert_eq!(result.result.as_deref().unwrap(), "những người mạnh mẽ này");
}

/// Mirrors `SemanticPatternProcessor.test.js`'s "hierarchical composition: longer
/// Phase B pattern absorbs a shorter Phase A-protected span". Exercises
/// `matcher.rs`'s Phase A override guard (`has_phase_a_protection` /
/// `get_max_phase_a_length`, matcher.rs:603-615 per `wasm-core/CLAUDE.md`'s "Phase B
/// Protection Blocks Shorter-or-Equal Matches") directly through
/// `PatternMatcher::test_pattern_match` — no `TwoPhasePatternProcessor` involved, same
/// as the JS fixture calls `SemanticPatternProcessor.testPatternMatch` directly.
#[test]
fn fixture_3_hierarchical_composition_absorbs_phase_a_protected_span() {
    let pattern = parse_pattern("X的Y".to_string(), "Y của X".to_string(), None, false, None);

    // "张三" was already translated by a Phase A pattern (2-char match). The Phase B
    // pattern X的Y matches all 3 tokens (4 chars total: 张三的手) — longer than Phase
    // A's 2-char span, so the override is allowed.
    let tokens = vec![
        SemanticToken {
            value: "张三".to_string(),
            original_index: 0,
            protected_by_phase_a: Some(true),
            phase_a_result: Some(PhaseAResult {
                original_text: "张三".to_string(),
                pattern: None,
            }),
            translation_source: None,
            has_preceding_boundary: false,
        },
        create_token("的", 1),
        create_token("手", 2),
    ];

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

    assert!(result.success);
    assert_eq!(result.result.as_deref().unwrap(), "tay của Trương Tam");
    assert_eq!(result.matched_tokens.as_ref().unwrap().len(), 3);
}
