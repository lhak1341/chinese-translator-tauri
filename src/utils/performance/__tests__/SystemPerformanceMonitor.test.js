import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SystemPerformanceMonitor } from '../SystemPerformanceMonitor.js';

function mockMemory(usedRatio) {
  const limit = 1_000_000;
  Object.defineProperty(performance, 'memory', {
    configurable: true,
    value: {
      usedJSHeapSize: usedRatio * limit,
      totalJSHeapSize: limit,
      jsHeapSizeLimit: limit,
    },
  });
}

describe('SystemPerformanceMonitor.classifyMemoryPressure', () => {
  test.each([
    [0, 'HEALTHY'],
    [0.49, 'HEALTHY'],
    [0.5, 'WATCH'],
    [0.64, 'WATCH'],
    [0.65, 'ELEVATED'],
    [0.79, 'ELEVATED'],
    [0.8, 'CRITICAL'],
    [1, 'CRITICAL'],
  ])('ratio %p classifies as %p', (ratio, expected) => {
    expect(SystemPerformanceMonitor.classifyMemoryPressure(ratio)).toBe(expected);
  });
});

describe('checkRealMemory / generateRecommendations agree at the CRITICAL boundary', () => {
  let monitor;

  beforeEach(() => {
    monitor = new SystemPerformanceMonitor();
    monitor.stopMonitoring();
  });

  afterEach(() => {
    monitor.destroy();
    delete performance.memory;
    vi.restoreAllMocks();
  });

  test('checkRealMemory reports CRITICAL at exactly the same ratio generateRecommendations warns on', () => {
    mockMemory(0.8);

    const result = monitor.checkRealMemory();
    expect(result.status).toBe('CRITICAL');

    const recommendations = monitor.generateRecommendations(
      { criticalAlerts: 0 },
      { memory: monitor.getMemoryMetrics() }
    );
    expect(recommendations.some((r) => r.type === 'memory')).toBe(true);
  });

  test('just under CRITICAL, neither flags a problem', () => {
    mockMemory(0.79);

    const result = monitor.checkRealMemory();
    expect(result.status).toBe('ELEVATED');

    const recommendations = monitor.generateRecommendations(
      { criticalAlerts: 0 },
      { memory: monitor.getMemoryMetrics() }
    );
    expect(recommendations.some((r) => r.type === 'memory')).toBe(false);
  });

  test('checkRealMemory returns null when performance.memory is unavailable', () => {
    delete performance.memory;
    expect(monitor.checkRealMemory()).toBeNull();
  });
});
