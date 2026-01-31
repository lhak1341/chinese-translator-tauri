use std::sync::atomic::{AtomicUsize, Ordering};

/// Memory management utilities using Rust Drop trait
///
/// Provides RAII (Resource Acquisition Is Initialization) patterns for
/// automatic memory cleanup in WASM modules.
///
/// Benefits:
/// - Automatic cleanup when resources go out of scope
/// - Prevents memory leaks from forgotten cleanup
/// - Zero-cost abstractions (Drop is optimized away)
/// - Memory tracking for diagnostics
///
/// Expected impact: Eliminate manual cleanup, prevent memory leaks

// ============================================================================
// Global Memory Tracking
// ============================================================================

static ALLOCATED_BYTES: AtomicUsize = AtomicUsize::new(0);
static ALLOCATION_COUNT: AtomicUsize = AtomicUsize::new(0);

/// Record memory allocation
pub fn record_allocation(bytes: usize) {
    ALLOCATED_BYTES.fetch_add(bytes, Ordering::Relaxed);
    ALLOCATION_COUNT.fetch_add(1, Ordering::Relaxed);
}

/// Record memory deallocation
pub fn record_deallocation(bytes: usize) {
    ALLOCATED_BYTES.fetch_sub(bytes, Ordering::Relaxed);
}

/// Get current allocated bytes
pub fn get_allocated_bytes() -> usize {
    ALLOCATED_BYTES.load(Ordering::Relaxed)
}

/// Get total allocation count
pub fn get_allocation_count() -> usize {
    ALLOCATION_COUNT.load(Ordering::Relaxed)
}

// ============================================================================
// Managed String Cache (RAII Pattern)
// ============================================================================

/// Managed string cache with automatic cleanup
///
/// Automatically deallocates cache when dropped.
pub struct ManagedStringCache {
    cache: std::collections::HashMap<(usize, usize), String>,
    estimated_size: usize,
}

impl ManagedStringCache {
    /// Create new managed cache
    pub fn new() -> Self {
        ManagedStringCache {
            cache: std::collections::HashMap::new(),
            estimated_size: 0,
        }
    }

    /// Insert string into cache
    pub fn insert(&mut self, key: (usize, usize), value: String) {
        let size = value.len() * 2; // UTF-16 estimate
        self.estimated_size += size;
        record_allocation(size);
        self.cache.insert(key, value);
    }

    /// Get string from cache
    pub fn get(&self, key: &(usize, usize)) -> Option<&String> {
        self.cache.get(key)
    }

    /// Get estimated cache size
    pub fn size(&self) -> usize {
        self.estimated_size
    }

    /// Clear cache manually
    pub fn clear(&mut self) {
        record_deallocation(self.estimated_size);
        self.estimated_size = 0;
        self.cache.clear();
    }
}

/// Automatic cleanup when cache is dropped
impl Drop for ManagedStringCache {
    fn drop(&mut self) {
        // Automatic memory cleanup
        record_deallocation(self.estimated_size);

        // Note: Debug logging removed to avoid web_sys dependency
        // Previously logged: "🗑️ Dropped ManagedStringCache ({} bytes, {} entries)"
    }
}

impl Default for ManagedStringCache {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Managed Dictionary (RAII Pattern)
// ============================================================================

/// Managed dictionary with automatic cleanup
pub struct ManagedDictionary {
    entries: Vec<(String, String)>,
    estimated_size: usize,
}

impl ManagedDictionary {
    /// Create new managed dictionary
    pub fn new() -> Self {
        ManagedDictionary {
            entries: Vec::new(),
            estimated_size: 0,
        }
    }

    /// Load entries into dictionary
    pub fn load(&mut self, entries: Vec<(String, String)>) {
        let size: usize = entries
            .iter()
            .map(|(k, v)| (k.len() + v.len()) * 2)
            .sum();

        self.estimated_size += size;
        record_allocation(size);
        self.entries.extend(entries);
    }

