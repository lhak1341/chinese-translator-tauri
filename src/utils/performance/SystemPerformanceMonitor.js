import { logger } from '../logger';
import { globalPerformanceMonitor } from './PerformanceMonitor.js';
import { adaptiveBufferCalculator } from '../ui/AdaptiveVirtualScrolling.js';
import { wasmMemoryPoolManager } from '../wasm/WasmMemoryPoolManager.js';
import { PerformanceBaselineTracker } from './PerformanceBaselineTracker.js';

/**
 * System-wide performance regression detector
 * Integrates with existing performance monitoring systems
 */
export class SystemPerformanceMonitor {
  constructor() {
    this.baselineTracker = new PerformanceBaselineTracker();
    this.integrations = new Map();
    this.isActive = true;

    this.setupIntegrations();
  }

  /**
   * Set up integrations with existing monitoring systems
   */
  setupIntegrations() {
    // Integration 1: Global Performance Monitor
    if (globalPerformanceMonitor) {
      this.integrations.set('globalPerformanceMonitor', {
        name: 'Global Performance Monitor',
        collectMetrics: () => globalPerformanceMonitor.getMetrics(),
        isActive: true,
      });
    }

    // Integration 2: Adaptive Virtual Scrolling
    if (adaptiveBufferCalculator) {
      this.integrations.set('virtualScrolling', {
        name: 'Virtual Scrolling Buffer',
        collectMetrics: () => adaptiveBufferCalculator.getScrollingStats(),
        isActive: true,
      });
    }

    // Integration 3: WASM Memory Pool Manager
    if (wasmMemoryPoolManager) {
      this.integrations.set('wasmMemoryPool', {
        name: 'WASM Memory Pool',
        collectMetrics: () => wasmMemoryPoolManager.getStats(),
        isActive: true,
      });
    }

    logger.log(
      `🔍 System Performance Monitor initialized with ${this.integrations.size} integrations`
    );
  }

  /**
   * Collect metrics from all integrated systems
   */
  collectSystemMetrics() {
    if (!this.isActive) return;

    const timestamp = Date.now();
    const systemMetrics = {
      timestamp,
      memory: this.getMemoryMetrics(),
      integrations: {},
    };

    // Collect metrics from each integration
    for (const [key, integration] of this.integrations.entries()) {
      try {
        if (integration.isActive && integration.collectMetrics) {
          systemMetrics.integrations[key] = integration.collectMetrics();
        }
      } catch (error) {
        logger.warn(`⚠️ Failed to collect metrics from ${integration.name}:`, error);
      }
    }

    // Record performance data for each integration
    this.recordIntegrationMetrics(systemMetrics);
  }

  /**
   * Record metrics in baseline tracker
   */
  recordIntegrationMetrics(systemMetrics) {
    // Record global performance metrics
    if (systemMetrics.integrations.globalPerformanceMonitor) {
      const gpm = systemMetrics.integrations.globalPerformanceMonitor;
      this.baselineTracker.recordPerformance('translation_engine', {
        duration: gpm.avgTime || 0,
        memoryUsed: systemMetrics.memory.used,
        operationsPerSecond: gpm.opsPerSecond || 0,
        sampleCount: gpm.sampleCount || 0,
      });
    }

    // Record virtual scrolling performance metrics
    if (systemMetrics.integrations.virtualScrolling) {
      const vs = systemMetrics.integrations.virtualScrolling;
      if (vs && vs.averageFrameTime > 0) {
        this.baselineTracker.recordPerformance('virtual_scrolling', {
          duration: vs.averageFrameTime,
          memoryUsed: systemMetrics.memory.used,
          isPerformant: vs.isPerformant,
          averageScrollVelocity: vs.averageScrollVelocity || 0,
        });
      }
    }

    // Record WASM memory pool performance metrics
    if (systemMetrics.integrations.wasmMemoryPool) {
      const wmp = systemMetrics.integrations.wasmMemoryPool;
      this.baselineTracker.recordPerformance('wasm_memory_pool', {
        duration: wmp.averageAllocationTime || 0,
        recyclingEfficiency: wmp.recyclingEfficiency / 100, // Convert percentage to decimal
        memoryUsed: wmp.totalMemoryUsage || 0,
        poolHits: wmp.poolHits || 0,
        poolMisses: wmp.poolMisses || 0,
        memoryReused: wmp.memoryReused || 0,
      });
    }
  }

