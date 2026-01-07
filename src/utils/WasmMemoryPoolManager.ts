/**
 * WASM Memory Pool Management System
 *
 * OPTIMIZATION: Pre-allocated memory pools for WASM operations
 * Reduces allocation overhead and memory fragmentation in WASM boundary crossings
 *
 * Key Features:
 * - Memory pool recycling for dictionary operations
 * - Batch allocation with smart sizing
 * - Integration with existing memory pressure detection
 * - Performance monitoring and optimization suggestions
 * - Safe fallback to standard allocation
 */

import { SmartMemoryPressureDetector, MemoryPressure } from './MemoryManagementRefinements.js';
import { globalPerformanceMonitor } from './PerformanceMonitor.js';

/**
 * Pool size category
 */
export type PoolCategory = 'small' | 'medium' | 'large';

/**
 * Memory pool configuration options
 */
export interface WasmMemoryPoolOptions {
  /** Initial pool size (default: 4) */
  initialPoolSize?: number;

  /** Maximum pool size (default: 32) */
  maxPoolSize?: number;

  /** Buffer size in bytes (default: 64KB) */
  bufferSizeBytes?: number;

  /** Growth factor when expanding pool (default: 1.5) */
  growthFactor?: number;

  /** Shrink threshold - utilization below this triggers shrinking (default: 0.3) */
  shrinkThreshold?: number;

  /** Enable memory pressure detection (default: true) */
  enablePressureDetection?: boolean;

  /** Memory pressure thresholds */
  pressureThresholds?: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };

  /** Enable performance tracking (default: true) */
  enablePerformanceTracking?: boolean;
}

/**
 * Memory buffer metadata
 */
export interface BufferMetadata {
  /** Buffer size in bytes */
  size: number;

  /** Creation timestamp */
  created: number;

  /** Number of times allocated */
  allocations: number;

  /** Last used timestamp */
  lastUsed: number;

  /** Unique buffer identifier */
  id: string;
}

/**
 * Memory pool configuration
 */
export interface PoolConfig {
  /** Available buffers for reuse */
  available: ArrayBuffer[];

  /** Buffers currently in use */
  inUse: Set<ArrayBuffer>;

  /** Size of each buffer in this pool */
  bufferSize: number;

  /** Maximum number of buffers in this pool */
  maxCount: number;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  /** Number of available buffers */
  available: number;

  /** Number of buffers in use */
  inUse: number;

  /** Size of each buffer */
  bufferSize: number;

  /** Maximum buffer count */
  maxCount: number;

  /** Pool utilization percentage */
  utilization: number;

  /** Total memory used by this pool */
  memoryUsed: number;
}

/**
 * Memory pool statistics
 */
export interface MemoryPoolStats {
  /** Total allocations */
  allocations: number;

  /** Total deallocations */
  deallocations: number;

  /** Pool hits (reused buffers) */
  poolHits: number;

  /** Pool misses (new allocations) */
  poolMisses: number;

  /** Total memory reused */
  memoryReused: number;

  /** Total memory allocated */
  totalMemoryAllocated: number;

  /** Peak memory usage */
  peakMemoryUsage: number;

  /** Average allocation time in milliseconds */
  averageAllocationTime: number;

  /** Recycling efficiency percentage */
  recyclingEfficiency: number;

  /** Per-pool statistics */
  pools: Record<PoolCategory, PoolStats>;

  /** Total memory usage across all pools */
  totalMemoryUsage: number;

  /** Current memory pressure */
  memoryPressure: MemoryPressure;

  /** Optimization recommendations */
  recommendations: OptimizationRecommendation[];
}

/**
 * Optimization recommendation
 */
export interface OptimizationRecommendation {
  /** Recommendation type */
  type: 'efficiency' | 'memory' | 'performance';

  /** Recommendation message */
  message: string;

  /** Priority level */
  priority: 'low' | 'medium' | 'high';
}

