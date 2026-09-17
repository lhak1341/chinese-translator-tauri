import { describe, expect, test } from 'vitest';
import {
  anchorAtOffset,
  clampOffset,
  estimateRowSize,
  offsetForAnchor,
  type RowEstimate,
  type RowMetrics,
} from '../PanelSync';

/**
 * A stub measurement cache: `sizes[i]` is the measured height of row `i`, or `undefined`
 * for a row that has never been mounted — the common case in a 75,000-line book, where
 * every row outside the rendered window falls back to the estimate.
 */
function stubMetrics(sizes: Array<number | undefined>, estimate = 30): RowMetrics {
  const sizeOf = (index: number): number => sizes[index] ?? estimate;
  const starts: number[] = [];
  let running = 0;
  for (let index = 0; index < sizes.length; index += 1) {
    starts[index] = running;
    running += sizeOf(index);
  }
  return {
    start: (index) => starts[Math.max(0, Math.min(index, starts.length - 1))] ?? 0,
    size: (index) => sizeOf(Math.max(0, Math.min(index, sizes.length - 1))),
  };
}

/** Three measured rows, then a run of unmeasured ones, then two more measured. */
const mixed = stubMetrics([40, 100, 60, undefined, undefined, undefined, 80, 50], 30);

describe('offsetForAnchor', () => {
  test('a whole-line anchor maps to that row’s own top', () => {
    expect(offsetForAnchor({ line: 0, fraction: 0 }, mixed)).toBe(0);
    expect(offsetForAnchor({ line: 1, fraction: 0 }, mixed)).toBe(40);
    expect(offsetForAnchor({ line: 2, fraction: 0 }, mixed)).toBe(140);
  });

  test('the sub-line fraction adds that share of the row’s own height', () => {
    expect(offsetForAnchor({ line: 1, fraction: 0.5 }, mixed)).toBe(90);
    expect(offsetForAnchor({ line: 1, fraction: 0.25 }, mixed)).toBe(65);
  });

  test('an unmeasured row uses its estimated height for both start and fraction', () => {
    // Rows 3..5 are unmeasured at 30 each, so row 4 starts at 40+100+60+30 = 230.
    expect(offsetForAnchor({ line: 4, fraction: 0 }, mixed)).toBe(230);
    expect(offsetForAnchor({ line: 4, fraction: 0.5 }, mixed)).toBe(245);
  });

  test('a fraction outside 0..1 is clamped rather than run past the row', () => {
    expect(offsetForAnchor({ line: 1, fraction: 2 }, mixed)).toBe(140);
    expect(offsetForAnchor({ line: 1, fraction: -1 }, mixed)).toBe(40);
  });

  test('a zero-height row contributes no fractional offset', () => {
    const metrics = stubMetrics([20, 0, 20]);
    expect(offsetForAnchor({ line: 1, fraction: 0.75 }, metrics)).toBe(20);
  });
});

describe('anchorAtOffset', () => {
  test('an offset at a row’s top is that line with no fraction', () => {
    expect(anchorAtOffset(0, mixed, 8)).toEqual({ line: 0, fraction: 0 });
    expect(anchorAtOffset(40, mixed, 8)).toEqual({ line: 1, fraction: 0 });
    expect(anchorAtOffset(140, mixed, 8)).toEqual({ line: 2, fraction: 0 });
  });

  test('an offset inside a row reports how far into it the reader is', () => {
    expect(anchorAtOffset(90, mixed, 8)).toEqual({ line: 1, fraction: 0.5 });
    expect(anchorAtOffset(65, mixed, 8)).toEqual({ line: 1, fraction: 0.25 });
  });

  test('an offset inside an unmeasured run resolves against the estimates', () => {
    expect(anchorAtOffset(245, mixed, 8)).toEqual({ line: 4, fraction: 0.5 });
  });

  test('an offset above the first row is the first line', () => {
    expect(anchorAtOffset(-50, mixed, 8)).toEqual({ line: 0, fraction: 0 });
  });

  test('an offset past the end of the document is the last line, fully scrolled', () => {
    expect(anchorAtOffset(10_000, mixed, 8)).toEqual({ line: 7, fraction: 1 });
  });

  test('an empty document has no anchor', () => {
    expect(anchorAtOffset(0, stubMetrics([]), 0)).toBeNull();
  });

  test('lineCount bounds the search even when the cache holds more rows', () => {
    // A panel whose virtualizer has not yet been re-created for a shorter book must not
    // report a line the book does not have.
    expect(anchorAtOffset(10_000, mixed, 3)).toEqual({ line: 2, fraction: 1 });
  });
});

describe('anchor round trip', () => {
  test('offset -> anchor -> offset is the identity on measured rows', () => {
    for (const offset of [0, 17, 40, 99, 140, 195]) {
      const anchor = anchorAtOffset(offset, mixed, 8);
      expect(anchor).not.toBeNull();
      expect(offsetForAnchor(anchor!, mixed)).toBeCloseTo(offset, 6);
    }
  });

  test('offset -> anchor -> offset is the identity inside an unmeasured run', () => {
    for (const offset of [200, 215, 230, 259]) {
      const anchor = anchorAtOffset(offset, mixed, 8);
      expect(offsetForAnchor(anchor!, mixed)).toBeCloseTo(offset, 6);
    }
  });

  test('crossing panels, the anchor line is exact and only the fraction is approximate', () => {
    // The same line is 100px tall in one panel and 250px in the other: the row tops line
    // up exactly, and the worst-case error anywhere inside the row is one line height.
    const left = stubMetrics([40, 100, 60]);
    const right = stubMetrics([90, 250, 70]);
    const anchor = anchorAtOffset(140, left, 3);
    expect(anchor).toEqual({ line: 2, fraction: 0 });
    expect(offsetForAnchor(anchor!, right)).toBe(340);
  });
});

describe('clampOffset', () => {
  test('never scrolls above the top or past the last scrollable pixel', () => {
    expect(clampOffset(-20, 1000, 400)).toBe(0);
    expect(clampOffset(250, 1000, 400)).toBe(250);
    expect(clampOffset(900, 1000, 400)).toBe(600);
  });

  test('a document shorter than its viewport has no scrollable range', () => {
    expect(clampOffset(50, 300, 400)).toBe(0);
  });
});

describe('estimateRowSize', () => {
  const chinese: RowEstimate = {
    lineHeight: 30,
    padding: 6,
    columnEm: 40,
    emPerChar: 1,
    bias: 1.08,
  };

  test('a blank line is one line tall', () => {
    expect(estimateRowSize(0, chinese)).toBe(36);
  });

  test('a line that fits the column is one line tall', () => {
    expect(estimateRowSize(30, chinese)).toBe(36);
  });

  test('a longer line is estimated at whole line heights', () => {
    expect(estimateRowSize(80, chinese)).toBe(3 * 30 + 6);
  });

  test('the bias rounds up at a wrap boundary, so a row settles rather than grows', () => {
    const unbiased = { ...chinese, bias: 1 };
    expect(estimateRowSize(39, unbiased)).toBe(36);
    expect(estimateRowSize(39, chinese)).toBe(2 * 30 + 6);
  });

  test('a panel whose text expands estimates the same source line taller', () => {
    const vietnamese: RowEstimate = { ...chinese, emPerChar: 2.2 };
    expect(estimateRowSize(30, vietnamese)).toBeGreaterThan(estimateRowSize(30, chinese));
  });

  test('a degenerate column width still yields a positive height', () => {
    expect(estimateRowSize(10, { ...chinese, columnEm: 0 })).toBeGreaterThan(0);
  });
});
