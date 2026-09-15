/**
 * Real-dictionary pattern-processing profile.
 *
 * Reproduces the production hot path measured in the browser: a small chunk of
 * tokens (3-9) processed against the full production patterns.json (~3800 patterns).
 * Browser measurement showed ~7.3ms median per call for 7-8 token chunks, which is
 * where ~77% of wall-clock translation time goes.
 *
 * Reads the pattern dictionary from $PATTERNS_JSON, defaulting to the macOS
 * production dictionary location. Skips (with a warning) if the file is absent,
 * so this compiles and runs on machines without the production dictionaries.
 */
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use serde_json::Value;
use std::collections::HashMap;
use translation_wasm_core::pattern_processor::{
    parse_patterns_dict, SemanticToken, TwoPhasePatternProcessor, VariableCacheEntry,
};

fn default_patterns_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!(
        "{}/Library/Application Support/com.lhak.chinese-translator/dictionaries/patterns.json",
        home
    )
}

fn load_processor() -> Option<(TwoPhasePatternProcessor, usize)> {
    let path = std::env::var("PATTERNS_JSON").unwrap_or_else(|_| default_patterns_path());
    let raw = std::fs::read_to_string(&path).ok()?;
    let map: HashMap<String, Value> = serde_json::from_str(&raw).ok()?;
    let patterns = parse_patterns_dict(map);
    let count = patterns.len();
    Some((TwoPhasePatternProcessor::new(patterns), count))
}

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

fn tokens_from(text: &str) -> Vec<SemanticToken> {
    text.chars()
        .enumerate()
        .map(|(i, c)| create_token(&c.to_string(), i))
        .collect()
}

fn bench_real_dictionary_chunks(c: &mut Criterion) {
    let Some((processor, pattern_count)) = load_processor() else {
        eprintln!("SKIP: production patterns.json not found; set PATTERNS_JSON to run this bench");
        return;
    };
    eprintln!("Loaded {} patterns", pattern_count);

    let empty_cache: HashMap<String, VariableCacheEntry> = HashMap::new();

    // Chunk sizes matching what the browser actually sends (3-9 tokens).
    let cases: [(&str, &str); 3] = [
        ("3_tokens", "这一日"),
        ("8_tokens", "他站在山顶之上"),
        ("15_tokens", "在这个宗门之中有一位年轻的弟子"),
    ];

    let mut group = c.benchmark_group("real_dictionary");
    for (label, text) in cases {
        let tokens = tokens_from(text);
        group.bench_function(label, |b| {
            b.iter(|| {
                let mut t = tokens.clone();
                black_box(processor.process_tokens(black_box(&mut t), black_box(&empty_cache)))
            })
        });
    }
    group.finish();
}

/// Attribution: how much of the per-position cost is just cloning the
/// variable-starting patterns into the candidate buffer?
/// `process_phase_a`/`process_phase_b` each run
/// `candidate_patterns.extend_from_slice(variable_patterns)` at EVERY token
/// position, and `candidate_patterns` is a `Vec<SemanticPattern>` — so each
/// extend deep-clones every variable-starting pattern.
fn bench_variable_pattern_clone(c: &mut Criterion) {
    let path = std::env::var("PATTERNS_JSON").unwrap_or_else(|_| default_patterns_path());
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(map) = serde_json::from_str::<HashMap<String, Value>>(&raw) else {
        return;
    };
    let patterns = parse_patterns_dict(map);
    let variable_patterns: Vec<_> = patterns
        .iter()
        .filter(|p| {
            p.first_token.token_type == translation_wasm_core::pattern_processor::TokenType::Variable
        })
        .cloned()
        .collect();
    eprintln!(
        "variable-starting patterns: {} of {}",
        variable_patterns.len(),
        patterns.len()
    );

    let mut buf: Vec<_> = Vec::with_capacity(variable_patterns.len() + 32);
    c.bench_function("clone_variable_patterns_one_position", |b| {
        b.iter(|| {
            buf.clear();
            buf.extend_from_slice(black_box(&variable_patterns));
            black_box(buf.len())
        })
    });
}

criterion_group!(benches, bench_real_dictionary_chunks, bench_variable_pattern_clone);
criterion_main!(benches);
