/**
 * Tests for DuplicateDictionaryTableView — 4-column duplicate-mode row rendering.
 * Previously untested (architecture review 2026-07-17, candidate 4). Pure presentational
 * component, no hooks — rendered directly, no provider/composition wiring needed.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import DuplicateDictionaryTableView from '../DuplicateDictionaryTableView';
import type { EntryRef } from '../../../utils/dictionary/DictionaryEdit';
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

const entryOf = (row: DuplicateRow): EntryRef => ({
  dictionaryId: row.dictionaryId,
  key: row.source,
});

/** `selected` lists the entries the selection holds. */
function renderView({ selected = [], ...overrides }: Record<string, any> = {}) {
  const onSelectEntry = vi.fn();
  const onSelectAll = vi.fn();
  const rows: DuplicateRow[] = overrides.rows ?? [];
  // Every row in view: the window itself is VirtualTableBody's, tested there.
  const scroll = {
    visibleRange: {
      firstVisibleIndex: 0,
      startIndex: 0,
      endIndex: rows.length,
      visibleCount: rows.length,
    },
    handleScroll: vi.fn(),
    scrollRefCallback: vi.fn(),
  };
  const props = {
    scroll,
    rows,
    duplicateGroupIndices: [] as number[],
    isSelected: (ref: EntryRef) =>
      (selected as EntryRef[]).some(
        (s) => s.dictionaryId === ref.dictionaryId && s.key === ref.key
      ),
    onSelectEntry,
    allSelected: false,
    onSelectAll,
    ...overrides,
  };
  render(<DuplicateDictionaryTableView {...props} />);
  return { onSelectEntry, onSelectAll };
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
    renderView({ rows: rows });

    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('xin chào')).toBeInTheDocument();
    expect(screen.getByText('再见')).toBeInTheDocument();
    expect(screen.getByText('tạm biệt')).toBeInTheDocument();
    expect(screen.getByText('Phrases')).toBeInTheDocument();
    expect(screen.getByText('Proper Nouns')).toBeInTheDocument();
  });

  test('renders a row for every entry in rows, keyed by its entry', () => {
    // Same source text in two different dictionaries. React renders both rows even when their
    // keys collide and only warns, so the row count alone pins no key: the warning is the
    // symptom of a key built from the source alone.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rows = [
      makeRow({ source: '你好', dictionaryId: 'phrases', dictionaryLabel: 'Phrases' }),
      makeRow({ source: '你好', dictionaryId: 'properNouns', dictionaryLabel: 'Proper Nouns' }),
    ];
    try {
      renderView({ rows: rows });

      expect(screen.getAllByText('你好')).toHaveLength(2);
      expect(screen.getByText('Phrases')).toBeInTheDocument();
      expect(screen.getByText('Proper Nouns')).toBeInTheDocument();
      const keyWarnings = consoleError.mock.calls.filter((args) =>
        args.some((arg) => String(arg).includes('same key'))
      );
      expect(keyWarnings).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('DuplicateDictionaryTableView — selection checkbox', () => {
  test('checkbox is unchecked when the row entry is not selected', () => {
    const row = makeRow();
    renderView({ rows: [row] });
    expect(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ })).not.toBeChecked();
  });

  test('checkbox is checked when the row entry IS selected', () => {
    const row = makeRow();
    renderView({ rows: [row], selected: [entryOf(row)] });
    expect(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ })).toBeChecked();
  });

  test('clicking an unchecked checkbox calls onSelectEntry(entry, true)', () => {
    const row = makeRow();
    const { onSelectEntry } = renderView({ rows: [row] });

    fireEvent.click(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ }));
    expect(onSelectEntry).toHaveBeenCalledWith({ dictionaryId: 'phrases', key: '你好' }, true);
  });

  test('clicking a checked checkbox calls onSelectEntry(entry, false)', () => {
    const row = makeRow();
    const { onSelectEntry } = renderView({ rows: [row], selected: [entryOf(row)] });

    fireEvent.click(screen.getByRole('checkbox', { name: /Select 你好 from Phrases/ }));
    expect(onSelectEntry).toHaveBeenCalledWith(entryOf(row), false);
  });

  // The old composite key `source::dictionaryId` threw on such a source while rendering, which
  // would have taken every tab down through the provider's error boundary.
  test('a row whose source holds "::" renders and selects by its own entry', () => {
    const row = makeRow({ source: 'a::b', translation: 'ab' });
    const { onSelectEntry } = renderView({ rows: [row] });

    fireEvent.click(screen.getByRole('checkbox', { name: /Select a::b from Phrases/ }));
    expect(onSelectEntry).toHaveBeenCalledWith({ dictionaryId: 'phrases', key: 'a::b' }, true);
  });
});

describe('DuplicateDictionaryTableView — context menu', () => {
  test('right-click reports the row source, translation, and owning dictionary', () => {
    const onContextMenu = vi.fn();
    const rows = [
      makeRow({ source: '你好', translation: 'xin chào', dictionaryId: 'phrases' }),
      makeRow({ source: '你好', translation: 'chào', dictionaryId: 'properNouns-A' }),
    ];
    renderView({ rows: rows, onContextMenu });

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
    renderView({ rows: [row], onSetSemanticType });

    fireEvent.click(screen.getByLabelText('Set Organization for 青云 in Proper Nouns'));
    expect(onSetSemanticType).toHaveBeenCalledWith(row, 'organization');

    fireEvent.click(screen.getByLabelText('Set Location for 青云 in Proper Nouns'));
    expect(onSetSemanticType).toHaveBeenCalledWith(row, ''); // active chip clears
  });

  test('hides the chips for a phrase not allowed as a variable', () => {
    const row = makeRow({ source: '你好', dictionaryId: 'phrases', dictionaryLabel: 'Phrases' });
    renderView({ rows: [row], onSetSemanticType: vi.fn() });
    expect(screen.queryByLabelText(/^Set .* for 你好 in Phrases$/)).toBeNull();
  });

  test('shows the chips for a phrase allowed as a variable', () => {
    const row = makeRow({
      source: '你好',
      dictionaryId: 'phrases',
      dictionaryLabel: 'Phrases',
      metadata: { allowAsPatternVariable: true },
    });
    renderView({ rows: [row], onSetSemanticType: vi.fn() });
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
    renderView({ rows: rows, duplicateGroupIndices: [0, 1] });
    const row = (text: string) => screen.getByText(text).closest('[role="row"]')!;
    expect(row('你好').hasAttribute('data-stripe')).toBe(false);
    expect(row('再见').hasAttribute('data-stripe')).toBe(true);
  });

  test('two rows of one group share its band', () => {
    const rows = [
      makeRow({ source: '你好', translation: 'xin chào', dictionaryLabel: 'Phrases' }),
      makeRow({ source: '你好', translation: 'chào', dictionaryLabel: 'Proper Nouns' }),
    ];
    renderView({ rows: rows, duplicateGroupIndices: [1, 1] });
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
      rows: rows,
      duplicateGroupIndices: [0, 1],
      selected: [entryOf(rows[1]!)],
    });
    // The kit paints a selected row with the theme's soft accent (--lk-accent-soft).
    const row = (text: string) => screen.getByText(text).closest('[role="row"]')!;
    expect(row('再见').hasAttribute('data-selected')).toBe(true);
    expect(row('你好').hasAttribute('data-selected')).toBe(false);
  });
});
