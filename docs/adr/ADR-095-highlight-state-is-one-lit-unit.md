# ADR-095: Highlight State Is One Lit Unit

**Status:** Decided
**Date:** 2026-10-10

## Context

Round 25 moved click-to-highlight into `useHighlightInteraction`, which kept the four-field reducer state (`unitIndex`, `translationUnitIndex`, `characterOnlyUnitIndex`, `isCharacterOnlyClick`) and the bridge effect that computed the Character-Only index and dispatched it back. The architecture review of 2026-10-10 (round 26, candidate #3) found that only three of the states were reachable: nothing, a translation click (`-1`, `k`), and "both" or a Character-Only click (`k`, `k`). `highlightOriginal` had no production caller, and the Original panel lit a unit that equalled either index, so `unitIndex` never changed what was shown. `characterOnlyUnitIndex` was a pure function of the lit unit and the two arrays, kept as state through an effect, with `isCharacterOnlyClick` there to stop that effect from mapping a Character-Only click back. A second effect cleared every index when `semanticArrays` changed, one render late.

## Decision

State is one lit unit: `{ index, arrays, fromCharacterOnly }` in a `useState`. `resolveHighlights(lit, semanticArrays, characterOnlyArrays)` derives `{ litIndex, characterOnlyUnitIndex }`, memoized in the hook. It lights nothing when `lit.arrays` is not the current `semanticArrays` or the index is out of range, and leaves the Character-Only panel unlit after a Character-Only click. The reducer, its actions, the bridge match effect and the clearing effect are deleted. `ClickableOriginalSemantic` takes one `highlightedUnitIndex`, and `TranslatorDisplayPanels` drops its second index. `validateSemanticArraySize` is a plain function in `src/utils/highlighting/`.

## Reasoning

**A derived value stored through an effect needs a flag to stop its own loop.** `isCharacterOnlyClick` existed only to keep the effect from re-mapping a click that came from the panel it writes to. As an argument of the resolver, the same fact is a function input and needs no guard, and the rule becomes a unit test of a pure function rather than a hook test with fake timers.

**Keying the lit unit to its arrays closes the stale window.** An index only means something against the arrays it was lit against. Comparing references inside the resolver makes the old highlight vanish in the render the new arrays arrive, where the effect cleared it a frame later. The visible behaviour is the same: each new translation clears the highlight.

**The resolver bounds-checks, which restores a guard round 25 dropped.** The bridge's out-of-range check was removed as unreachable. It is a cheap check in a pure function, and it replaces the reducer's index validation, which defended a dispatch API that no longer exists.

## Consequence

Future architecture reviews should not add a stored Character-Only index, an original-only highlight, or a second index prop for the Original panel; a state field that `resolveHighlights` can derive stays derived. The Reader's `useReaderHighlight` is a separate single-toggle state with no Character-Only panel and is not merged with this one.