/**
 * Memory Pool for WASM Operations
 * Pre-allocates and manages memory buffers for efficient WASM communication
 */
export class WasmMemoryPool {
  private options: Required<WasmMemoryPoolOptions>;
  private pools: Record<PoolCategory, PoolConfig>;
  private stats: {
    allocations: number;
    deallocations: number;
    poolHits: number;
    poolMisses: number;
    memoryReused: number;
    totalMemoryAllocated: number;
    peakMemoryUsage: number;
    averageAllocationTime: number;
    recyclingEfficiency: number;
  };
  private bufferMetadata?: WeakMap<ArrayBuffer, BufferMetadata>;
  private memoryPressureDetector?: SmartMemoryPressureDetector;

  constructor(options: WasmMemoryPoolOptions = {}) {
    this.options = {
      // Pool sizing
      initialPoolSize: options.initialPoolSize || 4, // Start with 4 buffers (reduced to prevent memory growth)
      maxPoolSize: options.maxPoolSize || 32, // Maximum 32 buffers
      bufferSizeBytes: options.bufferSizeBytes || 64 * 1024, // 64KB per buffer

      // Growth strategy
      growthFactor: options.growthFactor || 1.5, // Grow by 50% when needed
      shrinkThreshold: options.shrinkThreshold || 0.3, // Shrink when <30% utilization

      // Memory pressure integration
      enablePressureDetection: options.enablePressureDetection !== false,
      pressureThresholds: options.pressureThresholds || {
        low: 0.6, // 60% - normal operation
        medium: 0.75, // 75% - reduce pool size
        high: 0.85, // 85% - aggressive recycling
        critical: 0.95, // 95% - emergency cleanup
      },

      // Performance tracking
      enablePerformanceTracking: options.enablePerformanceTracking !== false,
    };

    // Memory pools by size category
    this.pools = {
      small: {
        // 0-16KB operations (dictionary lookups)
        available: [],
        inUse: new Set(),
        bufferSize: 16 * 1024,
        maxCount: 8, // Reduced from 16 to prevent memory growth
      },
      medium: {
        // 16-64KB operations (batch processing)
        available: [],
        inUse: new Set(),
        bufferSize: 64 * 1024,
        maxCount: 4, // Reduced from 8 to prevent memory growth
      },
      large: {
        // 64KB+ operations (full text processing)
        available: [],
        inUse: new Set(),
        bufferSize: 256 * 1024,
        maxCount: 2, // Reduced from 4 to prevent memory growth
      },
    };

    // Performance tracking
    this.stats = {
      allocations: 0,
      deallocations: 0,
      poolHits: 0,
      poolMisses: 0,
      memoryReused: 0,
      totalMemoryAllocated: 0,
      peakMemoryUsage: 0,
      averageAllocationTime: 0,
      recyclingEfficiency: 0,
    };

    // Memory pressure integration
    if (this.options.enablePressureDetection) {
      this.memoryPressureDetector = new SmartMemoryPressureDetector({
        samplingInterval: 3000, // 3 seconds for responsive WASM management
        growthThreshold: 5, // 5MB/minute growth triggers optimization
      });

      this.memoryPressureDetector.onMemoryEvent('pressure', (event: any) => {
        this.handleMemoryPressure(event.pressure);
      });
    }

    // Initialize pools with optimal sizes
    this.initializePools();

    // Periodic optimization
    this.setupPeriodicOptimization();
  }

  /**
   * Initialize memory pools with pre-allocated buffers
   */
  private initializePools(): void {
    for (const [poolName, poolConfig] of Object.entries(this.pools)) {
      const initialCount = Math.min(this.options.initialPoolSize, poolConfig.maxCount);

      for (let i = 0; i < initialCount; i++) {
        const buffer = this.createBuffer(poolConfig.bufferSize);
        poolConfig.available.push(buffer);
      }

      console.log(
        `🔧 Initialized ${poolName} pool with ${initialCount} buffers (${poolConfig.bufferSize} bytes each)`
      );
    }
  }

