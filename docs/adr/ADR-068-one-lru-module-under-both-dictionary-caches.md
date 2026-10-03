# ADR-068: One LRU Module Under Both Dictionary Caches

**Status:** Decided
**Date:** 2026-10-03

## Context

`DictionaryCache` and `TrieCache` in `dictionary_commands.rs` each kept a `Mutex<HashMap>` of values plus a second `Mutex<HashMap>` of last-use times, and each wrote out eviction and poisoned-lock recovery by hand. The architecture review of 2026-10-03 (candidate #2, `Strong`) found that the copies had drifted: `DictionaryCache::get` re-checked the cache before writing a recency entry, to avoid leaving a phantom entry for a key a concurrent `set` had just evicted; `TrieCache::get` did not. `DictionaryCache::set` carried four stacked fixes for the two-lock layout (a time-of-check race, a nested-lock deadlock, phantom entries, stale eviction candidates). Eight tests read `access_order` or `cache` directly, and `src-tauri/CLAUDE.md` forbade asserting which key an eviction removed because `now_ms()` ties made it flaky.

ADR-031 rejects splitting `dictionary_commands.rs` by concern and names `dictionary_cache.rs` as a rejected split. It also says to revisit on a real bug. The `get` drift above is one.

## Decision

Add `src-tauri/src/lru_cache.rs`: a generic `LruCache<K, V>` holding each value with its recency inside one `Mutex`. `DictionaryCache` (with its `invalidate`) and `TrieCache` keep their names and signatures as thin wrappers over it, so `lib.rs` and the commands' `State<…>` parameters are unchanged.

- **One lock.** Value and recency cannot disagree, so the phantom-entry, check-then-act and nested-lock cases cannot occur, and the eviction loop and last-resort lexicographic eviction are gone.
- **Recency is a counter under the lock, not `now_ms()`.** Operations never tie, so the evicted entry is always the least recently used and tests may assert which one.
- **A poisoned lock clears the cache on every operation, including `get`** (before: only `set` and `invalidate` cleared), reports through an `on_poison: fn()` given to the constructor (both wrappers pass `record_mutex_poisoning`), and calls `clear_poison()` so one panic is one event, not one per later call.

## Reasoning

**The deletion test holds.** Deleting the module puts the locking, eviction and poison recovery back into two callers that have already drifted once. The two callers differ in key, value and capacity, so the seam has two real adapters. The `on_poison` hook is a third in tests, which count it.

**This is a data structure, not a concern split.** ADR-031's reasoning was that a file split moves coordination cost without removing it. Here the duplicated logic is removed, not relocated.

## Consequence

- `DictionaryCache`/`TrieCache` tests that read `access_order` (six) were deleted; their invariants moved to `lru_cache.rs`, which also tests eviction order, a `get` protecting an entry, and a poisoned lock being reported once.
- The event count behind `emit_poisoning_event`'s escalation (`> 10`, `> 100`) now counts poisonings, not operations after one. Escalation thresholds fire later than before for the same incident.
- Do not re-propose splitting `dictionary_commands.rs` by concern on this ADR's account; it does not reopen ADR-031.
