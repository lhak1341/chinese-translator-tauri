import { describe, expect, test } from 'vitest';
import { Virtualizer } from '@tanstack/react-virtual';
import { remeasureRows } from '../RowRemeasure';

/**
 * A real virtualizer over three mounted rows whose rendered heights the test sets by hand
 * (`data-height`): happy-dom has no layout, so the `measureElement` option reads that
 * attribute where the browser would read the row's box.
 */
function mountedRows(heights: number[]) {
  const scrollEl = document.createElement('div');
  document.body.appendChild(scrollEl);
  const virtualizer = new Virtualizer<HTMLDivElement, HTMLDivElement>({
    count: heights.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 10,
    scrollToFn: () => {},
    observeElementRect: () => {},
    observeElementOffset: () => {},
    measureElement: (element) => Number(element.dataset.height),
  });
  // A render reads the measurements before any row mounts, as `getVirtualItems` does.
  virtualizer.getMeasurements();
  const rows = heights.map((height, index) => {
    const row = document.createElement('div');
    row.dataset.index = String(index);
    row.dataset.height = String(height);
    scrollEl.appendChild(row);
    virtualizer.measureElement(row);
    return row;
  });
  // The render after the rows mounted rebuilds the measurements from their real heights,
  // as the Reader's does: a relayout starts from a list that already holds them.
  virtualizer.getMeasurements();
  const sizes = () => virtualizer.getMeasurements().map((item) => item.size);
  return { virtualizer, rows, sizes };
}

describe('remeasureRows', () => {
  test('re-reads every mounted row, so none falls back to its estimate', () => {
    // An Appearance change already resized the rows (the ResizeObserver saw it); the
    // relayout that follows must not leave them at the 10px estimate.
    const { virtualizer, rows, sizes } = mountedRows([30, 30, 30]);
    rows.forEach((row) => (row.dataset.height = '50'));

    remeasureRows(virtualizer);

    expect(sizes()).toEqual([50, 50, 50]);
  });

  test('a row whose height did not change keeps it', () => {
    const { virtualizer, sizes } = mountedRows([30, 30, 30]);

    remeasureRows(virtualizer);

    expect(sizes()).toEqual([30, 30, 30]);
  });

  test('a row that has left the document is dropped, not measured', () => {
    const { virtualizer, rows, sizes } = mountedRows([30, 30, 30]);
    rows[2].remove();

    remeasureRows(virtualizer);

    expect(sizes()).toEqual([30, 30, 10]);
  });
});
