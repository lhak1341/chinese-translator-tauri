# src/components/dictionary — Gotchas

## `sortDictionaryEntries` Bulk-Op Constraint

**`sortDictionaryEntries` bulk ops:** pass `null` as `changedKey` when modifying >1 entry — `IncrementalDictionarySorter.incrementalSort` only repositions ONE key per call; a non-null anchor silently drops the other N-1 entries from the persisted dict.

## `DictionaryContext.tsx` CRUD Audit Checklist

After touching any CRUD function or `addToHistory`, audit for:

1. Stale-closure ref-mirror (`currentHistoryIndexRef`)
2. Typed error throws (`ValidationError`/`SaveError`) including pre-`try` existence checks
3. Dep-array correctness
4. `isValidationError`/`isSaveError` double-toast guards
5. Metadata coverage (`allowAsPatternVariable`, `lowPriority`, `semanticType`, `allowedVariableTypes` for `phrases|patterns|properNouns-*`)
6. `prepareMutationEntry` called at the top of `addEntry`/`updateEntry` — owns sanitize + validate + typed value construction. Throws `ValidationError` (no toast); catch block handles the toast via `isValidationError(error)` branch. Validation is `validatePersistEntry(dictionaryId, source, translation)` from `utils/dictionary/PersistTimeValidator` — NOT the form-time `validateDictionaryEntry` in `DictionaryEntryValidator.ts` (different signature, different return type).
7. Cache invalidation called after successful save via `invokeEngineInvalidator(engineInvalidatorRef, id)` — required in every CRUD success branch. `engineInvalidatorRef` is registered by `Translator.jsx` at engine-ready time. Undo/redo paths handle invalidation via `invalidateEngine` injected into `useDictionaryHistory`.

**Single-dict CRUD protocol**: `addEntry`, `updateEntry`, `deleteEntry`, `bulkDeleteEntries` all go through `persistDictionaryMutation(dictionaryId, oldData, sortedEntries) → Promise<boolean>`. Defined in `useDictionaryPersistence.ts` (not inline in Provider). Owns optimistic `setDictionaries` → `saveDictionary` → rollback on failure. Move ops use `commitMoveOp` from the same hook — two-dict partial revert (if one save succeeds and the other fails, the successful write is reverted to disk). Callers own: diff computation, `sortDictionaryEntries`, `addToHistory`, toast, `invokeEngineInvalidator`.

**Load protocol**: Both `loadInitialState` (startup) and `loadDictionary` (single reload) delegate to `loadAllDictionaries()` in `src/utils/dictionary/DictionaryBackend.ts` (parallel batch + serial retry). Do NOT call `window.electronAPI.loadDictionary` directly — that path has no retry. Failure outcome classification lives in `classifyLoadResult` in `DictionaryLoadClassifier.ts`. See ADR-014.

`undo`/`redo` live in `src/components/dictionary/useDictionaryHistory.ts`. Diff-reversal delegates to `computeUndoMutation`/`computeRedoMutation` in `src/utils/dictionary/DictionaryOperationReverter.ts` — pure, no React. Dep arrays: `[history, currentHistoryIndex, commitMutation, invalidateEngine]` — `dictionariesRef` intentionally excluded (stable ref).

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

X = mandatory 1st variable; Y = optional 2nd. Y-only patterns are intentionally invalid. `validatePatternEntry(sourceText, translationText?)` enforces: source needs exactly one X; translation must contain X; if source has Y, translation must also have Y. Existing-entry suggestion (from other dictionaries) is suppressed for patterns — `handleTranslationFocus` guards on `activeDictionary.startsWith('patterns')`.

## Dictionary Type Classification

Use `classifyDictionaryId(id)` from `DictionaryIdClassifier.ts` for all UI-layer type checks — never compare `=== 'patterns'` or `=== 'phrases'` directly. `isPatterns` is true for both `'patterns'` and `'patterns-f_*'`; raw equality misses fiction variants and silently breaks on every dict-type extension. Even when `isPatterns` is already computed in scope, call sites tend to fall back to raw string — grep `=== 'patterns'` after any dict-type addition.

Use `toPatternsId(properNounsId)`/`toProperNounsId(patternsId)` (same file) for the ADR-027 fiction pairing derivation — never hand-roll `'patterns-' + id.slice('properNouns-'.length)`.

