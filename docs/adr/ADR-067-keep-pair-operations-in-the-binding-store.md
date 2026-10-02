# ADR-067: Keep Pair Operations in the Binding Store

**Status:** Decided
**Date:** 2026-10-03

## Context

ADR-062 put every dictionary pair operation (create, rename, move a tier) on the binding store's queue and deferred a rename of `BookBindingStore` until "a second operation with no book in it arrives". The architecture review of 2026-10-02 (candidate #5, `Speculative`) asked whether that had happened, and whether the pair operations should become a module of their own.

Reading the code in the grilling, every pair operation depends on the binding:

- `createDictionary` activates the new dictionary under the config lock, and with a book open the book's binding owns the fiction slice, so it reads `openBook`, `binding` and `missingFictionDictionary`.
- `renameDictionary` calls `renameBoundDictionary` for the book records and updates `snapshot.binding`.
- `moveDictionaryTier` calls `unbindDictionary`, updates the snapshot, and applies the binding on top of config.

The book-free cases (a non-fiction create or rename) were already folded in when ADR-062 was written, and they are a branch of the same operation, not a second operation.

## Decision

Do not split the pair operations out of `BookBindingStore`, and do not rename it. Its dependency `createDictionary` became `createDictionaryFiles`, because the store's own `createDictionary` creates the files and also activates them.

## Reasoning

**The deletion test fails for a pair-operations module.** It would read the binding through getters and reach book records through injected functions: the same coupling behind a wider interface, with one adapter and no second. Rename would touch 28 files for a name that still describes what the queue guards.

## Consequence

A future review that sees pair operations in a store named for books should not re-propose a split or a rename from that alone. ADR-062's trigger is sharpened: revisit when an operation arrives that does not read the binding.
