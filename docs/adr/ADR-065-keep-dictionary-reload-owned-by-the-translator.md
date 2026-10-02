# ADR-065: Keep Dictionary Reload Owned by the Translator, Behind the Registry

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #5, `Speculative`) proposed moving the engine's teardown and rebuild out of `Translator.jsx` into `EngineContext`, with each tab subscribing to an "engine reloaded" signal, so the Reader would stop reaching the reload through `DictionaryReloadRegistry`'s one global slot and `useForceReload`'s `retranslateInput` flag would go.

Reading the code in the grilling:

- Eight of `ForceReloadContext`'s ten fields are the Translator tab's own state: `cancelTranslations`, `setStatus`, `setReloadError`, `setReloading`, `clearHighlighting`, `saveScrollPositions`, `restoreScrollPositions` and `retranslate`. Only `destroyEngine` and `reinitializeEngine` touch the engine.
- The protocol's invariants are about that state. CRITICAL-3: in-flight translations must finish cancelling before the engine is destroyed. CRITICAL-1: `setReloading(false)` fires only after scroll is restored.
- The engine-level part is already shared. `BookBindingStore`'s `rebuildEngine` and force reload both call `reinitializeEngine` with `forceConfigReload: true`; the only duplication is that options pair.
- The Reader's version is one `useCallback` (`handleReaderReload`) that pairs `deferRetranslate()` with `handleForceReload({ retranslateInput: false })`, so the pairing the flag requires lives in one place.
- The registry is a 20-line seam with a documented reason: two teardown paths would have to be kept in step, and Cmd/Ctrl+R must mean the same thing on both tabs. The empty-slot case only occurs before the Translator's first render, and the Translator is always mounted.

## Decision

Keep reload as one action owned by the Translator, reached from the Reader through the registry. Do not move teardown into `EngineContext`, and do not extract a shared `reloadEngine` for the one options pair.

## Reasoning

**The deletion test fails for the proposed engine-owned reload.** The engine owner would need a "before the engine is replaced" phase, for the Translator's cancel, as well as an "engine reloaded" signal for its follow-up. That is a two-phase subscription protocol standing in for one function over a guarded 10-field context, and the Translator would still have to drive every step. It relocates complexity (the reasoning of ADR-011 and ADR-019), in a file the project says not to extract further.

## Consequence

A future review that sees the registry or the `retranslateInput` flag should not re-propose engine-owned reload from that alone. Revisit if a third tab needs to trigger a reload, or if the Reader needs a reload step the Translator's cannot run.
