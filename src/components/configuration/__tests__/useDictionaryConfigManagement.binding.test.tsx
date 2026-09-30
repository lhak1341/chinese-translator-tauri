/**
 * Tests for the one thing the open book takes away from the Configuration tab: authority
 * over the fiction slice of `activeProperNouns`.
 *
 * The rule has two halves and both are here, because getting only the first would be worse
 * than getting neither — fiction rows reflect the binding and cannot be toggled, while
 * generic and theme rows stay fully editable. This is rendered through
 * `ConfigurationManager` rather than the hook alone so it asserts what a reader can
 * actually click, which is where the rule either holds or does not.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ConfigurationManager from '../ConfigurationManager';
import { useDictionaryConfigManagement } from '../useDictionaryConfigManagement';

const { saveAppConfig, loadAppConfig } = vi.hoisted(() => ({
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
  loadAppConfig: vi.fn(),
}));
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig,
  saveAppConfig,
  invalidateAppConfig: vi.fn(),
  callRustConfigWrite: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Stable across renders, as the real context's are: the hook's mount effect depends on
// `loadDictionary`, so a fresh function per render re-runs it forever.
const dictionaryContext = vi.hoisted(() => ({
  loadDictionary: vi.fn(),
  applyRename: vi.fn(),
}));
vi.mock('../../dictionary/DictionaryContext', () => ({
  useDictionary: () => dictionaryContext,
}));

const binding = vi.hoisted(() => ({
  isBookOpen: true,
  boundFictionDictionary: 'properNouns-f_TapDo' as string | null,
  openBook: { fingerprint: 'fp1', fileName: 'Tạp đồ 卡徒.txt', title: 'Tạp đồ 卡徒' },
  fictionDictionaries: ['properNouns-f_TapDo', 'properNouns-f_TruTien'],
  renameFictionDictionary: vi.fn(),
  createFictionDictionary: vi.fn(),
}));
vi.mock('../../BookBindingContext', () => ({
  useBookBinding: () => binding,
}));

const ALL_DICTIONARIES = [
  'properNouns',
  'properNouns-_AiCap',
  'properNouns-f_TapDo',
  'properNouns-f_TruTien',
];

beforeEach(() => {
  vi.clearAllMocks();
  binding.isBookOpen = true;
  binding.boundFictionDictionary = 'properNouns-f_TapDo';
  loadAppConfig.mockResolvedValue({
    // Deliberately stale and wrong for the open book: the previous book's fiction
    // dictionary is still in the saved list. What the reader sees must come from the
    // binding, not from this.
    engine: { activeProperNouns: ['properNouns', 'properNouns-f_TruTien'] },
    ui: { defaultQuickAddDictionary: null },
    session: { lastSelectedDictionary: null },
  });
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    listProperNounsDictionaries: vi
      .fn()
      .mockResolvedValue({ success: true, dictionaries: ALL_DICTIONARIES }),
    listFictionPatternDictionaries: vi.fn().mockResolvedValue({ success: true, dictionaries: [] }),
    createStructuralPatternsDictionary: vi.fn().mockResolvedValue({ success: true }),
    renameProperNounsDictionary: vi.fn().mockResolvedValue({ success: true }),
    createFictionDictionaryPair: vi.fn().mockResolvedValue({ success: true }),
    createProperNounsDictionary: vi.fn().mockResolvedValue({ success: true }),
  };
  binding.renameFictionDictionary.mockResolvedValue({ success: true, filesMoved: true });
  binding.createFictionDictionary.mockResolvedValue({ success: true });
});

/** The checkbox belonging to one dictionary row, found by its visible label. */
function checkboxFor(label: string): HTMLInputElement {
  return screen.getByText(label).closest('label')!.querySelector('input')!;
}