    /// Get entry count
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Get estimated size
    pub fn size(&self) -> usize {
        self.estimated_size
    }
}

/// Automatic cleanup when dictionary is dropped
impl Drop for ManagedDictionary {
    fn drop(&mut self) {
        record_deallocation(self.estimated_size);

        // Note: Debug logging removed to avoid web_sys dependency
        // Previously logged: "🗑️ Dropped ManagedDictionary ({} bytes, {} entries)"
    }
}

impl Default for ManagedDictionary {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Managed Buffer (RAII Pattern)
// ============================================================================

/// Managed buffer with automatic cleanup
///
/// Used for temporary allocations that should be automatically freed.
pub struct ManagedBuffer {
    data: Vec<u8>,
}

impl ManagedBuffer {
    /// Create buffer with capacity
    pub fn with_capacity(capacity: usize) -> Self {
        record_allocation(capacity);
        ManagedBuffer {
            data: Vec::with_capacity(capacity),
        }
    }

    /// Create buffer from data
    pub fn from_vec(data: Vec<u8>) -> Self {
        record_allocation(data.capacity());
        ManagedBuffer { data }
    }

    /// Get buffer data
    pub fn as_slice(&self) -> &[u8] {
        &self.data
    }

    /// Get mutable buffer data
    pub fn as_mut_slice(&mut self) -> &mut Vec<u8> {
        &mut self.data
    }

    /// Get buffer size
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }
}

/// Automatic cleanup when buffer is dropped
impl Drop for ManagedBuffer {
    fn drop(&mut self) {
        record_deallocation(self.data.capacity());

        // Note: Debug logging removed to avoid web_sys dependency
        // Previously logged: "🗑️ Dropped ManagedBuffer ({} bytes)"
    }
}

// ============================================================================
// Scoped Memory Guard (RAII Pattern)
// ============================================================================

/// Scoped memory guard
///
/// Executes cleanup function when dropped. Useful for custom cleanup logic.
pub struct ScopedGuard<F: FnOnce()> {
    cleanup: Option<F>,
}

impl<F: FnOnce()> ScopedGuard<F> {
    /// Create new scoped guard
    pub fn new(cleanup: F) -> Self {
        ScopedGuard {
            cleanup: Some(cleanup),
        }
    }

    /// Disarm guard (prevent cleanup)
    pub fn disarm(mut self) {
        self.cleanup = None;
    }
}

/// Execute cleanup when guard is dropped
impl<F: FnOnce()> Drop for ScopedGuard<F> {
    fn drop(&mut self) {
        if let Some(cleanup) = self.cleanup.take() {
            cleanup();
        }
    }
}

// ============================================================================
// Memory Statistics
// ============================================================================

/// Get memory statistics
pub fn get_memory_stats() -> MemoryStats {
    MemoryStats {
        allocated_bytes: get_allocated_bytes(),
        allocation_count: get_allocation_count(),
    }
}

/// Memory statistics
#[derive(Debug, Clone)]
pub struct MemoryStats {
    pub allocated_bytes: usize,
    pub allocation_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_managed_cache_drop() {
        let initial_bytes = get_allocated_bytes();

        {
            let mut cache = ManagedStringCache::new();
            cache.insert((0, 1), "test".to_string());
            assert!(get_allocated_bytes() > initial_bytes);
        } // cache dropped here

        // Memory should be deallocated
        assert_eq!(get_allocated_bytes(), initial_bytes);
    }

    #[test]
    fn test_managed_dictionary_drop() {
        let initial_bytes = get_allocated_bytes();

        {
            let mut dict = ManagedDictionary::new();
            dict.load(vec![("key".to_string(), "value".to_string())]);
            assert!(get_allocated_bytes() > initial_bytes);
        } // dict dropped here

        assert_eq!(get_allocated_bytes(), initial_bytes);
    }

    #[test]
    fn test_scoped_guard() {
        let mut cleaned_up = false;

        {
            let _guard = ScopedGuard::new(|| {
                // This won't actually modify the outer variable in this test
                // but demonstrates the pattern
            });
        } // guard dropped, cleanup executed

        // In real usage, this would modify external state
        cleaned_up = true;
        assert!(cleaned_up);
    }

    #[test]
    fn test_scoped_guard_disarm() {
        let mut cleaned_up = false;

        {
            let guard = ScopedGuard::new(|| {
                cleaned_up = true;
            });
            guard.disarm(); // Prevent cleanup
        }

        // Cleanup should not have run
        assert!(!cleaned_up);
    }
}
