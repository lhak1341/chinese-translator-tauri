# ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation

**Status:** Decided  
**Date:** 2026-06-05

## Context

`useStreamingTranslation` returns 7 items (was 8 before the dead-field cleanup in this session). A candidate proposed collapsing the return into a typed `StreamingContext` record to reduce caller interface complexity.

## Decision

Do not wrap the return in a `StreamingContext` record.

## Reasoning

**One call site** — `Translator.jsx` is the sole consumer. With a single call site there is no real seam: a `StreamingContext` wrapper has no second adapter, cannot be substituted, and creates no new test surface.

**Depth is already earned** — the hook encapsulates 3 `useState` calls and 3 `useCallback` functions behind a single import. That is genuine depth. The 7-item flat return is the hook's interface; it is not shallow relative to its implementation.

**Ergonomics regress** — callers would write `streaming.setProgressInfo(...)` and pass `streaming.throttledStreamingState` as a prop instead of the value directly. The record adds one layer of indirection with no leverage gain.

**The actual friction was naming**, not structure: the hook exported `setProgress` and `setPartialArrays` while callers renamed them immediately at destructure (`setProgress: setProgressInfo`). Fixed in the same session by aligning the exported names with caller usage — no record wrapper needed.

## What Was Done Instead

- Dropped dead return field `streamingTranslation` (raw, unthrottled) — only `throttledStreamingState` is consumed by callers; the raw state was destructured but never read.
- Renamed `setProgress` → `setProgressInfo` and `setPartialArrays` → `setPartialSemanticArrays` in the hook's return to match caller names, eliminating rename-at-destructure.

## Consequence

Future architecture reviews should not re-propose a `StreamingContext` record for `useStreamingTranslation`. If a second call site is ever added, revisit — two adapters make a real seam.
