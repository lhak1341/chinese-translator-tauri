# ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider

**Status:** Decided
**Date:** 2026-10-08

## Context

An architecture review (2026-10-08, round 19, candidate #4, `Speculative`) noted that the rule "an edit to a dictionary clears the engine's caches" is wired by a view. `Translator.jsx` registers `(id) => engineRef.current?.invalidateDictionaryCaches(id)` into `DictionaryProvider` through `registerCacheInvalidator`, in an effect keyed on `enginePhase` with no unmount cleanup. The engine and its lifecycle belong to `EngineProvider`. The proposal was to register from there, so whoever owns the engine also owns the subscription.

Reading the code in the grilling:

- The caller side is `invokeEngineInvalidator` in `DictionaryContext.tsx`, which separates three states: never registered (silent, nothing was cached), registered then nulled (a reinit window, so it warns), and registered (runs). `DictionaryContext.cacheInvalidationSeam.test.tsx` covers all three. Only the Translator's side, three lines, is untested.
- The registration is correct today. The effect sets `null` whenever `enginePhase` is not `'ready'` and re-registers on every transition to ready. The closure reads `engineRef.current` at call time, so a replaced engine is the one invalidated. The Reader shares the one engine, so it needs no registration of its own.
- The move would add no coupling: `useTranslatorEngine` already imports `useDictionary`, and `DictionaryProvider` sits above `EngineProvider` in `App.jsx`.
- ADR-008's mechanism is superseded and ADR-065 is about reload ownership; neither rules on where the registration lives.

## Decision

Do not move it. Leave the registration in `Translator.jsx`.

## Reasoning

No bug, no failing test and no second consumer. The only gain is that correctness would stop depending on the Translator staying mounted, and that dependency is a stated invariant (every tab stays mounted, `src/components/CLAUDE.md`), already relied on by hotkeys, the reload registry (ADR-065) and the reload guard. Moving this one registration would not remove the Translator's role as the reload owner.

## Consequence

A future review that sees a view registering the engine's invalidator should not re-propose the move from that alone. Revisit if tabs ever become lazily mounted, or if a second place needs to register an invalidator. At that point register from `EngineProvider`, where `enginePhase` and `engineRef` are in scope, and keep `hasRegisteredOnceRef`'s three states.
