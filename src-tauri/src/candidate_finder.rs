//! Candidate finder analysis: strings of 2-8 Han characters that a book repeats like proper
//! nouns. Pure: it is handed the book's lines and the `phrases` keys, with no Tauri, no
//! state and no filesystem, so every stage is tested on a small constructed text.
//!
//! The signal stack and its starting values come from the ADR-111 prototype (wayfinder
//! ticket #38). The cross-book spread gate reads **sidecars**: per book, the sorted 32-bit
//! hashes of its frequent 2-8 character strings (`build_sidecar`), kept on disk by
//! `book_index.rs`.
//!
//! Before counting, the **coverage mask** takes out the spans the book's active
//! proper-noun dictionaries match, by Phase 2's rule (see `mask_spans`).
//!
//! 1. Frequent strings (count >= `MIN_COUNT`), grown Apriori-style over runs of Han
//!    characters; any other character is a boundary.
//! 2. Maximal repeat: dropped when one neighbouring character accounts for >=
//!    `DOMINANCE` of the occurrences.
//! 3. Accessor variety >= `MIN_ACCESSOR_VARIETY`: the smaller of the distinct left and
//!    right neighbours, run start/end counted.
//! 4. No function word at either edge, and no leading 一.
//! 5. NPMI of the weakest split >= `MIN_NPMI`.
//! 6. Not a `phrases` key.
//! 7. Spread: dropped when frequent in more than `SPREAD_BOOKS` other indexed books
//!    (`Background`); skipped below `MIN_BACKGROUND_BOOKS` of them.
//! 8. Glued edge: dropped when 1-2 characters plus a surviving string whose count is >=
//!    `GLUED_RATIO` times its own.
//!
//! Every Han character the finder reads (U+3400..=U+9FFF) is three bytes in UTF-8, so an
//! n-gram of a run is the byte slice `[3*i, 3*(i+n))` and no offset table is needed.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

const MIN_COUNT: u32 = 3;
const MIN_LEN: usize = 2;
const MAX_LEN: usize = 8;
const DOMINANCE: f64 = 0.7;
const MIN_ACCESSOR_VARIETY: usize = 3;
const MIN_NPMI: f64 = 0.3;
const GLUED_RATIO: u32 = 20;
/// A string frequent in more than this many other books is common vocabulary.
const SPREAD_BOOKS: usize = 2;
/// Fewer other indexed books than this and the spread gate is skipped (the notice shows).
pub const MIN_BACKGROUND_BOOKS: usize = 4;
const HAN_BYTES: usize = 3;

/// Hand-written, tuned on one book (ADR-111). Strings starting or ending in one are dropped.
const FUNCTION_WORDS: &str =
    "的了是在和就都也不他她它我你您说道着过地得之而与或但被把让给又还很更最这那有没吗呢吧啊哦嗯么什向";
/// Dropped only at the start: 一个/一丝/一声/一片.
const START_ONLY_FUNCTION_WORDS: &str = "一";

/// How often the analysis polls for cancel: every this many runs or lines.
const CHUNK: usize = 2048;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Reading,
    #[serde(rename = "background table")]
    BackgroundTable,
    Counting,
    Scoring,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub stage: Stage,
    /// 0-100 over the whole run, not within the stage.
    pub percent: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub text: String,
    pub count: u32,
    /// Lines the string occurs in.
    pub line_count: u32,
    /// Ids of the inactive proper-noun dictionaries that hold this string (the Also-in tag).
    pub also_in: Vec<String>,
}

/// Dictionary keys with the prefixes of every key, so a longest-match scan stops at the first
/// prefix no key starts with.
#[derive(Debug, Default)]
pub struct KeySet {
    keys: HashSet<String>,
    prefixes: HashSet<String>,
    max_len: usize,
}

impl KeySet {
    pub fn new(keys: impl IntoIterator<Item = String>) -> Self {
        let mut set = KeySet::default();
        for key in keys {
            let chars: Vec<usize> = key.char_indices().map(|(at, _)| at).collect();
            set.max_len = set.max_len.max(chars.len());
            for &end in chars.iter().skip(1) {
                set.prefixes.insert(key[..end].to_string());
            }
            set.keys.insert(key);
        }
        set
    }

    fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }

    fn contains(&self, key: &str) -> bool {
        self.keys.contains(key)
    }
}

/// An inactive proper-noun dictionary: only tags a candidate, never masks.
#[derive(Debug, Clone, Deserialize)]
pub struct InactiveDictionary {
    pub id: String,
    pub keys: HashSet<String>,
}

