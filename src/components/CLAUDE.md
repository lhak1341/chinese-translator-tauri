# src/components — Gotchas

## Hotkey Architecture

`useHotkeyHandler` has three call sites — `TabbedInterface.tsx` (tab switching + Dictionary-tab shortcuts), and `Translator.jsx` and `reader/BookReader.tsx` via the `<HotkeyHandler>` component (their own tab's shortcuts). Add Dictionary-tab hotkeys to `TabbedInterface`, per-tab ones to that tab's `HotkeyHandler` props. **Every call site is listening at once** — each passes its own tab id (and `undefined` while it is the background tab), so tab identity is the only thing stopping two of them answering the same key; a handler registered without that gate fires from a hidden tab. Key→action dispatch table lives in `src/utils/ui/HotkeyDispatchTable.ts` (`matchHotkey`) — add/change shortcuts there, not in the hook body. The one thing that stays in the hook is **which tabs a quick-add-shaped action is allowed on** (`QUICK_ADD_TABS`/`NEW_RULE_TABS` in `useHotkeyHandler.ts`): `matchHotkey` is pure and cannot know whether a callback is wired, and these actions share one clipboard-copy path rather than one key. **Tab shortcuts are the exception: `src/constants/tabs.ts`'s `TAB_ORDER` is their single source** — the nav bar and `Option/Alt+digit` both derive from it by index, so a tab's shortcut is its position in that array and reordering needs one edit, not two. The bindings stay pinned literally in `HotkeyDispatchTable.test.ts` on purpose: they live in muscle memory, so a reorder must fail a test rather than silently follow the array.

**Option/Alt-modified digit hotkeys must match `event.code` (`'Digit1'`...), never `event.key`** — macOS remaps Option+digit to a different character per keyboard layout (Option+1 → `¡` on US layout), so `.key` matching silently breaks for most users; `.code` is the physical key, immune to modifier remapping.

**One action, one call site.** `Cmd+B` (`bindDictionaries`) is registered in `TabbedInterface`, so also passing `onBindDictionaries` to `BookReader`'s `<HotkeyHandler>` fires `openDialog` twice on one press — grep the action name before wiring a handler prop. And anything that _shows_ a binding (the Reader's palette hints, `docs/HOTKEYS.md`) is a second copy of the dispatch table: assert it against `matchHotkey` (`PaletteCommands.test.ts` parses each hint back into its keypress), or a changed binding leaves the UI advertising a dead key.

**All `TabbedInterface` tabs are always mounted** (visibility toggled via CSS `visibility`, not conditional render) — so a hotkey pressed on one tab can imperatively trigger another always-mounted tab's component via a `forwardRef`/`useImperativeHandle` (see `RulesManagerHandle`, mirrors the older `dictionarySearchRef` precedent), without needing a second instance of that component's own state hooks. Any modal opened this way (target tab not switched to) must render via `createPortal(..., document.body)` — a plain nested overlay inherits `visibility: hidden` from the still-hidden tab-panel ancestor despite `position: fixed`.

## Memo-Regression Tests Need Their Own File

Testing "does React.memo actually skip a re-render" requires `vi.mock`ing the child with a spy double — but that mock also poisons any sibling test in the same file asserting the real child's rendered output (className, styles). Isolate into a new file (e.g. `SegmentedParagraphs.memoization.test.tsx` alongside `SegmentedParagraphs.test.tsx`) rather than mocking inside the existing behavioral test file.