  /**
   * Create a new buffer with metadata tracking
   */
  private createBuffer(sizeBytes: number): ArrayBuffer {
    const buffer = new ArrayBuffer(sizeBytes);
    const metadata: BufferMetadata = {
      size: sizeBytes,
      created: Date.now(),
      allocations: 0,
      lastUsed: Date.now(),
      id: Math.random().toString(36).substr(2, 9),
    };

    // Use WeakMap to associate metadata without affecting buffer performance
    if (!this.bufferMetadata) {
      this.bufferMetadata = new WeakMap();
    }
    this.bufferMetadata.set(buffer, metadata);

    this.stats.totalMemoryAllocated += sizeBytes;
    this.stats.peakMemoryUsage = Math.max(this.stats.peakMemoryUsage, this.getCurrentMemoryUsage());

    return buffer;
  }

  /**
   * Get optimal buffer for operation size
   */
  getBuffer(estimatedSizeBytes: number = 0): ArrayBuffer {
    const startTime = performance.now();

    // Determine pool category
    const poolName = this.selectPool(estimatedSizeBytes);
    const pool = this.pools[poolName];

    let buffer: ArrayBuffer;

    // Try to get from pool first
    if (pool.available.length > 0) {
      buffer = pool.available.pop()!;
      pool.inUse.add(buffer);
      this.stats.poolHits++;

      // Update metadata
      const metadata = this.bufferMetadata?.get(buffer);
      if (metadata) {
        metadata.allocations++;
        metadata.lastUsed = Date.now();
      }
    } else {
      // Pool empty - create new buffer if under limit
      if (pool.inUse.size < pool.maxCount) {
        buffer = this.createBuffer(pool.bufferSize);
        pool.inUse.add(buffer);
        this.stats.poolMisses++;
      } else {
        // Pool at capacity - fall back to direct allocation
        buffer = new ArrayBuffer(Math.max(estimatedSizeBytes, pool.bufferSize));
        this.stats.poolMisses++;
        console.warn(`⚠️ WASM Memory Pool: ${poolName} pool at capacity, using direct allocation`);
      }
    }

    const allocationTime = performance.now() - startTime;
    this.updateAllocationStats(allocationTime);
    this.stats.allocations++;

    return buffer;
  }

  /**
   * Return buffer to pool for reuse
   */
  returnBuffer(buffer: ArrayBuffer | null): void {
    if (!buffer) return;

    const startTime = performance.now();

    // Find which pool this buffer belongs to
    let targetPool: PoolConfig | null = null;
    let poolName: PoolCategory | null = null;

    for (const [name, pool] of Object.entries(this.pools) as [PoolCategory, PoolConfig][]) {
      if (pool.inUse.has(buffer)) {
        targetPool = pool;
        poolName = name;
        break;
      }
    }

    if (targetPool && poolName) {
      targetPool.inUse.delete(buffer);

      // Check if pool is getting too large during low memory pressure
      const currentPressure = this.getCurrentMemoryPressure();
      const shouldRecycle =
        targetPool.available.length < targetPool.maxCount / 2 ||
        currentPressure.level === 'low' ||
        currentPressure.level === 'unknown';

      if (shouldRecycle) {
        // Reset buffer and return to pool
        this.resetBuffer(buffer);
        targetPool.available.push(buffer);
        this.stats.memoryReused += buffer.byteLength;
      } else {
        // Memory pressure - don't keep excess buffers
        console.log(`🧹 WASM Memory Pool: Released ${poolName} buffer due to memory pressure`);
      }
    }

    const deallocationTime = performance.now() - startTime;
    this.stats.deallocations++;

    // Performance tracking (lightweight logging)
    if (this.options.enablePerformanceTracking && deallocationTime > 5.0) {
      // Only log slow deallocations (>5ms) to avoid spam
      console.log(
        `🧠 Slow WASM memory deallocation: ${deallocationTime.toFixed(2)}ms for ${poolName} pool (${buffer.byteLength} bytes)`
      );
    }
  }

