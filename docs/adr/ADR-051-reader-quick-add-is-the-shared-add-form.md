# ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar

**Status:** Decided
**Date:** 2026-09-27

## Context

The Reader spec (#21, "Interaction model") asked for quick-add as "a floating bar in the reading view, appearing on selection, dismissed with Escape, naming its target dictionary inline." What shipped is different. The reader selects text, then presses an Add key (Cmd-1..6) or picks an Add row in the command palette. That opens the same `DictionaryEntry` form the Translator and the Dictionary tab use, as a modal over the reading view, with its target dictionary in a dropdown. Nothing appears on selection alone.

The spec's own constraints are met: the Add never leaves the reading view, it names the dictionary the entry lands in, and the shortcuts are the Translator's (story 34). The difference is the trigger (a key, not the selection) and the shape (the shared form, not a Reader-only bar). Until now the divergence was recorded nowhere, so the spec reads as if a floating bar were still owed.

## Decision

Keep the shared form. Do not build a Reader-only floating bar.

## Reasoning

**One form means the Add rules live once.** Everything the Add decides is written once and shared by all three surfaces:

- where the entry goes (`quickAddTarget`, one rule for the Translator, the Dictionary tab and the Reader);
- which dictionaries the dropdown offers (`quickAddChoices`);
- what the Add starts from (`resolveQuickAddSource`);
- the Transform Rule guess for the translation.

A Reader-only bar would be a second copy of all of it. The quick-add work of 2026-09-26 shows what that costs: a second copy of the target decision existed in the Reader then, drifted from the Translator's, and was deleted (see `deleted-symbols.md`, `QuickAddTargetResolver.ts`).

**The key is the trigger the spec already required.** Story 34 asks for the Translator's quick-add shortcuts, so a key press was always going to open the Add. The selection is what the Add starts from, not a signal to open something.

**The form is where the keyboard-entry design went.** The Add and new-rule forms were redesigned around quick keyboard entry (`5fc5260`). A bar would have to repeat that design, or offer less.

## Consequence

A spec reader filing "build the floating bar" as an open gap should find this ADR instead. Reconsider only if the Add form stops fitting the reading view, for example if it starts covering the line being read so that the reader can't check the entry against its context. Even then, change where the shared form is positioned rather than building a second form.
