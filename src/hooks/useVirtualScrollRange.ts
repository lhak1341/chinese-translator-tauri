import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { RefCallback } from 'react';

/** Rows rendered above and below the visible window. Rows are a fixed height, so this is a constant. */
const OVERSCAN_ROWS = 10;

interface UseVirtualScrollRangeOptions {
  itemHeight: number;
  isActive?: boolean;
  /** Identifies the list being shown. When it changes, the view returns to the top: the
   * scroll position belongs to the old list. */
  resetKey?: string;
}

export interface VirtualScrollRange {
  /** First row actually at the top of the viewport (startIndex minus the buffer). */
  firstVisibleIndex: number;
  startIndex: number;
  endIndex: number;
  visibleCount: number;
}

export interface UseVirtualScrollRangeResult {
  visibleRange: VirtualScrollRange;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  scrollRefCallback: RefCallback<HTMLDivElement>;
  withScrollPreservation: (asyncFn: () => Promise<void>) => Promise<void>;
}

export function useVirtualScrollRange(
  totalItems: number,
  options: UseVirtualScrollRangeOptions
): UseVirtualScrollRangeResult {
  const { itemHeight, isActive, resetKey } = options;

  const [scrollTop, setScrollTop] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(600);

  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Remeasure when tab becomes active (fixes virtualization on tab switch)
  useEffect(() => {
    if (isActive && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const height = scrollRef.current.clientHeight;
          if (height > 0) setContainerHeight(height);
        }
      });
    }
  }, [isActive]);

  const scrollRefCallback: RefCallback<HTMLDivElement> = useCallback((node) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    scrollRef.current = node;
    if (node) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });
      resizeObserver.observe(node);
      resizeObserverRef.current = resizeObserver;
    }
  }, []);

  const totalHeight = totalItems * itemHeight;

  const visibleRange = useMemo((): VirtualScrollRange => {
    const buffer = OVERSCAN_ROWS;
    // Clamp startIndex so a stale scrollTop (before a search that shrank the list) never
    // pushes startIndex past the end, which would leave visibleEntries empty.
    const firstVisibleIndex = Math.min(
      Math.floor(scrollTop / itemHeight),
      Math.max(0, totalItems - 1)
    );
    const rawStart = Math.max(0, firstVisibleIndex - buffer);
    const startIndex = Math.min(rawStart, Math.max(0, totalItems - 1));
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const endIndex = Math.min(totalItems, startIndex + visibleCount + buffer * 2);
    return { firstVisibleIndex, startIndex, endIndex, visibleCount };
  }, [scrollTop, containerHeight, totalItems, itemHeight]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      // Snap to the row boundary: the rendered range depends only on which row is at the top,
      // so sub-row scroll events bail out of re-rendering (same state value) instead of
      // re-rendering the whole table on every pixel.
      setScrollTop(Math.floor(e.currentTarget.scrollTop / itemHeight) * itemHeight);
    },
    [itemHeight]
  );

  // Instant, not smooth: a smooth scroll across a 40k-row list animates through every row
  // range in between, rendering each one — seconds of jank for a jump the user wants now.
  const scrollToTop = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const scrollToBottom = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTop = totalHeight;
  }, [totalHeight]);

  // A new list starts at the top. Skips the first render: a fresh list is already there.
  const lastResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  const withScrollPreservation = useCallback(
    async (asyncFn: () => Promise<void>): Promise<void> => {
      const savedScroll = scrollRef.current?.scrollTop ?? 0;
      await asyncFn();
      requestAnimationFrame(() => {
        if (scrollRef.current && scrollRef.current.scrollTop !== savedScroll) {
          scrollRef.current.scrollTop = savedScroll;
          setScrollTop(savedScroll);
        }
      });
    },
    []
  );

  return {
    visibleRange,
    handleScroll,
    scrollToTop,
    scrollToBottom,
    scrollRefCallback,
    withScrollPreservation,
  };
}
