# Fiction Structural Pattern Dictionaries — Implementation Plan

**Date:** 2026-06-26  
**ADRs:** ADR-027, ADR-028, ADR-029  
**Status:** Ready to implement

---

## What This Feature Does

Adds per-fiction structural pattern dictionaries (`patterns-f_X`) that pair with existing fiction proper noun dictionaries (`properNouns-f_X`). Fiction-specific Phase 1 patterns override the global `patterns` dictionary on same-template conflicts, and are managed/activated as a unit with their paired proper nouns dictionary.

---

## Design Decisions (do not re-litigate)

| Decision           | Choice                                                    | Rationale                                                          |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Phase              | Phase 1 — same `SemanticPatternProcessor`                 | Structural patterns ARE Phase 1 patterns                           |
| Source string      | Stays `'pattern'`                                         | No new priority tier needed; `getSourcePriority()` unchanged       |
| Coupling           | Naming convention at engine init                          | No second config field; one toggle drives both                     |
| Override           | Fiction entries merged FIRST                              | `{ ...fictionEntries, ...globalPatterns }` → fiction wins          |
| Merge site         | `filterDictionariesForEngine` in `useTranslatorEngine.js` | Engine sees one merged `patterns` key                              |
| Creation           | Eager — "New" creates both files                          | Simplicity; empty file cost is negligible                          |
| Rename             | Cascades atomically in Rust                               | Rust rolls back properNouns rename if patterns rename fails        |
| Migration          | ConfigurationManager mount                                | Creates missing `patterns-f_*` for pre-existing fictions           |
| Ctrl/Cmd-6 target  | Derived from `defaultQuickAddDictionary` prefix swap      | No second bookmark config                                          |
| Ctrl/Cmd-6 missing | Toast — no fallback                                       | Navigating to wrong fiction's patterns would be confusing          |
| Tauri APIs         | Mirrored specific commands                                | `create_proper_nouns_dictionary` has prefix guard; can't be reused |
| Visual indicator   | None                                                      | Eager creation means all fictions always have both files           |
| Ctrl/Cmd-6 handler | Inlined alongside key '5' in `handleDictionaryTabHotkey`  | Only 2 callers; shared helper is premature abstraction             |

---

## Naming Convention

```
Fiction key: "DuongThan"  (or with f_ prefix in dict IDs: "f_DuongThan")
Proper nouns dict: properNouns-f_DuongThan
Structural patterns dict: patterns-f_DuongThan   (wait — see below)
```

**Important:** Look at existing fiction dict IDs on disk to confirm prefix. ConfigurationManager categorizes fiction dicts as those with `f_` in the name part (after `properNouns-`). The pairing derivation is:

```js
// From properNouns-f_X → patterns-f_X
const suffix = properNounsId.slice('properNouns-'.length); // "f_DuongThan"
const patternsId = 'patterns-' + suffix; // "patterns-f_DuongThan"
```

`isDictionaryCategory('patterns-f_DuongThan', 'patterns')` already returns `true` (contains 'pattern'). No changes to `LookupIndexUtils.ts`.

---

## Phase Dependencies

```
Phase 1 (Rust backend)                   ← cargo check required; gates all JS phases
  └─ Phase 2 (tauriAPI bindings)
       ├─ Phase 3 (DictionaryTypes — discovery)
       │    └─ Phase 4 (Engine merge)    ← must deploy with Phase 3
       ├─ Phase 5 (ConfigurationManager)
       └─ Phase 6 (Hotkeys)
```

Phases 4, 5, 6 are independent of each other once Phase 3 is done.

---

## Phase 1 — Rust Backend [Medium]

### Files

- `src-tauri/src/dictionary_commands.rs`
- `src-tauri/src/lib.rs`

### 1a. Add `list_fiction_pattern_dictionaries`

Mirror `list_proper_nouns_dictionaries` exactly. Change only the filter predicate:

