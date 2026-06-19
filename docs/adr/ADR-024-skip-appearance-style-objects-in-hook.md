# ADR-024: Do Not Move Style Objects into useAppearanceSettings

**Status:** Decided  
**Date:** 2026-06-20

## Context

`Translator.jsx` contains four `useMemo` style objects:

- `sharedTextStyle` — shared base (deps: `[]`)
- `inputTextStyle` — extends shared, uses `var(--chinese-text-font/size/spacing)` (deps: `[sharedTextStyle]`)
- `outputTextStyle` — extends shared, uses `var(--full-translation-font/size/spacing)` (deps: `[sharedTextStyle]`)
- `characterOnlyTextStyle` — extends shared, uses `var(--character-only-font/size/spacing)` (deps: `[sharedTextStyle]`)

The 2026-06-20 architecture review (Candidate 3) proposed deepening `useAppearanceSettings` to also return these computed style objects, on the grounds that both the hook and the memos are part of the appearance→presentation pipeline.

## Decision

Do not add style objects to `useAppearanceSettings`. Do not merge or move the memos.

## Reason

**The premise is false.** The four `useMemo` calls do not derive from `appearance` state. They are CSS variable string references (e.g. `'var(--chinese-text-font, ...)'`) with effective dep arrays of `[]` — they are static constants that happen to live inside the component body.

The connection to `useAppearanceSettings` is indirect: `AppearanceManager.tsx` calls `useAppearanceSettings`, which writes CSS custom properties to `document.documentElement`. `Translator.jsx` consumes those vars as opaque strings in inline style objects. There is no shared state, no shared seam.

`useAppearanceSettings` is called exclusively from `AppearanceManager.tsx`, a different component subtree from `Translator.jsx`. Moving style objects into the hook would require either:

1. Calling `useAppearanceSettings` in `Translator.jsx` as well — duplicating the hook's state and its `window.electronAPI` load call, or
2. Lifting the hook into a React context layer — a larger architectural change with no bug-driven motivation.

Neither option is warranted. The `useMemo` wrappers themselves are unnecessary (all deps are `[]` or depend only on another `[]`-dep memo), but that is a minor cleanup, not a deepening.

## Revisit condition

Reopen if `Translator.jsx` ever needs to react to `appearance` state changes in component logic (not just via CSS vars) — that would create a real shared seam and justify a context-based solution.
