# ADR-070: Skip a Shared WASM-Call-or-Fallback Shell; Delete the Unread Wrapper Stats

**Status:** Decided
**Date:** 2026-10-04

## Context

Seven wrappers share one WASM binary. Each catches a panic, logs, calls `fireCascadeRetire()` and falls back to JavaScript. An architecture review (2026-10-04, candidate #3) proposed one "WASM call or fallback" shell that owns that sequence, so the retire discipline would live in one module instead of a source-scanning test (`WasmCascadeDiscipline.test.js`) plus prose.

## Decision

Do not add the shell. The retire rule already has one owner, `fireCascadeRetire()` in `WasmCascadeRegistry.js`. Keep the call-site discipline test.

Delete the stats scaffolding the sweep found unread, in JS and in `wasm-core`:

- `WasmTextChunker`: `wasmHits`, `fallbackHits`, `getStats`, `getGlobalStats`, `resetStats`, and the `recordFallback` / `getGlobalChunkerStats` imports. `expectedMethods` is now `['chunkText', 'free']`.
- `WasmTextTokenizer`: `getStats`, the `getTokenizerStats` import, and its `expectedMethods` entry.

- `wasm-core`: `TextChunker.get_stats` / `reset_stats`, `record_fallback`, `get_global_chunker_stats`, the `CHUNK_COUNT` / `FALLBACK_COUNT` statics, the `chunks_processed` field (`TextChunker` is now field-less; `chunk_text` takes `&self` by signature), and `get_tokenizer_stats` with its `lib.rs` re-export.

~~`WasmStringProcessor.getStats` stays: `OptimizationBenchmarks.js` reads it.~~ Moot: the whole wrapper was deleted 2026-10-05 (ADR-078).

## Reasoning

**The sites share two lines.** The catch blocks share a `logger.error|warn(...)` call and `fireCascadeRetire()`. They differ in log level, in the return value (`null`, `false`, an inline JS fallback, `{ success: true, results: [] }` plus a cooldown toast) and in the WASM call inside the `try`. A shell would take those as callbacks, so complexity would move into the callbacks rather than concentrate.

**The fallback shapes differ because each fallback sits with its own JS implementation.** `WasmTextAssembler` kept `jsAssembleWithSpacing` beside it and `TextChunker.js` owned the chunking fallback (both tiers deleted 2026-10-06, ADR-079), `StringProcessingAdapter` picked an implementation (deleted 2026-10-05, ADR-078), and `WasmConflictResolution` takes a `jsFallback` argument. Unifying the shape would pull the JS implementations toward the wrapper, which is the backward coupling ADR-007 and ADR-009 removed.

**Near-repeat of ADR-007.** `WasmPatternBridge` was rejected as wrapping one call with depth near 0. A shell around try/log/retire has the same depth.

**Deleted stats had no reader.** Only `WasmTextChunker.test.js` and `WasmTextTokenizer.test.js` exercised them; production reaches the chunker only through `chunkText` (`TextChunker.js`). Same family as ADR-032 and ADR-069.

## Consequence

Future architecture reviews should not re-propose a shared WASM-call-or-fallback shell. Revisit only if the catch blocks converge on one return shape.

**2026-10-11 note (architecture review round 30, candidate #4 grilling):** "Seven wrappers" above is the 2026-10-04 count. One wrapper (`WasmPatternProcessor.js`) and one panic catch block (`processTokensWasm`) remain, so the revisit condition holds only because there is nothing left to converge. A shell around a single call site is shallower than it was; the skip stands. The generic lifecycle and registry stay on purpose (ADR-009 "Current state", `src/utils/wasm/CLAUDE.md`), and `wasmInstanceCheck.js` stays its own file (ADR-080 addendum).