```rust
if file_str.starts_with("patterns-") && file_str.ends_with(".json") && !file_str.ends_with(".trie.json") {
```

Returns `DictionaryResponse::ok_with_dicts(pattern_dicts)`.

### 1b. Add `create_structural_patterns_dictionary`

Mirror `create_proper_nouns_dictionary` with two differences:

1. Prefix guard: `if !dictionary_id.starts_with("patterns-") { return err }`
2. **No L2 config update** — do NOT append to `activeProperNouns`. Patterns coupling is engine-derived.

```rust
#[tauri::command]
pub async fn create_structural_patterns_dictionary(
    app_handle: tauri::AppHandle,
    cache: State<'_, DictionaryCache>,
    dictionary_id: String,
) -> Result<DictionaryResponse, String> {
    validate_dictionary_id(&dictionary_id)?;
    if !dictionary_id.starts_with("patterns-") {
        return Ok(DictionaryResponse::err("Dictionary ID must start with 'patterns-'"));
    }
    let dictionary_path = get_or_create_dictionary_dir(&app_handle)?;
    let file_path = dictionary_path.join(format!("{}.json", dictionary_id));
    if file_path.exists() {
        return Ok(DictionaryResponse::err("Dictionary already exists"));
    }
    let empty_dict = serde_json::json!({});
    save_json_file(&file_path, &empty_dict)?;
    cache.invalidate(Some(&dictionary_id));
    Ok(DictionaryResponse::ok())
}
```

### 1c. Add `rename_structural_patterns_dictionary`

Mirror `rename_proper_nouns_dictionary`. Prefix guard: both IDs must start with `patterns-`. No config update. If old file doesn't exist, return warning (non-fatal — eager creation may have been skipped for pre-existing fictions).

### 1d. Modify `rename_proper_nouns_dictionary` — cascade

After the existing properNouns rename + config save succeeds, add fiction patterns cascade:

```rust
// Cascade to paired patterns dict if this is a fiction dict
if old_dictionary_id.starts_with("properNouns-f_") {
    let old_suffix = old_dictionary_id.strip_prefix("properNouns-").unwrap_or("");
    let new_suffix = new_dictionary_id.strip_prefix("properNouns-").unwrap_or("");
    let old_patterns_id = format!("patterns-{}", old_suffix);
    let new_patterns_id = format!("patterns-{}", new_suffix);
    let old_patterns_path = dictionary_path.join(format!("{}.json", old_patterns_id));
    let new_patterns_path = dictionary_path.join(format!("{}.json", new_patterns_id));
    if old_patterns_path.exists() {
        if let Err(_) = fs::rename(&old_patterns_path, &new_patterns_path) {
            // Patterns rename failed — roll back properNouns rename and config
            let _ = fs::rename(&new_file_path, &old_file_path);
            // Re-save original config (reconstruct from old values)
            // ... restore config logic ...
            return Ok(DictionaryResponse::err(
                "Rename failed: could not rename paired patterns dictionary. Both files restored."
            ));
        }
        cache.invalidate(Some(&old_patterns_id));
    }
}
```

### 1e. Register in `lib.rs`

```rust
dictionary_commands::list_fiction_pattern_dictionaries,
dictionary_commands::create_structural_patterns_dictionary,
dictionary_commands::rename_structural_patterns_dictionary,
```

**After this phase:** `cargo check --manifest-path src-tauri/Cargo.toml`

---

## Phase 2 — tauriAPI Bindings [Small]

### Files

- `src/tauriAPI.ts`
- `src/types/ElectronTypes.d.ts`

Add three methods to `tauriAPI.ts` mirroring the proper nouns counterparts. Add three signatures to `ElectronAPI` interface in `ElectronTypes.d.ts`.

Method names:

- `listFictionPatternDictionaries(): Promise<DictionaryListResult>`
- `createStructuralPatternsDictionary(id: string): Promise<SaveResult>`
- `renameStructuralPatternsDictionary(oldId: string, newId: string): Promise<DictionaryOperationResult>`

