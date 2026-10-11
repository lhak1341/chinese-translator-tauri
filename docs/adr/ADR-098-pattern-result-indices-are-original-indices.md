# ADR-098: Pattern Result Indices Are Original Indices

**Status:** Decided
**Date:** 2026-10-11

## Context

ADR-096 found a Rust panic in `estimate_leading_bonus`: `semantic_tokens[..before_pos]` with `before_pos` past the end of the slice ("range end index 1100 out of range for slice of length 1078"). It reproduced when a whole 1,500-character window went into one call. The cause is an index-space mix-up, not a missing bounds check. `PatternProcessingResult::start_index` and `end_index` are original token indices (`SemanticToken::original_index`, set in `matcher.rs`), because the JS side indexes its own token array with them. `semantic_tokens` holds only the semantic tokens, so a position in it runs behind an original index by the number of whitespace, punctuation and unknown tokens before it. Four consumers used a result's index as a position in `semantic_tokens`:

- `estimate_leading_bonus` sliced it (the panic);
- `estimate_trailing_bonus` read from it, wrong whenever tokens were skipped;
- `mark_tokens_as_protected` protected the wrong tokens, or none;
- `process_phase_b` advanced with `position = end_index + 1`, skipping tokens and so possibly a later match.

## Decision

Results keep original indices. Two functions in `two_phase.rs` convert: `position_of` (the first position at or after an original index, for a candidate's start) and `position_after` (the first position after it, for a candidate's end), both `partition_point` over the ascending `original_index` values, which `process_tokens` asserts in debug builds. All four consumers use them. The overlap bookkeeping (`used_tokens` and the hierarchical-composition checks) compares original indices only with each other and is unchanged. The JS side is unchanged.

## Reasoning

A clamp on `before_pos` would stop the crash and keep every wrong read, leaving the other three consumers misbehaving with no error. The conversion is the fix that removes the class.

Measured on the ADR-096 corpus (248 windows, 35,760 real engine calls, plus each window as one call; release binaries, old and new alternated twice):

| Check                              | Old        | New                                             |
| ---------------------------------- | ---------- | ----------------------------------------------- |
| Whole windows that panic           | 164 of 248 | 0 of 248                                        |
| Chunk calls with different results | —          | 1 of 35,760                                     |
| Windows with different final text  | —          | 1 of 248                                        |
| p50 / p95 / total (new ÷ old)      | —          | 0.98 / 0.99 / 0.99 (old run-to-run spread 1.04) |

The one changed chunk call adds a chapter-heading match (`chương thứ bảy`) the old build missed: a non-semantic token ahead of it had pushed the old Phase B loop past it. Production chunks hold few non-semantic tokens (the engine splits at punctuation), which is why 35,760 real calls almost never hit the mix-up and why no crash appeared in the app. On whole windows, where non-semantic tokens are common, 75 of the 84 windows that did not panic before now give different results, so the mix-up changed Phase 1 results as well as crashing; that input shape is not one the engine sends.

## Consequence

A new consumer of `PatternProcessingResult` indices that touches `semantic_tokens` converts with `position_of` / `position_after` first. The Rust tests build gapped `original_index` values to stand for non-semantic tokens, so a consumer that forgets fails there. The `isPatternMatchInBounds` check on the JS side still bounds results against the original array, as before.
