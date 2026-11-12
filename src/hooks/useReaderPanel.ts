import { useCallback, useRef } from 'react';
import type React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Virtualizer } from '@tanstack/react-virtual';
import { estimateRowSize, virtualizerMetrics } from '../utils/reader/PanelSync';
import type { RowMetrics } from '../utils/reader/PanelSync';
import { useColumnMetrics } from './useColumnMetrics';

/**
 * Upward bias on an estimated row width. A row that shrinks when it is measured reads as
 * settling; one that grows reads as the page fighting the reader.
 */
const ROW_ESTIMATE_BIAS = 1.08;

/** Rows rendered outside the viewport, so a flick does not expose blank space. */
export const OVERSCAN_ROWS = 24;

export interface UseReaderPanelOptions {
  lineCount: number;
  /**
   * How wide one source Chinese character renders in this panel, in em: 1 for the Chinese
   * source, more where that character becomes a longer run of Latin text.
   */
  emPerChar: number;
  /** Chinese characters on this line — the estimate's only input. Must be stable. */
  charCountAt: (index: number) => number;
  /**
   * Whether this line is one of the file's own paragraph breaks, which renders at zero
   * height (see `PanelRow.isBlank`). Estimated at zero too, or a blank-heavy book's
   * scrollbar would claim a document several times the height of the one that renders.
   *
   * Not derivable from `charCountAt` returning 0: that is also an unfetched line, which
   * keeps its full height. Must be stable.
   */
  isBlankAt: (index: number) => boolean;
}

export interface ReaderPanelGeometry {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** This panel's measurement cache, for cross-panel anchoring. */
  metrics: RowMetrics;
}

/**
 * One Reader panel's scrolling geometry: its element, its virtualizer, and the
 * measurement cache the cross-panel sync reads.
 *
 * Each panel keeps its **natural heights** — the same line is a different number of pixels
 * tall in each — so each needs a virtualizer of its own, differing only in how wide it
 * expects one source character to render.
 */
export function useReaderPanel({
  lineCount,
  emPerChar,
  charCountAt,
  isBlankAt,
}: UseReaderPanelOptions): ReaderPanelGeometry {
  const scrollRef = useRef<HTMLDivElement>(null);
  // The line height and paragraph spacing are the panel's Appearance settings, measured
  // from it. They only have to be right for *unmeasured* rows (every mounted row is
  // measured), but they are what a never-visited region's scrollbar is built from.
  const { columnEm, lineHeightPx, rowPaddingPx } = useColumnMetrics(scrollRef);

  // "Latest ref" pattern: `estimateSize` below is referentially stable, so a re-render
  // never makes the virtualizer treat its estimates as new. A resize reaches the estimate
  // through this ref, by way of the virtualizer's own resize handling.
  const liveRef = useRef({
    columnEm,
    lineHeightPx,
    rowPaddingPx,
    emPerChar,
    charCountAt,
    isBlankAt,
  });
  liveRef.current = { columnEm, lineHeightPx, rowPaddingPx, emPerChar, charCountAt, isBlankAt };

  const estimateSize = useCallback(
    (index: number): number =>
      liveRef.current.isBlankAt(index)
        ? 0
        : estimateRowSize(liveRef.current.charCountAt(index), {
            lineHeight: liveRef.current.lineHeightPx,
            padding: liveRef.current.rowPaddingPx,
            columnEm: liveRef.current.columnEm,
            emPerChar: liveRef.current.emPerChar,
            bias: ROW_ESTIMATE_BIAS,
          }),
    []
  );

  const virtualizer = useVirtualizer({
    count: lineCount,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: OVERSCAN_ROWS,
  });

  return { scrollRef, virtualizer, metrics: virtualizerMetrics(virtualizer) };
}
