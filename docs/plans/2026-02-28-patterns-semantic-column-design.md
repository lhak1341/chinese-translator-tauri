# Design: Semantic Column in Patterns Dictionary Table

**Date**: 2026-02-28
**Status**: Approved
**Approach**: A — new dedicated column, trim translation width

---

## Problem

The Structural Patterns dictionary table has no column for `semanticType`, even though patterns can now declare an output semantic type (added in the pattern-semantic-type feature). Authors must open each pattern's edit modal to see or change the output type — there's no at-a-glance view.

The phrases dictionary already shows `semanticType` in a dedicated "Semantic" column (12%, using `SemanticTypeToggleCell`) when `allowAsPatternVariable` is true. Patterns should mirror this.

---

## Design

**File**: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx`

### Column header

Add a `<th>` for "Semantic" at `width: '12%'` between the translation header and the "X types" header — patterns block only. Phrases, properNouns column headers unchanged.

### Row cell

For each pattern row, add a `<td>` at `width: '12%'`:

- When `entry.metadata?.allowAsPatternVariable === true`: render `<SemanticTypeToggleCell>` with `entry.metadata?.semanticType`, the existing `onUpdateEntry` callback, and `isSaving` — identical to how it's used in the phrases block
- When `allowAsPatternVariable` is false: render a plain centered `--` span (same treatment as X/Y columns for variables absent from the pattern)

### Width adjustment

Patterns block only: translation column changes from `width: '55%'` to `width: '43%'`. All other dictionary types unchanged.

### No new components

`SemanticTypeToggleCell` (lines 456-501) is reused with no modifications. Persistence is handled by the existing `onUpdateEntry` callback already wired through the table.

---

## Files Touched

| File                                                               | Change                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` | Add Semantic column header + cell in patterns block; change translation width 55% → 43% |

No changes to CSS modules, constants, or any other file.
