/**
 * Memory Leak Detection Utility
 *
 * Tracks memory usage patterns during translation to identify accumulation.
 * Provides trend analysis, threshold alerts, and cleanup recommendations.
 *
 * Features:
 * - Real-time memory monitoring via performance.memory API
 * - Short-term (last 10) and long-term (last 100) trend tracking
 * - Automatic cleanup triggers at 75%, 85%, 95% thresholds
 * - Leak detection with configurable sensitivity
 * - Zero dependencies on translation logic
 *
 * @example
 * const detector = new MemoryLeakDetector();
 * detector.onCleanupNeeded = (level) => {
 *   console.log(`Cleanup needed: ${level}`);
 * };
 * const snapshot = detector.recordSnapshot('translation_batch', { batchSize: 100 });
 */

import { batchLog } from '../BatchLogger.js';

export class MemoryLeakDetector {
  constructor() {
    this.snapshots = [];
    this.startMemory = this.getCurrentMemory();
    this.trends = {
      shortTerm: [], // Last 10 measurements
      longTerm: [], // Last 100 measurements (downsampled)
      alerts: [], // Memory warnings
    };
    this.cleanupThresholds = {
      warning: 0.75, // 75% of heap
      critical: 0.85, // 85% of heap
      emergency: 0.95, // 95% of heap
    };
    this.onCleanupNeeded = null; // Callback for cleanup requests

    // CODE REVIEW FIX (HIGH-1): Use WeakMap to store heavy context data
    // Allows GC to collect context when snapshot is discarded
    this.snapshotContexts = new WeakMap();
  }

  getCurrentMemory() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  recordSnapshot(operation = 'unknown', context = {}) {
    const memory = this.getCurrentMemory();
    if (!memory) return null;

    // CODE REVIEW FIX (HIGH-1): Separate lightweight metadata from heavy context
    // Lightweight snapshot only contains primitives and small objects
    const lightweightSnapshot = {
      operation,
      memory,
      memoryGrowth: memory.used - this.startMemory.used,
      memoryGrowthMB: (memory.used - this.startMemory.used) / (1024 * 1024),
      trend: this.calculateTrend(),
      timestamp: memory.timestamp,
      // ❌ context removed - stored in WeakMap instead
    };

    // Store heavy context in WeakMap (GC-friendly)
    // When snapshot is removed from array, context becomes GC-eligible
    if (context && Object.keys(context).length > 0) {
      this.snapshotContexts.set(lightweightSnapshot, context);
    }

    this.snapshots.push(lightweightSnapshot);
    this.updateTrends(lightweightSnapshot);
    this.checkThresholds(lightweightSnapshot);

    // Keep only recent snapshots to prevent memory leak in the detector itself
    if (this.snapshots.length > 50) {
      const removed = this.snapshots.slice(0, 25); // These will be GC'd
      this.snapshots = this.snapshots.slice(-25);
      // WeakMap automatically releases context for removed snapshots
    }

    return lightweightSnapshot;
  }

  /**
   * Get snapshot context if needed
   * CODE REVIEW FIX (HIGH-1): Helper to retrieve context from WeakMap
   * @param {Object} snapshot - Snapshot object
   * @returns {Object} Context object or empty object if not found
   */
  getSnapshotContext(snapshot) {
    return this.snapshotContexts.get(snapshot) || {};
  }

  // Legacy method for backward compatibility
  takeSnapshot(batchIndex, context = {}) {
    return this.recordSnapshot(`batch_${batchIndex}`, { batchIndex, ...context });
  }

  calculateTrend() {
    if (this.snapshots.length < 2) return 0;

    const recent = this.snapshots.slice(-5); // Last 5 snapshots
    if (recent.length < 2) return 0;

    const trend = recent[recent.length - 1].memory.used - recent[0].memory.used;
    return trend / recent.length; // Average change per snapshot
  }

  updateTrends(snapshot) {
    this.trends.shortTerm.push({
      timestamp: snapshot.timestamp,
      used: snapshot.memory.used,
      trend: snapshot.trend,
      operation: snapshot.operation,
    });

    // Keep last 10 for short term
    if (this.trends.shortTerm.length > 10) {
      this.trends.shortTerm.shift();
    }

    // Sample every 10th for long term
    if (this.snapshots.length % 10 === 0) {
      this.trends.longTerm.push({
        timestamp: snapshot.timestamp,
        used: snapshot.memory.used,
        trend: snapshot.trend,
        operation: snapshot.operation,
      });

      if (this.trends.longTerm.length > 100) {
        this.trends.longTerm.shift();
      }
    }
  }

