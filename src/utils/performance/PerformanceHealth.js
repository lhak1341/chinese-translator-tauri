// @ts-check
/**
 * Unified read facade for system performance health.
 *
 * Answers "is the system healthy right now?" in one call by combining
 * globalPerformanceMonitor (timing metrics) and systemPerformanceMonitor
 * (baseline regression tracking). Callers no longer need to know which
 * singleton owns which concern.
 *
 * Designed to be called at action time (after translate / after reload),
 * not on a polling interval — health is most meaningful right after the
 * system does work.
 *
 * See: docs/adr/ADR-009-wasm-processor-lifecycle.md for context on the
 * broader performance monitoring architecture.
 */

import { globalPerformanceMonitor } from './PerformanceMonitor';
import { systemPerformanceMonitor } from './ProactivePerformanceDetector';

/** @typedef {'ok'|'degraded'|'critical'} HealthVerdict */

/**
 * @typedef {{
 *   operations: number,
 *   avgTime: number,
 *   cacheHitRate: number,
 *   status: string,
 *   criticalAlerts: number,
 *   warningAlerts: number,
 *   baselines: number,
 *   verdict: HealthVerdict
 * }} HealthReport
 */

class PerformanceHealth {
  /**
   * Build a unified health report from both monitoring singletons.
   *
   * @param {number} [cacheHitRate=0] - Current cache hit rate (0–100). Pass the
   *   value from translationSegmentCache.getStats().hitRate. Kept separate because
   *   the cache lives outside the performance monitoring singletons.
   * @returns {HealthReport}
   */
  getReport(cacheHitRate = 0) {
    const metrics = globalPerformanceMonitor.getMetrics();

    let status = 'healthy';
    let criticalAlerts = 0;
    let warningAlerts = 0;
    let baselines = 0;

    try {
      const health = systemPerformanceMonitor.getSystemHealthReport();
      status = health.status ?? 'healthy';
      criticalAlerts = health.criticalAlerts ?? 0;
      warningAlerts = health.warningAlerts ?? 0;
      baselines = health.totalBaselines ?? 0;
    } catch (_) {
      // systemPerformanceMonitor may not be initialized in test environments
    }

    return {
      operations: metrics.totalOperations ?? 0,
      avgTime: metrics.avgTime ?? 0,
      cacheHitRate,
      status,
      criticalAlerts,
      warningAlerts,
      baselines,
      verdict: this._toVerdict(status),
    };
  }

  /**
   * @param {string} status
   * @returns {HealthVerdict}
   */
  _toVerdict(status) {
    if (status === 'critical') return 'critical';
    if (status === 'warning') return 'degraded';
    return 'ok';
  }
}

export const performanceHealth = new PerformanceHealth();
