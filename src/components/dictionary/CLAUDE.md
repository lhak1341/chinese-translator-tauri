# src/components/dictionary — Gotchas

## `DictionaryContext.tsx` CRUD Audit Checklist

After touching any CRUD function or `addToHistory`, audit for:

1. Stale-closure ref-mirror (`currentHistoryIndexRef`)
2. Typed error throws (`ValidationError`/`SaveError`) including pre-`try` existence checks
3. Dep-array correctness
4. `isValidationError`/`isSaveError` double-toast guards
5. Metadata coverage (`allowAsPatternVariable`, `lowPriority`, `semanticType`, `allowedVariableTypes` for `phrases|patterns|properNouns-*`)
6. `prepareMutationEntry` called at the top of `addEntry`/`updateEntry` — owns sanitize + validate + typed value construction. Throws `ValidationError` (no toast); catch block handles the toast via `isValidationError(error)` branch.
7. Cache invalidation called after successful save via `invokeEngineInvalidator(engineInvalidatorRef, id)` — required in every CRUD success branch. `engineInvalidatorRef` is registered by `Translator.jsx` at engine-ready time. Undo/redo paths handle invalidation via `invalidateEngine` injected into `useDictionaryHistory`.

**Single-dict CRUD protocol**: `addEntry`, `updateEntry`, `deleteEntry`, `bulkDeleteEntries` all go through `persistDictionaryMutation(dictionaryId, oldData, sortedEntries) → Promise<boolean>`. This helper owns optimistic `setDictionaries` → `saveDictionary` → rollback on failure. Callers own: diff computation, `sortDictionaryEntries`, `addToHistory`, toast, `invokeEngineInvalidator`. Move ops (`moveEntry`, `bulkMoveEntries`) do NOT use this helper — they touch 2 dicts with partial revert logic.

**Load protocol**: `loadInitialState` delegates to `loadAllDictionaries()` in `src/utils/dictionary/DictionaryBackend.ts` (parallel batch + serial retry + classification). Save/move IPC stays in the provider — those are thin and already behind `CommitMutation`/`PersistDictionaryMutation` typed abstractions. See ADR-014.

`undo`/`redo` live in `src/components/dictionary/useDictionaryHistory.ts`. Dep arrays: `[history, currentHistoryIndex, commitMutation, invalidateEngine]` — `dictionariesRef` intentionally excluded (stable ref); read `dictionariesRef.current` directly.

## React State Updater Rules

**Never `throw` inside a state updater function** (`setState(prev => { throw ... })`): React 18 Concurrent Mode may call updaters multiple times; throws bypass the `await` chain. Do existence checks on the closed-over variable BEFORE `setState`.

**Never assign `let` variables inside an updater for use outside it**: the updater may run twice; always compute from the closed-over snapshot BEFORE `setDictionaries`. For undo/redo, use `dictionariesRef.current` directly.

**`bulkDeleteEntries`** follows the same snapshot-before-updater pattern: compute `oldData`/`sortedDictionary` from the closed-over `dictionaries` snapshot BEFORE `setDictionaries`.

## Error Handling

**`isSaveError` guard alongside `isValidationError` in catch blocks**: if a code path shows a toast then `throw new SaveError(...)`, the outer `catch` must guard with `!isValidationError(error) && !isSaveError(error)` before showing its own toast — otherwise the user sees two toasts.

**Pre-`try` existence checks must throw `ValidationError`, not bare `Error`**: dict-not-found checks before the `try` block that use bare `throw new Error(msg)` bypass the `!isValidationError` guard — the outer catch shows a second toast. Always use `throw new ValidationError(msg)`.

## Dictionary JSON Format: Two Tiers

**Pure lookup tables** (`characters`, `conversion`, `punctuation`): string values only, no metadata. The string branch in `DictionaryManager.js` is intentional — do NOT convert these to objects.

**Complex entry dicts** (`phrases`, `patterns`, `properNouns*`): values MUST be `DictionaryEntryValue` objects. `addEntry`/`updateEntry` always write objects (never strings). Any code iterating `DictionaryData` must guard: `typeof value === 'string' ? value : value.translation`.

