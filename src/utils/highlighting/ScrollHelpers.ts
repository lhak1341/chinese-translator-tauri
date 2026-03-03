/**
 * Scroll Helpers
 *
 * Pure utility functions for DOM scrolling operations.
 * Provides reusable scroll-related functionality for UI components.
 */

import type { RefObject } from 'react';

/**
 * Scrolls a container to bring a highlighted element into view
 *
 * Finds an element with the given data-unit-index attribute within the container
 * and smoothly scrolls it to the center of the viewport.
 *
 * @param containerRef - React ref to the container element
 * @param unitIndex - The unit index to scroll to (or array of indices for multi-select)
 *
 * @example
 * const textRef = useRef<HTMLDivElement>(null);
 * scrollToHighlightedElement(textRef, 5);
 * // Scrolls to element with data-unit-index="5"
 */
export function scrollToHighlightedElement(
  containerRef: RefObject<HTMLElement>,
  unitIndex: number | number[]
): void {
  if (!containerRef.current) return;

  // Handle array of indices (multi-select) - scroll to first one
  const targetIndex = Array.isArray(unitIndex) ? unitIndex[0] : unitIndex;

  // Find the highlighted element within the container
  const highlightedElement = containerRef.current.querySelector(
    `[data-unit-index="${targetIndex}"]`
  );

  if (highlightedElement) {
    highlightedElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center', // Center the element in the viewport
      inline: 'nearest',
    });
  }
}
