# ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable

**Status**: Accepted
**Date**: 2026-06-03
**Decision Makers**: Development Team
**Affected Components**: `src/utils/text/TextChunker.js`, `src/utils/text/AdaptiveChunker.js`, `src/utils/TranslationEngine.js`

## Context and Problem Statement

An architecture review proposed creating a `TextProcessingPipeline` module (`src/utils/text/TextProcessingPipeline.js`) to own the composition of `TextChunker` and `AdaptiveChunker`. The premise: these two modules are "designed to be composed" but their composition protocol is scattered across `TranslationEngine`, making it impossible to test their interaction without going through the full engine.

## Decision Drivers

- **The two modules operate on different concerns.** `TextChunker` splits text by punctuation boundaries — its `chunkText()` method has no size parameter and cannot re-chunk to a different size. `AdaptiveChunker` decides _batch parallelism_ — how many of those fixed chunks to translate in parallel. They are orthogonal, not a 2-step pipeline. The proposed "chunk → re-chunk at optimal size" loop does not reflect the actual code.

- **AdaptiveChunker's inputs include engine-owned state.** `calculateOptimalChunkSize(contentAnalysis, deviceInfo, count)` requires `deviceInfo.memoryPressure` and `deviceInfo.cpuCores` sourced from `parallelConfig.getConfig().device` — a TranslationEngine dependency. A `TextProcessingPipeline` cannot own this coordination without receiving engine-specific inputs, which moves coupling rather than removing it.

- **Only one method uses both together.** `translateWithProgressiveBatches` is the single call site that combines `TextChunker` output with `AdaptiveChunker` sizing. `translateWithChunking` (the other chunked path, deleted 2026-10-05) called `TextChunker` but not `AdaptiveChunker` at all, confirming they are not architecturally paired.

- **Deletion test fails.** Deleting the AdaptiveChunker calls from `translateWithProgressiveBatches` removes 6 lines from one method and falls back to `baseBatchSize`. No complexity reappears across callers — the coordination was configuration, not a reusable protocol earning its keep across multiple sites.

- **New module cost is not justified.** The coordination is 6 lines in one method. Creating `TextProcessingPipeline` would add a new file, a new concept, and a new injection point to own those 6 lines — overhead that exceeds the benefit.

## Alternatives Considered

### Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected

`processText(text, options) → { chunks, strategy, stats }` — owns `TextChunker` + `AdaptiveChunker` composition internally.

Rejected: requires injecting `parallelConfig`-derived device state; only one caller exists (no real seam); the 6-line coordination doesn't justify a new module.

### Alternative 2: Keep coordination in TranslationEngine ✓ Accepted

`translateWithProgressiveBatches` owns the 6-line coordination directly. `adaptiveChunker` remains a module-level singleton import. No new abstraction.

## Consequences

- No `TextProcessingPipeline` module is created.
- Future reviews should not re-suggest composing `TextChunker` and `AdaptiveChunker` into a pipeline — they operate on different concerns (boundary splitting vs. batch parallelism) and share no interface.
- If `AdaptiveChunker` ever gains a second caller, or if `deviceInfo` can be cleanly abstracted away from `parallelConfig`, revisit.

## Update (2026-10-03)

The revisit condition above was met, and `AdaptiveChunker` was deleted rather than composed. `parallelConfig` never held the `memoryPressure` / `hardwareConcurrency` keys `deviceInfo` was meant to carry, so `deviceInfo` was always empty, and the chunker's 8-20 result was capped at `maxParallelChunks` (at most 5) by `_clampInitialBatchSize` anyway — the deletion test in this ADR's fourth driver held in full. The initial batch size is now `_initialBatchSize(chunkConfig)`. This ADR's decision (no `TextProcessingPipeline`) stands. See `docs/guides/deleted-symbols.md`.
