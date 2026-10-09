# ADR-091: Skip Extracting translateText from Translator.jsx

**Status:** Decided
**Date:** 2026-10-09

## Context

`translateText` (`src/components/Translator.jsx`, one `useCallback`, about 180 lines) runs the input guards, resets scroll, calls `translationRunner.run`, wires `engineAccess` preemption, commits the result to state and records stats. It resolves a `TranslateTextOutcome`: `done`, or `skipped` with one of seven reasons (`invalid`, `reloading`, `loading`, `not-ready`, `preempted`, `refused`, `overflow`). The architecture review of 2026-10-09 (round 22, candidate #2) proposed moving the guards and the error-to-outcome mapping into a module of their own, because no test renders `Translator.jsx` and nothing pins the mappings.

## Decision

Do not extract it. `translateText` stays in `Translator.jsx`, and the preempted, refused and overflow mappings stay without a component test.

## Reasoning

**The defect was the outcome shape, and round 21 fixed it.** Commit `e7297b9` made `translateText` resolve `done | skipped`, after `useAutoTranslateTrigger` crashed on `undefined.length` and `useReloadRetranslate` streamed a refusal under a success toast. Both callers' handling of every skip is pinned in their own tests. What is left in the callback is wiring.

**The inputs are the component's own state.** The body reads about 14 values from the component: `engineRef`, `translationTextRef`, `debouncedProgressHandler`, `translationRunner`, `engineAccess`, `updateStreaming`, `setActiveTranslations`, `setPartialSemanticArrays`, `setProgressInfo`, `setResultArrays`, `clearFullResult`, `validateSemanticArraySize`, `recordTranslation`, plus `isLoading` and `isDictionaryReloading`. `CLAUDE.md` lists anything using `setState`, refs or 10+ parameters as not extractable from this file. Grouping them into one deps object hides the count and brings back the wide interface ADR-011 rejected. `isLoading` and `isDictionaryReloading` are also read from the render closure on purpose (`useForceReload` retranslates inside the reload window through a callback captured before the flag was set), and that has to survive any move.

**The real logic is already behind two seams.** `TranslationRunner` owns timeout, cancel and `guard`. `EngineAccess` owns preempt and refuse (ADR-085). What stays inline is the mapping of three conditions to a reason, a few lines each. Extracting only the pure parts (a guard decision and an error-to-outcome mapping) leaves the toasts, logs and state writes at the call site, so the `if` ladder keeps its shape and the module only renames it. The deletion test shows nothing concentrated.

**One call site is a hypothetical seam.** `translateText` is called only through `Translator.jsx`'s own wiring. There is no second adapter to justify a seam (ADR-016).

**A harness for three branches costs more than it protects.** Mounting `Translator.jsx` with its hooks and contexts mocked is a wide mock surface, and `src/components/CLAUDE.md` already records that a mock missing one destructured field fails somewhere unrelated. The gap is documented there ("`translateText` has no component test").

## Consequence

Future architecture reviews should not re-propose extracting `translateText`, or only its guards or its error mapping, from the missing test alone. Revisit if a second caller needs the same body (a Reader-side translate, say), or if a `Translator.jsx` test harness gets built for other reasons, in which case pin the three mappings there.
