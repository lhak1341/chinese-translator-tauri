/**
 * Regression tests for TranslationEngine bug fixes
 *
 * Tests prevent regressions for:
 * - Async memory cleanup race condition
 * - The canonical translationSegments hard ceiling (trackTranslationSegment)
 *
 * A prior "Inconsistent Cleanup Thresholds" / "Multiple Async Cleanup Interference"
 * section here tested MockTranslationEngine methods that no longer exist on the real
 * engine (see docs/guides/deleted-symbols.md). Removed 2026-07-29; the pressure-reactive
 * cleanup stack they belonged to was itself deleted 2026-10-03, so nothing replaces them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MEMORY_THRESHOLDS } from '../../constants/PerformanceThresholds.js';
import { TranslationEngine } from '../TranslationEngine.js';
import { cleanFullText, cleanupFormatting } from '../text/FormattingPasses';

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

  describe('processChunksInParallel chunkOffset wiring (architecture review 2026-08-18, candidate #2)', () => {
    // A prior isolated-per-chunk-builder approach mutated the shared
    // this.semanticArrayBuilder field around await boundaries inside translateDirectly —
    // broken by construction (Array.prototype.map dispatches every chunk's synchronous
    // prefix, including the builder swap, before any chunk reaches real async work; see
    // src/utils/CLAUDE.md's addUnit section for the full analysis). Chunks now write
    // straight to the shared builder with a chunkOffset computed upfront. This proves
    // that lands every chunk's semantic units at the correct global tokenIndex regardless
    // of which chunk's translateDirectly call actually resolves first — translateSinglePass
    // itself needs initialized dictionaries (see TranslationEngine.pipeline.test.js), so
    // translateDirectly is stubbed here to isolate this orchestration logic. (The test
    // used to drive translateWithChunking, deleted 2026-10-05; this is the live twin.)
    let engine;
    const makeBatch = () => [
      { content: 'aaa', startIndex: 0 },
      { content: 'bb', startIndex: 3 },
      { content: 'cccc', startIndex: 5 },
    ];

    beforeEach(() => {
      engine = new TranslationEngine({
        enableMemoryMonitoring: false,
        enablePerformanceMonitoring: false,
      });

      // Token count == content length, so expected chunkOffsets are just cumulative
      // content lengths (0, 3, 5) — easy to assert against without a real tokenizer.
      vi.spyOn(engine.tokenizer, 'tokenize').mockImplementation((content) =>
        new Array(content.length).fill({})
      );
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

      const batch = makeBatch();
      await engine.processChunksInParallel(batch, {}, 0);

      // chunkOffset is computed upfront, synchronously, in chunk order — regardless of
      // the scrambled resolution order set up above.
      const calledOffsets = engine.translateDirectly.mock.calls.map(([, opts]) => opts.chunkOffset);
      expect(calledOffsets).toEqual([0, 3, 5]);
      expect(batch.map((chunk) => chunk.translated)).toEqual(['T-aaa', 'T-bb', 'T-cccc']);

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

    it('offsets the first chunk by batchStart', async () => {
      engine.translateDirectly = vi.fn(async (content) => `T-${content}`);
      await engine.processChunksInParallel(makeBatch(), {}, 10);
      const calledOffsets = engine.translateDirectly.mock.calls.map(([, opts]) => opts.chunkOffset);
      expect(calledOffsets).toEqual([10, 13, 15]);
    });
  });

  describe('translateDirectly oversized input (translateWithChunking deleted 2026-10-05)', () => {
    // The old fallback re-chunked the oversized chunk and re-entered the same check without end
    // (a 13,000-character unpunctuated chunk, over the 15,000-token default limit). There is
    // nothing smaller than a chunk to fall back to, so it now throws once, saying why.
    it('throws "Input too large" once instead of recursing', async () => {
      const engine = new TranslationEngine({
        enableMemoryMonitoring: false,
        enablePerformanceMonitoring: false,
      });
      vi.spyOn(engine, 'calculateMaxTokensForDevice').mockReturnValue(5);
      const translateSinglePass = vi.spyOn(engine, 'translateSinglePass');

      await expect(engine.translateDirectly('说说说说说说说说', {})).rejects.toThrow(
        /Input too large/
      );
      expect(translateSinglePass).not.toHaveBeenCalled();
    });

    it('keeps the cause visible when a chunk fails inside processChunksInParallel', async () => {
      const engine = new TranslationEngine({
        enableMemoryMonitoring: false,
        enablePerformanceMonitoring: false,
      });
      vi.spyOn(engine, 'calculateMaxTokensForDevice').mockReturnValue(5);
      const error = await engine
        .processChunksInParallel([{ content: '说说说说说说说说', startIndex: 0 }], {}, 0)
        .catch((caught) => caught);
      expect(error.message).toMatch(/Parallel chunk processing failed/);
      expect(error.cause.message).toMatch(/Input too large/);
    });
  });

  describe('Bug Fix: cleanFullText spuriously spacing punctuation off a digit', () => {
    // cleanFullText is a pure FormattingPasses function — no engine to construct.
    const cleanup = (text) => cleanFullText(text);

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
    const cleanup = (text, options) => cleanupFormatting(text, options, () => null);
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

  describe('Bug Fix: cleanupFormatting chunking branch swallowing paragraph breaks', () => {
    // Same prototype-call setup as the decimal-point block above; the branch under test is
    // the DEFAULT one (useChunking omitted / not false), which every chunked translation takes.
    const cleanup = (text) => cleanupFormatting(text, {}, () => null);

    it('keeps a line break that precedes line-leading punctuation', () => {
      // The remove-spaces-before-punctuation rule used bare \s+, which matches \n — so a
      // paragraph break landing before a line-leading punctuation mark was deleted outright,
      // silently dropping a blank line from the Vietnamese output.
      expect(cleanup('Dòng một\n。')).toBe('Dòng một\n。');
      expect(cleanup('Dòng một\n) tiếp')).toBe('Dòng một\n) tiếp');
      expect(cleanup('Dòng một\r\n》')).toBe('Dòng một\r\n》');
    });

    it('still removes spaces and tabs before punctuation', () => {
      expect(cleanup('Xin chào .')).toBe('Xin chào.');
      expect(cleanup('Xin chào\t，')).toBe('Xin chào，');
    });

    it('strips trailing spaces on a line without eating the break itself', () => {
      expect(cleanup('Dòng một \n。')).toBe('Dòng một\n。');
    });
  });

  describe('Bug Fix: cleanupFormatting spacing an apostrophe inside a word', () => {
    // 索瑞达尔 → "Thori’dal" (U+2019 as an apostrophe) came out "Thori’ dal": the
    // space-after-closing-quote rule took every ’ for a closing quote. The inserted char also
    // shifted every click-to-highlight position after it.
    const cleanup = (text, options = {}) => cleanupFormatting(text, options, () => null);

    it.each([{}, { useChunking: false, isParallelChunk: true }])(
      'keeps a letter-flanked ’ inside its word (options %o)',
      (options) => {
        expect(cleanup('Chủ thành Thori’dal tiếp thụ', options)).toBe(
          'Chủ thành Thori’dal tiếp thụ'
        );
        expect(cleanup('don’t', options)).toBe('don’t');
      }
    );

    it('still spaces a closing quote off the word after it', () => {
      expect(cleanup('“Đi.”Hắn nói')).toBe('“Đi.” Hắn nói');
      expect(cleanup('‘Đi.’Hắn nói')).toBe('‘Đi.’ Hắn nói');
      expect(cleanup('«Sách»hay')).toBe('«Sách» hay');
    });
  });
});
