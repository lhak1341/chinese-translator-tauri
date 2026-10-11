# ADR-096: Keep the WASM Pattern Processor; Measured

**Status:** Decided
**Date:** 2026-10-11

## Context

ADR-079 and ADR-083 each deleted a WASM tier after measuring it, and each kept the pattern processor with no timing recorded. The only speed claim for it is ADR-004's "10-50x faster", which predates those measurements. An architecture review (round 26, candidate #4) asked whether the Rust tier (`wasm-core/src/pattern_processor/`, about 3,500 lines, plus `WasmPatternProcessor`, `WasmProcessorLifecycle`, `WasmCascadeRegistry` and two failure trackers) earns its keep. The JS fallback (`SemanticPatternProcessor`) is not a twin: it is a single-pass matcher that gets no Phase A results, where the WASM path composes patterns hierarchically.

## Decision

Keep the tier. The rule was written before measuring: keep WASM if it saves at least 1 ms per call at the 95th percentile of real inputs, or if the two paths produce different results on real text; call it a deletion candidate only if neither holds. Both hold.

## Measurement

A throwaway harness (deleted) ran the real engine with the real WASM binary and the production dictionaries (4,020 patterns after merging the active fiction pairs) over 248 windows of 1,500 characters: ADR-083's six largest books at 8 windows each, plus 20 other books at 10 each, positions seeded. It captured the token array the engine hands `applyPatterns` for every chunk it translated, 35,760 calls, then replayed each on both processors (median of 5 runs per call, `buildVariableCache` included on both sides).

| Per call                                | WASM              | JS        |
| --------------------------------------- | ----------------- | --------- |
| p50                                     | 0.068 ms          | 2.839 ms  |
| p95                                     | 2.842 ms          | 10.405 ms |
| Saved (JS − WASM), p50 / p95            | 2.43 ms / 8.45 ms |
| WASM faster on                          | 99.5% of calls    |
| Semantic tokens per call p50/p95/max    | 8 / 17 / 47       |
| `translateWithSegments`, per window p50 | 180 ms            | 669 ms    |

The ratios are about 42x at p50, 3.7x at p95 and 3.7x end to end, so ADR-004's range holds at the median and is much smaller where it matters. Engine init with WASM is 69-108 ms (cold, then warm); reloading the Rust pattern set alone is 14-15 ms. The JS-only init cost was not isolated: `initializePatterns` re-initializes both.

Output, compared on the same tokens and on the final text (a repeat WASM run of every window was identical, so there is no nondeterminism):

- Phase 1 results differ in span or translation in 149 of the 35,760 calls (0.4%), across 96 of 248 windows; the other roughly 3,300 differing calls differ only in the source label (`hierarchical_pattern` against `pattern`).
- The final translation differs in 91 of 248 windows.
- In the first 40 differing calls, 31 are WASM matching a longer, composed span (`其他八品强者` against `八品强者`, `从自己的袖子中` with a different translation) and 9 are JS matching a Chinese-numeral chapter heading (`第两千一百七十四章` to `chương thứ 2,174`) that WASM does not.
- No window had a WASM panic during translation.

## Reasoning

Per call, the Rust processor does in 0.07 ms what the JS path does in 2.8 ms, and a chunk calls it once. The result is the opposite of the other tiers: those won nothing at microsecond sizes, but 4,000 patterns across a chunk is millisecond work in JS. And deleting the tier would change what the user reads in more than a third of windows, because the fallback lacks composition. That is a quality decision (port composition to JS, or accept the loss), not a speed one, and it was not taken here.

## Findings, not fixed here

- **Resolved by ADR-097.** **WASM does not match `第#章` when the numeral is 7 or more characters** (`第一千二百三十四章`), where the JS path does, giving `Đệ 1,234 chương` against `Chương thứ 1,234`. Cause, confirmed with a probe on the real binary: `DEFAULT_MAX_VARIABLE_SPAN` is 6 in `matcher.rs` (its comment says the longest static variable is 5 characters, which ignores number variables), while the JS matcher tries up to 10 (`SemanticPatternProcessor.js`, `maxSpan`). Numerals of 1 to 6 characters, such as `一千二百三十`, give the same result on both paths; all three misses in the sample were 7-character numerals. Chapter headings are frequent in these books, so this is worth fixing, and raising the Rust limit needs a check that it does not slow the matcher or change other matches.
- **Resolved by ADR-098.** **A Rust panic is reachable on large inputs**: `estimate_leading_bonus` in `two_phase.rs` slices `semantic_tokens[..before_pos]` past the end ("range end index 1100 out of range for slice of length 1078"). It reproduced on 31 of 48 whole-window inputs, with the smallest failing prefix at 225 semantic tokens. The engine's calls were at most 47 semantic tokens, so the app did not hit it, but a long unpunctuated line could.
- The `type: 'composite'` field is never set; composition shows only in the source label (`hierarchical_patterns_composite`), so counting by `type` finds none.

## Consequence

A review that proposes deleting the WASM pattern processor should first decide what happens to composition, and beat the table above on the same kind of input. The JS fallback is not equivalent output, only a safety net.
