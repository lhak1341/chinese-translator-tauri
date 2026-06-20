import { useState, useCallback } from 'react';
import { performanceHealth } from '../utils/performance';

/**
 * @import { PerformanceMetrics, RegressionHealth } from '../types/PerformanceTypes'
 */

/**
 * Performance monitoring hook.
 *
 * Returns a single unified report from performanceHealth.getReport() so all
 * fields are always consistent — no callback can update regressionHealth while
 * leaving performanceStats stale (the bug in the prior split-state design).
 *
 * @returns {{
 *   report: PerformanceMetrics & RegressionHealth,
 *   recordTranslation: (operationTimeMs: number) => void,
 *   refreshCacheStats: () => void
 * }}
 */
export function usePerformanceMonitoring() {
  const [report, setReport] = useState(() => performanceHealth.getReport());

  const recordTranslation = useCallback((operationTimeMs) => {
    performanceHealth.recordTranslation(operationTimeMs);
    setReport(performanceHealth.getReport());
  }, []);

  const refreshCacheStats = useCallback(() => {
    setReport(performanceHealth.getReport());
  }, []);

  return { report, recordTranslation, refreshCacheStats };
}
