/**
 * Direct render coverage for EnhancedVirtualizedDictionaryTable (architecture review
 * 2026-07-18, candidate 5). The hooks it composes (useDictionaryEntryFilter,
 * useVirtualScrollRange, useEntrySelection, useEntryEditAndMove, useContextMenu) are each
 * individually tested, and the wiring between them + DictionaryManager is covered by
 * DictionaryManager.composition.test.tsx — but that file never renders
 * showDuplicatesMode={true} or exercises the filter-panel toggle buttons. This file mounts
 * EVDT directly (not through DictionaryManager) so duplicate mode can be driven via props
 * instead of DictionaryManager's real find-duplicates scan flow.
 *
 * Mocked (same treatment as the composition test): DictionaryContext, the 3 modal
 * components, and DuplicateDictionaryTableView (already covered by its own 11-test file —
 * this file only asserts EVDT dispatches to it with the right props). All 5 hooks run for
 * real.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import EnhancedVirtualizedDictionaryTable from '../EnhancedVirtualizedDictionaryTable';
import type { DictionaryData } from '../../../types/DictionaryTypes';
import type { DuplicateRow } from '../../../utils/dictionary/DuplicateAnalyzer';
import styles from '../../../styles/EnhancedVirtualizedDictionaryTable.module.css';

const {
  dictionariesRef,
  isLoadingRef,
  deleteEntry,
  bulkDeleteEntries,
  updateEntry,
  renameEntry,
  patchEntry,
} = vi.hoisted(() => ({
  dictionariesRef: { current: {} as Record<string, DictionaryData> },
  isLoadingRef: { current: false },
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  bulkDeleteEntries: vi.fn().mockResolvedValue({ count: 0, missing: [] }),
  updateEntry: vi.fn().mockResolvedValue(undefined),
  renameEntry: vi.fn().mockResolvedValue(undefined),
  patchEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../DictionaryContext', () => ({
  useDictionary: () => ({
    dictionaries: dictionariesRef.current,
    isLoading: isLoadingRef.current,
    deleteEntry,
    bulkDeleteEntries,
    updateEntry,
    renameEntry,
    patchEntry,
  }),
}));

vi.mock('../DictionaryEntry', () => ({
  default: () => <div data-testid="dictionary-entry-modal" />,
}));
vi.mock('../MoveDialog', () => ({
  default: () => <div data-testid="move-dialog" />,
}));

const duplicateViewSpy = vi.fn();
vi.mock('../DuplicateDictionaryTableView', () => ({
  default: (props: any) => {
    duplicateViewSpy(props);
    return <div data-testid="duplicate-view" />;
  },
}));

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  isLoadingRef.current = false;
  dictionariesRef.current = {};

  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

function setDict(id: string, entries: DictionaryData) {
  dictionariesRef.current = { ...dictionariesRef.current, [id]: entries };
}

describe('duplicate mode', () => {
  test('renders the mocked DuplicateDictionaryTableView with correctly-shaped props', () => {
    const duplicateRows: DuplicateRow[] = [
      {
        source: '你好',
        translation: 'Xin chào',
        dictionaryId: 'properNouns-A',
        dictionaryLabel: 'A',
      },
      { source: '你好', translation: 'Chào', dictionaryId: 'properNouns-B', dictionaryLabel: 'B' },
    ];

    render(
      <EnhancedVirtualizedDictionaryTable
        selectedDictionary="properNouns-A"
        showDuplicatesMode
        duplicateRows={duplicateRows}
      />
    );

    expect(screen.getByTestId('duplicate-view')).toBeTruthy();
    expect(duplicateViewSpy).toHaveBeenCalled();
    const props = duplicateViewSpy.mock.calls.at(-1)![0];
    expect(props.visibleDuplicateRows).toHaveLength(2);
    expect(props.duplicateGroupIndices).toEqual([0, 0]); // same source -> same group
  });

  test('does not render the normal search/filter chrome in duplicate mode', () => {
    render(
      <EnhancedVirtualizedDictionaryTable
        selectedDictionary="properNouns-A"
        showDuplicatesMode
        duplicateRows={[]}
      />
    );

    expect(screen.queryByPlaceholderText('Search dictionary entries...')).toBeNull();
  });
});

describe('normal mode — headers', () => {
  test('renders phrases-specific columns for a phrases dictionary', () => {
    setDict('phrases', { 你好: { translation: 'Xin chào' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="phrases" />);
    expect(screen.getByText('Source')).toBeTruthy();
    expect(screen.getByText('Translation')).toBeTruthy();
    expect(screen.getByText('Semantic')).toBeTruthy();
  });

  test('renders pattern-specific columns (X types / Y types) for a patterns dictionary', () => {
    setDict('patterns', { X的Y: { translation: 'của X Y' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="patterns" />);
    expect(screen.getByText('X types')).toBeTruthy();
    expect(screen.getByText('Y types')).toBeTruthy();
  });

  test('renders the generic Source Text / Translation columns for a plain dictionary (e.g. characters)', () => {
    setDict('characters', { 你: { translation: 'bạn' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="characters" />);
    expect(screen.getByText('Source Text')).toBeTruthy();
  });

  test.each([
    [
      'patterns',
      'patternsSourceCol',
      'patternsTranslationCol',
      { X的Y: { translation: 'của X Y' } },
    ],
    [
      'patterns-f_novel',
      'patternsSourceCol',
      'patternsTranslationCol',
      { X的Y: { translation: 'của X Y' } },
    ],
    ['phrases', 'phrasesSourceCol', 'phrasesTranslationCol', { 你好: { translation: 'Xin chào' } }],
    [
      'properNouns',
      'properNounsSourceCol',
      'properNounsTranslationCol',
      { 张三: { translation: 'Trương Tam' } },
    ],
    [
      'properNouns-f_novel',
      'properNounsSourceCol',
      'properNounsTranslationCol',
      { 张三: { translation: 'Trương Tam' } },
    ],
    ['characters', 'simpleSourceCol', 'simpleTranslationCol', { 你: { translation: 'bạn' } }],
  ] as const)(
    '%s: header and row share the same column width classes — no drift between the two (architecture review 2026-08-28, candidate #2)',
    (dictionaryId, sourceCol, translationCol, entries) => {
      setDict(dictionaryId, entries);
      const { container } = render(
        <EnhancedVirtualizedDictionaryTable selectedDictionary={dictionaryId} />
      );

      // Exactly 2 elements should carry each class: the header cell and the one row cell.
      expect(container.getElementsByClassName(styles[sourceCol])).toHaveLength(2);
      expect(container.getElementsByClassName(styles[translationCol])).toHaveLength(2);
    }
  );
});

describe('filter button visibility', () => {
  test('hidden for a dictionary type with no applicable filters', () => {
    setDict('characters', { 你: { translation: 'bạn' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="characters" />);
    expect(screen.queryByTitle('Filter entries')).toBeNull();
  });

  test('shown for a patterns dictionary', () => {
    setDict('patterns', { X的Y: { translation: 'của X Y' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="patterns" />);
    expect(screen.getByTitle('Filter entries')).toBeTruthy();
  });
});

describe('filter panel toggle', () => {
  test('clicking the Filter icon shows the panel; clicking again hides it', () => {
    setDict('patterns', { X的Y: { translation: 'của X Y' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="patterns" />);

    expect(screen.queryByText('Pattern:')).toBeNull();
    fireEvent.click(screen.getByTitle('Filter entries'));
    expect(screen.getByText('Pattern:')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Hide filters'));
    expect(screen.queryByText('Pattern:')).toBeNull();
  });
});

describe('pattern-type filter', () => {
  test('toggling "X only" narrows the visible entries to X-only patterns', () => {
    // Source text goes through highlightPatternVariables (splits into styled spans per
    // X/Y variable) — assert on the plain-text translation instead, which is unique per entry.
    setDict('patterns', {
      X的手: { translation: 'tay của X' },
      X给Y: { translation: 'X cho Y' },
    });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="patterns" />);
    fireEvent.click(screen.getByTitle('Filter entries'));

    expect(screen.getByText('tay của X')).toBeTruthy();
    expect(screen.getByText('X cho Y')).toBeTruthy();

    fireEvent.click(screen.getByText('X only'));

    expect(screen.getByText('tay của X')).toBeTruthy();
    expect(screen.queryByText('X cho Y')).toBeNull();
  });
});

describe('variable filter', () => {
  test('"Allowed" narrows pattern entries to allowAsPatternVariable: true', () => {
    setDict('patterns', {
      X的手: { translation: 'tay của X', allowAsPatternVariable: true },
      X给Y: { translation: 'X cho Y' },
    });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="patterns" />);
    fireEvent.click(screen.getByTitle('Filter entries'));

    fireEvent.click(screen.getByText('Allowed'));

    expect(screen.getByText('tay của X')).toBeTruthy();
    expect(screen.queryByText('X cho Y')).toBeNull();
  });
});

describe('semantic-type filter', () => {
  test('toggling a semantic type abbreviation narrows the visible entries', () => {
    setDict('phrases', {
      你好: { translation: 'Xin chào', semanticType: 'character' },
      再见: { translation: 'Tạm biệt' },
    });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="phrases" />);
    fireEvent.click(screen.getByTitle('Filter entries'));

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('再见')).toBeTruthy();

    fireEvent.click(screen.getByText('CHA'));

    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.queryByText('再见')).toBeNull();
  });

  test('"No Type" narrows to entries with no semanticType', () => {
    setDict('phrases', {
      你好: { translation: 'Xin chào', semanticType: 'character' },
      再见: { translation: 'Tạm biệt' },
    });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="phrases" />);
    fireEvent.click(screen.getByTitle('Filter entries'));

    fireEvent.click(screen.getByText('No Type'));

    expect(screen.queryByText('你好')).toBeNull();
    expect(screen.getByText('再见')).toBeTruthy();
  });
});

describe('clear filters', () => {
  test('appears only when a filter is active, and resets the full entry list on click', () => {
    setDict('patterns', {
      X的手: { translation: 'tay của X', allowAsPatternVariable: true },
      X给Y: { translation: 'X cho Y' },
    });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="patterns" />);
    fireEvent.click(screen.getByTitle('Filter entries'));

    expect(screen.queryByText('Clear filters')).toBeNull();

    fireEvent.click(screen.getByText('Allowed'));
    expect(screen.getByText('Clear filters')).toBeTruthy();
    expect(screen.queryByText('X cho Y')).toBeNull();

    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.queryByText('Clear filters')).toBeNull();
    expect(screen.getByText('X cho Y')).toBeTruthy();
  });
});

describe('empty state', () => {
  test('shows "Dictionary is empty" when there are no entries at all', () => {
    setDict('phrases', {});
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="phrases" />);
    expect(screen.getByText('Dictionary is empty')).toBeTruthy();
  });

  test('shows a no-matches message (not the empty-dictionary message) when a filter excludes everything', () => {
    setDict('patterns', { X的手: { translation: 'tay của X' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="patterns" />);
    fireEvent.click(screen.getByTitle('Filter entries'));
    fireEvent.click(screen.getByText('Allowed')); // no entry has allowAsPatternVariable: true

    expect(screen.getByText('No entries match the active filters')).toBeTruthy();
    expect(screen.queryByText('Dictionary is empty')).toBeNull();
  });
});

describe('row positioning (scroll-anchoring regression)', () => {
  // Rows used to live in one translateY'd slice; dropping the top buffer row shifted every
  // visible row up 40px in layout, and WebKit's scroll anchoring pulled scrollTop back —
  // flicker, then stuck. Each row now sits at its own absolute global offset.
  test('each row is absolutely positioned at index * ITEM_HEIGHT', () => {
    setDict('phrases', {
      一: { translation: 'mot' },
      二: { translation: 'hai' },
      三: { translation: 'ba' },
    });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="phrases" />);

    const tops = ['mot', 'hai', 'ba'].map((t) => {
      let el: HTMLElement | null = screen.getByText(t);
      while (el && el.style.position !== 'absolute') el = el.parentElement;
      return el?.style.top;
    });
    expect(tops).toEqual(['0px', '40px', '80px']);
  });
});

describe('dictionary switch — what resets and what carries over', () => {
  // 100 rows each, so the list scrolls. Every source contains 词 so one search term matches in
  // both dictionaries; every entry is a character, so the CHA filter keeps them all.
  // Both dictionaries share their sources, so a selected key still exists after the switch and
  // only the view's remount clears it (the selection prunes keys whose entry is gone).
  const many = (label: string, extra: Partial<Record<string, unknown>> = {}): DictionaryData =>
    Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [
        `甲词${i}`,
        { translation: `${label}-${i}`, semanticType: 'character', ...extra },
      ])
    ) as DictionaryData;

  function scrollerOf(text: string): HTMLElement {
    let el: HTMLElement | null = screen.getByText(text);
    while (el && el.style.overflow !== 'auto') el = el.parentElement;
    if (!el) throw new Error('no scroller');
    return el;
  }

  function scrollTo(el: HTMLElement, top: number) {
    el.scrollTop = top;
    fireEvent.scroll(el);
  }

  test('selection and scroll reset; the search term and supported filters carry over', async () => {
    setDict('phrases', {
      ...many('ph', { allowAsPatternVariable: true }),
      其他: { translation: 'x' },
    });
    setDict('properNouns-test', { ...many('pn'), 无型词: { translation: 'no type' } });
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <EnhancedVirtualizedDictionaryTable
        selectedDictionary="phrases"
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search dictionary entries...'), {
      target: { value: '词' },
    });
    await waitFor(() => expect(screen.queryByText('x')).toBeNull());
    fireEvent.click(screen.getByTitle('Filter entries'));
    // Rows carry CHA badges too; the chip to click is the Type row's.
    fireEvent.click(within(screen.getByText('Type:').parentElement!).getByText('CHA'));
    fireEvent.click(screen.getByText('Allowed'));
    fireEvent.click(screen.getAllByTitle('Select for deletion')[0]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedCount: 1 })
    );
    scrollTo(scrollerOf('ph-0'), 20 * 40);
    expect(screen.getByText(/^Rows 21–/)).toBeTruthy();

    rerender(
      <EnhancedVirtualizedDictionaryTable
        selectedDictionary="properNouns-test"
        onSelectionChange={onSelectionChange}
      />
    );

    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedCount: 0 })
    );
    expect(screen.getByText(/^Rows 1–/)).toBeTruthy();
    expect(
      (screen.getByPlaceholderText('Search dictionary entries...') as HTMLInputElement).value
    ).toBe('词');
    // CHA carries over (proper nouns take a semantic type): the untyped entry stays hidden.
    expect(screen.getByText('pn-0')).toBeTruthy();
    expect(screen.queryByText('no type')).toBeNull();
    // "Allowed" does not (VAR is always on for proper nouns), and the panel has no VAR row.
    expect(screen.queryByText('Variable:')).toBeNull();
  });

  test('changing a filter returns the view to the top', () => {
    setDict('phrases', many('ph'));
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="phrases" />);
    scrollTo(scrollerOf('ph-0'), 20 * 40);
    expect(screen.getByText(/^Rows 21–/)).toBeTruthy();

    fireEvent.click(screen.getByTitle('Filter entries'));
    fireEvent.click(screen.getByText('CHA'));

    expect(screen.getByText(/^Rows 1–/)).toBeTruthy();
  });
});

describe('proper-noun table header', () => {
  test('the Translation header says once that proper nouns are always usable as variables', () => {
    setDict('properNouns-f_Novel', { 孔宣: { translation: 'Khổng Tuyên' } });
    render(<EnhancedVirtualizedDictionaryTable selectedDictionary="properNouns-f_Novel" />);
    expect(screen.getByTitle('Proper nouns are always usable as variables')).toHaveTextContent(
      'Translation'
    );
  });
});
