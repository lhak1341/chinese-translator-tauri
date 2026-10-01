# ADR-061: Skip a Shelf Row Module

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #5, `Speculative`) proposed moving `Bookshelf.tsx`'s file-private formatters (`splitBookTitle`, `formatProgress`, `formatBinding`, `formatChapterCount`) into `src/utils/reader/` as one `shelfRow(record, recordsUnknown)` function, on the grounds that they are only reachable by rendering the shelf.

Reading the code in the grilling:

- The formatters are already tested, through the real component: `Bookshelf.test.tsx` covers "Not started", "Line N of M", "In progress", the unknown state, and the card layout's binding. The component is the interface, so this is not a coverage gap.
- Every formatter is single-use. A `shelfRow` function would be called from the same component with the same arguments.
- The real friction was the unknown-identity rule, `identityKnown ? formatX(record) : UNKNOWN_LABEL`, written out five times in the JSX. `recordOf` already returns `undefined` when identity is unknown, so dropping the guard would show "Not started" and "Not bound", the strings commit `1458d28` removed.

## Decision

Do not build a `shelfRow` module. Keep the rule in the file: one local `rowLabels(record, identityKnown)` returns `{binding, chapters, progress}`, with `UNKNOWN_LABEL` handled once. The list prints the placeholder for chapters; the card drops that row, as before. A test pins that difference. The Continue row and the Unavailable section skip the guard on purpose, and each says why in a comment.

## Reasoning

**The deletion test fails for the proposed module.** Moving the formatters out leaves the component's call shape unchanged and the tests where they are, so it relocates complexity (the reasoning of ADR-039, ADR-043 and ADR-044). The repetition was the part worth removing, and a local helper removes it.

**ADR-054 is not in the way.** This reads the Book Record; it does not define a schema. It is skipped on its own merits.

## Consequence

A future review that sees file-private formatters in `Bookshelf.tsx` should not re-propose a shelf row module from that alone. Revisit if a second component needs the same labels (a palette row, an export), which would give the function a second caller.
