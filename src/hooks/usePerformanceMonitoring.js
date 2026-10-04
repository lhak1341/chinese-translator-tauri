import { useState, useCallback } from 'react';
import { globalPerformanceMonitor } from '../utils/performance/PerformanceMonitor';

/**
 * Average translation time for the stats chip.
 *
 * Records each completed translation into globalPerformanceMonitor and reads its running mean
 * back. There is no regression detector behind this (ADR-069): the status dot it used to drive
 * could only fire through a baseline taken from a flat cumulative mean.
 *
 * @returns {{
 *   avgTime: number,
 *   recordTranslation: (operationTimeMs: number) => void
 * }}
 */
export function usePerformanceMonitoring() {
  const [avgTime, setAvgTime] = useState(() => globalPerformanceMonitor.getMetrics().avgTime ?? 0);

  const recordTranslation = useCallback((operationTimeMs) => {
    globalPerformanceMonitor.record(operationTimeMs, 'translation');
    setAvgTime(globalPerformanceMonitor.getMetrics().avgTime ?? 0);
  }, []);

  return { avgTime, recordTranslation };
}
