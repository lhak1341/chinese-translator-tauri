import { describe, test, expect, beforeEach } from 'vitest';
import { adaptiveBufferCalculator } from '../ui/AdaptiveVirtualScrolling.js';

// Only a singleton is exported (no class export) — reset its mutable state between tests
// instead of constructing a fresh instance (see CLAUDE.md singleton-testing gotcha).
beforeEach(() => {
  adaptiveBufferCalculator.clearCache();
});

describe('adaptiveBufferCalculator.calculateOptimalBufferSize', () => {
  test('returns a buffer size within the configured min/max bounds', async () => {
    const bufferSize = await adaptiveBufferCalculator.calculateOptimalBufferSize({
      containerHeight: 600,
      itemHeight: 40,
      totalItems: 1000,
    });

    expect(Number.isInteger(bufferSize)).toBe(true);
    expect(bufferSize).toBeGreaterThanOrEqual(adaptiveBufferCalculator.minBufferSize);
    expect(bufferSize).toBeLessThanOrEqual(adaptiveBufferCalculator.maxBufferSize);
  });

  test('caches the result for the same context (second call is a cache hit)', async () => {
    const context = { containerHeight: 600, itemHeight: 40, totalItems: 500 };
    const first = await adaptiveBufferCalculator.calculateOptimalBufferSize(context);
    const cacheKey = `600:40:500:0`;
    expect(adaptiveBufferCalculator.calculationCache[cacheKey]).toBeDefined();

    const second = await adaptiveBufferCalculator.calculateOptimalBufferSize(context);
    expect(second).toBe(first);
  });

  test('fast scrolling never decreases the buffer size relative to the same context at rest', async () => {
    const base = { containerHeight: 600, itemHeight: 40, totalItems: 1000 };
    const atRest = await adaptiveBufferCalculator.calculateOptimalBufferSize(base);

    adaptiveBufferCalculator.clearCache();
    const whileScrollingFast = await adaptiveBufferCalculator.calculateOptimalBufferSize({
      ...base,
      isScrolling: true,
      scrollVelocity: 5000,
    });

    expect(whileScrollingFast).toBeGreaterThanOrEqual(atRest);
  });

  test('very large lists never produce a larger buffer than very small lists, all else equal', async () => {
    const small = await adaptiveBufferCalculator.calculateOptimalBufferSize({
      containerHeight: 600,
      itemHeight: 40,
      totalItems: 50,
    });

    adaptiveBufferCalculator.clearCache();
    const large = await adaptiveBufferCalculator.calculateOptimalBufferSize({
      containerHeight: 600,
      itemHeight: 40,
      totalItems: 50000,
    });

    expect(large).toBeLessThanOrEqual(small);
  });
});

describe('adaptiveBufferCalculator.trackScrollingMetrics / getScrollingStats', () => {
  test('returns null when no metrics have been tracked', () => {
    expect(adaptiveBufferCalculator.getScrollingStats()).toBeNull();
  });

  test('aggregates the most recent 10 tracked measurements', () => {
    for (let i = 1; i <= 15; i++) {
      adaptiveBufferCalculator.trackScrollingMetrics({ frameTime: i, scrollVelocity: i * 10 });
    }

    const stats = adaptiveBufferCalculator.getScrollingStats();
    expect(stats.measurementCount).toBe(15);
    // Average of frameTime for the last 10 tracked (6..15) = 10.5
    expect(stats.averageFrameTime).toBeCloseTo(10.5, 5);
  });

  test('clearCache also resets scrolling history', () => {
    adaptiveBufferCalculator.trackScrollingMetrics({ frameTime: 10, scrollVelocity: 100 });
    adaptiveBufferCalculator.clearCache();
    expect(adaptiveBufferCalculator.getScrollingStats()).toBeNull();
  });
});
