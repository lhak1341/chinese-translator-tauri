//! A bounded least-recently-used cache behind one lock.
//!
//! `DictionaryCache` and `TrieCache` (`dictionary_commands.rs`) are both this, keyed and sized
//! differently. Recency lives beside the value inside a single `Mutex`, so an entry and its
//! recency cannot disagree: there is no window in which a concurrent `set` evicts a key whose
//! recency a concurrent `get` is about to write back, which is what the two-lock layout this
//! replaced needed a re-check, an eviction dance and a stale-candidate loop to survive.
//!
//! Recency is a counter bumped under the lock, not a clock, so two operations never tie and
//! the entry evicted is always the one least recently used.
//!
//! A poisoned lock means a panic happened mid-update, so the contents are suspect. Every
//! operation then reports it through the `on_poison` hook it was built with, clears the cache
//! and carries on — both callers can rebuild an entry from disk or from the entries JS sends.
//! The hook is a parameter, not a call into `dictionary_commands.rs`, so this module owns no
//! global state and a test can count the reports.

use std::borrow::Borrow;
use std::collections::HashMap;
use std::hash::Hash;
use std::sync::{Mutex, MutexGuard};

struct Inner<K, V> {
    /// Each value with the tick of its last `get` or `set`.
    entries: HashMap<K, (V, u64)>,
    tick: u64,
}

impl<K, V> Inner<K, V> {
    fn next_tick(&mut self) -> u64 {
        self.tick += 1;
        self.tick
    }
}

pub struct LruCache<K, V> {
    name: &'static str,
    capacity: usize,
    on_poison: fn(),
    inner: Mutex<Inner<K, V>>,
}

impl<K: Eq + Hash + Clone, V: Clone> LruCache<K, V> {
    /// `name` only labels the log line a poisoning prints. `on_poison` runs once per
    /// poisoned-lock recovery.
    pub fn new(name: &'static str, capacity: usize, on_poison: fn()) -> Self {
        Self {
            name,
            capacity,
            on_poison,
            inner: Mutex::new(Inner {
                entries: HashMap::new(),
                tick: 0,
            }),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner<K, V>> {
        match self.inner.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                (self.on_poison)();
                eprintln!(
                    "WARNING: {} cache mutex poisoned - clearing it and continuing",
                    self.name
                );
                let mut guard = poisoned.into_inner();
                guard.entries.clear();
                // Cleared, so it is consistent again; without this every later call would
                // report the same panic as a new event.
                self.inner.clear_poison();
                guard
            }
        }
    }

    /// The cached value, marking it most recently used.
    pub fn get<Q>(&self, key: &Q) -> Option<V>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        let mut inner = self.lock();
        let tick = inner.next_tick();
        inner.entries.get_mut(key).map(|(value, last_used)| {
            *last_used = tick;
            value.clone()
        })
    }

    /// Insert or replace `key`, evicting the least recently used entry first if a new key
    /// would exceed the capacity.
    pub fn set(&self, key: K, value: V) {
        let mut inner = self.lock();
        if inner.entries.len() >= self.capacity && !inner.entries.contains_key(&key) {
            let oldest = inner
                .entries
                .iter()
                .min_by_key(|(_, (_, last_used))| *last_used)
                .map(|(k, _)| k.clone());
            if let Some(oldest) = oldest {
                inner.entries.remove(&oldest);
            }
        }
        let tick = inner.next_tick();
        inner.entries.insert(key, (value, tick));
    }

    pub fn remove<Q>(&self, key: &Q)
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        self.lock().entries.remove(key);
    }

    pub fn clear(&self) {
        self.lock().entries.clear();
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.lock().entries.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn cache(capacity: usize) -> LruCache<String, u32> {
        LruCache::new("test", capacity, || {})
    }

    fn key(n: usize) -> String {
        format!("k{n}")
    }

    #[test]
    fn get_misses_then_hits_after_set() {
        let cache = cache(3);
        assert_eq!(cache.get("a"), None);
        cache.set("a".to_string(), 1);
        assert_eq!(cache.get("a"), Some(1));
    }

    #[test]
    fn set_replaces_an_existing_key_without_evicting() {
        let cache = cache(2);
        cache.set("a".to_string(), 1);
        cache.set("b".to_string(), 2);
        cache.set("a".to_string(), 10);

        assert_eq!(cache.len(), 2);
        assert_eq!(cache.get("a"), Some(10));
        assert_eq!(cache.get("b"), Some(2));
    }

    #[test]
    fn evicts_the_least_recently_set_entry() {
        let cache = cache(3);
        for n in 0..3 {
            cache.set(key(n), n as u32);
        }
        cache.set(key(3), 3);

        assert_eq!(cache.get("k0"), None);
        assert_eq!(cache.get("k1"), Some(1));
        assert_eq!(cache.get("k3"), Some(3));
    }

    #[test]
    fn a_get_protects_an_entry_from_eviction() {
        let cache = cache(3);
        for n in 0..3 {
            cache.set(key(n), n as u32);
        }
        cache.get("k0");
        cache.set(key(3), 3);

        assert_eq!(cache.get("k0"), Some(0));
        assert_eq!(cache.get("k1"), None);
    }

    #[test]
    fn a_miss_leaves_no_trace() {
        let cache = cache(2);
        cache.set("a".to_string(), 1);
        cache.set("b".to_string(), 2);
        cache.get("ghost");
        cache.set("c".to_string(), 3);

        // The miss did not count as a use, so "a" is still the oldest.
        assert_eq!(cache.get("a"), None);
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn remove_and_clear_drop_entries() {
        let cache = cache(3);
        cache.set("a".to_string(), 1);
        cache.set("b".to_string(), 2);

        cache.remove("a");
        assert_eq!(cache.get("a"), None);
        assert_eq!(cache.get("b"), Some(2));

        cache.remove("ghost");
        cache.clear();
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn never_exceeds_capacity_under_concurrent_use() {
        let cache = Arc::new(cache(4));
        let handles: Vec<_> = (0..8)
            .map(|t| {
                let cache = Arc::clone(&cache);
                std::thread::spawn(move || {
                    for n in 0..500 {
                        cache.set(key((t * 31 + n) % 11), n as u32);
                        cache.get(&key(n % 11));
                        assert!(cache.len() <= 4);
                    }
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }
        assert!(cache.len() <= 4);
    }

    static POISON_REPORTS: AtomicUsize = AtomicUsize::new(0);

    #[test]
    fn a_poisoned_lock_is_reported_once_cleared_and_usable_again() {
        let cache = Arc::new(LruCache::<String, u32>::new("test", 3, || {
            POISON_REPORTS.fetch_add(1, Ordering::SeqCst);
        }));
        cache.set("a".to_string(), 1);

        let poisoner = Arc::clone(&cache);
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.inner.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        assert!(cache.inner.is_poisoned());

        // The contents are suspect after a panic, so the first use finds an empty cache.
        assert_eq!(cache.get("a"), None);
        assert_eq!(POISON_REPORTS.load(Ordering::SeqCst), 1);

        // Recovered: later calls neither report again nor lose what they store.
        cache.set("b".to_string(), 2);
        assert_eq!(cache.get("b"), Some(2));
        assert_eq!(POISON_REPORTS.load(Ordering::SeqCst), 1);
    }
}
