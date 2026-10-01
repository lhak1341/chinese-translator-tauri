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
import { callRustConfigWrite, saveAppConfig } from '../../../utils/appConfig';
import { installFakeConfigDisk } from '../../../test/fakeConfigDisk';

let disk: ReturnType<typeof installFakeConfigDisk>;

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
  moveDictionaryTier: vi.fn(),
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
  // Deliberately stale and wrong for the open book: the previous book's fiction
  // dictionary is still in the saved list. What the reader sees must come from the
  // binding, not from this.
  disk = installFakeConfigDisk({
    activeProperNouns: ['properNouns', 'properNouns-f_TruTien'],
    defaultQuickAddDictionary: null,
  });
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
    expect(disk.saveConfiguration).not.toHaveBeenCalled();
  });

  test('generic and theme rows stay fully editable', async () => {
    render(<ConfigurationManager />);
    await waitFor(() => expect(screen.getByText('_AiCap')).toBeInTheDocument());

    expect(checkboxFor('_AiCap').disabled).toBe(false);
    expect(checkboxFor('General Purpose Dictionary').disabled).toBe(false);

    fireEvent.click(checkboxFor('_AiCap'));
    await waitFor(() =>
      expect(disk.saveConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          // The open book's dictionary, not the stale one the saved config still lists:
          // a generic toggle must not resurrect the previous book's fiction entry.
          activeProperNouns: ['properNouns', 'properNouns-f_TapDo', 'properNouns-_AiCap'],
        })
      )
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

describe('the Configuration tab after the open book rewrote config', () => {
  // Every tab stays mounted, so the tab read config once and is still showing it when
  // announcing a book rewrites the default quick-add target.
  test('shows the default quick-add target the book set, and a click then clears it', async () => {
    const { result } = renderHook(() => useDictionaryConfigManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.defaultQuickAddDictionary).toBeNull();

    await act(async () => {
      await saveAppConfig({ ui: { defaultQuickAddDictionary: 'properNouns-f_TapDo' } });
    });
    await waitFor(() =>
      expect(result.current.defaultQuickAddDictionary).toBe('properNouns-f_TapDo')
    );

    // Toggling the marker the reader sees must turn it off, not set it again.
    await act(async () => {
      await result.current.handleSetDefaultQuickAdd('properNouns-f_TapDo');
    });
    expect(disk.disk.raw.defaultQuickAddDictionary).toBeNull();
    expect(result.current.defaultQuickAddDictionary).toBeNull();
  });
});

describe('a tier move from the Configuration tab', () => {
  // The binding context does the move: Rust renames the files and rewrites config, then the
  // context may save again. This tab only has to end up showing what the file now says.
  test('renames the row and shows the active list and quick-add default the move left', async () => {
    binding.isBookOpen = false;
    binding.boundFictionDictionary = null;
    disk.disk.raw.activeProperNouns = ['properNouns', 'properNouns-_AiCap'];
    disk.disk.raw.defaultQuickAddDictionary = 'properNouns-_AiCap';
    binding.moveDictionaryTier.mockImplementation(async () => {
      await callRustConfigWrite(async () => {
        disk.disk.raw.activeProperNouns = ['properNouns', 'properNouns-f_AiCap'];
        disk.disk.raw.defaultQuickAddDictionary = 'properNouns-f_AiCap';
        return { success: true };
      });
      return { success: true, filesMoved: true, newId: 'properNouns-f_AiCap' };
    });
    const { result } = renderHook(() => useDictionaryConfigManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.defaultQuickAddDictionary).toBe('properNouns-_AiCap');

    await act(async () => {
      await result.current.handleMoveTier('properNouns-_AiCap');
    });

    await waitFor(() => {
      expect(result.current.availableDictionaries).toContain('properNouns-f_AiCap');
      expect(result.current.activeDictionaries).toEqual(['properNouns', 'properNouns-f_AiCap']);
      expect(result.current.defaultQuickAddDictionary).toBe('properNouns-f_AiCap');
    });
    expect(result.current.availableDictionaries).not.toContain('properNouns-_AiCap');
  });

  test('a refused move changes nothing on screen', async () => {
    binding.moveDictionaryTier.mockResolvedValue({
      success: false,
      error: 'already exists',
      filesMoved: false,
      newId: 'properNouns-f_AiCap',
    });
    const { result } = renderHook(() => useDictionaryConfigManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleMoveTier('properNouns-_AiCap');
    });

    expect(result.current.error).toContain('already exists');
    expect(result.current.availableDictionaries).toContain('properNouns-_AiCap');
    expect(result.current.availableDictionaries).not.toContain('properNouns-f_AiCap');
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