  /**
   * Select appropriate pool based on operation size
   */
  private selectPool(estimatedSizeBytes: number): PoolCategory {
    if (estimatedSizeBytes <= 16 * 1024) {
      return 'small';
    } else if (estimatedSizeBytes <= 64 * 1024) {
      return 'medium';
    } else {
      return 'large';
    }
  }

  /**
   * Reset buffer for reuse (clear any sensitive data)
   */
  private resetBuffer(buffer: ArrayBuffer): void {
    // Fast memory clear for security and consistency
    const view = new Uint8Array(buffer);
    view.fill(0);
  }

  /**
   * Handle memory pressure events
   */
  private handleMemoryPressure(pressure: MemoryPressure): void {
    switch (pressure.level) {
      case 'medium':
        this.optimizePoolSizes(0.8); // Reduce pools by 20%
        break;

      case 'high':
        this.optimizePoolSizes(0.6); // Reduce pools by 40%
        break;

      case 'critical':
        this.emergencyCleanup();
        break;
    }
  }

  /**
   * Optimize pool sizes based on memory pressure
   */
  private optimizePoolSizes(targetUtilization: number): void {
    for (const [poolName, pool] of Object.entries(this.pools) as [PoolCategory, PoolConfig][]) {
      const targetSize = Math.floor(pool.maxCount * targetUtilization);

      while (pool.available.length > targetSize) {
        const buffer = pool.available.pop();
        if (buffer) {
          this.stats.totalMemoryAllocated -= buffer.byteLength;
        }
      }

      console.log(`🔧 Optimized ${poolName} pool: ${pool.available.length} available buffers`);
    }
  }

  /**
   * Emergency cleanup during critical memory pressure
   */
  private emergencyCleanup(): void {
    console.log('🚨 WASM Memory Pool: Emergency cleanup initiated');

    let totalFreed = 0;

    for (const [poolName, pool] of Object.entries(this.pools) as [PoolCategory, PoolConfig][]) {
      const freedBuffers = pool.available.length;
      totalFreed += freedBuffers * pool.bufferSize;

      pool.available.length = 0; // Clear all available buffers
      console.log(`🧹 Emergency cleanup: Freed ${freedBuffers} buffers from ${poolName} pool`);
    }

    this.stats.totalMemoryAllocated -= totalFreed;
    console.log(`🧹 Emergency cleanup completed: ${(totalFreed / 1024 / 1024).toFixed(2)}MB freed`);
  }

  /**
   * Get current memory usage across all pools
   */
  private getCurrentMemoryUsage(): number {
    let totalMemory = 0;

    for (const pool of Object.values(this.pools)) {
      totalMemory += (pool.available.length + pool.inUse.size) * pool.bufferSize;
    }

    return totalMemory;
  }

  /**
   * Get current memory pressure from detector
   */
  private getCurrentMemoryPressure(): MemoryPressure {
    if (this.memoryPressureDetector) {
      return this.memoryPressureDetector.getCurrentPressureLevel();
    }
    return { level: 'unknown', ratio: 0, available: 0, used: 0, total: 0, limit: 0, timestamp: 0 };
  }

  /**
   * Update allocation performance statistics
   */
  private updateAllocationStats(allocationTime: number): void {
    this.stats.averageAllocationTime =
      (this.stats.averageAllocationTime * (this.stats.allocations - 1) + allocationTime) /
      this.stats.allocations;

    // Calculate recycling efficiency
    const totalOperations = this.stats.poolHits + this.stats.poolMisses;
    this.stats.recyclingEfficiency =
      totalOperations > 0 ? (this.stats.poolHits / totalOperations) * 100 : 0;
  }

