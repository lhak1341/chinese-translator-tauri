# ADR-066: Skip an Active-Dictionary Snapshot Module

**Status:** Decided
**Date:** 2026-10-03

## Context

The architecture review of 2026-10-02 (candidate #4, `Worth exploring`) proposed one module answering "which dictionaries are active, for this book", because several places hold a copy of `config.engine.activeProperNouns`: `useTranslatorEngine`, `useDictionaryConfigManagement`, `QuickAddTarget` and `BookBindingStore`, kept current by two different refresh mechanisms (`invalidateAppConfig` plus a reload, and `subscribeAppConfig`).

Reading the code in the grilling:

- Only four places read the list. `DictionaryContext`, `ReaderTab` and `useLibrary` call `loadAppConfig` for the session and reader fields. `QuickAddTarget` reads fresh each time and `BookBindingStore` reads inside a `transformAppConfig`, so neither keeps a copy.
- The two copies mean different things. `useTranslatorEngine`'s is the list the **running engine was built with**; it moves only on mount or `forceConfigReload`. The Configuration tab's is the **saved intent**, mirrored live. A checkbox toggle writes config and does not rebuild the engine, so the two differ until the next reload. That is the state a reader of "toggled but not reloaded" depends on.
- One module over both would have to hold both meanings, or erase one.

## Decision

No active-dictionary snapshot module. Each reader keeps the list it needs: the engine's at build time, the Configuration tab's through `subscribeAppConfig`.

Two small changes came out of the review, neither a deepening: `activeProperNounsFromConfig` left `EngineContext` (nothing read it), and the three-times-written "root or listed" test in `TranslationEngine.js` became `isActiveProperNounSource` in `FictionDictionaryFilter.ts`.

## Consequence

A future review that sees several holders of the active list should not re-propose merging them from that alone. Revisit if the Configuration tab needs to show that a toggle has not reached the engine yet, which would give the engine's list a second reader.