## Fiction Pattern Merge Order Is Load-Bearing

`FictionDictionaryFilter.ts`'s conflict merge must spread global `patterns` FIRST, fiction entries LAST (`{ ...global, ...fiction }`) so fiction wins on a same-template conflict (ADR-027). The reverse order was a live bug until 2026-07-16 — silently let global patterns override fiction-specific ones with no error. Verify with a same-key conflict test before touching this line again.

## `DictionaryInfo` Name Collision

`DictionaryTypes.ts` has a LOCAL `interface DictionaryInfo { label, description }` — display-only type for dictionary type metadata. NOT the same as `ComponentTypes.d.ts::DictionaryInfo { id, name, path, isActive, ... }` which is the API/IPC type used by `ElectronTypes.d.ts`. Do not re-export the local one, do not merge the two. Import `DictionaryInfo` from `../../types/ComponentTypes` for the API type.

## `useEntryEditAndMove` Hook — Edit/Move State Not in EVDT

`editingEntry`, `moveEntry`, `updateEntryWithScrollPreservation`, `onContextMenuEdit`, `onContextMenuMove` live in `src/hooks/useEntryEditAndMove.ts`. EVDT uses `reset: resetEditAndMove` in the dict-switch effect to clear both state fields atomically. Hook takes `withScrollPreservation` (from `useVirtualScrollRange`) — no raw `scrollRef`/`setScrollTop` leak to callers. `updateEntryWithScrollPreservation` delegates directly to `withScrollPreservation(fn)`.

**No raw setters escape the hook.** Modal close handlers use `closeEdit()` / `closeMove()` (clear one state field each). `reset()` clears both atomically and is used on dict switch only. Do NOT destructure `setEditingEntry` or `setMoveEntry` — they are not in the return type.

## `useMoveTargetDictionaries` Hook — Move-Target List Not Duplicated

`availableDictionaries`/`sourceLabel` for `BulkMoveDialog.tsx` and `MoveEntryDialog.tsx` live in `src/hooks/useMoveTargetDictionaries.ts`. Do NOT hand-roll dictionary-list-loading or dropdown-label logic in a new move/bulk-move-style dialog — call the hook, pass your own `setError` as the `onError` callback. `sourceLabel` is a sync derived value (`getDictionaryDropdownLabel(currentDictionaryId)`), not tied to the async list-load — stays correct even if the load fails.

## `useEntrySelection` Hook — Selection State Not in EVDT

`showBulkDeleteConfirm`, `isDeleting`, `handleBulkDelete`, `handleBulkMove` live in `src/hooks/useEntrySelection.ts`, NOT rendered in EVDT. EVDT only uses `selectedEntries`, `showBulkMoveDialog`, `handleSelectEntry`, `handleSelectAll`, `resetSelection`. All other selection state flows to the parent via `onSelectionChange` — the confirm-delete dialog is rendered by the **parent**, not EVDT. Hook takes `withScrollPreservation` + `getScrollTop` (from `useVirtualScrollRange`) — no raw `scrollRef`/`setScrollTop` in its interface. `getScrollTop()` used by the duplicate-mode bulk-delete to capture position before async refresh.

## `useDictionaryEntryFilter` Hook — Filter State Not in EVDT

All filter state lives in `src/hooks/useDictionaryEntryFilter.ts`. Call as `useDictionaryEntryFilter(dicts, selectedDictionary, duplicateRows, showDuplicatesMode)`.

**Named operations (use these — no raw setters escape the hook):**

- `toggleSemanticType(type: string)` — toggle one semantic type in/out of the active filter set
- `togglePatternType(type: 'x-only' | 'x-y')` — toggle one pattern shape filter
- `toggleFlag(flag: 'allowAsVariable' | 'lowPriority')` — toggle a boolean flag filter
- `setVariable(v: 'all' | 'allowed' | 'not-allowed')` — set the variable filter to an explicit value
- `clearFilters()` — reset all filter dimensions atomically (used by the "Clear filters" button)
- `resetFilters(newSelectedDictionary)` — smart reset on dict switch: clears only filters inapplicable to the new dict type. Called from the `selectedDictionary` coordinator effect alongside `resetEditAndMove`/`resetSelection`/`closeContextMenu`/`scroll.resetScroll`.

