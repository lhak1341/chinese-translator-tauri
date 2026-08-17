import { describe, test, expect } from 'vitest';
import { buildProgressiveProgressUpdate } from '../performance/ProgressiveProgressReporter.js';

function baseInput(overrides = {}) {
  return {
    now: 1000,
    lastProgressUpdate: 0,
    progressUpdateInterval: 300,
    isLastBatch: false,
    enableStreaming: true,
    batchIndex: 3,
    processedChunks: 6,
    totalChunks: 10,
    currentBatchSize: 2,
    semanticArrays: { original: ['甲', '乙'], translated: ['A', 'B'], metadata: [{}, {}] },
    progressText: 'A B',
    ...overrides,
  };
}

describe('buildProgressiveProgressUpdate', () => {
  test('skips when streaming is disabled', () => {
    const result = buildProgressiveProgressUpdate(baseInput({ enableStreaming: false }));
    expect(result.send).toBe(false);
  });

  test('skips off-cadence batches before the debounce interval elapses', () => {
    const result = buildProgressiveProgressUpdate(
      baseInput({ batchIndex: 4, now: 100, lastProgressUpdate: 0, progressUpdateInterval: 300 })
    );
    expect(result.send).toBe(false);
    expect(result.log.message).toContain('Skipped progress update');
  });

  test('sends on the last batch even off-cadence and before the interval elapses', () => {
    const result = buildProgressiveProgressUpdate(
      baseInput({ batchIndex: 4, isLastBatch: true, now: 100, lastProgressUpdate: 0 })
    );
    expect(result.send).toBe(true);
    expect(result.payload.isComplete).toBe(true);
  });

  test('sends every 3rd batch once the debounce interval has elapsed', () => {
    const result = buildProgressiveProgressUpdate(
      baseInput({ batchIndex: 3, now: 1000, lastProgressUpdate: 0, progressUpdateInterval: 300 })
    );
    expect(result.send).toBe(true);
  });

  test('deep-clones semantic arrays (no shared references)', () => {
    const input = baseInput({ batchIndex: 3 });
    const result = buildProgressiveProgressUpdate(input);

    expect(result.payload.semanticArrays.original).not.toBe(input.semanticArrays.original);
    expect(result.payload.semanticArrays.original).toEqual(input.semanticArrays.original);
  });

  test('fills missing metadata entries with the shared frozen default, not per-entry allocation', () => {
    const input = baseInput({
      batchIndex: 3,
      semanticArrays: { original: ['甲', '乙', '丙'], translated: ['A', 'B', 'C'], metadata: [{}] },
    });
    const result = buildProgressiveProgressUpdate(input);

    expect(result.payload.semanticArrays.metadata).toHaveLength(3);
    expect(result.payload.semanticArrays.metadata[1]).toBe(
      result.payload.semanticArrays.metadata[2]
    );
    expect(result.payload.semanticArrays.metadata[1]).toEqual({
      source: 'progressive',
      phase: null,
      dictionary: null,
      isMissing: true,
    });
  });

  test('handles a null/undefined semanticArrays input safely', () => {
    const result = buildProgressiveProgressUpdate(
      baseInput({ batchIndex: 3, semanticArrays: null })
    );
    expect(result.send).toBe(true);
    expect(result.payload.semanticArrays).toEqual({ original: [], translated: [], metadata: [] });
  });

  test('estimates totalBatches from remaining chunks and current batch size', () => {
    const result = buildProgressiveProgressUpdate(
      baseInput({ batchIndex: 3, processedChunks: 6, totalChunks: 10, currentBatchSize: 2 })
    );
    // remaining = 4, ceil(4/2) = 2, total = batchIndex(3) + 2 = 5
    expect(result.payload.totalBatches).toBe(5);
  });
});
