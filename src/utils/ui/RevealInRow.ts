/**
 * Horizontal scrolling that keeps one item of a scrollable row fully in view.
 *
 * The Add form's quick-switch row (`DictionaryEntry.tsx`) scrolls sideways with its
 * scrollbar hidden, so a chip picked by keyboard (⌘3/⌘4 cycling, ⌥1–9) can land partly or
 * wholly outside the visible part of the row.
 */

/** Where an item and the row's visible window sit, in the row's scroll coordinates. */
export interface RowGeometry {
  itemStart: number;
  itemEnd: number;
  scrollLeft: number;
  viewWidth: number;
}

/**
 * The `scrollLeft` that brings the item fully into view with `margin` pixels to spare, or
 * `null` when it already is. Scrolls as little as possible, like `scrollIntoView`'s
 * `'nearest'`; an item wider than the view aligns its start.
 */
export function scrollLeftToReveal(geometry: RowGeometry, margin = 12): number | null {
  const { itemStart, itemEnd, scrollLeft, viewWidth } = geometry;
  const viewEnd = scrollLeft + viewWidth;
  if (itemStart - margin < scrollLeft) return Math.max(0, itemStart - margin);
  if (itemEnd + margin > viewEnd) {
    const next = itemEnd + margin - viewWidth;
    return Math.max(0, Math.min(next, itemStart - margin));
  }
  return null;
}

/** Scroll `row` so `item`, one of its descendants, is fully visible. */
export function revealInRow(row: HTMLElement, item: HTMLElement, margin?: number): void {
  const rowRect = row.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const itemStart = itemRect.left - rowRect.left + row.scrollLeft;
  const next = scrollLeftToReveal(
    {
      itemStart,
      itemEnd: itemStart + itemRect.width,
      scrollLeft: row.scrollLeft,
      viewWidth: row.clientWidth,
    },
    margin
  );
  if (next !== null) row.scrollLeft = next;
}

/**
 * Which edges of a sideways-scrolling row have content hidden past them — where the row
 * shows a fade. 1px of slack absorbs the fractional `scrollLeft` WebKit reports at the ends.
 */
export function hiddenEdges(row: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): { left: boolean; right: boolean } {
  return {
    left: row.scrollLeft > 1,
    right: row.scrollLeft + row.clientWidth < row.scrollWidth - 1,
  };
}

/** Mark `row` with `data-fade-left`/`data-fade-right` for the edges `hiddenEdges` finds. */
export function markHiddenEdges(row: HTMLElement): void {
  const { left, right } = hiddenEdges(row);
  row.toggleAttribute('data-fade-left', left);
  row.toggleAttribute('data-fade-right', right);
}
