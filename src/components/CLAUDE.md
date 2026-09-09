# src/components — Gotchas

## Hotkey Architecture

`useHotkeyHandler` has two call sites — `TabbedInterface.tsx` (tab switching + Dictionary-tab shortcuts) and `Translator.jsx` via `<HotkeyHandler>` component (Translator-tab shortcuts). Add Dictionary-tab hotkeys to `TabbedInterface`, Translator-tab hotkeys to `HotkeyHandler` props. Key→action dispatch table lives in `src/utils/ui/HotkeyDispatchTable.ts` (`matchHotkey`) — add/change shortcuts there, not in the hook body.

**Option/Alt-modified digit hotkeys must match `event.code` (`'Digit1'`...), never `event.key`** — macOS remaps Option+digit to a different character per keyboard layout (Option+1 → `¡` on US layout), so `.key` matching silently breaks for most users; `.code` is the physical key, immune to modifier remapping.

**All `TabbedInterface` tabs are always mounted** (visibility toggled via CSS `visibility`, not conditional render) — so a hotkey pressed on one tab can imperatively trigger another always-mounted tab's component via a `forwardRef`/`useImperativeHandle` (see `RulesManagerHandle`, mirrors the older `dictionarySearchRef` precedent), without needing a second instance of that component's own state hooks. Any modal opened this way (target tab not switched to) must render via `createPortal(..., document.body)` — a plain nested overlay inherits `visibility: hidden` from the still-hidden tab-panel ancestor despite `position: fixed`.

## Memo-Regression Tests Need Their Own File

Testing "does React.memo actually skip a re-render" requires `vi.mock`ing the child with a spy double — but that mock also poisons any sibling test in the same file asserting the real child's rendered output (className, styles). Isolate into a new file (e.g. `SegmentedParagraphs.memoization.test.tsx` alongside `SegmentedParagraphs.test.tsx`) rather than mocking inside the existing behavioral test file.

## Testing components that use `react-resizable-panels`

`Panel`/`Group`/`Separator` construct `window.ResizeObserver` directly, unguarded — jsdom has none and `src/test/setup.ts` doesn't mock it. Mock the trio as trivial pass-throughs (`({children}) => <>{children}</>`) rather than rendering them for real. Found testing `TranslatorDisplayPanels.tsx`.

