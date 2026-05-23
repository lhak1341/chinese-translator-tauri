import { useState, useCallback } from 'react';
import { performanceHealth } from '../utils/performance';

/**
 * @import { PerformanceMetrics, RegressionHealth } from '../types/PerformanceTypes'
 */

/**
 * Performance monitoring hook
 *
 * Manages performance statistics and regression detection health status.
 * Health is assessed at action time (after translate / after reload) rather
 * than on a polling interval — health is most meaningful right after work
 * is done. Uses performanceHealth.getReport() as the single read path.
 *
 * @returns {{
 *   performanceStats: PerformanceMetrics,
 *   regressionHealth: RegressionHealth,
 *   recordTranslation: (operationTimeMs: number, translationSegmentCache: any) => void,
 *   refreshCacheStats: (translationSegmentCache: any) => void
 * }} Performance monitoring state and update functions
 */
export function usePerformanceMonitoring() {
  const initialReport = performanceHealth.getReport(0);

  const [performanceStats, setPerformanceStats] = useState({
    operations: initialReport.operations,
    avgTime: initialReport.avgTime,
    cacheHitRate: 0,
  });

  const [regressionHealth, setRegressionHealth] = useState({
    status: initialReport.status,
    criticalAlerts: initialReport.criticalAlerts,
    warningAlerts: initialReport.warningAlerts,
    baselines: initialReport.baselines,
  });

  const recordTranslation = useCallback((operationTimeMs, translationSegmentCache) => {
    performanceHealth.recordTranslation(operationTimeMs);
    const hitRate = translationSegmentCache.getStats().hitRate;
    const report = performanceHealth.getReport(hitRate);
    setPerformanceStats({
      operations: report.operations,
      avgTime: report.avgTime,
      cacheHitRate: hitRate,
    });
    setRegressionHealth({
      status: report.status,
      criticalAlerts: report.criticalAlerts,
      warningAlerts: report.warningAlerts,
      baselines: report.baselines,
    });
  }, []);

  const refreshCacheStats = useCallback((translationSegmentCache) => {
    const hitRate = translationSegmentCache.getStats().hitRate;
    const report = performanceHealth.getReport(hitRate);
    setPerformanceStats((prev) => ({ ...prev, cacheHitRate: hitRate }));
    setRegressionHealth({
      status: report.status,
      criticalAlerts: report.criticalAlerts,
      warningAlerts: report.warningAlerts,
      baselines: report.baselines,
    });
  }, []);

  return {
    performanceStats,
    regressionHealth,
    recordTranslation,
    refreshCacheStats,
  };
}
