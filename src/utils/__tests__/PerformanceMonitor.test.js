import { describe, it, expect, beforeEach } from 'vitest';
import { globalPerformanceMonitor } from '../performance/PerformanceMonitor';

describe('PerformanceMonitor.record', () => {
  beforeEach(() => {
    globalPerformanceMonitor.reset();
  });

  it('keeps a running mean, min and max of the durations it is given', () => {
    globalPerformanceMonitor.record(100, 'translation');
    globalPerformanceMonitor.record(300, 'translation');

    const metrics = globalPerformanceMonitor.getMetrics();
    expect(metrics.totalOperations).toBe(2);
    expect(metrics.avgTime).toBe(200);
    expect(metrics.minTime).toBe(100);
    expect(metrics.maxTime).toBe(300);
  });

  it('updates the stats on every call, whatever the sample rate', () => {
    const previous = globalPerformanceMonitor.sampleRate;
    globalPerformanceMonitor.sampleRate = 0;
    try {
      globalPerformanceMonitor.record(50);
      globalPerformanceMonitor.record(70);
      expect(globalPerformanceMonitor.getMetrics().totalOperations).toBe(2);
      expect(globalPerformanceMonitor.getMetrics().sampleCount).toBe(0);
    } finally {
      globalPerformanceMonitor.sampleRate = previous;
    }
  });

  it('bounds the stored samples', () => {
    const previousRate = globalPerformanceMonitor.sampleRate;
    const previousMax = globalPerformanceMonitor.maxSamples;
    globalPerformanceMonitor.sampleRate = 1;
    globalPerformanceMonitor.maxSamples = 3;
    try {
      for (let i = 0; i < 10; i++) globalPerformanceMonitor.record(i);
      expect(globalPerformanceMonitor.getMetrics().sampleCount).toBe(3);
    } finally {
      globalPerformanceMonitor.sampleRate = previousRate;
      globalPerformanceMonitor.maxSamples = previousMax;
    }
  });
});
