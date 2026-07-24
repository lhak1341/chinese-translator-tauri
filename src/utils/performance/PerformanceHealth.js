// @ts-check
/**
 * Unified gateway for performance monitoring concerns.
 *
 * Write: recordTranslation(ms) — records a completed translation into globalPerformanceMonitor.
 * Read:  getReport() — the hot-path status read, called on every translation. Returns only
 *        {status, avgTime} — the fields TranslatorControls/App.jsx actually consume.
 *        getDebugReport() — the wider report (alerts, baselines, WASM status, verdict) for
 *        DevConsole/debug use. Not called on the hot path — computing it builds a baselines
 *        array every call.
 *
 * Callers import only this module — no need to know which singleton owns which concern.
 * Designed to be called at action time (after translate / after reload).
 *
 * See: docs/adr/ADR-009-wasm-processor-lifecycle.md for context on the
 * broader performance monitoring architecture.
 */

import { globalPerformanceMonitor } from './PerformanceMonitor';
import { systemPerformanceMonitor } from './SystemPerformanceMonitor';
import {
  isWasmPatternProcessorAvailable,
  hasWasmPatternProcessorFailed,
} from '../wasm/WasmPatternProcessor';

/** @typedef {'ok'|'degraded'|'critical'} HealthVerdict */

/**
 * @typedef {{ available: boolean, failed: boolean }} WasmProcessorStatus
 * @typedef {{
 *   pattern: WasmProcessorStatus,
 *   anyFailed: boolean,
 *   allAvailable: boolean
 * }} WasmStatus
 */

/**
 * @typedef {{
 *   status: string,
 *   avgTime: number
 * }} HealthReport
 */

/**
 * @typedef {{
 *   operations: number,
 *   status: string,
 *   criticalAlerts: number,
 *   warningAlerts: number,
 *   baselines: number,
 *   verdict: HealthVerdict,
 *   wasm: WasmStatus
 * }} DebugHealthReport
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
   * Cheap status + timing read. Called on every translation — must not build
   * the baselines array or touch anything not read by a real caller.
   *
   * @returns {HealthReport}
   */
  getReport() {
    const metrics = globalPerformanceMonitor.getMetrics();

    let status = 'healthy';
    try {
      status = systemPerformanceMonitor.getStatus().status ?? 'healthy';
    } catch {
      // systemPerformanceMonitor may not be initialized in test environments
    }

    return {
      status,
      avgTime: metrics.avgTime ?? 0,
    };
  }

  /**
   * Full health report — alerts, baselines, WASM status, verdict. For
   * DevConsole/debug use only; not called on the translation hot path.
   *
   * @returns {DebugHealthReport}
   */
  getDebugReport() {
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
    } catch {
      // systemPerformanceMonitor may not be initialized in test environments
    }

    const patternAvailable = isWasmPatternProcessorAvailable();
    const patternFailed = hasWasmPatternProcessorFailed();

    /** @type {WasmStatus} */
    const wasm = {
      pattern: { available: patternAvailable, failed: patternFailed },
      anyFailed: patternFailed,
      allAvailable: patternAvailable,
    };

    return {
      operations: metrics.totalOperations ?? 0,
      status,
      criticalAlerts,
      warningAlerts,
      baselines,
      verdict: this._toVerdict(status),
      wasm,
    };
  }

  /**
   * @param {number} [intervalMs]
   */
  startMonitoring(intervalMs = 30000) {
    systemPerformanceMonitor.startMonitoring(intervalMs);
  }

  destroy() {
    systemPerformanceMonitor.destroy();
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