**Hook call order in `Translator.jsx`:** which hook's output feeds which other hook (e.g. `executionCtx`/`forceReloadCtx`'s multi-hook fan-in) is documented in-file, in the SECTION 2 banner comment near the top of `Translator.jsx` (architecture review 2026-07-30, candidate #4) — not just in this file's per-hook rules below.

## React Stale Dependencies

Never list frequently-updating state or callback props in a `useEffect` dep array that creates a `setInterval` or `addEventListener` — it recreates the subscription on every update. Use `const ref = useRef(value); ref.current = value;` and read `ref.current` inside the callback.

Known instances:

- `wasmStatus` interval (`Translator.jsx`) — dep array is `[enginePhase]`, ref used inside callback for status comparison
- Keydown listener in `useHotkeyHandler.ts` — dep array is `[]`; all props mirrored into one `optionsRef` (not per-prop refs, collapsed 2026-07-16), read as `optionsRef.current.X` inside the listener

**Also applies to `useCallback` with a mutable state dep**: a `Set` in state creates a new reference on every `setState` → the callback recreates on every update. Use a ref mirror; dep array → `[]`.

**State SET inside a `useEffect` must not be in its deps**: if a flag is reset inside the effect body and that same flag is in the dep array, the reset re-triggers the effect. `isClipboardTranslation` was the canonical example — now extracted to `useClipboardTranslation` as a ref (`isClipboardTranslationRef`), so this invariant no longer applies there.

**Two async fetches keyed by the same identifier (e.g. a book fingerprint) can race** — a same-key check alone can't tell which one _started_ more recently, only that they share a key. Guard with a shared `requestIdRef` counter incremented per fetch, applied only if it still matches on resolution. `useChapterOutline.ts`: a mount-effect fetch and a `setOverride` fetch both write `headers` for the same fingerprint; without this, a slower mount-fetch resolving after a faster override-fetch silently clobbers the user's choice.

**eslint's `exhaustive-deps` only recognizes a ref created by `useRef` in the same component** — a ref handed back from a custom hook is an ordinary value to it, so list it in the dep array rather than fighting the rule; it is as stable as any other ref (`useReaderPanel`'s `scrollRef`, consumed by `BookReader.tsx`).

