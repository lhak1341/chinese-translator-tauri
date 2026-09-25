import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { RefCallback } from 'react';
import { adaptiveBufferCalculator } from '../utils/ui';
import { logger } from '../utils/logger';
import { ScrollPositionRecovery } from '../utils/ui/ScrollPositionRecovery';
import type { AttemptFn } from '../utils/ui/ScrollPositionRecovery';

/** Total attempts (readiness-gated, then forced) the scroll-restore effect allows. */
export const SCROLL_RESTORE_MAX_ATTEMPTS = 60;

/**
 * Builds a fresh AttemptFn for one scroll-restore sequence — tracks its own attempt
 * count in closure, independent of ScrollPositionRecovery's own retry countdown, so
 * it mirrors exactly what the readiness heuristic needs: reject the first 3 frames
 * outright (a freshly remounted virtualized list reports scrollHeight === 0 before
 * layout settles), then require scrollHeight > 0, then force-write on the final
 * allowed attempt regardless of readiness so a restore request is never dropped.
 */
export function buildScrollRestoreAttempt(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  position: number,
  setScrollTop: (value: number) => void
): AttemptFn<number> {
  let attempts = 0;
  return () => {
    attempts++;
    const container = scrollRef.current;
    if (!container) return false;
    const isReady = container.scrollHeight > 0 && attempts > 3;
    if (!isReady && attempts < SCROLL_RESTORE_MAX_ATTEMPTS) return false;
    container.scrollTop = position;
    setScrollTop(position);
    return true;
  };
}

interface UseVirtualScrollRangeOptions {
  itemHeight: number;
  isActive?: boolean;
  scrollRestore?: number | null;
  onScrollSave?: (pos: number | null) => void;
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
  scrollToIndex: (index: number) => void;
  scrollRefCallback: RefCallback<HTMLDivElement>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  setScrollTop: React.Dispatch<React.SetStateAction<number>>;
  resetScroll: () => void;
  isScrolling: boolean;
  scrollVelocity: number;
  containerHeight: number;
  withScrollPreservation: (asyncFn: () => Promise<void>) => Promise<void>;
  getScrollTop: () => number;
}