  checkThresholds(snapshot) {
    const ratio = snapshot.memory.used / snapshot.memory.limit;
    const _now = Date.now();

    if (ratio >= this.cleanupThresholds.emergency) {
      this.triggerEmergencyCleanup(snapshot);
    } else if (ratio >= this.cleanupThresholds.critical) {
      this.triggerCriticalAlert(snapshot);
    } else if (ratio >= this.cleanupThresholds.warning) {
      this.triggerWarning(snapshot);
    }
  }

  triggerWarning(snapshot) {
    const alert = {
      level: 'warning',
      timestamp: Date.now(),
      usage: snapshot.memory.used,
      limit: snapshot.memory.limit,
      ratio: snapshot.memory.used / snapshot.memory.limit,
      recommendation: 'Consider manual cleanup or reduce batch size',
    };

    this.trends.alerts.push(alert);

    // Keep only last 20 alerts
    if (this.trends.alerts.length > 20) {
      this.trends.alerts.shift();
    }

    batchLog.warn(`⚠️ Memory usage at ${(alert.ratio * 100).toFixed(1)}%`, {
      usedMB: (alert.usage / (1024 * 1024)).toFixed(1),
      limitMB: (alert.limit / (1024 * 1024)).toFixed(1),
    });
  }

  triggerCriticalAlert(snapshot) {
    const alert = {
      level: 'critical',
      timestamp: Date.now(),
      usage: snapshot.memory.used,
      limit: snapshot.memory.limit,
      ratio: snapshot.memory.used / snapshot.memory.limit,
      recommendation: 'Automatic cleanup triggered',
    };

    this.trends.alerts.push(alert);

    if (this.trends.alerts.length > 20) {
      this.trends.alerts.shift();
    }

    batchLog.error(`🚨 Critical memory usage at ${(alert.ratio * 100).toFixed(1)}%`, {
      usedMB: (alert.usage / (1024 * 1024)).toFixed(1),
      limitMB: (alert.limit / (1024 * 1024)).toFixed(1),
    });

    // Trigger automatic cleanup
    this.requestCleanup('automatic');
  }

  triggerEmergencyCleanup(snapshot) {
    const alert = {
      level: 'emergency',
      timestamp: Date.now(),
      usage: snapshot.memory.used,
      limit: snapshot.memory.limit,
      ratio: snapshot.memory.used / snapshot.memory.limit,
      recommendation: 'Emergency cleanup and GC triggered',
    };

    this.trends.alerts.push(alert);

    if (this.trends.alerts.length > 20) {
      this.trends.alerts.shift();
    }

    batchLog.error(`🆘 Emergency memory cleanup at ${(alert.ratio * 100).toFixed(1)}%`, {
      usedMB: (alert.usage / (1024 * 1024)).toFixed(1),
      limitMB: (alert.limit / (1024 * 1024)).toFixed(1),
    });

    // Emergency cleanup
    this.requestCleanup('emergency');
    this.requestGarbageCollection();
  }

  requestCleanup(level = 'automatic') {
    // Trigger cleanup in translation engine
    if (this.onCleanupNeeded) {
      this.onCleanupNeeded(level);
    }
  }

  requestGarbageCollection() {
    if (typeof window !== 'undefined' && window.gc) {
      batchLog.info('🗑️ Triggering manual garbage collection');
      window.gc();
    } else if (typeof global !== 'undefined' && global.gc) {
      batchLog.info('🗑️ Triggering manual garbage collection');
      global.gc();
    }
  }

  detectLeaks(currentSnapshot) {
    if (this.snapshots.length < 3) return null;

    const recent = this.snapshots.slice(-3);
    const memoryGrowthRate = (recent[2].memory.used - recent[0].memory.used) / 2; // Per batch
    const totalGrowthMB = currentSnapshot.memoryGrowthMB;

    // Detect memory usage patterns (distinguish semantic array construction from actual leaks)
    const memoryGrowthMB = memoryGrowthRate / (1024 * 1024);

    const analysis = {
      memoryGrowthRate: memoryGrowthMB, // MB per batch
      totalGrowthMB,
      // Revised thresholds: Higher limits for legitimate semantic array construction
      isHighUsage: memoryGrowthMB > 8, // >8MB per batch (semantic arrays for long texts)
      isExcessive: totalGrowthMB > 200, // >200MB total (very long texts or actual leaks)
      currentRatio: currentSnapshot.memory.used / currentSnapshot.memory.limit,
      trendAnalysis: this.analyzeTrends(),
    };

    return analysis;
  }

