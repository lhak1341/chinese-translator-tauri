import { MEMORY_THRESHOLDS } from '../../constants/PerformanceThresholds.js';
import { PATTERN_PROCESSING } from '../../constants/TranslationConstants.js';

export type CleanupSeverity = 'background' | 'elevated' | 'emergency';

export interface BatchMemoryResources {
  batchPerformanceHistory: unknown[];
  memoryTrackerSnapshots: unknown[];
  /** Pattern-processor variable cache — real Map, cleared in place. Optional: not every caller has one. */
  variableCache?: Map<unknown, unknown>;
}

export interface BatchMemoryResult {
  batchPerformanceHistory: unknown[];
  memoryTrackerSnapshots: unknown[];
}

/**
 * Owns the trim policy for the resources translateWithProgressiveBatches accumulates
 * across batches: batchPerformanceHistory, memory-tracker snapshots, and the pattern
 * variable cache. Replaces ~7 independently-tuned inline copies of this same trim
 * logic (architecture review 2026-07-29, candidate #1) that had drifted to disagree
 * with each other on keep-counts.
 *
 * translationSegments and semanticArrayBuilder are deliberately NOT owned here:
 * - translationSegments already has a canonical, regression-tested hard ceiling in
 *   `trackTranslationSegment` (see src/utils/CLAUDE.md) — trimming it a second time
 *   here would be redundant, not a second layer of safety.
 * - semanticArrayBuilder has no real light-cleanup method (`.cleanup`/`.clearCache`
 *   were guarded calls to methods that never existed on the class) and its only real
 *   operation, `reset()`, was never exercised in production and risks corrupting
 *   highlighting for the in-progress translation if called mid-batch.
 *
 * Pure per-call — no constructor-injected closures over engine state (see ADR
 * candidate #2 from the same review: closures over `this` make a module untestable
 * standalone). Callers pass current values in, get trimmed values back, and reassign.
 */
export class BatchMemoryCleanup {
  cleanup(severity: CleanupSeverity, resources: BatchMemoryResources): BatchMemoryResult {
    const result: BatchMemoryResult = {
      batchPerformanceHistory: this._trimBatchHistory(severity, resources.batchPerformanceHistory),
      memoryTrackerSnapshots: this._trimSnapshots(severity, resources.memoryTrackerSnapshots),
    };

    if (resources.variableCache && severity !== 'background') {
      if (
        severity === 'emergency' ||
        resources.variableCache.size > PATTERN_PROCESSING.VARIABLE_CACHE_CLEANUP_THRESHOLD
      ) {
        resources.variableCache.clear();
      }
    }

    if (severity === 'emergency' && process.env.NODE_ENV === 'development') {
      // CODE REVIEW FIX (carried forward): manual GC only in dev (requires --expose-gc)
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
    }

    return result;
  }

  private _trimBatchHistory(severity: CleanupSeverity, history: unknown[]): unknown[] {
    if (severity === 'emergency') return [];
    if (severity === 'elevated') {
      return history.length > MEMORY_THRESHOLDS.BATCH_HISTORY_TRIGGER_ELEVATED
        ? history.slice(-MEMORY_THRESHOLDS.BATCH_HISTORY_KEEP_ELEVATED)
        : history;
    }
    return history.length > MEMORY_THRESHOLDS.BATCH_HISTORY_TRIGGER_BACKGROUND
      ? history.slice(-MEMORY_THRESHOLDS.BATCH_HISTORY_KEEP_BACKGROUND)
      : history;
  }

  private _trimSnapshots(severity: CleanupSeverity, snapshots: unknown[]): unknown[] {
    if (severity === 'emergency') return [];
    if (severity === 'elevated') {
      return snapshots.length > MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_TRIGGER_ELEVATED
        ? snapshots.slice(-MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_KEEP_ELEVATED)
        : snapshots;
    }
    return snapshots.length > MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_TRIGGER_BACKGROUND
      ? snapshots.slice(-MEMORY_THRESHOLDS.MEMORY_SNAPSHOT_KEEP_BACKGROUND)
      : snapshots;
  }
}
