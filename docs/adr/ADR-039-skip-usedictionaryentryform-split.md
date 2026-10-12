# ADR-039: Skip Splitting `useDictionaryEntryForm`

**Status:** Decided
**Date:** 2026-08-15

## Context

An architecture review round (candidate #3) flagged `src/hooks/useDictionaryEntryForm.ts` as a possibly shallow module: it returns a 24-field/handler interface (`DictionaryEntryFormState`) to its single caller, `DictionaryEntry.tsx`. The card's own badge was `Speculative` — no concrete pain point was cited, just the field count.

Grilling this candidate required reading `useDictionaryEntryForm.ts` in full alongside its sole caller. That surfaced:

- Every one of the 24 returned fields/handlers is read directly at the call site (`form.source`, `form.handleSubmit`, `form.setTranslation`, ...) — none are unused, none are threaded through unread. `SemanticTypePicker` consumes 6 of them, `WordTransformToolbar` 3, the rest render inline in the form JSX.
- The hook's actual _interface_ is narrow — `(entry, selectedDictionary, deps)`, 3 params — hiding clipboard auto-populate, debounced dual validation (character/pattern), cross-dictionary existing-entry detection, and Transform Rule-derived initial translation behind it. That is the real Ousterhout depth signal: small interface, substantial implementation.
- Applying the deletion test to a hypothetical split (e.g. `useFieldState` / `useValidation` / `useExistingEntryDetection`): `DictionaryEntry.tsx` still needs the union of all 24 fields regardless of how many hooks produce them. A split would either re-merge 3 returned objects back into one `form`-shaped object (pure glue, no complexity removed) or force a wide mechanical rename of every `form.X` call site to `fieldState.X`/`validation.Y`/`existing.Z` (no interface simplification — the caller's total surface area is unchanged).

## Decision

Do not split `useDictionaryEntryForm`. The wide return object is the natural shape of "everything one form needs to render," not a shallow call-surface with many methods to learn. No second caller exists that would benefit from a narrower slice, and no isolated-testing difficulty was reported.

## Reasoning

**Field count alone isn't the shallow-module signal — interface-to-implementation ratio is.** A hook with 3 params in and 24 fields out isn't shallow by default; it's shallow only if the 24 fields expose implementation detail the caller shouldn't need to know, or if a narrower slice of the same hook would serve most callers. Here, one caller needs all 24 fields, and the hook's own entry point stays small.

**Deletion test applied to the fix, not just the candidate.** The report card's instinct — check whether deleting/splitting concentrates or just relocates complexity — was applied to the proposed split itself: it relocates (glue code or a wide rename), it doesn't concentrate. That's the disqualifying signal, not the field count.

## Consequence

Future architecture reviews should not re-flag `useDictionaryEntryForm`'s return-object size on sight. A split becomes worth reconsidering only with new evidence — e.g. a second real caller needing a narrower slice of the form state, or a concrete testing/isolation difficulty that reading the file doesn't already contradict. Absent that, the hook's job stays "own all dictionary-entry form logic for its one caller," same as `DictionaryCRUDAPI`/`useDictionaryCRUD` (a genuinely different shape — multiple callers, `Pick<>`-able) was NOT the precedent here.

## Addendum (2026-10-13): no debounce, validation derived — decision unchanged

Architecture review 2026-10-12, candidate #3. The "debounced dual validation" the Context lists is gone: the hook derives `showCharacterValidation`, `showPatternValidation` and `isFormValid` from one `checkEntry` result per render, and the debounce (which re-checked against a stale translation) is deleted. The return shape and its one caller are unchanged, so nothing here bears on the split this ADR declined.
