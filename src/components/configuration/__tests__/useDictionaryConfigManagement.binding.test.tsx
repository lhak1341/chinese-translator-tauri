/**
 * Tests for the Configuration tab over the real Dictionary Store and the real binding
 * provider (see `realStores.tsx`): the one thing an open book takes away from it — authority
 * over the fiction slice of `activeProperNouns` — and what the tab shows after a create, a
 * rename or a tier move.
 *
 * The authority rule has two halves and both are here, because getting only the first would be
 * worse than getting neither — fiction rows reflect the binding and cannot be toggled, while
 * generic and theme rows stay fully editable. It is rendered through `ConfigurationManager`
 * rather than the hook alone so it asserts what a reader can actually click.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import ConfigurationManager from '../ConfigurationManager';
import { useDictionaryConfigManagement } from '../useDictionaryConfigManagement';
import { useBookBinding } from '../../BookBindingContext';
import { saveAppConfig } from '../../../utils/appConfig';
import { installRealStores, withPatterns, type StoresHarness } from './realStores';

// The engine module is 300+ KB and only its debug-level enum is needed here.
vi.mock('../../../utils/TranslationEngine.js', () => ({ DEBUG_LEVELS: { ERROR: 0 } }));

const { renameBoundDictionary } = vi.hoisted(() => ({
  renameBoundDictionary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../utils/reader/BookRecordsBackend', () => ({
  setBookBinding: vi.fn().mockResolvedValue(undefined),
  renameBoundDictionary,
  unbindDictionary: vi.fn().mockResolvedValue(undefined),
}));

const engine = vi.hoisted(() => ({ reinitializeEngine: vi.fn() }));
vi.mock('../../EngineContext', () => ({ useEngine: () => engine }));

const holder = vi.hoisted(() => ({ useDictionary: (() => ({})) as () => unknown }));
vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => holder.useDictionary(),
}));

const BOOK = { fingerprint: 'fp1', fileName: 'Tạp đồ 卡徒.txt', title: 'Tạp đồ 卡徒' };
const BOUND = { fictionDictionary: 'properNouns-f_TapDo' };

let h: StoresHarness;

beforeEach(async () => {
  vi.clearAllMocks();
  engine.reinitializeEngine.mockResolvedValue(true);
  renameBoundDictionary.mockResolvedValue(undefined);
  // Deliberately stale and wrong for an open book: the previous book's fiction dictionary is
  // still in the saved list. What the reader sees must come from the binding, not from this.
  h = installRealStores({
    ids: withPatterns([
      'properNouns',
      'properNouns-_AiCap',
      'properNouns-f_TapDo',
      'properNouns-f_TruTien',
    ]),
    config: {
      activeProperNouns: ['properNouns', 'properNouns-f_TruTien'],
      defaultQuickAddDictionary: null,
    },
  });
  holder.useDictionary = h.useDictionary;
  await h.load();
});

/** Announces the book once, as the Reader does when it has opened one. */
function OpenBook(): null {
  const { announceOpenBook } = useBookBinding();
  useEffect(() => announceOpenBook(BOOK, BOUND), [announceOpenBook]);
  return null;
}

/** The apply an announced book triggers has finished: config written, engine rebuilt. */
async function applied(): Promise<void> {
  await waitFor(() => expect(engine.reinitializeEngine).toHaveBeenCalled());
}

/** One dictionary row's label. The header can name a dictionary too (the quick-add default). */
const rowLabel = (label: string) => screen.getByText(label, { selector: 'label' });

/** The checkbox belonging to one dictionary row, found by its visible label. */
function checkboxFor(label: string): HTMLInputElement {
  return rowLabel(label).querySelector('input')!;
}

/** The hook beside the binding, with the book already open when `book` is set. */
async function renderTab(book = false) {
  const view = renderHook(
    () => ({ tab: useDictionaryConfigManagement(), binding: useBookBinding() }),
    { wrapper: h.Wrapper }
  );
  await waitFor(() => expect(view.result.current.tab.isLoading).toBe(false));
  if (book) {
    act(() => view.result.current.binding.announceOpenBook(BOOK, BOUND));
    await applied();
  }
  return view;
}