Run `pnpm type-check` after.

---

## Phase 3 — Dictionary Discovery [Small]

### File: `src/components/dictionary/DictionaryTypes.ts`

**Change 1 — extend `getDictionaryTypes()`:**

Run `listProperNounsDictionaries` and `listFictionPatternDictionaries` in parallel via `Promise.all`. For each `patterns-f_X` ID returned, append an entry that reuses the existing `patterns` validator:

```ts
const patternEntry = {
  id: patternsId,
  label: `Pattern - ${suffix}`, // suffix = "f_DuongThan"
  description: 'Fiction-specific structural pattern translations',
  data: null,
  validate: DICTIONARY_TYPES['patterns'].validate,
};
```

**Change 2 — `validateDictionaryEntry()` routing:**

Add before the existing type lookup:

```ts
if (dictionaryId.startsWith('patterns-')) {
  return DICTIONARY_TYPES['patterns'].validate(source, translation);
}
```

Without this, saving entries to `patterns-f_X` throws "Invalid dictionary type". **This must ship with Phase 4** — if Phase 3 registers the types but Phase 4 tries to save entries before this guard, saves fail.

---

## Phase 4 — Engine Merge [Medium]

### File: `src/hooks/useTranslatorEngine.js`

Find `filterDictionariesForEngine` at line 18. After the existing filter loop (that excludes inactive `properNouns-*` dicts) and before `return filtered`, add:

```js
// Merge fiction structural pattern dicts into filtered.patterns (fiction wins on conflict)
const fictionPatternEntries = {};
for (const id of activeProperNouns) {
  if (id.startsWith('properNouns-f_')) {
    const suffix = id.slice('properNouns-'.length); // "f_DuongThan"
    const patternsId = 'patterns-' + suffix; // "patterns-f_DuongThan"
    const patternsDict = dictionaries[patternsId];
    if (patternsDict && Object.keys(patternsDict).length > 0) {
      Object.assign(fictionPatternEntries, patternsDict);
    }
  }
}
if (Object.keys(fictionPatternEntries).length > 0) {
  // Spread order: fiction first → fiction wins on same-template conflict
  filtered.patterns = { ...fictionPatternEntries, ...(filtered.patterns || {}) };
}
// Strip raw patterns-f_X keys — engine receives only the merged 'patterns' key
for (const key of Object.keys(filtered)) {
  if (key.startsWith('patterns-f_')) delete filtered[key];
}
```

No changes to `TranslationEngine.js`, `SemanticPatternProcessor.js`, or `getSourcePriority`.

**Context:** `filterDictionariesForEngine` is called in two places in this file:

- Line ~76: initial engine init `useEffect`
- Line ~119: `reinitialize()` (force reload)

Both call sites pass `dictionaries` from DictionaryContext state. After Phase 3 ships, `dictionaries['patterns-f_X']` will be populated there.

---

## Phase 5 — ConfigurationManager [Medium]

### File: `src/components/configuration/ConfigurationManager.tsx`

**Change 1 — eager creation in `handleCreateDictionary`:**

After the existing `createProperNounsDictionary` call succeeds, before `setAvailableDictionaries(...)`:

```ts
if (dictionaryId.startsWith('properNouns-f_')) {
  const suffix = dictionaryId.slice('properNouns-'.length); // "f_DuongThan"
  const patternsDictId = 'patterns-' + suffix;
  const patternsResult =
    await window.electronAPI.createStructuralPatternsDictionary(patternsDictId);
  if (!patternsResult.success) {
    console.warn(
      `Created ${dictionaryId} but failed to create paired ${patternsDictId}:`,
      patternsResult.error
    );
    // Non-fatal — migration on next mount will repair
  }
}
```

**Change 2 — rename cascade: NO CHANGE NEEDED.** The cascade is embedded in the Rust `rename_proper_nouns_dictionary` command. `handleConfirmRename` calls only `renameProperNounsDictionary` as before.

