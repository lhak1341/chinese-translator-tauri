# ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler

**Status**: Accepted
**Date**: 2026-05-22
**Decision Makers**: Development Team
**Affected Components**: `src/hooks/useHotkeyHandler.ts`, `src/components/TabbedInterface.tsx`, `src/components/Translator.jsx`

## Update (2026-07-28)

`useHotkeyHandler.ts` is now 168 lines (was 264), and the "13 ref mirrors" pattern was collapsed into a single `optionsRef` mirroring one options object (2026-07-16) — per CLAUDE.md: "`useHotkeyHandler(options)` now takes one options object (not destructured)... do not reintroduce per-prop `useRef` pairs." The key-dispatch table was also extracted to `src/utils/ui/HotkeyDispatchTable.ts`. The decision itself is unaffected — still exactly 2 call sites (`TabbedInterface.tsx`, `Translator.jsx` via `<HotkeyHandler>`), confirmed unchanged. Only the internal implementation details below (line count, ref pattern) are stale.

## Context and Problem Statement

`useHotkeyHandler` (264 lines) serves two call sites with 13 callbacks and 13 ref mirrors. A `HotkeyRegistry` pattern was proposed — a hook accepting `{ when, handler }` registrations so each feature owns its hotkeys without touching a central file.

## Decision Drivers

- **Only 2 stable call sites**: The registry pattern pays off when N≥3 call sites or when the central hook is frequently edited. Neither condition holds — 2 call sites have been stable.
- **`activeTab` conditional routing**: 7 of 13 hotkeys fire conditionally based on active tab. Registry callers must close over `activeTab` in their `when` predicates — this works but adds closure boilerplate at every registration site.
- **`handleQuickAdd` shared behavior**: 5 quick-add hotkeys share clipboard-copy logic. This doesn't fit a pure registry; it would need extraction to a utility that all 5 callers import.
- **No real friction**: The 264-line hook is not causing bugs, missed hotkeys, or wrong-tab misfires. Pain is theoretical.

## Alternatives Considered

### Alternative 1: Full HotkeyRegistry ✗ Rejected

`useHotkeyRegistry({ when, handler }[])` — pure dispatcher owning only the input-field guard and ref-mirror pattern. Each call site registers its own hotkeys with tab-conditional `when` predicates.

Rejected: over-engineered for 2 stable call sites; `handleQuickAdd` boilerplate escapes the registry; `activeTab` closes over at every registration site.

### Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected

Two ~100-line focused hooks, one per domain. Solves testability in isolation; eliminates mixed-domain coupling in one file.

Rejected: theoretical gain, no real friction from current mixing, 3-hour refactor not justified.

### Alternative 3: Keep useHotkeyHandler ✅ Selected

Single hook, two call sites, one `keydown` listener per call site (already the case). Ref-mirror pattern prevents stale closures. TypeScript interface catches wrong/missing props.

## Decision

Keep `useHotkeyHandler` unchanged. Revisit if a third call site appears or if the mixed-domain coupling produces actual bugs.

## Consequences

### Positive

- ✅ No refactor of a working, stable hook
- ✅ Single `handleKeyDown` body — easy to trace key dispatch

### Negative

- ❌ Adding a hotkey still requires editing the central 264-line file
- ❌ Translator-tab and Dictionary-tab logic co-located in one module

### When to Revisit

- A third call site for hotkeys appears — registry pays off at N≥3
- Tab-conditional bugs emerge from mixed-domain coupling in the central hook

## References

- Hook: `src/hooks/useHotkeyHandler.ts`
- Call sites: `TabbedInterface.tsx` (tab switching + dictionary shortcuts), `Translator.jsx` via `<HotkeyHandler>` (translator shortcuts)
- CLAUDE.md: hotkey architecture note (two-call-site split is intentional)

## Addendum (2026-09-26): the revisit trigger fired — answered with ownership, not a registry

Both triggers under "When to Revisit" had fired. There were four call sites (`TabbedInterface.tsx`, `Translator.jsx`, `reader/BookReader.tsx`, `dictionary/DictionaryManager.tsx`), and a tab-conditional bug had surfaced. The rule for which tab may fire a key lived in three places: `matchHotkey`, the hook's `QUICK_ADD_TABS`/`NEW_RULE_TABS`, and whatever `activeTab` each caller chose to pass. `DictionaryManager` passed `'dictionary'` unconditionally while every tab stays mounted, so Cmd+Z on the Translator or Reader undid the last dictionary edit. Cmd+Shift+V had no tab rule at all, so on the Reader it started a translation in the hidden Translator — beside the Reader's engine queue, which only the tab gate keeps apart from the Translator's calls.

The registry this ADR rejected is still rejected: its `when` predicates would have put the tab rule back at every call site. Instead:

- `VisibleTabProvider` (`src/components/VisibleTabContext.tsx`) holds the visible tab, moved up from `TabbedInterface`'s local state. The hook reads it and throws without a provider; no caller passes it.
- Each registration declares `ownTab: TabId | 'app'`.
- `matchHotkey` receives `{ visibleTab, ownTab }` and owns every rule: a registration answers only while its owner is visible (or it is `'app'`), then each action's own tab rule applies. Undo/redo fire on the Dictionary tab only; Cmd+Shift+V on the Translator only. `QUICK_ADD_TABS`/`NEW_RULE_TABS` moved from the hook into the table.

Ownership is also what keeps two registrations from both answering one key (Cmd+R on the Reader must reload once), which per-caller `activeTab` did implicitly by the hidden caller passing nothing. Pinned by the `ownership` rows in `HotkeyDispatchTable.test.ts` and the two-registration test in `useHotkeyHandler.test.ts`.

Revisit a registry only if registrations start needing rules the table cannot express from `(key, visibleTab, ownTab, canUndo, canRedo)` alone.
