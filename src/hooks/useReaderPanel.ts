import { useCallback, useRef } from 'react';
import type React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Virtualizer } from '@tanstack/react-virtual';
import { estimateRowSize, virtualizerMetrics } from '../utils/reader/PanelSync';
import type { RowMetrics } from '../utils/reader/PanelSync';
import { useColumnMetrics } from './useColumnMetrics';

/**
 * `.readerLine`'s `line-height`, as a ratio rather than a pixel count: the font size under
 * it is the reader's own Appearance setting, so a panel at 1.25rem has rows a quarter
 * taller than one at 1rem and a fixed 30px would under-estimate every unvisited region of
 * the book by that much. Kept in step with the stylesheet by hand; the paragraph spacing
 * below a row is not, because it is a setting — `useColumnMetrics` measures that one.
 *
 * Both only have to be right for *unmeasured* rows — every mounted row is measured — but
 * they are what a never-visited region's scrollbar is built from.
 */
const ROW_LINE_HEIGHT_RATIO = 1.85;

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
}: UseReaderPanelOptions): ReaderPanelGeometry {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { columnEm, fontSizePx, rowPaddingPx } = useColumnMetrics(scrollRef);

  // "Latest ref" pattern: `estimateSize` below is referentially stable, so a re-render
  // never makes the virtualizer treat its estimates as new. A resize reaches the estimate
  // through this ref, by way of the virtualizer's own resize handling.
  const liveRef = useRef({ columnEm, fontSizePx, rowPaddingPx, emPerChar, charCountAt });
  liveRef.current = { columnEm, fontSizePx, rowPaddingPx, emPerChar, charCountAt };

  const estimateSize = useCallback(
    (index: number): number =>
      estimateRowSize(liveRef.current.charCountAt(index), {
        lineHeight: liveRef.current.fontSizePx * ROW_LINE_HEIGHT_RATIO,
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
