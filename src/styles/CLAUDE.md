# src/styles — CSS Module Conventions

## File Placement

CSS modules live at `src/styles/ComponentName.module.css`, not co-located with components.

## Cross-Component Reuse

CSS module classes are cross-importable — scoping guarantees unique generated class _names_, not file-privacy. For visual parity with an existing component, `import otherStyles from '../ComponentX.module.css'` and reuse its classes directly rather than duplicating rules (e.g. `RulesManager.tsx` reuses `EnhancedVirtualizedDictionaryTable.module.css`'s `.metadataBadge`).

**A typo'd or wrong-file class reference resolves to `undefined` silently — no error, no visual difference until closely inspected.** Found: `RulesManager.tsx` imported `EnhancedVirtualizedDictionaryTable.module.css` as `dictStyles` and used `dictStyles.button` — but `.button` lives in `DictionaryManager.module.css`, not that file. The button rendered with base `<button>` styles only (missing padding/font-size/radius refinements) for a full session before being caught. When reusing a class cross-file, verify it actually exists in _that_ file (`grep '^\.className' path/to/File.module.css`), not just that the import resolves. **Confirmed once (2026-08-14).** A whole-repo scan on 2026-08-31 resolved 564 references with 0 unresolved, so this stays prose for want of a second instance — mechanize it as a scan test if one appears. Any such scan must read every class in a selector, not just the leading one: `.input.error` defines both, and a leading-class-only scan reports three false positives in `DictionaryEntry.tsx`.

**Same property, different referent: `var(--token)` naming a custom property nothing defines resolves to its fallback — or, with no fallback, to whatever is inherited — with no error.** Found 2026-09-17: `.readerPanel { background: var(--bg-color, transparent) }` (no such token; every Reader panel rendered transparent over the separator colour) and the command palette's `var(--muted-text-color)`. Tokens live in `src/index.css` (`--background-color`, `--surface-color`, `--text-color`, `--text-secondary`, `--text-muted`, `--border-color`, `--radius-lg`) — grep there before using one. Its colour variables are aliases of `@lhak/style` contract roles (`--lk-*`, from `vendor/lhak-style/dist/tokens.css`); new code reads `--lk-` roles directly, and any value the contract defines (type tokens too) is a fallback by token, never a copied literal: `var(--full-translation-line-height, var(--lk-reading-line-height))`, not `, 1.45)`. The exception is the Appearance vars (`--chinese-text-*`, `--full-translation-*`, `--character-only-*`, `--ui-font`), written at runtime and legitimately absent from every stylesheet.

## Class Name Collisions

**Before adding a new class name to a `.module.css` file (directly or via `composes`), grep that file for the name first** — a collision with a pre-existing same-named class silently merges both rules onto one generated class name (found: adding a modal `.header` clashed with an existing page-toolbar `.header` in the same file).

## Vitest Doesn't Compile CSS Unless a Test Asks — Run `vite build` After a `.module.css` Change

Vitest does not process CSS on import, so a stylesheet the build rejects can pass every test. A test that needs compiled module output calls Vite's `preprocessCSS` (see `__tests__/AnimationNames.test.ts`). Found 2026-11-12: `composes: input` written above the `.input` it names failed only in `vite build` (`referenced class name "input" in composes not found`): a local `composes` must follow the class it names.

## Modal Overlays

A new dialog uses the kit's `Dialog`/`DialogPopup` (`@lhak/style/react`), which brings the scrim, box, focus trap and motion; `MoveDialog` is the example. A kit overlay's content exists only while open, in a portal: a dialog or drawer its parent mounts to open and unmounts to close never plays its exit (keep `open` in state and call the parent's `onClose` from `onOpenChangeComplete(false)`, as `MoveDialog` does, or keep it mounted with an `open` prop, as `ChapterPanel` does), and the portal mounts its content a commit after `open` turns on, so an effect keyed on props finds its refs empty: focus or scroll inside it from a callback ref (`ChapterPanel`). A hand-rolled overlay that is not yet moved uses `composes: modalOverlay from './shared.module.css'` then adds per-component `background-color`/`padding`.

## Animations and Keyframes

- CSS Modules scopes `@keyframes` locally — `composes` does NOT work for keyframes.
- For shared animations, use `:global(@keyframes name) { ... }` in `shared.module.css`.
- **`fadeIn`, `slideUp`, `spin` and `pulse` are already global in `index.css`; `slideIn` in `shared.module.css`** — do not define local or `:global` duplicates anywhere. `AnimationNames.test.ts` fails on a keyframes name defined twice outside a reduced-motion block (TranslatorControls' local `fadeIn` and shared's `:global` one were removed, adoption ticket 17).
- **A module names a global keyframes as `animation: global(spin) …`.** CSS Modules renames every bare name in `animation`, so `animation: spin` becomes `_spin_<hash>`, which nothing defines, and the animation silently never runs (seven did, found 2026-11-13). `:global(spin)` is a parse error there. `__tests__/AnimationNames.test.ts` compiles each module through Vite and fails on a name with no keyframes.
- **`streaming-animations.css` is plain CSS (not a module)** — `@keyframes` defined there are global. Currently defines `streaming-blink` (used by `.typing-cursor`); the progress bar is the kit's `ProgressBar`. Do not rename them or add new ones to that file.

## A State Style Changes Colour, Never Box Metrics

An active, selected or highlighted state may change color, background and border _colour_, never weight, size, spacing or border _width_. Chips: `border: 'none'` on the active state of a chip whose inactive state is `1px solid` made every ticked chip (VAR, CHA, PRE, STAY) 2px shorter than an unticked one; keep the 1px border in the fill colour (`BadgeChip`, 2026-11-17). Virtualized text: a style the Reader toggles on a row (`.clickableSegmentHighlighted`) must not change weight, size or spacing either: a wider run can rewrap the line, which changes that row's measured height and moves every row below it — on a click, in a 75,000-line document. The Translator bolds its highlight because its panels hold one translation and reflow costs nothing there. Same family as `Reader.module.css`'s "no margins on a row": resize observations exclude margins, so a margin makes every row under-report its height.

## Hiding Elements — Use Conditional Rendering, Not `visibility: hidden`

`visibility: hidden` reserves flex layout space — invisible items shift siblings. For status pills/badges that should take no space when absent, use conditional rendering (`{cond && <div>}`) with a CSS `@keyframes` entrance animation (`animation: global(fadeIn) …` for a fade; a new local keyframes only when no global one fits).

CSS `transition` cannot fire on unmount — exit is always a hard cut with conditional rendering. Do NOT use `visibility: hidden` + `opacity: 0` to "hide" flex items.

Affected: `TranslatorControls.module.css` `.progressIndicator` uses `global(fadeIn)`.

## Grid Rows Aren't Shared Across Sibling Grid Containers

Each `display: grid` element is its own formatting context — `auto`-sized tracks size to that instance's own content, so two rows built as separate grid containers (e.g. a `<button>` per `<li>`) can end up with different column widths even with identical `grid-template-columns`; any `fr` track absorbs whatever's left over, so it drifts row to row. Give every non-title column (icons, badges, numeric fields) a fixed length instead of `auto`, or promote to a real shared grid (`display:grid` on the list + `display:contents` per row) if content-based sizing is required. Confirmed 2026-09-19: `Bookshelf.tsx`'s `.bookRow` — progress/size columns were `auto`, so title columns drifted per row.

## Bare `button`/`select`/`input` Inherit index.css's Global Rules, and a Shorthand Wipes Them

A native `<input type="checkbox">` takes the kit `Checkbox`'s look from `className="lk-checkbox"` (kit.css), keeping native `.checked`/`onChange` for tests; the Dictionary and Rules tables use it.

**Override a global control with longhands only.** `select` draws its chevron as a `background-image` and reserves `padding-right: 2.5rem`; a module's `background:` or `padding:` shorthand resets both, and the dropdown renders as a text input with no error (Candidate finder "Add to", 2026-10-25). Write `background-color` and `padding-right`, and re-set `background-position` if the padding changes.

The state rules are `element:pseudo` (0,1,1) and outrank a module class (0,1,0): `button:hover` repaints its background, `:active` translates it, `:focus-visible` adds the glow, `:disabled` sets opacity. Restate each under the class's own state (`.hotkeyHints:hover`, `:active`), as `TranslatorControls.module.css` does.

The base `button` rule (`index.css`) sets `align-items: center`, `justify-content: center`, `padding`, and `display: inline-flex` for every `<button>` in the app. A component styling a `<button>` as a custom flex/grid container (a card, a table row) must explicitly re-set every layout property it needs — setting only `flex-direction` lets `align-items:center` show through. Confirmed 2026-09-19: `.bookCard` set `flex-direction: column` but not `align-items`, so children shrank to content width and centered instead of stretching, which also broke the ellipsis/line-clamp sizing on the title text.

## Alpha-Blended Highlight Colors Need a Separate Dark-Mode Check

`color-mix(in srgb, var(--x) N%, transparent)` reads very differently over a light page background than a dark one — the same alpha that pops on white can be nearly invisible on dark. Check (or override under `:root[data-mode='dark']`) any new highlight/selection background rather than assuming one value works for both themes. Confirmed 2026-09-19: Reader's `.clickableSegmentHighlighted` used 28% for both themes; raised to 55% under dark.

**Dark mode is `<html data-mode="dark">`, never `@media (prefers-color-scheme: dark)`.** The `@lhak/style` ThemeProvider (`src/main.jsx`) writes the resolved mode there, from the user's pick in Appearance or the system. A media query follows the system only, so it shows dark rules on a light pick.