  /**
   * Get memory metrics
   */
  getMemoryMetrics() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        pressure: performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit,
      };
    }
    return { used: 0, total: 0, limit: 0, pressure: 0 };
  }

  /**
   * Check real memory usage with detailed analysis
   * Helps distinguish false positive alerts from actual memory issues
   */
  checkRealMemory() {
    if (!performance.memory) {
      logger.warn('⚠️ performance.memory API not available');
      return null;
    }

    const used = performance.memory.usedJSHeapSize;
    const total = performance.memory.totalJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;

    const usagePercent = ((used / limit) * 100).toFixed(1);
    const usedMB = (used / 1024 / 1024).toFixed(1);
    const totalMB = (total / 1024 / 1024).toFixed(1);
    const limitMB = (limit / 1024 / 1024).toFixed(1);

    logger.log('📊 Real Memory Usage Analysis:');
    logger.log(`   Heap Used: ${usedMB} MB / ${limitMB} MB (${usagePercent}%)`);
    logger.log(`   Heap Total: ${totalMB} MB`);

    if (usagePercent < 20) {
      logger.log('   ✅ Status: HEALTHY - Memory usage is low');
    } else if (usagePercent < 30) {
      logger.log('   ⚠️  Status: WATCH - Memory usage is moderate');
    } else if (usagePercent < 50) {
      logger.log('   ⚠️  Status: ELEVATED - Memory usage is getting high');
    } else {
      logger.log('   🔴 Status: CRITICAL - Memory usage is very high');
    }

    // Translation segment count analysis
    if (process.env.NODE_ENV === 'development') {
      if (window.translationEngine?.translationSegments) {
        const segmentCount = window.translationEngine.translationSegments.length;
        logger.log(`   Translation Segments: ${segmentCount}`);

        if (segmentCount > 75) {
          logger.log('   ⚠️  Segment count high - cleanup threshold should trigger soon');
        } else if (segmentCount > 35) {
          logger.log('   ℹ️  Segment count normal - within expected range');
        } else {
          logger.log('   ✅ Segment count low - plenty of headroom');
        }
      }
    }

    return {
      usedMB: parseFloat(usedMB),
      totalMB: parseFloat(totalMB),
      limitMB: parseFloat(limitMB),
      usagePercent: parseFloat(usagePercent),
      status:
        usagePercent < 20
          ? 'HEALTHY'
          : usagePercent < 30
            ? 'WATCH'
            : usagePercent < 50
              ? 'ELEVATED'
              : 'CRITICAL',
    };
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs = 30000) {
    // 30 seconds default
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    logger.log(`🔍 System performance monitoring started (${intervalMs / 1000}s intervals)`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.log('⏹️ System performance monitoring stopped');
  }

  /** Delegates to baselineTracker — callers don't reach through this.baselineTracker directly. */
  recordPerformance(operationType, metrics) {
    this.baselineTracker.recordPerformance(operationType, metrics);
  }

  /**
   * Cheap status-only read — skips the baselines array build in getSystemHealthReport().
   * For callers that only need status (e.g. PerformanceHealth.getReport()'s hot path).
   */
  getStatus() {
    return this.baselineTracker.getStatusSummary();
  }

  /**
   * MEMORY LEAK FIX: Complete cleanup of all resources
   * Call this when the monitor is no longer needed
   */
  destroy() {
    this.isActive = false;
    this.stopMonitoring();
    this.baselineTracker.destroy();
    this.integrations.clear();
    logger.log('🗑️ System performance monitor destroyed');
  }

  /**
   * Get comprehensive system health report
   */
  getSystemHealthReport() {
    const baselineHealth = this.baselineTracker.getHealthSummary();
    const systemMetrics = {
      memory: this.getMemoryMetrics(),
      timestamp: Date.now(),
    };

    return {
      ...baselineHealth,
      systemMetrics,
      recommendations: this.generateRecommendations(baselineHealth, systemMetrics),
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations(health, systemMetrics) {
    const recommendations = [];

    // Memory pressure recommendations
    if (systemMetrics.memory.pressure > 0.8) {
      recommendations.push({
        level: 'warning',
        type: 'memory',
        message:
          'High memory pressure detected. Consider reducing buffer sizes or clearing caches.',
        action: 'reduce_memory_usage',
      });
    }

    // Performance degradation recommendations
    if (health.criticalAlerts > 0) {
      recommendations.push({
        level: 'critical',
        type: 'performance',
        message:
          'Critical performance regressions detected. Review recent changes or consider rollback.',
        action: 'investigate_regressions',
      });
    }

    return recommendations;
  }

  /**
   * Maps a raw metric key to the baseline field that tracks it. memoryUsed is
   * the only metric key ever produced by an integration's collectMetrics()
   * that also has a tracked baseline.
   */
  static BASELINE_FIELD_FOR_METRIC = {
    memoryUsed: 'avgMemoryUsed',
  };

  /**
   * Log detailed memory breakdown for critical alerts
   */
  logDetailedMemoryDebug(operationType, alert) {
    try {
      logger.group(`🔍 Memory Debug: ${operationType}`);

      // Get current memory metrics
      const integration = this.integrations.get(operationType);
      if (integration && integration.collectMetrics) {
        const currentMetrics = integration.collectMetrics();
        const baseline = this.baselineTracker.getBaseline(operationType);

        logger.log(`📊 Current Memory Usage:`, currentMetrics);
        logger.log(`📋 Baseline:`, baseline);

        // Calculate specific growth areas
        if (currentMetrics && baseline) {
          logger.log(`🔺 Memory Growth Analysis:`);
          Object.keys(currentMetrics).forEach((key) => {
            const baselineKey = SystemPerformanceMonitor.BASELINE_FIELD_FOR_METRIC[key];
            if (!baselineKey) return;
            const current = currentMetrics[key] || 0;
            const baselineVal = baseline[baselineKey] || 0;
            if (baselineVal > 0) {
              const ratio = current / baselineVal;
              if (ratio > 1.2) {
                logger.log(`   ${key}: ${current} (${ratio.toFixed(1)}x baseline: ${baselineVal})`);
              }
            }
          });
        }
      }

      logger.groupEnd();
    } catch (error) {
      logger.error('Error in memory debug logging:', error);
    }
  }
}

// Export singleton instance
export const systemPerformanceMonitor = new SystemPerformanceMonitor();

// Note: window.checkRealMemory and window.systemPerformanceMonitor are exposed in App.jsx
// to avoid duplicate assignments and centralize development API exposure
