import { useState, useCallback, useRef } from 'react';
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
 *   updatePerformanceStats: (operationTimeMs: number) => void,
 *   updateCacheHitRate: (translationSegmentCache: any) => void
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

  // Ref tracks current cache hit rate so updatePerformanceStats (which doesn't
  // receive it) can still pass a non-stale value to getReport().
  const cacheHitRateRef = useRef(0);

  const updatePerformanceStats = useCallback((operationTimeMs) => {
    performanceHealth.recordTranslation(operationTimeMs);

    const report = performanceHealth.getReport(cacheHitRateRef.current);
    setPerformanceStats({
      operations: report.operations,
      avgTime: report.avgTime,
      cacheHitRate: cacheHitRateRef.current,
    });
    setRegressionHealth({
      status: report.status,
      criticalAlerts: report.criticalAlerts,
      warningAlerts: report.warningAlerts,
      baselines: report.baselines,
    });
  }, []);

  const updateCacheHitRate = useCallback((translationSegmentCache) => {
    const hitRate = translationSegmentCache.getStats().hitRate;
    cacheHitRateRef.current = hitRate;

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
    updatePerformanceStats,
    updateCacheHitRate,
  };
}