**Hook call order in `Translator.jsx`:** which hook's output feeds which other hook (e.g. `executionCtx`/`forceReloadCtx`'s multi-hook fan-in) is documented in-file, in the SECTION 2 banner comment near the top of `Translator.jsx` (architecture review 2026-07-30, candidate #4) — not just in this file's per-hook rules below.

## React Stale Dependencies

Never list frequently-updating state or callback props in a `useEffect` dep array that creates a `setInterval` or `addEventListener` — it recreates the subscription on every update. Use `const ref = useRef(value); ref.current = value;` and read `ref.current` inside the callback.

Known instances:

- `wasmStatus` interval (`Translator.jsx`) — dep array is `[enginePhase]`, ref used inside callback for status comparison
- Keydown listener in `useHotkeyHandler.ts` — dep array is `[]`; all props mirrored into one `optionsRef` (not per-prop refs, collapsed 2026-07-16), read as `optionsRef.current.X` inside the listener

**Also applies to `useCallback` with a mutable state dep**: a `Set` in state creates a new reference on every `setState` → the callback recreates on every update. Use a ref mirror; dep array → `[]`.

**State SET inside a `useEffect` must not be in its deps**: if a flag is reset inside the effect body and that same flag is in the dep array, the reset re-triggers the effect. `isClipboardTranslation` was the canonical example — now extracted to `useClipboardTranslation` as a ref (`isClipboardTranslationRef`), so this invariant no longer applies there.

**Testing `useHotkeyHandler.ts`'s clipboard quick-add path**: it calls `navigator.clipboard`/`window.getSelection` directly — NOT `window.electronAPI.readClipboard` (that's `useClipboardTranslation`'s path). jsdom has neither by default; stub both with `Object.defineProperty`/`vi.spyOn` before testing the quick-add dispatch cases.

## React State Updater Rules

**Never `throw` inside a state updater function** (`setState(prev => { throw ... })`): React 18 Concurrent Mode may call updaters multiple times; throws bypass the `await` chain. Do existence checks on the closed-over variable BEFORE `setState`.

**Never assign `let` variables inside an updater for use outside it**: the updater may run twice; always compute from the closed-over snapshot BEFORE `setState`. For undo/redo-style history, read a ref's `.current` directly instead of a plain closure variable (e.g. dictionary undo/redo uses `dictionariesRef.current`; `bulkDeleteEntries` computes `oldData`/`sortedDictionary` from the closed-over snapshot before calling `setDictionaries`).

## `ClickableTranslationOptimized` Paragraph Logic

Uses "break on every `\n`" (inline `useMemo`). Do NOT replace with `groupSegmentsIntoParagraphs` — that utility uses Chinese-indentation detection, incompatible with Vietnamese translated text.

Empty paragraphs (from consecutive `\n` in source text) are intentionally preserved so blank lines from the original Chinese render in the Vietnamese output. The `.paragraph` CSS rule sets `min-height: 1lh` to give empty `<div>`s visible height. Do NOT add an `if (currentParagraph.length > 0)` guard around the flush — that drops blank lines and causes the linebreak-fidelity regression versus the char-only path.

## Canonical Type Homes

Do not redeclare these locally:

- `ThrottledStreamingState` → `src/types/UITypes.d.ts`
- `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `src/types/DictionaryTypes.ts`

TypeScript does not narrow optional property accesses through `&&` spreads — `SemanticType` widens to `string`. Extract to a local variable or use imperative assignment (`if (metadata.semanticType) entry.semanticType = metadata.semanticType`).

An inline array literal passed to a generic component's prop (`<Foo<T> options={[{value:'x',...}]} />`) widens narrow-union `value` fields to their base type (e.g. `string`) unless the array carries `as const` — compiles fine standalone, fails only at the generic call site.

## Renamed Exports — Grep `Translator.jsx` After Any Rename

`Translator.jsx` is JavaScript — `type-check` will not catch stale imports there. Always grep it after renaming exported functions from utilities. Known renames:

- `validateApiResult` (was `validateElectronResult`) in `configValidation.ts`
- `validateRawDictionaryEntry` (was `validateDictionaryEntry`) in `configValidation.ts` — renamed to avoid collision with same-named function in `DictionaryTypes.ts` (different signature). Do NOT revert.

## `.tsx` Prop Types for `.jsx` Callbacks Can Silently Drift

A `.tsx` file's locally-declared prop type for a value that's really a `.jsx` function (e.g. `Translator.jsx`'s handlers) isn't checked against the real implementation — `checkJs: false` means only a `.jsx`-side JSDoc mismatch is invisible too. These drift silently until something removes whatever permissive type was tolerating the mismatch (e.g. narrowing a union). After narrowing any handler/callback type, run `pnpm type-check` and expect to find stale declarations in `.tsx` callers, not just the type's own definition site.

## Engine Lifecycle — `useTranslatorEngine` Hook

Engine init, config load, and reinit are owned by `src/hooks/useTranslatorEngine.js`. Do NOT inline these back into `Translator.jsx`.

The hook exposes `{ enginePhase, engineRef, initError, activeProperNounsFromConfig, reinitialize }`:

- `enginePhase` — `'loading' | 'ready' | 'error'`. Replaces `engineInitialized` + `configLoaded` flags.
- `engineRef` — ref to current engine instance (or null).
- `initError` — error string when `enginePhase === 'error'`, else null.
- `activeProperNounsFromConfig` — loaded from disk once on mount; use directly in `Translator.jsx` (no sync hook needed).
- `reinitialize(rawDicts, options)` — never throws; errors go to `enginePhase`/`initError`. Pass raw (unfiltered) dicts; the hook filters internally. Pass `forceConfigReload: true` to re-read config from disk — do NOT call `invalidateAppConfig`/`loadAppConfig` in the caller. For non-React callers (adapters outside the component tree), check `engineRef.current?.isReady()` after `await reinitialize(...)` to determine success — `enginePhase` state is async and not directly readable from adapters.

**Race condition**: `reinitialize` sets `isInitializingRef.current = true` synchronously on entry and the hook's init effect checks `enginePhase === 'loading' && !isInitializingRef.current`. `handleForceReload` must NOT set any separate lock — `reinitialize` handles it.

**Config load**: `useTranslatorEngine` calls `loadAppConfig()` once on mount (cached). For `handleForceReload`, pass `forceConfigReload: true` to `reinitialize` — do NOT call `invalidateAppConfig`/`loadAppConfig` directly in `Translator.jsx`. More generally: use `loadAppConfig()` from `utils/appConfig.ts` everywhere — never call `window.electronAPI.loadConfiguration()` directly, it returns raw unvalidated data with absent/wrong-typed defaults. `saveAppConfig()` is the sole writer to config disk anywhere in `src/` (verified 2026-07-24) — this is what makes the cache safe to trust in-session; before adding any new `window.electronAPI.loadConfiguration`/`saveConfiguration` call site, grep for existing ones first (`DictionaryManager.tsx` was the last direct-call violator, fixed 2026-07-24).

**`useDictionaryReloadGuard`**: `consumeReloadTransition()` must be called ONCE at the TOP of `loadAndTranslate` before any early returns — reads prev reload state, updates internal ref, and returns `justFinishedReloading` atomically. Calling it after any early return skips the ref update and breaks reload-skip detection.

**Never reach into `engineRef.current.translationSegments`** (or other engine-private arrays) from `Translator.jsx` — the engine enforces its own memory invariants (see `src/utils/CLAUDE.md`'s segment-cleanup entry). A caller-side watchdog for this was deleted 2026-07-24.

**Priority scheme**: defined as `ENGINE_PRIORITIES` constant in `useTranslatorEngine.js` and exported. Pass to both `reinitialize()` and the hook's own init — any change to priorities must be made there only.

**Post-ready setup** (engine stats, debounced callbacks, dev tools): done in a `useEffect([enginePhase])` in `Translator.jsx` — fires on every transition to `'ready'`, including after `reinitialize`.

**`cancelAllTranslations` return shape** (from `useTranslationController`): returns `{ count: number, cleanupComplete: Promise<void> }` — NOT a direct Promise. Adapter pattern: `const { count, cleanupComplete } = cancelAllTranslations(); if (count > 0) await cleanupComplete;`. Never `await cancelAllTranslations()` directly — it returns a plain object, the await resolves immediately without waiting for cleanup.

## ConfigurationManager Settings Must Be Traced to the Engine

`saveAppConfig` → `loadAppConfig` → `TranslationEngine.js` options → `WasmDictionaryManager._doInitialize(_config)`. The `_config` param is discarded (underscore = unused) — settings reach `appConfig.ts` correctly but die at WASM init. Wire new WASM-related config through `EnhancedDictionaryManager` constructor options instead.

## `showReadinessOverlay` Must Not Short-Circuit on `initializationError`

When engine init fails: `initializationError` is truthy AND `enginePhase === 'error'` (not `'ready'`). Adding `!initializationError` to the condition hides the overlay and lets users interact with a broken engine. Correct condition: `!loadError && (isLoading || enginePhase !== 'ready')`.

## `useHighlightingState` Hook — Highlighting State Not in Translator

`highlighting` (useReducer), `clearHighlighting`, `validateSemanticArraySize`, and 5 named action methods (`highlightOriginal`, `highlightTranslation`, `highlightBoth`, `highlightFromCharacterOnly`, `setCharacterOnlyIndex`) live in `src/hooks/useHighlightingState.ts`. Do NOT use raw `dispatch` — call the named methods. `highlightScrollTimeoutRef` is NOT in the hook — used in 10+ scroll-callback sites in Translator and stays there. `useCharacterOnlyBridge` owns the Character-Only bridge pipeline (guards, bounds check, `findCharacterOnlyMatch`, `setCharacterOnlyIndex` dispatch, 10ms scroll-to-element) — do NOT re-inline these effects into Translator.jsx.

`MAX_SAFE_SEGMENTS` and `HIGHLIGHT_SCROLL_DELAY_MS` live in `src/utils/highlighting/semanticArrayConstants.ts`, re-exported from the highlighting barrel. Translator.jsx, useHighlightingState.ts, and TranslationEngine.js all import the constant from the barrel (`utils/highlighting`), not the deep `semanticArrayConstants` path (architecture review 2026-08-15, candidate #5) — do NOT redefine or move back to the hook.

`setCharacterOnlyIndex` accepts `number | number[]` — pass `-1` (or array of `-1`) to clear.

## `useCachePoisoningGuard` Hook — Cache Poisoning State Not in Translator

Returns `{ poisoning: PoisoningEvent | null, dismiss }` from `src/hooks/useCachePoisoningGuard.ts`. `poisoning` is null when no event has fired (or after dismiss); non-null holds `{ count, recommendation }`. Hook fires `toast.error` internally on each Tauri event — do not fire toast in the caller. `Translator.jsx` has no direct `@tauri-apps/api/event` import. Hook injects `listenFn = listen` as a default param for testability.

## `useTranslationResults` Hook — Translation Output Fields

`translatedText`, `characterOnlyText`, `semanticArrays`, `characterOnlySemanticArrays`, `prebuiltSegments` are owned by `src/hooks/useTranslationResults.js`. Do NOT set these directly in `Translator.jsx` — use named ops only. `setError`/`setStatusMessage` both clear all arrays atomically (fixes stale-highlight when error text replaces a real result). `clearFullResult` clears full-translation fields only, leaves charOnly intact. `setResultArrays(arrays, segs)` updates arrays without touching text (progressive path: `debouncedProgressHandler` sets text, segmenter sets arrays separately). Destructured as `setTranslationError` in `Translator.jsx` to avoid name collision with a local `setError`. In paths that call `translateText` directly (e.g. reload fallback), use `setStreamingText` for the result text — `translateText` already calls `setResultArrays` internally; `setFullResult(text, null)` wipes those arrays.

## `useStreamingTranslation` Hook — Streaming State

Progressive batch state in `src/hooks/useStreamingTranslation.js`. Use `throttledStreamingState` (100ms throttled) for UI — raw `streamingTranslation` was removed (session 70). Write ops: `updateStreaming(partial)`, `resetStreaming()`, `setProgressInfo(info|null)`, `setPartialSemanticArrays(arrays|null)`. `INITIAL_STATE`, `INITIAL_STREAMING`, `streamingReducer` are module-private (unexported since session 78). Pure reducer tests were removed at that time — behavior is covered by the hook integration tests.

## Error Utilities

Use `extractErrorMessage(error)` (`src/utils/errors/errorHelpers.ts`) instead of `error instanceof Error ? error.message : 'Unknown error'` — the inline form misses `string`, `{ message }`, and `null` inputs.

## Appearance Style Memos — Static Constants

`sharedTextStyle`, `inputTextStyle`, `outputTextStyle`, `characterOnlyTextStyle` in `Translator.jsx` use CSS variable string values (e.g. `'var(--chinese-text-font, ...)'`) with deps `[]` — static constants, not derived from `appearance` state. `useAppearanceSettings` is called only from `AppearanceManager.tsx`. Do not move these into the hook. See ADR-024.

## Table Toolbar Building Blocks — `SearchFilterHeader.tsx`

`SearchFilterHeader` (search box + filter-toggle button + `trailingActions` slot) and `FilterPanel` (filter-dimension wrapper shell, `open`-gated) live flat in `src/components/SearchFilterHeader.tsx`, shared by `RulesManager.tsx` and `EnhancedVirtualizedDictionaryTable.tsx`. Both are presentational — search/filter-open state stays owned by the caller. This is the 5th confirmed instance of the same table-toolbar duplication drift `dictionary/CLAUDE.md`'s `RowShell`/`MetadataBadge`/`SemanticTypeFilterChips` entry tracks (search input + filter-button style/color-mix logic + filter-panel wrapper were independently hand-copied between the two files). Import and reuse these rather than re-deriving the same inline styles in a new table-shaped view.

**6th instance found and closed 2026-09-09** (architecture review candidate #5 grilling): `FilterDimensionRow` (same file) is now the single owner of one labeled filter dimension's markup inside a `FilterPanel` — the `<div style={{display:'flex',...}}><span style={{...label style...}}>LABEL:</span>{chips}</div>` wrapper was hand-copied 4 times in `EnhancedVirtualizedDictionaryTable.tsx` (Pattern/Flags/Variable/Type), plus a 5th, narrower instance in `RulesManager.tsx` that shared only the label-span style (no wrapping div, since a single-dimension panel has nothing to wrap-group against `FilterPanel`'s own `flexWrap`). Both now call `FilterDimensionRow` — a real 2nd caller-file existed already, unlike a purely hypothetical one-file dedup.

## Global Singleton Lifecycle — `performanceHealth` / `systemPerformanceMonitor`

`performanceHealth.startMonitoring()` and `performanceHealth.destroy()` are owned exclusively by `App.jsx`. Do NOT call `destroy()` in `Translator.jsx` or any child component — Translator unmounts before App, causing double-destroy on a live singleton. App's cleanup effect is the sole teardown site.
