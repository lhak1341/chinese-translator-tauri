import { describe, expect, it } from 'vitest';
import {
  CHUNK_CEILING_CHARS,
  CHUNK_TARGET_CHARS,
  VIEWPORT_LINES_HYSTERESIS,
  chunkText,
  computeBands,
  countVisibleLines,
  isBlankLine,
  nextViewportLines,
  orderChunksByDistance,
  planChunks,
  snapRangeToParagraphs,
  splitLongLine,
  type ChunkPlan,
} from '../TranslationWindow';

/** A reader over a fixed array of lines, plus the unfetched region past its end. */
function reader(lines: Array<string | undefined>) {
  return (index: number): string | undefined =>
    index >= 0 && index < lines.length ? lines[index] : undefined;
}

/** `paragraphs` of `linesPerParagraph` lines each, separated by one blank line. */
function book(paragraphs: number, linesPerParagraph: number, lineLength = 40): string[] {
  const lines: string[] = [];
  for (let p = 0; p < paragraphs; p += 1) {
    for (let l = 0; l < linesPerParagraph; l += 1) lines.push('字'.repeat(lineLength));
    lines.push('');
  }
  return lines;
}

describe('computeBands', () => {
  it('nests render inside fetch inside keep, each wider than the last', () => {
    const bands = computeBands({
      anchorLine: 500,
      viewportLines: 20,
      overscanLines: 5,
      lineCount: 1000,
    });

    expect(bands.render).toEqual({ start: 495, end: 525 });
    expect(bands.fetch).toEqual({ start: 460, end: 560 });
    expect(bands.keep).toEqual({ start: 380, end: 640 });
  });

  it('clips at the start of a book without moving the far edge inward', () => {
    const bands = computeBands({
      anchorLine: 0,
      viewportLines: 20,
      overscanLines: 5,
      lineCount: 1000,
    });

    expect(bands.render).toEqual({ start: 0, end: 25 });
    expect(bands.fetch).toEqual({ start: 0, end: 60 });
    expect(bands.keep).toEqual({ start: 0, end: 140 });
  });

  it('clips at the end of a book', () => {
    const bands = computeBands({
      anchorLine: 990,
      viewportLines: 20,
      overscanLines: 5,
      lineCount: 1000,
    });

    expect(bands.render).toEqual({ start: 985, end: 1000 });
    expect(bands.fetch).toEqual({ start: 950, end: 1000 });
    expect(bands.keep).toEqual({ start: 870, end: 1000 });
  });

  it('keeps the bands nested when a large overscan outruns a small viewport', () => {
    const bands = computeBands({
      anchorLine: 500,
      viewportLines: 2,
      overscanLines: 50,
      lineCount: 1000,
    });

    expect(bands.render).toEqual({ start: 450, end: 552 });
    expect(bands.fetch.start).toBeLessThanOrEqual(bands.render.start);
    expect(bands.fetch.end).toBeGreaterThanOrEqual(bands.render.end);
    expect(bands.keep.start).toBeLessThanOrEqual(bands.fetch.start);
    expect(bands.keep.end).toBeGreaterThanOrEqual(bands.fetch.end);
  });

  it('produces an empty band for an empty book rather than a negative range', () => {
    const bands = computeBands({
      anchorLine: 0,
      viewportLines: 20,
      overscanLines: 5,
      lineCount: 0,
    });

    expect(bands.render).toEqual({ start: 0, end: 0 });
    expect(bands.keep).toEqual({ start: 0, end: 0 });
  });
});

describe('isBlankLine', () => {
  it.each([
    ['', true],
    [' ', true],
    ['   ', true],
    ['\t', true],
    ['\t\n', true],
    ['\u00a0', true],
    ['\u3000', true],
    ['\u3000\u3000', true],
    ['你好', false],
    [' a ', false],
    ['\u3000你好', false],
  ])('%j → %s', (line, expected) => {
    expect(isBlankLine(line)).toBe(expected);
  });

  it('is not true for a line whose page has not landed: its row keeps its estimated height', () => {
    expect(isBlankLine(undefined)).toBe(false);
  });
});

