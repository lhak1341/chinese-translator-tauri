# ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider

**Status:** Decided
**Date:** 2026-10-04

## Context

An architecture review (2026-10-04, candidate #5) noted that two pieces of policy in `DictionaryContext.tsx` are non-exported and reachable only by rendering the provider: the startup load (`store.loadAll()`, selection restore from `loadAppConfig`, `classifyLoadResult`, then `loadError` or a toast) and `invokeEngineInvalidator` with its `hasRegisteredOnceRef` stale-cache rule. It proposed lifting them into plain modules testable without React.

## Decision

Leave both in the provider.

## Reasoning

**Nothing would concentrate.** The classification (`DictionaryLoadClassifier`), the store (ADR-055) and the load protocol (`DictionaryBackend`) are already plain modules. What remains in the startup `useEffect` is sequencing plus `setLoadError`, `setIsLoading`, `setSelectedDictionary` and toasts. An extracted function would take those as parameters or return a result the provider unpacks at once.

**The invalidation rule already has one home and one test.** `invokeEngineInvalidator`, its two refs and `registerCacheInvalidator` are about 35 lines in one file. `DictionaryContext.cacheInvalidationSeam.test.tsx` pins all three states (never registered, registered then cleared, currently registered) by calling the real `registerCacheInvalidator` through the provider. The only production registrar is `Translator.jsx`.

**The provider is the intended test seam.** GLOSSARY.md ("Unread dictionary") pins the load chain through `DictionaryContext.unread.test.tsx` over a fake IPC, deliberately across the whole chain.

## Consequence

Future architecture reviews should not re-propose extracting either piece. Revisit if a second consumer of the startup-load policy or the invalidation rule appears outside the provider.

## Addendum (2026-10-20)

The invalidation rule this ADR kept in the provider is deleted (ADR-106): an edit cannot make an engine cache stale, because the engine's tries are fixed at load. `DictionaryContext.cacheInvalidationSeam.test.tsx` went with it. The startup-load half of this decision is unchanged.

## Addendum (2026-10-21)

The revisit condition above was met: force reload (`useForceReload`) and import's re-read were second consumers of the startup-load classification, and both skipped it. A force reload where every read failed reported success over an empty engine, a partial one said nothing, and the `loadError` banner, set only in the provider's mount effect, never cleared after a good force reload. The classification now lives in the Dictionary Store: every full load (`loadAllNow`) records `classifyLoadResult`'s outcome, or `critical` when the load threw, as the snapshot's `lastLoad`. The provider derives `loadError` from it and toasts each new one; `useForceReload` leaves the engine down on a critical outcome. Selection restore and `isLoading` stay in the provider's startup effect, as this ADR decided.
