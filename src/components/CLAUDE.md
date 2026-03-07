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

## Canonical Type Homes

Do not redeclare these locally:

- `ThrottledStreamingState` → `src/types/UITypes.d.ts`
- `DictionaryEntryMetadata`, `MoveEntryData`, `EditingEntryData` → `src/types/DictionaryTypes.ts`

TypeScript does not narrow optional property accesses through `&&` spreads — `SemanticType` widens to `string`. Extract to a local variable or use imperative assignment (`if (metadata.semanticType) entry.semanticType = metadata.semanticType`).

## Renamed Exports — Grep `Translator.jsx` After Any Rename

`Translator.jsx` is JavaScript — `type-check` will not catch stale imports there. Always grep it after renaming exported functions from utilities. Known renames:

- `validateApiResult` (was `validateElectronResult`) in `configValidation.ts`
- `validateRawDictionaryEntry` (was `validateDictionaryEntry`) in `configValidation.ts` — renamed to avoid collision with same-named function in `DictionaryTypes.ts` (different signature). Do NOT revert.

## Error Utilities

Use `extractErrorMessage(error)` (`src/utils/errors/errorHelpers.ts`) instead of `error instanceof Error ? error.message : 'Unknown error'` — the inline form misses `string`, `{ message }`, and `null` inputs.
