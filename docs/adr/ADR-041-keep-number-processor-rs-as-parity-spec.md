# ADR-041: Keep `number_processor.rs` — It's a Parity Spec, Not Dead Code

**Status:** Decided
**Date:** 2026-09-09

## Context

The 2026-09-09 fourth architecture review round proposed deleting `wasm-core/src/number_processor.rs` (candidate 1, initially graded "Strong"). The proposal's evidence: a repo-wide grep found no JS/TS call site reaching `NumberProcessor::new()`/`process_tokens` — `TranslationEngine.js` uses only the pure-JS `src/utils/NumberProcessor.js`. Commit `b1dd912` removed the last JS call site; commit `7806be8` (10 days later) still fixed this file's decimal-percentage regex for JS/Rust parity, which the proposal read as wasted effort on dead code. The proposal also undercounted the file's test suite as 44 lines.

Grilling this candidate surfaced the actual shape:

- `#[wasm_bindgen]` was **intentionally removed** from `NumberProcessor` by `b1dd912` — not an accidental dead-ending. `wasm-core/src/lib.rs:1-9` documents it explicitly: "NumberProcessor - Rust-side parity spec for JS NumberProcessor.js... No WASM export (#[wasm_bindgen] intentionally removed, see wasm-core/CLAUDE.md)."
- `wasm-core/CLAUDE.md:97-99` states the retention decision directly: "File kept as the spec/test suite for JS `NumberProcessor.js`... Do NOT add `#[wasm_bindgen]` back."
- `CONTEXT.md:115-121` repeats it: zero runtime callers by design, "do not confuse it with this module when debugging a number-conversion bug."
- The `#[cfg(test)] mod tests` block is 475 lines (722-1196), not 44 — the tail ~40% of the file. It isn't decorative: a 2026-08-25 drift check using this suite found two JS regression cases with no Rust equivalent, and a 2026-08-29 fix (三千二百十五 truncation) was validated against it. `7806be8` was the parity mechanism doing its job, not wasted motion.
- A separate, already-closed 2026-09-09 review round (`docs/guides/deleted-symbols.md:131`) independently re-confirmed this exact retention decision _hours before_ this round re-proposed deleting the file — its own text notes the original report in that round wrongly claimed the struct was still WASM-exported, and corrects that the "spec only" framing "was already correctly settled."
- No Cargo.toml dependency would become unused by deleting it — every crate it uses has other callers in `wasm-core/src/`.

This is the same shape as ADR-032 (`cacheHitRate` deletion), not ADR-020 (`WasmSyncTracker` deletion): both were "confirmed zero callers," but ADR-032 explicitly reversed a prior dated decision to keep the code, while ADR-020 was a plain accidental dead end. Deleting `number_processor.rs` now would reverse a standing, dated, same-day-reconfirmed decision, not clean up an accident.

## Decision

Do not delete `wasm-core/src/number_processor.rs`. It stays as the Rust-side parity spec/test suite for `src/utils/NumberProcessor.js`, with no `#[wasm_bindgen]` export.

## Reasoning

**"No runtime caller" is not sufficient evidence of dead code here.** A module can be zero-caller by design when its job is to be a test suite compiled and run in CI (`cargo test --manifest-path wasm-core/Cargo.toml`, wired in since 2026-08-25), not to ship a WASM export. The absence of a JS call site is the intended state, documented in three places, not a symptom of abandonment.

**The drift-catching has a track record.** Two concrete parity bugs (2026-08-25's missing regression cases, 2026-08-29's truncation bug) were caught via this exact suite. Deleting it removes the only mechanism that catches `NumberProcessor.js` changes drifting from their Rust-verified spec.

**Two independent review rounds hit the same wrong premise on the same day.** That repetition — not just the retention docs existing — is the actual signal an ADR earns its place here, per this project's ADR-vs-`deleted-symbols.md` convention (see ADR-032's reasoning for the same distinction).

## Consequence

Future architecture reviews must not re-propose deleting `number_processor.rs` on "no runtime caller" grounds alone. Before flagging it as dead: read `wasm-core/CLAUDE.md:97-99` and `CONTEXT.md`'s `NumberProcessor` section first — both state the retention decision directly.

If `NumberProcessor.js` and this file's spec ever diverge in structure enough that maintaining parity stops being worth the cost (e.g. `NumberProcessor.js` is itself restructured), that's a real reason to revisit — but the case has to be "parity maintenance cost exceeds its bug-catching value," not "nothing calls it."
