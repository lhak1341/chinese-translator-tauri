# src/components — Gotchas

## React Stale Dependencies

Never list frequently-updating state or callback props in a `useEffect` dep array that creates a `setInterval` or `addEventListener` — it recreates the subscription on every update. Use `const ref = useRef(value); ref.current = value;` and read `ref.current` inside the callback.

Known instances:

- `wasmStatus` interval (`Translator.jsx`) — dep array is `[enginePhase]`, ref used inside callback for status comparison
- All 13 callback props in keydown listener (`useHotkeyHandler.ts`) — dep array is `[]`

**Also applies to `useCallback` with a mutable state dep**: a `Set` in state creates a new reference on every `setState` → the callback recreates on every update. Use a ref mirror; dep array → `[]`.

**State SET inside a `useEffect` must not be in its deps**: if a flag is reset inside the effect body and that same flag is in the dep array, the reset re-triggers the effect. Affected: `isClipboardTranslation` in the `loadAndTranslate` effect in `Translator.jsx`.

## `ClickableTranslationOptimized` Paragraph Logic

Uses "break on every `\n`" (inline `useMemo`). Do NOT replace with `groupSegmentsIntoParagraphs` — that utility uses Chinese-indentation detection, incompatible with Vietnamese translated text.

Empty paragraphs (from consecutive `\n` in source text) are intentionally preserved so blank lines from the original Chinese render in the Vietnamese output. The `.paragraph` CSS rule sets `min-height: 1lh` to give empty `<div>`s visible height. Do NOT add an `if (currentParagraph.length > 0)` guard around the flush — that drops blank lines and causes the linebreak-fidelity regression versus the char-only path.

## Canonical Type Homes

Do not redeclare these locally:

- `ThrottledStreamingState` → `src/types/UITypes.d.ts`
- `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `src/types/DictionaryTypes.ts`

TypeScript does not narrow optional property accesses through `&&` spreads — `SemanticType` widens to `string`. Extract to a local variable or use imperative assignment (`if (metadata.semanticType) entry.semanticType = metadata.semanticType`).

## Renamed Exports — Grep `Translator.jsx` After Any Rename

`Translator.jsx` is JavaScript — `type-check` will not catch stale imports there. Always grep it after renaming exported functions from utilities. Known renames:

- `validateApiResult` (was `validateElectronResult`) in `configValidation.ts`
- `validateRawDictionaryEntry` (was `validateDictionaryEntry`) in `configValidation.ts` — renamed to avoid collision with same-named function in `DictionaryTypes.ts` (different signature). Do NOT revert.

## Engine Lifecycle — `useTranslatorEngine` Hook

Engine init, config load, and reinit are owned by `src/hooks/useTranslatorEngine.js`. Do NOT inline these back into `Translator.jsx`.

The hook exposes `{ enginePhase, engineRef, initError, activeProperNounsFromConfig, reinitialize }`:

- `enginePhase` — `'loading' | 'ready' | 'error'`. Replaces `engineInitialized` + `configLoaded` flags.
- `engineRef` — ref to current engine instance (or null).
- `initError` — error string when `enginePhase === 'error'`, else null.
- `activeProperNounsFromConfig` — loaded from disk once on mount; synced to `useDictionaryConfig` state via `useEffect`.
- `reinitialize(filteredDicts, options)` — never throws; errors go to `enginePhase`/`initError`.

**Race condition**: `reinitialize` sets `isInitializingRef.current = true` synchronously on entry and the hook's init effect checks `enginePhase === 'loading' && !isInitializingRef.current`. `handleForceReload` must NOT set any separate lock — `reinitialize` handles it.

**Config load**: `useTranslatorEngine` calls `loadAppConfig()` once on mount (cached). `handleForceReload` must call `invalidateAppConfig()` then `loadAppConfig()` to get fresh values from disk — do NOT call `window.electronAPI.loadConfiguration()` directly.

**Priority scheme**: defined as `ENGINE_PRIORITIES` constant in `useTranslatorEngine.js` and exported. Pass to both `reinitialize()` and the hook's own init — any change to priorities must be made there only.

**Post-ready setup** (engine stats, debounced callbacks, dev tools): done in a `useEffect([enginePhase])` in `Translator.jsx` — fires on every transition to `'ready'`, including after `reinitialize`.

## ConfigurationManager Settings Must Be Traced to the Engine

`saveAppConfig` → `loadAppConfig` → `TranslationEngine.js` options → `WasmDictionaryManager._doInitialize(_config)`. The `_config` param is discarded (underscore = unused) — settings reach `appConfig.ts` correctly but die at WASM init. Wire new WASM-related config through `EnhancedDictionaryManager` constructor options instead.

## `showReadinessOverlay` Must Not Short-Circuit on `initializationError`

When engine init fails: `initializationError` is truthy AND `enginePhase === 'error'` (not `'ready'`). Adding `!initializationError` to the condition hides the overlay and lets users interact with a broken engine. Correct condition: `!loadError && (isLoading || enginePhase !== 'ready')`.

## Error Utilities

Use `extractErrorMessage(error)` (`src/utils/errors/errorHelpers.ts`) instead of `error instanceof Error ? error.message : 'Unknown error'` — the inline form misses `string`, `{ message }`, and `null` inputs.
