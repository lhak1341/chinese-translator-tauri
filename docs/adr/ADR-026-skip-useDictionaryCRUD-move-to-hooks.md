# ADR-026: Do Not Move useDictionaryCRUD to src/hooks/

**Status:** Superseded — move completed 2026-06-27  
**Date:** 2026-06-21

## Context

The 2026-06-21 architecture review (Candidate 4) flagged `src/components/dictionary/useDictionaryCRUD.ts` as a hook living outside `src/hooks/`, violating the project convention that hooks belong in that directory. The proposed fix: move the file to `src/hooks/` and resolve the import of `validateDictionaryEntry` from `./DictionaryTypes`.

## Decision

Do not move `useDictionaryCRUD` to `src/hooks/`. Keep it co-located in `src/components/dictionary/`.

## Reason

**Moving introduces a backwards import.** The hook imports `validateDictionaryEntry` from `./DictionaryTypes`. That function dispatches through `DICTIONARY_TYPES[dictionaryId].validate()` — a registry defined in the same file that also calls `window.electronAPI.listProperNounsDictionaries()` (a Tauri IPC call). This registry belongs in the components layer, not `utils/`. Moving the hook to `src/hooks/` would produce a hooks→components import, which is a worse architectural violation than the current convention deviation.

**The two `validateDictionaryEntry` functions are not duplicates.** `DictionaryEntryValidator.ts` in `utils/dictionary/` is a different function with a different signature `(source, translation, dictionaryId) => ValidationResult`, different return type, and narrower coverage (only `characters` and `patterns`). It serves form-time validation in `useDictionaryEntryForm`. The `DictionaryTypes.ts` variant `(dictionaryId, source, translation) => string | null` serves persist-time validation in `useDictionaryCRUD`, dispatching through the full type registry. They cannot be merged without changing call sites.

**Co-location with the sole consumer is intentional.** `DictionaryContext.tsx` is the only caller of `useDictionaryCRUD`. Keeping both in `src/components/dictionary/` means the hook and its consumer share the same module boundary — no cross-layer import needed. `MoveOpUpdates` (exported by the hook and imported by `useDictionaryPersistence.ts`) also stays within that boundary.

**The hook is already deep — no depth problem to fix.** `useDictionaryCRUD` encapsulates a non-trivial protocol for all six CRUD operations: pre-check → closed-over snapshot → sort → persist → history → cache invalidation → double-toast error guard. Moving it would improve only discoverability by convention, not depth or testability.

## When to Revisit

If `DictionaryTypes.ts` is refactored to extract the validation registry out of the components layer (decoupling it from `window.electronAPI`), and a clean `utils/dictionary/` home is established for it, moving the hook becomes straightforward — no backwards import. The trigger is that extraction, not a second caller appearing.

## Supersession Note (2026-06-27)

The blocker was resolved. `validateDictionaryEntry` (persist-time) was extracted from `DictionaryTypes.ts` into `src/utils/dictionary/PersistTimeValidator.ts` as `validatePersistEntry`. With no component-layer imports remaining, `useDictionaryCRUD.ts` was moved to `src/hooks/useDictionaryCRUD.ts`. Callers updated: `DictionaryContext.tsx` and `useDictionaryPersistence.ts`. See `PersistTimeValidator` entry in `CONTEXT.md`.

## Addendum (2026-10-03)

The "not duplicates" paragraph above is stale. `DictionaryEntryValidator.ts` is gone: `PersistTimeValidator.ts` now holds one `checkEntry` that the form and the persist path both call. The narrower form-time coverage was a gap, not a design: a rename, patch or move into `characters` skipped the one-character rule the Add form enforced.
