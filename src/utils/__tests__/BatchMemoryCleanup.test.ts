import { describe, test, expect } from 'vitest';
import { BatchMemoryCleanup } from '../memory/BatchMemoryCleanup';
import { MEMORY_THRESHOLDS } from '../../constants/PerformanceThresholds';
import { PATTERN_PROCESSING } from '../../constants/TranslationConstants';

function makeArray(length: number): number[] {
  return Array.from({ length }, (_, i) => i);
}

describe('BatchMemoryCleanup', () => {
  test('background severity leaves resources untouched below trigger', () => {
    const cleanup = new BatchMemoryCleanup();
    const history = makeArray(MEMORY_THRESHOLDS.BATCH_HISTORY_TRIGGER_BACKGROUND);
    const snapshots = makeArray(MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_TRIGGER_BACKGROUND);

    const result = cleanup.cleanup('background', {
      batchPerformanceHistory: history,
      memoryTrackerSnapshots: snapshots,
    });

    expect(result.batchPerformanceHistory).toBe(history);
    expect(result.memoryTrackerSnapshots).toBe(snapshots);
  });

  test('background severity trims to the background keep-counts once over trigger', () => {
    const cleanup = new BatchMemoryCleanup();
    const history = makeArray(MEMORY_THRESHOLDS.BATCH_HISTORY_TRIGGER_BACKGROUND + 1);
    const snapshots = makeArray(MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_TRIGGER_BACKGROUND + 1);

    const result = cleanup.cleanup('background', {
      batchPerformanceHistory: history,
      memoryTrackerSnapshots: snapshots,
    });

    expect(result.batchPerformanceHistory).toHaveLength(
      MEMORY_THRESHOLDS.BATCH_HISTORY_KEEP_BACKGROUND
    );
    expect(result.memoryTrackerSnapshots).toHaveLength(
      MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_KEEP_BACKGROUND
    );
  });

  test('elevated severity trims at its own (lower) trigger', () => {
    const cleanup = new BatchMemoryCleanup();
    const history = makeArray(MEMORY_THRESHOLDS.BATCH_HISTORY_TRIGGER_ELEVATED + 1);
    const snapshots = makeArray(MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_TRIGGER_ELEVATED + 1);

    const result = cleanup.cleanup('elevated', {
      batchPerformanceHistory: history,
      memoryTrackerSnapshots: snapshots,
    });

    expect(result.batchPerformanceHistory).toHaveLength(
      MEMORY_THRESHOLDS.BATCH_HISTORY_KEEP_ELEVATED
    );
    expect(result.memoryTrackerSnapshots).toHaveLength(
      MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_KEEP_ELEVATED
    );
  });

  test('emergency severity clears batchPerformanceHistory and snapshots entirely', () => {
    const cleanup = new BatchMemoryCleanup();
    const result = cleanup.cleanup('emergency', {
      batchPerformanceHistory: makeArray(5),
      memoryTrackerSnapshots: makeArray(5),
    });

    expect(result.batchPerformanceHistory).toEqual([]);
    expect(result.memoryTrackerSnapshots).toEqual([]);
  });

  test('variableCache is untouched at background severity even if oversized', () => {
    const cleanup = new BatchMemoryCleanup();
    const variableCache = new Map(
      Array.from({ length: PATTERN_PROCESSING.VARIABLE_CACHE_CLEANUP_THRESHOLD + 10 }, (_, i) => [
        i,
        i,
      ])
    );

    cleanup.cleanup('background', {
      batchPerformanceHistory: [],
      memoryTrackerSnapshots: [],
      variableCache,
    });

    expect(variableCache.size).toBe(PATTERN_PROCESSING.VARIABLE_CACHE_CLEANUP_THRESHOLD + 10);
  });

  test('variableCache clears at elevated severity once over the shared threshold', () => {
    const cleanup = new BatchMemoryCleanup();
    const variableCache = new Map(
      Array.from({ length: PATTERN_PROCESSING.VARIABLE_CACHE_CLEANUP_THRESHOLD + 1 }, (_, i) => [
        i,
        i,
      ])
    );

    cleanup.cleanup('elevated', {
      batchPerformanceHistory: [],
      memoryTrackerSnapshots: [],
      variableCache,
    });

    expect(variableCache.size).toBe(0);
  });

  test('variableCache does not clear at elevated severity while under the shared threshold', () => {
    const cleanup = new BatchMemoryCleanup();
    const variableCache = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    cleanup.cleanup('elevated', {
      batchPerformanceHistory: [],
      memoryTrackerSnapshots: [],
      variableCache,
    });

    expect(variableCache.size).toBe(2);
  });

  test('variableCache always clears at emergency severity regardless of size', () => {
    const cleanup = new BatchMemoryCleanup();
    const variableCache = new Map([['a', 1]]);

    cleanup.cleanup('emergency', {
      batchPerformanceHistory: [],
      memoryTrackerSnapshots: [],
      variableCache,
    });

    expect(variableCache.size).toBe(0);
  });

  test('is pure per-call — no shared state leaks between two cleanup() calls', () => {
    const cleanup = new BatchMemoryCleanup();
    const first = cleanup.cleanup('background', {
      batchPerformanceHistory: makeArray(3),
      memoryTrackerSnapshots: makeArray(3),
    });
    const second = cleanup.cleanup('emergency', {
      batchPerformanceHistory: makeArray(3),
      memoryTrackerSnapshots: makeArray(3),
    });

    expect(first.batchPerformanceHistory).toHaveLength(3);
    expect(second.batchPerformanceHistory).toHaveLength(0);
  });
});