  analyzeTrends() {
    if (this.trends.shortTerm.length < 3) return null;

    const shortTerm = this.trends.shortTerm;
    const avgTrend = shortTerm.reduce((sum, t) => sum + t.trend, 0) / shortTerm.length;
    const recentUsage = shortTerm.map((t) => t.used);
    const minUsage = Math.min(...recentUsage);
    const maxUsage = Math.max(...recentUsage);

    return {
      averageTrend: avgTrend / (1024 * 1024), // MB
      memoryVariance: (maxUsage - minUsage) / (1024 * 1024), // MB
      isStable: Math.abs(avgTrend) < 1024 * 1024, // <1MB change
      isIncreasing: avgTrend > 2 * 1024 * 1024, // >2MB increase trend
      recentAlerts: this.trends.alerts.filter((a) => Date.now() - a.timestamp < 300000).length, // Last 5 minutes
    };
  }

  getAnalysis() {
    const current = this.snapshots[this.snapshots.length - 1];
    if (!current) return null;

    return {
      current: {
        usedMB: (current.memory.used / (1024 * 1024)).toFixed(1),
        totalMB: (current.memory.total / (1024 * 1024)).toFixed(1),
        limitMB: (current.memory.limit / (1024 * 1024)).toFixed(1),
        ratio: ((current.memory.used / current.memory.limit) * 100).toFixed(1) + '%',
      },
      trends: {
        shortTerm: this.analyzeShortTrend(),
        longTerm: this.analyzeLongTrend(),
      },
      alerts: this.trends.alerts.slice(-5),
      recommendations: this.generateRecommendations(),
    };
  }

  analyzeShortTrend() {
    if (this.trends.shortTerm.length < 2) return null;

    const data = this.trends.shortTerm;
    const first = data[0];
    const last = data[data.length - 1];
    const change = (last.used - first.used) / (1024 * 1024);
    const timespan = last.timestamp - first.timestamp;

    return {
      changeMB: change.toFixed(1),
      timespanMs: timespan,
      ratePerMinute: (change / (timespan / 60000) || 0).toFixed(2),
    };
  }

  analyzeLongTrend() {
    if (this.trends.longTerm.length < 2) return null;

    const data = this.trends.longTerm;
    const first = data[0];
    const last = data[data.length - 1];
    const change = (last.used - first.used) / (1024 * 1024);
    const timespan = last.timestamp - first.timestamp;

    return {
      changeMB: change.toFixed(1),
      timespanMs: timespan,
      ratePerHour: (change / (timespan / 3600000) || 0).toFixed(2),
    };
  }

  generateRecommendations() {
    const recommendations = [];
    const analysis = this.analyzeTrends();

    if (!analysis) return recommendations;

    if (analysis.isIncreasing) {
      recommendations.push(
        'Memory usage is consistently increasing - consider reducing batch sizes'
      );
    }

    if (analysis.recentAlerts > 3) {
      recommendations.push('Multiple memory alerts detected - enable automatic cleanup');
    }

    if (!analysis.isStable) {
      recommendations.push('Memory usage is unstable - check for memory leaks in processing logic');
    }

    return recommendations;
  }

  getReport() {
    if (this.snapshots.length === 0) return null;

    const latest = this.snapshots[this.snapshots.length - 1];
    return {
      totalSnapshots: this.snapshots.length,
      memoryGrowthMB: latest.memoryGrowthMB,
      currentUsedMB: latest.memory.used / (1024 * 1024),
      analysis: this.getAnalysis(),
      snapshots: this.snapshots.map((s) => ({
        operation: s.operation,
        growthMB: s.memoryGrowthMB.toFixed(1),
        usedMB: (s.memory.used / (1024 * 1024)).toFixed(1),
        timestamp: s.timestamp,
      })),
    };
  }
}
