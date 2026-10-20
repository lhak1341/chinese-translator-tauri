# ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory

**Status:** Decided
**Date:** 2026-09-30

## Context

ADR-052 put every Dictionary Edit on one queue, but edits were only one of four kinds of write to the dictionaries in memory. The architecture review of 2026-09-30 (candidate #1) found the other three going around the queue:

- **`loadDictionary`** wrote React state only, not the ref the queue planned against, and ran whenever it was called. A reload that landed while a commit was awaiting its save could put the pre-edit copy back in memory while history kept the edit. It also never invalidated the engine.
- **`removeDictionaryKey`** (the second half of a pair rename) wrote state only, as a separate call after the load, so an edit could plan against a map holding both the old and the new id.
- **Import** rewrote every dictionary file, then reloaded only the selected dictionary. Every other dictionary kept its stale copy in memory, and the next edit to one saved that copy over the imported file.

Force reload read every file itself and gave the result only to the engine, so memory and the engine could disagree after a file changed on disk.

## Decision

1. **One Dictionary Store owns the in-memory dictionaries, the unread list and the list of dictionaries that exist** (`src/components/dictionary/DictionaryStore.ts`, a plain module). Every write is an operation on one queue: the startup load, a commit, a reload of one dictionary, a rename, and a reload of all of them (force reload, and import with `invalidate: true`). `DictionaryContext` reads it through `useSyncExternalStore`; the ref mirror and the `useState` copy are gone.
2. **`EditCommitter.ts` keeps the commit protocol as `commitEdit`; the queue moved to the store.** CRUD and history still commit through the `EditCommitter` interface, which the store satisfies.
3. **Memory is the source of truth.** Selecting a dictionary no longer re-reads it from disk, and duplicate mode no longer reloads every dictionary. The disk is read at startup, by the Reload button, by force reload, after import, and for a dictionary created or renamed on disk.
4. **A reload of one dictionary keeps history.** An undo whose keys the reload changed is refused by the existing changed-key check. Import and rename clear history, inside their turn in the queue (`onApplied`), so no undo queued before them runs after them.
5. **Every operation that changes a dictionary's contents invalidates the engine for it**: commit, reload, rename and import. The startup load and force reload do not, because the engine is built from their result.

## Alternatives considered

- **Reload every dictionary after import, and change nothing else.** This fixes the data loss in one line, but leaves the reload-during-save race and the writers that skip the queue, and a new one can be added the same way.
- **Keep `EditCommitter` as its own module and have the store wrap it, sharing its queue.** Two modules would then own one queue, and callers would see two interfaces for writing the same state.
- **Move undo history into the store.** History is about undoing edits; the store is about what memory and the disk hold. The `onApplied` callback runs inside the operation's turn, which is all history needs.

## Consequence

A new way of writing the dictionaries in memory — a new IPC command that changes dictionary files, a new import path — must be an operation on the store, not a `setState` in the provider or a call beside it. Reconsider decision 3 if something other than this app starts editing the dictionary files while it runs; the store would then need to notice outside changes, not only reload on request.

## Addendum (2026-10-02)

The store's list is the only list: the Configuration tab and the binding context's `fictionDictionaries` read it rather than keeping copies (ADR-062).

## Addendum (2026-10-03)

Decision 1 listed import as an operation on the queue, but only the reload after it was. The import IPC (the file dialog and the rewrite of every dictionary file) was called from `DictionaryManager.tsx` beside the store, so an edit's save in flight when import started could land after the files were rewritten. `store.importAll(onApplied?)` now runs the whole import as one turn through an `importFiles` dependency, wired in `DictionaryContext` the way `save` is. It returns `imported`, `reload-failed` or `failed` and never rejects; the component keeps its own busy flag and renders the result. Export and Open Folder stay in the component: they read or launch and change no dictionary file, so this ADR's rule does not reach them. The read side was re-examined on 2026-10-04 (architecture review candidate #4) and declined: export opens its save dialog first and reads the files only after the user picks a location, seconds after the click, against the milliseconds of an atomic save. A zip one edit behind needs a save that stalls longer than the dialog, and writes being atomic means that is the worst case, not corruption. Do not re-propose routing export through the queue.

## Addendum (2026-10-20)

Decision 5 is reversed by ADR-106: no store operation invalidates the engine. The engine's lookups are fixed at load, so the invalidation changed no output; an edit, reload, rename or import reaches translations only through a rebuild. The rest of this ADR (one store, one queue for every write) is unchanged.