describe('countVisibleLines', () => {
  /** Rows 30px tall, laid out from the top of the document. */
  const rows = Array.from({ length: 40 }, (_, i) => ({ start: i * 30, size: 30 }));

  it('counts every row overlapping the viewport, partial rows included', () => {
    // 300px of viewport starting 15px into row 0: rows 0..10 all overlap.
    expect(countVisibleLines(rows, 15, 300)).toBe(11);
  });

  it('counts a row flush with the viewport top and excludes one flush with the bottom', () => {
    expect(countVisibleLines(rows, 30, 300)).toBe(10);
  });

  it('returns zero before the scroll element has any layout', () => {
    expect(countVisibleLines(rows, 0, 0)).toBe(0);
    expect(countVisibleLines([], 0, 500)).toBe(0);
  });

  it('counts rows of unequal height, which is the case that matters', () => {
    const wrapped = [
      { start: 0, size: 120 }, // ends at 120: overlaps the viewport by 20px
      { start: 120, size: 30 },
      { start: 150, size: 240 }, // ends at 390: one tall wrapped paragraph
      { start: 390, size: 30 }, // starts before the bottom edge at 400
      { start: 420, size: 30 }, // entirely below the viewport
    ];

    expect(countVisibleLines(wrapped, 100, 300)).toBe(4);
  });
});

describe('nextViewportLines', () => {
  it('adopts a measurement that moved by the hysteresis or more', () => {
    expect(nextViewportLines(30, 30 + VIEWPORT_LINES_HYSTERESIS)).toBe(32);
    expect(nextViewportLines(30, 30 - VIEWPORT_LINES_HYSTERESIS)).toBe(28);
  });

  it('holds the previous count when a row grows under the reader', () => {
    expect(nextViewportLines(30, 29)).toBe(30);
    expect(nextViewportLines(30, 31)).toBe(30);
  });

  it('holds the previous count rather than collapsing to zero when nothing is measured', () => {
    expect(nextViewportLines(30, 0)).toBe(30);
  });
});

describe('snapRangeToParagraphs', () => {
  // Lines 0-9 are one paragraph, 10 is blank, 11-20 are the next.
  const lines = [...Array(10).fill('中文'), '', ...Array(10).fill('中文')] as string[];

  it('widens both ends to the paragraph edges', () => {
    expect(snapRangeToParagraphs({ start: 3, end: 7 }, reader(lines), lines.length)).toEqual({
      start: 0,
      end: 10,
    });
  });

  it('leaves a range already sitting on paragraph edges alone', () => {
    expect(snapRangeToParagraphs({ start: 11, end: 21 }, reader(lines), lines.length)).toEqual({
      start: 11,
      end: 21,
    });
  });

  it('does not widen past a blank line into the next paragraph', () => {
    const snapped = snapRangeToParagraphs({ start: 8, end: 13 }, reader(lines), lines.length);

    expect(snapped).toEqual({ start: 0, end: 21 });
  });

  it('stops at an unfetched line rather than guessing past it', () => {
    const partiallyLoaded: Array<string | undefined> = [...lines];
    partiallyLoaded[2] = undefined;
    partiallyLoaded[15] = undefined;

    expect(
      snapRangeToParagraphs({ start: 5, end: 13 }, reader(partiallyLoaded), partiallyLoaded.length)
    ).toEqual({ start: 3, end: 15 });
  });

  it('widens only to the nearest indented line in a book with no blank lines', () => {
    const indented = Array.from({ length: 6 }, (_, i) => (i % 2 === 0 ? '　　中文' : '中文'));

    expect(snapRangeToParagraphs({ start: 3, end: 4 }, reader(indented), 6)).toEqual({
      start: 2,
      end: 4,
    });
  });

  it('clips to the book at both ends', () => {
    expect(snapRangeToParagraphs({ start: -20, end: 999 }, reader(lines), lines.length)).toEqual({
      start: 0,
      end: 21,
    });
  });

  it('returns an empty range untouched', () => {
    expect(snapRangeToParagraphs({ start: 5, end: 5 }, reader(lines), lines.length)).toEqual({
      start: 5,
      end: 5,
    });
  });
});

