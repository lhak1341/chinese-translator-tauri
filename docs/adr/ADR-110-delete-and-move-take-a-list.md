# ADR-110: Delete and Move Take a List

**Status:** Decided
**Date:** 2026-10-24

## Context

The architecture review of 2026-10-24 (round 39, candidate #2) found `useDictionaryCRUD` offering each of delete and move twice. `deleteEntry` and `bulkDeleteEntries` both planned `planDelete`; `moveEntry` and `bulkMoveEntries` both planned `planMove`. They differed only in how a missing entry was handled and what they returned, and `GLOSSARY.md` named that as the reason the twins stayed (round 35, ADR-052 addendum, made delete one Dictionary Edit already).

The differences were accidents more than decisions:

- `bulkMoveEntries` toasted "Moved N" even when N was 0 (every source missing), and a partial miss only changed the number. Its `{ movedCount, errors }` result had no production reader (`MoveDialog` ignored it).
- `deleteEntry` rejected on a miss while `bulkDeleteEntries` warned and resolved. `MoveDialog` chose between the two moves by `entries.length === 1`.

## Decision

`deleteEntry` is deleted; its two callers (`DictionaryTableView`'s context menu and `RuleMatchesModal`) call `bulkDeleteEntries([{ dictionaryId, key }])`. `moveEntry` and `bulkMoveEntries` become `moveEntries(sourceDictId, targetDictId, sources, targetDictLabel): Promise<void>`.

`moveEntries` policy: nothing found is an invalid plan (`Entry 'x' not found in source dictionary`, or `None of the N entries were found in the source dictionary`), which `MoveDialog`'s banner shows. Some missing succeeds with a warning toast, `Moved N of M entries to X; K not found`. All found toasts `Moved N entries to X`. A failure toasts nothing here.

## Reasoning

**One policy per operation.** The count-zero rule lived in four places and was wrong in one. A list-taking operation has one.

**Move and delete still differ, on purpose.** Delete errors go through `fail` and toast; move errors reach `MoveDialog`'s banner (I4 in `useDictionaryCRUD.test.ts`, `dictionary/CLAUDE.md` item 4). Only the single/bulk split is removed, not that difference.

## Consequence

- Do not recreate a single-entry delete or move beside the list one.
- Visible text changed: `Deleted 1 entry` replaces `Entry deleted successfully`, and `Moved 1 entry to X` replaces `Entry moved to X`. A delete of an entry that is gone resolves with a warning instead of rejecting.
