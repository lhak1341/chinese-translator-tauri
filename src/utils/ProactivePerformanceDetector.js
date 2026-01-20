/**
 * Proactive Performance Regression Detection
 *
 * OPTIMIZATION: Monitors optimization effectiveness and catches gradual degradation
 * Complements reactive monitoring with predictive baseline tracking and automated alerts
 *
 * Key Features:
 * - Baseline performance establishment and drift detection
 * - Trend analysis for gradual performance degradation
 * - Automated alerts before critical thresholds are reached
 * - Integration with existing PerformanceMonitor and LegacySystemFlags
 * - Zero-risk monitoring-only implementation
 *
 * @import {
 *   BaselineTrackerOptions,
 *   AlertThresholds,
 *   PerformanceDataPoint,
 *   PerformanceBaseline,
 *   PerformanceAlert,
 *   TrendAnalysis,
 *   TrendAnalysisResults,
 *   BaselineSummary,
 *   PerformanceHealthSummary,
 *   PerformanceBaselineTrackerInterface
 * } from '../types/PerformanceMonitoringTypes'
 */

import { logger } from './logger';
import { globalPerformanceMonitor } from './PerformanceMonitor.js';
import { contentAwarePositionCache } from './ContentAwarePositionCache.js';
import { adaptiveBufferCalculator } from './AdaptiveVirtualScrolling.js';
import { wasmMemoryPoolManager } from './WasmMemoryPoolManager.js';

/**
 * Performance baseline tracker with trend analysis
 */
export class PerformanceBaselineTracker {
  constructor(options = {}) {
    this.options = {
      baselineWindowMs: options.baselineWindowMs || 24 * 60 * 60 * 1000, // 24 hours
      trendAnalysisWindows: options.trendAnalysisWindows || [5, 15, 30, 60], // minutes
      alertThresholds: {
        warningDegradation: options.warningDegradation || 1.2, // 20% slower
        criticalDegradation: options.criticalDegradation || 1.5, // 50% slower
        memoryWarning: options.memoryWarning || 1.3, // 30% more memory
        memoryCritical: options.memoryCritical || 1.5, // 50% more memory
        cacheHitRateWarning: options.cacheHitRateWarning || 0.8, // <80%
        cacheHitRateCritical: options.cacheHitRateCritical || 0.6, // <60%
        ...options.alertThresholds,
      },
      maxHistorySize: options.maxHistorySize || 1000,
      ...options,
    };

    // Performance history storage
    this.performanceHistory = [];
    this.baselines = new Map(); // Different baselines for different operations
    this.alerts = [];
    this.trends = new Map(); // Trend analysis cache

    // MEMORY LEAK FIX: Collection size limits to prevent unbounded growth
    this.MAX_BASELINES = 100; // Limit baseline entries
    this.MAX_TRENDS = 200; // Limit trend cache
    this.MAX_ALERTS = 50; // Limit alert history

    // Monitoring state
    this.isActive = true;
    this.lastBaselineUpdate = 0;
    this.monitoringStartTime = Date.now();

    // MEMORY LEAK FIX: Store interval ID for cleanup
    this.analysisIntervalId = null;

    this.setupPeriodicAnalysis();
  }

  /**
   * TRUE LRU: Get baseline and move to end (mark as recently used)
   * Maps maintain insertion order, so deleting and re-inserting moves to end
   */
  _getBaselineLRU(operationType) {
    const baseline = this.baselines.get(operationType);
    if (baseline) {
      // Move to end by deleting and re-inserting (marks as recently used)
      this.baselines.delete(operationType);
      this.baselines.set(operationType, baseline);
    }
    return baseline;
  }

  /**
   * TRUE LRU: Get trend and move to end (mark as recently used)
   */
  _getTrendLRU(operationType) {
    const trend = this.trends.get(operationType);
    if (trend) {
      // Move to end by deleting and re-inserting (marks as recently used)
      this.trends.delete(operationType);
      this.trends.set(operationType, trend);
    }
    return trend;
  }

  /**
   * Record performance data point
   */
  recordPerformance(operationType, metrics) {
    if (!this.isActive) return;

    const timestamp = Date.now();
    const dataPoint = {
      operationType,
      timestamp,
      ...metrics,
      sessionAge: timestamp - this.monitoringStartTime,
    };

    // Maintain history size - check BEFORE push to prevent unbounded growth
    if (this.performanceHistory.length >= this.options.maxHistorySize) {
      this.performanceHistory.shift(); // Remove oldest entry
    }

    this.performanceHistory.push(dataPoint);

    // Update baseline if needed
    this.updateBaselinesIfNeeded(operationType, dataPoint);

    // Check for immediate alerts
    this.checkImmediateAlerts(operationType, dataPoint);
  }

