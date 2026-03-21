//! Rust parity validator for the greedy interval scheduling algorithm used in
//! `TranslationEngine.js::resolveGlobalConflicts()` and `resolveMatchConflicts()`.
//!
//! # Purpose
//!
//! This file contains an **independent Rust implementation** of the same algorithm to
//! catch divergence if either JS version is modified. It mirrors the 11 test vectors
//! from `src/utils/__tests__/TranslationEngine.resolveConflicts.test.js`.
//!
//! # What this is NOT
//!
//! `wasm-core/src/pattern_processor/matcher.rs::find_best_pattern_match()` is NOT a
//! counterpart of this algorithm. That function selects the best pattern at a *single*
//! position (one call per position during Phase 1). This algorithm runs greedy interval
//! scheduling across *all* positions at once (Phase 4 conflict resolution).
//!
//! # Production use
//!
//! The production implementation lives in `wasm-core/src/conflict_resolution.rs`.
//! It exports `resolveGlobalConflicts` (Phase 4) and `resolveMatchConflictsCore` (Phase 2)
//! as WASM functions using flat `Uint32Array` I/O — near-zero boundary cost vs 5–20× JSON overhead.
//! This file is an **independent parity validator** — it re-implements the algorithm
//! using idiomatic Rust types to catch divergence if the JS version is modified.
//!
//! # Algorithm (mirrors JS exactly)
//!
//! 1. Sort candidates: **length descending** → **type priority ascending** (Phrase < Pattern <
//!    Other) → **start_index ascending** (earlier start wins)
//! 2. Greedy select non-overlapping candidates; mark token indices as used on acceptance

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
enum MatchType {
    Phrase,
    Pattern,
    Other,
}

impl MatchType {
    /// Type priority used as the secondary sort key.
    /// Mirrors JS: phrase → 1, pattern → 2, other → 3
    fn priority(&self) -> u8 {
        match self {
            MatchType::Phrase => 1,
            MatchType::Pattern => 2,
            MatchType::Other => 3,
        }
    }
}

/// Minimal match descriptor — only the fields the conflict-resolution algorithm inspects.
/// Mirrors the subset of JS match object fields used by `resolveGlobalConflicts()`.
#[derive(Debug, Clone)]
struct ConflictCandidate {
    start_index: usize,
    end_index: usize,
    /// `endIndex - startIndex + 1` (matches JS test helper behaviour)
    length: usize,
    match_type: MatchType,
    /// Test label for readable assertions (phrase word or pattern string)
    label: &'static str,
}

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers (mirror the JS helpers in resolveConflicts.test.js)
// ─────────────────────────────────────────────────────────────────────────────

fn phrase(label: &'static str, start_index: usize, end_index: usize) -> ConflictCandidate {
    ConflictCandidate {
        start_index,
        end_index,
        length: end_index - start_index + 1,
        match_type: MatchType::Phrase,
        label,
    }
}

fn pattern(label: &'static str, start_index: usize, end_index: usize) -> ConflictCandidate {
    ConflictCandidate {
        start_index,
        end_index,
        length: end_index - start_index + 1,
        match_type: MatchType::Pattern,
        label,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Algorithm — exact Rust port of TranslationEngine.js::resolveGlobalConflicts()
// ─────────────────────────────────────────────────────────────────────────────

/// Greedy interval scheduling with length-first sort.
///
/// Returns the **indices** into the original `candidates` slice of the selected
/// (non-overlapping) candidates. Returning indices preserves the JS semantics of
/// returning original object references rather than copies.
///
/// Sort order (mirrors JS comparator):
/// 1. `length` descending — longer matches win
/// 2. `match_type.priority()` ascending — Phrase (1) beats Pattern (2)
/// 3. `start_index` ascending — earlier start wins on equal length + type
fn resolve_global_conflicts(candidates: &[ConflictCandidate]) -> Vec<usize> {
    if candidates.is_empty() {
        return Vec::new();
    }

    // Pair each candidate with its original index for stable reference after sort
    let mut indexed: Vec<(usize, &ConflictCandidate)> =
        candidates.iter().enumerate().collect();

    indexed.sort_by(|(_, a), (_, b)| {
        // Primary: length descending
        b.length
            .cmp(&a.length)
            // Secondary: type priority ascending (Phrase < Pattern < Other)
            .then_with(|| a.match_type.priority().cmp(&b.match_type.priority()))
            // Tertiary: start_index ascending (earlier wins)
            .then_with(|| a.start_index.cmp(&b.start_index))
    });

    let mut selected_indices: Vec<usize> = Vec::new();
    let mut used: std::collections::HashSet<usize> = std::collections::HashSet::new();

    for (orig_idx, candidate) in &indexed {
        let has_conflict = (candidate.start_index..=candidate.end_index)
            .any(|i| used.contains(&i));

        if !has_conflict {
            selected_indices.push(*orig_idx);
            for i in candidate.start_index..=candidate.end_index {
                used.insert(i);
            }
        }
    }

    selected_indices
}

/// Convenience wrapper: resolve then return the labels of selected candidates.
fn resolve_labels(candidates: &[ConflictCandidate]) -> Vec<&'static str> {
    resolve_global_conflicts(candidates)
        .into_iter()
        .map(|i| candidates[i].label)
        .collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — mirroring all 11 vectors from resolveConflicts.test.js
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_empty_input_returns_empty_output() {
    assert!(resolve_global_conflicts(&[]).is_empty());
}

#[test]
fn test_single_match_always_selected() {
    let candidates = vec![phrase("不知道", 0, 2)];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result, vec![0]);
}

#[test]
fn test_two_non_overlapping_both_selected() {
    let candidates = vec![phrase("不知道", 0, 2), phrase("谢谢", 3, 4)];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 2);
    assert!(result.contains(&0));
    assert!(result.contains(&1));
}

