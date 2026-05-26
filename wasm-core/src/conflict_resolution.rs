//! Greedy interval scheduling for translation match conflict resolution.
//!
//! Exposes `resolveGlobalConflicts` (Phase 4) and `resolveMatchConflicts` (Phase 2)
//! as WASM functions using flat typed-array I/O to avoid JSON serialization overhead.
//!
//! # Boundary protocol
//!
//! Candidates are passed as a flat `Uint32Array` with 4 u32 values per entry:
//!   `[start_index, end_index, length, type_priority, ...]`
//! where `type_priority`: 1=Phrase, 2=Pattern, 3=Other.
//!
//! Returns a `Uint32Array` of the selected **original indices** (before sorting),
//! in acceptance order. The JS caller maps indices back to match objects.
//!
//! # Why typed arrays?
//!
//! JSON round-tripping 100–500 match objects adds 5–20× overhead vs the algorithm.
//! Flat u32 arrays have near-zero boundary cost (pointer + length, no copying).
//!
//! # Sibling relationship
//!
//! `resolveGlobalConflicts` (Phase 4): length-first sort, then phrases beat patterns.
//! `resolveMatchConflicts`  (Phase 2): priority-first sort (6 levels), then length.
//!   Phase 2 uses `run_conflict_resolution_priority_first` — compound words (priority 1)
//!   must beat longer conflicting patterns (priority 4) regardless of length.
//!   JS compound-word pre-processing runs first and encodes the 6-level priority into
//!   each candidate before passing the flat array here.
//!
//! Rust parity validator: wasm-core/tests/conflict_resolution_parity_test.rs

use std::collections::HashSet;

#[cfg(target_arch = "wasm32")]
use js_sys::Uint32Array;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Values per candidate in the flat input array.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const STRIDE: usize = 4; // [start_index, end_index, length, type_priority]

/// Core greedy interval scheduling algorithm.
///
/// `phrases_beat_patterns`: true  → Phase 4 (phrase priority 1 < pattern priority 2).
///                          false → Phase 2 (pattern priority 2 > phrase priority 1, inverted).
///
/// Returns the original indices of selected (non-overlapping) candidates, in acceptance order.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub(crate) fn run_conflict_resolution(
    candidates_flat: &[u32],
    phrases_beat_patterns: bool,
) -> Vec<u32> {
    if candidates_flat.len() % STRIDE != 0 {
        return Vec::new();
    }
    let n = candidates_flat.len() / STRIDE;
    if n == 0 {
        return Vec::new();
    }

    // Build sort order without mutating the input — preserves original indices.
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        let al = candidates_flat[a * STRIDE + 2]; // length
        let bl = candidates_flat[b * STRIDE + 2];
        let at = candidates_flat[a * STRIDE + 3]; // type_priority
        let bt = candidates_flat[b * STRIDE + 3];
        let a_start = candidates_flat[a * STRIDE]; // start_index
        let b_start = candidates_flat[b * STRIDE];

        // Primary: length descending (longer wins)
        bl.cmp(&al)
            // Secondary: type_priority — direction depends on phase
            .then_with(|| {
                if phrases_beat_patterns {
                    at.cmp(&bt) // ascending: 1=Phrase beats 2=Pattern
                } else {
                    bt.cmp(&at) // descending: 2=Pattern beats 1=Phrase
                }
            })
            // Tertiary: start_index ascending (earlier position wins)
            .then_with(|| a_start.cmp(&b_start))
    });

    let mut selected: Vec<u32> = Vec::new();
    let mut used: HashSet<u32> = HashSet::new();

    for orig_idx in order {
        let start = candidates_flat[orig_idx * STRIDE];
        let end = candidates_flat[orig_idx * STRIDE + 1];

        if !(start..=end).any(|i| used.contains(&i)) {
            selected.push(orig_idx as u32);
            for i in start..=end {
                used.insert(i);
            }
        }
    }

    selected
}

#[cfg(target_arch = "wasm32")]
fn to_uint32array(v: Vec<u32>) -> Uint32Array {
    let arr = Uint32Array::new_with_length(v.len() as u32);
    for (i, &val) in v.iter().enumerate() {
        arr.set_index(i as u32, val);
    }
    arr
}

