# ADR-099: Skip a Chapter-Outline Record Helper

**Status:** Decided
**Date:** 2026-10-11

## Context

The architecture review of 2026-10-10 (round 26, candidate #5, `Speculative`) noted that "which chapter pattern is in effect" is answered in two places. `patternInEffect(manual, elected)` in `ChapterNavigation.ts` is `manual ?? elected`; `ChapterOutlineStore.ts` calls it four times, and `Bookshelf.tsx` calls it once and then looks up the count with `outline.candidates.find(...)?.hitCount`. The proposal was a chapter-outline record module with `activePattern(record)` and `chapterCount(record)`, and moving the rule out of a navigation file.

Reading the code in the grilling:

- The two callers do not hold the same thing. The store is live: it keeps `manual`, `elected`, `candidates` and `headers` as separate fields, takes the cached override and cached outline as constructor arguments, and publishes `activePattern` in its snapshot, which is what `BindingDialog` and `ChapterPanel` read. The shelf lists books that were never opened, so it never has a store and reads the persisted `BookRecord`.
- `patternInEffect` is one expression. What it carries is a doc comment: the override never overwrites the elected pattern, and `null` means no outline, not an empty one.
- `hitCount` is read in four places, but only `Bookshelf.tsx` looks up the count of the pattern in effect.

## Decision

Change no code. `patternInEffect` stays where it is.

## Reasoning

**The deletion test fails for the proposed module.** Removing `patternInEffect` would inline `??` at five sites and lose a comment, so no complexity concentrates. `chapterCount(record)` would have one caller, the shelf. `activePattern(record)` would have one as well, because the store's four uses are over separate fields, not a record. A one-caller helper moves the same lines, the reasoning of ADR-039, ADR-043 and ADR-044.

**The same shape as two earlier declines.** ADR-054 declined a Book Record field schema and ADR-061 declined a shelf row module. ADR-061's revisit trigger was a second component needing the same labels; the second reader of this rule is the shelf, which ADR-061 already covered.

**Where the helper lives is a naming preference.** `ChapterNavigation.ts` is about line-to-chapter lookup and stepping, and `patternInEffect` is not that, but moving it between two modules gives no second consumer and no new test surface.

## Consequence

A future review that sees `patternInEffect` in `ChapterNavigation.ts` or the count lookup in `Bookshelf.tsx` should not re-propose a record helper from that alone. Revisit if a second consumer holds a `BookRecord` rather than a store (a palette row, an export), or if the shelf's persisted `hitCount` and the store's header count for the same pattern could disagree, which would make the lookup something to share and test.
