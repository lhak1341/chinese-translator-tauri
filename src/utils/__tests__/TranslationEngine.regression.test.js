/**
 * Regression tests for TranslationEngine bug fixes
 *
 * The segment-cleanup tests that were here exercised a hand-copied MockTranslationEngine
 * and pinned the SEGMENT_CLEANUP_* constants; the engine's translationSegments ledger had
 * no production reader and was deleted 2026-10-10 (docs/guides/deleted-symbols.md).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationEngine } from '../TranslationEngine.js';
import { cleanFullText, cleanupFormatting } from '../text/FormattingPasses';

describe('TranslationEngine Regression Tests', () => {
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
                opts.chunkOffset
              );
              resolve(`T-${content}`);
            }, resolveDelayByOffset[opts.chunkOffset]);
          })
      );

      const batch = makeBatch();
      await engine.processChunksInParallel(batch, {}, [0, 3, 5]);

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

    it('uses the token offsets it is handed, one per chunk', async () => {
      engine.translateDirectly = vi.fn(async (content) => `T-${content}`);
      await engine.processChunksInParallel(makeBatch(), {}, [10, 13, 15]);
      const calledOffsets = engine.translateDirectly.mock.calls.map(([, opts]) => opts.chunkOffset);
      expect(calledOffsets).toEqual([10, 13, 15]);
    });

    it("does not tokenize: counting is the caller's job", async () => {
      engine.translateDirectly = vi.fn(async (content) => `T-${content}`);
      await engine.processChunksInParallel(makeBatch(), {}, [0, 3, 5]);
      expect(engine.tokenizer.tokenize).not.toHaveBeenCalled();
    });

    it("translateWithProgressiveBatches hands every batch its chunks' global token offsets", async () => {
      // Six chunks run as two batches (the first holds MIN_BATCH_SIZE = 3), so the second
      // batch's offsets only come out right if the count carries across the batch boundary.
      engine.translateDirectly = vi.fn(async (content) => `T-${content}`);
      const processChunks = vi.spyOn(engine, 'processChunksInParallel');

      await engine.translateWithProgressiveBatches(
        '一，二二，三三三，四四四四，五五五五五，六',
        {}
      );

      expect(processChunks.mock.calls.length).toBeGreaterThanOrEqual(2);
      const offsetByContent = Object.fromEntries(
        engine.translateDirectly.mock.calls.map(([content, opts]) => [content, opts.chunkOffset])
      );
      expect(offsetByContent).toEqual({
        一: 0,
        二二: 1,
        三三三: 3,
        四四四四: 6,
        五五五五五: 10,
        六: 15,
      });
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
      engine.maxInputTokens = 5;
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
      engine.maxInputTokens = 5;
      const error = await engine
        .processChunksInParallel([{ content: '说说说说说说说说', startIndex: 0 }], {}, [0])
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
    // The Full Translation per-chunk options (translateDirectly's postProcess).
    const opts = { capitalizeStart: false };

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

  describe('Bug Fix: cleanupFormatting spacing an apostrophe inside a word', () => {
    // 索瑞达尔 → "Thori’dal" (U+2019 as an apostrophe) came out "Thori’ dal": the
    // space-after-closing-quote rule took every ’ for a closing quote. The inserted char also
    // shifted every click-to-highlight position after it.
    const cleanup = (text) => cleanupFormatting(text, { capitalizeStart: false }, () => null);

    it('keeps a letter-flanked ’ inside its word', () => {
      expect(cleanup('Chủ thành Thori’dal tiếp thụ')).toBe('Chủ thành Thori’dal tiếp thụ');
      expect(cleanup('don’t')).toBe('don’t');
    });

    it('still spaces a closing quote off the word after it', () => {
      expect(cleanup('“Đi.”Hắn nói')).toBe('“Đi.” Hắn nói');
      expect(cleanup('«Sách»hay')).toBe('«Sách» hay');
    });

    it('capitalizes the first letter only when the caller owns the start of the text', () => {
      expect(cleanupFormatting('xin chào', { capitalizeStart: true }, () => null)).toBe('Xin chào');
      expect(cleanupFormatting('xin chào', { capitalizeStart: false }, () => null)).toBe(
        'xin chào'
      );
    });
  });
});
