/**
 * Line-anchored cross-panel scrolling: the arithmetic, with no DOM in it.
 *
 * The Reader shows the same book in three panels of different natural heights. Keeping
 * the line being read level across all three is a mapping problem, and the unit of the
 * mapping is deliberately the **line index**, never a pixel ratio.
 *
 * Why not pixels: with tens of rows visible out of 75,000+, virtually every row is
 * unmeasured at any instant, so each panel's total height is a large and shifting
 * estimate. A pixel-derived mapping (`scrollTop / scrollHeight`) compounds three such
 * errors — one per panel — and grows worse with distance from the measured region. A line
 * index has zero error by construction; only the sub-line fraction is approximate, and
 * that error is bounded by one line height, at the one place alignment is looked at.
 */

/** A reading position as the panels exchange it: a line, and how far into it (0..1). */
export interface LineAnchor {
  line: number;
  fraction: number;
}

/**
 * One panel's measurement cache, as this module needs to see it.
 *
 * Both methods answer for *every* index, measured or not: a virtualizer falls back to its
 * `estimateSize` for rows it has never mounted, which is why the estimate has to be good
 * (see {@link estimateRowSize}) rather than merely present.
 */
export interface RowMetrics {
  /** Top of the row at `index`, in this panel's own pixels. */
  start: (index: number) => number;
  /** Height of the row at `index`, in this panel's own pixels. */
  size: (index: number) => number;
}

function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.max(0, Math.min(1, fraction));
}

/**
 * Where a panel must be scrolled so that `anchor` sits at the top of its viewport.
 *
 * The fraction is applied to *this* panel's own row height, not the driving panel's: the
 * same line is a different number of pixels tall in each panel, and the point of the
 * mapping is that only the line tops are guaranteed to agree.
 */
export function offsetForAnchor(anchor: LineAnchor, metrics: RowMetrics): number {
  const size = metrics.size(anchor.line);
  const start = metrics.start(anchor.line);
  if (!(size > 0)) return start;
  return start + clampFraction(anchor.fraction) * size;
}

/**
 * Which line sits at `scrollTop`, and how far into it — the inverse of
 * {@link offsetForAnchor}.
 *
 * Binary search, not a scan: the caller runs this once per animation frame during a drag,
 * and a linear walk over 75,000 rows per frame is the difference between a smooth drag and
 * a stuttering one. Row starts are non-decreasing in index, which is what makes the search
 * valid — including across unmeasured rows, whose estimated heights are still positive.
 */
export function anchorAtOffset(
  scrollTop: number,
  metrics: RowMetrics,
  lineCount: number
): LineAnchor | null {
  if (lineCount <= 0) return null;
  if (!(scrollTop > 0)) return { line: 0, fraction: 0 };

  let low = 0;
  let high = lineCount - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (metrics.start(middle) <= scrollTop) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  const size = metrics.size(low);
  const fraction = size > 0 ? clampFraction((scrollTop - metrics.start(low)) / size) : 0;
  return { line: low, fraction };
}

/**
 * A virtualizer's measurement cache, as {@link RowMetrics}.
 *
 * `measurementsCache` holds an entry per line — measured where the row has been mounted,
 * `estimateSize` where it has not — which is exactly the "measured or estimated, but
 * always an answer" contract above. The fallbacks are for the first frames, before the
 * cache has been built at all. Structurally typed rather than importing the virtualizer,
 * so this module stays arithmetic with no library in it.
 */
export function virtualizerMetrics(virtualizer: {
  measurementsCache: Array<{ start: number; size: number }>;
  options: { estimateSize: (index: number) => number };
}): RowMetrics {
  return {
    start: (index) =>
      virtualizer.measurementsCache[index]?.start ??
      index * virtualizer.options.estimateSize(index),
    size: (index) =>
      virtualizer.measurementsCache[index]?.size ?? virtualizer.options.estimateSize(index),
  };
}

/** Hold an offset inside what the panel can actually scroll to. */
export function clampOffset(offset: number, scrollHeight: number, clientHeight: number): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.max(0, Math.min(max, offset));
}

/** The inputs a panel's unmeasured-row estimate is calibrated from. */
export interface RowEstimate {
  /** Height of one wrapped visual line, in px. */
  lineHeight: number;
  /** The row's vertical padding, top plus bottom, in px. */
  padding: number;
  /** Width of the text column, in `em` of this panel's own font size. */
  columnEm: number;
  /**
   * Width one source Chinese character occupies in this panel, in em: 1 for the Chinese
   * panel, where a character is one em wide by definition, and more where that character
   * becomes a longer run of Latin text.
   */
  emPerChar: number;
  /**
   * Upward bias on the estimated width. Applied to the width rather than the height, so
   * it only ever changes the answer near a wrap boundary — a short line is certainly one
   * line tall and stays estimated at one. The bias is there because the two errors are not
   * symmetric to read: a row that shrinks when it is measured reads as settling, one that
   * grows reads as the page fighting you.
   */
  bias: number;
}

/**
 * Height to assume for a row that has never been mounted, from its Chinese character
 * count.
 *
 * A fixed-height skeleton is the alternative, and it is worse: its error is systematic
 * rather than random, so long lines are underestimated every time and the error
 * accumulates monotonically down the document instead of cancelling.
 */
export function estimateRowSize(charCount: number, estimate: RowEstimate): number {
  const columnEm = Math.max(1, estimate.columnEm);
  const widthEm = Math.max(0, charCount) * estimate.emPerChar * estimate.bias;
  const wrapped = Math.max(1, Math.ceil(widthEm / columnEm));
  return wrapped * estimate.lineHeight + estimate.padding;
}