/// The proper-noun dictionaries of the run, snapshotted when it started.
#[derive(Debug, Default)]
pub struct Coverage {
    /// Keys of the book's active proper-noun dictionaries: the mask.
    pub active: KeySet,
    pub inactive: Vec<InactiveDictionary>,
}

/// The other indexed books' sidecars: sorted hashes of each book's frequent strings.
#[derive(Debug, Default)]
pub struct Background {
    sidecars: Vec<Vec<u32>>,
}

impl Background {
    /// Each sidecar must be sorted (`build_sidecar` and `book_index::decode` guarantee it).
    pub fn new(sidecars: Vec<Vec<u32>>) -> Self {
        Self { sidecars }
    }

    /// Too few books for the spread gate to mean anything.
    pub fn is_weak(&self) -> bool {
        self.sidecars.len() < MIN_BACKGROUND_BOOKS
    }

    fn is_common(&self, g: &str) -> bool {
        if self.is_weak() {
            return false;
        }
        let hash = string_hash(g);
        self.sidecars.iter().filter(|s| s.binary_search(&hash).is_ok()).count() > SPREAD_BOOKS
    }
}

/// FNV-1a over the UTF-8 bytes: stable across runs and builds, which a sidecar on disk needs.
pub fn string_hash(s: &str) -> u32 {
    s.bytes().fold(0x811c_9dc5u32, |hash, b| (hash ^ u32::from(b)).wrapping_mul(0x0100_0193))
}

/// Percent ranges of the three stages; counting is the long one.
fn stage_range(stage: Stage) -> (u32, u32) {
    match stage {
        // Reported by the command that builds the sidecars, which scales it itself.
        Stage::BackgroundTable => (0, 100),
        Stage::Reading => (0, 5),
        Stage::Counting => (5, 70),
        Stage::Scoring => (70, 100),
    }
}

/// Turns `done / total` within a stage into an overall percent and passes on only changes.
struct Reporter<'a> {
    emit: &'a mut dyn FnMut(Progress),
    last: Option<Progress>,
}

impl Reporter<'_> {
    fn report(&mut self, stage: Stage, done: usize, total: usize) {
        let (lo, hi) = stage_range(stage);
        let within = if total == 0 { hi - lo } else { ((hi - lo) as usize * done / total) as u32 };
        let progress = Progress { stage, percent: (lo + within).min(100) as u8 };
        if self.last != Some(progress) {
            self.last = Some(progress);
            (self.emit)(progress);
        }
    }
}

struct Run<'a> {
    line: u32,
    text: &'a str,
}

impl<'a> Run<'a> {
    fn len(&self) -> usize {
        self.text.len() / HAN_BYTES
    }

    fn gram(&self, start: usize, n: usize) -> &'a str {
        &self.text[HAN_BYTES * start..HAN_BYTES * (start + n)]
    }
}

fn is_han(c: char) -> bool {
    ('\u{3400}'..='\u{9fff}').contains(&c)
}

fn han_runs<'a>(lines: &[&'a str]) -> Vec<(u32, &'a str)> {
    let mut runs = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let mut start = None;
        for (at, c) in line.char_indices() {
            match (is_han(c), start) {
                (true, None) => start = Some(at),
                (false, Some(from)) => {
                    runs.push((index as u32, &line[from..at]));
                    start = None;
                }
                _ => {}
            }
        }
        if let Some(from) = start {
            runs.push((index as u32, &line[from..]));
        }
    }
    runs
}

/// Up to three distinct neighbour characters; three is all accessor variety asks for.
#[derive(Default)]
struct Seen {
    chars: [char; MIN_ACCESSOR_VARIETY],
    len: usize,
}

impl Seen {
    fn insert(&mut self, c: char) {
        if self.len < self.chars.len() && !self.chars[..self.len].contains(&c) {
            self.chars[self.len] = c;
            self.len += 1;
        }
    }
}

#[derive(Default)]
struct Neighbours {
    left: Seen,
    right: Seen,
}

/// Run start and end as neighbours; neither is a Han character, so neither collides.
const RUN_START: char = '\u{0}';
const RUN_END: char = '\u{1}';

fn has_function_word_edge(g: &str) -> bool {
    let first = g.chars().next().unwrap_or(' ');
    let last = g.chars().next_back().unwrap_or(' ');
    FUNCTION_WORDS.contains(first)
        || FUNCTION_WORDS.contains(last)
        || START_ONLY_FUNCTION_WORDS.contains(first)
}

