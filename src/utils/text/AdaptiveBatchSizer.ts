interface BatchPerformanceEntry {
  avgTimePerChunk: number;
}

export interface AdaptiveBatchSizerInput {
  batchPerformanceHistory: BatchPerformanceEntry[];
  currentBatchSize: number;
  performanceBaseline: number | null;
  /** Current batch index (0-based) — gates the "increase size" branch, matching the
   * original guard that avoided growing the batch size on batch 0 or 1. */
  batchIndex: number;
}

export interface AdaptiveBatchSizerLogEntry {
  level: 'info' | 'warn';
  message: string;
}

export interface AdaptiveBatchSizerResult {
  batchSize: number;
  performanceBaseline: number | null;
  log: AdaptiveBatchSizerLogEntry | null;
}

const MIN_BATCH_SIZE = 3;
const MAX_BATCH_SIZE = 5;
const SEVERE_DEGRADATION_RATIO = 3.0;
const NOTABLE_DEGRADATION_RATIO = 2.0;
const IMPROVEMENT_RATIO = 0.8;

/**
 * Adaptive batch-size heuristic extracted from translateWithProgressiveBatches
 * (architecture review 2026-07-29, candidate #1). Pure function of the current
 * performance history — no engine state, no `this`.
 *
 * Policy (unchanged from the original inline version): only look at the last 2
 * batches vs. the first batch's baseline. Shrink toward MIN_BATCH_SIZE on severe,
 * sustained degradation (>3x baseline); grow toward MAX_BATCH_SIZE when performance
 * is comfortably better than baseline (<0.8x) and at least 2 batches have already run.
 * Moderate degradation (2x-3x) is logged but does not change the batch size — this
 * codebase's own history shows that range is typically memory-related overhead, not
 * something batch-size changes can fix.
 */
export function calculateNextBatchSize({
  batchPerformanceHistory,
  currentBatchSize,
  performanceBaseline,
  batchIndex,
}: AdaptiveBatchSizerInput): AdaptiveBatchSizerResult {
  if (batchPerformanceHistory.length < 2) {
    return { batchSize: currentBatchSize, performanceBaseline, log: null };
  }

  const recentBatches = batchPerformanceHistory.slice(-2);
  const avgRecentTime =
    recentBatches.reduce((sum, batch) => sum + batch.avgTimePerChunk, 0) / recentBatches.length;

  const baseline = performanceBaseline ?? batchPerformanceHistory[0].avgTimePerChunk;
  const performanceRatio = avgRecentTime / baseline;

  let batchSize = currentBatchSize;
  let log: AdaptiveBatchSizerLogEntry | null = null;

  if (performanceRatio > SEVERE_DEGRADATION_RATIO && currentBatchSize > MIN_BATCH_SIZE) {
    batchSize = Math.max(MIN_BATCH_SIZE, currentBatchSize - 1);
    log = {
      level: 'warn',
      message: `📉 Reducing batch size to ${batchSize} due to extreme degradation (${performanceRatio.toFixed(1)}x slower)`,
    };
  } else if (
    performanceRatio < IMPROVEMENT_RATIO &&
    currentBatchSize < MAX_BATCH_SIZE &&
    batchIndex > 1
  ) {
    batchSize = Math.min(MAX_BATCH_SIZE, currentBatchSize + 1);
    log = {
      level: 'info',
      message: `📈 Increasing batch size to ${batchSize} due to good performance (${performanceRatio.toFixed(1)}x baseline)`,
    };
  } else if (
    performanceRatio > NOTABLE_DEGRADATION_RATIO &&
    performanceRatio <= SEVERE_DEGRADATION_RATIO
  ) {
    log = {
      level: 'info',
      message: `📊 Consistent performance degradation: ${performanceRatio.toFixed(1)}x slower (memory-related, not reducing batch size)`,
    };
  }

  return { batchSize, performanceBaseline: baseline, log };
}
