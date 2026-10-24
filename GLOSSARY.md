# Domain Glossary

## ChunkPostProcessor

Phase 5 post-processing over `TextChunk[]` arrays: punctuation translation and text reconstruction. Separated from `TextChunker` so that post-processing bugs have a single locality and the methods are testable with a `TextChunk[]` fixture without constructing a `TextChunker`.

Owns: `translatePunctuation(chunks, translateText)` (delegates to `translatePunctuationNormally` + `fixAngleQuotePositioning`; it runs twice per translation, once per batch and once over every chunk, and is idempotent because each run derives `translatedPunctuation` from the chunk's source `punctuation` (never from its own earlier output) and then decides the comma spacing; the dictionary is applied by `DictionaryManager.translatePunctuationText`, one longest-key-first scan over the punctuation trie that the engine hands in as a function, so a multi-character key like `……` works and a value is never looked up again), `reconstructText(chunks)` (Full Translation, both the per-batch and the final reconstruct; returns a string and never NFC-normalizes, which `finishFullText` does once over the whole text). Internally owns a `PunctuationProcessor` instance (constructed with no args; no injection needed — only one implementation exists).

`fixAngleQuotePositioning` handles the chunker's empty-chunk representation of `《` (a leading `《` is its own empty chunk): it moves the quote onto the next chunk's `openingPunctuation` and writes no `startedBy`, so the sentence-start context stays on the quote-only chunk for `applySmartCapitalization`'s walk-back. `「` (U+300C) is skipped by it — `QuoteProcessor.isOpeningQuote('「')` returns false; `applySmartCapitalization`'s walk back through empty chunks covers it. The WASM chunker that once accumulated `《` into the previous chunk is deleted (ADR-079).

`TranslationEngine` holds `this.chunkPostProcessor = new ChunkPostProcessor()` alongside `this.textChunker`. Both `translatePunctuation` call sites and all 3 `reconstructText` call sites go through `this.chunkPostProcessor`. `_computePunctuationSpacing` is the private spacing rule set under `reconstructText`; `_isThousandsSeparator` feeds it and `translatePunctuationNormally`.

Entry point: `src/utils/text/ChunkPostProcessor.js`. Not barrel-exported — callers import it directly.

## CharOnlySpacing

The character-only mode's spacing decision — `needsSpaceCharOnly(currentToken, nextToken, translatedValue, bufferEndsWithSpace)`, a third adapter alongside `needsSpace()` (`src/utils/text/TextAssembly.js`, the Full Translation path's spacing rules).

**Deliberately not the same function as `needsSpace()`.** `needsSpace()` decides spacing from already-translated segment text (Full Translation prebuilds segments, then assembles). Character-only mode appends one token's translation at a time and hasn't translated `nextToken` yet when the spacing decision is made — so `needsSpaceCharOnly` decides from the original (untranslated) token stream instead. This input-timing mismatch is why the extraction gives it its own module and its own characterization tests (`CharOnlySpacing.test.ts`) rather than folding it into `test-fixtures/text-assembly-parity.json`'s parity contract — a real shared contract would need the two functions to agree on what "the text" means, which they don't. Reshaping character-only mode to translate-first-then-assemble (enabling literal code reuse) was considered and rejected: it's the same shape of consolidation ADR-002's sibling highlighting system already tried and measured a 63% regression from.

Pure extraction, no behavior change — `bufferEndsWithSpace` (whether the assembled output already ends in a space) is passed in as a scalar so the function stays pure despite depending on accumulated-output state for its punctuation branch.

Entry point: `src/utils/text/CharOnlySpacing.ts`. Not barrel-exported — sole caller is `TranslationEngine.js`'s `translateWithCharactersOnly()`.

## TextFinishing

"Assembled text → final text", one named entry point per translation mode. Before, the Full Translation tail called `TranslationEngine.applyFinalCleanup` (a method that read no `this`, tested through `TranslationEngine.prototype.applyFinalCleanup.call({}, text)`) plus `.normalize('NFC')` at each call site, while character-only ended in `cleanupFormatting` plus `applyCharOnlySupplements` and ran neither the digit spacing nor the NFC. Its doc block claimed it ran for both modes and was called by `translateSinglePass`; it never was.

Interface (all pure, text in and text out):

- `finishFullText(text)`: `cleanFullText` then NFC. The Full Translation final text.
- `cleanFullText(text)`: `spaceLettersAndDigits` then `normalizeLineWhitespace`, no NFC. The progressive path cleans each batch with this before the whole text is finished.
- `finishCharOnlyText(text, translatePunct)`: `cleanupFormatting` (`capitalizeStart: true`), `applyCharOnlySupplements`, `spaceLettersAndDigits`, NFC.
- `spaceLettersAndDigits`, `normalizeLineWhitespace`: the two rules, exported for their tests.

**The modes differ on purpose.** Character-only does not run `normalizeLineWhitespace`: a line's leading indentation (a `U+3000` paragraph indent) survives, as `translateWithCharactersOnly` has always said it preserves whitespace, and Full Translation strips it. Character-only's whole-text `trim()` inside `cleanupFormatting` still drops a trailing newline, which Full Translation keeps. Character-only gained the letter/digit spacing (`abc123` → `abc 123`; digits next to Chinese were already spaced at token level by `needsSpaceCharOnly`) and the NFC, so an NFD dictionary value no longer breaks segment boundaries there either.

**Callers record click-to-highlight positions AFTER finishing**, because it changes length (see `src/utils/CLAUDE.md` §4). `translateWithCharactersOnly` finishes before its position-metadata loop.

**A thousands separator is not finishing's job.** `2,700` stays `2,700` in both modes, but a post-hoc `(\d), (\d)` regex would also merge a genuine list (`1, 2`). The rule needs the source comma, so `ChunkPostProcessor._isThousandsSeparator` owns it (an ASCII `,` between a digit-ended chunk and a digit-started chunk; full-width `，` is always a clause comma), asked by both `translatePunctuationNormally` and the reconstruct spacing. `translatePunctuation` takes an `allChunks` argument because a progressive batch holds only the translatable chunks and skips a digit-only `700`, so the comma's neighbour must come from the full list.

Pinned by `TextFinishing.test.ts` (the entry points, plus one engine-level parity block per mode) and `ChunkPostProcessor.test.js`.

Entry point: `src/utils/text/FormattingPasses.ts`. Not barrel-exported — `TranslationEngine.js` imports it directly.

## TextPositionMapper

Owns the single Chinese-text-order comparator: `resolveTokenIndex(tokenIndex)` (missing/negative sorts last, `Number.MAX_SAFE_INTEGER`) and `compareByTokenIndex(a, b)`. Was independently reimplemented with disagreeing missing-tokenIndex fallbacks (`?? 0` vs `?? Number.MAX_SAFE_INTEGER`) at 2 sort sites in `SegmentPrecomputer.ts` and as part of a two-key sort in `TranslationEngine.js`'s word-level builder before being unified. `CharacterOnlyBridge.ts`'s occurrence-counting scan is a different shape (linear scan, not a sort) and does not use this comparator.

Entry point: `src/utils/highlighting/TextPositionMapper.ts`, re-exported from `src/utils/highlighting/index.ts`.

## TokenClaim