/// Characters in the longest key that starts at char `at` of `run` (Han only), 0 for none.
fn longest_key_at(run: &str, at: usize, keys: &KeySet) -> usize {
    let len = run.len() / HAN_BYTES;
    let mut longest = 0;
    for n in 1..=keys.max_len.min(len - at) {
        let gram = &run[HAN_BYTES * at..HAN_BYTES * (at + n)];
        if keys.contains(gram) {
            longest = n;
        }
        if !keys.prefixes.contains(gram) {
            break;
        }
    }
    longest
}

/// The `(start, length)` char spans of the Han run `run` that `keys` cover, by Phase 2's rule
/// (`TranslationEngine.applyProperNouns`): left to right, the longest key at a position wins,
/// unless a position inside its span starts a strictly longer key, which defers it; the
/// deferred position then moves on one char. Shared fixture:
/// `src/test/fixtures/coverage-mask-parity.json`.
fn mask_spans(run: &str, keys: &KeySet) -> Vec<(usize, usize)> {
    let len = run.len() / HAN_BYTES;
    let mut spans = Vec::new();
    let mut i = 0;
    while i < len {
        let n = longest_key_at(run, i, keys);
        if n == 0 || (i + 1..i + n).any(|j| longest_key_at(run, j, keys) > n) {
            i += 1;
            continue;
        }
        spans.push((i, n));
        i += n;
    }
    spans
}

/// `run` without the spans `keys` cover: the pieces between them.
fn unmasked_pieces<'a>(run: &'a str, keys: &KeySet) -> Vec<&'a str> {
    let mut pieces = Vec::new();
    let mut from = 0;
    for (start, length) in mask_spans(run, keys) {
        if start > from {
            pieces.push(&run[HAN_BYTES * from..HAN_BYTES * start]);
        }
        from = start + length;
    }
    if HAN_BYTES * from < run.len() {
        pieces.push(&run[HAN_BYTES * from..]);
    }
    pieces
}

/// Frequent strings by length: `counts[n]` holds the n-grams (n = 1..=`MAX_LEN` + 1) seen at
/// least `MIN_COUNT` times. Level n counts only n-grams whose (n-1)-grams are frequent.
/// `tick(done, total)` reports progress; `None` when cancelled.
fn count_frequent<'a>(
    runs: &[Run<'a>],
    is_cancelled: &dyn Fn() -> bool,
    tick: &mut dyn FnMut(usize, usize),
) -> Option<Vec<HashMap<&'a str, u32>>> {
    let mut counts: Vec<HashMap<&str, u32>> = vec![HashMap::new()];
    for n in 1..=MAX_LEN + 1 {
        let mut level: HashMap<&str, u32> = HashMap::new();
        if n == 1 || !counts[n - 1].is_empty() {
            for (index, run) in runs.iter().enumerate() {
                if index % CHUNK == 0 {
                    if is_cancelled() {
                        return None;
                    }
                    tick((n - 1) * runs.len() + index, (MAX_LEN + 1) * runs.len());
                }
                if run.len() < n {
                    continue;
                }
                for i in 0..=run.len() - n {
                    // Both (n-1)-grams inside it must be frequent, or it cannot be.
                    if n > 1
                        && !(counts[n - 1].contains_key(run.gram(i, n - 1))
                            && counts[n - 1].contains_key(run.gram(i + 1, n - 1)))
                    {
                        continue;
                    }
                    *level.entry(run.gram(i, n)).or_insert(0) += 1;
                }
            }
            level.retain(|_, count| *count >= MIN_COUNT);
        }
        counts.push(level);
    }
    Some(counts)
}

/// A book's sidecar: the sorted, deduplicated hashes of its frequent 2-8 character strings,
/// unmasked (it describes the book, not one run's dictionaries). `None` when cancelled.
pub fn build_sidecar(lines: &[&str], is_cancelled: &dyn Fn() -> bool) -> Option<Vec<u32>> {
    let runs: Vec<Run> = han_runs(lines).into_iter().map(|(line, text)| Run { line, text }).collect();
    let counts = count_frequent(&runs, is_cancelled, &mut |_, _| {})?;
    let mut hashes: Vec<u32> = (MIN_LEN..=MAX_LEN)
        .flat_map(|n| counts[n].keys().map(|g| string_hash(g)))
        .collect();
    hashes.sort_unstable();
    hashes.dedup();
    Some(hashes)
}

