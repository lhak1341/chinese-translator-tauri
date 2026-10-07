# ADR-083: Delete the WASM Conflict Resolution Tier

**Status:** Decided
**Date:** 2026-10-07

## Context

ADR-079 deleted the WASM assembler, chunker and tokenizer tiers after measuring them, and kept one sentence: "The WASM binary stays for the pattern processor and conflict resolution." Conflict resolution was kept with no timing recorded. An architecture review (2026-10-07, round 16, candidate #2) found the same sort plus greedy interval selection written three times: Rust (`wasm-core/src/conflict_resolution.rs`), JS (`jsFallback` in `WasmConflictResolution.js`) and a pass-through engine method (`resolveGlobalConflicts(allMatches, _tokens)`, one caller). The Rust version sat behind a wrapper, a `WasmProcessorLifecycle`, a cascade registration, a pack and unpack of a `Uint32Array`, and a parity fixture. Under vitest the wrapper never initializes, so every test ran the JS version.

## Decision

Delete the tier. Phase 4 calls a pure function, `resolveGlobalConflicts(matches)` in `src/utils/ConflictResolution.ts`, which is the old `jsFallback` unchanged (sort by length, then type priority, then start; greedy selection; the caller's own objects returned in acceptance order).

- Deleted: `wasm-core/src/conflict_resolution.rs` (its `pub mod` line and the `resolveGlobalConflicts` WASM export), `src/utils/wasm/WasmConflictResolution.js`, `WasmConflictResolution.test.js`, `WasmConflictResolution.panic.test.js`, and `TranslationEngine.resolveGlobalConflicts`. `src/wasm/*` is generated and gitignored, so `bun run test` rebuilds it.
- `test-fixtures/conflict-resolution-parity.json` stays as the spec of the JS function, read by `ConflictResolution.parity.test.js`.
- The type-priority tie-break stays. Only phrase candidates reach Phase 4 today, so the `pattern` and `other` tiers are dead in production, but that is a fact about the caller; dropping the tie-break is a separate change.
- `WasmCascadeRegistry` stays: `WasmSharedModule` and `WasmPatternProcessor` still register handlers.

## Reasoning

The rule, set before measuring: keep the WASM tier only if it saves at least 1 ms per call at the 95th-percentile real candidate count, boundary cost included. A harness (a temporary vitest file, since deleted) ran the real engine with the real WASM binary and the production dictionaries over 6 of the largest books in the library, 8 windows of 1,500 characters each, through `translateWithSegments`, and captured every candidate array passed to `resolveGlobalConflicts`. It then timed both implementations on those exact arrays (300 runs each, medians).

|                     | JS                      | WASM        |
| ------------------- | ----------------------- | ----------- |
| Calls captured      | 7,347 (6,728 non-empty) | same arrays |
| Candidates per call | p50 3, p95 8, max 17    | same        |
| Time per call, p50  | 0.0002 ms               | 0.0037 ms   |
| Time per call, p95  | 0.0005 ms               | 0.0086 ms   |
| Time per call, max  | 0.0012 ms               | 0.0174 ms   |

JS was faster on every one of the 6,728 calls, and the two selected the same matches on all of them. Phase 4 runs per small chunk, so a call sorts 3 to 17 items; the pack, the boundary call, the unpack and `Array.from` cost more than the work. The largest saving WASM showed anywhere was negative. This is the shape ADR-073, ADR-078 and ADR-079 found for the other tiers: the Rust twin wins nothing at sizes where the JS work costs microseconds.

## Consequence

The WASM binary now holds only the pattern processor. ADR-009 loses its second wrapper (one holds a `WasmProcessorLifecycle`), and `WasmCascadeDiscipline.test.js` lists one wrapper. ADR-079's sentence about conflict resolution no longer holds; it carries an "Amended by ADR-083" status. A review that proposes WASM conflict resolution again should beat the table above on candidate counts from real Phase 4 inputs, not on a synthetic array, and should note that those counts are tiny because Phase 4 runs per chunk.
