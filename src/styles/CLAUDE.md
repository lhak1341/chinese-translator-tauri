# src/styles — CSS Module Conventions

## File Placement

CSS modules live at `src/styles/ComponentName.module.css`, not co-located with components.

## Cross-Component Reuse

CSS module classes are cross-importable — scoping guarantees unique generated class _names_, not file-privacy. For visual parity with an existing component, `import otherStyles from '../ComponentX.module.css'` and reuse its classes directly rather than duplicating rules (e.g. `RulesManager.tsx` reuses `EnhancedVirtualizedDictionaryTable.module.css`'s `.metadataBadge`).

**A typo'd or wrong-file class reference resolves to `undefined` silently — no error, no visual difference until closely inspected.** Found: `RulesManager.tsx` imported `EnhancedVirtualizedDictionaryTable.module.css` as `dictStyles` and used `dictStyles.button` — but `.button` lives in `DictionaryManager.module.css`, not that file. The button rendered with base `<button>` styles only (missing padding/font-size/radius refinements) for a full session before being caught. When reusing a class cross-file, verify it actually exists in _that_ file (`grep '^\.className' path/to/File.module.css`), not just that the import resolves. **Confirmed once (2026-08-14).** A whole-repo scan on 2026-08-31 resolved 564 references with 0 unresolved, so this stays prose for want of a second instance — mechanize it as a scan test if one appears. Any such scan must read every class in a selector, not just the leading one: `.input.error` defines both, and a leading-class-only scan reports three false positives in `DictionaryEntry.tsx`.

**Same property, different referent: `var(--token)` naming a custom property nothing defines resolves to its fallback — or, with no fallback, to whatever is inherited — with no error.** Found 2026-09-17: `.readerPanel { background: var(--bg-color, transparent) }` (no such token; every Reader panel rendered transparent over the separator colour) and the command palette's `var(--muted-text-color)`. Tokens live in `src/index.css` (`--background-color`, `--surface-color`, `--text-color`, `--text-secondary`, `--text-muted`, `--border-color`, `--radius-lg`) — grep there before using one. The exception is the Appearance vars (`--chinese-text-*`, `--full-translation-*`, `--character-only-*`, `--ui-font`), written at runtime and legitimately absent from every stylesheet.

## Class Name Collisions

**Before adding a new class name to a `.module.css` file (directly or via `composes`), grep that file for the name first** — a collision with a pre-existing same-named class silently merges both rules onto one generated class name (found: adding a modal `.header` clashed with an existing page-toolbar `.header` in the same file).

## Modal Overlays

Use `composes: modalOverlay from './shared.module.css'` then add per-component `background-color`/`padding`.

## Animations and Keyframes

- CSS Modules scopes `@keyframes` locally — `composes` does NOT work for keyframes.
- For shared animations, use `:global(@keyframes name) { ... }` in `shared.module.css`.
- **`spin` and `pulse` are already global in `index.css`** — do not define local or `:global` duplicates in any module file or `shared.module.css`; `animation: spin/pulse` falls back naturally.
- **`streaming-animations.css` is plain CSS (not a module)** — `@keyframes` defined there are global. Currently defines `progress-pulse` (used by `.streaming-progress-pulse`) and `streaming-blink` (used by `.typing-cursor`). Do not rename them or add new ones to that file.

## Hiding Elements — Use Conditional Rendering, Not `visibility: hidden`

`visibility: hidden` reserves flex layout space — invisible items shift siblings. For status pills/badges that should take no space when absent, use conditional rendering (`{cond && <div>}`) with a CSS `@keyframes` entrance animation defined locally in the component's `.module.css` file.

CSS `transition` cannot fire on unmount — exit is always a hard cut with conditional rendering. Do NOT use `visibility: hidden` + `opacity: 0` to "hide" flex items.

Affected: `TranslatorControls.module.css` `.progressIndicator` / `.activeBadge` use `@keyframes fadeIn`.
