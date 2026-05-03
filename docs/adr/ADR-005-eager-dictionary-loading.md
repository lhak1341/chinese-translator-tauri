# ADR-005: Eager Dictionary Loading via DictionaryContext

`LazyDictionaryContext` was built as a replacement for `DictionaryContext` but was never wired into the app — `App.jsx` always used `<DictionaryProvider>` (eager loading). After reviewing both, we decided to delete `LazyDictionaryContext` and keep the eager loader.

## Decision

Use `DictionaryContext` (eager loading) as the single dictionary context. `LazyDictionaryContext` and its tests are deleted.

## Why not lazy loading

Startup with 12 dictionaries / 27,000+ entries is already fast in practice. Lazy loading would add async complexity to `setSelectedDictionary` (currently sync) and require migrating all 7 `useDictionary()` call sites. The performance problem it solves does not exist.

## Considered alternatives

**Complete the LazyDictionaryContext migration** — wire it as the provider, rename call sites, handle async `setSelectedDictionary`. Rejected because startup latency is not a user-facing problem and the migration cost is not justified.

## If startup latency becomes a problem

Reintroduce lazy loading. The deleted `LazyDictionaryContext` implementation is in git history. The key migration steps are: swap `<DictionaryProvider>` → `<LazyDictionaryProvider>` in `App.jsx`, rename 7 `useDictionary()` → `useLazyDictionary()`, audit `TabbedInterface.tsx:setSelectedDictionary` for async handling.
