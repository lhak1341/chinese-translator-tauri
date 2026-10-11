# ADR-103: Keep the Default-Dictionary Toggle and the Name Step in the Config Hook

**Status:** Decided
**Date:** 2026-10-11

## Context

An architecture review (2026-10-11, candidate #2) proposed moving two things out of `useDictionaryConfigManagement.ts` into pure functions: the Cmd-5 default toggle ("clicking the current default unsets it", `current.ui.defaultQuickAddDictionary === dictionaryId ? null : dictionaryId`, inside a `transformAppConfig` callback) into `BindingActivation.ts`, and the `dictionaryNameProblem` then `toProperNounsDictionaryId` pair, written at both the create and rename handlers, into one "name to id or problem" function.

## Decision

Keep both where they are.

- **The toggle is one ternary.** An extracted function would be nearly as wide as its body, so it would be shallow: by the deletion test, deleting it inlines one line back at the one call site. The `isDefaultLocked` guard that sits beside it is a real rule with a derived view behind it (`configurationBindingView`); the toggle has no such weight.
- **The rule is already tested.** `useDictionaryConfigManagement.binding.test.tsx` drives the default lock, toggles made before the first save resolves, and the Cmd-5 default while a book bound to fiction is open. Rendering the hook is a cost that file pays anyway.
- **The name step has two sites in one file.** Both functions are already pure and live in `DictionaryIdClassifier.ts`. Deriving the id twice is cheap, and the IPC wrappers re-check with `isValidDictionaryId`, so a handler that skipped `dictionaryNameProblem` is still refused.

## Consequence

A review that proposes either extraction again should show a second caller of the rule (a keyboard shortcut or a context menu that also sets the default; a third form that names a dictionary), or a bug the hook tests missed. Until then the hook owns both.
