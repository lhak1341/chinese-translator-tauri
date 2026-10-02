# ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #1) found three holders of "which proper-nouns dictionaries exist", though ADR-055 had already made the Dictionary Store the owner of that list:

- `DictionaryStore.dictionaryTypes`, re-listed on every create (a reload of a new id) and rename.
- `BookBindingStore.fictionDictionaries`, a fiction-only copy with its own `refreshFictionDictionaries()` after each create, rename and move.
- `availableDictionaries` in `useDictionaryConfigManagement`, read once on mount and patched by hand after each create, rename and move. The hook merged the binding context's list into it because its own went stale.

The hook also chose between `createFictionDictionary`/`renameFictionDictionary` (on the binding queue) and `DictionaryPairs` directly, and patched `activeDictionaries` and the Cmd-5 default after a create or rename even though the `subscribeAppConfig` mirror already carried what Rust wrote.

## Decision

1. **The Configuration tab's rows are the Dictionary Store's proper-nouns ids.** The hook keeps no list. The mount-time `listProperNounsDictionaryIds` call is gone; the migration that creates missing patterns halves runs once, after the store has loaded, over that same list.
2. **`fictionDictionaries` is a filter over the same list.** `BookBindingContext` derives it from `useDictionary().dictionaryTypes`. `BookBindingStore` no longer holds it, and `refreshFictionDictionaries` is deleted. The open-time existence check still reads the disk, on purpose: the store's list may not have loaded on the first open after launch.
3. **Every dictionary pair operation runs on the binding queue, fiction or not.** The binding context exposes `createDictionary` and `renameDictionary` for every id, and the hook has one call each, with no `isFictionProperNounsId` branch. A fiction rename also updates book records; any other rename has none to update. Rust rewrites `activeProperNouns` on every create, rename and move, so all three belong behind an apply that does the same read-modify-write.
4. **`subscribeAppConfig` is the only writer of the hook's `activeDictionaries` and `defaultQuickAddDictionary`** after the initial load. The hand patches after create, rename and set-default are gone.

## Alternatives considered

- **A new catalog module above both stores.** It would be a second owner of "what exists" next to the one ADR-055 set up, with a refresh of its own to keep in step.
- **Keep the fiction branch in the hook.** The branch exists only because the fiction operations were on the queue; a plain create or rename writes the same config key from Rust, so it needs the queue as much.
- **Rename `BookBindingStore` now that its queue serves every pair operation.** It would touch a dozen files for a name that still describes what the queue guards: an apply is a read-modify-write of the same key. Revisit when a second operation with no book in it arrives (sharpened by ADR-067: an operation that does not read the binding).

## Consequence

A new way of creating, renaming or moving a dictionary is an operation on the binding store, not a call to `DictionaryPairs` from a component. The tab no longer shows an on-screen error when listing fails: `getDictionaryTypes` toasts and falls back to the built-in set, and the tab lists that.