/// Phase 4 conflict resolution — phrases beat patterns at equal length.
///
/// Mirrors `TranslationEngine.js::resolveGlobalConflicts()`.
///
/// # Arguments
/// * `candidates_flat` — flat `Uint32Array`: `[start, end, length, type_priority, ...]` per candidate.
///
/// # Returns
/// `Uint32Array` of selected original indices, in acceptance order.
/// JS caller: `Array.from(result).map(i => allMatches[i])`
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = resolveGlobalConflicts)]
pub fn resolve_global_conflicts(candidates_flat: &[u32]) -> Uint32Array {
    to_uint32array(run_conflict_resolution(candidates_flat, true))
}

/// Priority-first greedy interval scheduling for Phase 2.
///
/// Sort order: type_priority ascending (lower = better), then length descending, then start ascending.
/// This differs from `run_conflict_resolution` (length-first) because Phase 2 compound words
/// (priority 1) must beat longer conflicting patterns (priority 4) regardless of match length.
/// JS encodes 6 priority levels after compound pre-processing:
///   1 = high-specificity compound phrase (allowAsPatternVariable + isCompoundWord)
///   2 = non-conflicting pattern
///   3 = other allowAsPatternVariable phrase
///   4 = pattern conflicting with a compound word
///   5 = regular phrase
///   6 = fallback
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub(crate) fn run_conflict_resolution_priority_first(candidates_flat: &[u32]) -> Vec<u32> {
    if candidates_flat.len() % STRIDE != 0 {
        return Vec::new();
    }
    let n = candidates_flat.len() / STRIDE;
    if n == 0 {
        return Vec::new();
    }

    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        let al = candidates_flat[a * STRIDE + 2]; // length
        let bl = candidates_flat[b * STRIDE + 2];
        let at = candidates_flat[a * STRIDE + 3]; // type_priority
        let bt = candidates_flat[b * STRIDE + 3];
        let a_start = candidates_flat[a * STRIDE];
        let b_start = candidates_flat[b * STRIDE];

        // Primary: type_priority ascending (1 = compound phrase beats 4 = conflicting pattern)
        at.cmp(&bt)
            // Secondary: length descending (longer wins within same priority tier)
            .then_with(|| bl.cmp(&al))
            // Tertiary: start_index ascending
            .then_with(|| a_start.cmp(&b_start))
    });

    let mut selected: Vec<u32> = Vec::new();
    let mut used: HashSet<u32> = HashSet::new();

    for orig_idx in order {
        let start = candidates_flat[orig_idx * STRIDE];
        let end = candidates_flat[orig_idx * STRIDE + 1];

        if !(start..=end).any(|i| used.contains(&i)) {
            selected.push(orig_idx as u32);
            for i in start..=end {
                used.insert(i);
            }
        }
    }

    selected
}

/// Phase 2 conflict resolution — priority-first scheduling after JS compound pre-processing.
///
/// JS compound-word pre-processing runs first and encodes 6-level priorities into each
/// candidate. This function then resolves overlaps using priority-first sort so that
/// high-specificity compound phrases (priority 1) beat longer conflicting patterns (priority 4).
///
/// # Arguments
/// * `candidates_flat` — flat `Uint32Array`: `[start, end, length, type_priority, ...]` per candidate.
///   `type_priority` is the 6-level JS priority, not the simple 1=Phrase/2=Pattern encoding.
///
/// # Returns
/// `Uint32Array` of selected original indices, in acceptance order.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = resolveMatchConflictsCore)]
pub fn resolve_match_conflicts(candidates_flat: &[u32]) -> Uint32Array {
    to_uint32array(run_conflict_resolution_priority_first(candidates_flat))
}

