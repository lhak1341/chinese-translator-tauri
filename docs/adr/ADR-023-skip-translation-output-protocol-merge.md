# ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput

**Status:** Decided  
**Date:** 2026-06-20

## Context

`Translator.jsx` coordinates two hooks across the translation lifecycle:

- `useStreamingTranslation` — progressive batch state (partialText, progress, isStreaming, throttled via `useThrottledValue`)
- `useTranslationResults` — final output state (translatedText, semanticArrays, characterOnly fields, named atomic operations)

The streaming→results transition protocol lives implicitly in `loadAndTranslate` inside Translator.jsx:

1. `onBatchComplete` callback → `startTransition(() => updateStreaming(batchData))`
2. After `translateWithSegments` resolves → `setResultArrays(...)` → `setProgressInfo(null)` → `updateStreaming({ isStreaming: false, progress: 100 })`
3. `finally` block → `updateStreaming({ isStreaming: false })` (defensive safety net)

The 2026-06-20 architecture review proposed merging both hooks into `useTranslationOutput`. `startTranslation()` would return `{ onBatchComplete, onComplete, onError }` callbacks that `TranslationEngine` calls directly, so Translator.jsx never touches raw streaming updates.

A narrower variant was also considered: absorb only `onBatchComplete` into `useStreamingTranslation` as a returned callback.

## Decision

Do not merge. Keep `useStreamingTranslation` and `useTranslationResults` as separate hooks. Do not introduce `useTranslationOutput`.

## Reason

**ADR-011 revisit condition is not met.** ADR-011 declined `useTranslatorSession` and set a specific revisit trigger: _"a recurring class of coordination bugs that can only be reproduced by rendering the full component."_ Investigated the full bug history — no such bugs exist:

- `28f32a8` (streaming pop-in/pop-out) — caused by a dep-array mistake (`isClipboardTranslation` in `useEffect` deps), not a streaming→results protocol bug
- `df1e0e3` (intermittent translation hang) — IPC stall before `setIsTranslating`, a startup timing issue
- The `finally` defensive reset has never been triggered by an actual stuck-streaming incident

**`useTranslationResults` is already deep.** Its docstring says: "No raw setters escape this hook — every write decides all relevant fields atomically." Named operations (`setFullResult`, `setDualResults`, `setResultArrays`, `clearFullResult`, `reset`) already enforce the output protocol on the result side.

**The narrow variant is cosmetic, not architectural.** `onBatchComplete` is `startTransition(() => { updateStreaming(batchData); setPartialSemanticArrays(...) })` — wrapping two already-returned setters into a named method. Zero new locality, zero new test surface. The streaming→results transition (the actual protocol gap) still spans Translator.jsx after the narrow change.

**`DebouncedProgressHandler` coupling.** The full merge would need to absorb `DebouncedProgressHandler` (a stateful UI-smoothing class with its own timeout lifecycle) into the hook, mixing UI rendering concerns with state ownership.

**`startTransition` is not a blocker.** It is the standalone function (imported directly from React, not `useTransition` hook), usable inside any hook. This concern dissolves on inspection.

## When to Revisit

If the post-`translateWithSegments` sequence grows a 4th or 5th write (e.g. a new streaming phase, or partial character-only results interleaved with batch updates) such that the ordering invariant becomes non-obvious or produces an actual coordination bug, the merge earns its complexity. The trigger is the first bug report where the root cause is "step N of the transition wrote state in the wrong order relative to step N+1."