  /**
   * Set up periodic pool optimization
   */
  private setupPeriodicOptimization(): void {
    // Optimize every 30 seconds
    setInterval(() => {
      this.optimizePoolUtilization();
    }, 30 * 1000);
  }

  /**
   * Optimize pool utilization based on usage patterns
   */
  private optimizePoolUtilization(): void {
    for (const [poolName, pool] of Object.entries(this.pools) as [PoolCategory, PoolConfig][]) {
      const utilizationRatio = pool.inUse.size / (pool.available.length + pool.inUse.size);

      // If utilization is consistently low, reduce pool size
      if (utilizationRatio < this.options.shrinkThreshold && pool.available.length > 2) {
        const toRemove = Math.floor(pool.available.length * 0.25); // Remove 25%
        for (let i = 0; i < toRemove; i++) {
          const buffer = pool.available.pop();
          if (buffer) {
            this.stats.totalMemoryAllocated -= buffer.byteLength;
          }
        }

        console.log(
          `🔧 Pool optimization: Reduced ${poolName} pool by ${toRemove} buffers (low utilization: ${(utilizationRatio * 100).toFixed(1)}%)`
        );
      }
    }
  }

  /**
   * Get comprehensive pool statistics
   */
  getStats(): MemoryPoolStats {
    const poolStats: Record<PoolCategory, PoolStats> = {} as Record<PoolCategory, PoolStats>;

    for (const [poolName, pool] of Object.entries(this.pools) as [PoolCategory, PoolConfig][]) {
      poolStats[poolName] = {
        available: pool.available.length,
        inUse: pool.inUse.size,
        bufferSize: pool.bufferSize,
        maxCount: pool.maxCount,
        utilization: (pool.inUse.size / (pool.available.length + pool.inUse.size)) * 100 || 0,
        memoryUsed: (pool.available.length + pool.inUse.size) * pool.bufferSize,
      };
    }

    return {
      ...this.stats,
      pools: poolStats,
      totalMemoryUsage: this.getCurrentMemoryUsage(),
      memoryPressure: this.getCurrentMemoryPressure(),
      recommendations: this.generateOptimizationRecommendations(),
    };
  }

  /**
   * Generate optimization recommendations based on usage patterns
   */
  private generateOptimizationRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    const memoryPressure = this.getCurrentMemoryPressure();

    // Check recycling efficiency
    if (this.stats.recyclingEfficiency < 70) {
      recommendations.push({
        type: 'efficiency',
        message: `Low recycling efficiency (${this.stats.recyclingEfficiency.toFixed(1)}%). Consider increasing pool sizes or optimizing allocation patterns.`,
        priority: 'medium',
      });
    }

    // Check memory pressure
    if (memoryPressure.level === 'high' || memoryPressure.level === 'critical') {
      recommendations.push({
        type: 'memory',
        message: `High memory pressure detected (${(memoryPressure.ratio * 100).toFixed(1)}%). Pool sizes will be automatically reduced.`,
        priority: 'high',
      });
    }

    // Check allocation performance
    if (this.stats.averageAllocationTime > 1.0) {
      // >1ms is slow for memory allocation
      recommendations.push({
        type: 'performance',
        message: `Slow allocation times (${this.stats.averageAllocationTime.toFixed(2)}ms avg). Consider pre-warming pools or increasing buffer sizes.`,
        priority: 'low',
      });
    }

    return recommendations;
  }

  /**
   * Clean up all resources
   */
  cleanup(): void {
    // Clear all pools
    for (const pool of Object.values(this.pools)) {
      pool.available.length = 0;
      pool.inUse.clear();
    }

    // Stop memory pressure monitoring
    if (this.memoryPressureDetector) {
      this.memoryPressureDetector.stop();
    }
  }
}

/**
 * Operation statistics
 */
export interface OperationStats {
  /** Number of batch operations */
  batchOperations: number;

  /** Number of single operations */
  singleOperations: number;

  /** Total data transferred in bytes */
  totalDataTransferred: number;

