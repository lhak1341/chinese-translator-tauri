# ADR-063: Skip a Hotkey Chord Module

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #2, `Strong`) proposed one action-to-chord fact that `matchHotkey` and a `hintFor(action)` both read, on the grounds that the palette's hint strings are checked only against literals, so changing a binding would pass every test while the palette lied.

Reading the code in the grilling, the gap does not exist:

- `PaletteCommands.test.ts` ("hints match what the dispatch table actually does") parses every hint back into the keypress it describes and pushes it through `matchHotkey`. A second test asserts every action row has a hint.
- `ReaderEngineErrorBanner.test.tsx` does the same for `RELOAD_HINT`.
- `src/components/CLAUDE.md` records this as the design: anything that displays a binding is asserted against `matchHotkey`, and the bindings themselves stay pinned literally in `HotkeyDispatchTable.test.ts` on purpose, because they live in muscle memory.
- The remaining display strings are prose or single-tab labels (`BookReader`'s `[` and `]` button titles, the `Cmd/Ctrl+1-5` Add Entry title, the `⌘↩` Save labels, the `useHotkeyHandler.ts` JSDoc, `docs/HOTKEYS.md`). None is a table the palette or a dispatch reads.

## Decision

Do not build a chord module. Display sites keep their own spelling and the parity tests that already exist.

## Reasoning

**The deletion test fails for the proposed module.** `matchHotkey` is a hand-written switch with each action's tab rule, `event.code` matching for Option+digit, and the `canUndo`/`canRedo` gates interleaved. A chord fact the switch reads would have to carry key, modifiers and tab rule per action, which is nearly `matchHotkey` over again. Deleting it would move almost nothing back to the callers. Making it data-driven would also remove the property the literal pins exist for: a reorder fails a test instead of silently following the array.

**It is not ADR-012 either way.** It touches no handlers and no `when` predicates. It is skipped on its own merits.

## Consequence

A future review that sees hint strings next to `matchHotkey` should not re-propose a chord module from that alone. If a binding is shown somewhere new that a test cannot reach (a second palette, generated docs), pin that surface with a parse-back test like the palette's. Revisit if `matchHotkey` gains a second reader of its bindings, which would give the table a second caller.
