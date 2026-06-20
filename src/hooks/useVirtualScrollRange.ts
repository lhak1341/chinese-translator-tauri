import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { RefCallback } from 'react';
import { adaptiveBufferCalculator } from '../utils/ui';
import { logger } from '../utils/logger';

interface UseVirtualScrollRangeOptions {
  itemHeight: number;
  isActive?: boolean;
  scrollRestore?: number | null;
  onScrollSave?: (pos: number | null) => void;
}

export interface VirtualScrollRange {
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
  const [scrollVelocity, setScrollVelocity] = useState<number>(0);
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
          scrollVelocity,
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
  }, [containerHeight, totalItems, itemHeight, scrollVelocity, isScrolling, bufferSize]);

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
    const rawStart = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const startIndex = Math.min(rawStart, Math.max(0, totalItems - 1));
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const endIndex = Math.min(totalItems, startIndex + visibleCount + buffer * 2);
    return { startIndex, endIndex, visibleCount };
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
      setScrollTop(newScrollTop);
      setScrollVelocity(velocity);
      setIsScrolling(true);

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        setScrollVelocity(0);
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

  const scrollToTop = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: totalHeight, behavior: 'smooth' });
  }, [totalHeight]);

  const resetScroll = useCallback((): void => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
    setIsScrolling(false);
    setScrollVelocity(0);
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
  useEffect(() => {
    if (scrollRestore == null || !onScrollSave) return;
    const position = scrollRestore;
    let rafId: number | null = null;
    let attempts = 0;
    const maxAttempts = 60;

    const waitForRender = () => {
      attempts++;
      if (!scrollRef.current || !onScrollSave) return;
      const container = scrollRef.current;
      const isReady = container.scrollHeight > 0 && attempts > 3;
      if (isReady || attempts >= maxAttempts) {
        container.scrollTop = position;
        setScrollTop(position);
        onScrollSave(null);
      } else {
        rafId = requestAnimationFrame(waitForRender);
      }
    };

    rafId = requestAnimationFrame(waitForRender);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [scrollRestore, onScrollSave]);

  return {
    visibleRange,
    handleScroll,
    scrollToTop,
    scrollToBottom,
    scrollRefCallback,
    scrollRef,
    setScrollTop,
    resetScroll,
    isScrolling,
    scrollVelocity,
    containerHeight,
    withScrollPreservation,
    getScrollTop,
  };
}
