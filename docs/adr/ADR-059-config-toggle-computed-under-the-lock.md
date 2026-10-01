# ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #2) proposed one writer for `activeProperNouns`: route the Configuration tab's dictionary toggle through `BookBindingStore`'s queue, next to the binding apply. The evidence was that `handleToggleDictionary` built the new list from React state (`effectiveActiveDictionaries`) and saved it whole, while `BookBindingStore.writeAnswer` decides against the config under the lock.

Reading the code in the grilling:

- `saveAppConfig` is already a locked read-modify-write. The defect was narrower than "bypasses the lock": the _list_ was computed outside it. A second click before the first save resolved started from the list the first had not yet changed (`setActiveDictionaries` ran only after the `await`), and its save overwrote the first. This needs no book binding.
- The binding race the review described was mostly closed already: with a book open, the toggle started from `activeProperNounsForBinding(...)`.
- A toggle never rebuilds the engine. It only writes config; the engine reads it on the next reinitialize. The binding store's queue serializes _rebuilds_ (`writeAnswer` then `rebuildEngine`), so a toggle on it would wait behind work it has nothing to do with.
- The Rust writers of the key (create-and-activate, remove, rename-substitute) already go through `callRustConfigWrite`, which takes the same lock.

## Decision

`handleToggleDictionary` runs `transformAppConfig` and computes the new list inside it, with the pure `activeProperNounsAfterToggle` (`BindingActivation.ts`). With a book open that function still starts from `activeProperNounsForBinding`, so a binding apply that has not landed cannot make a toggle write the previous book's fiction dictionary back. The hook's own `setActiveDictionaries` after the save is gone; the `subscribeAppConfig` mirror already sets the same state.

## Reasoning

The config lock is the right serializer for a config edit that causes no rebuild. A toggle is not a `bindingConfigChange` edit either: that function moves the active list and the quick-add default together, and a toggle must not touch the default.

## Consequence

A future review should not re-propose routing toggles through the binding queue, or a third writer abstraction over `activeProperNouns`. A new edit of that list from the UI is a `transformAppConfig` callback that computes against the config it is given. Revisit if a toggle ever has to rebuild the engine itself.