  /** Average operation time in milliseconds */
  averageOperationTime: number;
}

/**
 * Combined operation and memory pool statistics
 */
export interface CombinedStats extends OperationStats {
  /** Memory pool statistics */
  memoryPoolStats: MemoryPoolStats;
}

/**
 * WASM Dictionary Manager interface (partial)
 */
export interface WasmDictionaryManager {
  batchLookup(data: ArrayBuffer, dictionaryTypes: string[]): Promise<any>;
}

/**
 * WASM Dictionary Operation Helper
 * Provides high-level interface for dictionary operations with memory management
 */
export class WasmDictionaryOperationHelper {
  private memoryPool: WasmMemoryPool;
  private wasmManager: WasmDictionaryManager;
  private operationStats: OperationStats;

  constructor(memoryPool: WasmMemoryPool, wasmDictionaryManager: WasmDictionaryManager) {
    this.memoryPool = memoryPool;
    this.wasmManager = wasmDictionaryManager;

    // Operation tracking
    this.operationStats = {
      batchOperations: 0,
      singleOperations: 0,
      totalDataTransferred: 0,
      averageOperationTime: 0,
    };
  }

  /**
   * Perform batch dictionary lookup with optimized memory allocation
   */
  async performBatchLookup(textChunks: string[], dictionaryTypes: string[]): Promise<any> {
    const startTime = performance.now();

    // Estimate memory requirements
    const estimatedSize = this.estimateMemoryRequirement(textChunks);
    const buffer = this.memoryPool.getBuffer(estimatedSize);

    try {
      // Serialize data into buffer
      const serializedData = this.serializeTextChunks(textChunks, buffer);

      // Perform WASM operation
      const results = await this.wasmManager.batchLookup(serializedData, dictionaryTypes);

      this.operationStats.batchOperations++;
      this.operationStats.totalDataTransferred += buffer.byteLength;

      return results;
    } finally {
      // Always return buffer to pool
      this.memoryPool.returnBuffer(buffer);

      const operationTime = performance.now() - startTime;
      this.updateOperationStats(operationTime);
    }
  }

  /**
   * Estimate memory requirement for text chunks
   */
  private estimateMemoryRequirement(textChunks: string[]): number {
    // Estimate: text size * 3 (UTF-8 overhead) + metadata overhead
    const textSize = textChunks.reduce((total, chunk) => total + chunk.length, 0);
    return textSize * 3 + 1024; // +1KB for metadata
  }

  /**
   * Serialize text chunks into buffer for WASM transfer
   */
  private serializeTextChunks(textChunks: string[], buffer: ArrayBuffer): ArrayBuffer {
    // Simple serialization for demonstration
    // In production, use more efficient serialization (MessagePack, Protocol Buffers, etc.)
    const encoder = new TextEncoder();
    const serialized = JSON.stringify(textChunks);
    const encodedData = encoder.encode(serialized);

    if (encodedData.length > buffer.byteLength) {
      throw new Error(
        `Serialized data (${encodedData.length} bytes) exceeds buffer capacity (${buffer.byteLength} bytes)`
      );
    }

    const view = new Uint8Array(buffer);
    view.set(encodedData);

    return buffer.slice(0, encodedData.length);
  }

  /**
   * Update operation performance statistics
   */
  private updateOperationStats(operationTime: number): void {
    const totalOps = this.operationStats.batchOperations + this.operationStats.singleOperations;
    this.operationStats.averageOperationTime =
      (this.operationStats.averageOperationTime * (totalOps - 1) + operationTime) / totalOps;
  }

  /**
   * Get operation statistics
   */
  getStats(): CombinedStats {
    return {
      ...this.operationStats,
      memoryPoolStats: this.memoryPool.getStats(),
    };
  }
}

// Export singleton instance
export const wasmMemoryPoolManager = new WasmMemoryPool({
  enablePerformanceTracking: true,
  enablePressureDetection: true,
});
