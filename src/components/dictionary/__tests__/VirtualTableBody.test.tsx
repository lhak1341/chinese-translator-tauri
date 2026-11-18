/**
 * VirtualTableBody owns the fixed-height list rule (`src/components/CLAUDE.md`, WebKit): rows
 * at their own absolute offsets inside a whole-list spacer, scroll anchoring off. The
 * Dictionary tab's two views and the Rules tab render through it, so these pins cover all three.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VirtualTableBody, type VirtualTableBodyProps } from '../VirtualTableBody';
import EntryContextMenu from '../EntryContextMenu';
import { RowShell, ITEM_HEIGHT } from '../TableBuildingBlocks';
import { useContextMenu } from '../../../hooks/useContextMenu';

type Scroll = VirtualTableBodyProps<string>['scroll'];

function fakeScroll(startIndex: number, endIndex: number): Scroll {
  return {
    visibleRange: {
      firstVisibleIndex: startIndex,
      startIndex,
      endIndex,
      visibleCount: endIndex - startIndex,
    },
    handleScroll: vi.fn(),
    scrollRefCallback: vi.fn(),
  };
}

const items = Array.from({ length: 100 }, (_, i) => `row-${i}`);

function rowWrapper(text: string): HTMLElement {
  // text -> RowShell -> absolute wrapper
  return screen.getByText(text).parentElement!;
}

describe('VirtualTableBody — row positions', () => {
  test('renders only the visible window, each row at its global index inside a whole-list spacer', () => {
    const renderRow = vi.fn((item: string, index: number) => (
      <RowShell index={index}>{item}</RowShell>
    ));
    render(
      <VirtualTableBody
        scroll={fakeScroll(20, 23)}
        items={items}
        getKey={(item) => item}
        renderRow={renderRow}
      />
    );

    expect(screen.queryByText('row-19')).toBeNull();
    expect(screen.queryByText('row-23')).toBeNull();
    expect(rowWrapper('row-20')).toHaveStyle({
      position: 'absolute',
      top: `${20 * ITEM_HEIGHT}px`,
      height: `${ITEM_HEIGHT}px`,
    });
    expect(rowWrapper('row-22')).toHaveStyle({ top: `${22 * ITEM_HEIGHT}px` });
    expect(rowWrapper('row-20').parentElement).toHaveStyle({
      position: 'relative',
      height: `${100 * ITEM_HEIGHT}px`,
    });
    expect(renderRow).toHaveBeenCalledWith('row-21', 21);
  });

  test('a row keeps its DOM node when a row is inserted above it', () => {
    const props = {
      getKey: (item: string) => item,
      renderRow: (item: string) => <span>{item}</span>,
    };
    const { rerender } = render(
      <VirtualTableBody scroll={fakeScroll(0, 2)} items={['b', 'c']} {...props} />
    );
    const before = screen.getByText('c');

    rerender(<VirtualTableBody scroll={fakeScroll(0, 3)} items={['a', 'b', 'c']} {...props} />);

    expect(screen.getByText('c')).toBe(before);
    expect(screen.getByText('c').parentElement).toHaveStyle({ top: `${2 * ITEM_HEIGHT}px` });
  });
});

describe('VirtualTableBody — scroll container', () => {
  test('turns scroll anchoring off over the caller style, and wires the scroll ref and handler', () => {
    const scroll = fakeScroll(0, 1);
    render(
      <VirtualTableBody
        scroll={scroll}
        items={['only']}
        getKey={(item) => item}
        renderRow={(item) => <span>{item}</span>}
        style={{ flex: 1, overflow: 'auto', overflowAnchor: 'auto' }}
      />
    );

    const scroller = vi.mocked(scroll.scrollRefCallback).mock.calls.at(-1)![0] as HTMLDivElement;
    expect(scroller).toBe(screen.getByRole('rowgroup'));
    expect(scroller.style.overflowAnchor).toBe('none');
    expect(scroller.style.flex).toContain('1');

    fireEvent.scroll(scroller);
    expect(scroll.handleScroll).toHaveBeenCalled();
  });

  test('a ref handed in (the menu trigger hands one) gets the scroller too', () => {
    const scroll = fakeScroll(0, 1);
    const ref = vi.fn();
    render(
      <VirtualTableBody
        ref={ref}
        scroll={scroll}
        items={['only']}
        getKey={(item) => item}
        renderRow={(item) => <span>{item}</span>}
      />
    );

    const scroller = screen.getByRole('rowgroup');
    expect(ref).toHaveBeenLastCalledWith(scroller);
    expect(scroll.scrollRefCallback).toHaveBeenLastCalledWith(scroller);
  });
});

describe('VirtualTableBody — as EntryContextMenu body', () => {
  function MenuTable({ scroll }: { scroll: Scroll }) {
    const menu = useContextMenu({ onEdit: vi.fn(), onMove: vi.fn(), onDelete: vi.fn() });
    return (
      <EntryContextMenu
        menu={menu}
        body={
          <VirtualTableBody
            scroll={scroll}
            items={['你好']}
            getKey={(item) => item}
            renderRow={(item, index) => (
              <RowShell
                index={index}
                onContextMenu={() => menu.handleContextMenu(item, 'xin chào', 'phrases')}
              >
                {item}
              </RowShell>
            )}
          />
        }
      />
    );
  }

  test('a right click on a row opens the menu, and the scroller still gets its ref and scroll', async () => {
    const scroll = fakeScroll(0, 1);
    render(<MenuTable scroll={scroll} />);

    const scroller = screen.getByRole('rowgroup');
    expect(scroll.scrollRefCallback).toHaveBeenLastCalledWith(scroller);
    fireEvent.scroll(scroller);
    expect(scroll.handleScroll).toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByText('你好'));
    expect(await screen.findByText('Delete Entry')).toBeInTheDocument();
  });
});