**Read-only state (for `.has()` / `isActive` checks in JSX):** `filterSemanticTypes`, `filterPatternType`, `filterAllowAsVariable`, `filterLowPriority`, `filterVariable`.

**Raw setters that still escape (UI-only, no filter logic):** `setSearchTerm`, `setShowFilterPanel`.

`debouncedSearchTerm` must be destructured — used by EVDT's scroll-reset effect. All named operation callbacks are stable (`useCallback(fn, [])` with functional updaters internally — no Set state in deps).

## Hook Tests — jsdom Gotchas

**`requestAnimationFrame` does not fire in jsdom.** Tests asserting RAF-triggered side effects must mock it:

```ts
const rafCalls: FrameRequestCallback[] = [];
vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
  rafCalls.push(cb);
  return 0;
});
// after act():
act(() => rafCalls.forEach((cb) => cb(0)));
vi.restoreAllMocks();
```

Applies to any hook with `requestAnimationFrame` in a `useEffect`. See `useEntryEditAndMove.test.ts`.

`useVirtualScrollRange`'s `containerHeight` state defaults to `600` (not `0`) — small test datasets (EVDT and siblings) render fully with no ResizeObserver-firing needed; still stub `ResizeObserver` as a class (per above) so `new ResizeObserver()` doesn't throw "not defined" in jsdom.

Row-level handlers with no test id (e.g. `onContextMenu` on a row wrapper div): `fireEvent.contextMenu(someDescendantText)` still bubbles up to trigger it — avoids brittle `.closest()`/`.parentElement` DOM traversal to find the row wrapper.

**Testing a closure passed as a hook argument** (e.g. `useInlineFieldEdit(value, onCommit)` where `onCommit` builds a component-local metadata object): mock the hook, capture the argument in the mock factory, invoke it directly in the test. Skips simulating the hook's own edit/blur state machine (already covered by that hook's own test file) and isolates the assertion to the component's own logic. See `VirtualRowComponent.test.tsx`.

Firing scroll/DOM events on a manually-attached `ref` callback (e.g. `scrollRefCallback` from `useVirtualScrollRange`): capture the node via the callback itself (`scrollRefCallback: (node) => { captured = node }`) and call `fireEvent` on it directly — do not hunt for it with a `querySelector('div[style*=...]')` CSS-string match against inline styles; brittle against style-string formatting and unrelated markup changes.

**Patterns-dict source text is not a single text node** — `VirtualRowComponent` renders it through `highlightPatternVariables(source)`, which splits it into styled spans per X/Y variable. `screen.getByText(sourceString)` will fail to match; assert on the (plain-text) translation string instead.

## `DuplicateDictionaryTableView` — Duplicate Rendering Not in EVDT

4-column duplicate layout lives in `DuplicateDictionaryTableView.tsx`. Pure view, no hooks. EVDT passes scroll state as props (`scrollRefCallback`, `onScroll`, `totalHeight`, `offsetY`) — `useVirtualScrollRange` stays in EVDT. When adding duplicate-mode UI, edit `DuplicateDictionaryTableView`, not EVDT.

## `useEntryMetadataEdit` Hook — Metadata Handlers Not in `VirtualRowComponent`

`handleCheckboxChange`, `handleToggleVariableType`, `handleSetSemanticType`, and `buildBaseMetadata` live in `src/hooks/useEntryMetadataEdit.ts`. Invariant: every handler snapshots full metadata via `buildBaseMetadata` first, then patches one field. `handleToggleVariableType` owns the add/remove/delete-key logic for `allowedVariableTypes` — toggling the only type for a variable deletes the key; emptying all keys deletes `allowedVariableTypes` from the metadata object entirely.

## WASM Wrapper Methods

**Must check `initialize()` return value**: `if (!this.initialized) { const ok = await this.initialize(); if (!ok) return false; }` — skipping `if (!ok)` causes `this.processor.*` to throw TypeError when `this.processor` is null after failed init.

**`WasmNumberProcessor` IIFE resolves (not rejects) on failure**: the module-bottom `.catch()` only fires on rejection; the IIFE swallows errors and resolves to `false`. Clearing `initializationPromise` must happen inside the IIFE `catch` block — if omitted, `getWasmNumberProcessorStatus()` permanently reports `{ initializing: true }`.