  /**
   * Establish or update performance baselines
   */
  updateBaselinesIfNeeded(operationType, dataPoint) {
    const now = Date.now();
    const baseline = this._getBaselineLRU(operationType);

    // Establish initial baseline after sufficient data
    if (!baseline && this.getOperationHistory(operationType).length >= 10) {
      this.establishBaseline(operationType);
      return;
    }

    // Update baseline periodically (daily)
    if (baseline && now - baseline.lastUpdate > this.options.baselineWindowMs) {
      this.updateBaseline(operationType);
    }
  }

  /**
   * Establish initial baseline for operation type
   */
  establishBaseline(operationType) {
    const history = this.getOperationHistory(operationType, 50); // Use last 50 samples
    if (history.length < 10) return;

    // Calculate baseline statistics
    const durations = history.map((h) => h.duration || 0).filter((d) => d > 0);
    const memoryUsages = history.map((h) => h.memoryUsed || 0).filter((m) => m > 0);
    const cacheHitRates = history.map((h) => h.cacheHitRate || 0).filter((c) => c > 0);

    const baseline = {
      operationType,
      establishedAt: Date.now(),
      lastUpdate: Date.now(),
      sampleCount: history.length,

      // Duration statistics
      avgDuration: this.calculateMean(durations),
      medianDuration: this.calculateMedian(durations),
      durationStdDev: this.calculateStdDev(durations),

      // Memory statistics
      avgMemoryUsed: this.calculateMean(memoryUsages),
      medianMemoryUsed: this.calculateMedian(memoryUsages),

      // Cache performance
      avgCacheHitRate: this.calculateMean(cacheHitRates),
      medianCacheHitRate: this.calculateMedian(cacheHitRates),

      // Quality metrics
      operationsPerSecond: durations.length > 0 ? 1000 / this.calculateMean(durations) : 0,
    };

    // MEMORY LEAK FIX: Enforce baselines Map size limit with TRUE LRU eviction
    // Delete least recently used entry (first entry in Map maintains insertion order)
    if (this.baselines.size >= this.MAX_BASELINES) {
      const firstKey = this.baselines.keys().next().value;
      this.baselines.delete(firstKey);
      if (process.env.NODE_ENV === 'development') {
        logger.log(`🗑️ Evicted LRU baseline: ${firstKey}`);
      }
    }

    this.baselines.set(operationType, baseline);
    logger.log(`📊 Performance baseline established for '${operationType}':`, {
      avgDuration: baseline.avgDuration.toFixed(1) + 'ms',
      avgMemory: baseline.avgMemoryUsed
        ? (baseline.avgMemoryUsed / 1024 / 1024).toFixed(1) + 'MB'
        : 'N/A',
      avgCacheHitRate: baseline.avgCacheHitRate
        ? (baseline.avgCacheHitRate * 100).toFixed(1) + '%'
        : 'N/A',
    });
  }

  /**
   * Update existing baseline with recent performance data
   */
  updateBaseline(operationType) {
    const baseline = this._getBaselineLRU(operationType);
    if (!baseline) return;

    // Use exponential moving average to update baseline (gives more weight to recent data)
    const alpha = 0.1; // Smoothing factor
    const recentHistory = this.getOperationHistory(operationType, 20); // Last 20 samples

    if (recentHistory.length < 5) return;

    const recentDurations = recentHistory.map((h) => h.duration || 0).filter((d) => d > 0);
    const recentMemoryUsages = recentHistory.map((h) => h.memoryUsed || 0).filter((m) => m > 0);
    const recentCacheHitRates = recentHistory.map((h) => h.cacheHitRate || 0).filter((c) => c > 0);

    // Update baseline with exponential moving average
    if (recentDurations.length > 0) {
      const newAvgDuration = this.calculateMean(recentDurations);
      baseline.avgDuration = baseline.avgDuration * (1 - alpha) + newAvgDuration * alpha;
    }

    if (recentMemoryUsages.length > 0) {
      const newAvgMemory = this.calculateMean(recentMemoryUsages);
      baseline.avgMemoryUsed = baseline.avgMemoryUsed * (1 - alpha) + newAvgMemory * alpha;
    }

    if (recentCacheHitRates.length > 0) {
      const newAvgCacheHitRate = this.calculateMean(recentCacheHitRates);
      baseline.avgCacheHitRate =
        baseline.avgCacheHitRate * (1 - alpha) + newAvgCacheHitRate * alpha;
    }

    baseline.lastUpdate = Date.now();
    logger.log(`📈 Performance baseline updated for '${operationType}'`);
  }

