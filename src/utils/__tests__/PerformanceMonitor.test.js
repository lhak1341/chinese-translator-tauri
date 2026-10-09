import { describe, it, expect, beforeEach } from 'vitest';
import { globalPerformanceMonitor } from '../performance/PerformanceMonitor';

describe('PerformanceMonitor.record', () => {
  beforeEach(() => {
    globalPerformanceMonitor.reset();
  });

  it('keeps a running mean, min and max of the durations it is given', () => {
    globalPerformanceMonitor.record(100);
    globalPerformanceMonitor.record(300);

    const metrics = globalPerformanceMonitor.getMetrics();
    expect(metrics.totalOperations).toBe(2);
    expect(metrics.avgTime).toBe(200);
    expect(metrics.minTime).toBe(100);
    expect(metrics.maxTime).toBe(300);
  });

  it('reports zeros before anything is recorded and after a reset', () => {
    expect(globalPerformanceMonitor.getMetrics()).toMatchObject({
      avgTime: 0,
      totalOperations: 0,
      minTime: 0,
      maxTime: 0,
    });

    globalPerformanceMonitor.record(40);
    globalPerformanceMonitor.reset();

    expect(globalPerformanceMonitor.getMetrics()).toMatchObject({
      avgTime: 0,
      totalOperations: 0,
      minTime: 0,
      maxTime: 0,
    });
  });
});
