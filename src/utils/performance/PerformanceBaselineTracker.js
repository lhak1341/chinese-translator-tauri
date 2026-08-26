/**
 * Performance Baseline Tracker
 *
 * Tracks performance history, establishes baselines, detects regressions via
 * immediate alert checks, and runs periodic trend analysis for all monitored
 * operation types.
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

import { logger } from '../logger';

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
   * Public accessor for a single baseline — replaces reaching directly into
   * `.baselines` (a Map) from outside this class.
   */
  getBaseline(operationType) {
    return this._getBaselineLRU(operationType);
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

    // MEDIUM-3 FIX: Use immutable constant instead of mutable option
    // Prevents unbounded growth if maxHistorySize changes at runtime
    const MAX_PERFORMANCE_HISTORY = 1000;

    // Maintain history size - check BEFORE push to prevent unbounded growth
    if (this.performanceHistory.length >= MAX_PERFORMANCE_HISTORY) {
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

    // Update baseline with exponential moving average
    if (recentDurations.length > 0) {
      const newAvgDuration = this.calculateMean(recentDurations);
      baseline.avgDuration = baseline.avgDuration * (1 - alpha) + newAvgDuration * alpha;
    }

    if (recentMemoryUsages.length > 0) {
      const newAvgMemory = this.calculateMean(recentMemoryUsages);
      baseline.avgMemoryUsed = baseline.avgMemoryUsed * (1 - alpha) + newAvgMemory * alpha;
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

        // ENHANCED DEBUG: owner injects onCriticalAlert (dev-only) for the detailed
        // breakdown; falls back to the basic debug log when no callback was injected.
        if (this.options.onCriticalAlert) {
          this.options.onCriticalAlert(alert);
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
        sampleCount: baseline.sampleCount,
        lastUpdate: baseline.lastUpdate,
      })),
    };
  }

  /**
   * Cheap status-only read — no baselines array build, no sample counting.
   * For callers that only need the health status (e.g. the per-translation hot path).
   */
  getStatusSummary() {
    const now = Date.now();
    const recentAlerts = this.alerts.filter((a) => now - a.timestamp < 60 * 60 * 1000); // Last hour
    const criticalAlerts = recentAlerts.filter((a) => a.level === 'critical');
    const warningAlerts = recentAlerts.filter((a) => a.level === 'warning');

    return {
      status:
        criticalAlerts.length > 0 ? 'critical' : warningAlerts.length > 0 ? 'warning' : 'healthy',
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
    if (operationType === 'translation_engine') {
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
