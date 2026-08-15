import { describe, test, expect } from 'vitest';
import { calculateNextBatchSize, MIN_BATCH_SIZE } from '../text/AdaptiveBatchSizer';

function history(times: number[]) {
  return times.map((avgTimePerChunk) => ({ avgTimePerChunk }));
}

describe('calculateNextBatchSize', () => {
  test('keeps current size with fewer than 2 history entries', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10]),
      currentBatchSize: 4,
      performanceBaseline: null,
      batchIndex: 0,
    });

    expect(result.batchSize).toBe(4);
    expect(result.log).toBeNull();
  });

  test('derives baseline from the first history entry when none is provided yet', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 10]),
      currentBatchSize: 4,
      performanceBaseline: null,
      batchIndex: 2,
    });

    expect(result.performanceBaseline).toBe(10);
  });

  test('shrinks toward the minimum on severe, sustained degradation (>3x baseline)', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 35, 35]),
      currentBatchSize: 5,
      performanceBaseline: 10,
      batchIndex: 3,
    });

    expect(result.batchSize).toBe(4);
    expect(result.log).toEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('Reducing batch size'),
      })
    );
  });

  test('does not shrink below the floor of 3', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 40, 40]),
      currentBatchSize: 3,
      performanceBaseline: 10,
      batchIndex: 3,
    });

    expect(result.batchSize).toBe(3);
  });

  test('grows toward the maximum when comfortably better than baseline and past batch 1', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 5, 5]),
      currentBatchSize: 3,
      performanceBaseline: 10,
      batchIndex: 2,
    });

    expect(result.batchSize).toBe(4);
    expect(result.log).toEqual(
      expect.objectContaining({
        level: 'info',
        message: expect.stringContaining('Increasing batch size'),
      })
    );
  });

  test('shrink guard stays inert (no shrink, no log) below MIN_BATCH_SIZE — the below-floor state closed off at the call site 2026-08-15', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 40, 40]),
      currentBatchSize: MIN_BATCH_SIZE - 1,
      performanceBaseline: 10,
      batchIndex: 3,
    });

    expect(result.batchSize).toBe(MIN_BATCH_SIZE - 1);
    expect(result.log).toBeNull();
  });

  test('growth branch has no lower-bound guard — can raise a below-floor size on good performance', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 5, 5]),
      currentBatchSize: MIN_BATCH_SIZE - 1,
      performanceBaseline: 10,
      batchIndex: 2,
    });

    expect(result.batchSize).toBe(MIN_BATCH_SIZE);
  });

  test('does not grow on batch 0 or 1 even if performance is good', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 5, 5]),
      currentBatchSize: 3,
      performanceBaseline: 10,
      batchIndex: 1,
    });

    expect(result.batchSize).toBe(3);
  });

  test('does not grow past the ceiling of 5', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 5, 5]),
      currentBatchSize: 5,
      performanceBaseline: 10,
      batchIndex: 3,
    });

    expect(result.batchSize).toBe(5);
  });

  test('logs but does not resize on moderate degradation (2x-3x baseline)', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 25, 25]),
      currentBatchSize: 4,
      performanceBaseline: 10,
      batchIndex: 3,
    });

    expect(result.batchSize).toBe(4);
    expect(result.log).toEqual(
      expect.objectContaining({
        level: 'info',
        message: expect.stringContaining('Consistent performance degradation'),
      })
    );
  });

  test('is a no-op (no log) in the neutral zone between improvement and degradation thresholds', () => {
    const result = calculateNextBatchSize({
      batchPerformanceHistory: history([10, 9, 9]),
      currentBatchSize: 4,
      performanceBaseline: 10,
      batchIndex: 3,
    });

    expect(result.batchSize).toBe(4);
    expect(result.log).toBeNull();
  });
});
