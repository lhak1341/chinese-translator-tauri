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
//! `resolveGlobalConflicts` (Phase 4): phrases beat patterns at equal length.
//! `resolveMatchConflicts`  (Phase 2): patterns beat phrases at equal length.
//!
//! Both call `run_conflict_resolution` — the inversion is a single boolean flag,
//! guaranteeing algorithmic parity without manual mirroring.
//!
//! Note: Only `resolveGlobalConflicts` is wired into JS TranslationEngine.
//! `resolveMatchConflicts` has additional compound-word pre-processing in JS
//! that requires token context and cannot be ported without it.
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

/// Phase 2 conflict resolution — patterns beat phrases at equal length.
///
/// Mirrors the core scheduling portion of `TranslationEngine.js::resolveMatchConflicts()`.
/// Note: `resolveMatchConflicts` also has compound-word pre-processing that runs
/// in JS before this algorithm, so this export is available for future use.
///
/// # Arguments
/// * `candidates_flat` — flat `Uint32Array`: `[start, end, length, type_priority, ...]` per candidate.
///
/// # Returns
/// `Uint32Array` of selected original indices, in acceptance order.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = resolveMatchConflictsCore)]
pub fn resolve_match_conflicts(candidates_flat: &[u32]) -> Uint32Array {
    to_uint32array(run_conflict_resolution(candidates_flat, false))
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
}
