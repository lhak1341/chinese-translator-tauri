// @ts-check
/**
 * Unified gateway for performance monitoring concerns.
 *
 * Write: recordTranslation(ms) — records a completed translation into globalPerformanceMonitor.
 * Read:  getReport(cacheHitRate) — combines globalPerformanceMonitor (timing) and
 *        systemPerformanceMonitor (baseline regression) into one HealthReport.
 *
 * Callers import only this module — no need to know which singleton owns which concern.
 * Designed to be called at action time (after translate / after reload).
 *
 * See: docs/adr/ADR-009-wasm-processor-lifecycle.md for context on the
 * broader performance monitoring architecture.
 */

import { globalPerformanceMonitor } from './PerformanceMonitor';
import { systemPerformanceMonitor } from './ProactivePerformanceDetector';
import {
  isWasmPatternProcessorAvailable,
  hasWasmPatternProcessorFailed,
} from '../wasm/WasmPatternProcessor';
import { isWasmNumberProcessorAvailable } from '../wasm/WasmNumberProcessor';

/** @typedef {'ok'|'degraded'|'critical'} HealthVerdict */

/**
 * @typedef {{ available: boolean, failed: boolean }} WasmProcessorStatus
 * @typedef {{ available: boolean }} WasmNumberStatus
 * @typedef {{
 *   pattern: WasmProcessorStatus,
 *   number: WasmNumberStatus,
 *   anyFailed: boolean,
 *   allAvailable: boolean
 * }} WasmStatus
 */

/**
 * @typedef {{
 *   operations: number,
 *   avgTime: number,
 *   cacheHitRate: number,
 *   status: string,
 *   criticalAlerts: number,
 *   warningAlerts: number,
 *   baselines: number,
 *   verdict: HealthVerdict,
 *   wasm: WasmStatus
 * }} HealthReport
 */

class PerformanceHealth {
  /**
   * Record a completed translation into globalPerformanceMonitor.
   * Constructs the synthetic timer from operationTimeMs so callers don't
   * need to import globalPerformanceMonitor directly.
   *
   * @param {number} operationTimeMs - Translation duration in milliseconds
   */
  recordTranslation(operationTimeMs) {
    const timer = {
      id: 'translation',
      startTime: performance.now() - operationTimeMs,
      sampled: true,
    };
    globalPerformanceMonitor.endTimer(timer, 'translation');
  }

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

    const patternAvailable = isWasmPatternProcessorAvailable();
    const patternFailed = hasWasmPatternProcessorFailed();
    const numberAvailable = isWasmNumberProcessorAvailable();

    /** @type {WasmStatus} */
    const wasm = {
      pattern: { available: patternAvailable, failed: patternFailed },
      number: { available: numberAvailable },
      anyFailed: patternFailed,
      allAvailable: patternAvailable && numberAvailable,
    };

    return {
      operations: metrics.totalOperations ?? 0,
      avgTime: metrics.avgTime ?? 0,
      cacheHitRate,
      status,
      criticalAlerts,
      warningAlerts,
      baselines,
      verdict: this._toVerdict(status),
      wasm,
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