describe('planChunks', () => {
  it('packs whole lines up to the target size', () => {
    const lines = book(1, 40, 40);
    const chunks = planChunks({ start: 0, end: 40 }, reader(lines), lines.length);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.charCount).toBeLessThanOrEqual(CHUNK_TARGET_CHARS);
    // Every line of the paragraph is covered exactly once, in order.
    expect(chunks[0].startLine).toBe(0);
    expect(chunks[chunks.length - 1].endLine).toBe(39);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].startLine).toBe(chunks[i - 1].endLine + 1);
    }
  });

  it('never emits a chunk above the highlighting ceiling, across a run of long lines', () => {
    const lines = Array.from({ length: 12 }, (_, i) => '字'.repeat(700 + i * 90));
    const chunks = planChunks({ start: 0, end: lines.length }, reader(lines), lines.length);

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(chunk.charCount).toBeLessThanOrEqual(CHUNK_CEILING_CHARS);
  });

  it('splits a single line above the ceiling into pieces that fit', () => {
    const lines = ['句'.repeat(700) + '。' + '字'.repeat(2500)];
    const chunks = planChunks({ start: 0, end: 1 }, reader(lines), lines.length);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.charCount).toBeLessThanOrEqual(CHUNK_CEILING_CHARS);
      expect(chunk.startLine).toBe(0);
      expect(chunk.endLine).toBe(0);
    }
    // The pieces tile the line with no gap and no overlap.
    expect(chunks[0].startChar).toBe(0);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].startChar).toBe(chunks[i - 1].endChar);
    }
    expect(chunks[chunks.length - 1].endChar).toBe(lines[0].length);
  });

  it('breaks chunks at paragraph edges', () => {
    const lines = book(6, 3, 40);
    const chunks = planChunks({ start: 0, end: lines.length }, reader(lines), lines.length);

    // Six paragraphs of 122 characters each: well under the target, and still six chunks,
    // because a chunk never spans a paragraph.
    expect(chunks).toHaveLength(6);
    for (const chunk of chunks) {
      expect(lines[chunk.startLine].trim().length).toBeGreaterThan(0);
      expect(lines[chunk.endLine].trim().length).toBeGreaterThan(0);
      // A blank line always ends the chunk in progress, so no chunk spans one.
      for (let line = chunk.startLine; line <= chunk.endLine; line += 1) {
        expect(lines[line].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('never sends a blank line to the engine', () => {
    const lines = ['', '', '中文', '', ''];
    const chunks = planChunks({ start: 0, end: lines.length }, reader(lines), lines.length);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startLine: 2, endLine: 2 });
  });

  it('skips a paragraph whose extent is still unknown rather than planning its prefix', () => {
    const lines: Array<string | undefined> = ['中文', '中文', undefined, '中文'];

    // Line 2 is unfetched, so neither run around it is known to be a whole paragraph —
    // planning either would mint a key the full paragraph will never match.
    expect(planChunks({ start: 0, end: 4 }, reader(lines), 4)).toEqual([]);
  });

  it('plans the paragraph once the missing page lands', () => {
    const loaded: Array<string | undefined> = ['中文', '中文', '中文', '', '中文'];
    const chunks = planChunks({ start: 0, end: 5 }, reader(loaded), 5);

    expect(chunks.map((c) => [c.startLine, c.endLine])).toEqual([
      [0, 2],
      [4, 4],
    ]);
  });

  it('gives the same paragraph the same chunk keys whatever range it was planned from', () => {
    // The snapped fetch band begins at a different paragraph every time the anchor crosses
    // one. Packing that carried across paragraphs would re-key these chunks on every scroll.
    const lines = book(12, 4, 40);
    const wide = planChunks({ start: 0, end: lines.length }, reader(lines), lines.length);
    const shifted = planChunks({ start: 10, end: lines.length }, reader(lines), lines.length);

    const overlap = wide.filter((chunk) => chunk.startLine >= 10);
    expect(overlap.length).toBeGreaterThan(0);
    expect(shifted.map((chunk) => chunk.key)).toEqual(overlap.map((chunk) => chunk.key));
  });

  it('starts a paragraph at an indented line when the book leaves no blank lines', () => {
    // One paragraph per line, each opened by an ideographic indent, nothing between them.
    const lines = Array.from({ length: 6 }, () => '　　' + '字'.repeat(40));
    const chunks = planChunks({ start: 2, end: 4 }, reader(lines), lines.length);

    expect(chunks.map((c) => [c.startLine, c.endLine])).toEqual([
      [2, 2],
      [3, 3],
    ]);
  });

  it('starts a paragraph after a line ending a sentence, closing quote and all', () => {
    const lines = ['他说：“走吧。”', '她没动', '只是笑了笑。', '第二章'];
    const chunks = planChunks({ start: 0, end: 4 }, reader(lines), lines.length);

    expect(chunks.map((c) => [c.startLine, c.endLine])).toEqual([
      [0, 0],
      [1, 2],
      [3, 3],
    ]);
  });

  it('keeps a hard-wrapped paragraph whole: no indent and no sentence end is no boundary', () => {
    const lines = ['', '他走进屋里，看见桌上', '放着一封信，信封上写', '着他的名字。', ''];
    const chunks = planChunks({ start: 0, end: lines.length }, reader(lines), lines.length);

    expect(chunks.map((c) => [c.startLine, c.endLine])).toEqual([[1, 3]]);
  });

  it('plans an indented line beside an unfetched one, but not an unindented one', () => {
    // An indent is the line's own; whether the line before ended a sentence is unknown here.
    const unindented: Array<string | undefined> = [undefined, '中文', '　　中文', '　　中'];
    expect(planChunks({ start: 1, end: 2 }, reader(unindented), 4)).toEqual([]);

    const indented: Array<string | undefined> = [undefined, '　　中文', '　　中文', '　　中'];
    expect(planChunks({ start: 1, end: 2 }, reader(indented), 4).map((c) => c.startLine)).toEqual([
      1,
    ]);
  });

  it('gives every chunk a key unique to its exact span', () => {
    const lines = book(4, 20, 40);
    const chunks = planChunks({ start: 0, end: lines.length }, reader(lines), lines.length);
    const keys = chunks.map((chunk) => chunk.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns nothing for an empty range', () => {
    const lines = book(2, 4);
    expect(planChunks({ start: 7, end: 7 }, reader(lines), lines.length)).toEqual([]);
  });
});

describe('splitLongLine', () => {
  it('cuts at the first sentence mark at or beyond the target size', () => {
    const text = '句'.repeat(700) + '。' + '字'.repeat(700);
    const pieces = splitLongLine(text);

    expect(pieces).toEqual([
      { start: 0, end: 701 },
      { start: 701, end: text.length },
    ]);
  });

  it('carries a closing quote across with the sentence it ends', () => {
    const text = '句'.repeat(700) + '。」' + '字'.repeat(700);
    const pieces = splitLongLine(text);

    expect(pieces[0].end).toBe(702);
  });

  it('falls back to a hard cut at the ceiling when there is no sentence mark', () => {
    const pieces = splitLongLine('字'.repeat(3000));

    expect(pieces).toEqual([
      { start: 0, end: 1200 },
      { start: 1200, end: 2400 },
      { start: 2400, end: 3000 },
    ]);
  });

  it('leaves a line already under the ceiling in one piece', () => {
    const pieces = splitLongLine('字'.repeat(900));

    expect(pieces).toEqual([{ start: 0, end: 900 }]);
  });
});

describe('orderChunksByDistance', () => {
  it('translates the chunk under the anchor before the slack around it', () => {
    const lines = book(1, 60, 40);
    const chunks = planChunks({ start: 0, end: 60 }, reader(lines), lines.length);
    const anchor = chunks[3].startLine;

    const ordered = orderChunksByDistance(chunks, anchor);

    expect(ordered[0].key).toBe(chunks[3].key);
    expect(ordered).toHaveLength(chunks.length);
  });

  it('is stable for chunks the same distance away', () => {
    const chunks: ChunkPlan[] = [
      { key: 'a', startLine: 0, startChar: 0, endLine: 4, endChar: 1, charCount: 1 },
      { key: 'b', startLine: 10, startChar: 0, endLine: 14, endChar: 1, charCount: 1 },
    ];

    expect(orderChunksByDistance(chunks, 7).map((c) => c.key)).toEqual(['a', 'b']);
  });
});

describe('chunkText', () => {
  const lines = ['第一行', '第二行', '第三行'];

  it('joins whole lines with the newlines the engine will see', () => {
    const [chunk] = planChunks({ start: 0, end: 3 }, reader(lines), lines.length);

    expect(chunkText(chunk, reader(lines))).toBe('第一行\n第二行\n第三行');
  });

  it('slices the first and last lines of a partial chunk', () => {
    const chunk: ChunkPlan = {
      key: '0:1-2:2',
      startLine: 0,
      startChar: 1,
      endLine: 2,
      endChar: 2,
      charCount: 7,
    };

    expect(chunkText(chunk, reader(lines))).toBe('一行\n第二行\n第三');
  });
});