describe('Configuration while a book is open', () => {
  const renderOpen = () =>
    render(
      <h.Wrapper>
        <OpenBook />
        <ConfigurationManager />
      </h.Wrapper>
    );

  test('fiction rows reflect the binding, not the last-saved config', async () => {
    renderOpen();
    await waitFor(() => expect(rowLabel('f_TapDo')).toBeInTheDocument());

    expect(checkboxFor('f_TapDo').checked).toBe(true);
    expect(checkboxFor('f_TruTien').checked).toBe(false);
  });

  test('fiction rows cannot be toggled here', async () => {
    renderOpen();
    await waitFor(() => expect(rowLabel('f_TapDo')).toBeInTheDocument());
    await applied();
    h.disk.saveConfiguration.mockClear();

    expect(checkboxFor('f_TapDo').disabled).toBe(true);
    expect(checkboxFor('f_TruTien').disabled).toBe(true);

    fireEvent.click(checkboxFor('f_TruTien'));
    expect(h.disk.saveConfiguration).not.toHaveBeenCalled();
  });

  test('generic and theme rows stay fully editable', async () => {
    renderOpen();
    await waitFor(() => expect(rowLabel('_AiCap')).toBeInTheDocument());
    await applied();

    expect(checkboxFor('_AiCap').disabled).toBe(false);
    expect(checkboxFor('General Purpose Dictionary').disabled).toBe(false);

    fireEvent.click(checkboxFor('_AiCap'));
    await waitFor(() =>
      expect(h.disk.disk.raw.activeProperNouns).toEqual([
        // The open book's dictionary, not the stale one the saved config listed: a generic
        // toggle must not resurrect the previous book's fiction entry.
        'properNouns',
        'properNouns-f_TapDo',
        'properNouns-_AiCap',
      ])
    );
  });

  test('names the book the fiction list is coming from', async () => {
    renderOpen();
    await waitFor(() => expect(screen.getByText(/set by Tạp đồ/)).toBeInTheDocument());
  });
});

describe('toggles made before the first save resolves', () => {
  // A toggle is computed from the config as it is when its write's turn comes. Computed from
  // React state instead, the second click starts from the list the first one has not yet
  // changed, and its save overwrites the first.
  test('both land when two checkboxes are clicked back to back', async () => {
    const { result } = await renderTab();

    await act(async () => {
      const first = result.current.tab.handleToggleDictionary('properNouns-_AiCap');
      const second = result.current.tab.handleToggleDictionary('properNouns');
      await Promise.all([first, second]);
    });

    expect(h.disk.disk.raw.activeProperNouns).toEqual([
      'properNouns-f_TruTien',
      'properNouns-_AiCap',
    ]);
    await waitFor(() =>
      expect(result.current.tab.activeDictionaries).toEqual([
        'properNouns-f_TruTien',
        'properNouns-_AiCap',
      ])
    );
  });
});

describe('Configuration with no book open', () => {
  test('fiction rows go back to being editable', async () => {
    render(
      <h.Wrapper>
        <ConfigurationManager />
      </h.Wrapper>
    );
    await waitFor(() => expect(rowLabel('f_TruTien')).toBeInTheDocument());

    // Straight from config again, with no binding overlaying it.
    expect(checkboxFor('f_TruTien').checked).toBe(true);
    expect(checkboxFor('f_TruTien').disabled).toBe(false);
  });
});

describe('the Configuration tab after the open book rewrote config', () => {
  // Every tab stays mounted, so the tab read config once and is still showing it when
  // announcing a book rewrites the default quick-add target.
  test('shows the default quick-add target the book set, and a click then clears it', async () => {
    const { result } = await renderTab();
    expect(result.current.tab.defaultQuickAddDictionary).toBeNull();

    await act(async () => {
      await saveAppConfig({ ui: { defaultQuickAddDictionary: 'properNouns-f_TapDo' } });
    });
    await waitFor(() =>
      expect(result.current.tab.defaultQuickAddDictionary).toBe('properNouns-f_TapDo')
    );

    // Toggling the marker the reader sees must turn it off, not set it again.
    await act(async () => {
      await result.current.tab.handleSetDefaultQuickAdd('properNouns-f_TapDo');
    });
    expect(h.disk.disk.raw.defaultQuickAddDictionary).toBeNull();
    await waitFor(() => expect(result.current.tab.defaultQuickAddDictionary).toBeNull());
  });
});

