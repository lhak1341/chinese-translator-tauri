# ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider

**Status**: Accepted
**Date**: 2026-06-03
**Decision Makers**: Development Team
**Affected Components**: `src/utils/dictionary/DictionaryBackend.ts`, `src/components/dictionary/DictionaryContext.tsx`

## Context and Problem Statement

After extracting `useDictionaryHistory` and `useDictionaryCRUD`, `DictionaryProvider` still owns five `window.electronAPI` call sites:

- `commitMutation` (L108) — `saveDictionary` × N, for undo/redo multi-dict updates
- `persistDictionaryMutation` (L145) — `saveDictionary` × 1, optimistic update + rollback
- `commitMoveOp` (L161) — `saveDictionary` × 2 parallel + partial revert
- `loadInitialState` (L207) — `loadDictionariesParallel` + serial retry via `loadDictionary`
- `loadDictionary` (L328) — `loadDictionary` × 1, single-dict reload

A `DictionaryBackend` module was proposed to extract all five into one IO layer. The question was whether all sites warranted extraction, or only a subset.

## Decision Drivers

- **Complexity is asymmetric**: `loadInitialState` owns 80 lines of parallel batch + serial retry + partial-failure classification buried in a `useEffect` — completely untestable without mounting React, with zero test coverage for the retry path. The three save operations (`commitMutation`, `persistDictionaryMutation`, `commitMoveOp`) are 3–25 lines of real logic each.
- **Save ops are already behind typed abstractions**: `CommitMutation` and `PersistDictionaryMutation` type aliases already form the seam between the provider and `useDictionaryHistory`/`useDictionaryCRUD`. The IPC is implementation detail of those callbacks, not a coupling problem.
- **`window.electronAPI` is trivially mockable**: existing tests use `(window as any).electronAPI = mockElectronAPI` — a two-line global stub. `DictionaryBackend.save()` would add an indirection layer without unlocking any test that `window.electronAPI` stubbing doesn't already support.
- **One adapter = hypothetical seam**: extracting `DictionaryBackend.save()` for a single caller (the provider) produces a hypothetical seam. The "two adapters = real seam" principle applies.

## Decision

Extract only `loadInitialState`'s retry+classification protocol into `DictionaryBackend.loadAllDictionaries()`. Leave save/move IPC in the provider.

`DictionaryBackend` is intentionally narrow: load protocol only. It returns `BatchLoadResult` (raw unsorted data, `stillFailedIds`, `total`). No React, no toast, no sorting — those stay in the provider.

## Alternatives Considered

### Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected

Full backend extraction with `save(id, data)`, `move(updates)`, `loadAll(ids)`, `loadOne(id)`. Provider injects backend or test double.

Rejected: save/move ops are already thin and behind typed abstractions; `window.electronAPI` is already a trivially stubbable global. Adding `DictionaryBackend.save()` is a rename, not a deepening — one adapter, no real seam.

### Alternative 2: Extract loadInitialState only ✓ Accepted

`loadAllDictionaries(ids)` in `src/utils/dictionary/DictionaryBackend.ts`. The 80-line retry+classification logic becomes a plain async function testable without mounting React. The three save operations stay in the provider as typed callbacks.

## Consequences

- `DictionaryBackend.ts` owns load protocol. Save/move IPC stays in `DictionaryContext.tsx`.
- Future architecture reviews should not re-propose extracting `persistDictionaryMutation`, `commitMutation`, or `commitMoveOp` into the backend — the seam is hypothetical and the save ops are already well-abstracted.
- If a second caller for save/move IPC emerges (e.g., a bulk-import feature), revisit — that would make the seam real.

## Addendum 2026-09-29

The three save operations named above (`persistDictionaryMutation`, `commitMutation`, `commitMoveOp`) no longer exist. They were replaced by one `EditCommitter` (ADR-052), which fixed undo data loss rather than extracting IPC into the backend. The load-only decision here stands: `DictionaryBackend` still owns load, and saves still call `saveDictionary` from the provider's committer.

## Addendum 2026-10-04

"Trivially mockable" now holds for the whole adapter: production code reaches it only through `window.electronAPI` (the Reader's `ReconcileLibrary`, `ChapterOutlineStore`, `ReaderTab`, `useBookLines`, `LookupIndexBuilder` and `TranslationEngine.js` used to import `tauriAPI` directly), and `TauriApiAccessPath.test.js` scans for a regression. The load-only decision stands.
