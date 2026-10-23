# ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook

**Status:** Decided
**Date:** 2026-10-05

## Context

An architecture review (2026-10-05, candidate #3) read "which dictionary does an Add open on" as decided in three places — `useDictionaryModals`, `TabbedInterface` and `DictionaryManager` — with only the hook applying the remembered shortlist pick, and asked for one pure resolver next to `QuickAddTarget`.

## Decision

Do not extract it. The remembered-pick read (`useDictionaryModals.tsx`, `openQuickAddShortlist`) and write (`changeDictionary`) stay in the hook.

## Reasoning

**The three places do not decide the same thing.** Cmd-5 and Cmd-6 already have one rule, `quickAddTarget`; its two consumers are the hook's Add opener and `dictionaryTabNavigation`, which `TabbedInterface` calls. Cmd-3 and Cmd-4 on the Dictionary tab select the `properNouns` or `patterns` table outright, which is a different question from which dictionary an Add opens on (GLOSSARY.md, "Quick-add target"). `DictionaryManager.tsx` only filters its dropdown through `quickAddChoices`; it never picks an Add's dictionary.

**The rule is about six lines.** The read is "use the remembered id if it is on the shortlist, else the first id"; the write is "remember a pick only when it is on the shortlist". Moving them relocates the lines; no caller gets simpler.

**The behaviour is already pinned.** `useDictionaryModals.test.js` has three tests for it, through the hook's own interface with an injected memory: the next Cmd-3 opens on the last pick while Cmd-4 remembers separately, a pick off the shortlist is not remembered, and a remembered pick no longer active falls back to root.

**The rest was done by earlier rounds.** One view loader for every surface (`loadQuickAddView`, 2026-09-29) and `dictionaryTabNavigation` (2026-10-01) are the two extractions this candidate described.

## Consequence

Future architecture reviews should not re-propose a quick-add open resolver. Revisit if a second surface needs the remembered pick, or if a bug appears in how the hook applies it that the three tests do not catch.