export function useVirtualScrollRange(
  totalItems: number,
  options: UseVirtualScrollRangeOptions
): UseVirtualScrollRangeResult {
  const { itemHeight, isActive, scrollRestore, onScrollSave } = options;

  const [scrollTop, setScrollTop] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(600);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  // Velocity is a ref, not state: it changes on every scroll event, and as state it forced a
  // full table re-render per event even when the rendered row range had not moved.
  const scrollVelocityRef = useRef<number>(0);
  const [bufferSize, setBufferSize] = useState<number>(10);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTop = useRef<number>(0);
  const lastScrollTime = useRef<number>(Date.now());
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

  // Adaptive buffer sizing: adjusts bufferSize based on device performance,
  // viewport dimensions, and scroll velocity. Debounced 100ms to batch rapid changes.
  useEffect(() => {
    const calculate = async () => {
      try {
        const optimalSize = await adaptiveBufferCalculator.calculateOptimalBufferSize({
          containerHeight,
          itemHeight,
          totalItems,
          scrollVelocity: scrollVelocityRef.current,
          isScrolling,
        });
        if (
          typeof optimalSize === 'number' &&
          isFinite(optimalSize) &&
          optimalSize > 0 &&
          optimalSize !== bufferSize
        ) {
          setBufferSize(optimalSize);
        }
      } catch (error) {
        logger.warn('Buffer size calculation failed:', error);
      }
    };
    const timer = setTimeout(calculate, 100);
    return () => clearTimeout(timer);
  }, [containerHeight, totalItems, itemHeight, isScrolling, bufferSize]);

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
    // Floor bufferSize: fractional values (e.g. 22.5 from the medium tier 1.5× multiplier)
    // produce sub-pixel row positioning and a wrong gradient phase.
    const buffer = Math.floor(bufferSize);
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
  }, [scrollTop, containerHeight, totalItems, bufferSize, itemHeight]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      const frameStartTime = performance.now();
      const newScrollTop = e.currentTarget.scrollTop;
      const currentTime = Date.now();

      const timeDelta = currentTime - lastScrollTime.current;
      const scrollDelta = newScrollTop - lastScrollTop.current;
      const velocity = timeDelta > 0 ? scrollDelta / timeDelta : 0;

      lastScrollTop.current = newScrollTop;
      // Snap to the row boundary: the rendered range depends only on which row is at the top,
      // so sub-row scroll events now bail out of re-rendering (same state value) instead of
      // re-rendering the whole table on every pixel.
      setScrollTop(Math.floor(newScrollTop / itemHeight) * itemHeight);
      scrollVelocityRef.current = velocity;
      setIsScrolling(true);

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        scrollVelocityRef.current = 0;
      }, 150);

      const frameTime = performance.now() - frameStartTime;
      adaptiveBufferCalculator.trackScrollingMetrics({
        frameTime,
        scrollVelocity: velocity,
        scrollTop: newScrollTop,
        isScrolling: true,
        bufferSize,
        visibleItems: Math.ceil(containerHeight / itemHeight),
        totalItems,
      });

      lastScrollTime.current = currentTime;
    },
    [bufferSize, containerHeight, itemHeight, totalItems]
  );

  // Instant, not smooth: a smooth scroll across a 40k-row list animates through every row
  // range in between, rendering each one — seconds of jank for a jump the user wants now.
  const scrollToTop = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const scrollToBottom = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTop = totalHeight;
  }, [totalHeight]);

  /** Scrolls so row `index` is at the top of the viewport (clamped to the list). */
  const scrollToIndex = useCallback(
    (index: number): void => {
      if (!scrollRef.current) return;
      const clamped = Math.max(0, Math.min(index, totalItems - 1));
      scrollRef.current.scrollTop = clamped * itemHeight;
    },
    [totalItems, itemHeight]
  );

  const resetScroll = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
    setIsScrolling(false);
    scrollVelocityRef.current = 0;
    lastScrollTop.current = 0;
  }, []);

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

  const getScrollTop = useCallback((): number => scrollRef.current?.scrollTop ?? 0, []);

  // Restore scroll position from parent (survives unmount/remount).
  // RAF-retry waits for the virtualized list to finish rendering before restoring.
  // Delegates the retry/backoff mechanism to ScrollPositionRecovery (scheduler: 'raf'
  // preserves this hook's original frame-cadence polling — no exponential backoff).
  useEffect(() => {
    if (scrollRestore == null || !onScrollSave) return;

    const recovery = new ScrollPositionRecovery<number>(
      buildScrollRestoreAttempt(scrollRef, scrollRestore, setScrollTop)
    );

    // ScrollPositionRecovery's attemptFn is called maxRetryAttempts + 1 times total
    // (the initial RAF attempt, then maxRetryAttempts retries) — pass one less than
    // SCROLL_RESTORE_MAX_ATTEMPTS so the total call count matches exactly, and
    // buildScrollRestoreAttempt's own force-write on its final permitted call lines
    // up with ScrollPositionRecovery's own last attempt.
    recovery
      .restore(scrollRestore, {
        maxRetryAttempts: SCROLL_RESTORE_MAX_ATTEMPTS - 1,
        scheduler: 'raf',
      })
      .then(() => {
        onScrollSave(null);
      });

    return () => recovery.cancel();
  }, [scrollRestore, onScrollSave]);

  return {
    visibleRange,
    handleScroll,
    scrollToTop,
    scrollToBottom,
    scrollToIndex,
    scrollRefCallback,
    scrollRef,
    setScrollTop,
    resetScroll,
    isScrolling,
    scrollVelocity: scrollVelocityRef.current,
    containerHeight,
    withScrollPreservation,
    getScrollTop,
  };
}