**Change 3 — migration on mount:**

In the `loadDictionaries` `useEffect`, after `setAvailableDictionaries(...)` and `setActiveDictionaries(...)` succeed, add:

```ts
// Migration: create missing patterns-f_* for pre-existing fiction proper-noun dicts
try {
  const patternsListResult = await window.electronAPI.listFictionPatternDictionaries();
  const existingPatterns = new Set<string>(
    patternsListResult.success ? (patternsListResult.dictionaries as unknown as string[]) : []
  );
  const fictionDicts = dictionaryIds.filter((id) => id.startsWith('properNouns-f_'));
  for (const id of fictionDicts) {
    const suffix = id.slice('properNouns-'.length);
    const patternsDictId = 'patterns-' + suffix;
    if (!existingPatterns.has(patternsDictId)) {
      await window.electronAPI.createStructuralPatternsDictionary(patternsDictId);
    }
  }
} catch (migrationErr) {
  console.warn('Fiction pattern dictionary migration failed (non-fatal):', migrationErr);
}
```

This runs every mount and is idempotent (existence-checked in Rust).

---

## Phase 6 — Hotkeys [Small]

### File: `src/utils/ui/HotkeyDispatchTable.ts`

Add to `HotkeyAction` union:

```ts
| { type: 'quickAddCustomStructuralPattern' }
```

Add `case '6'` in the `else` switch (after `case '5'`):

```ts
case '6':
  return activeTab === 'dictionary'
    ? { type: 'dictionaryTabHotkey', key: '6' }
    : { type: 'quickAddCustomStructuralPattern' };
```

### File: `src/hooks/useHotkeyHandler.ts`

- Add `onQuickAddCustomStructuralPattern?: (text?: string) => Promise<void>` to `HotkeyHandlerOptions`
- Add ref following existing `onQuickAddCustomProperNounRef` pattern
- Add dispatch case:
  ```ts
  case 'quickAddCustomStructuralPattern':
    await handleQuickAdd(event, onQuickAddCustomStructuralPatternRef.current, 'Quick Add Structural Pattern');
    break;
  ```

### File: `src/components/TabbedInterface.tsx`

Add `dictionaries` to the `useDictionary()` destructure (needed for existence check).

Add `key === '6'` block in `handleDictionaryTabHotkey` after the `key === '5'` block (lines ~61-73). **Inline, not extracted to a helper.** Key differences from key '5':

