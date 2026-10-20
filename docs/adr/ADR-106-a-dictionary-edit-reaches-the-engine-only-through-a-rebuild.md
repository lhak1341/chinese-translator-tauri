# ADR-106: A Dictionary Edit Reaches the Engine Only Through a Rebuild

**Status:** Decided
**Date:** 2026-10-20

## Context

An architecture review (2026-10-20, round 34, candidate #1) questioned the per-dictionary cache invalidation that ran after every write to the Dictionary Store. A commit, reload, rename or import called the store's `invalidate` dependency for each dictionary it touched. That call went through six steps:

1. `invokeEngineInvalidator` in `DictionaryContext.tsx`, which had three states and two warning toasts
2. the invalidator `Translator.jsx` registered while `enginePhase === 'ready'`
3. `TranslationEngine.invalidateDictionaryCaches`
4. `DictionaryManager.invalidateCache`
5. `TranslationCache.invalidateDictionary`
6. a scan of the lookup memo for entries that had searched that dictionary

The memo sat in front of tries that never change after load. `buildTrieFromDictionary` copies every entry when `loadDictionaries` runs, and it is the only writer of a trie. Every rebuild calls `createTranslationEngine()`, whose one call site is `useTranslatorEngine.js`'s `runEngineInit`, so a rebuild brings a new `DictionaryManager` and an empty memo. Clearing the memo made the next lookup walk the same unchanged trie and return the same answer.

A probe confirmed this. Two engines were built from the same dictionaries. Then the dictionary objects were edited, and only one engine was invalidated. Both engines still gave the output they gave before the edit. The only effects the chain could have were its two warning toasts.

The seam had already caused one bug: `invalidateDictionaryCaches` once emptied the proper-noun casing map, which only `initialize()` builds, and casing stopped until the next reload (`src/utils/CLAUDE.md` §2).

## Decision

Delete the chain. An edit reaches translations only when the engine is rebuilt from the Dictionary Store's dictionaries: a force reload (Cmd/Ctrl-R) or a book-binding rebuild.

The change deletes:

- `registerCacheInvalidator`, `invokeEngineInvalidator` and its two refs, and the registration in `Translator.jsx`
- the store's `invalidate` dependency and `LoadAllOptions.invalidate`
- `TranslationEngine.invalidateDictionaryCaches`
- `DictionaryManager.invalidateCache`
- `TranslationCache.invalidateDictionary` and the per-entry dictionary list that it needed
- `TOAST_IDS.CACHE_INVALIDATION_FAILED`, `TOAST_IDS.CACHE_INVALIDATION_SKIPPED` and `TOAST_DURATIONS.CACHE_WARNING`

`TranslationCache` stays as a plain LRU memo.

## Consequence

- **No behaviour change in translations.** An edit was already invisible until a rebuild; it still is. The two warning toasts no longer appear.
- **`TranslationEngine.lookupsFixedAtInitialize.test.js` pins the premise.** Editing the dictionaries an engine was built from leaves its output unchanged, and a new engine built from the edited dictionaries sees the edit. The test was seen to fail when `getDictionary` rebuilt its trie from the live input.
- **Do not re-add a per-dictionary invalidation** after a commit, reload, rename or import. With tries fixed at load it has nothing to clear.
- **The open alternative is an automatic rebuild after an edit**, so an edit shows without Cmd/Ctrl-R. That is a product change with its own cost: a full engine rebuild per edit, preempting a running translation, and the WASM processors being module-scope singletons. It was not taken here. If a lookup ever reads live dictionary data instead, the pin fails and this decision needs revisiting.
- ADR-008, ADR-072 and ADR-088 get addenda: the seam they ruled on is gone. ADR-052's commit and ADR-055's decision 5 get addenda: neither invalidates the engine any more.