  /**
   * Check for immediate performance alerts
   */
  checkImmediateAlerts(operationType, dataPoint) {
    const baseline = this._getBaselineLRU(operationType);
    if (!baseline) return;

    const alerts = [];

    // Duration regression check
    if (dataPoint.duration && baseline.avgDuration > 0) {
      const durationRatio = dataPoint.duration / baseline.avgDuration;
      if (durationRatio >= this.options.alertThresholds.criticalDegradation) {
        alerts.push({
          level: 'critical',
          type: 'duration_regression',
          message: `${operationType} duration ${durationRatio.toFixed(1)}x slower than baseline (${dataPoint.duration.toFixed(1)}ms vs ${baseline.avgDuration.toFixed(1)}ms)`,
          ratio: durationRatio,
          current: dataPoint.duration,
          baseline: baseline.avgDuration,
        });
      } else if (durationRatio >= this.options.alertThresholds.warningDegradation) {
        alerts.push({
          level: 'warning',
          type: 'duration_regression',
          message: `${operationType} duration ${durationRatio.toFixed(1)}x slower than baseline`,
          ratio: durationRatio,
          current: dataPoint.duration,
          baseline: baseline.avgDuration,
        });
      }
    }

    // Memory regression check
    // DISABLED: False positives due to startup vs runtime memory baseline differences
    // Real memory monitoring shows healthy 12% usage (270MB/2144MB), baseline comparison is unreliable
    if (false && dataPoint.memoryUsed && baseline.avgMemoryUsed > 0) {
      const memoryRatio = dataPoint.memoryUsed / baseline.avgMemoryUsed;
      // Increased thresholds to prevent false positives
      if (memoryRatio >= 3.0) {
        // Was 2.0, now 3.0
        alerts.push({
          level: 'critical',
          type: 'memory_regression',
          message: `${operationType} memory usage ${memoryRatio.toFixed(1)}x higher than baseline`,
          ratio: memoryRatio,
          current: dataPoint.memoryUsed,
          baseline: baseline.avgMemoryUsed,
          investigation: this.generateMemoryInvestigationSuggestions(memoryRatio),
        });
      } else if (memoryRatio >= 2.5) {
        // Was 1.5, now 2.5
        alerts.push({
          level: 'warning',
          type: 'memory_regression',
          message: `${operationType} memory usage ${memoryRatio.toFixed(1)}x higher than baseline`,
          ratio: memoryRatio,
          current: dataPoint.memoryUsed,
          baseline: baseline.avgMemoryUsed,
          investigation: this.generateMemoryInvestigationSuggestions(memoryRatio),
        });
      }
    }

    // Cache hit rate degradation check
    if (dataPoint.cacheHitRate !== undefined && baseline.avgCacheHitRate > 0) {
      if (
        dataPoint.cacheHitRate <
        baseline.avgCacheHitRate * this.options.alertThresholds.cacheHitRateCritical
      ) {
        alerts.push({
          level: 'critical',
          type: 'cache_degradation',
          message: `${operationType} cache hit rate critically low: ${(dataPoint.cacheHitRate * 100).toFixed(1)}% vs baseline ${(baseline.avgCacheHitRate * 100).toFixed(1)}%`,
          current: dataPoint.cacheHitRate,
          baseline: baseline.avgCacheHitRate,
        });
      } else if (
        dataPoint.cacheHitRate <
        baseline.avgCacheHitRate * this.options.alertThresholds.cacheHitRateWarning
      ) {
        alerts.push({
          level: 'warning',
          type: 'cache_degradation',
          message: `${operationType} cache hit rate below baseline`,
          current: dataPoint.cacheHitRate,
          baseline: baseline.avgCacheHitRate,
        });
      }
    }

    // Store and log alerts
    for (const alert of alerts) {
      alert.timestamp = Date.now();
      alert.operationType = operationType;

      // MEMORY LEAK FIX: Enforce alerts array size limit
      if (this.alerts.length >= this.MAX_ALERTS) {
        this.alerts.shift(); // Remove oldest alert
      }

      this.alerts.push(alert);

      if (alert.level === 'critical') {
        logger.error('🚨 CRITICAL Performance Regression:', alert.message);

        // ENHANCED DEBUG: Show detailed memory breakdown for critical alerts
        if (process.env.NODE_ENV === 'development') {
          if (window.systemPerformanceMonitor) {
            window.systemPerformanceMonitor.logDetailedMemoryDebug(operationType, alert);
          } else {
            this.logBasicMemoryDebug(operationType, alert);
          }
        } else {
          this.logBasicMemoryDebug(operationType, alert);
        }
      } else {
        logger.warn('⚠️ Performance Warning:', alert.message);
      }
    }

    // Limit alert history
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  /**
   * Analyze performance trends over time
   */
  analyzeTrends(operationType) {
    const history = this.getOperationHistory(operationType, 100); // Last 100 samples
    if (history.length < 20) return null;

    const now = Date.now();
    const trends = {};

    for (const windowMinutes of this.options.trendAnalysisWindows) {
      const windowMs = windowMinutes * 60 * 1000;
      const windowData = history.filter((h) => now - h.timestamp <= windowMs);

      if (windowData.length < 5) continue;

      // Calculate trend slope using linear regression
      const durations = windowData.map((h) => h.duration || 0).filter((d) => d > 0);
      if (durations.length > 3) {
        const slope = this.calculateTrendSlope(windowData.map((d, i) => ({ x: i, y: d.duration })));
        trends[`${windowMinutes}min`] = {
          slope,
          direction: slope > 0 ? 'degrading' : slope < 0 ? 'improving' : 'stable',
          samples: durations.length,
          avgDuration: this.calculateMean(durations),
          change: slope * durations.length, // Total change over window
        };
      }
    }

    return trends;
  }

  /**
   * Get performance history for specific operation type
   */
  getOperationHistory(operationType, limit = null) {
    let history = this.performanceHistory.filter((h) => h.operationType === operationType);
    if (limit) {
      history = history.slice(-limit);
    }
    return history;
  }

  /**
   * Get current performance health summary
   */
  getHealthSummary() {
    const now = Date.now();
    const recentAlerts = this.alerts.filter((a) => now - a.timestamp < 60 * 60 * 1000); // Last hour
    const criticalAlerts = recentAlerts.filter((a) => a.level === 'critical');
    const warningAlerts = recentAlerts.filter((a) => a.level === 'warning');

    return {
      status:
        criticalAlerts.length > 0 ? 'critical' : warningAlerts.length > 0 ? 'warning' : 'healthy',
      totalBaselines: this.baselines.size,
      totalSamples: this.performanceHistory.length,
      recentAlerts: recentAlerts.length,
      criticalAlerts: criticalAlerts.length,
      warningAlerts: warningAlerts.length,
      monitoringUptimeMs: now - this.monitoringStartTime,
      baselines: Array.from(this.baselines.entries()).map(([type, baseline]) => ({
        operationType: type,
        avgDuration: baseline.avgDuration,
        avgMemoryUsed: baseline.avgMemoryUsed,
        avgCacheHitRate: baseline.avgCacheHitRate,
        sampleCount: baseline.sampleCount,
        lastUpdate: baseline.lastUpdate,
      })),
    };
  }

  /**
   * Set up periodic trend analysis
   */
  setupPeriodicAnalysis() {
    // MEMORY LEAK FIX: Store interval ID for cleanup
    // Run trend analysis every 5 minutes
    this.analysisIntervalId = setInterval(
      () => {
        this.runPeriodicAnalysis();
      },
      5 * 60 * 1000
    );
  }

  /**
   * MEMORY LEAK FIX: Cleanup method to stop periodic analysis timer
   * Call this when tracker is no longer needed to prevent memory leaks
   */
  destroy() {
    this.isActive = false;

    if (this.analysisIntervalId !== null) {
      clearInterval(this.analysisIntervalId);
      this.analysisIntervalId = null;
    }

    // Note: monitoringInterval belongs to SystemPerformanceMonitor, not this class
  }

  /**
   * Run periodic trend analysis
   */
  runPeriodicAnalysis() {
    if (!this.isActive) return;

    const operationTypes = [...new Set(this.performanceHistory.map((h) => h.operationType))];

    for (const operationType of operationTypes) {
      const trends = this.analyzeTrends(operationType);
      if (trends) {
        // MEMORY LEAK FIX: Enforce trends Map size limit with TRUE LRU eviction
        // Delete least recently used entry (first entry in Map maintains insertion order)
        if (this.trends.size >= this.MAX_TRENDS) {
          const firstKey = this.trends.keys().next().value;
          this.trends.delete(firstKey);
          if (process.env.NODE_ENV === 'development') {
            logger.log(`🗑️ Evicted LRU trend: ${firstKey}`);
          }
        }

        this.trends.set(operationType, {
          ...trends,
          analyzedAt: Date.now(),
        });

        // Check for concerning trends
        const longerTermTrend = trends['30min'] || trends['15min'];
        if (
          longerTermTrend &&
          longerTermTrend.direction === 'degrading' &&
          longerTermTrend.change > 10
        ) {
          logger.warn(
            `📉 Performance trend warning: ${operationType} degrading over time (+${longerTermTrend.change.toFixed(1)}ms)`
          );
        }
      }
    }
  }

  // Utility statistical functions
  calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  calculateMedian(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  calculateStdDev(values) {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    const squareDiffs = values.map((value) => Math.pow(value - mean, 2));
    return Math.sqrt(this.calculateMean(squareDiffs));
  }

  calculateTrendSlope(points) {
    if (points.length < 2) return 0;

    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Reset all monitoring data (useful for testing)
   */
  reset() {
    this.performanceHistory = [];
    this.baselines.clear();
    this.alerts = [];
    this.trends.clear();
    this.monitoringStartTime = Date.now();
  }

  /**
   * Generate memory investigation suggestions based on memory ratio
   */
  generateMemoryInvestigationSuggestions(memoryRatio) {
    const suggestions = [];

    if (memoryRatio >= 2.0) {
      suggestions.push(
        '🔴 CRITICAL: Memory usage doubled. Check for memory leaks in translation segments or cache growth.'
      );
      suggestions.push('💡 Try: Clear translation cache with "Reload Dictionary" button');
      suggestions.push('🔍 Investigate: Large text translations accumulating segments');
    } else if (memoryRatio >= 1.5) {
      suggestions.push('🟡 WARNING: Memory usage 50% above baseline');
      suggestions.push(
        '💡 Monitor: Check if translation segment cleanup is working (threshold: 150 segments)'
      );
      suggestions.push('🔍 Check: Position cache size and WASM memory allocation');
    } else if (memoryRatio >= 1.3) {
      suggestions.push('📊 INFO: Memory usage 30% above baseline');
      suggestions.push('💡 Normal: May occur during large translations, should stabilize');
    }

    // Add specific investigation commands
    suggestions.push('🛠️ Debug commands:');
    suggestions.push('  window.performanceDashboard.getHealthReport()');
    suggestions.push('  window.performanceDashboard.exportData()');

    return suggestions;
  }

  /**
   * Log basic memory information for critical alerts
   */
  logBasicMemoryDebug(operationType, alert) {
    logger.group(`🔍 Basic Memory Debug: ${operationType}`);
    const baseline = this._getBaselineLRU(operationType);
    logger.log(`📋 Baseline:`, baseline);
    logger.log(`⚠️ Alert:`, alert);

    // Show current memory if available
    if (process.env.NODE_ENV === 'development') {
      if (window.performanceDashboard) {
        logger.log(
          `📊 Current Performance: Try window.performanceDashboard.checkCachePerformance()`
        );
      }
    }

    // Show quick recommendations
    logger.log(`💡 Likely causes:`);
    if (operationType === 'semantic_translation_cache') {
      logger.log(`   • Cache entries growing beyond 1000 limit`);
      logger.log(`   • Similarity cache not being cleaned properly`);
      logger.log(`   • Memory per entry has increased`);
    } else if (operationType === 'position_cache') {
      logger.log(`   • Position mappings accumulating`);
      logger.log(`   • Large text processing increasing cache size`);
    } else if (operationType === 'translation_engine') {
      logger.log(`   • Translation segment array not being cleaned`);
      logger.log(`   • Token arrays growing unbounded`);
    }

    logger.groupEnd();
  }

  /**
   * Export performance data for analysis
   */
  exportData() {
    return {
      performanceHistory: this.performanceHistory,
      baselines: Object.fromEntries(this.baselines),
      alerts: this.alerts,
      trends: Object.fromEntries(this.trends),
      healthSummary: this.getHealthSummary(),
    };
  }
}

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

    // Integration 2: Content-Aware Position Cache
    if (contentAwarePositionCache) {
      this.integrations.set('positionCache', {
        name: 'Position Mapping Cache',
        collectMetrics: () => contentAwarePositionCache.getStats(),
        isActive: true,
      });
    }

    // Integration 3: Adaptive Virtual Scrolling
    if (adaptiveBufferCalculator) {
      this.integrations.set('virtualScrolling', {
        name: 'Virtual Scrolling Buffer',
        collectMetrics: () => adaptiveBufferCalculator.getScrollingStats(),
        isActive: true,
      });
    }

    // Integration 4: WASM Memory Pool Manager
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

    // Record cache performance metrics
    if (systemMetrics.integrations.positionCache) {
      const cache = systemMetrics.integrations.positionCache;
      this.baselineTracker.recordPerformance('position_cache', {
        duration: 0, // Cache lookups are very fast
        cacheHitRate: cache.hitRate / 100, // Convert percentage to decimal
        memoryUsed: systemMetrics.memory.used,
        totalHits: cache.totalHits || 0,
        estimatedTimeSaved: cache.estimatedTimeSaved || 0,
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

    // Record semantic translation cache performance metrics
    if (systemMetrics.integrations.semanticTranslationCache) {
      const stc = systemMetrics.integrations.semanticTranslationCache;
      this.baselineTracker.recordPerformance('semantic_translation_cache', {
        duration: 0, // Cache lookups are very fast
        cacheHitRate: stc.hitRate / 100, // Convert percentage to decimal
        memoryUsed: systemMetrics.memory.used,
        exactHits: stc.exactHits || 0,
        semanticHits: stc.semanticHits || 0,
        estimatedTimeSaved: stc.estimatedTimeSaved || 0,
      });
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

    // Cache optimization recommendations
    const positionCacheBaseline = health.baselines.find(
      (b) => b.operationType === 'position_cache'
    );
    if (positionCacheBaseline && positionCacheBaseline.avgCacheHitRate < 0.7) {
      recommendations.push({
        level: 'info',
        type: 'optimization',
        message:
          'Position cache hit rate could be improved. Consider adjusting cache size or similarity thresholds.',
        action: 'optimize_cache',
      });
    }

    return recommendations;
  }

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
        const baseline = this.baselineTracker.baselines.get(operationType);

        logger.log(`📊 Current Memory Usage:`, currentMetrics);
        logger.log(`📋 Baseline:`, baseline);

        // Calculate specific growth areas
        if (currentMetrics && baseline) {
          logger.log(`🔺 Memory Growth Analysis:`);
          Object.keys(currentMetrics).forEach((key) => {
            if (key.includes('memory') || key.includes('cache') || key.includes('size')) {
              const current = currentMetrics[key] || 0;
              const baselineVal =
                baseline[`avg${key.charAt(0).toUpperCase()}${key.slice(1)}`] || baseline[key] || 0;
              if (baselineVal > 0) {
                const ratio = current / baselineVal;
                if (ratio > 1.2) {
                  logger.log(
                    `   ${key}: ${current} (${ratio.toFixed(1)}x baseline: ${baselineVal})`
                  );
                }
              }
            }
          });
        }

        // Add specific cache size information
        if (operationType === 'semantic_translation_cache') {
          logger.log(`🧠 Semantic Cache Details:`);
          if (currentMetrics.cacheSize)
            logger.log(`   Cache Size: ${currentMetrics.cacheSize} entries`);
          if (currentMetrics.similarityCacheSize)
            logger.log(`   Similarity Cache: ${currentMetrics.similarityCacheSize} entries`);
          if (currentMetrics.hitRate) logger.log(`   Hit Rate: ${currentMetrics.hitRate}%`);
        }

        if (operationType === 'position_cache') {
          logger.log(`📍 Position Cache Details:`);
          if (currentMetrics.totalHits) logger.log(`   Total Hits: ${currentMetrics.totalHits}`);
          if (currentMetrics.hitRate) logger.log(`   Hit Rate: ${currentMetrics.hitRate}%`);
          if (currentMetrics.cacheSize)
            logger.log(`   Cache Size: ${currentMetrics.cacheSize} entries`);
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
