import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../performance/PerformanceMonitor', () => ({
  globalPerformanceMonitor: {
    getMetrics: vi.fn(() => ({ totalOperations: 0, avgTime: 0 })),
    endTimer: vi.fn(),
  },
}));

vi.mock('../performance/SystemPerformanceMonitor', () => ({
  systemPerformanceMonitor: {
    getSystemHealthReport: vi.fn(),
    startMonitoring: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock('../wasm/WasmPatternProcessor', () => ({
  isWasmPatternProcessorAvailable: vi.fn(() => true),
  hasWasmPatternProcessorFailed: vi.fn(() => false),
}));

import { performanceHealth } from '../performance/PerformanceHealth';
import { globalPerformanceMonitor } from '../performance/PerformanceMonitor';
import { systemPerformanceMonitor } from '../performance/SystemPerformanceMonitor';
import {
  isWasmPatternProcessorAvailable,
  hasWasmPatternProcessorFailed,
} from '../wasm/WasmPatternProcessor';

describe('PerformanceHealth.getReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globalPerformanceMonitor.getMetrics).mockReturnValue({
      totalOperations: 5,
      avgTime: 12,
    });
    vi.mocked(isWasmPatternProcessorAvailable).mockReturnValue(true);
    vi.mocked(hasWasmPatternProcessorFailed).mockReturnValue(false);
  });

  describe('verdict mapping', () => {
    test('maps status "healthy" to verdict "ok"', () => {
      vi.mocked(systemPerformanceMonitor.getSystemHealthReport).mockReturnValue({
        status: 'healthy',
        criticalAlerts: 0,
        warningAlerts: 0,
        totalBaselines: 1,
      });
      expect(performanceHealth.getReport().verdict).toBe('ok');
    });

    test('maps status "warning" to verdict "degraded"', () => {
      vi.mocked(systemPerformanceMonitor.getSystemHealthReport).mockReturnValue({
        status: 'warning',
        criticalAlerts: 0,
        warningAlerts: 2,
        totalBaselines: 1,
      });
      expect(performanceHealth.getReport().verdict).toBe('degraded');
    });

    test('maps status "critical" to verdict "critical"', () => {
      vi.mocked(systemPerformanceMonitor.getSystemHealthReport).mockReturnValue({
        status: 'critical',
        criticalAlerts: 3,
        warningAlerts: 1,
        totalBaselines: 1,
      });
      expect(performanceHealth.getReport().verdict).toBe('critical');
    });
  });

  describe('systemPerformanceMonitor throw-fallback', () => {
    test('defaults to healthy/0s and verdict "ok" when getSystemHealthReport throws', () => {
      vi.mocked(systemPerformanceMonitor.getSystemHealthReport).mockImplementation(() => {
        throw new Error('not initialized');
      });

      const report = performanceHealth.getReport();

      expect(report.status).toBe('healthy');
      expect(report.criticalAlerts).toBe(0);
      expect(report.warningAlerts).toBe(0);
      expect(report.baselines).toBe(0);
      expect(report.verdict).toBe('ok');
    });
  });

  describe('wasm status aggregation', () => {
    beforeEach(() => {
      vi.mocked(systemPerformanceMonitor.getSystemHealthReport).mockReturnValue({
        status: 'healthy',
        criticalAlerts: 0,
        warningAlerts: 0,
        totalBaselines: 0,
      });
    });

    test('reports pattern available and no failures', () => {
      vi.mocked(isWasmPatternProcessorAvailable).mockReturnValue(true);
      vi.mocked(hasWasmPatternProcessorFailed).mockReturnValue(false);

      const { wasm } = performanceHealth.getReport();

      expect(wasm).toEqual({
        pattern: { available: true, failed: false },
        anyFailed: false,
        allAvailable: true,
      });
    });

    test('reports anyFailed and allAvailable=false when pattern processor failed', () => {
      vi.mocked(isWasmPatternProcessorAvailable).mockReturnValue(false);
      vi.mocked(hasWasmPatternProcessorFailed).mockReturnValue(true);

      const { wasm } = performanceHealth.getReport();

      expect(wasm).toEqual({
        pattern: { available: false, failed: true },
        anyFailed: true,
        allAvailable: false,
      });
    });
  });

  describe('metrics passthrough', () => {
    test('carries operations and avgTime from globalPerformanceMonitor', () => {
      vi.mocked(systemPerformanceMonitor.getSystemHealthReport).mockReturnValue({
        status: 'healthy',
        criticalAlerts: 0,
        warningAlerts: 0,
        totalBaselines: 0,
      });
      vi.mocked(globalPerformanceMonitor.getMetrics).mockReturnValue({
        totalOperations: 42,
        avgTime: 7.5,
      });

      const report = performanceHealth.getReport();

      expect(report.operations).toBe(42);
      expect(report.avgTime).toBe(7.5);
    });
  });
});

describe('PerformanceHealth.recordTranslation', () => {
  test('ends a synthetic timer on globalPerformanceMonitor', () => {
    performanceHealth.recordTranslation(100);

    expect(globalPerformanceMonitor.endTimer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'translation', sampled: true }),
      'translation'
    );
  });
});
