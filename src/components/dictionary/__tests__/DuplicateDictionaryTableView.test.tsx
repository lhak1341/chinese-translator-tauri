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
  const onSearchChange = vi.fn();
  const onScroll = vi.fn();
  const scrollRefCallback = vi.fn();
  const onSelectEntry = vi.fn();
  const onSelectAll = vi.fn();
  const props = {
    searchTerm: '',
    onSearchChange,
    scrollRefCallback,
    onScroll,
    totalHeight: 0,
    offsetY: 0,
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
  return { onSearchChange, onScroll, scrollRefCallback, onSelectEntry, onSelectAll };
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

describe('DuplicateDictionaryTableView — search', () => {
  test('reflects searchTerm in the input value', () => {
    renderView({ searchTerm: '你好' });
    expect(screen.getByPlaceholderText('Search duplicates...')).toHaveValue('你好');
  });

  test('calls onSearchChange with the new value on input', () => {
    const { onSearchChange } = renderView();
    fireEvent.change(screen.getByPlaceholderText('Search duplicates...'), {
      target: { value: '再见' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('再见');
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
  test('sets totalHeight and translateY(offsetY) on the scroll container', () => {
    renderView({ totalHeight: 400, offsetY: 80, visibleDuplicateRows: [makeRow()] });

    const sourceCell = screen.getByText('你好');
    // Walk up to the translateY wrapper (parent of the row div).
    const translateWrapper = sourceCell.parentElement?.parentElement;
    expect(translateWrapper).toHaveStyle({ transform: 'translateY(80px)' });

    const heightWrapper = translateWrapper?.parentElement;
    expect(heightWrapper).toHaveStyle({ height: '400px' });
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
