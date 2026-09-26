# ADR-045: Skip a Shared Chapter-Structure Override Control

**Status:** Decided
**Date:** 2026-09-26

## Context

Architecture review 2026-09-26 (candidate #4) flagged the chapter-structure override `<select>` as duplicated: one copy in `src/components/reader/BindingDialog.tsx` (the "Override" control under the election stats table), one in `src/components/reader/ChapterPanel.tsx` (the "Structure" control at the top of the outline panel). `ChapterPatternLabels.ts` already shares the label table, so the card proposed going one layer further: a `ChapterStructureOverride` component both panels render.

Grilling it required reading both controls side by side. They share the value/onChange wiring — about eight lines: `value={isOverridden && activePattern ? activePattern : ''}`, and `''` mapping back to `null` ("trust election"). Everything the reader actually sees differs, and differs because of what surrounds each control:

- **The dialog's options are bare pattern names, and its Auto option reads "Auto — trust the election".** The control sits directly under a table of every candidate's hit count, median gap and regularity, so repeating those numbers in each option would say the same thing twice, a few pixels apart.
- **The panel's options carry `candidateSummary(candidate)`, and its Auto option names what election picked ("Auto — Chapter (第...章)" / "Auto — none detected").** There is no table in the panel; the option text is the only place the reader can see why one structure beats another.

Both now take the same `ChapterOverride` slice from `useChapters` (candidates, activePattern, isOverridden, set), so the data half is already unified; only the presentation is duplicated.

## Decision

Do not extract a shared override control. Keep the two `<select>`s as written.

## Reasoning

Applying the deletion test to the proposed component itself: its interface would need a label mode for the options (bare vs summarized) and a label for the Auto option (fixed text vs the elected pattern's name), plus the `ChapterOverride` slice — roughly as wide as the eight lines of wiring it would absorb. Deleting it again would concentrate nothing, because each call site would pass exactly the presentation choices it makes inline today. That is a shallow module by the codebase-design definition, the same shape as ADR-036's and ADR-044's rejections: the duplication is in the surface, and the surfaces differ on purpose.

The part that must not drift between the two — what the override means and how it persists — already has one owner: `useChapterOutline.setOverride`, reached through `useChapters().override.set`.

## Consequence

Future reviews should not re-flag the two override `<select>`s on sight. Reconsider if a third site needs the control, or if the dialog and panel converge on one set of labels (for example, the stats table is dropped from the dialog) — either would make a shared control's interface narrower than its body.
