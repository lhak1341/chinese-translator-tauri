/**
 * Trie matching benchmark — src-tauri's production hot path.
 *
 * `lookup_index_engine::TrieNode` (hashbrown-backed) is what `build_lookup_index`
 * (a single Tauri IPC call) uses to pre-scan real translation text >= 50 chars —
 * i.e. essentially every real translation (see LookupIndexBuilder.ts's
 * MIN_TEXT_FOR_RUST_INDEX). Unlike wasm-core's trie, this one has no non-slice
 * variant — `find_matches` already takes a pre-collected `&[char]`, so there's
 * no chars().collect()-per-call tax to isolate here. The only open question is
 * whether the hand-rolled HashMap<char, TrieNode> walk itself is competitive
 * with aho-corasick (added here as a bench-only dev-dependency, mirroring the
 * wasm-core/benches/trie_matching.rs comparison).
 *
 * Note: production parallelizes this walk across positions via rayon
 * (build_index_parallel) — this bench measures single-threaded per-call cost,
 * i.e. the unit of work rayon fans out, not end-to-end wall clock. A follow-up
 * full-pipeline prototype (aho-corasick automaton replacing the trie+rayon
 * path entirely) was built and benchmarked, then removed: once automaton
 * construction was correctly isolated from matching, single-threaded
 * aho-corasick lost to the trie's existing 8-core rayon parallelism (~1.33x
 * slower on this machine) — the raw per-call win measured here doesn't survive
 * once the trie side gets to use multiple cores for free. Not worth carrying
 * unused production code for.
 *
 * Run: cargo bench --manifest-path src-tauri/Cargo.toml --bench trie_matching
 */
use aho_corasick::{AhoCorasick, MatchKind};
use chinese_translator_tauri_lib::lookup_index_engine::TrieNode;
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use std::collections::HashSet;

/// Minimal deterministic PRNG (xorshift-style LCG) — avoids pulling in `rand`
/// for what is a one-off, reproducible corpus generator.
struct Lcg(u64);

impl Lcg {
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0
    }

    fn next_range(&mut self, n: usize) -> usize {
        (self.next_u64() % n as u64) as usize
    }
}

/// A pool of real CJK Unified Ideographs codepoints — realistic character
/// distribution for both dictionary words and filler/non-matching text.
fn cjk_pool() -> Vec<char> {
    (0x4E00u32..0x4E00 + 3000).filter_map(char::from_u32).collect()
}

/// Builds `size` unique dictionary words (1-4 chars, mirroring typical
/// phrase/proper-noun/character dictionary entry lengths) into both a
/// TrieNode and a plain Vec<String> (the latter feeds the aho-corasick build).
fn build_dictionary(size: usize, pool: &[char], rng: &mut Lcg) -> (TrieNode, Vec<String>) {
    let mut trie = TrieNode::new();
    let mut words = Vec::with_capacity(size);
    let mut seen = HashSet::with_capacity(size);

    while words.len() < size {
        let len = 1 + rng.next_range(4);
        let word: String = (0..len).map(|_| pool[rng.next_range(pool.len())]).collect();
        if seen.insert(word.clone()) {
            trie.insert(&word, format!("dich_{}", words.len()), None);
            words.push(word);
        }
    }

    (trie, words)
}

/// Builds a corpus of ~`target_chars` length by interleaving real dictionary
/// words (~50% of steps) with random filler chars — approximates the hit
/// density of real Chinese-novel text against a loaded dictionary.
fn build_corpus(target_chars: usize, pool: &[char], words: &[String], rng: &mut Lcg) -> String {
    let mut s = String::new();
    let mut char_count = 0;
    while char_count < target_chars {
        if rng.next_range(2) == 0 {
            let word = &words[rng.next_range(words.len())];
            char_count += word.chars().count();
            s.push_str(word);
        } else {
            s.push(pool[rng.next_range(pool.len())]);
            char_count += 1;
        }
    }
    s
}

fn bench_trie_vs_aho_corasick(c: &mut Criterion) {
    let mut group = c.benchmark_group("trie_vs_aho_corasick");
    let pool = cjk_pool();
    const CORPUS_CHARS: usize = 8_000;

    // 27k across 7 dictionaries in production ~= 4k avg; span below/at/above it.
    for &dict_size in &[1_000usize, 5_000, 15_000] {
        let mut rng = Lcg(0x5EED_u64 ^ dict_size as u64);
        let (trie, words) = build_dictionary(dict_size, &pool, &mut rng);
        let corpus = build_corpus(CORPUS_CHARS, &pool, &words, &mut rng);
        let corpus_chars: Vec<char> = corpus.chars().collect();

        let ac = AhoCorasick::builder()
            .match_kind(MatchKind::Standard)
            .build(&words)
            .expect("failed to build Aho-Corasick automaton");

        group.bench_with_input(
            BenchmarkId::new("trie_slice_per_position", dict_size),
            &dict_size,
            |b, _| {
                b.iter(|| {
                    let mut total = 0usize;
                    for start in 0..corpus_chars.len() {
                        total += trie.find_matches(black_box(&corpus_chars), start).len();
                    }
                    black_box(total)
                })
            },
        );

        group.bench_with_input(
            BenchmarkId::new("aho_corasick_single_pass", dict_size),
            &dict_size,
            |b, _| {
                b.iter(|| {
                    let count = ac
                        .try_find_overlapping_iter(black_box(corpus.as_str()))
                        .expect("overlapping iteration unsupported for this MatchKind")
                        .count();
                    black_box(count)
                })
            },
        );
    }

    group.finish();
}

criterion_group!(benches, bench_trie_vs_aho_corasick);
criterion_main!(benches);
