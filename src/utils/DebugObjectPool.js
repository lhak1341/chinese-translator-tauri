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
 * - Performance tracking of pool efficiency
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
      peakSize: 0
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
      reuseRate: total > 0 ? (this.stats.reused / total * 100).toFixed(1) : 0,
      efficiency: total > 0 ? ((total - this.stats.created) / total * 100).toFixed(1) : 0
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
    
    if (!this.enabled) {
      // Provide no-op methods for production
      this.getPerformanceMetric = () => ({});
      this.releasePerformanceMetric = () => {};
      this.getLogEntry = () => ({});
      this.releaseLogEntry = () => {};
      this.getTimestamp = () => ({});
      this.releaseTimestamp = () => {};
      return;
    }

    // Pool for performance metric objects
    this.performanceMetricPool = new ObjectPool(
      () => ({
        operationId: '',
        startTime: 0,
        endTime: 0,
        duration: 0,
        type: '',
        metadata: {},
        phase: '',
        textLength: 0
      }),
      (obj) => {
        obj.operationId = '';
        obj.startTime = 0;
        obj.endTime = 0;
        obj.duration = 0;
        obj.type = '';
        obj.metadata = {};
        obj.phase = '';
        obj.textLength = 0;
      },
      50 // Small pool for performance objects
    );

    // Pool for log entry objects (used by BatchLogger)
    this.logEntryPool = new ObjectPool(
      () => ({
        timestamp: 0,
        level: '',
        message: '',
        args: [],
        time: '',
        context: ''
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

    // Pool for timestamp objects (frequently used in debugging)
    this.timestampPool = new ObjectPool(
      () => ({
        operation: '',
        start: 0,
        end: 0,
        duration: 0,
        label: ''
      }),
      (obj) => {
        obj.operation = '';
        obj.start = 0;
        obj.end = 0;
        obj.duration = 0;
        obj.label = '';
      },
      30
    );

    // Pool for memory snapshot objects
    this.memorySnapshotPool = new ObjectPool(
      () => ({
        used: 0,
        total: 0,
        limit: 0,
        timestamp: 0,
        operation: '',
        phase: ''
      }),
      (obj) => {
        obj.used = 0;
        obj.total = 0;
        obj.limit = 0;
        obj.timestamp = 0;
        obj.operation = '';
        obj.phase = '';
      },
      20
    );

    // Pool for cache statistics objects
    this.cacheStatsPool = new ObjectPool(
      () => ({
        hits: 0,
        misses: 0,
        stores: 0,
        evictions: 0,
        hitRate: 0,
        size: 0,
        timestamp: 0
      }),
      (obj) => {
        obj.hits = 0;
        obj.misses = 0;
        obj.stores = 0;
        obj.evictions = 0;
        obj.hitRate = 0;
        obj.size = 0;
        obj.timestamp = 0;
      },
      15
    );

    // Periodic cleanup to prevent memory leaks
    this.setupPeriodicCleanup();
  }

  // Performance Metric Pool Methods
  getPerformanceMetric() {
    return this.enabled ? this.performanceMetricPool.get() : {};
  }

  releasePerformanceMetric(obj) {
    if (this.enabled && obj) {
      this.performanceMetricPool.release(obj);
    }
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

  // Timestamp Pool Methods
  getTimestamp() {
    return this.enabled ? this.timestampPool.get() : {};
  }

  releaseTimestamp(obj) {
    if (this.enabled && obj) {
      this.timestampPool.release(obj);
    }
  }

  // Memory Snapshot Pool Methods
  getMemorySnapshot() {
    return this.enabled ? this.memorySnapshotPool.get() : {};
  }

  releaseMemorySnapshot(obj) {
    if (this.enabled && obj) {
      this.memorySnapshotPool.release(obj);
    }
  }

  // Cache Stats Pool Methods
  getCacheStats() {
    return this.enabled ? this.cacheStatsPool.get() : {};
  }

  releaseCacheStats(obj) {
    if (this.enabled && obj) {
      this.cacheStatsPool.release(obj);
    }
  }

  // Utility Methods
  setupPeriodicCleanup() {
    if (!this.enabled) return;

    // Clean up pools every 5 minutes to prevent memory leaks
    setInterval(() => {
      // Only keep half the objects in each pool to prevent accumulation
      [
        this.performanceMetricPool,
        this.logEntryPool,
        this.timestampPool,
        this.memorySnapshotPool,
        this.cacheStatsPool
      ].forEach(pool => {
        const currentSize = pool.pool.length;
        const targetSize = Math.floor(currentSize / 2);
        
        if (currentSize > targetSize + 10) {
          pool.pool.splice(targetSize);
        }
      });
    }, 5 * 60 * 1000);
  }

  // Get comprehensive pool statistics
  getAllStats() {
    if (!this.enabled) {
      return { enabled: false, message: 'Debug object pooling disabled in production' };
    }

    return {
      enabled: true,
      pools: {
        performanceMetrics: this.performanceMetricPool.getStats(),
        logEntries: this.logEntryPool.getStats(),
        timestamps: this.timestampPool.getStats(),
        memorySnapshots: this.memorySnapshotPool.getStats(),
        cacheStats: this.cacheStatsPool.getStats()
      },
      summary: this.getSummaryStats()
    };
  }

  getSummaryStats() {
    const pools = [
      this.performanceMetricPool,
      this.logEntryPool,
      this.timestampPool,
      this.memorySnapshotPool,
      this.cacheStatsPool
    ];

    const totals = pools.reduce((acc, pool) => {
      const stats = pool.getStats();
      acc.totalCreated += stats.created;
      acc.totalReused += stats.reused;
      acc.totalDisposed += stats.disposed;
      acc.currentPooled += stats.currentSize;
      return acc;
    }, {
      totalCreated: 0,
      totalReused: 0,
      totalDisposed: 0,
      currentPooled: 0
    });

    const totalOperations = totals.totalCreated + totals.totalReused;
    
    return {
      ...totals,
      overallReuseRate: totalOperations > 0 ? 
        ((totals.totalReused / totalOperations) * 100).toFixed(1) : 0,
      memoryPressureReduction: totalOperations > 0 ?
        ((totals.totalReused / totalOperations) * 100).toFixed(1) : 0,
      gcReductionEstimate: `~${Math.floor(totals.totalReused * 0.1)}ms saved`
    };
  }

  // Clear all pools (useful for testing)
  clearAll() {
    if (!this.enabled) return;

    [
      this.performanceMetricPool,
      this.logEntryPool,
      this.timestampPool,
      this.memorySnapshotPool,
      this.cacheStatsPool
    ].forEach(pool => pool.clear());
  }
}

// Create singleton instance
export const debugObjectPool = new DebugObjectPoolManager();

// Convenience functions for easy usage
export const getPerformanceMetric = () => debugObjectPool.getPerformanceMetric();
export const releasePerformanceMetric = (obj) => debugObjectPool.releasePerformanceMetric(obj);

export const getLogEntry = () => debugObjectPool.getLogEntry();
export const releaseLogEntry = (obj) => debugObjectPool.releaseLogEntry(obj);

export const getTimestamp = () => debugObjectPool.getTimestamp();
export const releaseTimestamp = (obj) => debugObjectPool.releaseTimestamp(obj);

export const getMemorySnapshot = () => debugObjectPool.getMemorySnapshot();
export const releaseMemorySnapshot = (obj) => debugObjectPool.releaseMemorySnapshot(obj);

export const getCacheStats = () => debugObjectPool.getCacheStats();
export const releaseCacheStats = (obj) => debugObjectPool.releaseCacheStats(obj);

// Utility for performance-critical operations
export const withPooledObject = (poolGetFn, poolReleaseFn, operationFn) => {
  const obj = poolGetFn();
  try {
    return operationFn(obj);
  } finally {
    poolReleaseFn(obj);
  }
};

export default DebugObjectPoolManager;