# ADR-105: One Batch Event for a Progressive Run

**Status:** Decided
**Date:** 2026-10-12

## Context

An architecture review (2026-10-12, candidate #1) found that `translateWithProgressiveBatches` reported each batch twice:

- **`onBatchComplete`**, every batch, fed the streaming overlay.
- **`onProgress`** reached the "Batch x/y" pill and a hidden `translatedText` write. It was gated three ways: on runs of 10+ chunks only, every 3rd batch only, and at most once per 300 ms. It went through `ProgressiveProgressReporter` and then `DebouncedProgressHandler` (300 ms).

Problems with that shape:

- **Arrays copied for nothing.** Both payloads carried their own copy of the builder's semantic arrays. Only a development-only debug count read either copy.
- **Three throttles in a row:** the engine gate, the debounced handler, and `useThrottledValue` at 100 ms.
- **The types described neither payload.** `TranslationProgressData` declared fields the engine never sent, and `UIResponsiveness.ProgressData` and `SemanticTypes.ProgressData` were two more shapes. `TranslationOptions` lacked `onBatchComplete` and declared seven options nothing read. `progressive: true` was passed by Translator and ReaderEngine and never read.

## Decision

The engine sends one event per batch, `onBatchComplete(BatchCompleteEvent)`, with no gate.

- **The event carries text and counts only:** `{ partialText, completedChunks, totalChunks, batchNumber, avgTimePerChunk }`. The final result is the only place semantic arrays leave the engine.
- **`useStreamingTranslation` is the only throttle** (100 ms). It derives `progress` from the chunk counts.
- **The pill and the overlay read one streaming state.** The pill shows `completedChunks/totalChunks`, with no batch-count estimate.
- **The partial text of a run that ends early is written once, when it becomes visible.** `useStreamingTranslation.latestPartialText()` holds the last text, unthrottled. `translateText`'s `catch` writes it to `translatedText` after a Reader preempt, a timeout or an engine error. A plain cancel (a newer run, a reload, unmount) does not write it, because whatever cancelled the run writes its own text.

The change deletes:

- `onProgress`
- `ProgressiveProgressReporter.js` (`snapshotSemanticArrays` moved to `FullTextAssembly.ts`, its one caller)
- `DebouncedProgressHandler` with `utils/ui/index.ts`
- `PROGRESS_DEBOUNCE_MS` and `STREAMING_MIN_CHUNKS`
- `progressInfo` and `partialSemanticArrays` in the streaming hook
- the three progress-data types
- the seven unread options and `progressive`

## Consequence

- **Behaviour changes.**
  - The overlay and the pill now show progress on every run, not only on runs of 10+ chunks.
  - A preempted short run keeps its partial text, where it used to keep the previous run's text.
  - `translatedText` no longer re-renders under the overlay during a run.
- **Do not restore a second progress callback, or semantic arrays on the batch event, without a consumer that renders them.** Incremental highlighting during streaming would be such a consumer. Add the field then, with its copy, and not before.
- **Throttling lives in the streaming hook.** A new consumer of batch progress reads `throttledStreamingState` and adds no throttle of its own.
- **Not done here.**
  - `getArrays()` already copies by default, so `snapshotSemanticArrays` in `FullTextAssembly.ts` copies a second time (inferred from reading `SemanticArrayBuilder.getArrays`, not measured).
  - The engine still ignores the `debug` option the Translator passes.
  - `UI_UPDATE_THRESHOLDS.MIN_UI_UPDATE_INTERVAL_MS` is the last member of `PerformanceThresholds.ts`, and nothing reads it.
  - All three are separate changes.