#[test]
fn test_longer_match_wins_over_shorter_overlapping() {
    // JS: "longer match wins over shorter overlapping match"
    let candidates = vec![
        phrase("不知", 0, 1),   // length 2 — index 0
        phrase("不知道", 0, 2), // length 3 — index 1, wins
    ];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0], 1); // "不知道" selected
}

#[test]
fn test_same_length_phrase_beats_pattern() {
    // JS: "same-length phrase beats same-length pattern"
    let candidates = vec![
        pattern("在X中", 0, 2),  // length 3, type=Pattern
        phrase("在一起", 0, 2),  // length 3, type=Phrase — lower priority number, wins
    ];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 1);
    assert_eq!(candidates[result[0]].match_type, MatchType::Phrase);
}

#[test]
fn test_same_length_same_type_earlier_start_wins() {
    // JS: "same-length same-type: earlier start index wins"
    let candidates = vec![
        phrase("知道了", 1, 3), // starts at 1 — index 0
        phrase("不知道", 0, 2), // starts at 0 — index 1, wins
    ];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 1);
    assert_eq!(candidates[result[0]].start_index, 0);
}

#[test]
fn test_non_overlapping_adjacent_both_selected() {
    // JS: "non-overlapping adjacent matches both selected"
    // Tokens [0,1,2] and [3,4,5] — adjacent but not overlapping
    let candidates = vec![phrase("不知道", 0, 2), phrase("谢谢你", 3, 5)];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 2);
}

#[test]
fn test_partial_overlap_first_blocks_second() {
    // JS: "partial overlap: first accepted match blocks second"
    // [0,1,2] selected first; [1,2,3] shares tokens 1 and 2 → rejected
    let candidates = vec![
        phrase("不知道", 0, 2), // selected — index 0
        phrase("知道了", 1, 3), // same length, starts later → rejected
    ];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0], 0);
}

#[test]
fn test_single_token_blocked_by_larger_covering_match() {
    // JS: "single-token match blocked by larger match covering same token"
    let candidates = vec![
        phrase("知", 1, 1),     // covers only token 1 — index 0
        phrase("不知道", 0, 2), // covers tokens 0,1,2 — index 1, wins (longer)
    ];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 1);
    assert_eq!(candidates[result[0]].length, 3);
}

#[test]
fn test_three_candidates_longest_wins_non_overlapping_also_selected() {
    // JS: "three candidates: longest wins, remaining non-overlapping also selected"
    let candidates = vec![
        phrase("AB", 0, 1),  // length 2 — overlaps with ABC
        phrase("DE", 3, 4),  // length 2 — non-overlapping, also selected
        phrase("ABC", 0, 2), // length 3 — wins over AB
    ];
    let mut selected_labels = resolve_labels(&candidates);
    selected_labels.sort_unstable();
    assert_eq!(selected_labels, vec!["ABC", "DE"]);
}

#[test]
fn test_pattern_selected_when_no_phrase_overlaps() {
    // JS: "pattern selected when no phrase overlaps with it"
    let candidates = vec![pattern("在X中", 0, 2), phrase("谢谢", 5, 6)];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 2);
}

#[test]
fn test_selection_order_is_length_first_not_input_order() {
    // JS: "selection order is length-first, not input order"
    // Input order: short first, long second — but long should be selected
    let candidates = vec![
        phrase("知道", 1, 2),   // length 2 — index 0, input-first
        phrase("不知道", 0, 2), // length 3 — index 1, wins despite being second in input
    ];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 1);
    assert_eq!(candidates[result[0]].length, 3);
}

#[test]
fn test_selected_indices_refer_to_original_positions() {
    // JS: "selected matches preserve original object references"
    // In Rust we verify by checking that returned indices point to the correct originals.
    let candidates = vec![
        phrase("不知道", 0, 2), // index 0
        phrase("谢谢", 4, 5),   // index 1
    ];
    let result = resolve_global_conflicts(&candidates);
    // Both should be selected (non-overlapping)
    assert_eq!(result.len(), 2);
    // Indices point to the original candidates
    assert!(result.contains(&0));
    assert!(result.contains(&1));
    assert_eq!(candidates[result[0]].label, "不知道");
}

#[test]
fn test_does_not_mutate_input_order() {
    // JS: "does not mutate the input array"
    // In Rust we verify that the input slice is unchanged after the call.
    let candidates = vec![phrase("不知道", 0, 2), phrase("知道了", 1, 3)];
    let original_labels: Vec<&str> = candidates.iter().map(|c| c.label).collect();
    let _ = resolve_global_conflicts(&candidates);
    let after_labels: Vec<&str> = candidates.iter().map(|c| c.label).collect();
    assert_eq!(original_labels, after_labels);
}

#[test]
fn test_real_world_pattern_beats_phrase_body_part() {
    // JS: "real-world scenario: phrase, pattern, and character fallback compete"
    // Pattern "在X的身体上" covers tokens 0-5 (length 6) — beats phrase "身体" (length 2)
    let candidates = vec![
        phrase("身体", 3, 4),         // length 2
        pattern("在X的身体上", 0, 5), // length 6 — wins
    ];
    let result = resolve_global_conflicts(&candidates);
    assert_eq!(result.len(), 1);
    assert_eq!(candidates[result[0]].match_type, MatchType::Pattern);
    assert_eq!(candidates[result[0]].label, "在X的身体上");
}
