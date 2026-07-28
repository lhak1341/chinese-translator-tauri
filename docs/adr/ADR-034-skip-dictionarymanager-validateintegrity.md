# ADR-034: Skip Building DictionaryManager.validateIntegrity()

**Status:** Decided
**Date:** 2026-07-28

## Context

`DictionaryManager.apiContract.test.js`'s `criticalSyncMethods` list included `'validateIntegrity'` alongside `translate`, `findAllMatches`, and `getDefaultSearchOrder`, guarded by `if (method) { ... }`. `DictionaryManager` never had a `validateIntegrity` method at any point in its git history — not on the current class, and not on `EnhancedDictionaryManager` (its pre-`2e6e863`-merge predecessor, checked directly). The method exists only on `DictionaryTrie` (`src/utils/dictionary/DictionaryTrie.js:234`), a different class. The guard silently skipped the assertion for 6+ months across many refactors, since the test's original commit (`a480029`, 2026-01-16) — a copy-paste/conflation mistake, not a dropped feature.

Before fixing the test, we considered building the capability for real: a `DictionaryManager.validateIntegrity()` aggregating `DictionaryTrie.validateIntegrity()`/`getHealthScore()` across all loaded dictionaries, turning the test's mistaken assumption into a real manager-level health check.

We checked whether the underlying trie-level health-check subsystem (`validateIntegrity()`, `repair()`, `getHealthScore()`) is used anywhere today. It isn't: `getHealthScore()` and `repair()` have zero callers anywhere in the codebase, including `DevConsole.js` (the documented home for debug/health-surfacing utilities per `installDevConsole()`'s convention). `validateIntegrity()`'s only 2 callers are internal self-calls inside `DictionaryTrie.js` itself.

## Decision

Do not build `DictionaryManager.validateIntegrity()`. Fix the test instead: remove `'validateIntegrity'` from `criticalSyncMethods`, and replace the silent `if (method)` guard with `expect(typeof method).toBe('function')` so the 3 real methods are actually enforced.

## Reasoning

**No evidence anyone needs it.** Unlike the `reloadDictionaries()`/`getMemoryUsage()` WASM-clear-on-reload fix (a dropped feature with a HIGH-severity-labeled regression test proving real historical intent — see the `_wasmAdapter`/`this.wasmLookup` migration gap), nothing here — no test, no ADR, no dev-console hook — ever asked for a manager-level dictionary-health aggregator. Building it now would be adding a façade over a foundation nobody currently consumes.

**Same shape as five prior "nobody reads this" deletions.** `getHealthScore()`/`repair()`'s zero-caller status matches the pattern this codebase has already named and acted on repeatedly (`cacheHitRate`, `ContentAwarePositionCache`, `getSyncMetrics`, `getPrecomputedCacheStats`, `getEnhancedPerformanceReport`/`isWasmBeneficial` — see ADR-032 and CLAUDE.md's deleted-symbols log). Building new speculative generality on top of an already-unused foundation compounds the same mistake rather than avoiding it.

## Consequence

Future architecture reviews should not re-propose a `DictionaryManager.validateIntegrity()` aggregator on spec. If a concrete need for dictionary-health surfacing arises later (e.g. a debug panel), the trie-level methods (`validateIntegrity`, `repair`, `getHealthScore`) already exist and can be wired up then, informed by that real need's actual shape — not built ahead of one.
