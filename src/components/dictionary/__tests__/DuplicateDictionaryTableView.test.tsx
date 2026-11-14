/**
 * Tests for DuplicateDictionaryTableView — 4-column duplicate-mode row rendering.
 * Previously untested (architecture review 2026-07-17, candidate 4). Pure presentational
 * component, no hooks — rendered directly, no provider/composition wiring needed.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import DuplicateDictionaryTableView from '../DuplicateDictionaryTableView';
import { createDuplicateKey } from '../../../utils/dictionary';
import type { DuplicateRow } from '../../../utils/dictionary/DuplicateAnalyzer';

function makeRow(overrides: Partial<DuplicateRow> = {}): DuplicateRow {
  return {
    source: '你好',
    translation: 'xin chào',
    dictionaryId: 'phrases',
    dictionaryLabel: 'Phrases',
    ...overrides,
  };
}

function renderView(overrides: Record<string, any> = {}) {
  const onScroll = vi.fn();
  const scrollRefCallback = vi.fn();
  const onSelectEntry = vi.fn();
  const onSelectAll = vi.fn();
  const props = {
    scrollRefCallback,
    onScroll,
    totalHeight: 0,
    visibleDuplicateRows: [] as DuplicateRow[],
    startIndex: 0,
    duplicateGroupIndices: [] as number[],
    selectedEntries: new Set<string>(),
    onSelectEntry,
    allSelected: false,
    onSelectAll,
    ...overrides,
  };
  render(<DuplicateDictionaryTableView {...props} />);
  return { onScroll, scrollRefCallback, onSelectEntry, onSelectAll };
}

describe('DuplicateDictionaryTableView — header', () => {
  test('renders the 4 column headers', () => {
    renderView();
    expect(screen.getByText('Source Text')).toBeInTheDocument();
    expect(screen.getByText('Translation')).toBeInTheDocument();
    expect(screen.getByText('Dictionary')).toBeInTheDocument();
  });

  test('select-all checkbox reflects allSelected', () => {
    renderView({ allSelected: true });
    expect(screen.getByRole('checkbox', { name: 'Select all entries' })).toBeChecked();
  });

  test('select-all checkbox unchecked when allSelected is false', () => {
    renderView({ allSelected: false });
    expect(screen.getByRole('checkbox', { name: 'Select all entries' })).not.toBeChecked();
  });

  test('clicking the select-all checkbox calls onSelectAll', () => {
    const { onSelectAll } = renderView({ allSelected: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all entries' }));
    expect(onSelectAll).toHaveBeenCalledWith(true);
  });
});

describe('DuplicateDictionaryTableView — row rendering', () => {
  test('renders source, translation, and dictionaryLabel for each row', () => {
    const rows = [
      makeRow({ source: '你好', translation: 'xin chào', dictionaryLabel: 'Phrases' }),
      makeRow({
        source: '再见',
        translation: 'tạm biệt',
        dictionaryId: 'properNouns',
        dictionaryLabel: 'Proper Nouns',
      }),
    ];
    renderView({ visibleDuplicateRows: rows });

    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('xin chào')).toBeInTheDocument();
    expect(screen.getByText('再见')).toBeInTheDocument();
    expect(screen.getByText('tạm biệt')).toBeInTheDocument();
    expect(screen.getByText('Phrases')).toBeInTheDocument();
    expect(screen.getByText('Proper Nouns')).toBeInTheDocument();
  });

  test('renders a row for every entry in visibleDuplicateRows, keyed by createDuplicateKey', () => {
    // Same source text in two different dictionaries — createDuplicateKey (not source alone)
    // must disambiguate them, so both rows render instead of React deduping on a colliding key.
    const rows = [
      makeRow({ source: '你好', dictionaryId: 'phrases', dictionaryLabel: 'Phrases' }),
      makeRow({ source: '你好', dictionaryId: 'properNouns', dictionaryLabel: 'Proper Nouns' }),
    ];
    renderView({ visibleDuplicateRows: rows });

    expect(screen.getAllByText('你好')).toHaveLength(2);
    expect(screen.getByText('Phrases')).toBeInTheDocument();
    expect(screen.getByText('Proper Nouns')).toBeInTheDocument();
  });
});

describe('DuplicateDictionaryTableView — selection checkbox', () => {
  test('checkbox is unchecked when the row key is not in selectedEntries', () => {
    const row = makeRow();
    renderView({ visibleDuplicateRows: [row], selectedEntries: new Set<string>() });
    expect(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ })).not.toBeChecked();
  });

  test('checkbox is checked when the row key IS in selectedEntries', () => {
    const row = makeRow();
    const key = createDuplicateKey(row.source, row.dictionaryId);
    renderView({ visibleDuplicateRows: [row], selectedEntries: new Set([key]) });
    expect(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ })).toBeChecked();
  });

  test('clicking an unchecked checkbox calls onSelectEntry(key, true)', () => {
    const row = makeRow();
    const key = createDuplicateKey(row.source, row.dictionaryId);
    const { onSelectEntry } = renderView({
      visibleDuplicateRows: [row],
      selectedEntries: new Set<string>(),
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ }));
    expect(onSelectEntry).toHaveBeenCalledWith(key, true);
  });

  test('clicking a checked checkbox calls onSelectEntry(key, false)', () => {
    const row = makeRow();
    const key = createDuplicateKey(row.source, row.dictionaryId);
    const { onSelectEntry } = renderView({
      visibleDuplicateRows: [row],
      selectedEntries: new Set([key]),
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ }));
    expect(onSelectEntry).toHaveBeenCalledWith(key, false);
  });
});

describe('DuplicateDictionaryTableView — scroll wiring', () => {
  test('positions each row absolutely at its global index inside a totalHeight spacer', () => {
    renderView({
      totalHeight: 400,
      startIndex: 2,
      visibleDuplicateRows: [makeRow(), makeRow({ dictionaryId: 'properNouns' })],
    });

    const [first, second] = screen.getAllByText('你好');
    // cell -> RowShell -> absolute wrapper
    const firstWrapper = first.parentElement?.parentElement;
    const secondWrapper = second.parentElement?.parentElement;
    expect(firstWrapper).toHaveStyle({ position: 'absolute', top: '80px', height: '40px' });
    expect(secondWrapper).toHaveStyle({ position: 'absolute', top: '120px' });
    expect(firstWrapper?.parentElement).toHaveStyle({ height: '400px' });
  });

  test('disables scroll anchoring on the scroll container', () => {
    const { scrollRefCallback } = renderView({ visibleDuplicateRows: [makeRow()] });
    const container = scrollRefCallback.mock.calls.at(-1)![0] as HTMLDivElement;
    expect(container.style.overflowAnchor).toBe('none');
  });

  test('fires onScroll when the scroll container is scrolled', () => {
    let scrollNode: HTMLDivElement | null = null;
    const { onScroll } = renderView({
      visibleDuplicateRows: [makeRow()],
      scrollRefCallback: (node: HTMLDivElement | null) => {
        scrollNode = node;
      },
    });

    expect(scrollNode).not.toBeNull();
    fireEvent.scroll(scrollNode as unknown as HTMLDivElement);
    expect(onScroll).toHaveBeenCalled();
  });
});

describe('DuplicateDictionaryTableView — context menu', () => {
  test('right-click reports the row source, translation, and owning dictionary', () => {
    const onContextMenu = vi.fn();
    const rows = [
      makeRow({ source: '你好', translation: 'xin chào', dictionaryId: 'phrases' }),
      makeRow({ source: '你好', translation: 'chào', dictionaryId: 'properNouns-A' }),
    ];
    renderView({ visibleDuplicateRows: rows, onContextMenu });

    fireEvent.contextMenu(screen.getByText('chào'));

    expect(onContextMenu).toHaveBeenCalledWith('你好', 'chào', 'properNouns-A');
  });
});

describe('DuplicateDictionaryTableView — semantic column', () => {
  test('shows the active type for proper-noun rows and reports a change with the row', () => {
    const onSetSemanticType = vi.fn();
    const row = makeRow({
      source: '青云',
      dictionaryId: 'properNouns',
      dictionaryLabel: 'Proper Nouns',
      metadata: { semanticType: 'location' },
    });
    renderView({ visibleDuplicateRows: [row], onSetSemanticType });

    fireEvent.click(screen.getByLabelText('Set Organization for 青云 in Proper Nouns'));
    expect(onSetSemanticType).toHaveBeenCalledWith(row, 'organization');

    fireEvent.click(screen.getByLabelText('Set Location for 青云 in Proper Nouns'));
    expect(onSetSemanticType).toHaveBeenCalledWith(row, ''); // active chip clears
  });

  test('hides the chips for a phrase not allowed as a variable', () => {
    const row = makeRow({ source: '你好', dictionaryId: 'phrases', dictionaryLabel: 'Phrases' });
    renderView({ visibleDuplicateRows: [row], onSetSemanticType: vi.fn() });
    expect(screen.queryByLabelText(/^Set .* for 你好 in Phrases$/)).toBeNull();
  });

  test('shows the chips for a phrase allowed as a variable', () => {
    const row = makeRow({
      source: '你好',
      dictionaryId: 'phrases',
      dictionaryLabel: 'Phrases',
      metadata: { allowAsPatternVariable: true },
    });
    renderView({ visibleDuplicateRows: [row], onSetSemanticType: vi.fn() });
    expect(screen.getByLabelText('Set Character for 你好 in Phrases')).toBeInTheDocument();
  });
});

describe('DuplicateDictionaryTableView — group bands', () => {
  // The app paints dotted paper behind the table; a see-through band let it show in the rows.
  // The kit's TableRow paints the bands opaque (its own test pins the colours); each row here
  // takes its group's band.
  test('each group takes the next band: rows of adjacent groups stripe differently', () => {
    const rows = [
      makeRow({ source: '你好', translation: 'xin chào', dictionaryLabel: 'Phrases' }),
      makeRow({ source: '再见', translation: 'tạm biệt', dictionaryLabel: 'Phrases' }),
    ];
    renderView({ visibleDuplicateRows: rows, duplicateGroupIndices: [0, 1], totalHeight: 80 });
    const row = (text: string) => screen.getByText(text).closest('[role="row"]')!;
    expect(row('你好').hasAttribute('data-stripe')).toBe(false);
    expect(row('再见').hasAttribute('data-stripe')).toBe(true);
  });

  test('two rows of one group share its band', () => {
    const rows = [
      makeRow({ source: '你好', translation: 'xin chào', dictionaryLabel: 'Phrases' }),
      makeRow({ source: '你好', translation: 'chào', dictionaryLabel: 'Proper Nouns' }),
    ];
    renderView({ visibleDuplicateRows: rows, duplicateGroupIndices: [1, 1], totalHeight: 80 });
    const row = (text: string) => screen.getByText(text).closest('[role="row"]')!;
    expect(row('xin chào').hasAttribute('data-stripe')).toBe(true);
    expect(row('chào').hasAttribute('data-stripe')).toBe(true);
  });

  // One selected colour for every table, from the theme: was an undefined `--accent-light`
  // falling back to a fixed light blue here, and a fixed translucent green in the normal view.
  test('a selected row takes the theme soft accent, over its group band', () => {
    const rows = [
      makeRow({ source: '你好', translation: 'xin chào', dictionaryLabel: 'Phrases' }),
      makeRow({ source: '再见', translation: 'tạm biệt', dictionaryLabel: 'Phrases' }),
    ];
    renderView({
      visibleDuplicateRows: rows,
      duplicateGroupIndices: [0, 1],
      totalHeight: 80,
      selectedEntries: new Set([createDuplicateKey('再见', rows[1]!.dictionaryId)]),
    });
    // The kit paints a selected row with the theme's soft accent (--lk-accent-soft).
    const row = (text: string) => screen.getByText(text).closest('[role="row"]')!;
    expect(row('再见').hasAttribute('data-selected')).toBe(true);
    expect(row('你好').hasAttribute('data-selected')).toBe(false);
  });
});
