# src/components — Gotchas

## React Stale Dependencies

Never list frequently-updating state or callback props in a `useEffect` dep array that creates a `setInterval` or `addEventListener` — it recreates the subscription on every update. Use `const ref = useRef(value); ref.current = value;` and read `ref.current` inside the callback.

Known instances:

- `wasmStatus` interval (`Translator.jsx`) — dep array is `[]`, ref used inside callback
- All 13 callback props in keydown listener (`useHotkeyHandler.ts`) — dep array is `[]`

**Also applies to `useCallback` with a mutable state dep**: a `Set` in state creates a new reference on every `setState` → the callback recreates on every update. Use a ref mirror; dep array → `[]`. Example: `loadedDictionariesRef` in `LazyDictionaryContext.tsx`.

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

## `engine.initialize()` Is Called in Two Places in `Translator.jsx`

Initial load (~line 469) and reload (~line 2234) both pass `priorities: { properNouns: N, ... }` explicitly. `options.priorities` overrides all defaults in `DictionaryManager.loadDictionaries`. Any change to the priority scheme or init options must be applied to **both** call sites.

## Error Utilities

Use `extractErrorMessage(error)` (`src/utils/errors/errorHelpers.ts`) instead of `error instanceof Error ? error.message : 'Unknown error'` — the inline form misses `string`, `{ message }`, and `null` inputs.