describe('Configuration while a book is open', () => {
  test('fiction rows reflect the binding, not the last-saved config', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('f_TapDo')).toBeInTheDocument());

    expect(checkboxFor('f_TapDo').checked).toBe(true);
    expect(checkboxFor('f_TruTien').checked).toBe(false);
  });

  test('fiction rows cannot be toggled here', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('f_TapDo')).toBeInTheDocument());

    expect(checkboxFor('f_TapDo').disabled).toBe(true);
    expect(checkboxFor('f_TruTien').disabled).toBe(true);

    fireEvent.click(checkboxFor('f_TruTien'));
    expect(saveAppConfig).not.toHaveBeenCalled();
  });

  test('generic and theme rows stay fully editable', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('_AiCap')).toBeInTheDocument());

    expect(checkboxFor('_AiCap').disabled).toBe(false);
    expect(checkboxFor('General Purpose Dictionary').disabled).toBe(false);

    fireEvent.click(checkboxFor('_AiCap'));
    await waitFor(() =>
      expect(saveAppConfig).toHaveBeenCalledWith({
        engine: {
          // The open book's dictionary, not the stale one the saved config still lists:
          // a generic toggle must not resurrect the previous book's fiction entry.
          activeProperNouns: ['properNouns', 'properNouns-f_TapDo', 'properNouns-_AiCap'],
        },
      })
    );
  });

  test('names the book the fiction list is coming from', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText(/set by Tạp đồ/)).toBeInTheDocument());
  });
});

describe('Configuration with no book open', () => {
  test('fiction rows go back to being editable', async () => {
    binding.isBookOpen = false;
    binding.boundFictionDictionary = null;

    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('f_TruTien')).toBeInTheDocument());

    // Straight from config again, with no binding overlaying it.
    expect(checkboxFor('f_TruTien').checked).toBe(true);
    expect(checkboxFor('f_TruTien').disabled).toBe(false);
  });
});

describe('fiction dictionaries are created and renamed through the binding context', () => {
  // Books bound to a fiction dictionary name it in their records, which this tab cannot
  // see; only the binding context carries a rename into them.
  test('renaming a fiction dictionary goes through the context, not the backend directly', async () => {
    const { result } = renderHook(() => useDictionaryConfigManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleStartRename('properNouns-f_TapDo'));
    act(() => result.current.updateRenameValue('f_TapDoMoi'));
    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(binding.renameFictionDictionary).toHaveBeenCalledWith(
      'properNouns-f_TapDo',
      'properNouns-f_TapDoMoi'
    );
    expect(window.electronAPI.renameProperNounsDictionary).not.toHaveBeenCalled();
    expect(result.current.availableDictionaries).toContain('properNouns-f_TapDoMoi');
  });

  test('a theme dictionary still renames directly', async () => {
    const { result } = renderHook(() => useDictionaryConfigManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleStartRename('properNouns-_AiCap'));
    act(() => result.current.updateRenameValue('_AiCapMoi'));
    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(binding.renameFictionDictionary).not.toHaveBeenCalled();
    expect(window.electronAPI.renameProperNounsDictionary).toHaveBeenCalledWith(
      'properNouns-_AiCap',
      'properNouns-_AiCapMoi'
    );
  });

  test('a rename the context reports as failed surfaces its error', async () => {
    binding.renameFictionDictionary.mockResolvedValue({
      success: false,
      error: 'Renamed, but books bound to it still name the old dictionary: locked',
      filesMoved: true,
    });
    const { result } = renderHook(() => useDictionaryConfigManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleStartRename('properNouns-f_TapDo'));
    act(() => result.current.updateRenameValue('f_TapDoMoi'));
    await act(async () => {
      await result.current.handleConfirmRename();
    });

    expect(result.current.error).toContain('still name the old dictionary');
    // The files did move, so the row follows them.
    expect(result.current.availableDictionaries).toContain('properNouns-f_TapDoMoi');
  });

  test('creating a fiction dictionary goes through the context', async () => {
    const { result } = renderHook(() => useDictionaryConfigManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.updateDraftName('f_DaiBatHau'));
    await act(async () => {
      await result.current.handleCreateDictionary({ preventDefault: () => {} } as React.FormEvent);
    });

    expect(binding.createFictionDictionary).toHaveBeenCalledWith('properNouns-f_DaiBatHau');
    expect(window.electronAPI.createFictionDictionaryPair).not.toHaveBeenCalled();
  });
});
