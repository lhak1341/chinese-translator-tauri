//! Greedy interval scheduling for translation match conflict resolution.
//!
//! Exposes `resolveGlobalConflicts` (Phase 4) as a WASM function using flat typed-array
//! I/O to avoid JSON serialization overhead.
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
//! `resolveGlobalConflicts` (Phase 4): length-first sort, then phrases beat patterns.
//! A Phase 2 export (`resolveMatchConflictsCore`, priority-first) was deleted 2026-09-26:
//! its only JS caller was reachable only from dead code.
//!
//! Parity: `test-fixtures/conflict-resolution-parity.json` is the shared contract; `mod tests::parity`
//! below runs it through `run_conflict_resolution`, and
//! `src/utils/__tests__/ConflictResolution.parity.test.js` runs it through the JS fallback.

use std::collections::HashSet;

#[cfg(target_arch = "wasm32")]
use js_sys::Uint32Array;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Values per candidate in the flat input array.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
const STRIDE: usize = 4; // [start_index, end_index, length, type_priority]

/// Core greedy interval scheduling algorithm: longer first, then phrase (priority 1)
/// beats pattern (priority 2), then earlier start.
///
/// Returns the original indices of selected (non-overlapping) candidates, in acceptance order.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub(crate) fn run_conflict_resolution(candidates_flat: &[u32]) -> Vec<u32> {
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
            // Secondary: type_priority ascending (1=Phrase beats 2=Pattern)
            .then_with(|| at.cmp(&bt))
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
    to_uint32array(run_conflict_resolution(candidates_flat))
}

// ============================================================================
// Unit tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_not_a_whole_number_of_candidates_selects_nothing() {
        assert!(run_conflict_resolution(&[0, 2, 3]).is_empty());
    }

    /// The shared fixture is the contract for the algorithm; the JS mirror is
    /// `src/utils/__tests__/ConflictResolution.parity.test.js`. `run_conflict_resolution` is
    /// `pub(crate)`, so this has to live in the module, not in `wasm-core/tests/`.
    mod parity {
        use super::*;
        use serde::Deserialize;

        #[derive(Deserialize)]
        struct FixtureMatch {
            #[serde(rename = "type")]
            match_type: String,
            #[serde(rename = "startIndex")]
            start_index: u32,
            #[serde(rename = "endIndex")]
            end_index: u32,
        }

        #[derive(Deserialize)]
        struct FixtureCase {
            name: String,
            matches: Vec<FixtureMatch>,
            selected: Vec<u32>,
        }

        #[derive(Deserialize)]
        struct Fixture {
            cases: Vec<FixtureCase>,
        }

        /// Mirrors `packMatches` in `WasmConflictResolution.js`: phrase 1, pattern 2, any other type 3.
        fn type_priority(match_type: &str) -> u32 {
            match match_type {
                "phrase" => 1,
                "pattern" => 2,
                _ => 3,
            }
        }

        fn pack(matches: &[FixtureMatch]) -> Vec<u32> {
            matches
                .iter()
                .flat_map(|m| {
                    [m.start_index, m.end_index, m.end_index - m.start_index + 1, type_priority(&m.match_type)]
                })
                .collect()
        }

        #[test]
        fn run_conflict_resolution_matches_the_shared_fixture() {
            let raw = include_str!("../../test-fixtures/conflict-resolution-parity.json");
            let fixture: Fixture = serde_json::from_str(raw)
                .expect("conflict-resolution-parity.json must be valid JSON matching the Fixture shape");
            assert!(!fixture.cases.is_empty(), "fixture must not be empty");

            for case in &fixture.cases {
                let input = pack(&case.matches);
                let original = input.clone();
                assert_eq!(run_conflict_resolution(&input), case.selected, "case: {}", case.name);
                assert_eq!(input, original, "input mutated in case: {}", case.name);
            }
        }
    }
}
