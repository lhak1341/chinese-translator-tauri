# ADR-064: Skip Splitting the Binding Context

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #4, `Worth exploring`) proposed splitting `useBookBinding()`'s 20 fields into a stable action interface and a state snapshot, because five consumers read only one stable function (`TabbedInterface`, `DictionaryManager` and `useDictionaryModals` read `loadQuickAddView`; `ReaderTab` the two announce functions; `BookReader` `openDialog`) yet re-render on every snapshot change, and `BookReader` is not memoised.

Reading the code in the grilling:

- The snapshot changes only on binding events: about four times per book open (`openBook`, `isApplying` on and off, `binding`) plus the dialog flag. An apply also rebuilds the engine, which re-renders the Reader tree regardless.
- `TabbedInterface` also reads `dictionaries` and `unreadDictionaryIds` from `useDictionary()`, which change on every dictionary edit, and no tab component is `React.memo`'d. The binding context adds a handful of re-renders to a component that already re-renders far more often.
- No profile shows binding events driving re-renders. The claim was a structural observation, not a measurement.
- A `useBindingActions` hook would be a pass-through slice of the same provider's value, so no behaviour would move behind a smaller interface. Seven test files mock `useBookBinding`, and every one would change.

## Decision

Do not split the context, and add no selector hook. `useBookBinding()` stays one interface over one provider.

## Reasoning

**The deletion test fails for the proposed hooks.** Deleting `useBindingActions` would leave each consumer destructuring one function from `useBookBinding()`, as they do now. It relocates the field list without hiding anything (the reasoning of ADR-039, ADR-043 and ADR-044).

## Consequence

A future review that sees a consumer reading one field from a wide context should not re-propose a split from that alone. Revisit if a profile shows binding events causing re-renders while a book is being read (not at open), or if a second provider needs only the actions.
