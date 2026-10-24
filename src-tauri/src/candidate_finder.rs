//! Candidate finder analysis: strings of 2-8 Han characters that a book repeats like proper
//! nouns. Pure: it is handed the book's lines and the `phrases` keys, with no Tauri, no
//! state and no filesystem, so every stage is tested on a small constructed text.
//!
//! The signal stack and its starting values come from the ADR-111 prototype (wayfinder
//! ticket #38); the coverage mask, the cross-book spread gate and the background table
//! are later tickets and are not here.
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
//! 7. Glued edge: dropped when 1-2 characters plus a surviving string whose count is >=
//!    `GLUED_RATIO` times its own.
//!
//! Every Han character the finder reads (U+3400..=U+9FFF) is three bytes in UTF-8, so an
//! n-gram of a run is the byte slice `[3*i, 3*(i+n))` and no offset table is needed.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

const MIN_COUNT: u32 = 3;
const MIN_LEN: usize = 2;
const MAX_LEN: usize = 8;
const DOMINANCE: f64 = 0.7;
const MIN_ACCESSOR_VARIETY: usize = 3;
const MIN_NPMI: f64 = 0.3;
const GLUED_RATIO: u32 = 20;
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
}

/// Percent ranges of the three stages; counting is the long one.
fn stage_range(stage: Stage) -> (u32, u32) {
    match stage {
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

impl Run<'_> {
    fn len(&self) -> usize {
        self.text.len() / HAN_BYTES
    }

    fn gram(&self, start: usize, n: usize) -> &str {
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

/// Candidates of `lines`, most frequent first, or `None` when `is_cancelled` says so.
/// Cancel is checked between stages and every `CHUNK` runs or lines.
pub fn find_candidates(
    lines: &[&str],
    phrases: &HashSet<String>,
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
    let runs: Vec<Run> = raw.into_iter().map(|(line, text)| Run { line, text }).collect();
    let total_chars: usize = runs.iter().map(Run::len).sum();
    reporter.report(Stage::Reading, 1, 1);

    // ---- counting: level n counts only n-grams whose (n-1)-prefix is frequent ----
    let mut counts: Vec<HashMap<&str, u32>> = vec![HashMap::new()];
    for n in 1..=MAX_LEN + 1 {
        let mut level: HashMap<&str, u32> = HashMap::new();
        if n == 1 || !counts[n - 1].is_empty() {
            for (index, run) in runs.iter().enumerate() {
                if index % CHUNK == 0 {
                    if is_cancelled() {
                        return None;
                    }
                    reporter.report(
                        Stage::Counting,
                        (n - 1) * runs.len() + index,
                        (MAX_LEN + 1) * runs.len(),
                    );
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
        })
        .collect();
    found.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.text.cmp(&b.text)));
    Some(found)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

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
        find_candidates(&slices, &phrases, &mut |_| {}, &|| false).expect("not cancelled")
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
                &Candidate { text: "滕青山".into(), count: 32, line_count: 31 },
                &Candidate { text: "云梦泽".into(), count: 12, line_count: 12 },
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

        assert_eq!(find_candidates(&slices, &phrases, &mut |_| {}, &|| true), None);

        let polls = Cell::new(0);
        let cancel_on_fourth = || {
            polls.set(polls.get() + 1);
            polls.get() >= 4
        };
        assert_eq!(find_candidates(&slices, &phrases, &mut |_| {}, &cancel_on_fourth), None);
    }

    #[test]
    fn progress_walks_the_stages_in_order_and_ends_at_one_hundred() {
        let lines = plain("滕青山", 30);
        let slices: Vec<&str> = lines.iter().map(String::as_str).collect();
        let mut events = Vec::new();
        find_candidates(&slices, &HashSet::new(), &mut |p| events.push(p), &|| false).unwrap();

        let stages: Vec<Stage> = events.iter().map(|p| p.stage).collect();
        let mut sorted = stages.clone();
        sorted.dedup();
        assert_eq!(sorted, vec![Stage::Reading, Stage::Counting, Stage::Scoring]);
        assert!(events.windows(2).all(|w| w[0].percent <= w[1].percent));
        assert_eq!(events.last().map(|p| p.percent), Some(100));
    }
}
