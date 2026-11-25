# ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods

**Status:** Decided  
**Date:** 2026-06-21

## Context

The 2026-06-21 architecture review (Candidate 2) flagged `useDictionaryEntryForm` for returning five raw React state setters: `setTranslation`, `setAllowAsPatternVariable`, `setLowPriority`, `setSemanticType`, `setAllowedVariableTypes`. The report argued these allow callers to bypass validation and duplicate-entry detection.

The proposed deepening: replace the five raw `React.Dispatch<SetStateAction<T>>` setters with named action methods (`updateTranslation(v)`, `toggleAllowAsPatternVariable()`, etc.) so invariants could be enforced at mutation time rather than only at submit time.

## Decision

Do not replace the raw setters with named action methods. The interface is appropriate for its role.

## Reason

**The bypass claim is false.** Grilling the hook revealed two facts:

1. **Duplicate-entry detection is source-keyed, not translation-keyed.** `checkForExistingEntry` scans all dictionaries for `dictionary[source]`. It fires in `handleTranslationFocus` (when the user tabs into the translation input), not in any effect watching `translation` state. Calling `setTranslation` directly does not affect whether a duplicate is detected — the check would not run regardless.

2. **No per-mutation invariants exist for the metadata fields.** `setAllowAsPatternVariable`, `setLowPriority`, `setSemanticType`, `setAllowedVariableTypes` feed directly into `handleSubmit`'s metadata object construction. There are no constraints that must be enforced on individual boolean/enum writes — validation runs at submit time via `validateCharacterEntry`, `validatePatternEntry`, and `validateDictionaryEntry`.

**Deletion test confirms shallow gain.** Replacing the five setters with named methods would concentrate zero complexity: no invariants become enforced, no bugs become impossible. The only gain is type narrowing at the sub-component seam — `SemanticTypePicker` and `WordTransformToolbar` would receive `(v: T) => void` instead of `React.Dispatch<SetStateAction<T>>`. This is cosmetic; the sub-components already receive the correct value types at runtime.

**The wide interface is correct.** The 22 return fields each have a real caller in `DictionaryEntry.tsx`. The hook is the form protocol for a dialog with many independently togglable fields (source, translation, dictionary type, two boolean flags, a semantic type, a variable-type map, two refs, six handlers). Width here reflects the domain, not a design failure.

## When to Revisit

If a new mutation path emerges where the order of field writes matters (e.g., changing `activeDictionary` must also clear `semanticType` and `allowedVariableTypes` atomically), and that ordering bug reaches production, named action methods become the right fix. The trigger is an actual bug caused by a caller writing fields in the wrong order.

## Addendum 2026-11-26 (architecture review round 47, candidate #1)

`checkForExistingEntry` is gone: the notice is derived from `findExistingEntry` (`src/utils/dictionary/ExistingEntry.ts`, GLOSSARY.md "Existing entry") over the source asked about on translation focus. Reason 1 above still holds: detection is source-keyed and still triggered by that focus. The raw setters stay.

The "When to Revisit" trigger was checked and is not met. A dictionary switch still does not clear `allowedVariableTypes`, and `prepareEntry` (`DictionaryEdit.ts`) keeps them for any non-lookup kind, so X/Y limits ticked on a pattern could in principle be saved on a phrase or proper noun. Measured over the 127 production dictionaries: 0 phrase or proper-noun entries carry `allowedVariableTypes` (2,301 pattern entries do). Revisit when one does.
