# ADR-005: Eager Dictionary Loading via DictionaryContext

**Status**: Accepted
**Date**: 2026-05-03
**Decision Makers**: Development Team
**Affected Components**: `DictionaryContext.tsx`, `App.jsx`

## Context and Problem Statement

`LazyDictionaryContext` was built as a replacement for `DictionaryContext` but was never wired into the app — `App.jsx` always used `<DictionaryProvider>` (eager loading). After reviewing both implementations, we decided to delete `LazyDictionaryContext` and keep the eager loader as the single dictionary context.

## Decision Drivers

- **Startup latency is not a problem**: 12 dictionaries / 27,000+ entries load fast enough in practice; no user-facing lag observed
- **Migration cost is not justified**: lazy loading would make `setSelectedDictionary` async (currently sync) and require updating 7 `useDictionary()` call sites
- **Dead code risk**: an unwired context creates confusion about which provider is canonical

## Alternatives Considered

### Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected

Wire `LazyDictionaryContext` as the provider, rename call sites, handle async `setSelectedDictionary`. Rejected because startup latency is not a user-facing problem and migration cost is not justified.

### Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected

`DictionaryContext` (eager) is the single provider. `LazyDictionaryContext.tsx` and its two test files deleted entirely.

## Decision

Use `DictionaryContext` with eager loading as the only dictionary context. `LazyDictionaryContext` is deleted; its implementation is preserved in git history.

## Consequences

### Positive

- ✅ Single canonical context — no ambiguity about which provider to use
- ✅ `setSelectedDictionary` stays synchronous — no call-site changes
- ✅ Removes dead code (LazyDictionaryContext + 2 test files)

### Negative

- ❌ All 27,000+ entries always loaded at startup (acceptable given current perf)
- ❌ No lazy path if a new large dictionary is added

### Neutral

- 🔄 If startup latency becomes a problem: restore from git, swap `<DictionaryProvider>` → `<LazyDictionaryProvider>` in `App.jsx`, rename 7 `useDictionary()` → `useLazyDictionary()`, audit `TabbedInterface.tsx:setSelectedDictionary` for async handling

## Monitoring and Review

**Review Triggers**:

- Startup time degrades noticeably after adding large dictionaries
- Dictionary count grows significantly beyond 12

## References

- Code: `src/context/DictionaryContext.tsx` (canonical provider)
- Entry point: `App.jsx` — `<DictionaryProvider>`
- Call sites: 7 files using `useDictionary()`
- Deleted: `LazyDictionaryContext.tsx` + 2 test files (in git history)

## Related ADRs

- ADR-001: WASM Batch Loading (also involves dictionary startup path)
