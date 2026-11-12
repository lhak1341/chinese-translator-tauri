import type { Virtualizer } from '@tanstack/react-virtual';

/**
 * Throw away a virtualizer's row heights and read the mounted rows' heights again.
 *
 * `virtualizer.measure()` alone only clears the cache: a mounted row is measured again
 * only when its `ResizeObserver` fires, which needs its size to change *after* the clear.
 * An Appearance change resizes the rows before that (a hidden tab is `visibility: hidden`,
 * so its rows keep their layout and the observer reports them at once), so after a bare
 * `measure()` every row on screen sits at its character-count estimate while rendering at
 * its real height, and the rows overlap. Reading each mounted
 * row here puts the real heights straight back; rows off screen keep their estimates until
 * they mount, as before.
 */
export function remeasureRows<TItem extends Element>(
  virtualizer: Virtualizer<HTMLDivElement, TItem>
): void {
  virtualizer.measure();
  // Rebuild the measurement list from the estimates now. `resizeItem` compares a new height
  // with the list's size for that row, and until a rebuild that is still the old measured
  // height: a row whose height did not change would read as unchanged, be skipped, and fall
  // to its estimate at the next rebuild (seen in the app: 40 of 50 rows per panel).
  virtualizer.getVirtualItems();
  for (const element of virtualizer.elementsCache.values()) {
    if (!element.isConnected) continue;
    const index = virtualizer.indexFromElement(element);
    virtualizer.resizeItem(
      index,
      virtualizer.options.measureElement(element, undefined, virtualizer)
    );
  }
}
