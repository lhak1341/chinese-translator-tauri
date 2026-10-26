# ADR-085: EngineAccess — one queue for both tabs, ownership follows the visible tab

**Status:** Decided
**Date:** 2026-10-07

## Context

`translateWithSegments` resets engine-wide segment state on entry, so the one shared engine serves one caller at a time. Only the Reader enforced that: `createReaderEngine` held a Reader-private promise chain, and the Translator called `engineRef.current.translateWithSegments` and `translateWithCharactersOnly` directly. Across tabs the only protection was the Reader's `isEnabled` tab gate, which stops new Reader calls on a switch but not one in flight. `src/utils/reader/CLAUDE.md` recorded the resulting hole as an accepted gap (2026-09-25, "unreported"): a Translator run started within one Reader chunk of a tab switch could land its reset mid-call. `useForceReload`'s `retranslateInput: false` and `useDeferredRetranslate` were written partly to dodge it. Architecture review round 17 (candidate #1) proposed the engine-wide queue the note named as its option (b).

## Decision

One module, `src/utils/EngineAccess.ts`, owns who may call the engine for both translating tabs. `EngineProvider` builds it and exposes it as `useEngine().engineAccess`; `VisibleTabProvider` moved above `EngineProvider` so it reads the same visible-tab source as hotkeys and the Reader gate.

- **One FIFO chain** for every call from either tab. A rejection never blocks the calls behind it. The engine is read when a call's turn comes.
- **A hidden tab's call is refused** at the moment of the call (`EngineAccessRefusedError`). The Reader's `isEnabled` gate stays the normal path, so a refusal should not occur in normal use; it is the backstop for a new caller.
- **A call from the visible tab preempts the other tab's preemptible calls.** A call is preemptible when its caller passes `onPreempt`; the Translator's document run passes one that cancels its `translationRunner`. A call without it (every Reader call, the Translator's character-only call) drains: the other tab waits. The visible tab's call starts only after the preempted call has settled, so the engine is idle. A call preempted while still queued is skipped (`EngineAccessPreemptedError`).
- **A preempted Translator run keeps its partial output**, toasts "Translation paused", and is not restarted.
- The seam covers the translate entry points only. Reload and rebuild stay with the Translator (ADR-065).
- `engineRef` stays in the context for readiness, reload and init. `src/__tests__/EngineAccess.guard.test.js` fails any production translate call outside the Reader's three mappers and the Translator's two sites, and any `engineRef.current.translateWith…`.

## Alternatives considered

- **Skip it** (the status quo). The gap was unreported for 12 days. Rejected because the fix needs no engine change and the cost of the gap is wrong text in the Reader until the next re-plan.
- **A whole-call FIFO with no preemption.** A Reader chunk would wait behind a whole Translator document, minutes for a long one. Rejected.
- **A chunk-granular lock** inside the engine. Needs engine changes in `translateSinglePass` territory, which `CLAUDE.md` forbids extracting. Rejected.
- **Wait instead of refuse for a hidden tab.** Queues work nobody can see; `useDeferredRetranslate` already covers the one hidden caller. Rejected.
- **Each tab reports its visibility to the engine.** A second copy of the visible tab, the shape of the Cmd+Z bug in `HotkeyDispatchTable`. Rejected for moving the provider.
- **Size threshold for "long".** Replaced by the caller's `onPreempt`: it says "I can cope with being cancelled" without a magic number.

## Consequences

- The Translator, the Reader and any future tab share one rule instead of four prose notes. `createReaderEngine` no longer holds a queue.
- `useDeferredRetranslate` stays: re-translating a hidden document after a Reader-triggered reload is cost as well as contention. Only its contention rationale is gone.
- A Translator run now yields to the Reader. Switching to the Reader while a document translates and then reading cancels the run; the reader translates again. Accepted: the alternative stalls the Reader for the length of the document.
- A Translator call made while the Translator is hidden is logged and skipped. The one automated caller, the Reader-triggered reload retranslate, is already deferred.
- Revisit if a third tab needs the engine, or if preempting a long Translator run proves annoying in use (the next step would be resuming it, not removing the preemption).

## Addendum (2026-10-26): the engine swap takes a turn of the queue

"The seam covers the translate entry points only" left the swap outside the queue, and ADR-065's invariant (in-flight translations finish before the engine is destroyed) was kept only by the Translator's force reload, which cancels its runs first. The book-binding rebuild (`BookBindingStore.rebuildEngine`, on most book opens) does not, so it destroyed the engine under the Reader's first chunk of the new book. That chunk's Phase 1 then read the disposed dictionaries (`DictionaryManager.getDictionary` on a null map), each concurrent chunk counted a matcher failure, and the dead engine's Pattern Store showed "attempt 1/3" and three "turned off" toasts. The replacement engine's patterns were never off. A call whose turn came while the replacement was still initializing was refused as not ready.

- `EngineAccess.replace(work)` runs the swap as one turn: it preempts every preemptible call of either tab, waits for the call in flight, and holds the chain until `work` settles. Calls queued behind it run on the ready replacement.
- `useTranslatorEngine` builds the access (beside `engineRef`, which it reads) and runs `runEngineInit`'s destroy, construct and initialize inside `replace`. `EngineProvider` passes it `getVisibleTab` and exposes the hook's access unchanged.
- `destroyEngine()` (the force reload's early free) stays outside the queue; its caller cancels its runs first, as before.
- Never call `reinitializeEngine` from inside an `access.run` callback: the swap would wait on that call forever. No caller does.
- Separately, `PatternStore.matchTokens` stops counting a failure once Phase 1 is already off, so concurrent failures show the switch-off toast once.

Pinned by `EngineAccess.test.ts` ("replacing the engine takes a turn") and `useTranslatorEngine.test.js` ("the swap waits for the engine call in flight").