**jsdom doesn't implement several DOM APIs — stub via `Object.defineProperty`/`vi.spyOn`, never assume real behavior.** Confirmed: `navigator.clipboard`/`window.getSelection` (`useHotkeyHandler.ts`'s clipboard quick-add path, NOT `window.electronAPI.readClipboard` — that's `useClipboardTranslation`'s path); `Element.isContentEditable` (always `false` regardless of the `contenteditable` attribute — `isEditableTarget`'s last clause, the input-focus guard every hotkey passes through); scroll geometry — `scrollTop` is a real settable property on a detached element, but `scrollHeight`/`clientHeight` are always `0` and no scroll event ever fires, so a scroll test stubs both sizes and dispatches the echo itself (`usePanelSync.test.ts`); `ResizeObserver` — `react-resizable-panels`' `Panel`/`Group`/`Separator` construct it directly and unguarded and `src/test/setup.ts` doesn't mock it, so mock those three as trivial pass-throughs (`({children}) => <>{children}</>`) rather than rendering them for real (`TranslatorDisplayPanels.tsx`).

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

A `.tsx` file's locally-declared prop type for a value that's really a `.jsx` function (e.g. `Translator.jsx`'s handlers) isn't checked against the real implementation — `checkJs: false` means only a `.jsx`-side JSDoc mismatch is invisible too. These drift silently until something removes whatever permissive type was tolerating the mismatch (e.g. narrowing a union). After narrowing any handler/callback type, run `bun run type-check` and expect to find stale declarations in `.tsx` callers, not just the type's own definition site.

## Engine Lifecycle — `EngineContext` / `useEngine()`

The engine is constructed once, above the tab container (`App.jsx` wraps `<TabbedInterface>` in `<EngineProvider>`, from `src/components/EngineContext.jsx`) — not owned by `Translator.jsx`. Only one engine may exist at a time: the WASM pattern/number processors are module-scope singletons, so a second live engine would silently share state with the first. `Translator.jsx` (and any future tab needing translation) consumes it via `useEngine()`; do NOT call `useTranslatorEngine`/`useEngineReinitializer` directly from a tab component — that re-creates a second, unshared engine.

`useEngine()` throws if called outside `EngineProvider`. It exposes `{ enginePhase, engineRef, engineVersion, initError, activeProperNounsFromConfig, reinitialize, reinitializeEngine }`:

- `enginePhase` — `'loading' | 'ready' | 'error'`. Replaces `engineInitialized` + `configLoaded` flags.
- `engineRef` — ref to current engine instance (or null).
- `engineVersion` — increments once per successfully constructed engine (mount and every `reinitialize()`). The cache-invalidation signal for anything holding translated output: nothing inside the engine survives reinitialization, so output cached against the previous engine was translated against dictionaries that no longer exist. The Reader's chunk cache (`src/utils/reader/TranslationChunkCache.ts`) consumes it as `dictionaryVersion` and clears itself wholesale on a change. It counts engine constructions, not dictionary edits — a dictionary edited on disk without a reload does not bump it, which is correct, because the running engine has not seen that edit either.
- `initError` — error string when `enginePhase === 'error'`, else null.
- `activeProperNounsFromConfig` — loaded from disk once on mount.
- `reinitialize(rawDicts, options)` — the raw `useTranslatorEngine` reinitializer; never throws, errors go to `enginePhase`/`initError`. Pass raw (unfiltered) dicts; the hook filters internally. Pass `forceConfigReload: true` to re-read config from disk — do NOT call `invalidateAppConfig`/`loadAppConfig` in the caller. For non-React callers (adapters outside the component tree), check `engineRef.current?.isReady()` after `await reinitialize(...)` to determine success — `enginePhase` state is async and not directly readable from adapters.
- `reinitializeEngine` — `reinitialize` wrapped by `useEngineReinitializer` (awaits it, then fires the fire-and-forget WASM dictionary-sync validation). This is the one `useForceReloadContext`/`useForceReload` consume — use this, not raw `reinitialize`, from `Translator.jsx`.

**Destroy-before-replace**: `useTranslatorEngine`'s internal `runEngineInit` destroys the outgoing engine (if any) before constructing the replacement, on both the mount path and every `reinitialize()` call — not just the `useForceReload` path that also calls `destroyEngine()` explicitly beforehand. This is what makes "only one engine at a time" structural rather than a convention every caller has to remember. A throwing `destroy()` is caught and logged, never blocks the replacement.

**TypeScript consumers**: `EngineContext.jsx` stays JavaScript, so its types come from a hand-written `src/components/EngineContext.d.ts`. `createContext(undefined)` infers `undefined`, which makes `useEngine()` destructure `never` in a `.tsx` file — the `.d.ts` is what fixes that. Nothing checks it against the provider (`checkJs` is off), so a key added to the provider's `value` must be added there by hand, alongside the bullet list above.

**Error boundary**: `EngineProvider` wraps its children in `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) — it sits at the provider, not around `<Translator>` in `TabbedInterface.tsx`, since an initialization failure is now shared by every tab rather than local to one.

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

## State Ownership — Not in `Translator.jsx`

Each concern below is owned by an extracted hook — use its named ops, never reach into its internal state/refs directly.

| Concern            | Owner                        | Key facts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highlighting       | `useHighlightingState.ts`    | `highlighting` (useReducer) + 5 named methods (`highlightOriginal`/`highlightTranslation`/`highlightBoth`/`highlightFromCharacterOnly`/`setCharacterOnlyIndex`) + `clearHighlighting`/`validateSemanticArraySize`. No raw `dispatch`. `highlightScrollTimeoutRef` stays in Translator (10+ scroll-callback sites). `useCharacterOnlyBridge` owns the Character-Only bridge pipeline — don't re-inline. `setCharacterOnlyIndex` takes `number \| number[]`, `-1` clears. `MAX_SAFE_SEGMENTS`/`HIGHLIGHT_SCROLL_DELAY_MS` come from the `utils/highlighting` barrel, not the deep `semanticArrayConstants` path. |
| Cache poisoning    | `useCachePoisoningGuard.ts`  | Returns `{ poisoning, dismiss }`; fires `toast.error` internally — don't re-toast in the caller. `listenFn = listen` injected as a default param for testability.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Translation output | `useTranslationResults.js`   | `translatedText`/`characterOnlyText`/`semanticArrays`/`characterOnlySemanticArrays`/`prebuiltSegments` — named ops only (`setStreamingText`, `setResultArrays`, `setDualResults`, `setCharOnlyResult`, `setError`→destructured as `setTranslationError`, `clearFullResult`). `setError`/`setStatusMessage` clear all arrays atomically. `setFullResult(text, null)` wipes arrays — don't call after `translateText` (it already sets them).                                                                                                                                                                    |
| Streaming state    | `useStreamingTranslation.js` | `throttledStreamingState` (100ms) for UI, not raw `streamingTranslation` (removed). Ops: `updateStreaming`, `resetStreaming`, `setProgressInfo`, `setPartialSemanticArrays`. Reducer/initial-state constants are module-private.                                                                                                                                                                                                                                                                                                                                                                               |

## Error Utilities

Use `extractErrorMessage(error)` (`src/utils/errors/errorHelpers.ts`) instead of `error instanceof Error ? error.message : 'Unknown error'` — the inline form misses `string`, `{ message }`, and `null` inputs.

## Appearance Travels as CSS Variables, Never as State

`useAppearanceSettings` is called only from `AppearanceManager.tsx`; everything else receives appearance as custom properties written to `document.documentElement` by `applyAppearanceToCssVars` (ADR-024). Two consequences. **Anything the browser re-renders needs no wiring** — `Translator.jsx`'s `sharedTextStyle`/`inputTextStyle`/`outputTextStyle`/`characterOnlyTextStyle` are `var(...)` strings with deps `[]`, static constants, not derived from `appearance`; do not move them into the hook. **Anything that measures in JS must watch for the write itself** — a font change leaves every box exactly as wide as it was, so `ResizeObserver` reports nothing and a cached measurement silently keeps the old geometry (`useAppearanceVersion` watches the root style attribute; `useColumnMetrics` re-measures, and `useAppearanceRelayout` drops the Reader virtualizers' caches and restores the anchor). Matching the Translator's typography means reading those inline objects — `lineHeight: '1.5'`, `fontSize: '1.25rem'`, `padding: '1.5rem'` in `sharedTextStyle` — plus `.panel` in `TranslatorDisplayPanels.module.css` (`--surface-color`, 1px `--border-color`, `--radius-lg`, 1rem inset); the CSS modules alone do not carry them.

## Table Toolbar Building Blocks — `SearchFilterHeader.tsx`

`SearchFilterHeader` (search box + filter-toggle button + `trailingActions` slot) and `FilterPanel` (filter-dimension wrapper shell, `open`-gated) live flat in `src/components/SearchFilterHeader.tsx`, shared by `RulesManager.tsx` and `EnhancedVirtualizedDictionaryTable.tsx`. Both are presentational — search/filter-open state stays owned by the caller. This is the 5th confirmed instance of the same table-toolbar duplication drift `dictionary/CLAUDE.md`'s `RowShell`/`MetadataBadge`/`SemanticTypeFilterChips` entry tracks (search input + filter-button style/color-mix logic + filter-panel wrapper were independently hand-copied between the two files). Import and reuse these rather than re-deriving the same inline styles in a new table-shaped view.

**6th instance found and closed 2026-09-09** (architecture review candidate #5 grilling): `FilterDimensionRow` (same file) is now the single owner of one labeled filter dimension's markup inside a `FilterPanel` — the `<div style={{display:'flex',...}}><span style={{...label style...}}>LABEL:</span>{chips}</div>` wrapper was hand-copied 4 times in `EnhancedVirtualizedDictionaryTable.tsx` (Pattern/Flags/Variable/Type), plus a 5th, narrower instance in `RulesManager.tsx` that shared only the label-span style (no wrapping div, since a single-dimension panel has nothing to wrap-group against `FilterPanel`'s own `flexWrap`). Both now call `FilterDimensionRow` — a real 2nd caller-file existed already, unlike a purely hypothetical one-file dedup.

## New Context Providers

A `createContext` provider's `value` must be wrapped in `useMemo`, and every function inside it — including ones returned by a wrapped hook, not just ones declared locally — must be `useCallback`-stable, or the memoization is defeated at its root and every consumer re-renders on every provider re-render. `DictionaryContext.tsx` does this correctly; `EngineContext.jsx` initially didn't (missed on first pass despite reading the sibling file — the convention lives at the return statement, not the exports).

**A provider mounted above `TabbedInterface` is a test change too, and its failures point at the wrong file.** Components here are rendered in isolation with their contexts `vi.mock`ed, so a new provider obligates a mock in every existing test file that renders a consumer — and that mock must return _every_ field consumers destructure. A missing field is spread inside the consumer's own `useMemo`, so the stack blames the consumer, not the mock that omitted it. `BookBindingContext` hit both halves: two test files needed new mocks, then a later field addition failed 16 tests pointing at `useDictionaryConfigManagement.ts`.

## Global Singleton Lifecycle — `performanceHealth` / `systemPerformanceMonitor`

`performanceHealth.startMonitoring()` and `performanceHealth.destroy()` are owned exclusively by `App.jsx`. Do NOT call `destroy()` in `Translator.jsx` or any child component — Translator unmounts before App, causing double-destroy on a live singleton. App's cleanup effect is the sole teardown site.