The span claim: the one place a phase writes a match onto the token array (architecture review 2026-10-10, round 26, candidate #2). The leader token keeps the translation, every other token of the span is a follower consumed by it (`translated: null`, source `<leader source>_consumed`, `groupLeader` pointing back), per the consumed-token contract in `TranslationSourcePriority.ts`. Two shapes, because `postProcess` and highlighting read them differently:

- `claimSpan(tokens, startIndex, endIndex, source, translated, activeProperNouns?)` — the light shape, for Phase 1 patterns and Phase 3 numbers. No `isGrouped`, no `groupedWith`, the leader's `value` untouched, so a pattern-consumed token keeps its text.
- `claimGroupedSpan(tokens, startIndex, tokenSpan, source, translated, groupedText, activeProperNouns?)` — the grouped shape, for Phase 2 proper nouns, Phase 4 phrases and Phase 5 characters. Also marks the span `isGrouped`, records `groupedWith` and `originalValue`, and rewrites the leader's `value` and `end` to the grouped text. When it overwrites an earlier phase's leader it releases that leader's followers beyond the new span. A one-token span is a plain leader.

Both log (never throw) a leader with no translation and a source `getSourcePriority` does not rank, which closes the "unknown source ranks 999" gap for the plain-JS callers `tsc` cannot check. The Phase 5 sentinels (`untranslated-chinese`, `preserved-*`) and `NumberLiangFix` write tokens directly and stay outside it.

- `isClaimed(token)` — the read side (architecture review round 32, candidate #3): `translated !== null || translationSource`. Every phase's skip test and span check uses it, and so does `NumberProcessor`. Two fields are enough because every writer of `isGrouped`, `groupLeader` or `translated` sets `translationSource` in the same call, and the orphan release clears them together.

- `placeSpan(tokens, startIndex, endIndex, source, translated, originalText, sink, activeProperNouns?)` / `placeGroupedSpan(tokens, startIndex, tokenSpan, source, translated, groupedText, sink, activeProperNouns?)` — **Placement** (ADR-109): the claim above, then the match's semantic unit recorded from the same `source` and `translated`, so a token and its unit cannot disagree. `sink` is `{ builder, chunkOffset }`: `builder: null` claims without recording (the character-only pass), and `undefined` is logged. Every phase that claims places; `addUnit` is called directly only where no claim exists (the Phase 5 pass-through branch, `CharOnlyAssembly`).

Interface: pure mutation of the passed `tokens` array and the `sink`'s builder (`isClaimed` only reads); no `this`, no engine state — testable standalone. Entry point: `src/utils/TokenClaim.ts`. Not barrel-exported — callers are `TranslationEngine.js` and `NumberProcessor.js`. Pinned by `TokenClaim.test.ts` and, field by field per phase, `TokenState.characterization.test.js`.

## UnitHighlightPredicate

The shared "is this unit highlighted" check for the 3 Clickable* components (`ClickableOriginalSemantic`, `ClickableTranslationSemantic`, `ClickableTranslationOptimized`).

Interface: `isUnitHighlighted(unitIndex, ...highlightValues)` — variadic so it covers all three shapes (a single value for every component today; the variadic form is kept for any caller that needs an OR). Each `highlightValue` can be `number | number[] | null | undefined`. `-1` is treated as the codebase-wide "cleared" sentinel (see `HighlightResolver.ts`) and never matches, even in the pathological case where `unitIndex` itself were `-1`.

Entry point: `src/utils/highlighting/UnitHighlightPredicate.ts`, barrel-exported from `src/utils/highlighting/index.ts`.

## HotkeyDispatchTable

The pure dispatch table that maps (key + modifiers + app context) → `HotkeyAction | null`. No side effects, no React, no DOM. Input: a `KeyboardEvent`-shaped object (`key`, `metaKey`, `ctrlKey`, `shiftKey`) plus `MatchHotkeyContext` (`visibleTab`, `ownTab`, `canUndo`, `canRedo`, `isInputFocused`). Output: a discriminated union action tag, or `null` if no shortcut matches.

Two terms belong to it. The **visible tab** is the tab on screen, read from `VisibleTabProvider` — never inferred from a component being mounted, since every tab stays mounted. The **hotkey owner** (`ownTab`) is the tab a registration belongs to, or `'app'` for the tab container's own. Several registrations hear every key, so the table answers a registration only while its owner is the visible tab (an `'app'` one always), then applies each action's own tab rule against the visible tab. Every tab rule lives in the table, none in the hook or at call sites.

_Avoid_: active tab (for the owner; it read as "the tab showing" at one call site and "my tab" at another, which is how Cmd+Z on the Reader came to undo a dictionary edit).

Key normalisation: `event.key.toLowerCase()` is used throughout so `Cmd+Shift+Z` (browser yields `key='Z'`) and `Cmd+Z` (`key='z'`) both land in the same branch, discriminated by `shiftKey`. `Cmd+Shift+R` returns `null` (explicit `!shift` guard on `reloadDictionary`).

`useHotkeyHandler` calls `matchHotkey`, then `event.preventDefault()`, then a `dispatch` switch that invokes the appropriate callback ref. All clipboard I/O, toast calls, and React wiring stay in the hook — they are not part of the dispatch table.

Entry point: `src/utils/ui/HotkeyDispatchTable.ts`. Called exclusively from `useHotkeyHandler`.

## AppearanceSettings (hook)

The settings persistence and CSS application layer for the Appearance tab. Owns: settings state, load from `window.electronAPI.loadAppearanceSettings()` on mount (merges with `DEFAULT_APPEARANCE` defaults), save via `window.electronAPI.saveAppearanceSettings()` on blur/reset/checkbox, and CSS custom property application to `document.documentElement` via `applyAppearanceToCssVars` (exported from `AppearanceReducer.ts`) called in `useEffect([appearance])`. Two call sites apply CSS vars: this hook (on every appearance state change) and `App.jsx` (startup bootstrap before `AppearanceManager` mounts, to prevent FOUC). `applyAppearanceToCssVars` is the single canonical list of all 13 CSS custom properties — adding a new property requires editing only that function.

`characterOnlyFollowsFullTranslation` is stored inside `AppearanceSettings` only (no separate state). When the flag is set, `handleFontChange` automatically mirrors any Full Translation property change to Character Only in the same `setAppearance` call.

All returned handlers are stable (`useCallback([], [])`); async handlers read current state via `appearanceRef` to avoid stale closures.

Entry point: `src/hooks/useAppearanceSettings.ts`. Used exclusively by `AppearanceManager` in `src/components/appearance/AppearanceManager.tsx`.

## PatternEntryRules

The canonical home for pattern-entry variable rules — called by `PersistTimeValidator.ts`, which the form and every write share.

Rules, both operating on the `PatternTemplateEngine.isVariableChar`-based extraction (a capital letter fused to a real word, e.g. the `Y` in "Yến", is never read as a variable). This module no longer owns the letter set: `PATTERN_VARIABLE_LETTERS` (X/Y/Z/`#`) lives beside `isVariableChar`, which both pattern matchers now share with the validator — see `src/utils/CLAUDE.md` §3, "Pattern variable recognition":

- **Structure** (`checkVariableStructure(source)`) — source-only, so it can run before a translation exists: each of X/Y/Z may appear **at most once**, and variables must be introduced in order — Y requires X, Z requires Y. `X给X` and `是Y的` (Y without X) are both invalid.
- **Symmetry** (`checkVariableSymmetry(source, translation)`) — full bidirectional check: every variable in source must appear in translation, and every variable in translation must appear in source.
- `validatePatternVariables(source, translation?)` composes both — runs structure always, symmetry only once `translation` is non-blank (supports form-time's progressive-typing UX, where the translation field may not be filled in yet).

Entry point: `src/utils/dictionary/PatternEntryRules.ts`.

## PersistTimeValidator

The one home for "is this entry valid for this dictionary". The Add/Edit form (`useDictionaryEntryForm`) and the persist path (`planAdd` and `planUpdate` in `DictionaryEdit.ts`, which add, update, patch and rename all pass through) call the same function, so a rule cannot hold on one and not the other. A move writes no new value: `planMove` is gated by `canMoveBetween` alone, and a move into a lookup table such as `characters` is refused there.

Exports:

- `checkEntry(dictionaryId, source, translation) → { base, character, pattern }` — one message per rule, `null` where it passes; the rules are independent of each other. `base`: empty check + `MAX_ENTRY_LENGTH` (10 000, the DoS limit) and an unknown dictionary id. `character`: a `characters` source is at most one character, counted in code points (a lone 𠮷 passes). `pattern`: `PatternEntryRules.validatePatternVariables`, for `patterns*` dictionaries.
- `firstEntryError(check) → string | null` — base, then character, then pattern.
- `validatePersistEntry(dictionaryId, source, translation) → string | null` — `firstEntryError(checkEntry(…))`.
- `baseValidation`, `MAX_ENTRY_LENGTH`.

The form derives one `checkEntry` result from what is typed on every render (`useMemo`, no state, no debounce) and reads everything off it: `showCharacterValidation` and `showPatternValidation` from `check.character` and `check.pattern`, so the live flags still show while the translation is empty, and `isFormValid` as `firstEntryError(check) === null`, so Save is disabled exactly when submit would refuse. Until 2026-10-13 the flags were state with three writers, and a 300 ms debounce re-checked the source against the translation it closed over, flagging a pattern entry fixed within that window. The character rule is enforced on every add, update, patch and rename; a move into `characters` cannot happen. Existing entries are not re-validated; only a write is.

Entry point: `src/utils/dictionary/PersistTimeValidator.ts`. Not barrel-exported — callers import it directly.

## EntryValue

A dictionary entry's value: reading it (`entryFields(value)` — every field for both the string and the object shape, absent metadata as `false`/`''`/`{}`; the UI reads entries only through it, while load and trie paths keep their own shape-validating checks), and the pure pieces of changing one field (`applyEntryPatch`, `toggleVariableType`). Also the single "build a dictionary entry's metadata object" function — `buildEntryMetadata({allowAsPatternVariable, semanticType?, allowedVariableTypes?}) → DictionaryEntryMetadata`.

**No dictionary-type gate, by design.** `planAdd`/`planUpdate` (`DictionaryEdit.ts`) are the sole real authority on whether metadata is kept — it decides object-vs-string storage purely from `dictionaryId`, discarding whatever this function returns for pure lookup-table dicts (`characters`/`conversion`/`punctuation`) regardless of shape. The three old gates were redundant with that, not competing sources of truth — no live bug existed before unification (unlike `MoveDialog`'s candidate #1), just three reimplementations of something a fourth place already owned. The dropped `allowedVariableTypes` patterns-only restriction was similarly dead in practice: the only UI that ever mutates `allowedVariableTypes` (`TypeToggleCell` in `VirtualRowComponent`, `SemanticTypePicker`'s X/Y toggle block) is itself patterns-gated, so the field structurally can never be non-empty for phrases/properNouns regardless of whether this function re-checks it.

Entry point: `src/utils/dictionary/EntryValue.ts`, barrel-exported from `src/utils/dictionary/index.ts`. `buildEntryMetadata` is called from `VirtualRowComponent.tsx`'s source-rename commit, `useDictionaryEntryForm.ts`'s submit handler, and `patchEntry` (`useDictionaryCRUD.ts`) — the one place a single-field edit (badge, toggle, inline translation, duplicate view, Rules-tab Matches view) is turned into a full update.

## MatchComparator

The single dictionary match ordering rule (ADR-010: specificity over provenance). Longer match wins; equal-length matches tie-break on lower priority number. Was independently reimplemented at 4 sites (JS sequential, JS parallel, WASM lookup, lookup-index post-fetch sort) before being unified — one of the 4 sites carried a `?? 0` undefined-priority guard the other 3 didn't need.

Interface: `compareMatchesBySpecificityThenPriority(a, b): number`, taking `{ word: string; priority: number }`. Priority is a required field; every caller has one (the only caller that could lack it, the Rust lookup index's post-fetch sort, was deleted with the index, ADR-108).

Entry point: `src/utils/dictionary/MatchComparator.ts`. Not barrel-exported — all 3 callers live inside `src/utils/dictionary/`. Called from `DictionaryManager.findAllMatches`.

## NumberProcessor

Phase 3 number conversion — pure JS, no WASM path. `TranslationEngine.js:348` instantiates `this.numberProcessor = new NumberProcessor()` once at construction; the Phase 3 call site (`TranslationEngine.js:6317`, inside a try/catch at `:6306-6353` that logs and continues on failure) calls `processTokens(tokens, options)`, the class's one public entry point. ~22 internal conversion helpers (`convertFourDigitYear`, `convertHundreds`, `convertThousands`, `convertPercentage`, `parseChineseNumber`, etc.) plus two debug helpers (`getDebugInfo`, `testConversion`).

`wasm-core/src/number_processor.rs` still compiles (kept as a spec/parity test suite per `wasm-core/CLAUDE.md`) but carries no `#[wasm_bindgen]` export and has zero runtime callers — do not confuse it with this module when debugging a number-conversion bug; the real behavior is entirely in this file.

**What it converts is pinned once, in `test-fixtures/number-parity.json`**: cases of a text and the spans it converts (`start`, `length`, `translated`). `src/utils/__tests__/NumberProcessor.parity.test.js` runs it against this module and `mod tests::parity` in `number_processor.rs` runs the same file through `process_tokens`, both asserting the consumed-token contract (`number_conversion` leader, `number_conversion_consumed` followers with `translated: null`). A conversion rule changes in the fixture first. A case the Rust spec intentionally does not match carries `ignore: { rust: "<reason>" }`; an empty reason fails (ADR-041, addendum 2026-10-07). `NumberProcessor.test.js` keeps only internal functions called directly and token-state input (already-translated tokens, empty and non-Chinese input).

Entry point: `src/utils/NumberProcessor.js`. Called exclusively from `TranslationEngine.js` Phase 3 block.

## App file

One of the four JSON files the app keeps beside the dictionaries: `config.json`, `appearance.json`, `transform-rules.json` and `books.json`. Each is created by `createAppFile` (`src/utils/appFile.ts`) and wrapped by its own module (`appConfig.ts`, `appearanceConfig.ts`, `TransformRuleBackend.ts`, `BookRecordsBackend.ts`), which keeps its own public functions. The file's module supplies only the IPC calls, a parser that reports dropped items, and what a failed read does. The App File owns the rest. **Rust owns each file's shape, TS owns its defaults**: an absent or set-aside file reads as the kind's empty value (`{}`, or `[]` for the rules) from `BlobKind::empty_value`, and the wrapping module parses it into the app's defaults. Until then Rust carried its own copy of the appearance defaults, which had drifted (no `paragraphSpacing`, `theme` or `characterOnlyFollowsFullTranslation`) and was invisible only because every load went through `fromRaw`. Pinned by `emptyAppFilePayloads.test.ts` and `test_blob_kind_empty_values_carry_a_shape_and_no_content`. Until then each module hand-copied the rest, and the copies drifted: appearance had no lock, so two saves could race.

- **Read once, cached, observable.** `read()` loads on first use. `subscribe`/`snapshot` report every change to the cache; the shelf reads book records this way.
- **One write: `transform(fn)`.** It runs under one lock per file against the freshest value, and returning the value unchanged saves nothing. A file's own save functions are transforms: `saveAppConfig(patch)` merges, and appearance and rules replace the whole value.
- **`writeExternally(fn)`** is for a Rust command that writes the file itself (config's `callRustConfigWrite`). It runs on the same lock and drops the cache on success.
- **Dictionaries are not App Files.** Every write to them goes through the Dictionary Store's one queue (ADR-052, ADR-055), and a failed load never falls back to defaults (ADR-053, "Unread dictionary").

### Unreadable app files

**An App File that failed to load is never saved over**. Until then every loader turned a failed load into "no data" and cached it, so the next save replaced the file: one corrupt `books.json` and the next rescan erased every position and binding.

- **Unreadable content** (invalid JSON, not UTF-8, over the size limit): Rust's `load_blob` renames the file to `<stem>.corrupt-<ms>.json` beside it and returns the defaults with `quarantined` naming it; the App File toasts once (`reportQuarantine`). The data survives for recovery, and the next save lands on a fresh file.
- **A failed read** (permission, I/O — a retry may work): nothing moves, and nothing is cached. Books and rules are `onUnreadable: 'throw'`, so every read-modify-write fails before it saves. Config and appearance are `'defaults'`, so the app still runs, but every `transform` refuses ("Couldn't read X; not saving over it") until a load succeeds.

The protocol is pinned once by `appFile.test.ts`, each file's wiring by `UnreadFileNeverSavedOver.test.ts`, and the Rust half by the `test_blob_*` quarantine tests in `dictionary_commands.rs`.

## Unread dictionary

A dictionary whose file exists but failed to load: invalid JSON, over 10 MB or 50,000 entries, nested too deep, or a read error that survived the retry. It is **left out of the provider's `dictionaries`** and listed in `unreadDictionaryIds` (both kept by the Dictionary Store), and nothing saves over its file until a Reload reads it cleanly (ADR-053). Until then the load protocol put `{}` in its place, the planners accepted it as an empty dictionary, and the next Add saved a one-entry file over everything it held.

- **Not quarantined**, unlike the app files: the file stays where it is. You fix it by hand and press Reload (the Dictionary tab's notice, or force reload, which retries every unread id).
- **Every edit refuses it for free**: the plans already reject a dictionary that is not in memory, and `EditCommitter` names the reason ("Couldn't read X.json; not saving over it"). Undo and redo refuse too, since the dictionary counts as changed.
- **A failed Reload of a loaded dictionary makes it unread.** Reload means "trust the disk", so the in-memory copy is dropped instead of saved over the file.
- **A missing file is not unread.** Nothing seeds the dictionary directory, so `patterns`, `phrases` and the other hard-coded ids have no file on a fresh install or after a reset. The parallel loader returns `{}` for them, and the first Add creates the file.
- **Translation runs without it.** The engine skips an absent id. The selector and the Add form label it "— couldn't read", and Cmd-6 says `unread`, not `pairMissing`.

Pinned by `DictionaryContext.unread.test.tsx` (the whole chain over a fake IPC) and `test_load_parallel_loads_a_missing_file_as_empty` in `dictionary_commands.rs`.

## AppConfig

The single module owning the app configuration lifecycle: load from disk, validate, cache, and save via read-modify-write. Entry point: `src/utils/appConfig.ts`. Exposes three typed sub-objects:

- **EngineConfig** — fields that affect translation behavior (`wasmEnabled`, `wasmMemoryLimit`, `activeProperNouns`)
- **UIConfig** — fields that affect UX only, zero translation impact (`defaultQuickAddDictionary`)
- **SessionConfig** — runtime-mutable UI persistence (`lastSelectedDictionary`)

All three are slices of the same on-disk JSON file. `loadAppConfig()` loads once and caches; `saveAppConfig(patch)` merges the patch so callers only provide the fields they own.

**A write that decides from what it reads uses `transformAppConfig(fn)`, not `loadAppConfig()` then `saveAppConfig()`**. `fn(current)` returns `{ value, result }` and runs under the file's lock against the freshest config, so a write that landed after the caller's own read is not overwritten; returning `current` saves nothing, and `result` carries the decision back (`BookBindingContext`'s `writeAnswer` and tier move return whether the active list changed, and only then rebuild the engine). `saveAppConfig(patch)` is a transform that merges. Creating a dictionary is one too (`BookBindingStore.createDictionary`): it adds the new id to the active list and leaves the quick-add default alone. The list arithmetic is `activeListChange` in `BindingActivation.ts` (add an activated id, apply an open book's binding to the fiction slice, report whether the list changed), shared with `bindingConfigChange`, which adds the quick-add default on top. `handleToggleDictionary` is one too (ADR-059): it computes under the lock with `activeProperNounsAfterToggle`, passing the open book's bound dictionary in, because the file's value does not carry the binding.

**`subscribeAppConfig(listener)`** reports every change to the cached config: a load, a save, a Rust-side write (`callRustConfigWrite` drops the cache) or an `invalidateAppConfig`. A component that renders from config uses `useAppConfig()` (`src/hooks/useAppConfig.ts`, `useSyncExternalStore` over `getAppConfigSnapshot`/`subscribeAppConfig`): every tab stays mounted, so a mount-time read goes stale when a book opening rewrites `defaultQuickAddDictionary`. `snapshot()` is `null` before a load, after a Rust write and after a failed read, so the hook starts a load, serves the last config it saw while one is pending, and shows `DEFAULT_APP_CONFIG` (silently) for an unreadable file. A handler, which decides from the current value, still uses `loadAppConfig()` or `transformAppConfig`.

Tests that want the real lock, diff and no-op saves use `installFakeConfigDisk()` (`src/test/fakeConfigDisk.ts`), a fake `config.json` behind `window.electronAPI.loadConfiguration/saveConfiguration`; mutating `disk.raw` plays a Rust-side write. `BookBindingContext.test.tsx` and the Configuration tests use it; the other test files still mock `appConfig`.

**`saveAppConfig` is not the only writer of `config.json`.** `src-tauri/src/dictionary_commands.rs`'s `substitute_dictionary_reference` (rename, both directions) writes it directly, bypassing `saveAppConfig`; it is the only Rust writer (create no longer activates, see "Create no longer writes config in Rust" below). `appConfig.ts`'s cache is never invalidated by a Rust write on its own, so a `saveAppConfig()` made after one and before the cache is told would overwrite disk with whatever stale values the cache still holds for fields it doesn't explicitly patch.

**Create no longer writes config in Rust.** `create_proper_nouns_dictionary`/`create_fiction_dictionary_pair` only create files and return a plain `ok()`; the patterns-half rollback only removes the file. Activating the new dictionary is `BookBindingStore.createDictionary`'s own `transformAppConfig`, on the binding queue: it adds the id to `activeProperNouns` and touches nothing else (a quick-add default the reader set is not its to move), with no engine rebuild, like a toggle. With a book open the fiction slice stays the book's (`activeProperNounsForBinding`), so a new fiction dictionary the book is not bound to is created and listed but not activated; before, Rust appended it and left two fiction dictionaries active. A failed activation resolves `{ success: true, warning }` (the files exist and are loaded) and the Configuration tab shows the warning; before, an unreadable `config.json` was skipped without a word. `createAndBind` still writes the list once, through its bind. Rename keeps its Rust config edit (ADR-060 addendum).

**`callRustConfigWrite(fn)` is the seam for this** — a hand-placed `invalidateAppConfig()` after each handler's Rust IPC call reopened the race: `handleConfirmRename` called it two awaited `loadDictionary` round-trips too late, leaving a window where a concurrently-fired `saveAppConfig` (e.g. `handleToggleDictionary`, `handleSetDefaultQuickAdd`) could merge onto the pre-rename cache and revert Rust's write. `callRustConfigWrite` and `saveAppConfig` now share one FIFO lock (the config App File's — `writeExternally` and `transform`; see "App file") — any config-disk write, Rust-direct or plain, queues behind whichever is already in flight instead of racing it. `callRustConfigWrite` runs `fn`, invalidates the cache on success, then releases the lock, so the next queued write always sees fresh state. Create no longer goes through it, since its Rust command writes no config; rename does. Any new Rust command that writes `config.json` directly should route its TS caller's IPC call through `callRustConfigWrite` rather than hand-calling `invalidateAppConfig()` — the ordering mistake is no longer possible to make by hand-placement, not just documented against.

## tauriAPI

`src/tauriAPI.ts` is the typed IPC adapter between JS/TS and the Rust commands, and **the single source of the IPC type**: `ElectronAPI` (`ElectronTypes.d.ts`) is `typeof tauriAPI`, so a command is declared once, in the wrapper (and `src/__tests__/IpcCommands.parity.test.ts` holds `CMD` to Rust's `generate_handler!` list: a command that is declared but not registered, registered but not wrapped, or wrapped but not registered fails it), and `window.electronAPI.someCommandThatIsNotThere` is a compile error. Adding a command is a Rust function plus a wrapper here, nothing else. The same test holds each command's **argument keys** to its Rust parameters (a wrapper key Rust does not take, or a required parameter the wrapper does not send, fails it; an `Option` parameter may be left out, since Tauri ignores an unknown key and reads a missing optional one as `None`). **Response types are still written by hand on both sides and nothing checks them**; that would take codegen (`ts-rs`, `specta`), not in use.

One way in: `window.electronAPI`, installed by this module (`main.jsx`'s side-effect `import './tauriAPI'`). Every production caller reads it lazily inside a function, and every test stubs it as a plain global (`global.window.electronAPI = { … }`; `fakeConfigDisk` and `fakeDictionaryDisk` build on that). Production code does not import `tauriAPI` for a value — `TauriApiAccessPath.test.js` scans for it; type-only imports and `typeof import(…)` are fine, and `TranslationEngine.js` handing `window.electronAPI` to `DictionaryManager` as an option is injection of the same object. The name `electronAPI`/`ElectronAPI` is from the Electron days; renaming it touches ~14 production files, ~30 test files and the docs, for no behaviour change, and was left for its own commit. Two failure contracts, on purpose: most commands return `{ success: false, error }` (`callTauriCommand`), the Reader's reject (`callReaderCommand`), because every Reader call has a place to show the error. A backend module over the global was rejected in ADR-014: it is trivially stubbable and one adapter is not a seam.

## Token source

The `translationSource` string on a token: which phase wrote it, and whether the token is a **leader** (carries `translated`) or a **consumed follower** (`<leader>_consumed`, `translated: null`). One module owns the taxonomy: `src/utils/TranslationSourcePriority.ts` builds consumed sources (`consumedSource`), recognises them (`isConsumedSource`, `isPatternSource`), ranks leaders (`getSourcePriority`: Phase 1-5, 999 for an unrecognised string) and enforces the consumed-token contract (`validateConsumedTokenContract`, both directions, logged not thrown). Nothing else concatenates or tests the `_consumed` suffix. Sources stay plain strings on tokens because the Rust side emits them (`two_phase.rs`, `number_processor.rs`); `TranslationSourcePriority.sourceScan.test.js` holds every Rust-emitted string to `PHASE_PRIORITIES`, and `PHASE_PRIORITIES` is `satisfies`-checked against the `.d.ts` leader type.

## WASM readiness verdict

## WasmProcessorLifecycle

The shared initialization contract for WASM processors. Owns the invariant sequence every WASM processor must run before its instance is usable: `instantiateFn()` → instance method verification (the binary is loaded by `WasmSharedModule`, not the lifecycle). Wraps the sequence in exponential-backoff retry (transient errors only) and tracks initialization state (`isReady`, `hasFailed`, cooldown).

One WASM processor holds a `WasmProcessorLifecycle` instance today: Pattern. (There were seven: Dictionary went with ADR-073, StringProcessor with ADR-078, TextChunker, TextAssembler and TextTokenizer with ADR-079, ConflictResolution with ADR-083.) The class is generic over `{ name, expectedMethods }` and the registry over holders on purpose: ADR-083 kept `WasmCascadeRegistry` with one wrapper, because `WasmSharedModule` and the wrapper both register a retire handler. Every `instantiateFn` calls `loadSharedWasmModule()` (`WasmSharedModule.js`) rather than the generated `init`, so the binary is verified and instantiated once (ADR-009, "Current state"). The processor module provides `instantiateFn`: a function that receives the verified binary and returns the configured WASM instance. Domain-specific setup (e.g., loading pattern dictionaries into the WASM instance) happens inside `instantiateFn` before it returns. Runtime error handling (toasts, fallback mode) stays in the processor module — the lifecycle only owns the init lifecycle.

Entry point: `src/utils/wasm/WasmProcessorLifecycle.js`.

## PerformanceMonitor

Running timing stats for translations. Owns: the aggregate (`totalOperations`, `avgTime`, `minTime`, `maxTime`, `opsPerSecond`), `record(durationMs)`, `getMetrics()`, `reset()`. Every recorded operation updates the aggregate; there is no sampling, buffer or metrics cache (deleted 2026-10-09, `docs/guides/deleted-symbols.md`).

Exports `globalPerformanceMonitor` singleton. Readers: `usePerformanceMonitoring` (records each completed translation, reads `getMetrics().avgTime` for the stats chip) and the dev console's `performanceDashboard.getStats()`. `TranslationEngine` does not use it. There is no regression detector behind it (ADR-069).

Entry point: `src/utils/performance/PerformanceMonitor.js`.

## TranslationProfiler

Per-phase profiler for the 5-phase translation pipeline. Tracks wall-clock time per phase (pattern, properNouns, numbers, phrases, characters) plus total. Interface: `enable()`, `disable()`, `profile(phase, fn)` (async), `profileSync(phase, fn)`, `recordTime(phase, timeMs)`, `getReport()`, `printReport()`, `reset()`. Dev/debug tool: it reports a table and gives no advice (the old `getRecommendations()` told readers to migrate dictionary phases to WASM, which ADR-073/078/079 measured as slower and deleted; 2026-10-07). Its numbers include awaits, so they are wall-clock, not CPU share.

Single caller: `TranslationEngine` (`this.phaseProfiler = new TranslationProfiler()`). Accessed via engine methods `enableProfiling()`, `disableProfiling()`, `getProfilingReport()`. Not a production monitoring path — disabled by default (`enabled = false`).

Entry point: `src/utils/performance/TranslationProfiler.js`.

## Pattern Profiling (TwoPhasePatternProcessor)

Per-operation profiler internal to `TwoPhasePatternProcessor` — tracks wall-clock time/call-count for `extractSemanticTokens`, `buildVariableCache`, `processTokensWasm` (the 3 sub-steps of `processTokens()`). Interface: `enableInternalProfiling()`, `disableInternalProfiling()`, `resetInternalProfiling()`, `getInternalProfilingReport()`, `printInternalProfilingReport()`. Dev/debug tool — used to identify which sub-step of pattern matching dominates cost. Disabled by default (`enabled = false`), zero overhead when off.

Accessed via `TranslationEngine` delegators: `enablePatternProfiling()`, `disablePatternProfiling()`, `resetPatternProfiling()`, `getPatternProfilingReport()`, `printPatternProfilingReport()`. Not a production monitoring path. See ADR-021 addendum — same protected-dev-tool reasoning as `TranslationProfiler`, decided kept.

Entry point: `src/utils/pattern/TwoPhasePatternProcessor.js`.

## PatternStore

The parsed pattern list, the WASM pattern processor's lifetime, and whether Phase 1 runs. `initializePatterns(patternsDict)` turns the patterns dictionary into entries `{ originalPattern, template, allowAsPatternVariable }` (what `TwoPhasePatternProcessor` and the variable cache read), warns when a template drops a variable its pattern declares, and calls `reinitializeWasmPatternProcessor` with the raw dictionary, recording the result in `wasmAvailable`. When patterns are loaded and `wasmAvailable` is true, it builds the one `processor` (`TwoPhasePatternProcessor`). When it is false, no processor is built, Phase 1 is skipped and the user gets an error toast. It does no matching itself: the Rust matcher is the only one (ADR-101). `matchTokens(tokens, { activeProperNouns, dictionaryManager })` returns the matcher's results, or `null` when Phase 1 is skipped. A matcher failure is caught, counted by its `PatternFailureTracker` and toasted. Enough failures within the window set `enabled` to `false` for the store's lifetime. The engine's `applyPatterns` only applies what comes back (ADR-101 addendum 2026-10-21). Held by the engine as `patternStore`; formerly `SemanticPatternProcessor`.

Entry point: `src/utils/pattern/PatternStore.js`.

## PatternVariableCache

The dictionary lookup algorithm behind the pattern variable cache. Builds a `word → {translation, source, type}` map from dictionary state; `TwoPhasePatternProcessor` passes this map to the WASM matcher before executing.

Three lookup stages run in fixed order, each able to overwrite earlier entries: (1) phrase entries with `allowAsPatternVariable`, (2) proper noun single-token dictionary lookups, (3) full-text scan for multi-character proper nouns. The rule that types an entry lives in the module (`resolveType(source, metadata)`: the entry's `semanticType`, else `'concept'` for a phrase source, else `null` for untyped, read as `'unknown'` at match time). Every entry is kept whatever its type — which variable it may fill is decided at match time, not here (a pattern-level prefilter, `buildTypeFilter`, was deleted: it never engaged, and would have dropped entries the day it did). The tokens are always untranslated when Phase 1 builds the cache, so no stage reads a translation off them: a stage over already-translated proper noun tokens, a TwoPhase step over `patternSemanticType` and a `resolveType` callback supplied by the caller were deleted 2026-10-24 (0 of 67,113 tokens over 8,382 real-library calls had either field set).

Entry point: `src/utils/pattern/PatternVariableCache.js`.

## ProperNounCapitalizationMap

A `Map<string, string>` built once during engine initialization that maps `lowercase(vietnamese) → original-capitalized-vietnamese` for all active proper noun dictionaries. Used by the translation engine to restore proper-noun casing after post-processing lowercases output. Enforces a `MAX_PROPER_NOUN_TRANSLATIONS` size cap with a one-time warning on first overflow.

Entry point: `src/utils/text/ProperNounCapitalizationMap.ts` — `buildProperNounCapitalizationMap(dictionaries, activeProperNouns, limit)`. Assigned to `TranslationEngine.properNounTranslations` in `initialize()`.

## DictionaryOperationHistory

Dictionary undo/redo: a list of committed Dictionary Edits (`DictionaryEdit[]`), a cursor, a `MAX_HISTORY = 100` cap. `record(edit)` (drops the redo tail), `undo()` commits `invert(edits[cursor])`, `redo()` commits `edits[cursor + 1]`, `clear()`. Both go through the provider's `EditCommitter`, so a stale undo — one whose keys changed since — is refused with a warning toast naming the keys, and the cursor stays put.

The list and cursor live in a ref, not state: the edit an undo picks and the cursor move after it both happen inside the undo's turn in the commit queue, so a queued edit never records itself between them. A version counter re-renders `canUndo`/`canRedo`. Cleared on dictionary import and after a pair rename — both rewrite dictionaries outside history — inside that operation's turn in the Dictionary Store's queue (`onApplied`). A reload of one dictionary keeps it.

Entry point: `src/components/dictionary/useDictionaryHistory.ts`. Used exclusively by `DictionaryProvider` in `DictionaryContext.tsx`.

## DictionaryCRUD

All 6 dictionary mutation operations: `addEntry`, `updateEntry`, `patchEntry`, `renameEntry`, `bulkDeleteEntries`, `moveEntries`. Delete and move each take a list, so one entry and many are the same operation with the same outcome policy (ADR-110). Each plans a Dictionary Edit and commits it through the provider's `EditCommitter`, recording it on success; this module adds error typing and the user-facing message (sanitize, validate and the typed value for `phrases`/`patterns`/`properNouns*` vs plain string dicts belong to the Dictionary Edit plans). `patchEntry` reads the current value inside its commit turn, so two queued patches each start from the other's result.

Injected dependencies: the `EditCommitter` and history's `record`, both stable, so all 6 returned callbacks are stable.

Entry point: `src/hooks/useDictionaryCRUD.ts` (moved from `src/components/dictionary/` in commit `27a42dd`, superseding ADR-026). Used exclusively by `DictionaryProvider` in `DictionaryContext.tsx`. Wiring tests (`src/hooks/__tests__/useDictionaryCRUD.test.ts`, real committer over a fake disk): I1 record-on-success, I3 error-propagates-clean, I4 single-toast-on-error (add/update/patch/delete only — `moveEntries` never toasts on failure, by design; `MoveDialog.tsx` owns error display for move ops via its own inline error banner).

## DictionaryTrie

The per-dictionary lookup structure. A prefix trie where each node owns `children: Map<char, TrieNode>`, `isEndOfWord`, `translation`, and `metadata`. Core operations: `insert`, `get`, `getWithMetadata`, and `findMatches(text, startPos)`, the one prefix walk (every word starting at `startPos`, shortest first, with `endPos` and `metadata`). `DictionaryManager.findAllMatches` and `PatternVariableCache` stage 2 both read matches through it; nothing outside the class touches `root`, which is `@private` (only the dispose test looks, to check it is emptied).

**`findMatches` walks by code point and reports UTF-16 offsets**. `insert` keys the trie by code point, so a UTF-16 walk could never match a word holding an astral character (CJK Ext-B, e.g. `𠮷`) although `get` could; the walk had been copied into `DictionaryMatchLookup.findMatchesThreadSafe` with the same flaw, while `PatternVariableCache` stage 2 hand-walked `root` by code point and so disagreed with it. `endPos` stays a UTF-16 offset because callers slice JS strings with it. Pinned by `DictionaryTrie.test.ts`.

`getStats`/`countNodes`/`getMaxDepth`/`getAverageDepth` stay because `DictionaryManager.loadDictionaries` calls `getStats()` for every dictionary at load, but only `getGlobalStats` (a dev-console read, `window.translationEngine.dictionaryManager.getGlobalStats()`) reads the result, and it costs four full-tree walks per dictionary at load. Left for its own review.

`dispose()` is mandatory before discarding an instance — recursively nullifies all node references for GC.

Confirmed dead by `ADR-034`: `repair()`/`getHealthScore()` had zero callers anywhere, ever; `validateIntegrity()`'s only 2 callers were the other two methods, so the whole subsystem was a closed, unreachable island. Unlike `TranslationProfiler`/Pattern Profiling (ADR-021, kept as gated dev tools with a real enable/disable toggle), this had no wiring or dev-console hook — just orphaned code. The supporting `.d.ts` types (`TrieValidationResult`, `TrieRepairResult`, `TrieHealthScore`, and 5 more feeding them) were deleted alongside from `DictionaryManagerTypes.d.ts`.

Entry point: `src/utils/dictionary/DictionaryTrie.js`. Consumed by `DictionaryManager` (one `DictionaryTrie` per loaded dictionary, built by `DictionaryTrieBuilder`).

## ScrollPositionRecovery

The retry algorithm for restoring scroll positions after a dictionary reload, translation update, or virtualized-list remount. Generic over the positions shape (`ScrollPositionRecovery<T>`) — the class never reads into `positions` itself, it's passed through opaquely to `attemptFn` on every call. Owns: RAF-first attempt, then exponential-backoff `setTimeout` retries (up to `maxRetryAttempts`, delay doubles each miss, capped at `maxRetryDelay`), plus timer handle lifecycle (`cancel()`). A frame-cadence `scheduler: 'raf'` mode existed for the dictionary table's restore and was deleted with it (2026-10-07).

Does not touch the DOM. Callers inject an `AttemptFn<T>: (positions: T) => boolean` — returns `true` when refs were ready and positions were written; `false` to trigger a retry.

One adapter: **`useScrollPositionManager`** (translator's 3-panel restore). The class is the retry algorithm and the hook is the DOM, kept apart on purpose (ADR-086): the algorithm is tested with a fake `attemptFn` and no DOM, and `tryRestoreScrollPositions` (exported from the hook file) is a pure function of refs and positions, tested directly. It checks every SAVED panel (`original`/`translation`/`characterOnly`) is mounted with layout (`scrollHeight > 0`), then writes `scrollTop`/`scrollLeft` per panel clamped to what the panel can scroll now. The hook constructs one `ScrollPositionRecovery<ScrollPositions>` via a stable `useRef`, "latest ref" pattern for the DOM refs. The generic `T` and injected `AttemptFn` were built for a second adapter, `useVirtualScrollRange`'s single-list restore, deleted 2026-10-07 when nothing used it; the generic stays (one type parameter, it keeps the class from reading `positions`), but add no options for a second caller until one exists.

Interface: `restore(positions, options?): Promise<void>` — resolves when attempt succeeds or retries are exhausted (never rejects; a `cancel()`-aborted sequence never resolves either — the returned promise is simply abandoned). `cancel()` aborts the pending RAF or setTimeout; second `restore()` call implicitly cancels the first.

Entry point: `src/utils/ui/ScrollPositionRecovery.ts`. Not barrel-exported — callers import it directly. Consumed by `useScrollPositionManager.js` only.

## CharacterOnlyBridge

The occurrence-scoring algorithm that maps a highlighted unit in the Full Translation or Original panel to the correct unit index(es) in the Character-Only panel. Handles two disambiguation strategies:

- **Sequential occurrence matching** (100 pts): counts how many earlier tokenIndex-ordered entries in `sourceArrays` contain `targetSegment` to determine which Nth occurrence in the target arrays to pick. Uses `tokenIndex` from metadata — not array order — to handle cross-chunk scrambled indices.
- **Context window scoring** (up to 20 pts): checks the character immediately before and after each candidate in `targetArrays.original` against a ±2-segment immediate context string (10 pts/match) and a ±CONTEXT_WINDOW distant context string (2 pts/match).
- **Position-ratio fallback**: used when total score is still -1 (no context signal found); maps `sourceIndex / sourceArrays.length` to the proportionally closest candidate.

Returns `number[] | null`: array of Character-Only unit indices, or `null` when no match exists. Multi-character source segments return multi-element arrays (one index per character).

Constants `MAX_MATCHES = 100` and `CONTEXT_WINDOW = 50` are exported for tests.

`findCharacterOnlyMatch(sourceIndex, sourceArrays, targetArrays)` is direction-generic — the params don't hardcode which side is "Character-Only." Two call sites use it in opposite directions: `resolveHighlights` (`sourceArrays=semanticArrays, targetArrays=characterOnlySemanticArrays` — Full Translation/Original → Character-Only) and `useHighlightInteraction`'s `handleSemanticSegmentClick` `character-only-to-original` branch (`sourceArrays=characterOnlySemanticArrays, targetArrays=semanticArrays` — reverse). On a total miss (`null`), the reverse-direction caller clears the highlight rather than falling back to a position-ratio guess, and `resolveHighlights` leaves the Character-Only panel unlit.

Entry point: `src/utils/highlighting/CharacterOnlyBridge.ts`. Called from `resolveHighlights` (`src/utils/highlighting/HighlightResolver.ts`, bounds check included) and from the `useHighlightInteraction` hook (`src/hooks/useHighlightInteraction.ts`), which owns the React plumbing (click handler, 10ms scrolls).

## Click-to-Highlight Lifecycle

The end-to-end path from clicking a segment to a highlight appearing elsewhere. Since 2026-10-10 `useHighlightInteraction` owns the dispatch, state and both triggers below; the origin and payload files still sit in front of it. A 3-branch fixed dispatch does not benefit from a dispatch table.

**Origin.** `HighlightableSegment.tsx` renders a clickable span; its `onClick` calls the caller-supplied `onUnitClick(unitIndex)` (must stay referentially stable — see its own doc comment on `React.memo`). `SegmentedParagraphs.tsx` threads `onUnitClick` down to every segment it renders in a paragraph loop. `ClickableTranslationOptimized.tsx`'s memoized `SegmentComponent` is the full-translation path's equivalent origin — same shape (a stable `onClick(unitIndex)` on a memoized span), separate file because it renders from `prebuiltSegments` rather than `SegmentedParagraphs`'s paragraph loop.

**Payload.** `useSegmentClickHandler` (`src/hooks/useSegmentClickHandler.ts`) wraps `onUnitClick` — validates bounds against `semanticArrays`, builds a `SegmentClickPayload` (`unitIndex`, `direction`), and calls the caller's `onSegmentClick`. This is the one seam for adding a new payload field — all 3 `Clickable*` components route through it. The hook still reads `semanticArrays.original[unitIndex]`/`.translated[unitIndex]` (not `metadata`/`source` — those reads were dropped too) but only for a dev-only `logger.log` call, never for the payload itself; don't confuse that dev-log read with payload construction when grepping the hook.

**Dispatch.** `useHighlightInteraction`'s `handleSemanticSegmentClick` (`Translator.jsx` passes it down as a prop) receives the payload and branches on `segmentInfo.direction` (`'translation-to-original'`, `'original-to-translation'`, `'character-only-to-original'` — a fixed 3-way `if/else`, not a lookup table; each branch does meaningfully different work, not just a different label). The first two light the clicked unit; `character-only-to-original` finds the unit to light with `findCharacterOnlyMatch` (source and target swapped) and lights nothing, with a warning, on a miss. Each branch schedules an auto-scroll of the panels it lit.

**State.** One lit unit (ADR-095): `LitUnit` is `{ index, arrays, fromCharacterOnly }` in a `useState` inside `useHighlightInteraction` — an index into the `semanticArrays` it was lit against, and whether the click came from the Character-Only panel. There is no reducer and no stored Character-Only index.

**Resolution.** `resolveHighlights(lit, semanticArrays, characterOnlyArrays)` (`src/utils/highlighting/HighlightResolver.ts`, memoized in the hook) derives what the panels show: `litIndex` for the Original and Full Translation panels, and `characterOnlyUnitIndex` (`findCharacterOnlyMatch`'s result, an array for multi-word units, `-1` for none) for the Character-Only panel. It returns nothing lit when `lit.arrays` is not the current `semanticArrays` (a new translation brings a new reference, so a stale index cannot apply to it, in the same render), when the index is out of range, and, for the Character-Only side, after a Character-Only click (so that panel is not mapped back). The memo matters: the Character-Only scroll effect depends on the identity of that array, so a fresh array per render would re-scroll on every render. A second effect scrolls the Character-Only panel after the resolved index appears; the click handler's own timer scrolls Original/Translation. The two scrolls cover different panels, so they are not one mechanism.

No ADR conflict here despite the original architecture-review candidate's claim — ADR-003 governs the JS-vs-TypeScript migration strategy, not decomposition; it says nothing about extracting hooks or dispatch tables from `Translator.jsx`, and `CLAUDE.md`'s deleted-symbols list documents ~10 prior extractions from that exact file.

## DictionaryBackend

The IO module for dictionary persistence. Owns the load protocol: parallel batch load via `loadDictionariesParallel` → one batched retry of the failed ids for cold-launch failures (file lock, Rayon thread pool warmup, OS read pressure) → classification of still-failed IDs. Returns raw (unsorted) data; callers own sorting, toasting, and React state.

Interface: `loadAllDictionaries(dictionaryIds: string[]): Promise<BatchLoadResult>` where `BatchLoadResult` carries `loadedDictionaries` (all IDs present; failed IDs initialized to `{}`), `stillFailedIds`, and `total`.

No React, no toast, no sorting. Testable as a plain async function — stub `window.electronAPI` and verify retry+classification behavior directly without mounting the provider.

Entry point: `src/utils/dictionary/DictionaryBackend.ts`. The Dictionary Store's `load` dependency, so the startup load, a single reload, a rename, force reload and import all use the same parallel+retry protocol.

## Dictionary Edit

One change to user dictionaries, described as data (ADR-052): a list of `{dictionaryId, key, before, after}` changes plus an `outcome` tag (`added | overwritten | updated | deleted(count, missing) | moved(count, missing)`). `before`/`after` of `undefined` means the key is absent. Because every change records what it overwrote, undo is `invert(edit)` (swap `before` and `after`) and redo is the edit itself. One user action is one edit, even across dictionaries: a bulk delete in the duplicate view is one `planDelete(dicts, targets)` over `EntryRef`s (`{dictionaryId, key}`, the entry a delete names; `deleted.missing` lists them), so one undo restores it all (ADR-052 addendum 2026-10-21).

Pure half, `src/utils/dictionary/DictionaryEdit.ts`: `planAdd/planUpdate/planDelete/planMove(dicts, …) → DictionaryEdit | {invalid: reason}` (`planAdd` and `planUpdate` take the raw `source`, `translation` and metadata and own sanitize → `validatePersistEntry` → typed value, so no caller can write an entry unchecked), `invert`, `applyEdit`, and `changedKeys(edit, dicts)` (keys whose current value no longer equals what the edit expects, compared field by field by `sameEntryValue`). Tested by a round-trip over every plan type: `applyEdit(applyEdit(d, e), invert(e))` equals `d`.

Committing half, `commitEdit` (`src/components/dictionary/EditCommitter.ts`, plain module), run by the Dictionary Store as one kind of operation on its queue (ADR-052, ADR-055); CRUD and history reach it through the `EditCommitter` interface (`commit(plan, onCommitted?)`), which the store satisfies. A commit plans against the current dictionaries at its turn in the queue; refuses the whole edit if any key changed since (`{refused, changedKeys}`); otherwise applies to memory first, sorts (incremental hint only for a one-key change or a rename), saves every touched dictionary, and on a failed save rolls memory back and writes the old contents back to every dictionary that did save (`{saveFailed, rolledBack}`); on success runs `onCommitted` (history's `record`, or its cursor move). It does not touch the engine (ADR-106). The one save protocol for CRUD and undo/redo alike; it replaced `DictionaryOperationReverter`, `HistoryOperation`, `useDictionaryPersistence` and `commitMutation`.

## Dictionary Store

The user dictionaries in memory, the unread ones, and the list of dictionaries that exist (`dictionaryTypes`), with one queue for every write to them (ADR-055). `createDictionaryStore(deps)` in `src/components/dictionary/DictionaryStore.ts`, a plain module; `DictionaryProvider` builds one and reads it through `useSyncExternalStore`.

Operations, each one turn of the queue: `loadAll(options?)` (startup and force reload), `importAll(onApplied?)` (the import itself: the `importFiles` dependency asks for a file and rewrites the dictionary files, then every dictionary is re-read, all in one turn, so no save can land between the rewrite and the reload; returns `imported`, `reload-failed` or `failed`, never rejects), `commit(plan, onCommitted?)` (a Dictionary Edit), `reload(id)` (the Reload button, a created dictionary; a failed read makes it unread, a new id is listed), and `rename(renames, onApplied?)` (a pair rename: loads each new id and drops each old one together). `onApplied` runs inside the turn — import and rename clear history there, so no undo queued before them runs after them.

- **Memory is the source of truth.** Selecting a dictionary reads nothing from disk; duplicate mode reloads nothing.
- **The snapshot's `lastLoad` is how the last full load went** — startup, force reload or an import's re-read, classified by `classifyLoadResult` (`ok`, `warning` naming the unread ids, `critical` when none read or the load threw), `null` before the first. `DictionaryProvider` derives `loadError` (the Translator's banner) from it and toasts each new one, so a good force reload clears the banner and a partial one warns as startup does; a critical force reload leaves the engine down. A reload or rename of one dictionary leaves it alone (ADR-072 addendum 2026-10-21).
- **A reload of one dictionary keeps history.** An undo whose keys the reload changed is refused by the changed-key check, like any stale undo.
- **No operation reaches the running engine** (ADR-106). Its lookups are fixed at `initialize`, so an edit, reload, rename or import shows in translations only after the engine is rebuilt from the store's dictionaries: a force reload (Cmd/Ctrl-R, `reloadAllDictionaries` resolves to what the engine is built from, with the load's outcome) or a binding change.

Deps: `listDictionaries` (`getDictionaryTypes`), `load` (`loadAllDictionaries`), `save`, `importFiles`. Tested without React over a fake disk (`DictionaryStore.test.ts`, `EditCommitter.test.ts`, `__tests__/fakeDictionaryDisk.ts`).

## MoveDialog

The single dialog for moving dictionary entries to another dictionary — covers both the single-entry (right-click context menu) and bulk (checkbox multi-select) cases via one `entries: string[]` prop, replacing the former `MoveEntryDialog.tsx`/`BulkMoveDialog.tsx` pair. The two had already drifted: bulk move was silently missing the metadata-loss warning single-entry move had.

`entries.length === 1` drives the single-entry code paths: named overwrite detail (`Entry "X" already exists ... with translation "Y"`), named metadata-loss detail (lists the specific fields), and an entry preview with metadata tags (Variable/semantic-type chips). `entries.length > 1` drives the bulk paths: aggregate-count warnings (`N entries already exist...`, `N entries have metadata that will be lost`) and a plain first-3-preview with "...and N more" — no per-item metadata tags, kept simple since the aggregate warning already covers the concern.

One backend call, `moveEntries(...)`, for one entry or many (ADR-110; the single/bulk pair it replaced differed only in not-found handling and return shape). Nothing found rejects, so the dialog's banner shows it; some missing succeeds with a warning toast.

The dialog owns its own close-on-success (calls `onClose()` itself, then `onSuccess?.()` for parent-side cleanup like `resetSelection()`) — the old `BulkMoveDialog` didn't call `onClose` itself and instead relied on the parent's `onMoveSuccess` callback incidentally also flipping `showBulkMoveDialog` false.

Trigger hooks stayed untouched: `useEntryEditAndMove` (single, context-menu — `moveEntry`/`closeMove`) and `useEntrySelection` (bulk, multi-select — `selectedEntries`/`showBulkMoveDialog`) are still two separate hooks with their own state. `DictionaryTableView.tsx` converges them at the render site only: `entries={moveEntry ? [moveEntry.source] : Array.from(selectedEntries)}`, rendering exactly one `<MoveDialog>`.

Entry point: `src/components/dictionary/MoveDialog.tsx`, styled by `src/styles/MoveDialog.module.css` (unprefixed class names — the old `bulkMove*`-prefixed classes that lived inside `EnhancedVirtualizedDictionaryTable.module.css` were deleted, not migrated).

## Dictionary table view

One dictionary as the Dictionary tab's table shows it, and the state that belongs to looking at that one dictionary: the selection, the open edit or move, the context menu. `DictionaryTableView.tsx`, rendered by `EnhancedVirtualizedDictionaryTable` with `key={selectedDictionary}`.

The key is the reset rule: switching dictionaries remounts the view, so its state starts fresh and nothing resets it by hand. Before, the table called five resets across four hooks from one effect, and each new piece of transient state had to be added to that list. The two recorded bugs in that code (the stripes stopping, composite keys persisting) were both coordination bugs of that kind.

What survives a switch lives above the view, in the table: the search term, any filter the new dictionary also supports, and whether the filter panel is open. `useDictionaryEntryFilter` clears the filters the new dictionary does not support itself, during render. The scroll state lives above the view too, because the scroll buttons and the row-position label above the rows read it. It returns to the top through `useVirtualScrollRange`'s `resetKey`, which the table builds from the dictionary, the debounced search term and the filter values, so a filter change also scrolls back to the top.

**Table columns** (`src/components/dictionary/TableColumns.ts`): `tableColumns(dictionaryId)` is the one place a kind's Source and Translation columns are chosen — width class, header label, header tooltip, and the Semantic tooltip. The header and every row read it, so their widths cannot drift. It is layout only and imports the CSS module, so it sits beside the table, not in the pure `entryCapabilities` table, which decides _which_ capability columns appear. `DuplicateDictionaryTableView` has one fixed layout and stays out. Per-kind behaviour checks that are not layout (`highlightPatternVariables` in the row, the Add form's pattern checks) stay as single `isPatternsDict` calls.

Switching modes (duplicates or not) remounts the whole table: `DictionaryManager.tsx` keys it by mode.

Tested through the table: `EnhancedVirtualizedDictionaryTable.test.tsx`'s "dictionary switch" block. Its two dictionaries share their sources, because `useEntrySelection` prunes selected keys whose entry is gone, which would hide a missing remount.

## DictionaryColumnSchema

Not a module — the column-width contract now shared by the dictionary table's header (`getHeaderColumns` in `DictionaryTableView.tsx`) and row (`VirtualRowComponent.tsx`, `DuplicateDictionaryTableView.tsx`) renderers. Before this, "which columns exist, at what width, for dictionary type X" was defined independently in each of those 3 files with no shared source of truth — the same failure class `dictionary/CLAUDE.md`'s Reusable Row/Badge Building Blocks entry already names 5 prior instances of at the row/badge layer, this being a 6th, one level up.

There are 4 distinct column sets (patterns=6 columns, phrases/properNouns=4, simple dictionaries=3) plus `DuplicateDictionaryTableView`'s own fixed 4-column layout — not a 5th type variant, since it shows the same columns regardless of dictionary type. Two mechanisms, chosen per-column by what actually constrains it:

- **CSS-module classes** (`src/styles/EnhancedVirtualizedDictionaryTable.module.css`) for Source/Translation/checkbox/X-Y-types — one class per (dictionary type, column) pair, even where two types currently share a value (e.g. patterns/phrases/properNouns all have a 25%-wide Source column today) — kept separate so each type's column set stays independently editable without hunting who else reuses a class. Applied to both the header `<div>` and the matching row `<div>` via the same className, composed with a role class (`.headerCell` for header chrome — bold + padding; `.cell`/`.cellEditable` for row chrome, pre-existing). The checkbox column doesn't compose cleanly across header/row (different padding) so it gets two independent classes instead of one shared class fighting over `padding`: `.checkboxCell` (rows, pre-existing) and `.headerCheckboxCol` (header).
- **A JS constant** (`DICTIONARY_SEMANTIC_COLUMN_WIDTH`, exported from `VirtualRowComponent.tsx`) for the Semantic-type column specifically — `SemanticTypeToggleCell`'s `width` is a JS prop, not a className, because that component is reused outside Dictionary entirely (`RuleRow.tsx`, `NewRuleModal.tsx`, `RuleMatchesModal.tsx`) with its own widths for Rules-tab layouts, so the column-width mechanism there can't cross into a CSS class without touching those unrelated callers.

Fixed alongside (same branches were being touched anyway): `VirtualRowComponent.tsx`'s row-layout branches were using raw `selectedDictionary === 'phrases'` / `.startsWith('properNouns')` instead of the `isPhrases`/`isProperNouns` flags already destructured from `classifyDictionaryId` (since replaced by the kind predicates) in the same function — the exact "raw string despite already having the classified flag in scope" pattern `dictionary/CLAUDE.md` names as a repeat offender. Harmless today (no fiction-phrases dictionaries exist) but now closed.

`DuplicateDictionaryTableView.tsx` also switched from hand-rolling its own row div to reusing `RowShell`/`CheckboxCell` (see those entries in `dictionary/CLAUDE.md`'s Reusable Row/Badge Building Blocks) — the only friction was `RowShell` having no way to express Duplicate view's alternating group-background color, resolved by adding `RowShell`'s `backgroundColor` prop (see that entry).

Per-type column-layout narrative (which columns, what widths) lives as block comments in `EnhancedVirtualizedDictionaryTable.module.css` next to the actual width classes — not in `VirtualRowComponent.tsx`'s JSX, where a comment describing literal numbers that had since moved elsewhere would go stale silently.

## Dictionary match lookup

`DictionaryManager.findAllMatches(text, startPos, dictionaryOrder)`: scans the given dictionaries in order, asking each `DictionaryTrie.findMatches`, tags each match with its dictionary and priority, and sorts by `compareMatchesBySpecificityThenPriority`. A dictionary that throws is logged and skipped; before load or after `dispose()` it returns `[]`. `dictionaryOrder` is required: every caller passes one.

Synchronous and always a sequential JS scan, which `PatternVariableCache`'s per-position hot loop requires (it cannot await). The engine's phrase pass (`processRemainingPhrases`) and `findMatchesAtToken` call it too. **There is deliberately no lookup cache between the engine and `DictionaryManager`:** a semantic cache served stale translations and broke the 5-phase priority order (a proper noun must override a character). Anything that re-adds one must key or validate on phase priority — 1 patterns, 2 proper nouns, 3 numbers, 4 phrases, 5 characters — so an entry from a higher-priority phase beats one from a lower phase.

There is no JS "parallel" path (a `Promise.all` over synchronous trie walks ran sequentially) and no WASM tier. **The WASM dictionary lookup tier was deleted (ADR-073)** after a benchmark on the real dictionaries (13,338 characters; 3,525 + 3,570 + 2,281 proper nouns): its `translate` was 2.5x (distinct words) to 8.7x (repeated words, which the JS lookup cache serves) slower, its multi-dictionary `findAllMatchesAsync` 22x slower, a reload cost 34 ms against 20 ms, and its linear memory grew from 4 MB to 18.6 MB over five reloads and never shrank. Parity held on word, translation and dictionary; only `metadata` differed.

It was a separate class, `DictionaryMatchLookup`, built with `DictionaryManager`'s Maps and two closures, until 2026-10-20 (ADR-035 addendum).

**`findMatchesAtToken(tokens, pos, dictionaryOrder)`** asks the same question at a token: `findAllMatches` over the text from that token up to the next punctuation (`reconstructTextFromIndex`, which reads across a space, so `墨 子` matches `墨子`), longest first; a position past the last token logs and returns `[]`. It is how Phases 2 (`applyProperNouns`) and 4 (`processRemainingPhrases`) read matches, so every phase that looks a word up in the dictionaries across tokens asks the same way. It replaced `MatchSource` (ADR-082), whose Rust lookup-index adapter was meant for texts of 50+ characters but never ran on real books, because chunks split at punctuation (0 of 35,760 calls); the index, the category per dictionary and the parity fixture were deleted (ADR-108). Pinned by `DictionaryManager.findMatchesAtToken.test.js`.

## TextChunker

Splits text into `TextChunk[]` at punctuation boundaries (`chunkText(text)`; content, punctuation, startIndex, lineBreaks, startedBy). The shape is declared once, in `src/types/TextChunk.d.ts`, with the fields `ChunkPostProcessor` adds (`translated`, `translatedPunctuation`, `translatedContent`, `openingPunctuation`); `TextChunker.js` and `ChunkPostProcessor.js` are `// @ts-check`ed against it, and `FormattingChunk`, `FullTextChunk` and the batch step's chunk are `Pick`s of it, so renaming a field fails type-check at every reader. One implementation, `src/utils/text/TextChunker.js`, splitting on every Unicode punctuation category (`\p{P}`: Pc Pd Pe Pf Pi Po Ps; symbols such as `$` and `+` stay in the text), one module-private regex. `isPunctuationSeparator(char)` is its method; the configurable `UnicodePunctuationDetector` class was deleted 2026-10-09. A Rust twin and its `WasmTextChunker` wrapper were deleted (ADR-079): no faster, and it chunked 0.0-0.2% differently on real text (measured over 5 novels, 17M characters; nearly all `——` before closing punctuation).

**Rules** (`test-fixtures/chunker-parity.json`, read by `TextChunker.parity.test.js`): split on Unicode punctuation including dashes (Pd: `-`, `—`, `——`) and `_` (Pc), and keep a `/` between two ASCII digits whole (`23/30`, `3/4`) while splitting any other `/`. `content` is trimmed through `TextChunk`.

**`startIndex` of a chunk with empty content is unspecified** (a leading punctuation chunk gets 0, a trailing one after a line break -1), and nothing reads it: `chunkStartChar` (`TranslationEngine.js`) only reaches chunks with Chinese content. The fixture holds `null` for it and the harness skips it; a chunk with content must match: `text.slice(startIndex, startIndex + content.length) === content`. `TextChunk` trims `content` and skips the same leading whitespace in `startIndex`, so an indent is not part of either (until 2026-10-24 `startIndex` pointed at it, and a single-chunk text opening with whitespace recorded every unit's `originalStart` two or more characters early, so the Chinese panel's clickable units were the indent characters). The old `endIndex` field had no reader and was deleted. If something starts reading punctuation-chunk positions, define it first (the chunk's own first character is the natural meaning) and change the chunker.

## TextTokenizer

The Phase-0 tokenization seam: splits raw input text into `Token[]` (type, value, start, end) before the 5-phase pipeline runs (`tokenize(text): Token[]`, `src/utils/text/TextTokenizer.ts`). One implementation, pure JavaScript. A Rust twin (`WasmTextTokenizer` / `text_tokenizer.rs`) was deleted (ADR-079): about 8x slower than the JS code, and its final output was the reference.

**Classification.** The text is NFC-normalized first, so `start`/`end` index the normalized text in UTF-16 units. Then one token per CJK ideograph (Unified, Extension A U+3400–4DBF, Compatibility U+F900–FAFF), per run of ASCII letters, per run of ASCII digits, per run of Unicode `White_Space`, and per ANY OTHER code point, typed `punctuation` (so `_`, U+FEFF and an astral symbol are punctuation, one token each). **Punctuation is never grouped**: `……` is two tokens and `：“` is two, because the punctuation dictionary is keyed by single characters, so each token has a full match. Grouping them (the old JS regex did) left `：“` unmatched and `cleanupFormatting` spaced it (`ạo : Tiền` against `ạo: “Tiền`), which the real-engine harness caught on 28 of 48 character-only windows (ADR-079).

**Fixture.** `test-fixtures/tokenizer-parity.json` holds 11 cases (`expected` values and types), asserted by `src/utils/__tests__/TextTokenizer.parity.test.ts`. Verified against an independent port of the deleted Rust classifier over the whole 55-book library: 0 differing lines of 3,769,999, 173,682,420 tokens.

## Engine Reinitialization

The operation behind the "Reload Dictionary" button (Cmd/Ctrl+R) and, once a Reader exists, behind switching books. The user-facing label says reload; the operation **discards the engine and builds a new one**.

`useTranslatorEngine`'s `reinitialize(rawDictionaries, options)` (the `reinitializeEngine` of `useEngine()`) optionally re-reads `config.json` (`forceConfigReload`), takes `activeProperNouns` from it, then runs the same `runEngineInit` the mount path uses: destroy the outgoing engine (if any) → `filterDictionariesForEngine` → `engineRef.current = createTranslationEngine()` → `initialize()`. The previous engine is destroyed before the replacement is constructed — `runEngineInit` does this itself, on both the mount path and every `reinitialize()` call, not just the explicit `destroyEngine()` the `useForceReload` path also calls beforehand.

**Every init is serialized, mount included.** A call that arrives while an init runs waits behind it instead of being dropped, and calls that pile up collapse into one run with the latest dictionaries and options (`forceConfigReload` is OR-ed, so a forced reload is never downgraded). Each waiting caller resolves with that run's outcome, `{ ok: true } | { ok: false, error }`, and the promise never rejects. `BookBindingContext`'s rebuild adapter turns `!ok` into a throw, which is what feeds the store's `applyError` and a tier move's `failures`; `useForceReload` shows the message. A failed init also lands in `initError`/`enginePhase`, which is what each tab's error panel reads. (The old design returned early on a busy call, so a binding applied mid-init never reached the engine, and reported success from the previous engine's `isReady()`.)

**The engine's active list is a snapshot, on purpose.** The `activeProperNouns` the engine is built with is the one `useTranslatorEngine` holds; a Configuration toggle changes saved config and not the engine until a reload (ADR-066). It is not exposed on `useEngine()`. The engine decides "is this match a proper noun" with `isActiveProperNounSource` (`FictionDictionaryFilter.ts`).

Three consequences worth stating plainly, because the name hides all of them:

- **Nothing inside the engine survives.** Any state that must outlive a reinitialization — a Reader's scroll position, current line, open-book binding, translated-window cache — belongs to the caller, never the engine.
- **Switching books is the same operation.** Write `activeProperNouns` to `config.json`, then `reinitialize(raw, { forceConfigReload: true })`. There is no separate book-switch path.
- **There is no in-place dictionary reload.** `DictionaryManager.reloadDictionaries()`, whose name invited the assumption that it was this operation, had no non-test callers and was deleted.

Distinct from `WasmProcessorLifecycle`, which governs the module-scope WASM processors. Those are **not** per-engine: `WasmPatternProcessor` holds module-level `wasmPatternProcessor`/`wasmModule`/`lifecycle`, and `PatternStore.initializePatterns` calls `reinitializeWasmPatternProcessor`, which resets and re-initializes that shared processor with the new pattern set. So two concurrently-initialized `TranslationEngine` instances cannot hold different pattern sets — the last to initialize owns the global one. **One engine instance per app, structurally** — enforced by `EngineProvider` (`src/components/EngineContext.jsx`), which constructs the engine once above the tab container and is the sole caller of `useTranslatorEngine`; `Translator.jsx` (and any future tab needing translation) consumes it via `useEngine()` rather than calling the hook itself.

Entry points: `src/components/EngineContext.jsx` (`EngineProvider`, `useEngine`), `src/hooks/useTranslatorEngine.js` (`reinitialize`, `runEngineInit`), `src/utils/TranslationEngine.js` (`createTranslationEngine`, `destroy`). See also the `useReloadRetranslate` entry below for the capability function layered on top.

## useReloadRetranslate

The capability function `Translator.jsx` supplies as `forceReloadCtx.retranslate` for `useForceReload` (`forceReloadCtx.reinitializeEngine` is `useEngine()`'s own, with no wrapper) (see ADR-027-era `ForceReloadContext`).

**Not** absorbed into `useForceReload.js` itself — doing so would have replaced 2 composed capability functions with ~8 raw primitives (`engineRef`, `reinitialize`, `translateText`, `translateCharacterOnly`, `setStreamingText`) as `ForceReloadContext` fields, widening that interface from 10 fields to ~16 — the opposite of deepening. Instead, two small hooks construct the same 2 composed functions `Translator.jsx` already supplied, keeping `ForceReloadContext`'s shape unchanged while moving the logic + its tests out of the 1300+-line component.

- **`useReloadRetranslate({ engineRef, translateText, translateCharacterOnly, setStreamingText })`** — `src/hooks/useReloadRetranslate.js`. Requires a ready engine and throws `Error('Engine not ready')` otherwise (the 100ms/+500ms settle waits were deleted: a reload's `ok` outcome already means the engine finished initializing, and proceeding unready streamed `translateText`'s placeholder string under a success toast; `useForceReload` shows the throw as "Retranslation failed"). Then runs `translateText`, streams the result, and queues `translateCharacterOnly` with `setTimeout(…, 0)` — not awaited, so the success toast fires first (pinned by a test). Owns the success toast.

It is directly unit-tested (`useReloadRetranslate.test.js`) with fake timers and mocked `engineRef`/dependencies — no `Translator.jsx` mounting required.

## DictionaryEntryForm

All form logic for creating and editing a dictionary entry: field state, `initialSource` auto-populate (never the clipboard), rough-translation generation from the character dictionary, character/pattern validation, existing-entry detection across all dictionaries, and submit. `handleSubmit` returns `Promise<boolean>` — `true` means saved; the component calls `onClose()` only on `true`.

Receives `{ updateEntry, addEntry, dictionaries }` injected from the caller's `useDictionary()` call — not called internally — so tests use plain mocks without DictionaryContext. DOM refs (`sourceInputRef`, `translationInputRef`) are created inside the hook and returned; the component binds them to `<input ref={...}>` elements. The `DictionaryEntry` component retains `useDictionary()`, `onClose`, and JSX rendering only (~300 LOC).

Entry point: `src/hooks/useDictionaryEntryForm.ts`. Called from `src/components/dictionary/DictionaryEntry.tsx`.

## DictionaryTrieBuilder

The one trie-construction path: `DictionaryManager.loadDictionaries` builds every trie here (the persisted trie cache was deleted, ADR-075). No `this`, no I/O, no logging — `DictionaryManager` still owns disposal, Map storage, and logging invalid entries; this module owns only the entry-by-entry trie insert. A dictionary's priority is not decided here (see "Dictionary priority ladder").

One export: `buildTrieFromDictionary(dictionary)` — builds a `DictionaryTrie` from raw dictionary JSON, returns `{trie, entryCount, invalidSources}` with node metadata `{allowAsPatternVariable, semanticType}`; invalid entries (no string value, no `.translation` field) are collected rather than logged internally, so the caller decides how to surface them.

**`lazyLoadDictionary` is gone**: it never had a production caller, and its hand-rolled copy of this classification had drifted from `buildTrieFromDictionary`. The engine's only caller filtered inactive proper nouns out before the manager saw them, so nothing was ever pending. Which dictionaries the engine loads is now decided once, by `filterDictionariesForEngine` inside `TranslationEngine.initialize`.

Entry point: `src/utils/dictionary/DictionaryTrieBuilder.ts`. Not barrel-exported — sole caller is `DictionaryManager.js` in the same directory (matches the `MatchComparator.ts` convention).

## AppearanceConfig

The validation adapter for appearance-settings IPC reads/writes — the `AppConfig` discipline (`validateApiResult` + per-field `fromRaw` typecheck) applied to the previously-unvalidated appearance seam. Before this module, `useAppearanceSettings.ts` and `App.jsx`'s startup FOUC-prevention bootstrap each independently spread-merged raw IPC data into state with no per-leaf type check — a wrong-typed field (e.g. `fontSize: 123`) would reach `applyAppearanceToCssVars` unchecked. Same failure class as two prior confirmed bugs (`WasmValidationResult` status-string drift, `VocabularyWarmup`'s `??` vs `||` bug).

`fromRaw(raw)` validates per-leaf, not per-section: a bad `chineseText.fontSize` falls back to `DEFAULT_APPEARANCE.chineseText.fontSize` alone — sibling leaves in the same `FontSettings` section (a valid `fontFamily`) survive. Enum fields (`letterSpacing: 'normal'|'tight'|'wide'`, `theme: 'light'|'dark'|'auto'`) are checked by union membership, not `typeof === 'string'` — a wrong-but-string-typed value (`letterSpacing: 'super-wide'`) is rejected, not just a wrong-typed one. `customColors` (declared on `AppearanceSettings`, zero read sites anywhere) is intentionally omitted from `fromRaw`'s output, matching pre-existing behavior.

Unlike `AppConfig`, this module holds **no module-level cache** — `useAppearanceSettings`' React state is the sole cache (one caller, unlike `AppConfig`'s many non-React readers), so a second cache would just be a second source of truth to drift from. No `toRaw` either — `AppearanceSettings`' internal shape already matches the IPC wire shape (unlike `AppConfig`'s engine/ui/session regrouping).

`loadAppearanceConfig()` always returns a fully defaults-filled `AppearanceSettings` (never partial, never throws on a `success:false` envelope — only on a malformed envelope shape) — same contract as `loadAppConfig()`. `saveAppearanceConfig(settings)` throws on `success:false`.

`DEFAULT_APPEARANCE` moved here from `useAppearanceSettings.ts` (still re-exported from there for `App.jsx` and existing test imports) to avoid a circular import between the hook and this module.

Entry point: `src/utils/appearanceConfig.ts`. Called from `useAppearanceSettings.ts` (all 4 IPC call sites) and `App.jsx`'s startup bootstrap — both previously called `window.electronAPI.loadAppearanceSettings`/`saveAppearanceSettings` directly.

## DictionaryConfigManagement

The state, mount-time load/migration effect, and CRUD/rename/quick-add handlers for the Configuration screen's proper-noun dictionary list — extracted so `ConfigurationManager.tsx` stays render-only, matching the hook-extraction pattern already applied throughout `src/components/dictionary/`.

Owns: available/active dictionary lists, loading/error state, new-dictionary-modal and rename-mode state, default-quick-add-dictionary state, the mount effect (loads dictionaries, then runs `createMissingPatternHalves` from **Dictionary pair** — migration failure is a silent `logger.warn`, non-fatal by design, not surfaced to the user), and 6 handlers (`handleToggleDictionary`, `handleCreateDictionary`, `handleStartRename`, `handleCancelRename`, `handleConfirmRename`, `handleSetDefaultQuickAdd`).

Calls `useDictionary()` internally rather than taking it as an injected param — single call site, unlike the `DictionaryProvider`-composed hooks in `src/components/dictionary/` (`useDictionaryCRUD`, `useDictionaryHistory`, etc.) which need injection to share state across composition. Raw `useState` setters are exposed directly for the 3 pure-UI-state fields (`showNewDictionaryModal`, `newDictionaryName`, `renameValue`) — no invariant to protect, so no action-wrapper ceremony.

Entry point: `src/components/configuration/useDictionaryConfigManagement.ts`. Sole caller: `ConfigurationManager.tsx`.

## Dictionary pair

A fiction (`properNouns-f_X`) or generic (`properNouns-_X`) proper-nouns dictionary together with its patterns half (`patterns-f_X` / `patterns-_X`), coupled by name (ADR-027, ADR-048); a custom `properNouns-Foo` is a single file. Rust creates and renames a pair as one operation; `src/utils/dictionary/DictionaryPairs.ts` is the one place that also brings the app's in-memory `dictionaries` along: `createDictionary(id, ops)` (pair or single file by `hasPairedPatterns`, then loads every half), `renameDictionary(oldId, newId, ops)` (swaps every half in memory as one Dictionary Store operation — which halves moved is decided by the old id, as Rust's cascade is), and `createMissingPatternHalves(ids, ops)` (the mount-time migration for dictionaries made before their tier was paired). `ops` is `DictionaryContext`'s `loadDictionary`/`applyRename`, injected. Callers: the Configuration tab (generic and custom) and `BookBindingContext` (fiction, which adds its queue, book records and fiction-list refresh around the same calls).

## DictionaryListOrganizer

Pure sort + 3-way category split (Base / Generic / Fiction) for the Configuration screen's dictionary-id list. `sortDictionaries(ids)` puts `'properNouns'` first, then alphabetical. `categorizeDictionaries(ids)` buckets by the naming convention: `properNouns-f_*` → fiction, `properNouns-_*` → generic, everything else (including bare `'properNouns'`) → base.

Entry point: `src/utils/dictionary/DictionaryListOrganizer.ts`. Not barrel-exported — sole caller is `useDictionaryConfigManagement.ts`, matching `MatchComparator.ts`'s single-caller convention.

## Dictionary Kind / Dictionary Tier

A dictionary id answers two independent questions, both owned by `DictionaryIdClassifier.ts`:

- **Kind** — what shape its entries have: `patterns` (`patterns`, `patterns-f_*`, `patterns-_*`), `phrases`, `properNouns` (`properNouns`, `properNouns-*`), or `lookupTable` (the string-only tables: `characters`, `conversion`, `punctuation`). Kind decides move family, the Semantic column, and entry validation. Call sites ask it through `isPatternsDict`/`isPhrasesDict`/`isProperNounsDict`/`isLookupTableDict`, never `kindOf(id) === '…'` — a kind literal is spelled like an id literal, so the comparison would read as (and trip the gate for) a raw id check.
- **Tier** — where it sits in the precedence ladder: `root` (bare `properNouns` / `patterns`), `fiction` (`*-f_*`, one novel), `generic` (`properNouns-_*`, a shared theme), or `custom` (a user-created `properNouns-Foo` with neither marker). The Configuration screen shows `root` + `custom` together as "Base"; the tier keeps them apart because only a custom id has a name of its own (`bareNameOf`, rename). The priority ladder ranks a root and a custom proper-nouns dictionary the same (3).

### Dictionary priority ladder

A dictionary's rank, lower first: `priorityOf(id)` in `DictionaryIdClassifier.ts`, the only source. Proper nouns rank by tier (fiction 1, generic 2, root and custom 3); the fixed names take `patterns` 2, `phrases` 3, `characters` 4, `punctuation` 5, `conversion` 6; any other id (a `patterns-*` pair half included) 10. It breaks ties between equal-length matches (ADR-010), and orders `getDefaultSearchOrder`. `DictionaryManager` stores it per dictionary at load. Nothing passes its own table: until 2026-10-20 a `priorities` option was threaded hook → engine → manager with a hand-copied default, though only one table was ever passed (architecture review round 34, candidate #2). The parity fixture `lookup_index_parity.json` uses production priorities, so its test reads the real ladder.

Both are total: every fixed name (`phrases`, `characters`, …) is tier `root`, and an unrecognized id is kind `lookupTable` — the most inert kind (not movable, no Semantic column, no pattern validation). Rust `DictionaryType::from_name` defaults unknowns to `Phrases` instead; harmless, because each engine phase filters indexed matches by its own `dictionarySet`.

The id space is closed: every id is either one of the fixed names or built by `toProperNounsDictionaryId`/`toPatternsId`. **What an id may be** is `isValidDictionaryId`: ASCII letters, digits and `_ . -`, no `..`, at most 100 characters counting the prefix (so a proper-nouns name has 88). The create and rename forms check a typed name against it first (`dictionaryNameProblem`), and every IPC wrapper that names a dictionary checks it before calling Rust. Rust's `validate_dictionary_id` is the safety net and looser on purpose; `dictionary_id_rules.json`'s `idValidity` table pins that everything TS accepts, Rust accepts (ADR-060 addendum). Code that needs a single _specific_ dictionary (`=== 'characters'`) compares the literal; code asking a kind or tier question asks the classifier rather than re-deriving it from a prefix.

**Entry capabilities**: what an entry of a given kind can carry, answered by `entryCapabilities(id)` from one `Record<DictionaryKind, …>` table in `DictionaryIdClassifier.ts`:

| Kind          | `variableFlag` (VAR) | `semantic`     | `variableTypes` (X/Y) |
| ------------- | -------------------- | -------------- | --------------------- |
| `patterns`    | `toggle`             | `whenVariable` | yes                   |
| `phrases`     | `toggle`             | `whenVariable` | no                    |
| `properNouns` | `always`             | `always`       | no                    |
| `lookupTable` | `none`               | `none`         | no                    |

`showsSemanticType(id, allowAsPatternVariable)` is the combined question every surface asks (table rows, Duplicate view, Rule Matches, the Add form's picker) — replaces `hasSemanticTypeColumn`. The dictionary table's filters are derived, not stored: pattern-type filter when `variableTypes`, the one all/allowed/not-allowed variable filter when `variableFlag === 'toggle'`, the semantic filter when `semantic !== 'none'` — the panel and the filter reset read the same fact. A semantic type hidden by `whenVariable` (VAR off) is still saved, never dropped. Layout (column classes, header labels) stays keyed by kind; only which capability columns appear comes from the record. The engine does not read it — it treats proper nouns as always-VAR by dictionary list, not by branching on kind.

**Entry cells**: the row side of the capabilities. `src/components/dictionary/EntryCells.tsx` holds `EntryVarCell`, `EntrySemanticCell`, `EntryTypeCells` (X/Y) and `entryPatcher(patchEntry, id, source)`, the fire-and-forget patch with its catch. Each cell reads `entryCapabilities`/`showsSemanticType` and nothing else. The three views that list entries (the Dictionary table's rows, its Duplicate view, Rule Matches) render them inside their own layouts, which stay per view. Before, the Dictionary row chose its VAR badge and X/Y cells by kind branch while Rule Matches read the capabilities, and the two had drifted.

An always-on VAR (proper nouns) shows a fixed "✓ VAR" badge only in a view whose rows can come from dictionaries of different kinds, `mixedKinds` (Rule Matches). There it tells a proper noun from a phrase with VAR off. In the one-dictionary Dictionary table it would sit on every row and tell nothing, so the row shows none and the proper-noun Translation header says it once in its title. The Duplicate view shows no VAR at all; it compares entries rather than editing their flags.

The click-to-edit cell is `src/components/EditableCell.tsx`, shared by the Rules forms and the entry rows, which label their cells `Source for X` / `Translation for X`.

## Quick-add target

Which dictionary Cmd-5 (proper noun) and Cmd-6 (structural pattern) add to. One rule, `quickAddTarget(kind, view, dictionaries)`, decides it for every surface — Translator modal, Dictionary tab, Reader — over a **quick-add view**: the `{ defaultQuickAddDictionary, activeProperNouns }` pair the decision reads.

**On the Dictionary tab the same digits pick a table, not a modal**. `dictionaryTabNavigation(key, { loadView, dictionaries, unreadDictionaryIds })` (`src/utils/dictionary/DictionaryTabNavigation.ts`) answers `select` a dictionary, `refused` with the toast text, or `null` for a key that is not one of the six. Cmd-1..4 name `characters`, `phrases`, `properNouns` and `patterns` outright, and call `loadView` for none of them. Cmd-5 and Cmd-6 ask `quickAddTarget`, so a `none` target (patterns half missing or unread) becomes `refused` with `quickAddMissMessage`'s text. `matchHotkey` decides only that a digit reaches the Dictionary tab (`dictionaryTabHotkey`); `TabbedInterface` applies the answer, and the Translator and Reader digits stay `DIGIT_ACTIONS`' (different outcome: open a modal).

One source for every surface: `BookBindingContext`'s `loadQuickAddView()`.

- **A book open in the Reader** — config _as its binding implies it_ (`quickAddViewForBinding` in `BindingActivation.ts`: `quickAddTargetForBinding` + `activeProperNounsForBinding`, the same arithmetic `BookBindingContext` writes on bind), for the Translator and the Dictionary tab as much as the Reader. No Add reads a fiction id from config that the binding did not put there; see `src/utils/reader/CLAUDE.md`.
- **No book open** — config as loaded.

`useDictionaryModals(dictionaries, loadView)` takes that one loader from both the Translator and the Reader, and every opener, Cmd-1..6, loads through it — Cmd-1..4 too, because their dropdown offers the view's dictionaries. The Dictionary tab's Cmd-5/Cmd-6 switch the table rather than open the form, so `TabbedInterface` calls `quickAddTarget` over `loadQuickAddView()` directly.

Rule: Cmd-5 takes the default if it is active, else the first active proper-nouns dictionary by tier (`fiction → custom → generic`, alphabetical within a tier, never root), else `properNouns`. Cmd-6 mirrors it (ADR-048): the patterns half of the default if it is active and paired (fiction or generic), root `patterns` if the default is root `properNouns`, else the patterns half of the first active paired dictionary by tier (`fiction → generic`), else root `patterns`. The only miss is a pair whose patterns file does not exist in memory (`pairMissing`).

**Quick-add choices** — the dictionaries the Add form's dropdown offers, `quickAddChoices(view, ids, opened)`, decided over the same quick-add view as the target: every non-proper-noun kind; a proper-nouns dictionary while the view has it active; a paired patterns dictionary while its proper-nouns half is; and always `opened`, the dictionary the form opened on, so a fallback target is never missing from its own dropdown. The Dictionary tab's selector lists the same choices: it loads the binding provider's `loadQuickAddView()` each time the tab is shown and calls `quickAddChoices(view, ids, selectedDictionary)`, so the selected dictionary is always listed and the tab never disagrees with an Add while a book is open. Until then it filtered raw config with its own copy of the rule. "Show all", or a view that could not be loaded (`null`), lists every dictionary. The view travels with the open modal (`useDictionaryModals`' modal state → `DictionaryEntry`'s `quickAddView`); a form given no view shows no dropdown. **Quick-add dialog**: `useDictionaryModals` owns the whole dialog — it reads its own providers (`DictionaryContext`, `BookBindingContext`) and returns `handlers`, one opener per Add action keyed by the dispatch table's action types (`QuickAddAction`), which each surface spreads into its handler map as is, and `dialog`, the rendered error boundary + `DictionaryEntry` wired from its modal state and keyed per open; the modal state itself never leaves the hook. No caller passes it anything or renames its openers; only tests inject `shortlistMemory`. The Translator renders `dialog`, the Reader renders `useReaderCommands`' `quickAddDialog`; a new quick-add field is a change to this one module.

**Quick-add shortlist** — the dictionaries a Cmd-3 (`properNoun`) or Cmd-4 (`structuralPattern`) Add switches between without the dropdown, `quickAddShortlist(kind, view, dictionaries)`: the root dictionary, then each active custom and generic proper-nouns dictionary by tier (Cmd-4: their patterns halves, dropping custom and missing files). Fiction is left out — Cmd-5/Cmd-6 reach it. The form shows it as a toggle row; the opening key cycles it and Option-1..9 jumps (`shortlistKeyTarget` in `DictionaryEntry.tsx`), keeping typed fields (`selectDictionary`, unlike the dropdown, which clears). `useDictionaryModals` remembers the last shortlist pick per kind for the session, shared by the Translator and the Reader, and opens on it while it is still on the shortlist; otherwise root.

## Selection mapping

Turning a selection in a translation panel — the Translator's Full Translation, the Reader's Translation panel — into the Chinese it came from, so the quick-add keys (Cmd-1..7) can be pressed where the reader is actually looking. The selection **snaps** to the whole units it touches; their **covering span** is the source text from the earliest unit's start to the latest unit's end, gaps included, because a dictionary entry is one contiguous run of Chinese however the translation reordered it. A span that crosses a line is **refused**. A selection over no unit is **unmapped** and the key keeps the raw text, as it does for a selection anywhere else.

Only the Chinese travels. The selected Vietnamese is deliberately **not** used as the Translation guess: it is whatever phase won in the engine — often a phrase value, where a proper noun wants its per-character reading — so the Add form guesses as it always does, a matching Transform Rule first, then the character gloss.

Each surface registers its own mapper (`useSelectionMapper`) rather than the hotkey registration holding one, because Cmd-7 belongs to the tab container, which knows no panel. `src/utils/highlighting/SelectionMapping.ts`.

**What an Add starts from** is one question, `resolveQuickAddSource`, asked by every Add route: the mapped Chinese; else the refusal; else the plain selected text; else, with nothing selected, the clipboard. It reads the clipboard only in that last case and never writes it. The Add form itself never reads the clipboard — its `initialSource` is all it starts from, so a form opened by a button (the Dictionary tab's Add) opens empty. The Reader's palette asks it too, when it opens.

## SegmentedParagraphs

The shared paragraph-grouped segment renderer for the two char-only Clickable*Semantic components (`ClickableOriginalSemantic.tsx`, `ClickableTranslationSemantic.tsx`). Both had independently re-implemented an identical paragraph-wrapping loop (map paragraphs → div with conditional `marginBottom` on all but the last → inner map building a clickable/non-clickable segment) despite genuinely different title formats, highlight arity (`isUnitHighlighted` called with 1 vs 2 highlight args — see `UnitHighlightPredicate`), click directions, non-clickable className logic, and fallback/empty-state branch counts (Original has 2 branches — missing text vs empty semantic array; Translation has 1).

Interface: `renderSegmentedContent({ segments, paragraphs, getTitle, isHighlighted, onUnitClick, getNonClickableClassName, renderFallback, containerClassName, paragraphClassName, paragraphSpacingVar })`. The function owns the loop, the fallback dispatch (`segments.length === 0`), and the `<HighlightableSegment>` construction. Every piece that actually differs between the two callers is an injected callback — `renderFallback` in particular stays caller-owned specifically because the two components' empty-state branch _counts_ differ, not just their content.

Plain function, not a component — matches the pre-extraction style (both callers used plain arrow functions) and avoids introducing a new reconciliation boundary between the callers and `HighlightableSegment`'s own memoization.

Entry point: `src/components/char-only/SegmentedParagraphs.tsx`. Not barrel-exported (no `char-only/index.ts` exists) — imported directly by both callers, matching how `HighlightableSegment.tsx` is already imported.

## PositionBasedSegmentBuilder

The direct-placement fast path for `precomputeOriginalSegments` (original Chinese panel): when every semantic-array entry already has `originalStart`/`originalEnd` metadata (set during `postProcess`), walks entries sorted by `originalStart` instead of running the greedy scan. Avoids the scan's first-available tie-breaking, which can diverge from the Vietnamese panel's assignment order for duplicate translated words. Only fires for single-chunk Full Translation texts (no internal punctuation): a later chunk calls `setPositionByMatch` with a chunk-local `tokenIndex` while `addUnit` stored the global one, so no unit matches and `originalStart` stays `-1`. Character-only never sets `originalStart`, so its original panel always runs the scan, and prose with sentence punctuation does too.

Split out of `SegmentPrecomputer.ts`; self-contained, shares no state or matching logic with `precomputeSegments`/`precomputeOriginalSegments`, the two scan loops ADR-036 protects from unification. Not that pair; the split doesn't reopen ADR-036. Its existing tests (`SegmentPrecomputer.test.ts`, `describe('buildSegmentsFromPositions (fast path)')`) test it black-box through `precomputeOriginalSegments`'s routing and needed no changes — they never imported the function directly, since it wasn't exported before this extraction.

Interface: `buildSegmentsFromPositions(text, semanticArrays) → Segment[]`. Takes `Segment`/`SemanticArrays` as type-only imports from `src/types/SemanticTypes.d.ts`, where `Segment` moved from `SegmentPrecomputer.ts` on 2026-10-11, so the two modules no longer import each other even at type level.

Entry point: `src/utils/highlighting/PositionBasedSegmentBuilder.ts`, barrel-exported from `src/utils/highlighting/index.ts`. Sole caller: `precomputeOriginalSegments` in `SegmentPrecomputer.ts`, gated by the `allHavePositions` check.

## emptySemanticArrays

A small dedup extraction from `TranslationEngine.js`, scoped file-wide rather than to a single method — no call site is on the DO-NOT-EXTRACT list (`translateSinglePass`/`findAllMatchesWithSemanticCache`/`postProcess`).

`emptySemanticArrays()` — the `{ original: [], translated: [], metadata: [] }` fallback shape for `semanticArrayBuilder?.getArrays() || ...`. Zero `this` state — a plain exported function, not a TranslationEngine method. Entry point: `src/utils/highlighting/SegmentPrecomputer.ts`, barrel-exported.

## Memory signals on macOS

**The app targets macOS only, where the web view is WKWebView, and WebKit has no `performance.memory`** (checked in the deployed app: `typeof performance.memory === "undefined"`). Everything that reads it is inert there: `SmartMemoryPressureDetector` reported level `unknown`, ratio 0, and never emitted a cleanup event (deleted with `WasmMemoryPoolManager`, whose buffers nothing borrowed); the dev-console memory readers (`SystemPerformanceMonitor`, `window.checkRealMemory`) were deleted with the regression detector (ADR-069). The input limit is a fixed `MAX_INPUT_TOKENS` (15,000) held in `engine.maxInputTokens`; the memory-scaled `calculateMaxTokensForDevice` was deleted 2026-10-09 (`AdaptiveVirtualScrolling`, the other fallback, went earlier).

What bounds memory is deterministic: the Reader's single decoded book. **The pressure-reactive batch stack was deleted:** `SmartMemoryCoordinator`, `BackgroundCleanupManager`, `ComponentMemoryProfiler`, `BatchMemoryCleanup`, `MemoryLeakDetector` (the engine's `memoryTracker`), the every-5th-batch growth check and `getEngineStats().smartMemoryStats`. They were inert on macOS, and `BatchMemoryCleanup` was reachable only from those inert triggers, so it never ran (this section used to list its keep-counts as a bound, wrongly). Git history is the way back if a Windows target ever exists; that port would choose its own memory signal after measuring. `SmartMemoryPressureDetector` and `WasmMemoryPoolManager` were deleted: no production code called `getBuffer`/`returnBuffer`, and the detector was inert. **Open, not built:** a real memory signal for the reloads below. App-process RSS would not do, since WebKit's content runs in a separate process; two data points in the termination log are too few to design from.

**The app sometimes reloads by itself mid-reading (reported 2026-10-03, built app, unpredictable).** No app code does it: the only `window.location.reload()` calls are buttons on error screens. Tauri's macOS runtime reloads the page when WebKit terminates the web-content process (memory pressure, a crash or a watchdog). Cause unconfirmed; memory is the leading guess. `src-tauri/src/webview_diagnostics.rs` now records each termination: it sets Tauri's `on_web_content_process_terminate` handler, which replaces the default, so it appends a line to `webview-terminations.log` in the app data folder (a `launch` line at startup, then `web-content-terminated` with the uptime and the count this run) and reloads exactly as the default did. Read that log after a reload to see when it happens and how long the session had run.

## ProgressiveBatchText

The running translated text of `translateWithProgressiveBatches`. Owns one step per batch, in a fixed order: `translatePunctuation(batch, translateText, allChunks)` (neighbour lookups for comma spacing read `allChunks`, every chunk of the text, because the batch holds only translatable ones), `reconstructText`, `cleanFullText`, append. It keeps the cumulative text, which the batch event (`onBatchComplete`) carries. A batch that throws propagates: there is no fallback text.

Interface: `createProgressiveBatchText({ translatePunctuationText, chunkPostProcessor }) → { addBatch(batch, allChunks) → { batchText, cumulativeText } }`. Plain module, no engine state, so tests feed it chunks.

The engine's per-batch order is: `addBatch`, then `onBatchComplete`. The builder is not touched per batch: casing is set once, by FullTextAssembly. It fires from the progressive loop, after the add, so `partialText` includes the batch that just finished. The event carries text and counts only, never semantic arrays (ADR-105); the caller throttles. This text is not the final text: batches are cleaned with `cleanFullText`, and the whole text is finished once, afterwards, by FullTextAssembly.

Entry point: `src/utils/text/ProgressiveBatchText.ts`. Not barrel-exported. Sole caller: `TranslationEngine.js`'s `translateWithProgressiveBatches`.

## FullTextAssembly

The Full Translation result, built from every chunk once the batches are done. Owns, in this order: punctuation translation over _all_ chunks (comma-quote spacing reads a chunk's neighbours), `applySmartCapitalization` over all chunks, `reconstructText` then `finishFullText` once (the only NFC step), `matchWordSegments` against the finished text, then `setTranslatedCasing` on the builder for every unit the segment match placed (a unit it did not place keeps the form the phases gave it; the first-occurrence guess `updateWithCapitalizedText` made for those, which stamped a later lowercase repeat with an earlier capital, was deleted 2026-10-24), and the result arrays copied by `snapshotSemanticArrays`. Segment matching reads the arrays as the batches left them and is case-insensitive, so the casing step comes after it.

Interface: `assembleFullText(chunks, { chunkPostProcessor, translatePunctuationText, properNounTranslations, builder }) → { translatedText, semanticArrays, prebuiltSegments }`. Unlike CharOnlyAssembly it works on the engine's shared `SemanticArrayBuilder`, which the batch phase filled, and mutates it once at the end (`setTranslatedCasing`). Everything else is injected, so tests need no engine.

Not owned: the batch loop and its preview text (ProgressiveBatchText), the builder's contents (the phases fill it), and the precondition guard it keeps verbatim: no translated chunk, or no semantic units, gives `prebuiltSegments: []` and a log line.

Entry point: `src/utils/text/FullTextAssembly.ts`. Not barrel-exported. Sole caller: `TranslationEngine.js`'s `translateWithProgressiveBatches`.

## CharOnlyAssembly

The Character-only result, built from tokens the engine has already stamped. Owns, in this order: the output text (`translated ?? value` per token, with `needsSpaceCharOnly` deciding the space after each), one semantic unit per `chinese_char` whose `translated` differs from its `value`, `finishCharOnlyText` over the whole text, the position back-fill, which also takes each unit's casing from the range it placed. The back-fill searches each unit's text, case-insensitively, in the _finished_ text, moving a cursor forward so repeated words get distinct, increasing positions; it must run after finishing (finishing rewrites the text). A unit the search cannot find stays unmapped (`translatedStart = -1`) and does not move the cursor.

Interface: `assembleCharOnlyResult(tokens, lookupPunctuation) → { translatedText, semanticArrays }`. Pure; it builds its own private `SemanticArrayBuilder`, so it touches no engine state.

Not owned: the stamping pass (`TranslationEngine.processCharacterOnlyTokens`, which uses `this.applyMatchToTokens`) and `prebuiltSegments: []`. The pass looks up `characters` with `characterMatchFor`, a synchronous point lookup over `DictionaryManager.lookupCharacter`, shared with Phase 5 (ADR-087); it does not call `findMatchesAtToken`. Punctuation tokens are not matched at all: `applyMatchToTokens` ignores a non-Chinese start token, and `cleanupFormatting` translates punctuation through `lookupPunctuation` later (ADR-089).

Entry point: `src/utils/text/CharOnlyAssembly.ts`. Not barrel-exported. Sole caller: `TranslationEngine.js`'s `translateWithCharactersOnly`.

## NumberLiangFix

The post-pass that reads 两 as a tael unit after a converted number. When a token's `translated` is a number (`/^\d+(?:,\d{3})*$/`) and the first non-consumed token after it (consumed followers of the number are skipped) is 两 translated `lưỡng`, that token becomes `lượng` and its `translationSource` becomes `number_plus_liang_fix` (a Phase 3 source string). It must run after Phase 5, because 两's translation does not exist before then; the engine calls it once per `translateSinglePass`, inside `postProcess`'s `profileSync`, even when Phase 5 failed.

Interface: `fixNumberPlusLiang(tokens): void`. Mutates the tokens in place; no engine state.

**Known limits, kept on purpose.** It depends on the user's `characters` dictionary mapping 两 to exactly `lưỡng` (the bundled default has no 两; the production file does), so a different value switches the rule off without a signal. It fires only after a number `NumberProcessor` converted, so only multi-character numerals qualify: `五百二十两` gives `520 lượng`, `五两` stays `Ngũ lưỡng`. A phrase hit wins (`五百两人` gives `500 hai người`). Changing the coverage is a translation-quality decision, not part of this module.

Entry point: `src/utils/NumberLiangFix.ts`, beside `NumberProcessor.js`. Not barrel-exported. Sole caller: `TranslationEngine.js`'s post-Phase-5 step.

## WordSegmentMatcher

The greedy word-position matcher that maps each translated semantic unit onto its actual position in the final assembled output text, producing clickable word segments (`spacing` | `semantic` | `remaining`) in output order. Bug history: an intransitive-comparator bug, fixed by sorting ALL same-length candidates by `tokenIndex`, not just same-translated-text ones.

Algorithm: build candidates from semantic-array entries with non-null translations → sort by `compareByTokenIndex` (Chinese text order), longest first within one `tokenIndex` (a short word cannot claim a place inside a longer one it shares a token with) → find each candidate's first non-overlapping occurrence in the NFC-normalized, lowercased output text → re-sort by actual output position → build segments left-to-right.

Overlap is checked against a sorted list of disjoint claimed ranges by binary search, so there is **no cap on units**: until 2026-10-24 the loop stopped after 1,001 placed units (a performance guard on a quadratic scan) and every later unit fell into a `remaining` segment, losing click-to-highlight in a Translator-tab text of about 1,500 characters or more. Do not reintroduce a limit; pinned by the 1,500-unit test in `WordSegmentMatcher.test.ts`.

Interface: `matchWordSegments(semanticArrays, outputText) → WordSegment[]`. Pure function — no engine state touched anywhere in the algorithm.

Entry point: `src/utils/highlighting/WordSegmentMatcher.ts`, barrel-exported from `src/utils/highlighting/index.ts`. Sole caller: `assembleFullText` in `src/utils/text/FullTextAssembly.ts`.

## useForceReloadContext / useTranslationExecutionContext

The typed-factory pair that replaces `Translator.jsx`'s two inline context object literals (`forceReloadCtx`, `executionCtx`). `Translator.jsx` is intentionally JavaScript, never TypeScript (ADR-003) and carries no `@ts-check`, so `checkJs: false` means neither `ForceReloadContext` nor `TranslationExecutionContext` was ever compiler-checked at the point they were assembled, even though both interfaces already existed. Note: the architecture review's original claim that `destroyEngine` "bypasses `destroy()`" was verified false during grilling — it already called `engineRef.current.destroy()` before nulling the ref, matching the canonical teardown convention. The real gap was narrower: real shapes, unenforced assembly site.

Both hooks live in one file, **`src/hooks/useReloadExecutionContexts.ts`** . Merged because they're always called back-to-back from the same component for the same reason (`Translator.jsx:794`/`:826`) and were tested almost identically.

**`useForceReloadContext`** owns the `ForceReloadContext` interface (promoted here from a JSDoc `@typedef` in `useForceReload.js`, which now references it via `@typedef {import('./useReloadExecutionContexts.js').ForceReloadContext}`). Builds `cancelTranslations`/`destroyEngine` internally from primitive deps (`engineRef`, `cancelAllTranslations`, `setIsTranslating`) — these were the only 2 fields previously hand-written as inline closures in `Translator.jsx`; every other field (`reinitializeEngine`, `retranslate`, the plain setters) is already a stable value from another hook, just passed through. Wrapping `cancelTranslations`/`destroyEngine` in `useCallback` here is a genuine stability improvement over the pre-extraction inline arrow functions (recreated every render) — `useForceReload`'s own `handleForceReload` doesn't list `ctx` in its dep array (documented "stable capability methods" convention), so this closes a latent staleness risk rather than introducing one.

**`useTranslationExecutionContext`** is assembly-only — all 9 fields of `TranslationExecutionContext` (real `interface`, owned by `useAutoTranslateTrigger.ts`, imported here) are already refs/setters from other hooks (`useDictionaryReloadGuard`, `useHighlightingState`, `useTranslationResults`, `useClipboardTranslation`). No logic to relocate; the hook just gives the assembly a checked call site. The dead `export type { TranslationExecutionContext }` re-export (zero external consumers — every real import goes straight to `useAutoTranslateTrigger.ts`) was dropped in the merge.

**Shared dev-only input-shape guard** (`createShapeGuard`, internal to the file — not exported): since `Translator.jsx`'s call sites are never type-checked, each hook validates its own inputs at the top through one generic guard factory instead of two hand-copied functions. Each hook still declares one canonical array of its expected key names (typed `satisfies readonly (keyof Params)[]` so a typo/renamed key is a compile error) — kept because checking only `Object.keys(params)` would miss a field dropped entirely from the call site, the actual failure mode this guard exists to catch. What the merge removed is the second, hand-maintained array per hook classifying each field as ref-vs-function: kind is now inferred from the `*Ref` naming suffix (both real param shapes obey it with zero exceptions). Throws in `development` on a mismatch (`process.env.NODE_ENV !== 'development'` short-circuits to a no-op in production). This is deliberately an input guard, not an output guard: the returned object's shape is already guaranteed correct by TypeScript inside the `.ts` file (it's built the same way every call), so the only real remaining risk is `Translator.jsx` passing a wrong-shaped argument — which is exactly what the guard catches.

Entry point: `src/hooks/useReloadExecutionContexts.ts`. Sole caller of both hooks: `Translator.jsx`.

## Transform Rule

A user-authored rule that auto-transforms a dictionary entry's Translation guess and stamps its `semanticType`, keyed off 1-4 leading or trailing Chinese characters of the entry's Source text.

Schema:

```ts
interface TransformRule {
  id: string; // stable identity — survives key edits
  matchKind: 'suffix' | 'prefix';
  key: string; // 1-4 Chinese chars, matched against the tail (suffix) or head (prefix) of Source
  charCount?: number; // optional exact total-Source-length constraint (not the key's own length)
  relocate: boolean; // relocate-or-not toggle (false = stay, true = relocate to opposite end) — never a literal word count, see below
  moveReplacement?: string; // if set, substitutes for the key's own glossed words instead of moving them verbatim
  capitalizeExceptN: number; // N words left lowercase
  semanticType: SemanticType; // stamped on the entry when this rule matches
  enabled: boolean;
  label?: string; // optional human note, e.g. "Nanjing-style city suffix"
}
```

`charCount` constrains the TOTAL Source text length, exact-match only — omitted means no constraint. Lets a rule target short names specifically (e.g. only 3-char sources ending in `城`) without also firing on long ones ending the same way. Distinct from `key`'s own 1-4 char cap. **Characters are code points** everywhere in the engine (`charCount`, key length, the per-character gloss, rule and entry ordering), as `parseValidatedKey` already counts: `𠮷` is one character. A variation selector after a Han character counts as its own (a key cannot contain one, a source can).

**Matching precedence**: a `suffix` match always wins outright over a `prefix` match on the same entry — prefix rules are only even considered when no suffix rule matches at all. Within one `matchKind` pool, longest `key` wins on conflict. `(matchKind, key)` is unique at the persistence layer — two rules can't share both fields, but `"城"` can exist once as a suffix rule and once as a prefix rule simultaneously.

**Transform application order is fixed, not configurable**: the capitalize step always runs before the move step, on the original (pre-move) word order. This isn't an arbitrary choice — `titleCaseExceptLastN`'s "except last N" only means the intended words when applied before reordering; running it after `moveLastNWordsToBeginning` would target the wrong words. Traced from the canonical worked example: rough gloss `"nam kinh thành"` → `titleCaseExceptLastN(text, 1)` → `"Nam Kinh thành"` → `moveLastNWordsToBeginning(result, 1)` → `"thành Nam Kinh"`.

**Suffix rules reuse the existing tail-anchored helpers** (`titleCaseExceptLastN`, `moveLastNWordsToBeginning` in `src/utils/wordTransformHelpers.ts`). **Prefix rules have their own mirrored, head-anchored helpers** (`capitalizeExceptFirstN`, `moveFirstNWordsToEnd`) — `matchKind` selects which helper pair runs; the `relocate`/`capitalizeExceptN` field pair is shared, not duplicated per direction.

**`relocate` is always a boolean relocate/stay flag.** It was once a word count (`moveWords: number`); the boolean type itself now enforces the `{0,1}` domain instead of only prose enforcing it. `TransformRuleBackend.loadTransformRules` migrates any persisted legacy `moveWords` key to `relocate` on load (`Boolean(moveWords)`) — in-memory code and new saves only ever see `relocate`. The word-count actually moved (or, with `moveReplacement` set, replaced) is always `[...rule.key].length` (the key's own character count), never derived from `relocate`. `relocate: true` moves to the opposite end (`moveLastNWordsToBeginning`/`moveFirstNWordsToEnd`, or with `moveReplacement` set, `replaceLastNWordsWithText`/`replaceFirstNWordsWithText`); `relocate: false` leaves the words (or replacement text) in the key's own position (a no-op for plain moves, or `replaceLastNWordsInPlace`/`replaceFirstNWordsInPlace` with `moveReplacement` set). The Rules UI (`MoveModeToggle`) always renders a Stay/Move chip, never a numeric input.

`moveReplacement`: substitutes custom text for the key's own glossed words instead of relocating them verbatim. Worked example: suffix key `山脉` (2 chars), gloss `"Thái Nhạc sơn mạch"`, replacement `"dãy núi"` — `relocate: true` → `"dãy núi Thái Nhạc"`; `relocate: false` → `"Thái Nhạc dãy núi"`.

Storage: a dedicated file, Tauri-fs-synced the same way dictionaries are (own Rust read/write commands) — deliberately NOT folded into `appConfig.ts`'s `config.json`, both because Transform Rules are a growing list (closer in cardinality to dictionary entries than to `AppConfig`'s handful of scalar/short-list fields) and to sidestep `AppConfig`'s documented direct-Rust-write cache-invalidation landmine (see the `AppConfig` entry above) entirely rather than risk a third occurrence of it.

**Saving changes**: `TransformRuleBackend.commitRuleChange(change)` is the one write, a `transform` on the rules App File. Each change is a function of the rule list and runs at its turn against the rules that last saved successfully, so a failed save drops only its own change and the changes behind it re-plan without it; a change that throws at its turn (a conflict) saves nothing. Two hooks read it. `useTransformRules()` is read-only (`rules`, `isLoading`) and follows the backend's cache through `useSyncExternalStore`, so the Add form sees a save the moment it lands. `useTransformRuleEditor()`, called only by `RulesManager`, adds the pending overlay (`rules` shows the saved rules with pending changes applied), the conflict check made when a change is made, the four operations, and the load and save toasts. The earlier design kept the queue and a second copy of the saved rules in hook refs, and gave the Add form's read-only instance the write operations too.

**Explicitly out of scope**: `patterns*` dictionaries. Source text there is a literal template containing an `X`/`Y` placeholder character rather than plain Chinese content, so "trailing/leading N Chinese characters" doesn't carry the same meaning — Transform Rules apply only to `phrases`/`properNouns*` entries.

**A matched rule's casing wins outright over `generateRoughTranslation`'s dictionary-type default** (title-case-all for `properNoun*`, lowercase-all otherwise), for both dictionary kinds — a rule match implies proper-noun-like content (it stamps `semanticType`) regardless of which dictionary the entry happens to be filed under. Mechanically this is moot for `properNoun*`: `titleCaseExceptLastN` unconditionally re-cases every word it touches, ignoring prior casing, so "replace" and "compose-after" produce identical output there. The real effect is on `phrases` (default lowercase-all) — a matching rule title-cases the non-suffix words there too, intentionally making a `phrases` entry read like a proper noun when a rule fires. Implementation: skip the dictionary-type-default casing step entirely when a rule matches; apply the rule's own `capitalizeExceptN` → `relocate` sequence directly to the raw per-char gloss join instead.

**Rules tab authoring UI** (wayfinder ticket, resolved via `/prototype`): table-and-modal layout — dense sortable table (enabled toggle, up/down reorder, edit/delete per row), add/edit via modal dialog. Undo/reset for a wrong auto-applied guess belongs on the dictionary entry form itself (a revert icon next to the Translation field in `DictionaryEntry.tsx`), NOT on the Rules tab. Duplicate `(matchKind, key)` conflicts: inline form error naming the colliding rule, Save blocked until resolved. Three full variant mockups (this one plus a master-detail and a card-grid layout) are preserved on the throwaway branch `prototype/rules-tab-ui` for reference — not on `main`.

**Apply-path lives in `TransformRuleEngine.ts`, not the Quick-Add form hook**: `joinCharGloss`, `generateRoughTranslation`, and `initialEntryGuess` (was `computeInitialTranslation`, see below) are plain functions in that file taking `dictionaries`/`rules` as explicit params — no React dependency, same module as `findBestMatch`/`applyRule`/`findConflict`. `useDictionaryEntryForm.ts` (the Quick-Add form) is the sole caller, and loads rules via the shared `useTransformRules()` hook (the same one `RulesManager.tsx` uses) rather than a private loader — previously it hand-rolled its own `loadTransformRules()` effect, a second implementation of the same load `RulesManager` already owned.

**Initial entry guess** (replaces `computeInitialTranslation`): `initialEntryGuess(rules, dictionaries, source, target) → { translation, roughGloss, semanticType }` in `TransformRuleEngine.ts` — everything the Add form writes when it is **seeded**, from one pure call. `semanticType` is always complete: a matched rule's type, else the target kind's default (`'character'` for proper nouns, `''` otherwise), so a re-seed never leaves a stale type behind. Seeding is a transition, not a reaction to state: the form seeds once per mount, when `useTransformRules().isLoading` turns false (success or failure — a failed load seeds the rough gloss), and again only when the "Every dictionary" dropdown switches the target. The shortlist switch never re-seeds (typed text is kept). A `dictionaries` identity change — including a failed save's optimistic-write rollback — never re-seeds; before this, it overwrote what the user had typed. Every open of the quick-add dialog is a fresh mount (`<DictionaryEntry key={openId}>`), so an Add fired while the dialog is open gets a new form rather than a new source in the old one. **Rule preview**: the New Rule dialog's "rule's guess" column is `previewRuleGuess(draft, rules, dictionaries, source, target) → { guess, winner }` — `initialEntryGuess` over the saved rules plus the draft (treated as enabled while being written), so it shows what the Add form would really guess; a row whose `winner` is another rule is marked "shadowed by <key>" (e.g. an existing suffix `京城` over a draft `城` for 南京城). With Enabled off, the dialog adds that the Add form won't use the rule.

**Load-time validation**: `TransformRuleBackend.loadTransformRules()` previously handed `transform-rules.json`'s parsed IPC data straight to `setRules()` with no shape check — the one blob-persistence sibling that skipped it (`AppConfig`, `AppearanceConfig` both validate). `src/utils/dictionary/TransformRuleValidation.ts`'s `validateTransformRule(raw): TransformRule | null` now runs per-item, after `migrateLegacyMoveWords`, before the array reaches React — whole-rule drop on any invalid field (no meaningful default exists for identity fields like `key`/`semanticType`), never a partial repair. `loadTransformRules()` returns `{ rules, droppedCount }` instead of a bare array (stays React/toast-free, matching `DictionaryBackend`'s "IO module returns data, caller owns toast" convention); `useTransformRules.ts`'s mount effect fires `toast.warning` when `droppedCount > 0`. `TransformRuleBackend.ts` also now runs the IPC envelope through `validateApiResult` (previously an ad hoc `result.success && result.data` check, inconsistent with every other blob loader). `parseValidatedKey`/`parseValidatedNumber` moved here from `src/components/rules/RuleFieldValidation.ts` so the same file backs both form-time (`NewRuleModal.tsx`/`RuleRow.tsx`) and load-time validation — mirrors the `PatternEntryRules.ts` precedent (shared home for dictionary-entry structure/symmetry checks) and fixes a pre-existing directory-direction oddity: Transform Rules' form-time validator was the only one of this codebase's persist-adjacent validators living in `components/` rather than `utils/dictionary/`.

**Rule field commit**: what an edited Transform Rule value _means_ lives in `TransformRuleValidation.ts`, not in the two editing surfaces. `commitRuleField(rule, field, raw)` (the inline `RuleRow`, per field on blur — `key`/`charCount`/`capitalizeExceptN`/`moveReplacement`/`label` only; the toggles hand over typed values) and `commitRuleDraft(draft)` (`NewRuleModal`'s Save, whose gate and message are `ruleDraftProblem(draft)`) apply one rule per field: `key` is trimmed; an empty `charCount` is absent (any length); an empty `capitalizeExceptN` is invalid, never a silent 0; an empty or whitespace-only `label`/`moveReplacement` is absent, and a non-empty one is trimmed. RuleRow's optional cells commit an emptied value through `EditableCell`'s `allowEmpty` (`useInlineFieldEdit` otherwise never commits empty). `validateTransformRule` reads empty `label`/`moveReplacement` on disk as absent too — so a hand-edited `moveReplacement: ""` no longer deletes the key's words (`applyRule` applies any defined replacement, `""` included; no UI ever wrote one). The conflict check runs on the trimmed key. Widgets stay per surface — the schema-driven renderer ADR-039's sibling investigation rejected stays rejected.

## Book Loading

The Reader's backend seam: raw bytes in, decoded lines plus a line index plus an encoding report out. Two Rust modules, split so that everything with a decision in it is testable from a byte slice.

**`src-tauri/src/book_loader.rs`** is pure — no Tauri, no filesystem, no state. Owns `fingerprint(size, prefix)`, `detect_encoding(prefix, is_whole_file)`, `report_from_detection(encoding, prefix)`, `report_for_override(bytes, label)`, `index_lines(text)`, `load_book(bytes, override)`, and `BookContent` (one text buffer plus `(start, end)` offsets per logical line). Four facts are load-bearing:

- **Detection reads a 64 KiB prefix, decoding reads the whole file.** Detection is roughly two orders of magnitude slower than decoding, and a prefix is equally decisive.
- **GB2312, GBK and GB18030 are three labels but one decoder.** `encoding_for_label` collapses all three onto `GB18030` and reports the label `GBK` plus `strictly_clean`, rather than inventing a distinction the decoder cannot make. `strictly_clean` means no GB18030-only four-byte sequences, no user-defined code points (which land in the Unicode private use area), and no malformed sequences. Detection can only judge it from the prefix, so `load_book` re-decides it over the whole file — two corpus books are clean for their whole first chapter and reach outside GBK thousands of lines later.
- **A single-byte detection result is a red flag, not an answer.** One malformed byte anywhere disqualifies the correct multi-byte encoding in the detector, and a single-byte encoding then decodes every byte without error — whole-file mojibake that looks like success. Such a result becomes `EncodingConfidence::Low`, and `load_book` returns `LoadOutcome::NeedsEncodingChoice` **without decoding**. Only an explicit override opens the file.
- **`rank_multibyte_candidates` excludes single-byte encodings from the pool entirely**, rather than scoring them low: they produce zero replacement characters on any input and would win every tiebreak.

**`src-tauri/src/book_commands.rs`** holds the thin commands — `scan_library`, `open_book`, `read_book_lines`, `fingerprint_book` — and `BookCache`, a managed state holding **exactly one** decoded book keyed by fingerprint. One engine means one active book, and a decoded novel is tens of megabytes, so an LRU of them would be a memory leak with a politer name. A book is replaced when a different one opens and freed when the app exits, never closed on tab switch; there is no close command (deleted, it had no caller). The untrusted value crossing IPC is the _book name_, pinned by `resolve_book_path` to a single path component; the library root is a folder the user picked in a native dialog and is not otherwise constrained.

The fingerprint is byte size plus FNV-1a over the first 64 KB of raw bytes. The existing content-hash helper is unusable here — it is a 32-bit hash over _decoded_ text, and the fingerprint must exist before the encoding is trusted.

Tests are inline `#[cfg(test)]`, and the corpus is the fixture: the real library at `~/Downloads/_FICTION` (override with `READER_CORPUS_DIR`, opt out with `SKIP_READER_CORPUS_TESTS=1` — a missing corpus fails loudly rather than skipping silently).

## Reader Tab

`src/components/reader/` — the bookshelf model. The library is a destination; opening a book replaces the shelf; Back is pure navigation and leaves the book decoded, so returning is instant.

`ReaderTab.tsx` owns the view state and the library path (`config.reader.libraryPath`, `null` meaning "let Rust resolve the default"). `Bookshelf.tsx` lists the folder; `BookReader.tsx` is the virtualized reading panel; `EncodingPrompt.tsx` replaces the text — not a banner over it — when `status: 'needsEncoding'` comes back, and when the reader asks to reopen a book that did open with a different encoding (the palette's "Reopen with a different encoding…"; `EncodingChoiceTrigger` says which). A reopen decodes the same bytes again, so the fingerprint and the record's answers carry over, while the chapter outline is dropped and elected again over the new text (`refreshBookRecord`).

**One `BookReader` instance per open book.** `ReaderTab` keys it by fingerprint, so a switch from the palette remounts it exactly as Back and a shelf click do, and nothing one book left behind — measured row heights, the scroll offset, a cache keyed by line range — reaches the next. The hooks under it treat `fingerprint` as fixed and have no book-change branch; state that must outlive a book lives in `ReaderTab` (ADR-050).

**`BookLinesStore`** (`src/utils/reader/BookLinesStore.ts`; `useBookLines(fingerprint, lineCount)` is its `useSyncExternalStore` adapter, made once per book) is the windowed line cache: 500-line pages fetched around the viewport, dropped once more than `PAGE_KEEP_RADIUS` pages away, so memory tracks the window rather than the distance read — a page that lands after the reader has left its reach is dropped too, without a notification, and every result after `close()` is dropped. Its `error` is the oldest failed page still inside the window: another page landing does not clear it, only that page landing on a retry or the reader scrolling out of its reach. Eviction does not bump `linesVersion`. `getLine` returns `undefined` for a line whose page is still in flight — distinct from `''`, which is a real blank line. Line numbers are the file's own, blanks included, because reading position is a raw file line number (see "Book Records" below).

Virtualization is `@tanstack/react-virtual` (ADR-042), not the in-repo `useVirtualScrollRange` — see that ADR for why the existing hook could not be extended.

**Last book and launch resume.** `config.reader.lastBook` is the fingerprint of the book opened most recently; `config.reader.resumeOnLaunch` is true while a book is on screen. Opening a book sets both; Back (and a book waiting on an encoding choice) clears only `resumeOnLaunch`. Quitting clears nothing — the close handler in `App.jsx` flushes the position and destroys the window, with no Back — so the next launch reopens `lastBook` once the first scan lands, and a reader who went Back first lands on the shelf. Either way the shelf's "Continue reading" card offers `lastBook` (`findLastBook`, `src/utils/reader/LastBook.ts`, matching by fingerprint, so a renamed file is still found; never after a `recordsUnknown` scan). Both writes are best-effort: a failed one costs the next launch's resume, never the open.

### Book Records

Persisted per-book state — reading position, dictionary binding, elected outline pattern and its manual override — lives in `books.json`, a 4th `BlobKind` alongside config/appearance/transform-rules (`src-tauri/src/dictionary_commands.rs`). Reconciliation (deciding what changed, what moved, what to write) is entirely TS-side; Rust's only addition is `fingerprint_book`, a thin command that reads a file's size plus its first 64 KB — never the whole book — so identity checks stay cheap even over a large library.

**Each record holds the reader's answers and observations.** The **reader's answers** (`position`, `manualChapterPattern`, `binding`) can't be regenerated, so no refresh ever writes them. **Observations** (`title`, `lastKnownPath`, `sizeBytes`, `modifiedMs`, `available` from the scan; `lineCount`, `encodingLabel` from an open; `chapterOutline` from election) are overwritten whenever their source sees the book again, and kept otherwise — except that an open reporting a different `encodingLabel` drops `chapterOutline`, since election read the text as decoded before. The map is keyed by `fingerprint`, not path, so a rename or move survives. **`src/utils/reader/BookRecord.ts`** holds the rule: `READER_ANSWER_FIELDS`, `emptyBookRecord` (the one set of defaults) and `refreshBookRecord` (defaults, then the existing record, then the new observations, with the answers re-applied last), which both the open and the scan go through. `BookRecordValidation.ts` repairs a malformed field to its `emptyBookRecord` value rather than dropping the record — for an answer that means "not started", "never answered" or "trust election", a smaller loss than losing the record's existence.

_Avoid_: authoritative/cached (for the two kinds of field; `chapterOutline` is neither regenerated by a scan nor the reader's answer — it is an observation only election makes).

**`src/utils/reader/ReconcileLibrary.ts`** runs after every `scan_library`, as one **reconciliation plan**. `planReconciliation(records, scanBooks)` decides once, from the unlocked read, which files are unchanged — a scanned file's `(sizeBytes, modifiedMs)` matching an `available` record at that same path — remembering each one's fingerprint; that skip is what makes rescanning an unchanged library free. The rest (`needFingerprint`) get fingerprinted, then the plan's `resolve(freshRecords, fingerprints)` runs as a `transformRecords` against a re-read — finding trusted files' records by fingerprint, never re-deciding "unchanged", so a concurrent position save survives. It relinks an existing record to its new path (a move/rename — `position` carries over untouched) or creates a fresh one (`position: null`). A previously-`available` record matched by nothing this scan flips to `available: false` and stays in the map, so a later rescan that finds its fingerprint elsewhere re-links it silently. A file whose fingerprint failed — or a trusted file whose record vanished between the reads — is off the shelf this pass only: the record at its path stays `available` and is not listed as missing.

**A scan that cannot be reconciled** (the records failed to load or save — see "Unreadable app files") still shows the scan. Every scan comes to one **shelf outcome** (`scanShelf` in `ReconcileLibrary.ts`): `loaded` (each book with its fingerprint, plus the missing list), `recordsUnknown` (the scanned books in the shelf's own order, `byShelfTitle`, with no fingerprint field at all and no missing list, since no record was read), or `scanFailed` (the error). The shelf shows "—" for progress, binding and chapters under `recordsUnknown`, with a notice to rescan. `useLibrary` (`src/hooks/useLibrary.ts`) owns the folder setting and the scans around it; its `folderError` (a folder that could not be saved) and `ReaderTab`'s `openError` are shown above the shelf without replacing it.

**`src/utils/reader/BookRecordsBackend.ts`** owns `books.json`'s read-modify-write: `transformRecords(fn)` is the only write — queued behind every write before it (the books App File's `transform`; see "App file"), handed the freshest records, saving what `fn` returns unless it returned them unchanged — so a scan's reconciliation write and a debounced position flush (see "Reading Anchor" below) can never race and drop one side's changes. The lock and the save live inside the App File, so no caller can save out of order; a read that must see queued writes uses `readSettledRecords()`, and `loadBookRecords()` is the unqueued snapshot. Its in-memory cache is observable (`subscribeBookRecords`, read through `useBookRecords`): the shelf reads each book's progress off it live rather than from a copy taken at scan time, so Back from reading shows where the reader got to without a rescan.

### Reading Anchor

Where the reader is in the book: the topmost line touching the viewport, plus how far scrolled into it (a 0..1 fraction). It is the one answer to "where is the reader", and everything else follows from it: the persisted reading position is the anchor written to disk, the line shown in the chapter strip is the anchor's line, and the translation window is centred on it. A jump, a restore on open, a re-anchor after a dictionary reload and a relayout after an Appearance change all set the anchor or restore it. None of them keeps its own copy.

Two rules belong to the term itself:

- **A jump's settling is not a move.** When the Reader jumps to a line, rows the virtualizer had only estimated get measured, and the scroll event that follows would walk the anchor backward. The anchor is the line jumped to, and that is also what gets persisted.
- **Row heights that change while the Reader is hidden are fixed on return.** Appearance is its own tab, and a reload can come from the Translator. Either one changes row heights while the Reader is not visible and so cannot be measured. The anchor captured before the change is re-applied when the Reader becomes visible again.

_Avoid_: scroll position (that means pixels, and a pixel offset is never persisted), current line (only half the anchor).

**`src/utils/reader/ReadingAnchor.ts`** holds all of it, with no React. Time, animation frames and storage are passed in, so its tests drive the clock by hand. **`useReadingAnchor`** (`src/hooks/`) adapts it to React: it forwards the book, tab, engine-version and Appearance signals, plus the reader's wheel, pointer and keys (these hand a re-anchor back). Its interface is `{ anchorLine, viewportLines, readLine(), onScroll, scrollToLine }`.

The anchor is measured in the master panel's scroll handler (`onScroll`), from the virtualizer's own measurements. There is no IntersectionObserver, although the Reader spec (#21) proposed one: the handler already runs on every scroll and reads the same geometry. Restoring is `ReadingAnchor`'s own frame loop, not `ScrollPositionRecovery`, because that helper writes pixel `scrollTop` values and the anchor is a line plus a fraction that only the virtualizer can turn into pixels.

How the position is kept:

- **Writing.** Writes to `books.json` are debounced by 1.5s. A pending write is flushed when the Reader tab loses `isActive`, when the book closes, and on app exit. App exit reaches it through the one-slot `PendingPositionFlush.ts` registry, from `App.jsx`'s `onCloseRequested`.
- **Restoring on open.** `scrollToIndex` runs on the next frame, retrying each frame while the panel has no layout yet. Once the row is measured, `scrollTop` is nudged by the stored fraction.
- **Dictionary reload.** The anchor is re-applied every frame until the refill has been quiet for 250ms. A 1.5s grace period covers a refill that has not started yet, and there is a hard ceiling of 15s. The reader's own input ends it at once.
- **Appearance change.** Every panel's measurement cache is dropped, and the anchor is restored once on the next frame.
- **While the Reader is hidden.** Both of the last two wait until the Reader is shown again. If both happened, the panels are measured first and the reload loop does the restoring.

### Reader Panels

The Reader shows the same lines three times, side by side: the Vietnamese translation, the Chinese original, and the character-only gloss. Each is at its own natural height, because a line wraps differently in each language. The translation panel is the **scroll master**, and the other two are **followers**. Followers are aligned to the master by line index plus a sub-line fraction, never by pixel ratio: a pixel ratio compounds three panels' height estimates, which are mostly guesses at 75,000 lines. Followers never drive. A wheel over one scrolls the master, and a follower that moves by itself is pulled back.

A **panel row** is one line as one panel renders it. A Vietnamese row whose translation hasn't landed yet shows its Chinese, dimmed and not clickable, at nearly its final height, so it barely moves when the Vietnamese arrives. A **blank line** (`isBlankLine` in `PanelRows.ts`: whitespace-only, and _not_ `undefined` — an unfetched line keeps its full estimated height) collapses to nothing in all three panels, and the panels' row-height estimate asks the same function, so a row's collapse and its estimate cannot disagree. `useWindowedTranslation` hands out the rows (`getRow`) along with one `contentVersion` that changes whenever any row's content does. What every row shows is decided in one pure module, `src/utils/reader/PanelRows.ts`: `projectPanelRows(entries)` folds the landed chunks into a frozen snapshot whenever a chunk lands or leaves, and `rowAt(snapshot, panel, index, line, isBlank)` answers one row from it plus the line as it stands now. Its rules — stand-in Chinese without runs, a gloss not yet landed left out rather than blank, the original panel pending only on its own page and filling back in what no run covers — are table-tested there. A line split across chunks, only some of them landed, shows the landed Vietnamese with the rest of its Chinese in place, dimmed (`isPending` runs), so the reader can see what is still untranslated.

**The chunk line fold** (`src/utils/reader/ChunkLineFold.ts`) is the one rule that turns translated chunks back into file lines: `chunkLineRanges` divides a chunk's text between its lines (surplus engine newlines fold into the last line, missing ones leave empty ranges), and `orderChunksByLine` puts a line split across chunks back in book order. `assembleTranslatedLines` (plain line strings) and `linePieces` (the landed pieces per line) are built on it, and `LineSegments.ts` cuts its runs from the same `chunkLineRanges`, so a row's runs equal its plain text. `ChunkLineFold.test.ts` asserts that over 200 seeded random chunk sets, including split lines and out-of-order arrival. Window planning stays in `TranslationWindow.ts`. The Chinese-panel segment builder is deliberately outside the fold: its offsets come from `chunk.startChar`, not from what earlier chunks contributed. Both memos (`chunkLinePieces`' `WeakMap`, `LineSegments.ts`' `sliceChunkCached`) are unchanged.

**Highlighting is click-only.** Clicking a run lights that unit in all three panels (`useReaderHighlight`), and clicking it again clears it; each run also carries a native `title` tooltip. There is no hover highlighting, on purpose: lighting a unit on mouse move would re-render all three virtualized panels on every move, undoing the per-row memoization the panels depend on.

_Avoid_: left/right panel (the layout is not the role), source panel (ambiguous between the original and the gloss).

**`src/hooks/useReaderPanels.ts`** owns the set: the three virtualizers and their width estimates, the one-way sync (`usePanelSync`), re-alignment when a row's measurement changes, wheel forwarding, paging, and fetching the book's pages around what the master is about to paint (`requestRange`, 600 lines of slack each way). It returns `{ master, followers, panels, pageBy, isBlankAt }`, and `BookReader` spreads each entry of `panels` into a `<ReaderPanel>`.

### Window Filler

Translates the region the reader is in, on demand, as the anchor moves. `WindowFiller` in `src/utils/reader/WindowFiller.ts`, a plain class built once per book instance with the Reader's two engine calls; `useWindowedTranslation` is its React adapter (one effect calls `update`, `useSyncExternalStore` reads it, unmount calls `dispose`) and keeps only the row getters and `contentVersion`.

`update(inputs)` re-plans: it marks the cache stale on a new `dictionaryVersion` (even while disabled), prunes to the keep band, plans the fetch band nearest the anchor first (`TranslationWindow.ts`), and runs `fillPlan` (`WindowedTranslationFill.ts`) over the missing chunks, re-projecting rows (`PanelRows.ts`) as each lands. It owns the chunk cache, the rows snapshot (`{rows, version, isTranslating}`) and the two staleness counters — `generation` (every plan; `isStale`) and `lifetime` (dispose only; `isAbandoned`), which must stay separate (`src/utils/reader/CLAUDE.md`). An update that cannot plan (disabled — the Reader hidden or the engine down — or no geometry yet) still counts as a plan, so a running fill starts no further chunk. `isTranslating` clears in three places, all inside it: an update that cannot plan, a plan that finds nothing missing, and the end of the newest plan's fill.

Not shared with `useOutlineTranslations` (ADR-043). Tested without React in `WindowFiller.test.ts`.

### Reader Commands

Everything the reader can ask the Reader to do: step a chapter, open the outline, page, reload or bind dictionaries, add an entry, switch books. Each is **one action**, named by the hotkey dispatch table's own action type (`previousChapter`, `quickAddCharacter`, …), and reachable by up to three **routes**: a palette row, a hotkey, or a button. Every route runs the same function, so a palette row and the key its hint advertises cannot do different things.

Every route the Reader offers, it owns: its action record is passed straight to `useHotkeyHandler` as its `handlers` map (keyed by the same action types), under `ownTab: 'reader'`. Its Add actions are `useDictionaryModals`' `handlers`, spread into the record unchanged.

The palette also has **rows of its own**, which are not actions: switching to another book, and reopening the open book with a different encoding. They have no key, and an action id is a hotkey action type, so these rows carry no action id and run their own function. They are the palette's Books group. What they need comes from the shelf as one record, `ShelfNavigation` (`books`, `switchBook`, `reopenWithEncoding`, in `PaletteCommands.ts`): `ReaderTab` builds it and `BookReader` hands it to `useReaderCommands` without reading it. Until then it travelled as three separate `BookReader` props that `BookReader` never read.

An Add action takes the text to pre-fill, and both routes get it from `resolveQuickAddSource` (see "Selection mapping"). Which actions take it is one table fact, `SOURCE_ACTION_LABELS` in `HotkeyDispatchTable.ts` — Cmd-1…7, with Cmd+Shift+N bound to `quickAddProperNoun`, the same action as Cmd-3 — read by the hotkey hook and the palette alike; every other action gets no text by either route. The palette asks when it opens, because typing into the palette's search box clears the page selection; a refusal makes its Add rows toast instead of opening. A hotkey asks when pressed.

**`src/hooks/useReaderCommands.ts`** holds the action record, the Add dialog, the palette, and the fiction Adds filed under the book's binding. **`src/utils/reader/PaletteCommands.ts`** is the palette's row table (label, shortcut hint, group, search keywords, action id), and **`ReaderActions.ts`** names the actions.

_Avoid_: command (for one row; that is a palette row), shortcut (for the action; a shortcut is one route to it).

### Chapters

What the Reader knows about a book's chapter structure. The **outline** is the list of chapter headers: the lines that match the book's elected pattern, or the pattern the reader chose instead (the **override**). The **current chapter** is the last header at or before the reading anchor, so reading before the first header means no current chapter. **Stepping** follows a media player's previous-track rule: back from inside a chapter returns to that chapter's start, and back from its start goes to the one before. Chapter **titles** translate in the background in batches, nearest the current chapter first, and a title translated against older dictionaries keeps showing until its replacement lands.

**`src/hooks/useChapters.ts`** holds all of it behind one interface (`headers`, `current`, `canStep`/`step`, `displayTitle`, `override`), for the chapter strip, the outline panel and the binding dialog. Inside it, `useChapterOutline` runs election and applies the override, `useOutlineTranslations` translates the titles, and `ChapterNavigation.ts` finds the current chapter and a step's target.

_Avoid_: section, part (for a chapter; a volume pattern is still a chapter pattern here), TOC (for the outline).

### Reader Engine Calls

The Reader's three calls on the shared engine: a chunk of book text, its character-only gloss, and a batch of chapter titles. Each is one call as the Reader owner of **EngineAccess** (below), so none of them is ever in flight beside another Reader call or a Translator call. None carries `onPreempt`: a Reader call is one chunk long, so the Translator waits for it.

**`src/utils/reader/ReaderEngine.ts`**'s `createReaderEngine(access)` maps each need to an engine method and shapes the result; it holds no queue. `useReaderEngine` builds it once in `ReaderTab`, which never unmounts, and hands it to each `BookReader` as its `engine` prop. It is the only producer of the `EngineCall<T>` brand that the fill hooks require.

## EngineAccess

Who may call the translation engine, in what order, for both translating tabs. `translateWithSegments` resets engine-wide segment state on entry, so two calls in flight at once corrupt each other. One FIFO chain serves both tabs, and on top of it **ownership follows the visible tab**:

- **A hidden tab's call is refused** (`EngineAccessRefusedError`) at the moment of the call. A call already queued runs even if the tab switches before its turn: it is short, and dropping it would only log a skipped chunk. The Reader's `isEnabled` gate stays the normal path, so a refusal means a new caller forgot it.
- **A call from the visible tab preempts the other tab's preemptible calls.** A call is preemptible when its caller passes `onPreempt` (the Translator's document run passes one that cancels its `translationRunner`; a Reader chunk and the Translator's character-only call do not). The visible tab's call starts only once the engine has actually stopped, because the queue waits for the preempted call to settle. A call still waiting when it is preempted is skipped (`EngineAccessPreemptedError`). A call without `onPreempt` is drained, never cancelled.
- **A preempted Translator run keeps its partial output**, toasts "Translation paused", and is not restarted: the reader translates again. `useDeferredRetranslate` is unrelated to preemption: it still redoes the Translator's input lazily after a Reader-triggered dictionary reload, because re-translating a hidden document is cost, not only contention.
- A rejected call never blocks the calls behind it. The engine is read when a call's turn comes, not when it is queued.
- **Reload and rebuild are not covered** (ADR-065): the engine is swapped under the queue, and a stale result is the caller's to discard.

**`src/utils/EngineAccess.ts`**'s `createEngineAccess({getEngine, getVisibleTab})`; `EngineProvider` builds one and exposes it as `useEngine().engineAccess`. `VisibleTabProvider` sits above `EngineProvider` for that reason. `engineRef` stays for readiness, reload and init, but a translate call never goes through it: `src/__tests__/EngineAccess.guard.test.js` scans production code for a call outside the two allowed callers. Pinned by `EngineAccess.test.ts` (one call at a time, refusal, preemption, drain) and ADR-085.

### Dictionary Binding

Which fiction dictionary a book uses, kept on the book's record and keyed by fingerprint so renaming or moving the file preserves it.

**`binding: null` means never answered; `{ fictionDictionary: null }` means the answered "no fiction dictionary".** They are different values on purpose: collapsing them into one nullable string loses the answered-none case, and the offer then comes back on every open forever.

**`src/utils/reader/FictionDictionarySuggestion.ts`** derives a suggestion from the file name — strip the extension and the Chinese title, fold Vietnamese diacritics, run the words together (`Tạp đồ 卡徒.txt` → `properNouns-f_TapDo`). Measured against the real library it lands on the right existing dictionary for 15 of 23 books; the rest are deliberate hand-shortenings (a franchise name for a fan work, a dropped trailing "truyện", a spin-off sharing its parent's set) that no rule recovers. `FictionDictionarySuggestion.test.ts` uses the real corpus as its fixture for exactly that reason — a synthetic one would let a regression pass. So the suggestion is pre-filled and then gets out of the way: picking a different existing dictionary is one dropdown away, not behind a mode switch.

**`src/utils/reader/BindingActivation.ts`** is the authority rule as arithmetic. `activeProperNounsForBinding` keeps every non-fiction entry and **replaces** the fiction slice with exactly the bound dictionary (or nothing) — replacing, not adding, because a list left over from the previous book would otherwise translate this book's proper nouns against another novel's names. `quickAddTargetForBinding` points the default quick-add dictionary at the binding, and clears a default only when it pointed at some fiction dictionary that is now inactive. `bindingConfigChange(current, { activate?, binding? })` is the one diff of those two config fields — what an answer writes, and what a tier move writes (`activate` adds the promoted generic, `binding` applies only when a book is open) — reporting `activeChanged` (the engine's set changed) apart from `changed` (anything to save), both measured against `current`. `dictionaryInUse(binding, missing)` is the rule "the recorded answer, unless its dictionary is missing", once.

**ConfigurationBindingView** is what the Configuration screen shows and locks while a book is open: `configurationBindingView(config, openBook)` in `BindingActivation.ts`, a pure function the screen's hook calls in a `useMemo`. It returns the effective active list, the effective default, `isDefaultLocked` and `isRowLocked(id)`. The checkbox's disabled state and the toggle's refusal both call `isRowLocked`, so they cannot disagree. **The two locks differ on purpose**: a fiction row is locked while any book is open, bound or not (an unbound book's answer is "no fiction dictionary", so its rows are not where to add one), but the default is locked only for a book bound to fiction (Cmd-5 then follows the book; an unbound book leaves a generic default in force, which stays editable). A `bound` that does not name a fiction dictionary reads as none, as in `quickAddViewForBinding`, which it builds on. Every Add decides over the store's `loadQuickAddView` instead; this is the same arithmetic for the one screen that reads config through `useAppConfig`. A toggle's new list is still computed under the config lock by `activeProperNounsAfterToggle` (ADR-059); the view only decides whether to refuse it. Pinned by `BindingActivation.test.ts`, with `useDictionaryConfigManagement.binding.test.tsx` as the wiring test.

**`src/components/BookBindingStore.ts`** owns the open book's binding for the whole app: a plain module like the Dictionary Store, made by `createBookBindingStore(deps)`, with one queue for every operation and one immutable snapshot (`openBook`, `binding`, `missingFictionDictionary`, `isApplying`, `error`, `applyError`). Its `deps` are the book records, the dictionary list (read only for the open-time existence check), the pair create and rename, and the engine's `reinitializeEngine` with the Dictionary Store's `getDictionaries`, taken with their real contracts: the store's own `rebuildEngine` reads the map at call time, passes `forceConfigReload: true` and turns an `ok: false` outcome into the rejection its failure paths catch; config it reaches through `appConfig` directly, so its tests (`BookBindingStore.test.ts`, no React) run over `installFakeConfigDisk()`. **`src/components/BookBindingContext.tsx`** is the adapter, mounted above `TabbedInterface` (inside `EngineProvider`, since applying a binding reinitializes the engine): `useSyncExternalStore` over the store, plus the one thing that is React's, the dialog's open flag. The store is made once, and what it needs from other contexts (`reinitializeEngine`, `loadDictionary`, `applyRename`, the Dictionary Store's `getDictionaries`) reaches it through a latest-value ref, so a changed identity is picked up at the next call. `bind` and `createAndBind` resolve `true` once an answer landed, and the adapter closes the dialog on that and leaves it open to show a failure. It sits flat in `src/components/` rather than in `reader/` for the same reason `EngineContext` does: every tab consumes it, so filing it under one tab would have the other two importing into that tab's folder. Applying is one serialized operation — write `activeProperNouns` + `defaultQuickAddDictionary`, then `reinitializeEngine(..., { forceConfigReload: true })` — and is skipped entirely when the computed list already matches, so reopening the book already open costs nothing. An unbound book applies `null` **without persisting one**: it reads immediately with the general dictionaries only, and the offer stays on screen.

**The recorded answer and the dictionary in use can differ.** `binding` is what the book's record says; `boundFictionDictionary` is the fiction dictionary actually applied. They part when the bound dictionary no longer exists on disk (renamed in Finder, lost to a reset or import): on open, the bound id is checked against a fresh `listProperNounsDictionaryIds()` — not the Dictionary Store's list, which may not have loaded on the first open after launch — and a missing one is applied as "none" and named in `missingFictionDictionary`. The record is left alone, as every reader's answer is; the binding banner says the dictionary is missing until the reader answers again. Anything that files or reads "this book's names" (every Add's quick-add view, the Configuration tab's fiction rows) reads the dictionary in use, never `binding`.

**A fiction dictionary's name lives in three places, and the context is the one module that reaches all of them**: the pair's two file names and `config.json` (Rust's `rename_proper_nouns_dictionary`, with rollback) and every book record bound to it (TS-owned, `renameBoundDictionary` in `BookRecordsBackend.ts`). So the Configuration tab creates and renames every dictionary through `createDictionary`/`renameDictionary` rather than calling Rust itself: a rename has Rust rewrite `activeProperNouns` and a create has TS rewrite it, so each runs on the binding queue behind any apply in flight (ADR-062), and only a fiction rename has book records to update. `fictionDictionaries` is the Dictionary Store's list filtered to fiction ids, derived in `BookBindingContext`; the tab's own rows are the same list. Rename runs in the apply queue: Rust rename, then the records, then the pair reloaded under its new name, then the open book's `binding` — no engine rebuild, since config already names the new id and the data is unchanged. A records write that fails is reported (`filesMoved: true, success: false`), not rolled back; the open-time check catches every record it left behind.

**Promote and demote are a rename across tiers.** Right-clicking a Fiction or Generic row in the Configuration tab offers `moveDictionaryTier` (`BookBindingContext`): `properNouns-f_X` ⇄ `properNouns-_X`, patterns half included, through the same Rust rename. A book binds only to fiction, so promoting answers "none" for every book bound to it (`unbindDictionary`) and activates the generic, which every book then reads. Demoting leaves the fiction slice to the open book's binding. Either way the engine is rebuilt when the dictionary is in use, since priority follows tier (`priorityOf`); the rebuild reads `getDictionaries()`, the store's current map, because the rename has landed there before React re-renders. **A plain rename never changes tier.** The tier is part of the typed name (`f_`, `_`, none), so `BookBindingStore.renameDictionary` refuses a rename whose `tierOf` differs before anything moves; until 2026-10-12 typing `f_X` → `_X` in the rename field promoted a dictionary with its books still bound and no rebuild. Rust's rename stays permissive on purpose: `moveDictionaryTier` uses the same command (calling the pair rename directly, not the store method), so a guard there would need a flag to tell the two apart (architecture review 2026-10-12, candidate #1).

_Avoid_: bound dictionary (for what is applied — say the dictionary in use; "bound" is the recorded answer, which can name a dictionary that no longer exists).

**While a book is open, the Configuration tab's fiction checkboxes are a read-only reflection of the binding; generic and theme dictionaries stay fully editable there.** `useDictionaryConfigManagement` derives what it renders through `activeProperNounsForBinding` rather than from its own mount-time config read, and a generic toggle is computed from that same derived list — a toggle computed from the stale raw list would write the previous book's fiction dictionary back to disk, which the engine's next reinitialization would then load.

**The default Cmd-5 dictionary is the book's while a book bound to fiction is open, and cannot be set then.** `quickAddViewForBinding` points every Add at the bound dictionary, so `useDictionaryConfigManagement` shows that as `defaultQuickAddDictionary` (through `quickAddViewForBinding`, not the saved key), disables the bookmark buttons (`isDefaultLockedByBook`) and refuses `handleSetDefaultQuickAdd`. A write would change nothing now and the next fiction bind overwrites it. A book with no binding leaves a generic default in force, so it stays editable; so does everything once the book closes (2026-10-07, architecture review round 15, candidate #3).

**Closing a book gives up its authority, and nothing else.** `ReaderTab` calls `announceClosedBook()` whenever it stops showing a book — Back to the shelf, or a newly picked book waiting on an encoding choice — and `isBookOpen` goes false: the Configuration tab's fiction rows unlock, and every Add's view is config as loaded again. Closing writes no config and rebuilds nothing, so the last book's fiction dictionary stays active until the Configuration tab or another book changes it. Resetting the fiction slice to none on close was considered and rejected: it would rebuild the engine on every Back, and leftover config does no harm once no book claims it. Reopening a book calls `announceOpenBook` again, whose apply is a no-op when the list already matches.

**What the dialog opens on is `initialBindingDraft`** (`FictionDictionarySuggestion.ts`): the book's answer if it has one, else the suggestion — an existing dictionary when one has that name, a pre-filled create when none does, none when nothing could be derived. The answer "none" opens on none with the suggestion waiting behind it. A recorded dictionary that no longer exists (`missingDictionary`) is no answer: it opens as if the book had never answered.

The offer itself is a dismissible banner (`BindingBanner.tsx`), never a modal, and dismissal is session-local: it is not an answer, so nothing is written. **`src/components/reader/ReaderBinding.tsx`** is the reading view's binding UI, as three pieces that each read the provider themselves: `BindingButton` in the header, `BindingNotices` (the banner and a failed apply) and `BookBindingDialog`. `BookReader` places them and passes only the book's title, file name and chapter override. **`src/hooks/useBindingOffer.ts`** is the stateless derivation they share — the suggestion, whether to offer (`shouldOffer`), and the binding button's label — while `BookBindingContext` stays about persisting and applying an answer app-wide. Dismissal is `BindingNotices`' own state, lasting as long as the reading view, so Back and reopen offer again. Applying may fail and reading carries on, so the engine can still hold the previous book's fiction dictionary: the context's `applyError` (set only by a failed config write or engine rebuild, never by a refused name or a failed save) shows in `BindingNotices`, under the banner, whenever the dialog is closed, with a way back into it. `BindingDialog.tsx` carries all four answers plus the chapter-outline election table, since it is the one moment the reader is already looking at this book's metadata. Creating a new pair reuses `create_fiction_dictionary_pair` (ADR-027) — no new backend work for create or rename.

## Tab Order

`src/constants/tabs.ts` owns `TAB_ORDER`, and both the nav bar (`TabbedInterface.tsx`) and the `Option/Alt+digit` shortcuts (`HotkeyDispatchTable.ts`) derive from it by index — so the shortcut for a tab is its position in that array, kept in sync by construction rather than by editing two files. `HotkeyDispatchTable.test.ts` still pins each binding literally: the array is the mechanism, but the specific bindings are in the user's muscle memory and a reordering must fail a test rather than silently follow the array. The Reader is first and took `Option/Alt+1`; the five tabs that predate it each moved down one.

## ChapterOutlineStore

One open book's chapter outline: first-open election (candidates plus the elected pattern), the manual override, and the headers for whichever pattern is in effect. Plain module with `subscribe`/`getSnapshot`; `useChapterOutline` is its `useSyncExternalStore` adapter and only starts it on mount and closes it on unmount. Three orderings live here: the newest headers request wins; election's outcome always lands, and its headers are fetched against the override as it is when election resolves; the override is written to the book record at the moment it is chosen, in call order, not after its headers arrive (before, two quick picks could persist out of order). After `close()` late results are dropped and nothing is written; `open()` is idempotent, so a StrictMode remount only lifts the close. `useLibrary` and `useBookLines` have similar ref-ordered state and were left out of this slice.

Calls `window.electronAPI` and `BookRecordsBackend` directly (one adapter is not a seam, ADR-014); tests stub the global and mock `BookRecordsBackend`, as `ChapterOutlineStore.test.ts` does. Entry point: `src/utils/reader/ChapterOutlineStore.ts`.

## CommitFeedback

What the user is told when a Dictionary Edit does not land. Pure: `describeFreshFailure(result, failMessage)` for a CRUD commit, `describeReplayFailure(action, result)` for undo/redo, `describeOperationError(error, verb)` for a thrown error, each returning a `Feedback` (`{ level, message }`) or `null`, which the caller toasts. Before, `commitOrThrow` and `useDictionaryHistory` each worded the outcomes, and six CRUD methods each carried their own catch.

Two kinds of caller because `refused` means two things. A **fresh plan** (`useDictionaryCRUD`) planned the edit against the dictionaries it commits to, so a refusal is a bug and is an error. A **replayed** edit (undo/redo) may have gone stale, so a refusal is a warning that names the keys. They share the half-applied advice ("could not be fully reverted — reload dictionaries before editing further"), once. Undo and redo with nothing to replay say nothing: the UI gates on `canUndo`/`canRedo`. `ValidationError` carries a `severity` (`'error'` by default; `'warning'` for deleting an entry already gone) so the one catch can toast it at the right level.

Entry point: `src/components/dictionary/CommitFeedback.ts`. Used by `useDictionaryCRUD.ts` and `useDictionaryHistory.ts`.

## Dictionary labels

What a dictionary is called on each screen, from `src/utils/dictionary/DictionaryLabels.ts`. Four names, on purpose, because what stands next to the name differs: `getDictionaryLabel` (short, for a provenance column: `f_X`), `getDictionaryDropdownLabel` (the move dialogs: `Proper Nouns - f_X`, root `Proper Nouns (Base)`, `Patterns - f_X`), `dictionarySelectorLabel` (the Dictionary tab's selector: root `Proper Nouns`, `Patterns - f_X`) and `configurationDictionaryName` (the Configuration screen: root `General Purpose Dictionary`, otherwise the bare name). All four build on `bareNameOf(id)` in `DictionaryIdClassifier.ts`, the inverse of `toProperNounsDictionaryId`: a name after the kind prefix, or the id itself for a root.

Seven hand-written `.replace('properNouns-', '')` copies on four screens used to decide this, and disagreed: the selector said "Pattern - X" where the move dialogs said "Patterns - X". `SourceConventionScan.test.js` now fails on any `.replace('properNouns-'` or `.replace('patterns-'` outside the classifier. The rename field's seed and the tier menu's text use `bareNameOf` directly, since they show the name as text, not as a label. `getDictionaryLabel`'s old doc example claimed `'Harry Potter'`; it returns `HarryPotter`.

## Candidate finder

A Reader panel for the open book (design settled in wayfinder map "Candidate finder for new proper nouns"; built so far: the run, ranked table, progress and cancel (#44), the coverage mask and Also-in tag (#45), Add one candidate (#46), dismiss and restore (#47), the library background index and spread gate (#48) — no rules yet). It lists strings that are probably proper nouns but are not yet in the book's active proper-noun dictionaries, ranked, with context lines and a quick add. It never writes a dictionary on its own: every add is a user action per row (or a batch the user triggers).

**Run** (`candidate_finder.rs`, `candidate_finder_commands.rs`, `CandidateFinderStore`):
The pure Rust analysis takes the book's lines, the `phrases` keys and the proper-noun keys (below) and returns every survivor with count and line count, or nothing when cancelled; the command runs it on a blocking thread over the cached book handle, with a frontend-chosen run id for progress events (`candidate-finder-progress`: stage `reading`/`counting`/`scoring`, percent 0-100) and cooperative cancel. Closing the panel cancels a running run and keeps a finished list; unmounting the Reader (switch, Back, encoding prompt) drops it.

**Candidate**:
A string of 2-8 characters in the open book that the finder judges likely to be a proper noun and that no active proper-noun dictionary holds. Phrases and characters do not count as holding it.
_Avoid_: suggestion, new word, unknown word

**Coverage mask**:
The spans of the book already matched by the book's active proper-noun dictionaries, taken out before counting so fragments of existing entries and strings glued to them are not candidates. It follows the Phase 2 matching rule (leftmost, longer wins, a strictly longer match starting inside the span defers the earlier one); Phase 1 pattern claims are ignored. Rust has its own matcher (`mask_spans`); `src/test/fixtures/coverage-mask-parity.json` is read by it and by `CoverageMask.parity.test.js` over Phase 2 itself. A run sends the keys of the active proper-noun dictionaries (the mask) read from the Dictionary Store when it starts; an active dictionary that is unread refuses the run and is named. Masking sees Han runs only: a key with a space, Latin letter or digit never masks (Phase 2 can match across a space). A name left over after masking (a deferred occurrence) that an active dictionary holds is dropped too.

**Book index** (`book_index.rs`, `candidate_finder::build_sidecar`, `backgroundBooks`):
The spread gate's background table. One **sidecar** per book, `book-index/<fingerprint>.bin` in app data: the sorted FNV-1a 32-bit hashes of the book's strings of 2-8 characters seen at least 3 times, with the encoding label and a format version in the header; written atomically (temp file, rename), valid while fingerprint, encoding and version match, otherwise rebuilt. Built when the Reader opens a book (`index_open_book`) and backfilled with progress (stage `background table`, the first 40% of the bar) at a run that finds one missing. A candidate frequent in more than 2 other books' sidecars is dropped (binary search per sidecar); with fewer than 4 other indexed books the gate is skipped and the run reports `weakFiltering`, which the panel shows as a notice. The background set is every other available book except those bound to the same fiction dictionary (`backgroundBooks`, TS). A library scan that reconciled records calls `prune_book_index` with every record's fingerprint and the rest are deleted. The folder is a cache: deleting it only makes the next run rebuild.
_Avoid_: global table, word list

**Candidate row Add** (`CandidateAdd.ts`, `useCandidateFinder`'s `adder`):
A row's translation field is seeded by `initialEntryGuess` (the Add form's guess, re-seeded when the "Add to" target changes); the dropdown is `quickAddChoices` over the book's quick-add view, opening on `quickAddTarget('properNoun')` (the Cmd-5 dictionary). Add calls the Dictionary Store's `addEntry` (`planAdd` + commit) with no dialog; a failure stays on the row. The panel derives which rows are added from the Dictionary Store's snapshot (an active proper-noun dictionary holds the source), so a row leaves on Add and returns on Undo, and "N added since this run, re-run to update" is that count. The view is the one the last run read; the engine is not rebuilt (ADR-106).

**Also-in tag**:
The mark on a candidate that an inactive proper-noun dictionary already holds ("in X, not active here"). The candidate stays listed; an inactive dictionary never masks.

**Dismissed candidate**:
A candidate the reader has rejected for this book. It is a reader's answer kept in the book's record, so no scan, open or re-run ever writes or clears it.
_Avoid_: ignored, blacklisted

**Rule boost**:
The ranking weight a candidate gets when an enabled Transform Rule matches it. The same rule match pre-selects its `semanticType` in the row; with no rule match the row arrives with the proper-noun default type.
