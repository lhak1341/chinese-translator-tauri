import { useState, useCallback } from 'react';
import { performanceHealth } from '../utils/performance';

/**
 * @import { HealthReport } from '../utils/performance/PerformanceHealth'
 */

/**
 * Performance monitoring hook.
 *
 * Returns a single unified report from performanceHealth.getReport() so all
 * fields are always consistent — no callback can update regressionHealth while
 * leaving performanceStats stale (the bug in the prior split-state design).
 *
 * @returns {{
 *   report: HealthReport,
 *   recordTranslation: (operationTimeMs: number) => void,
 *   refreshReport: () => void
 * }}
 */
export function usePerformanceMonitoring() {
  const [report, setReport] = useState(() => performanceHealth.getReport());

  const recordTranslation = useCallback((operationTimeMs) => {
    performanceHealth.recordTranslation(operationTimeMs);
    setReport(performanceHealth.getReport());
  }, []);

  const refreshReport = useCallback(() => {
    setReport(performanceHealth.getReport());
  }, []);

  return { report, recordTranslation, refreshReport };
}
