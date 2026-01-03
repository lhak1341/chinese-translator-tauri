/**
 * Performance benchmarks for pattern matching
 *
 * Measures baseline performance before optimizations and validates improvements.
 */

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use std::collections::HashMap;
use translation_wasm_core::pattern_processor::{
    parse_pattern, find_best_pattern_match, SemanticToken, TwoPhasePatternProcessor,
    VariableCacheEntry,
};

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

/// Benchmark single pattern matching
fn bench_single_pattern_match(c: &mut Criterion) {
    let pattern = parse_pattern(
        "X的Y".to_string(),
        "Y của X".to_string(),
        None,
        false,
        false,
    );

    let tokens = vec![
        create_token("张三", 0),
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

    c.bench_function("single_pattern_match", |b| {
        b.iter(|| {
            find_best_pattern_match(
                black_box(&[pattern.clone()]),
                black_box(&tokens),
                black_box(0),
                black_box(&variable_cache),
            )
        })
    });
}

/// Benchmark pattern competition (multiple patterns)
fn bench_pattern_competition(c: &mut Criterion) {
    let mut group = c.benchmark_group("pattern_competition");

    for pattern_count in [5, 10, 25, 50].iter() {
        let mut patterns = Vec::new();

        // Create multiple competing patterns
        for i in 0..*pattern_count {
            patterns.push(parse_pattern(
                format!("X的{}", "手".repeat(i + 1)),
                format!("{} của X", "tay".repeat(i + 1)),
                None,
                false,
                false,
            ));
        }

        let tokens = vec![
            create_token("张三", 0),
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

        group.bench_with_input(
            BenchmarkId::from_parameter(pattern_count),
            pattern_count,
            |b, _| {
                b.iter(|| {
                    find_best_pattern_match(
                        black_box(&patterns),
                        black_box(&tokens),
                        black_box(0),
                        black_box(&variable_cache),
                    )
                })
            },
        );
    }

    group.finish();
}

/// Benchmark Phase A processing
fn bench_phase_a_processing(c: &mut Criterion) {
    let mut group = c.benchmark_group("phase_a_processing");

    for pattern_count in [5, 10, 25].iter() {
        let mut patterns = Vec::new();

        // Create variable patterns (allowAsPatternVariable: true)
        for i in 0..*pattern_count {
            patterns.push(parse_pattern(
                format!("{}X", "可怕的".repeat(i + 1)),
                format!("X {}", "đáng sợ".repeat(i + 1)),
                None,
                true, // allowAsPatternVariable
                false,
            ));
        }

        let mut tokens = vec![create_token("可", 0), create_token("怕", 1), create_token("的", 2)];
        for i in 0..10 {
            tokens.push(create_token(&format!("字{}", i), 3 + i));
        }

        let mut variable_cache = HashMap::new();
        for i in 0..10 {
            variable_cache.insert(
                format!("字{}", i),
                VariableCacheEntry {
                    translation: format!("chữ {}", i),
                    source: "character".to_string(),
                    var_type: Some("character".to_string()),
                },
            );
        }

        let processor = TwoPhasePatternProcessor::new(patterns);

        group.bench_with_input(
            BenchmarkId::from_parameter(pattern_count),
            pattern_count,
            |b, _| {
                b.iter(|| {
                    let mut tokens_clone = tokens.clone();
                    processor.process_tokens(black_box(&mut tokens_clone), black_box(&variable_cache))
                })
            },
        );
    }

    group.finish();
}

/// Benchmark full two-phase processing
fn bench_two_phase_processing(c: &mut Criterion) {
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

    let mut tokens = vec![
        create_token("在", 0),
        create_token("可", 1),
        create_token("怕", 2),
        create_token("的", 3),
        create_token("声波", 4),
        create_token("振荡", 5),
        create_token("中", 6),
    ];

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

    c.bench_function("two_phase_hierarchical_composition", |b| {
        b.iter(|| {
            let mut tokens_clone = tokens.clone();
            processor.process_tokens(black_box(&mut tokens_clone), black_box(&variable_cache))
        })
    });
}

/// Benchmark pattern matching with large token arrays
fn bench_large_token_array(c: &mut Criterion) {
    let mut group = c.benchmark_group("large_token_array");

    let patterns = vec![
        parse_pattern("X的Y".to_string(), "Y của X".to_string(), None, false, false),
        parse_pattern("可怕的X".to_string(), "X đáng sợ".to_string(), None, true, false),
        parse_pattern("在X中".to_string(), "ở trong X".to_string(), None, false, false),
    ];

    let processor = TwoPhasePatternProcessor::new(patterns);

    for token_count in [10, 50, 100, 200].iter() {
        let mut tokens = Vec::new();
        let mut variable_cache = HashMap::new();

        for i in 0..*token_count {
            tokens.push(create_token(&format!("字{}", i), i));
            variable_cache.insert(
                format!("字{}", i),
                VariableCacheEntry {
                    translation: format!("chữ {}", i),
                    source: "character".to_string(),
                    var_type: Some("character".to_string()),
                },
            );
        }

        group.bench_with_input(
            BenchmarkId::from_parameter(token_count),
            token_count,
            |b, _| {
                b.iter(|| {
                    let mut tokens_clone = tokens.clone();
                    processor.process_tokens(black_box(&mut tokens_clone), black_box(&variable_cache))
                })
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_single_pattern_match,
    bench_pattern_competition,
    bench_phase_a_processing,
    bench_two_phase_processing,
    bench_large_token_array
);
criterion_main!(benches);