/// Candidates of `lines`, most frequent first, or `None` when `is_cancelled` says so.
/// Cancel is checked between stages and every `CHUNK` runs or lines.
pub fn find_candidates(
    lines: &[&str],
    phrases: &HashSet<String>,
    coverage: &Coverage,
    background: &Background,
    progress: &mut dyn FnMut(Progress),
    is_cancelled: &dyn Fn() -> bool,
) -> Option<Vec<Candidate>> {
    let mut reporter = Reporter { emit: progress, last: None };

    // ---- reading ----
    reporter.report(Stage::Reading, 0, 1);
    let raw = han_runs(lines);
    if is_cancelled() {
        return None;
    }
    let mut runs: Vec<Run> = Vec::with_capacity(raw.len());
    for (index, (line, text)) in raw.into_iter().enumerate() {
        if index % CHUNK == 0 && is_cancelled() {
            return None;
        }
        if coverage.active.is_empty() {
            runs.push(Run { line, text });
        } else {
            runs.extend(unmasked_pieces(text, &coverage.active).into_iter().map(|text| Run { line, text }));
        }
    }
    let total_chars: usize = runs.iter().map(Run::len).sum();
    reporter.report(Stage::Reading, 1, 1);

    // ---- counting ----
    let counts = count_frequent(&runs, is_cancelled, &mut |done, total| {
        reporter.report(Stage::Counting, done, total)
    })?;
    reporter.report(Stage::Counting, 1, 1);
    if is_cancelled() {
        return None;
    }

    // ---- scoring ----
    // Nothing longer than the longest frequent string can be a neighbour-set or survivor key.
    let longest = (MIN_LEN..=MAX_LEN).rev().find(|&n| !counts[n].is_empty()).unwrap_or(0);
    // Neighbours of every frequent string of 2-8 characters.
    let mut neighbours: HashMap<&str, Neighbours> = HashMap::new();
    for (index, run) in runs.iter().enumerate() {
        if index % CHUNK == 0 {
            if is_cancelled() {
                return None;
            }
            reporter.report(Stage::Scoring, index, runs.len() * 2);
        }
        for n in MIN_LEN..=longest.min(run.len()) {
            for i in 0..=run.len() - n {
                let g = run.gram(i, n);
                if !counts[n].contains_key(g) {
                    continue;
                }
                let entry = neighbours.entry(g).or_default();
                let left = if i == 0 { RUN_START } else { run.gram(i - 1, 1).chars().next().unwrap_or(RUN_START) };
                let right = if i + n == run.len() {
                    RUN_END
                } else {
                    run.gram(i + n, 1).chars().next().unwrap_or(RUN_END)
                };
                entry.left.insert(left);
                entry.right.insert(right);
            }
        }
    }

    // The largest count of any one-character extension on each side.
    let mut max_left: HashMap<&str, u32> = HashMap::new();
    let mut max_right: HashMap<&str, u32> = HashMap::new();
    for n in MIN_LEN + 1..=MAX_LEN + 1 {
        for (g, &count) in &counts[n] {
            let suffix = &g[HAN_BYTES..];
            let prefix = &g[..g.len() - HAN_BYTES];
            let left = max_left.entry(suffix).or_insert(0);
            *left = (*left).max(count);
            let right = max_right.entry(prefix).or_insert(0);
            *right = (*right).max(count);
        }
    }

    let total = total_chars as f64;
    let count_of = |g: &str| counts[g.len() / HAN_BYTES].get(g).copied().unwrap_or(0);
    let weakest_npmi = |g: &str, count: u32| {
        let p_whole = f64::from(count) / total;
        let mut worst = f64::INFINITY;
        for split in 1..g.len() / HAN_BYTES {
            let a = f64::from(count_of(&g[..HAN_BYTES * split])) / total;
            let b = f64::from(count_of(&g[HAN_BYTES * split..])) / total;
            if a == 0.0 || b == 0.0 {
                continue;
            }
            worst = worst.min((p_whole / (a * b)).ln() / -p_whole.ln());
        }
        worst
    };

    let mut survivors: HashMap<&str, u32> = HashMap::new();
    for n in MIN_LEN..=MAX_LEN {
        for (&g, &count) in &counts[n] {
            let c = f64::from(count);
            let dominated = f64::from(max_left.get(g).copied().unwrap_or(0)) / c >= DOMINANCE
                || f64::from(max_right.get(g).copied().unwrap_or(0)) / c >= DOMINANCE;
            let variety = neighbours.get(g).map_or(0, |n| n.left.len.min(n.right.len));
            if dominated
                || variety < MIN_ACCESSOR_VARIETY
                || has_function_word_edge(g)
                || phrases.contains(g)
                || coverage.active.contains(g)
                || background.is_common(g)
                || !(weakest_npmi(g, count) >= MIN_NPMI)
            {
                continue;
            }
            survivors.insert(g, count);
        }
    }

    // Glued edge, judged against the survivors before any glued one is removed.
    let glued: Vec<&str> = survivors
        .iter()
        .filter(|(g, &count)| {
            (1..=2).any(|k| {
                let chars = g.len() / HAN_BYTES;
                chars > k
                    && chars - k >= MIN_LEN
                    && [&g[HAN_BYTES * k..], &g[..g.len() - HAN_BYTES * k]]
                        .iter()
                        .any(|part| survivors.get(part).is_some_and(|&c| c >= GLUED_RATIO * count))
            })
        })
        .map(|(g, _)| *g)
        .collect();
    for g in glued {
        survivors.remove(g);
    }

    // Line counts for the survivors only.
    let mut lines_seen: HashMap<&str, (u32, u32)> =
        survivors.keys().map(|&g| (g, (0, u32::MAX))).collect();
    for (index, run) in runs.iter().enumerate() {
        if index % CHUNK == 0 {
            if is_cancelled() {
                return None;
            }
            reporter.report(Stage::Scoring, runs.len() + index, runs.len() * 2);
        }
        for n in MIN_LEN..=longest.min(run.len()) {
            for i in 0..=run.len() - n {
                if let Some((line_count, last_line)) = lines_seen.get_mut(run.gram(i, n)) {
                    if *last_line != run.line {
                        *last_line = run.line;
                        *line_count += 1;
                    }
                }
            }
        }
    }
    reporter.report(Stage::Scoring, 1, 1);

    let mut found: Vec<Candidate> = survivors
        .into_iter()
        .map(|(g, count)| Candidate {
            text: g.to_string(),
            count,
            line_count: lines_seen.get(g).map_or(0, |&(line_count, _)| line_count),
            also_in: coverage
                .inactive
                .iter()
                .filter(|dictionary| dictionary.keys.contains(g))
                .map(|dictionary| dictionary.id.clone())
                .collect(),
        })
        .collect();
    found.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.text.cmp(&b.text)));
    Some(found)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn keyset(keys: &[&str]) -> KeySet {
        KeySet::new(keys.iter().map(|k| k.to_string()))
    }

    /// Mask spans of one line in chars of the whole line, as the shared fixture states them.
    fn line_mask_spans(line: &str, keys: &KeySet) -> Vec<(usize, usize)> {
        let mut spans = Vec::new();
        for (_, run) in han_runs(&[line]) {
            let offset = line[..run.as_ptr() as usize - line.as_ptr() as usize].chars().count();
            spans.extend(mask_spans(run, keys).into_iter().map(|(s, n)| (offset + s, n)));
        }
        spans
    }

    #[derive(Deserialize)]
    struct MaskSpan {
        start: usize,
        length: usize,
    }

    #[derive(Deserialize)]
    struct MaskCase {
        name: String,
        text: String,
        keys: Vec<String>,
        masked: Vec<MaskSpan>,
    }

    #[derive(Deserialize)]
    struct MaskFixture {
        cases: Vec<MaskCase>,
    }

    #[test]
    fn mask_spans_match_the_shared_fixture() {
        let raw = include_str!("../../src/test/fixtures/coverage-mask-parity.json");
        let fixture: MaskFixture = serde_json::from_str(raw)
            .expect("coverage-mask-parity.json must be valid JSON matching the fixture shape");
        assert!(!fixture.cases.is_empty(), "fixture must not be empty");

        let mut diverged = Vec::new();
        for case in &fixture.cases {
            let keys = KeySet::new(case.keys.iter().cloned());
            let expected: Vec<(usize, usize)> =
                case.masked.iter().map(|s| (s.start, s.length)).collect();
            let spans = line_mask_spans(&case.text, &keys);
            if spans != expected {
                diverged.push(format!(
                    "\"{}\" ({}): fixture {:?}, matcher {:?}",
                    case.name, case.text, expected, spans
                ));
            }
        }
        assert!(diverged.is_empty(), "mask diverges from the fixture:\n{}", diverged.join("\n"));
    }

    fn with_coverage(lines: &[String], active: &[&str], inactive: &[(&str, &[&str])]) -> Vec<Candidate> {
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        let coverage = Coverage {
            active: keyset(active),
            inactive: inactive
                .iter()
                .map(|(id, keys)| InactiveDictionary {
                    id: id.to_string(),
                    keys: keys.iter().map(|k| k.to_string()).collect(),
                })
                .collect(),
        };
        find_candidates(&slices, &HashSet::new(), &coverage, &Background::default(), &mut |_| {}, &|| false)
            .expect("not cancelled")
    }

    #[test]
    fn a_name_held_by_an_active_dictionary_is_not_listed() {
        let mut lines = plain("滕青山", 30);
        lines.extend(plain("云梦泽", 30));
        let found = texts(&with_coverage(&lines, &["滕青山"], &[])).into_iter().map(String::from).collect::<Vec<_>>();
        assert!(!found.contains(&"滕青山".to_string()));
        assert!(found.contains(&"云梦泽".to_string()));
    }

    #[test]
    fn fragments_of_an_active_entry_and_strings_glued_to_it_are_not_listed() {
        // 东哥笑 is a candidate on its own (东哥 is dominated by it); masking 东哥 removes both.
        let lines: Vec<String> = (0..30)
            .map(|i| format!("{}{}{}", ctx(i), "东哥笑", ctx(i + 1)))
            .collect();
        assert!(texts(&with_coverage(&lines, &[], &[])).contains(&"东哥笑"));
        let covered = with_coverage(&lines, &["东哥"], &[]);
        assert!(texts(&covered).iter().all(|t| !t.contains('东') && !t.contains('哥')));
    }

    #[test]
    fn a_name_in_an_inactive_dictionary_stays_listed_with_its_ids() {
        let lines = plain("滕青山", 30);
        let found = with_coverage(
            &lines,
            &[],
            &[("properNouns-f_A", &["滕青山"]), ("properNouns-f_B", &["云梦泽"]), ("properNouns", &["滕青山"])],
        );
        let name = found.iter().find(|c| c.text == "滕青山").expect("listed");
        assert_eq!(name.also_in, vec!["properNouns-f_A".to_string(), "properNouns".to_string()]);
    }

    #[test]
    fn an_inactive_dictionary_never_masks() {
        let lines: Vec<String> = (0..30)
            .map(|i| format!("{}{}{}", ctx(i), "东哥笑", ctx(i + 1)))
            .collect();
        let found = with_coverage(&lines, &[], &[("properNouns-f_A", &["东哥"])]);
        assert!(texts(&found).contains(&"东哥笑"));
    }

    const CONTEXT: [&str; 6] = ["甲", "乙", "丙", "丁", "戊", "己"];

    fn ctx(i: usize) -> &'static str {
        CONTEXT[i % 6]
    }

    /// `times` lines holding `name`, with neighbours that cycle so accessor variety is 6.
    fn plain(name: &str, times: usize) -> Vec<String> {
        (0..times).map(|i| format!("{}{}{}。", ctx(i), name, ctx(i + 1))).collect()
    }

    fn run(lines: &[String], phrases: &[&str]) -> Vec<Candidate> {
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        let phrases = phrases.iter().map(|p| p.to_string()).collect();
        find_candidates(&slices, &phrases, &Coverage::default(), &Background::default(), &mut |_| {}, &|| false).expect("not cancelled")
    }

    fn texts(found: &[Candidate]) -> Vec<&str> {
        found.iter().map(|c| c.text.as_str()).collect()
    }

    #[test]
    fn a_repeated_name_comes_back_with_count_and_line_count_ranked_by_count() {
        let mut lines = plain("滕青山", 30);
        lines.push("甲滕青山乙滕青山丙。".to_string());
        lines.extend(plain("云梦泽", 12));
        let found = run(&lines, &[]);

        let top: Vec<_> = found.iter().filter(|c| c.text == "滕青山" || c.text == "云梦泽").collect();
        assert_eq!(
            top,
            vec![
                &Candidate { text: "滕青山".into(), count: 32, line_count: 31, also_in: vec![] },
                &Candidate { text: "云梦泽".into(), count: 12, line_count: 12, also_in: vec![] },
            ]
        );
    }

    #[test]
    fn a_string_seen_fewer_than_three_times_is_not_a_candidate() {
        assert!(!texts(&run(&plain("滕青山", 2), &[])).contains(&"滕青山"));
    }

    #[test]
    fn a_string_that_mostly_continues_the_same_way_is_dropped_for_its_longer_form() {
        // 滕青山 has 6 right neighbours, so accessor variety passes; 大 is 16 of its 20.
        let lines: Vec<String> = (0..20)
            .map(|i| {
                let tail = if i < 16 { "大" } else { "" };
                format!("{}滕青山{}{}。", ctx(i), tail, ctx(i + 1))
            })
            .collect();
        let found = texts(&run(&lines, &[])).into_iter().map(String::from).collect::<Vec<_>>();
        assert!(!found.contains(&"滕青山".to_string()));
        assert!(found.contains(&"滕青山大".to_string()));
    }

    #[test]
    fn a_string_with_fewer_than_three_distinct_neighbours_on_a_side_is_dropped() {
        let narrow: Vec<String> =
            (0..16).map(|i| format!("{}滕青山{}。", ctx(i % 2), ctx(i))).collect();
        let mut lines = narrow;
        lines.extend(plain("云梦泽", 16));
        let found = texts(&run(&lines, &[])).into_iter().map(String::from).collect::<Vec<_>>();
        assert!(!found.contains(&"滕青山".to_string()));
        assert!(found.contains(&"云梦泽".to_string()));
    }

    #[test]
    fn a_function_word_at_either_edge_drops_the_string() {
        // Half the lines carry the edge word, so the bare name is not dominated.
        let trailing: Vec<String> = (0..24)
            .map(|j| {
                if j % 2 == 0 {
                    format!("{}滕青山的{}。", ctx(j), ctx(j + 1))
                } else {
                    format!("{}滕青山{}。", ctx(j), ctx(j + 2))
                }
            })
            .collect();
        let leading: Vec<String> = (0..24)
            .map(|j| {
                if j % 2 == 0 {
                    format!("{}他云梦泽{}。", ctx(j), ctx(j + 1))
                } else {
                    format!("{}云梦泽{}。", ctx(j), ctx(j + 2))
                }
            })
            .collect();
        let found = texts(&run(&[trailing, leading].concat(), &[]))
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();

        assert!(found.contains(&"滕青山".to_string()));
        assert!(!found.contains(&"滕青山的".to_string()));
        assert!(found.contains(&"云梦泽".to_string()));
        assert!(!found.contains(&"他云梦泽".to_string()));
    }

    #[test]
    fn a_string_made_of_two_common_characters_that_rarely_meet_is_dropped() {
        // 金 and 木 occur 300 times each and meet three times: NPMI is below zero.
        let mut lines: Vec<String> = Vec::new();
        for i in 0..297 {
            lines.push(format!("金{}。", ctx(i)));
            lines.push(format!("{}木。", ctx(i)));
        }
        for i in 0..3 {
            lines.push(format!("{}金木{}。", ctx(i), ctx(i + 3)));
        }
        lines.extend(plain("滕青山", 30));
        let found = texts(&run(&lines, &[])).into_iter().map(String::from).collect::<Vec<_>>();
        assert!(!found.contains(&"金木".to_string()));
        assert!(found.contains(&"滕青山".to_string()));
    }

    #[test]
    fn a_string_glued_to_a_name_twenty_times_as_frequent_is_dropped() {
        // 看着滕青山 (3) beside 滕青山 (63): ratio 21. 望着赤焰山 (3) beside 赤焰山 (43): ratio 14.
        let mut lines = plain("滕青山", 60);
        lines.extend((0..3).map(|i| format!("{}看着滕青山{}。", ctx(i), ctx(i + 3))));
        lines.extend(plain("赤焰山", 40));
        lines.extend((0..3).map(|i| format!("{}望着赤焰山{}。", ctx(i), ctx(i + 3))));
        let found = texts(&run(&lines, &[])).into_iter().map(String::from).collect::<Vec<_>>();

        assert!(found.contains(&"滕青山".to_string()));
        assert!(!found.contains(&"看着滕青山".to_string()));
        assert!(found.contains(&"望着赤焰山".to_string()));
    }

    #[test]
    fn a_phrases_key_is_dropped() {
        let lines = plain("滕青山", 30);
        assert!(texts(&run(&lines, &[])).contains(&"滕青山"));
        assert!(!texts(&run(&lines, &["滕青山"])).contains(&"滕青山"));
    }

    #[test]
    fn cancel_returns_nothing_whether_at_the_start_or_part_way() {
        let lines = plain("滕青山", 30);
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        let phrases = HashSet::new();

        assert_eq!(find_candidates(&slices, &phrases, &Coverage::default(), &Background::default(), &mut |_| {}, &|| true), None);

        let polls = Cell::new(0);
        let cancel_on_fourth = || {
            polls.set(polls.get() + 1);
            polls.get() >= 4
        };
        assert_eq!(find_candidates(&slices, &phrases, &Coverage::default(), &Background::default(), &mut |_| {}, &cancel_on_fourth), None);
    }

    #[test]
    fn progress_walks_the_stages_in_order_and_ends_at_one_hundred() {
        let lines = plain("滕青山", 30);
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        let mut events = Vec::new();
        find_candidates(&slices, &HashSet::new(), &Coverage::default(), &Background::default(), &mut |p| events.push(p), &|| false).unwrap();

        let stages: Vec<Stage> = events.iter().map(|p| p.stage).collect();
        let mut sorted = stages.clone();
        sorted.dedup();
        assert_eq!(sorted, vec![Stage::Reading, Stage::Counting, Stage::Scoring]);
        assert!(events.windows(2).all(|w| w[0].percent <= w[1].percent));
        assert_eq!(events.last().map(|p| p.percent), Some(100));
    }

    /// Sidecars as the book index would hold them: each book frequent in the given strings.
    fn background_of(books: &[&[&str]]) -> Background {
        Background::new(
            books
                .iter()
                .map(|strings| {
                    let mut hashes: Vec<u32> = strings.iter().map(|s| string_hash(s)).collect();
                    hashes.sort_unstable();
                    hashes
                })
                .collect(),
        )
    }

    fn run_with_background(lines: &[String], background: &Background) -> Vec<String> {
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        find_candidates(&slices, &HashSet::new(), &Coverage::default(), background, &mut |_| {}, &|| false)
            .expect("not cancelled")
            .into_iter()
            .map(|c| c.text)
            .collect()
    }

    #[test]
    fn the_spread_gate_drops_a_string_frequent_in_three_other_books_and_keeps_one_in_two() {
        let mut lines = plain("滕青山", 30);
        lines.extend(plain("云梦泽", 30));
        let other: &[&str] = &["无关"];
        let background = background_of(&[
            &["滕青山", "云梦泽"],
            &["滕青山", "云梦泽"],
            &["滕青山"],
            other,
        ]);
        let found = run_with_background(&lines, &background);
        assert!(!found.contains(&"滕青山".to_string()), "frequent in 3 other books");
        assert!(found.contains(&"云梦泽".to_string()), "frequent in 2 other books");
    }

    #[test]
    fn with_fewer_than_four_other_books_the_spread_gate_is_skipped() {
        let lines = plain("滕青山", 30);
        let three = background_of(&[&["滕青山"], &["滕青山"], &["滕青山"]]);
        assert!(three.is_weak());
        assert!(run_with_background(&lines, &three).contains(&"滕青山".to_string()));
        let four = background_of(&[&["滕青山"], &["滕青山"], &["滕青山"], &["滕青山"]]);
        assert!(!four.is_weak());
        assert!(!run_with_background(&lines, &four).contains(&"滕青山".to_string()));
    }

    #[test]
    fn the_phrases_filter_still_runs_when_the_spread_gate_is_skipped() {
        let lines = plain("滕青山", 30);
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        let phrases: HashSet<String> = ["滕青山".to_string()].into();
        let found = find_candidates(&slices, &phrases, &Coverage::default(), &Background::default(), &mut |_| {}, &|| false)
            .unwrap();
        assert!(found.iter().all(|c| c.text != "滕青山"));
    }

    #[test]
    fn a_sidecar_is_the_sorted_hashes_of_the_books_frequent_strings_and_is_deterministic() {
        let mut lines = plain("滕青山", 30);
        lines.extend(plain("赤焰山", 2));
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        let sidecar = build_sidecar(&slices, &|| false).expect("not cancelled");
        assert_eq!(build_sidecar(&slices, &|| false), Some(sidecar.clone()));
        assert!(sidecar.windows(2).all(|w| w[0] < w[1]), "sorted, no duplicates");
        assert!(sidecar.binary_search(&string_hash("滕青山")).is_ok());
        assert!(sidecar.binary_search(&string_hash("赤焰山")).is_err(), "seen twice only");
    }

    #[test]
    fn a_cancelled_sidecar_build_returns_nothing() {
        let lines = plain("滕青山", 30);
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        assert_eq!(build_sidecar(&slices, &|| true), None);
    }
}
