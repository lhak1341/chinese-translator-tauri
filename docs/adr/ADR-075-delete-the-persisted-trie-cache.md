# ADR-075: Delete the Persisted Trie Cache

**Status:** Decided
**Date:** 2026-10-05

## Context

`DictionaryManager.loadDictionaries` tried `DictionaryTrieLoader.loadDictionaryWithCache` first. A hit rebuilt the trie from `<id>.trie.json` (written by `PrecomputedTrieCache.js`); a miss built it with an inline insert loop in the loader and wrote the cache in the background. `buildTrieFromDictionary` ran only if the loader threw, so production never reached it. The two builders gave different node metadata (the loader kept the raw JSON `target`; the builder kept `priority`, `allowAsPatternVariable`, `semanticType`, `allowedVariableTypes`), and the invalid-entry logging lived only in the path that never ran. The tests covered the builder purely and the loader with the cache mocked.

## Decision

Delete the cache. `buildTrieFromDictionary` is the only trie-construction path, and `DictionaryManager` logs its `invalidSources` on every load. Deleted: `DictionaryTrieLoader.js`, `PrecomputedTrieCache.js` (`PrecomputedTrieStats` with it), their two test files, the `enablePrecomputedCache` / `tauriAPI` options of `DictionaryManager`, and `window.dictionaryTrieLoader`.

Node metadata is `{allowAsPatternVariable, semanticType}`, the two fields trie readers use (`PatternVariableCache`, `VariableTypeClassifier`). `priority` stays in `DictionaryManager.metadata` (per dictionary), where its readers look. `allowedVariableTypes` is read from the raw dictionary and from `parsePattern`, never from a trie node.

## Evidence

A benchmark on the 56 production dictionaries (63,627 entries, 6.5 MB of source, 21.9 MB of `.trie.json`), under bun, importing the real modules:

| Run                      | Inline build | `buildTrieFromDictionary` | Cache path (read + parse + deserialize + checksum) |
| ------------------------ | ------------ | ------------------------- | -------------------------------------------------- |
| First (cold JIT)         | 92 ms        | 75 ms                     | 463 ms                                             |
| Second (warm file cache) | 19 ms        | 25 ms                     | 136 ms                                             |

Building was 4–7x faster than the cache path before any IPC cost (the cache goes through `load_dictionary`). The checksum covered only the source dictionary, not the node shape, and 42 of the 56 cache files on the author's machine already failed it, so most loads missed anyway. The `.trie.json` files are pretty-printed, which inflates them.

No reader behaves differently between the two node shapes: every reader of trie metadata uses `?.` and tests only `allowAsPatternVariable` and `semanticType`. A scan of the production dictionaries found no invalid entries, so the now-live `logger.error` fires on nothing today.

## Consequences

- One construction path; tests cross the interface production uses.
- The existing `*.trie.json` files in the app data directory are orphaned (about 22 MB). The app no longer reads or writes them; delete them by hand. The Rust exclusions of `.trie.json` names (dictionary listing, ZIP import) stay so stale files are never taken for dictionaries.
- Supersedes the "do not delete `*.trie.json`" note in `src/utils/CLAUDE.md`.
- Revisit only with a measurement that shows a build slower than the budget it would save (the build is now 19–92 ms for every dictionary together).
