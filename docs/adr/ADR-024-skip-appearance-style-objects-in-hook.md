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

**2026-10-03 addendum (architecture review round 6, candidate #6 grilling).** Re-examined how appearance reaches the Reader: `applyAppearanceToCssVars` is called from `App.jsx` (startup load) and `useAppearanceSettings` (a `DEFAULT_APPEARANCE` apply on mount, then the loaded settings, then each edit), and `useAppearanceVersion` learns of it through a `MutationObserver` on `<html style>`, one observer per consumer instance (`useColumnMetrics`, `useReadingAnchor`). Declined to change any of it. The end state of the startup applies agrees, `AppearanceReducer.ts` is the only writer to `documentElement.style` (so "any style write bumps the version" is theoretical), and a spurious startup bump only re-measures (`ReadingAnchor.appearanceChanged` defers while the panel is hidden). Replacing the observer with an explicit publish from the apply function would move about 10 tested lines into a module-level store without removing complexity, and no bug was found. Revisit if a real wrong-measurement bug traces to a missed or spurious bump, or if the Translator starts reacting to appearance in component logic (the condition above).

**2026-10-09 addendum (architecture review round 23, candidate #1 grilling).** Proposed again as "give Appearance one owning module", citing the same startup applies and the `DEFAULT_APPEARANCE` write; declined again. The duplicate `loadAppearanceConfig` call is a `createAppFile` cache hit, not a second disk read. Deleting `App.jsx`'s own load was also declined: `AppearanceManager` is mounted unconditionally (`TabbedInterface.tsx:148`), but the `App.jsx` load keeps startup appearance independent of that mount policy for the price of a cached read.

**2026-11-24 note (architecture review round 46, candidate #2).** `useAppearanceSettings` no longer applies `DEFAULT_APPEARANCE` on mount: it renders `appearance.json` through `useAppFile` and writes the CSS variables only once the file has loaded or failed, so the 2026-10-03 addendum's "a `DEFAULT_APPEARANCE` apply on mount" describes the hook as it was. `App.jsx`'s startup apply and the `MutationObserver` are unchanged, and the decisions above stand.
