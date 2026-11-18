import React, { useCallback } from 'react';
import { TableBody } from '@lhak/style/react';
import { ITEM_HEIGHT } from './TableBuildingBlocks';
import type { UseVirtualScrollRangeResult } from '../../hooks/useVirtualScrollRange';

export interface VirtualTableBodyProps<T> extends Omit<
  React.ComponentProps<'div'>,
  'children' | 'onScroll'
> {
  /** The list's `useVirtualScrollRange` result. The caller keeps it: the row-position bar and
   * the scroll buttons read it too. */
  scroll: Pick<UseVirtualScrollRangeResult, 'visibleRange' | 'handleScroll' | 'scrollRefCallback'>;
  /** Every row of the list, not the rendered slice. */
  items: readonly T[];
  /** A row's identity, stable across inserts and deletes: an index in the key remounted every
   * row below an insert and dropped its inline-edit state. */
  getKey: (item: T) => string;
  /** One row (a `RowShell`), given its global index for its band and `aria-rowindex`. */
  renderRow: (item: T, index: number) => React.ReactNode;
}

/**
 * The scroll container and rows of a fixed-height (`ITEM_HEIGHT`) virtualized table: the
 * Dictionary tab's two views and the Rules tab. See GLOSSARY.md "Virtual table body".
 *
 * It renders only the rows `scroll.visibleRange` covers, each absolutely positioned at its own
 * global index inside a spacer as tall as the whole list, with scroll anchoring off. Nothing
 * shifts in layout when rows enter or leave the rendered window. The earlier translateY'd slice
 * shifted every row up a row's height whenever the top buffer row was dropped; WebKit's scroll
 * anchoring "corrected" that by pulling scrollTop back, which re-added the row: flicker, then
 * stuck (`src/components/CLAUDE.md`, WebKit). Each row paints its own opaque band (the kit's
 * `TableRow`); behind the spacer is the kit body's solid surface.
 *
 * It can be `EntryContextMenu`'s `body`: the props and ref the menu's trigger hands it land on
 * the scroll container, the ref alongside `scroll.scrollRefCallback`.
 */
export function VirtualTableBody<T>({
  scroll,
  items,
  getKey,
  renderRow,
  ref,
  style,
  ...bodyProps
}: VirtualTableBodyProps<T>) {
  const { scrollRefCallback, handleScroll } = scroll;
  const { startIndex, endIndex } = scroll.visibleRange;

  const setNode = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRefCallback(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [scrollRefCallback, ref]
  );

  return (
    <TableBody
      {...bodyProps}
      ref={setNode}
      onScroll={handleScroll}
      style={{ ...style, overflowAnchor: 'none' }}
    >
      <div style={{ height: items.length * ITEM_HEIGHT, position: 'relative' }}>
        {items.slice(startIndex, endIndex).map((item, offset) => {
          const index = startIndex + offset;
          return (
            <div
              key={getKey(item)}
              style={{
                position: 'absolute',
                top: index * ITEM_HEIGHT,
                left: 0,
                right: 0,
                height: ITEM_HEIGHT,
              }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </TableBody>
  );
}