// ============================================================================
// Unit tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(candidates: &[(u32, u32, u32, u32)]) -> Vec<u32> {
        candidates
            .iter()
            .flat_map(|&(start, end, length, prio)| [start, end, length, prio])
            .collect()
    }

    #[test]
    fn test_empty_returns_empty() {
        assert!(run_conflict_resolution(&[], true).is_empty());
    }

    #[test]
    fn test_single_candidate_always_selected() {
        let input = flat(&[(0, 2, 3, 1)]);
        assert_eq!(run_conflict_resolution(&input, true), vec![0]);
    }

    #[test]
    fn test_longer_beats_shorter_overlapping() {
        // index 0: length 2, index 1: length 3 — index 1 wins
        let input = flat(&[(0, 1, 2, 1), (0, 2, 3, 1)]);
        let result = run_conflict_resolution(&input, true);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 1);
    }

    #[test]
    fn test_phrase_beats_pattern_at_equal_length_phase4() {
        // type_priority 1=Phrase, 2=Pattern, same length → Phrase wins in phase 4
        let input = flat(&[(0, 2, 3, 2), (0, 2, 3, 1)]); // pattern first, phrase second
        let result = run_conflict_resolution(&input, true);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 1); // phrase (orig index 1) wins
    }

    #[test]
    fn test_pattern_beats_phrase_at_equal_length_phase2() {
        // Same setup but phase 2 inverts priority
        let input = flat(&[(0, 2, 3, 2), (0, 2, 3, 1)]); // pattern index 0, phrase index 1
        let result = run_conflict_resolution(&input, false);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 0); // pattern (orig index 0) wins
    }

    #[test]
    fn test_non_overlapping_both_selected() {
        let input = flat(&[(0, 2, 3, 1), (3, 5, 3, 1)]);
        let result = run_conflict_resolution(&input, true);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&0));
        assert!(result.contains(&1));
    }

    #[test]
    fn test_earlier_start_wins_on_equal_length_and_type() {
        // index 0 starts at 1, index 1 starts at 0 — index 1 wins
        let input = flat(&[(1, 3, 3, 1), (0, 2, 3, 1)]);
        let result = run_conflict_resolution(&input, true);
        assert_eq!(result.len(), 1);
        assert_eq!(input[result[0] as usize * STRIDE], 0); // start_index == 0 wins
    }

    #[test]
    fn test_input_not_mutated() {
        let input = flat(&[(0, 2, 3, 1), (1, 3, 3, 1)]);
        let original = input.clone();
        let _ = run_conflict_resolution(&input, true);
        assert_eq!(input, original);
    }

    // -------------------------------------------------------------------------
    // Priority-first (Phase 2) tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_priority_first_compound_beats_longer_pattern() {
        // Compound phrase "手套" (tokens 1-2, length 2, priority 1) overlaps with
        // a conflicting pattern (tokens 0-2, length 3, priority 4).
        // Priority-first: compound (prio 1) wins despite being shorter.
        let input = flat(&[
            (1, 2, 2, 1), // compound phrase, priority 1
            (0, 2, 3, 4), // conflicting pattern, priority 4
        ]);
        let result = run_conflict_resolution_priority_first(&input);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 0); // compound phrase (orig index 0) wins
    }

    #[test]
    fn test_priority_first_non_conflicting_pattern_beats_phrase_same_length() {
        // Non-conflicting pattern (prio 2) vs other phrase (prio 3), same length.
        let input = flat(&[
            (0, 2, 3, 3), // other phrase, priority 3
            (0, 2, 3, 2), // non-conflicting pattern, priority 2
        ]);
        let result = run_conflict_resolution_priority_first(&input);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 1); // pattern (orig index 1, prio 2) wins
    }

    #[test]
    fn test_priority_first_non_overlapping_both_selected() {
        let input = flat(&[(0, 1, 2, 1), (2, 4, 3, 4)]);
        let result = run_conflict_resolution_priority_first(&input);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&0));
        assert!(result.contains(&1));
    }

    #[test]
    fn test_priority_first_same_priority_longer_wins() {
        // Same priority tier: longer match should win.
        let input = flat(&[
            (0, 1, 2, 2), // pattern, length 2
            (0, 2, 3, 2), // pattern, length 3 — should win
        ]);
        let result = run_conflict_resolution_priority_first(&input);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], 1); // longer pattern wins
    }

    #[test]
    fn test_priority_first_input_not_mutated() {
        let input = flat(&[(0, 2, 3, 1), (1, 3, 3, 4)]);
        let original = input.clone();
        let _ = run_conflict_resolution_priority_first(&input);
        assert_eq!(input, original);
    }
}