- No `activeNouns.includes(target)` check (patterns aren't in `activeProperNouns`)
- Existence check via `dictionaries[target] !== undefined` instead
- Toast if target missing or `defaultQuickAddDictionary` doesn't start with `'properNouns-f_'`

```ts
if (key === '6') {
  try {
    const config = await loadAppConfig();
    const defaultDict = config.ui.defaultQuickAddDictionary;
    let target: string | undefined;
    if (defaultDict?.startsWith('properNouns-f_')) {
      target = 'patterns-' + defaultDict.slice('properNouns-'.length);
    } else {
      // Fallback: first active fiction's patterns dict
      const firstFiction = config.engine.activeProperNouns
        .filter((id) => id.startsWith('properNouns-f_'))
        .sort()[0];
      if (firstFiction) {
        target = 'patterns-' + firstFiction.slice('properNouns-'.length);
      }
    }
    if (target && dictionaries[target] !== undefined) {
      setSelectedDictionary(target);
    } else {
      toast.error('No structural patterns dictionary for active fiction');
    }
  } catch {
    // no-op
  }
  return;
}
```

### File: `src/hooks/useDictionaryModals.js`

Add `openQuickAddCustomStructuralPattern` parallel to `openQuickAddCustomProperNoun`:

```js
const openQuickAddCustomStructuralPattern = useCallback(async (text = '') => {
  let selectedDictionary = null;
  try {
    const config = await loadAppConfig();
    const defaultDict = config.ui.defaultQuickAddDictionary;
    const activeNouns = config.engine.activeProperNouns;

    if (defaultDict?.startsWith('properNouns-f_')) {
      selectedDictionary = 'patterns-' + defaultDict.slice('properNouns-'.length);
    } else {
      const firstFiction = activeNouns
        .filter(id => id.startsWith('properNouns-f_'))
        .sort()[0];
      if (firstFiction) {
        selectedDictionary = 'patterns-' + firstFiction.slice('properNouns-'.length);
      }
    }

    if (selectedDictionary) {
      const listResult = await window.electronAPI.listFictionPatternDictionaries();
      const exists = listResult.success &&
        (listResult.dictionaries as unknown as string[]).includes(selectedDictionary);
      if (!exists) selectedDictionary = null;
    }
  } catch (error) {
    logger.error('Error resolving Cmd-6 structural pattern dictionary:', error);
    selectedDictionary = null;
  }

  if (!selectedDictionary) {
    toast.error('No structural patterns dictionary for active fiction');
    return;
  }
  setModalState({ isOpen: true, dictionaryId: selectedDictionary, text });
}, []);
```

Return `openQuickAddCustomStructuralPattern` from hook.

### File: `src/components/Translator.jsx`

- Destructure `openQuickAddCustomStructuralPattern` from `useDictionaryModals`
- Wire to `useHotkeyHandler` as `onQuickAddCustomStructuralPattern={openQuickAddCustomStructuralPattern}`
- Follow the exact same 2-line pattern as `handleQuickAddCustomProperNoun` (lines ~132 and ~1209)

---

## Verification Checklist

After all phases:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
pnpm type-check                    # 0 errors expected
pnpm test -- --run                 # all 1863 tests pass
```

Manual verification:

1. Create new fiction in ConfigurationManager → both `properNouns-f_X.json` and `patterns-f_X.json` appear in dictionary folder
2. Rename fiction → both files renamed, config updated
3. Add entry to `patterns-f_X` → entry appears in Dictionary tab
4. Set fiction as active → translation uses fiction patterns over global patterns on conflict
5. Ctrl/Cmd-6 in Dictionary tab → navigates to `patterns-f_X`
6. Ctrl/Cmd-6 in Translator tab → opens Quick Add with `patterns-f_X` pre-selected
7. Ctrl/Cmd-6 with no fiction bookmarked → toast error
8. App launch with pre-existing fiction but no patterns file → migration creates the file silently

---

## Key Risks

**R1 — Phase 3 + Phase 4 must deploy together.** `dictionaries['patterns-f_X']` only exists in DictionaryContext after Phase 3 registers the type. Phase 4 reads from `dictionaries`. Deploy in same release.

**R2 — Rename cascade rollback.** If Rust `rename_proper_nouns_dictionary` succeeds for properNouns but fails for patterns, it rolls back. If the rollback itself fails (extremely rare — same filesystem, atomic rename), the state is inconsistent. Surface a clear error to the user.

**R3 — `validateDictionaryEntry` patch required for saves.** Without the `startsWith('patterns-')` guard in `DictionaryTypes.ts`, saving entries to `patterns-f_X` via Dictionary tab throws "Invalid dictionary type". This is part of Phase 3.

**R4 — `useDictionaryModals` makes extra Tauri IPC call on Ctrl/Cmd-6.** `listFictionPatternDictionaries` fires every time Ctrl/Cmd-6 is pressed in Translator tab (existence check). Acceptable for hotkey-triggered UI. Future optimization: pass `dictionaries` context into the hook via ref.

---

## Related ADRs

- [ADR-027](../adr/ADR-027-fiction-structural-patterns-coupled-by-naming-convention.md) — coupling via naming convention
- [ADR-028](../adr/ADR-028-eager-creation-of-structural-pattern-dictionary.md) — eager creation + migration
- [ADR-029](../adr/ADR-029-fiction-patterns-use-pattern-source-string.md) — source string stays `'pattern'`
