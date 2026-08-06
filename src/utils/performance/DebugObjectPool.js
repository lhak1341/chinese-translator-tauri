/**
 * Debug Object Pool
 * Memory-efficient pooling for debugging and performance monitoring objects
 *
 * SAFETY GUARANTEE: Only pools non-critical debugging objects that don't affect
 * translation logic, semantic arrays, or clickable highlighting functionality.
 *
 * Features:
 * - Reduces GC pressure from frequent debugging object allocation
 * - Automatic pool size management with configurable limits
 * - Memory leak prevention with periodic cleanup
 * - Zero impact on production builds (disabled in production)
 */

/**
 * Generic Object Pool
 * Reuses objects to reduce garbage collection pressure
 */
class ObjectPool {
  constructor(createFn, resetFn, maxSize = 100) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    this.pool = [];
    this.stats = {
      created: 0,
      reused: 0,
      disposed: 0,
      peakSize: 0,
    };
  }

  get() {
    if (this.pool.length > 0) {
      this.stats.reused++;
      return this.pool.pop();
    } else {
      this.stats.created++;
      return this.createFn();
    }
  }

  release(obj) {
    if (this.pool.length < this.maxSize) {
      if (this.resetFn) {
        this.resetFn(obj);
      }
      this.pool.push(obj);
      this.stats.peakSize = Math.max(this.stats.peakSize, this.pool.length);
    } else {
      this.stats.disposed++;
    }
  }

  clear() {
    this.pool.length = 0;
  }

  getStats() {
    const total = this.stats.created + this.stats.reused;
    return {
      ...this.stats,
      currentSize: this.pool.length,
      reuseRate: total > 0 ? ((this.stats.reused / total) * 100).toFixed(1) : 0,
      efficiency: total > 0 ? (((total - this.stats.created) / total) * 100).toFixed(1) : 0,
    };
  }
}

/**
 * Debug Object Pool Manager
 * Manages pools for different types of debugging objects
 */
class DebugObjectPoolManager {
  constructor() {
    // Only enable in development
    this.enabled = process.env.NODE_ENV === 'development';

    // Track cleanup interval ID
    this.cleanupIntervalId = null;

    if (!this.enabled) {
      // Provide no-op methods for production
      this.getLogEntry = () => ({});
      this.releaseLogEntry = () => {};
      return;
    }

    // Pool for log entry objects (used by BatchLogger)
    this.logEntryPool = new ObjectPool(
      () => ({
        timestamp: 0,
        level: '',
        message: '',
        args: [],
        time: '',
        context: '',
      }),
      (obj) => {
        obj.timestamp = 0;
        obj.level = '';
        obj.message = '';
        obj.args = [];
        obj.time = '';
        obj.context = '';
      },
      100 // Larger pool for log entries
    );

    // Periodic cleanup to prevent memory leaks
    this.setupPeriodicCleanup();
  }

  // Log Entry Pool Methods
  getLogEntry() {
    return this.enabled ? this.logEntryPool.get() : {};
  }

  releaseLogEntry(obj) {
    if (this.enabled && obj) {
      this.logEntryPool.release(obj);
    }
  }

  // Utility Methods
  setupPeriodicCleanup() {
    if (!this.enabled) return;

    // Clean up the pool every 5 minutes to prevent memory leaks
    this.cleanupIntervalId = setInterval(
      () => {
        // Only keep half the objects in the pool to prevent accumulation
        const currentSize = this.logEntryPool.pool.length;
        const targetSize = Math.floor(currentSize / 2);

        if (currentSize > targetSize + 10) {
          this.logEntryPool.pool.splice(targetSize);
        }
      },
      5 * 60 * 1000
    );
  }

  /**
   * Clean up resources including periodic cleanup timer
   */
  destroy() {
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

// Create singleton instance
const debugObjectPool = new DebugObjectPoolManager();

// Convenience functions for easy usage
export const getLogEntry = () => debugObjectPool.getLogEntry();
export const releaseLogEntry = (obj) => debugObjectPool.releaseLogEntry(obj);
