# ADR-113: Skip Splitting the Duplicate View

**Status:** Decided
**Date:** 2026-11-26

## Context

The architecture review of 2026-11-25 (candidate #5, `Speculative`) proposed choosing Find Duplicates once in `DictionaryManager` and giving it a view of its own (rows, filter, selection) over the shared building blocks, because one boolean, `showDuplicatesMode`, branches in four modules (45 occurrences: `DictionaryManager` 15, `EnhancedVirtualizedDictionaryTable` 16, `DictionaryTableView` 6, `useDictionaryEntryFilter` 8).

Its evidence was a reset it inferred: `DictionaryTableView` is keyed by `selectedDictionary` in both modes, and Cmd-1..6 sets the selected dictionary whatever the mode (`matchHotkey` → `TabbedInterface`). A probe in the composition harness confirmed it: a dictionary switch during Find Duplicates dropped the duplicate view's selection (and, read but not run, its open edit or move, its menu and its scroll) while the view stayed on screen.

## Decision

Do not split the view. Fix the reset where it starts: a dictionary chosen while duplicates are shown leaves the duplicate view for that dictionary (`DictionaryManager`, derived during render), as the key does in the normal view. In the same change the bulk-move answer became one: `DictionaryTableView` passes `canBulkMove` false for the duplicate view and for a lookup table, and the parent shows Move whenever `onBulkMove` is set.

## Reasoning

- **The sharing is deliberate.** Both modes render the search box, the row-position bar, the context menu, the edit modal and `MoveDialog` so the two views cannot drift apart again; they did (no right-click menu, a dead bulk-Move button in the duplicate view; `src/components/dictionary/CLAUDE.md`). A split must keep all of that shared, so it moves the mode branches into a view switch without removing the shared surface.
- **The one confirmed defect was local.** It took a state change in `DictionaryManager` and no new module.
- **No instance runs both modes.** The table remounts on a mode change (keyed by mode), so the branches never interleave at runtime; they are read-time cost, not a bug source on their own.

## Consequence

A review that counts the `showDuplicatesMode` branches should not re-propose the split from that alone. Revisit on a second confirmed bug that comes from the flag crossing modules, or when a duplicate-view feature needs filter or selection behaviour `useDictionaryEntryFilter`/`useEntrySelection` cannot express.