## `VirtualRowComponent` Is at Module Scope

Lives in `VirtualRowComponent.tsx` (sibling file), imported by `EnhancedVirtualizedDictionaryTable`. Do NOT wrap in `useMemo` or move inside any render function — any dep change creates a new React component _type_, unmounting all rows and destroying inline edit state (`sourceEdit`/`translEdit` from `useInlineFieldEdit`). `ITEM_HEIGHT` is exported from `VirtualRowComponent.tsx` — import it from there, not redeclared locally.

## `SemanticType` Canonical Values

Canonical values: `'character'`, `'location'`, `'organization'`, `'concept'`, `'object'` (UI abbreviations: CHA/LOC/ORG/CON/OBJ). Dictionary JSON stores these strings directly — a stale value (e.g. old `'person'`/`'place'`) displays no badge and fails filter matching silently. Bulk-migrate with `scripts/migrate-semantic-types.py`.

- `SEMANTIC_TYPE_ABBREVIATIONS` and `SEMANTIC_TYPE_LIST` (from `src/constants/SemanticTypes.ts`) are the canonical exports for toggle cells in `EnhancedVirtualizedDictionaryTable.tsx` — do NOT redeclare local lists.
- `classifyVariableType` in `SemanticPatternProcessor.js` returns canonical values when `metadata.semanticType` is set, but falls back to internal discriminators (`'proper_noun'`, `'character_unit'`, `'unknown'`) that are NOT canonical — `'proper_noun'` is special-cased to `null` (always include); `'character_unit'` and `'unknown'` fail `allowedVariableTypes` constraints intentionally.

## `$X`/`$Y` Variable-Derived Semantic Types (Patterns Only)

Pattern `semanticType` accepts `"$X"` or `"$Y"` — resolved at WASM match time from the variable's cache `var_type`. Constants in `src/constants/SemanticTypes.ts`: `PATTERN_SEMANTIC_TYPE_REF_LIST`. UI: `SemanticTypePicker.tsx` (via `DictionaryEntry.tsx`) and `SemanticTypeToggleCell` in `EnhancedVirtualizedDictionaryTable.tsx` (inline column, patterns branch only — NOT phrases/properNouns branches).

Resolution edge cases: `$-ref` to non-existent variable (e.g. `"$Z"` in an X-only pattern) → `None` silently, no error. `$X` where var has `var_type: Some("proper_noun")` (JS non-canonical sentinel for untyped proper-noun entries) → `Some("proper_noun")`, NOT `None` — canonical `allowedVariableTypes` constraints (e.g. `["character"]`) won't match it.

## Pattern Variable Contract

X = mandatory 1st variable; Y = optional 2nd. Y-only patterns are intentionally invalid. `validatePatternEntry(sourceText, translationText?)` enforces: source needs exactly one X; translation must contain X; if source has Y, translation must also have Y. Existing-entry suggestion (from other dictionaries) is suppressed for patterns — `handleTranslationFocus` guards on `activeDictionary === 'patterns'`.

## `DictionaryInfo` Name Collision

`DictionaryTypes.ts` has a LOCAL `interface DictionaryInfo { label, description }` — display-only type for dictionary type metadata. NOT the same as `ComponentTypes.d.ts::DictionaryInfo { id, name, path, isActive, ... }` which is the API/IPC type used by `ElectronTypes.d.ts`. Do not re-export the local one, do not merge the two. Import `DictionaryInfo` from `../../types/ComponentTypes` for the API type.

## WASM Wrapper Methods

**Must check `initialize()` return value**: `if (!this.initialized) { const ok = await this.initialize(); if (!ok) return false; }` — skipping `if (!ok)` causes `this.processor.*` to throw TypeError when `this.processor` is null after failed init.

**`WasmNumberProcessor` IIFE resolves (not rejects) on failure**: the module-bottom `.catch()` only fires on rejection; the IIFE swallows errors and resolves to `false`. Clearing `initializationPromise` must happen inside the IIFE `catch` block — if omitted, `getWasmNumberProcessorStatus()` permanently reports `{ initializing: true }`.
