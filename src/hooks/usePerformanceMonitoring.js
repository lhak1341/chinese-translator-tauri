import { useState, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';
import { globalPerformanceMonitor } from '../utils/performance/PerformanceMonitor';
import { systemPerformanceMonitor } from '../utils/performance/ProactivePerformanceDetector';

/**
 * @import { PerformanceMetrics, RegressionHealth } from '../types/PerformanceTypes'
 */

/**
 * Performance monitoring hook
 *
 * Manages performance statistics and regression detection health status.
 * Completely independent with no timing dependencies on other hooks.
 *
 * @returns {{
 *   performanceStats: PerformanceMetrics,
 *   regressionHealth: RegressionHealth,
 *   updatePerformanceStats: (operationTimeMs: number) => void,
 *   updateCacheHitRate: (translationSegmentCache: any) => void
 * }} Performance monitoring state and update functions
 */
export function usePerformanceMonitoring() {
  // Simplified performance monitoring state
  const [performanceStats, setPerformanceStats] = useState({
    operations: 0,
    avgTime: 0,
    cacheHitRate: 0,
  });

  // Regression detection health state
  const [regressionHealth, setRegressionHealth] = useState({
    status: 'healthy', // 'healthy', 'warning', 'critical'
    criticalAlerts: 0,
    warningAlerts: 0,
    baselines: 0,
  });

  /**
   * Update performance stats after translation operation
   * @param {number} operationTimeMs - Duration of operation in milliseconds
   */
  const updatePerformanceStats = useCallback((operationTimeMs) => {
    // Use the optimized performance monitor (sampling-based)
    const timer = { startTime: performance.now() - operationTimeMs, sampled: true };
    globalPerformanceMonitor.endTimer(timer, 'translation');

    // Update simple UI stats (lightweight)
    const metrics = globalPerformanceMonitor.getMetrics();
    setPerformanceStats({
      operations: metrics.totalOperations,
      avgTime: metrics.avgTime || 0,
      cacheHitRate: 0, // Will be updated separately
    });
  }, []);

  /**
   * Update cache hit rate from translation cache stats
   * @param {Object} translationSegmentCache - Translation segment cache instance
   */
  const updateCacheHitRate = useCallback((translationSegmentCache) => {
    const cacheStats = translationSegmentCache.getStats();
    setPerformanceStats((prev) => ({
      ...prev,
      cacheHitRate: cacheStats.hitRate,
    }));
  }, []);

  // Monitor performance regression health status
  useEffect(() => {
    const updateRegressionHealth = () => {
      try {
        const healthReport = systemPerformanceMonitor.getSystemHealthReport();
        setRegressionHealth({
          status: healthReport.status,
          criticalAlerts: healthReport.criticalAlerts,
          warningAlerts: healthReport.warningAlerts,
          baselines: healthReport.totalBaselines,
        });
      } catch (error) {
        logger.warn('Failed to update regression health:', error);
      }
    };

    // Update immediately
    updateRegressionHealth();

    // Set up periodic updates every 30 seconds
    const interval = setInterval(updateRegressionHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    performanceStats,
    regressionHealth,
    updatePerformanceStats,
    updateCacheHitRate,
  };
}
