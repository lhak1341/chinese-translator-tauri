/**
 * Scroll Helpers
 *
 * Pure utility functions for DOM scrolling operations.
 * Provides reusable scroll-related functionality for UI components.
 */

import type { MutableRefObject, RefObject } from 'react';

/**
 * Scrolls a container to bring a highlighted element into view
 *
 * Finds an element with the given data-unit-index attribute within the container
 * and smoothly scrolls it to the center of the viewport.
 *
 * @param containerRef - React ref to the container element
 * @param unitIndex - The unit index to scroll to
 *
 * @example
 * const textRef = useRef<HTMLDivElement>(null);
 * scrollToHighlightedElement(textRef, 5);
 * // Scrolls to element with data-unit-index="5"
 */
export function scrollToHighlightedElement(
  containerRef: RefObject<HTMLElement>,
  unitIndex: number
): void {
  if (!containerRef.current) return;

  // Find the highlighted element within the container
  const highlightedElement = containerRef.current.querySelector(`[data-unit-index="${unitIndex}"]`);

  if (highlightedElement) {
    highlightedElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center', // Center the element in the viewport
      inline: 'nearest',
    });
  }
}

/**
 * Schedules a delayed scroll-to-highlighted-element, guarded by component mount status.
 *
 * Shared scheduling logic for click handlers that highlight a unit and then auto-scroll
 * one or more panels to it after a delay. Always clears any previously-pending timeout
 * first. Only schedules a new timeout if the component is still mounted at call time, and
 * re-checks mount status again when the timeout fires (mount status can change during the
 * delay window). Nulls `timeoutRef.current` once the scroll(s) have run.
 *
 * @param timeoutRef - Ref holding the pending timeout id (or null)
 * @param isMountedRef - Ref tracking whether the owning component is still mounted
 * @param refs - Container refs to scroll to `targetIndex` (one call per ref)
 * @param targetIndex - The unit index to scroll to in each container
 * @param delayMs - Delay before scrolling, in milliseconds
 *
 * @example
 * scheduleHighlightScroll(highlightScrollTimeoutRef, isMountedRef, [originalTextRef], 5, HIGHLIGHT_SCROLL_DELAY_MS);
 */
export function scheduleHighlightScroll(
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  isMountedRef: RefObject<boolean>,
  refs: RefObject<HTMLElement>[],
  targetIndex: number,
  delayMs: number
): void {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }

  if (isMountedRef.current) {
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        refs.forEach((ref) => scrollToHighlightedElement(ref, targetIndex));
        timeoutRef.current = null;
      }
    }, delayMs);
  }
}