describe('a tier move from the Configuration tab', () => {
  // Rust renames the files and rewrites config, then the binding context may save again. The
  // tab ends up showing the Dictionary Store's list and what the config file now says.
  test('renames the row and shows the active list and quick-add default the move left', async () => {
    h.disk.disk.raw.activeProperNouns = ['properNouns', 'properNouns-_AiCap'];
    h.disk.disk.raw.defaultQuickAddDictionary = 'properNouns-_AiCap';
    const { result } = await renderTab();
    expect(result.current.tab.defaultQuickAddDictionary).toBe('properNouns-_AiCap');

    await act(async () => {
      await result.current.tab.handleMoveTier('properNouns-_AiCap');
    });

    await waitFor(() => {
      expect(result.current.tab.availableDictionaries).toContain('properNouns-f_AiCap');
      expect(result.current.tab.activeDictionaries).toEqual(['properNouns', 'properNouns-f_AiCap']);
      expect(result.current.tab.defaultQuickAddDictionary).toBe('properNouns-f_AiCap');
    });
    expect(result.current.tab.availableDictionaries).not.toContain('properNouns-_AiCap');
    expect(h.files['patterns-f_AiCap']).toBeDefined();
  });

  test('a refused move changes nothing on screen', async () => {
    const { result } = await renderTab();
    h.api.renameProperNounsDictionary.mockResolvedValueOnce({
      success: false,
      error: 'already exists',
    });

    await act(async () => {
      await result.current.tab.handleMoveTier('properNouns-_AiCap');
    });

    expect(result.current.tab.error).toContain('already exists');
    expect(result.current.tab.availableDictionaries).toContain('properNouns-_AiCap');
    expect(result.current.tab.availableDictionaries).not.toContain('properNouns-f_AiCap');
  });
});

describe('creating and renaming go through the binding context', () => {
  // The rows come from the Dictionary Store, which re-lists as each operation finishes. Books
  // bound to a fiction dictionary name it in their records, which this tab cannot see; only the
  // binding context carries a rename into them.
  async function renameRow(
    tab: Awaited<ReturnType<typeof renderTab>>['result'],
    from: string,
    to: string
  ) {
    act(() => tab.current.tab.handleStartRename(from));
    act(() => tab.current.tab.updateRenameValue(to));
    await act(async () => {
      await tab.current.tab.handleConfirmRename();
    });
  }

  test('a fiction rename updates the book records, and the row and active list follow', async () => {
    h.disk.disk.raw.activeProperNouns = ['properNouns', 'properNouns-f_TapDo'];
    const { result } = await renderTab();

    await renameRow(result, 'properNouns-f_TapDo', 'f_TapDoMoi');

    expect(renameBoundDictionary).toHaveBeenCalledWith(
      'properNouns-f_TapDo',
      'properNouns-f_TapDoMoi'
    );
    await waitFor(() => {
      expect(result.current.tab.availableDictionaries).toContain('properNouns-f_TapDoMoi');
      expect(result.current.tab.activeDictionaries).toEqual([
        'properNouns',
        'properNouns-f_TapDoMoi',
      ]);
    });
    expect(result.current.tab.availableDictionaries).not.toContain('properNouns-f_TapDo');
  });

  test('a theme dictionary renames through the same call and touches no book record', async () => {
    const { result } = await renderTab();

    await renameRow(result, 'properNouns-_AiCap', '_AiCapMoi');

    expect(h.api.renameProperNounsDictionary).toHaveBeenCalledWith(
      'properNouns-_AiCap',
      'properNouns-_AiCapMoi'
    );
    expect(renameBoundDictionary).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.tab.availableDictionaries).toContain('properNouns-_AiCapMoi')
    );
  });

  test('a rename whose book records failed surfaces its error, and the row follows the files', async () => {
    renameBoundDictionary.mockRejectedValueOnce(new Error('locked'));
    const { result } = await renderTab();

    await renameRow(result, 'properNouns-f_TapDo', 'f_TapDoMoi');

    expect(result.current.tab.error).toContain('still name the old dictionary');
    await waitFor(() =>
      expect(result.current.tab.availableDictionaries).toContain('properNouns-f_TapDoMoi')
    );
  });

  test('a refused rename shows its error and leaves the row', async () => {
    const { result } = await renderTab();
    h.api.renameProperNounsDictionary.mockResolvedValueOnce({
      success: false,
      error: 'Dictionary already exists',
    });

    await renameRow(result, 'properNouns-_AiCap', '_Other');

    expect(result.current.tab.error).toContain('Dictionary already exists');
    expect(result.current.tab.availableDictionaries).toContain('properNouns-_AiCap');
  });

  test('a created fiction pair gets its row and is active, with no list kept by the tab', async () => {
    const { result } = await renderTab();

    act(() => result.current.tab.updateDraftName('f_DaiBatHau'));
    await act(async () => {
      await result.current.tab.handleCreateDictionary({
        preventDefault: () => {},
      } as React.FormEvent);
    });

    expect(h.api.createFictionDictionaryPair).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    await waitFor(() => {
      expect(result.current.tab.availableDictionaries).toContain('properNouns-f_DaiBatHau');
      expect(result.current.tab.activeDictionaries).toContain('properNouns-f_DaiBatHau');
    });
    // The Reader's binding dialog reads the same list.
    expect(result.current.binding.fictionDictionaries).toContain('properNouns-f_DaiBatHau');
  });
});
