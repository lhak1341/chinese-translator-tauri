# ADR-052: Dictionary Edit Commits — One Queue, TypeScript Write-Back

**Status:** Decided
**Date:** 2026-09-29

## Context

The architecture review of 2026-09-29 (candidate #1) found that undo loses user data. A history record did not store what an edit overwrote, so undoing an Add over an existing key, an Update renamed onto an existing key, or a Move into a dictionary that already held the key deleted the earlier value. Saves also ran through three protocols with different semantics: `persistDictionaryMutation` (state first, rollback), `commitMoveOp` (state first, partial disk write-back) and `commitMutation` (save first, no partial revert, used by undo).

The grilling settled on one **Dictionary Edit** module (see `GLOSSARY.md`). Every edit is a pure plan of `{dictionaryId, key, before, after}` changes. One `commitEdit` applies, saves, records and invalidates. Undo is `commitEdit(invert(edit))`. Two parts of that design look like gaps that a later review might want to "fix". This ADR records why they are deliberate.

## Decision

1. **Multi-dictionary edits roll back in TypeScript, not through a Rust batch save.** When one save of a two-dictionary edit (a move, or its undo) fails, `commitEdit` rolls memory back and writes `before` back to each dictionary that did save. There is no `save_dictionaries` command.
2. **All commits run through one global queue.** Each commit (plan against the latest dictionaries, check unchanged keys, apply to memory, save, roll back on failure) finishes before the next one starts. Undo and redo use the same queue.

## Alternatives considered

- **A Rust `save_dictionaries` command** that writes every temp file and renames only after all writes succeed. It narrows the failure window to the renames, but adds an IPC command and Rust tests for an edit type (moves) that is rare. Each single `save_dictionary` is already atomic (`write_atomic`, temp file plus rename).
- **One queue per dictionary with key-level rollback.** It allows parallel saves to different dictionaries, but a two-dictionary edit then needs two queues in a fixed order, and edits come from one user, so there is no parallelism worth that cost.
- **No queue, key-level rollback only.** This leaves the Rust temp path race: `save_dictionary` names its temp file `<file>.tmp.<pid>`, so two in-flight saves of the same dictionary share one path.

## Reasoning

**One rollback path.** With TypeScript write-back, every edit, single or multi-dictionary, fails the same way inside `commitEdit`. The best-effort write-back can itself fail. `commitEdit` then reports `{saveFailed, rolledBack: false}`, which the caller shows as a loud error.

**The queue makes the unchanged-key check true.** The plan and the check against current values run at the start of the edit's queue turn, so they always see the state that the previous commit left. Without the queue, a memory-first rollback that restores a snapshot can erase a second edit that was applied while the first was saving.

**The queue costs at most one save of latency** for a second edit made while the first is still saving.

## Consequence

A review that proposes a Rust batch save, or per-dictionary parallel commits, should find this ADR first. Reconsider (1) if a half-applied move is ever observed on disk. Reconsider (2) if edits start to come from something other than one user's clicks, such as a background import or sync that writes through `commitEdit`.

## Addendum (2026-10-20)

`commitEdit` no longer invalidates the engine after a save (ADR-106): it applies, saves and records.

## Addendum (2026-10-21)

One user action is one Dictionary Edit, also when it spans dictionaries (architecture review round 35, candidate #1). A bulk delete in the duplicate view used to run one commit per dictionary, so one Cmd+Z undid only one dictionary's share, a failed save in one dictionary left the others' deletions on disk, and every failure was toasted twice (by CRUD, then by `useEntrySelection`). Now `planDelete(dicts, targets)` takes `EntryRef` pairs from any number of dictionaries, a target in a dictionary that is not in memory makes the whole plan invalid, and `bulkDeleteEntries(targets)` commits once and owns every message; the selection hook only turns its keys into pairs and never toasts, except for a key it cannot read, which deletes nothing. This is the multi-dictionary rollback in "One rollback path", now used by delete as well as move. Pinned in `useDictionaryCRUD.test.ts` (one record and one undo for two dictionaries; a failed save in one leaves the other unchanged, with one toast) and `useEntrySelection.test.ts` (one call, no toast).

## Addendum (2026-10-24)

The write plans own the entry rules (architecture review round 38, candidate #1). `planAdd` and `planUpdate` take the raw `source`, `translation` and metadata, and sanitize, run `validatePersistEntry` and build the stored value (an object for complex-entry dictionaries, a string for lookup tables) before they plan; a failed rule is an `InvalidPlan` carrying its message, and it wins over a missing dictionary. These rules lived in `useDictionaryCRUD`'s private `prepareMutationEntry`, reachable only through `renderHook`, so a second caller of the planner would have skipped them. The hook now keeps the toast and the typed throw. `planMove` still validates nothing: it writes no new value and `canMoveBetween` refuses a move into a lookup table, so the earlier claim that moves pass through `checkEntry` was wrong. Pinned in `DictionaryEdit.test.ts` ("entry rules in the write plans").
