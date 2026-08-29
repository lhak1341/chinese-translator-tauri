/**
 * Regression tests for TranslationEngine bug fixes
 *
 * Tests prevent regressions for:
 * - Async memory cleanup race condition
 * - The canonical translationSegments hard ceiling (trackTranslationSegment)
 *
 * A prior "Inconsistent Cleanup Thresholds" / "Multiple Async Cleanup Interference"
 * section here tested MockTranslationEngine methods (handleSmartCleanup,
 * performEmergencyCleanup, performHighPriorityCleanup, optimizeMemoryStructures) that
 * no longer exist on the real engine — extracted into SmartMemoryCoordinator long
 * before this file was last touched (see CLAUDE.md's deleted-symbols list). Removed
 * 2026-07-29 alongside the translateWithProgressiveBatches decomposition (architecture
 * review candidate #1) — see BatchMemoryCleanup.test.ts for the real replacement's tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MEMORY_THRESHOLDS } from '../../constants/PerformanceThresholds.js';
import { TranslationEngine } from '../TranslationEngine.js';
import { BatchMemoryCleanup } from '../memory/BatchMemoryCleanup.js';
import { MIN_BATCH_SIZE, MAX_BATCH_SIZE } from '../text/AdaptiveBatchSizer.js';
import { adaptiveChunker } from '../text/AdaptiveChunker.js';

// Mock TranslationEngine with minimal implementation for testing
class MockTranslationEngine {
  constructor() {
    this.translationSegments = [];
  }

  // Simulates the fixed async cleanup logic
  trackTranslationSegmentWithAsyncCleanup() {
    this.translationSegments.push({ data: 'segment' });

    if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING) {
      // Idle-deferred cleanup never got a chance to run — trim synchronously.
      this.translationSegments = this.translationSegments.slice(
        -MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
      );
    } else if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
      const segmentsToKeep = MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP;

      const cleanupFn = () => {
        // Bug fix: Re-check threshold before cleanup to prevent race condition
        if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
          this.translationSegments = this.translationSegments.slice(-segmentsToKeep);
        }
      };

      // Schedule async cleanup
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(cleanupFn, { timeout: 1000 });
      } else {
        setTimeout(cleanupFn, 0);
      }
    }
  }
}

describe('TranslationEngine Regression Tests', () => {
  describe('Bug Fix: Async Memory Cleanup Race Condition', () => {
    let engine;

    beforeEach(() => {
      engine = new MockTranslationEngine();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('should not delete newly added segments when cleanup executes late', async () => {
      // Add 80 segments to trigger cleanup (threshold is 75)
      for (let i = 0; i < 80; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      expect(engine.translationSegments.length).toBe(80);

      // Simulate user clearing segments before async cleanup executes
      engine.translationSegments = [];

      // Add 40 new segments
      for (let i = 0; i < 40; i++) {
        engine.translationSegments.push({ data: `new-segment-${i}` });
      }

      expect(engine.translationSegments.length).toBe(40);

      // Execute queued cleanup
      await vi.runAllTimersAsync();

      // Bug fix verification: Should NOT delete the 40 new segments
      // because cleanup re-checks threshold (40 < 75, so no cleanup happens)
      expect(engine.translationSegments.length).toBe(40);
    });

    it('should still cleanup if threshold exceeded when cleanup executes', async () => {
      // Add 80 segments to trigger cleanup
      for (let i = 0; i < 80; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      // Add more segments while cleanup is queued
      for (let i = 0; i < 20; i++) {
        engine.translationSegments.push({ data: `extra-segment-${i}` });
      }

      expect(engine.translationSegments.length).toBe(100);

      // Execute queued cleanup
      await vi.runAllTimersAsync();

      // Should cleanup to SEGMENT_CLEANUP_KEEP (35) because threshold still exceeded
      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP);
    });
  });

  describe('Bug Fix: Segment Cleanup Hard Ceiling', () => {
    let engine;

    beforeEach(() => {
      engine = new MockTranslationEngine();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('trims synchronously, without running any timers, once the hard ceiling is crossed', () => {
      // A synchronous burst outruns the idle-deferred cleanup entirely —
      // no vi.runAllTimersAsync() here, the trim must already have happened.
      for (let i = 0; i < MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING + 1; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      expect(engine.translationSegments.length).toBe(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP);
    });

    it('does not trim synchronously while still under the hard ceiling', () => {
      for (let i = 0; i < MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING; i++) {
        engine.trackTranslationSegmentWithAsyncCleanup();
      }

      // Still queued for idle cleanup, not yet trimmed
      expect(engine.translationSegments.length).toBe(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING
      );
    });
  });

  describe('Threshold Constants Integration', () => {
    it('should have consistent threshold values', () => {
      // Verify threshold hierarchy makes sense
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP).toBeLessThan(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER
      );
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER).toBeLessThan(
        MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING
      );
    });

    it('should use documented threshold values', () => {
      // Verify actual values match documentation.
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER).toBe(75);
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP).toBe(35);
      expect(MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING).toBe(100);
    });
  });

  describe('_applyBatchMemoryCleanup wiring (architecture review 2026-07-30, candidate #6)', () => {
    // BatchMemoryCleanup.test.ts already covers the trim policy itself
    // (emergency/elevated/background thresholds) as pure-function tests.
    // This proves the real TranslationEngine call site actually reassigns
    // both fields from the returned trimmed values — the one thing that can
    // regress silently if a future call site destructures only one of them.
    it('reassigns both batchPerformanceHistory and memoryTracker.snapshots on emergency severity', () => {
      const engine = new TranslationEngine({
        debugLevel: 0,
        enableMemoryMonitoring: false,
        enablePerformanceMonitoring: false,
      });
      engine.batchMemoryCleanup = new BatchMemoryCleanup();
      engine.batchPerformanceHistory = [{ batch: 1 }, { batch: 2 }];
      engine.memoryTracker = { snapshots: [{ snap: 1 }, { snap: 2 }] };

      engine._applyBatchMemoryCleanup('emergency');

      expect(engine.batchPerformanceHistory).toEqual([]);
      expect(engine.memoryTracker.snapshots).toEqual([]);
    });
  });

  describe('_clampInitialBatchSize wiring (architecture review 2026-08-15)', () => {
    // AdaptiveBatchSizer.test.ts covers calculateNextBatchSize's own boundary
    // behavior (shrink guard inert below MIN_BATCH_SIZE). This proves the real
    // TranslationEngine call site never hands it a currentBatchSize below that
    // floor in the first place — the disabled-chunking case previously hardcoded
    // a bare 2, one below MIN_BATCH_SIZE (3).
    let engine;

    beforeEach(() => {
      engine = new TranslationEngine({
        debugLevel: 0,
        enableMemoryMonitoring: false,
        enablePerformanceMonitoring: false,
      });
    });

    it('floors at MIN_BATCH_SIZE, not 2, when chunking is disabled', () => {
      const result = engine._clampInitialBatchSize({ enabled: false }, 1);
      expect(result).toBe(MIN_BATCH_SIZE);
    });

    it('always pins to exactly MIN_BATCH_SIZE when chunking is disabled, regardless of the requested size', () => {
      const result = engine._clampInitialBatchSize({ enabled: false }, MIN_BATCH_SIZE + 1);
      expect(result).toBe(MIN_BATCH_SIZE);
    });

    it('clamps to maxParallelChunks when chunking is enabled', () => {
      const result = engine._clampInitialBatchSize(
        { enabled: true, maxParallelChunks: MAX_BATCH_SIZE },
        MAX_BATCH_SIZE + 10
      );
      expect(result).toBe(MAX_BATCH_SIZE);
    });
  });

  describe('translateWithChunking parallel branch wiring (architecture review 2026-08-18, candidate #2)', () => {
    // A prior isolated-per-chunk-builder approach here mutated the shared
    // this.semanticArrayBuilder field around await boundaries inside translateDirectly —
    // broken by construction (Array.prototype.map dispatches every chunk's synchronous
    // prefix, including the builder swap, before any chunk reaches real async work; see
    // src/utils/CLAUDE.md's addUnit section for the full analysis). Deleted in favor of
    // writing straight to the shared builder with a chunkOffset computed upfront, same as
    // processChunksInParallel already does. This proves the replacement lands every
    // chunk's semantic units at the correct global tokenIndex regardless of which chunk's
    // translateDirectly call actually resolves first — translateSinglePass itself needs
    // WASM/dictionaries (see TranslationEngine.integration.test.js, skipped for that
    // reason), so translateDirectly is stubbed here to isolate this orchestration logic.
    let engine;
    const fakeChunks = [
      { content: 'aaa', startIndex: 0 },
      { content: 'bb', startIndex: 3 },
      { content: 'cccc', startIndex: 5 },
    ];

    beforeEach(() => {
      engine = new TranslationEngine({
        debugLevel: 0,
        enableMemoryMonitoring: false,
        enablePerformanceMonitoring: false,
      });

      engine.textChunker = {
        chunkText: () => fakeChunks,
        analyzeChunks: () => ({}),
        getTranslatableChunks: () => fakeChunks,
      };
      // Token count == content length, so expected chunkOffsets are just cumulative
      // content lengths (0, 3, 5) — easy to assert against without a real tokenizer.
      vi.spyOn(engine.tokenizer, 'tokenize').mockImplementation((content) =>
        new Array(content.length).fill({})
      );
      engine.chunkPostProcessor.translatePunctuation = vi.fn();
      engine.applySmartCapitalization = vi.fn();
      engine.chunkPostProcessor.reconstructTextWithSegments = vi.fn(() => ({
        text: 'stub-result',
        segments: [],
      }));
      engine.applyFinalCleanup = vi.fn((s) => s);
    });

    it('lands every chunk at the correct global tokenIndex regardless of completion order', async () => {
      const originalBuilder = engine.semanticArrayBuilder;

      // Resolve the LAST-offset chunk first — deliberately scrambled completion order —
      // to prove chunkOffset correctness doesn't depend on resolution order.
      const resolveDelayByOffset = { 0: 30, 3: 20, 5: 10 };
      engine.translateDirectly = vi.fn(
        (content, opts) =>
          new Promise((resolve) => {
            setTimeout(() => {
              engine.semanticArrayBuilder.addUnit(
                content,
                `T-${content}`,
                'character',
                opts.chunkOffset,
                'characters',
                null
              );
              resolve(`T-${content}`);
            }, resolveDelayByOffset[opts.chunkOffset]);
          })
      );

      await engine.translateWithChunking('aaa|bb|cccc', {});

      // chunkOffset is computed upfront, synchronously, in chunk order — regardless of
      // the scrambled resolution order set up above.
      const calledOffsets = engine.translateDirectly.mock.calls.map(([, opts]) => opts.chunkOffset);
      expect(calledOffsets).toEqual([0, 3, 5]);

      // Raw array order reflects completion order (documented, corrected downstream via
      // compareByTokenIndex) — assert by tokenIndex instead of array position.
      const { original, metadata } = engine.semanticArrayBuilder.getArrays();
      expect(original).toHaveLength(3);
      const tokenIndexByOriginal = Object.fromEntries(
        original.map((text, i) => [text, metadata[i].tokenIndex])
      );
      expect(tokenIndexByOriginal).toEqual({ aaa: 0, bb: 3, cccc: 5 });

      // No swap-based "isolation" reintroduced — same builder instance throughout.
      expect(engine.semanticArrayBuilder).toBe(originalBuilder);
    });
  });

  describe('translateWithProgressiveBatches adaptiveChunker reset wiring (architecture review 2026-08-18, candidate #3 grilling)', () => {
    // adaptiveChunker is a module-level singleton (src/utils/text/AdaptiveChunker.js) whose
    // performanceHistory previously persisted across translations — calculateOptimalChunkSize's
    // trend adjustment (read once, before this translation's own batches run) was silently
    // biased by unrelated prior translations. Proves the real call site resets it before that
    // read, not just that AdaptiveChunker.reset() itself works (see AdaptiveChunker.test.js for
    // the pure-method test) — the wiring is the thing that can regress silently.
    afterEach(() => {
      adaptiveChunker.reset();
    });

    it('resets adaptiveChunker.performanceHistory before this translation reads it', async () => {
      adaptiveChunker.recordPerformance({
        chunkSize: 10,
        processingTime: 50,
        throughput: 1,
        memoryUsage: 0,
      });
      adaptiveChunker.recordPerformance({
        chunkSize: 10,
        processingTime: 50,
        throughput: 1,
        memoryUsage: 0,
      });
      expect(adaptiveChunker.performanceHistory).toHaveLength(2);

      const engine = new TranslationEngine({
        debugLevel: 0,
        enableMemoryMonitoring: false,
        enablePerformanceMonitoring: false,
      });
      const fakeChunks = [{ content: 'aaa', startIndex: 0 }];
      engine.textChunker = {
        chunkText: () => fakeChunks,
        getTranslatableChunks: () => fakeChunks,
      };
      // Short-circuit right after the reset+sizing logic under test — the rest of the
      // progressive-batch pipeline needs WASM/dictionaries (see
      // TranslationEngine.integration.test.js, skipped for that reason) and isn't this test's
      // concern.
      engine.processChunksInParallel = vi.fn(async () => {
        throw new Error('stub-stop-here');
      });

      await expect(engine.translateWithProgressiveBatches('aaa', {})).rejects.toThrow(
        'stub-stop-here'
      );

      expect(adaptiveChunker.performanceHistory).toHaveLength(0);
    });
  });

  describe('Bug Fix: applyFinalCleanup spuriously spacing punctuation off a digit', () => {
    // applyFinalCleanup is pure (no `this.*` reads) — call it directly off the prototype
    // rather than constructing a full engine (WASM/dictionary init not needed here).
    const cleanup = (text) => TranslationEngine.prototype.applyFinalCleanup.call({}, text);

    it('does not insert a space between a converted number and following punctuation', () => {
      // 两千七！ → "2,700!" via NumberProcessor; previously became "2,700 !"
      expect(cleanup('“2,700!”')).toBe('“2,700!”');
      expect(cleanup('2,700?')).toBe('2,700?');
      expect(cleanup('2,700:')).toBe('2,700:');
      expect(cleanup('2,700;')).toBe('2,700;');
    });

    it('still adds a space between Vietnamese text and Arabic numerals', () => {
      expect(cleanup('Thứ422giới')).toBe('Thứ 422 giới');
    });

    it('still preserves number-formatting punctuation like slashes and tildes', () => {
      expect(cleanup('(23/30)')).toBe('(23/30)');
      expect(cleanup('1992~1996')).toBe('1992~1996');
    });
  });

  describe('Bug Fix: cleanupFormatting spuriously spacing a decimal point off its digit', () => {
    // cleanupFormatting reads this.dictionaryManager/this.log — stub the minimum needed
    // rather than constructing a full engine (WASM/dictionary init not needed here).
    const fakeEngine = { dictionaryManager: { translate: () => null }, log: () => {} };
    const cleanup = (text, options) =>
      TranslationEngine.prototype.cleanupFormatting.call(fakeEngine, text, options);
    // options.useChunking: false is the Full Translation per-chunk path (translateDirectly
    // with isParallelChunk: true) — the branch that adds a space after sentence punctuation.
    const opts = { useChunking: false, isParallelChunk: true };

    it('does not split a decimal point inside a converted number: "99.9%" stays intact', () => {
      // 百分之九十九点九 → NumberProcessor's "99.9%"; previously became "99. 9%", which also
      // corrupted every click-to-highlight position after it (positions are recorded
      // against this text before cleanupFormatting runs).
      expect(cleanup('Là 99.9% đích', opts)).toBe('Là 99.9% đích');
      expect(cleanup('Là 99.99% đích', opts)).toBe('Là 99.99% đích');
      expect(cleanup('số 3.14 đó', opts)).toBe('số 3.14 đó');
    });

    it('still adds a space after a genuine sentence-ending period (followed by a letter)', () => {
      expect(cleanup('Xin chào.Tạm biệt', opts)).toBe('Xin chào. Tạm biệt');
    });
  });
});
