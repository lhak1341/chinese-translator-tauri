# ADR-097: Number Variables Have Their Own Span

**Status:** Decided
**Date:** 2026-10-11

## Context

ADR-096 found that the WASM pattern processor did not match `第#章` when the numeral had 7 or more characters (`第一千二百三十四章`), where the JS fallback did. The Rust matcher tried every variable at up to `DEFAULT_MAX_VARIABLE_SPAN = 6` tokens, a number chosen from the longest static variable in the dictionaries (5 characters), which ignored `#`. The JS cache supplies numeral entries of up to 8 characters (`MAX_NUMERAL_SPAN`), so entries of 7 and 8 characters sat in the cache and were never tried. The same constant also set how far the candidate index looks for a leading variable's first literal, so widening it for everything would have widened the search for all 1,096 variable-first patterns.

## Decision

`#` gets its own span, `NUMBER_VARIABLE_SPAN = 8` in `matcher.rs`; letter variables keep 6. One helper, `span_cap(var_name, max_var_span)`, is read by variable resolution, the Phase A composite-bonus estimator and the candidate index. The 12 patterns that start with `#` are kept in a separate index map, looked up in a window of 8 tokens instead of 6. `NumberVariableSpan.sourceScan.test.js` reads the Rust constant and asserts it equals `MAX_NUMERAL_SPAN`.

## Reasoning

**Only numerals need it.** No static variable in the dictionaries is longer than 6 characters (0 flagged phrases, 3 proper nouns of 7 to 10), so raising the cap for every variable would cost search time and change nothing but numerals.

**The first attempt was too slow, and the measurement said so.** Putting the 12 leading-`#` patterns in the index's `always` list (tried at every position) is the smaller change. It doubled the median call (p50 0.045 to 0.100 ms) and added 8 to 15% to total time against a 1.3% run-to-run spread, so it failed the 10% gate set beforehand. The separate wide-window map fixed it.

Measured on the ADR-096 corpus (248 windows, 35,760 calls from the real engine, release binaries, old and new alternated, median of 5 runs per call):

| Per call | Old (3 runs, mean) | New (2 runs, mean) | Ratio | Old run-to-run spread |
| -------- | ------------------ | ------------------ | ----- | --------------------- |
| p50      | 0.0459 ms          | 0.0482 ms          | 1.050 | 1.021                 |
| p95      | 2.695 ms           | 2.745 ms           | 1.019 | 1.017                 |
| Total    | 22,790 ms          | 23,142 ms          | 1.015 | 1.013                 |

The results differ in 3 of 35,760 calls, each adding the heading the old binary missed (`第…章` with the numerals 2,174, 1,469 and 1,354, the same three ADR-096 found), changing the final text of 3 of 248 windows. No panics. The old binary was identical, byte for byte, to the `src/wasm` the ADR-096 numbers came from, so those numbers were release numbers.

**One helper, because disagreement is silent.** If the matcher accepted a 7-character numeral while the estimator scored it as nothing, a worse Phase A candidate could win, and the index could drop a leading-`#` pattern without any error.

## Consequence

A longer numeral than 8 characters needs `MAX_NUMERAL_SPAN` and the Rust constant raised together; the scan test fails if only one moves. The estimator's use of `span_cap` is pinned by `trailing_bonus_scores_a_following_number_variable_up_to_eight_characters` (the bonus is 8, not 1) and `test_phase_a_scores_a_long_numeral_for_the_candidate_that_composes_with_it` (with the old cap the 4-character `选第一千` beats `候选` and the heading never composes), both added after the first version of this ADR. A change to a variable cap should be timed on the real dictionary with realistic caches, as here, not on a synthetic setup.
