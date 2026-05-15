# ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext

**Status**: Accepted
**Date**: 2026-05-16
**Decision Makers**: Development Team
**Affected Components**: `Translator.jsx`, `DictionaryContext.tsx`, `utils/caching/`

## Context and Problem Statement

On dictionary reload, three caches must be cleared in sequence:

1. `translationSegmentCache.clear()` — prevents formatting corruption from cached segment results
2. `engineRef.current.dictionaryManager.clearAllCaches()` — prevents stale dictionary lookups
3. `engineRef.current.semanticPatternProcessor.variableCache.clear()` — prevents stale pattern variable entries

The question: should `DictionaryContext` own this invalidation lifecycle (emit a `dictionaryChanged` event; context clears all caches), or should `handleForceReload` in `Translator.jsx` continue to own it?

## Decision Drivers

- **Locality**: all three clears are already co-located in `handleForceReload` Step 2, sequential in one try block with explanatory comments. No scatter exists.
- **Access**: `DictionaryContext` has no access to `engineRef` (owned by `useTranslatorEngine`) or `translationSegmentCache` (singleton from `utils/caching/`). Moving clears there would require threading these into the context, adding coupling that does not exist today.
- **No change notification mechanism**: `DictionaryContext` has no `onDictionaryChange` callback or event dispatch. Adding one solely to drive cache invalidation introduces abstraction with no second consumer.

## Alternatives Considered

### Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected

Add a `clearCaches()` callback to `DictionaryContext`. All CRUD operations or `handleForceReload` calls it; the context clears `translationSegmentCache`, `dictionaryManager`, and `variableCache`.

**Rejected because**:

- `DictionaryContext` cannot access `engineRef` without prop-drilling or a new cross-context dependency.
- The clears are already in one place (`handleForceReload` Step 2) — no scatter exists to fix.
- Moving them creates MORE coupling (context → engine internals), not less.

### Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected

All three cache clears remain in `handleForceReload` Step 2. `Translator.jsx` imports `translationSegmentCache` directly for clear, stats, and destroy — all legitimate UI-layer concerns.

## Decision

Cache invalidation on reload stays in `handleForceReload`. Do not add a `dictionaryChanged` notification to `DictionaryContext` for the purpose of driving cache clears.

## Critical Invariants

- **All three cache clears must fire together** on reload. Adding a fourth cache requires adding its clear to `handleForceReload` Step 2, not to DictionaryContext or a separate hook.
- **Order matters**: `translationSegmentCache.clear()` before engine teardown, then `dictionaryManager.clearAllCaches()`, then `variableCache.clear()`, then `engineRef.current = null`.
- **`translationSegmentCache` reads** (`getStats`, `updateCacheHitRate`, `destroy`) in `Translator.jsx` are intentional — the UI performance monitor legitimately consumes them.

## Consequences

### Positive

- ✅ No new coupling introduced between DictionaryContext and engine internals
- ✅ Cache invalidation logic remains readable in one sequential block

### Negative

- ❌ `Translator.jsx` directly imports a caching singleton — UI layer has knowledge of `utils/caching/` internals
- ❌ A new cache added outside the engine (e.g. a React-level memo) might be missed if the developer doesn't know to look in `handleForceReload`

## References

- Cache invalidation: `Translator.jsx::handleForceReload` Step 2 (~line 1874)
- Segment cache: `src/utils/caching/TranslationSegmentCache.js` (singleton export `translationSegmentCache`)
- Dictionary manager caches: `TranslationEngine.js` → `dictionaryManager.clearAllCaches()`
- Pattern variable cache: `SemanticPatternProcessor.variableCache`
