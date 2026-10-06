/**
 * Composition coverage for DictionaryManager + EnhancedVirtualizedDictionaryTable
 * (architecture review 2026-07-17, candidate 1). Every hook EVDT composes
 * (useDictionaryEntryFilter, useVirtualScrollRange, useEntrySelection, useEntryEditAndMove,
 * useContextMenu) is individually tested, but the WIRING between them — and the lifted
 * SelectionState handoff to DictionaryManager, which renders the bulk-delete-confirm UI
 * itself — had zero coverage. This file exercises the real hooks together through the
 * rendered interface; only DictionaryContext (already covered by DictionaryContext.test.tsx
 * and useDictionaryCRUD.test.ts) and the 3 modal components (DictionaryEntry, MoveEntryDialog,
 * BulkMoveDialog — each gets its own dedicated test file, matching MoveEntryDialog.test.tsx)
 * are mocked. MoveDialog is the single unified dialog for both single-entry (context menu)
 * and bulk (checkbox multi-select) moves — see MoveDialog.test.tsx for its own dedicated
 * coverage; here only the EVDT-level wiring (which trigger produces which `entries` array) is
 * exercised.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import React from 'react';
import DictionaryManager from '../DictionaryManager';
import { VisibleTabProvider } from '../../VisibleTabContext';

// What is active comes from the binding provider's view, as it does for every Add.
const loadQuickAddView = vi.hoisted(() => vi.fn());
vi.mock('../../BookBindingContext', () => ({
  useBookBinding: () => ({ loadQuickAddView }),
}));

const {
  dictionariesRef,
  unreadRef,
  selectedDictionaryRef,
  setSelectedDictionary,
  deleteEntry,
  bulkDeleteEntries,
  updateEntry,
  renameEntry,
  patchEntry,
  undo,
  redo,
  loadDictionary,
  importDictionaries,
  dictionaryTypes,
} = vi.hoisted(() => ({
  dictionariesRef: {
    current: {
      'properNouns-Test': {
        你好: { translation: 'Xin chào' },
        再见: { translation: 'Tạm biệt' },
      },
      'properNouns-Other': {
        再见: { translation: 'Bye' },
      },
    } as Record<string, Record<string, { translation: string }>>,
  },
  unreadRef: { current: [] as string[] },
  selectedDictionaryRef: { current: 'properNouns-Test' },
  setSelectedDictionary: vi.fn((id: string) => {
    selectedDictionaryRef.current = id;
  }),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  bulkDeleteEntries: vi.fn().mockResolvedValue({ successCount: 0, errors: [] }),
  updateEntry: vi.fn().mockResolvedValue(undefined),
  renameEntry: vi.fn().mockResolvedValue(undefined),
  patchEntry: vi.fn().mockResolvedValue(undefined),
  undo: vi.fn().mockResolvedValue(true),
  redo: vi.fn().mockResolvedValue(true),
  loadDictionary: vi.fn().mockResolvedValue(undefined),
  importDictionaries: vi.fn().mockResolvedValue({ status: 'imported', message: 'Imported' }),
  // The Dictionary Store's list, one identity across renders.
  dictionaryTypes: {
    'properNouns-Test': { label: 'Test' },
    'properNouns-Other': { label: 'Other' },
    'properNouns-Inactive': { label: 'Inactive' },
    'properNouns-f_Novel': { label: 'Novel' },
  },
}));

vi.mock('../DictionaryContext', () => ({
  useDictionary: () => ({
    dictionaries: dictionariesRef.current,
    unreadDictionaryIds: unreadRef.current,
    isLoading: false,
    selectedDictionary: selectedDictionaryRef.current,
    setSelectedDictionary,
    deleteEntry,
    bulkDeleteEntries,
    updateEntry,
    renameEntry,
    patchEntry,
    undo,
    redo,
    canUndo: false,
    canRedo: false,
    loadDictionary,
    importDictionaries,
    dictionaryTypes,
  }),
}));

vi.mock('../../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('../DictionaryEntry', () => ({
  default: ({ onClose, entry, selectedDictionary }: any) => (
    <div data-testid="dictionary-entry-modal">
      <span data-testid="dictionary-entry-mode">{entry ? 'edit' : 'add'}</span>
      <span data-testid="dictionary-entry-dict">{selectedDictionary}</span>
      {entry && <span data-testid="dictionary-entry-source">{entry.source}</span>}
      <button onClick={onClose}>close-entry-modal</button>
    </div>
  ),
}));

vi.mock('../MoveDialog', () => ({
  default: ({ entries, currentDictionary, onClose, onSuccess }: any) => (
    <div data-testid="move-dialog">
      <span data-testid="move-dialog-entries">{entries.join(',')}</span>
      <span data-testid="move-dialog-current-dict">{currentDictionary}</span>
      <button
        onClick={() => {
          onClose();
          onSuccess?.();
        }}
      >
        confirm-move
      </button>
      <button onClick={onClose}>close-move-dialog</button>
    </div>
  ),
}));

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function getRowCheckbox(sourceText: string): HTMLInputElement {
  const span = screen.getByText(sourceText);
  const checkboxCell = span.parentElement!.previousElementSibling as HTMLElement;
  return within(checkboxCell).getByRole('checkbox') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  bulkDeleteEntries.mockResolvedValue({ successCount: 0, errors: [] });
  selectedDictionaryRef.current = 'properNouns-Test';
  unreadRef.current = [];
  dictionariesRef.current = {
    'properNouns-Test': {
      你好: { translation: 'Xin chào' },
      再见: { translation: 'Tạm biệt' },
    },
    'properNouns-Other': {
      再见: { translation: 'Bye' },
    },
  };

  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });

  loadQuickAddView.mockResolvedValue({
    activeProperNouns: ['properNouns-Test', 'properNouns-Other'],
    defaultQuickAddDictionary: null,
  });
});

describe('DictionaryManager — which dictionaries the selector lists', () => {
  const option = (name: string) => screen.queryByRole('option', { name });

  test('lists what the binding view has active, not what config alone says', async () => {
    // A book is open whose binding adds its fiction dictionary; config never listed it.
    loadQuickAddView.mockResolvedValue({
      activeProperNouns: ['properNouns-Test', 'properNouns-f_Novel'],
      defaultQuickAddDictionary: null,
    });
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });

    expect(await screen.findByRole('option', { name: 'Novel' })).toBeInTheDocument();
    expect(option('Inactive')).not.toBeInTheDocument();
  });

  test('always lists the selected dictionary, active or not, so the selector matches the table', async () => {
    selectedDictionaryRef.current = 'properNouns-Inactive';
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });

    await waitFor(() => expect(loadQuickAddView).toHaveBeenCalled());
    await waitFor(() => expect(option('Other')).toBeInTheDocument());
    expect(option('Inactive')).toBeInTheDocument();
    expect(option('Novel')).not.toBeInTheDocument();
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe(
      'properNouns-Inactive'
    );
  });

  test('a view that could not be loaded lists every dictionary', async () => {
    loadQuickAddView.mockResolvedValue(null);
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });

    await waitFor(() => expect(loadQuickAddView).toHaveBeenCalled());
    expect(await screen.findByRole('option', { name: 'Inactive' })).toBeInTheDocument();
    expect(option('Novel')).toBeInTheDocument();
  });
});

describe('DictionaryManager + EnhancedVirtualizedDictionaryTable — composition', () => {
  test('an unread dictionary is labelled in the selector and says why its table is empty', async () => {
    unreadRef.current = ['properNouns-Test'];
    delete dictionariesRef.current['properNouns-Test'];
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });

    expect(await screen.findByRole('option', { name: "Test — couldn't read" })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read properNouns-Test.json");

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /Reload/ }));
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-Test');
  });

  test('switching dictionaries reads nothing from disk: memory is the source of truth', async () => {
    const { rerender } = render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    selectedDictionaryRef.current = 'properNouns-Other';
    await act(async () => {
      rerender(<DictionaryManager />, { wrapper: VisibleTabProvider });
    });

    await screen.findByText('Bye');
    expect(loadDictionary).not.toHaveBeenCalled();
  });

  test('import goes through the store, which re-reads every dictionary, not only the selected one', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    });

    expect(importDictionaries).toHaveBeenCalledOnce();
    expect(loadDictionary).not.toHaveBeenCalled();
    expect(screen.queryByText(/Import failed/)).not.toBeInTheDocument();
  });

  test('a failed import shows the error', async () => {
    importDictionaries.mockResolvedValueOnce({ status: 'failed', error: 'No file selected' });
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    });

    expect(await screen.findByText(/Import failed: No file selected/)).toBeInTheDocument();
  });

  test('files imported but not reloaded tell the user to reload', async () => {
    importDictionaries.mockResolvedValueOnce({ status: 'reload-failed', message: 'Imported' });
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    });

    expect(
      await screen.findByText(/Imported, but the dictionaries could not be reloaded/)
    ).toBeInTheDocument();
  });

  test('selecting a row lifts SelectionState to DictionaryManager, which renders bulk buttons', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    expect(screen.queryByRole('button', { name: /Delete \(/ })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(getRowCheckbox('你好'));
    });

    expect(screen.getByRole('button', { name: 'Delete (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Move \(1\)/ })).toBeInTheDocument();
  });

  test('bulk-delete confirm flow calls bulkDeleteEntries and resets selection', async () => {
    bulkDeleteEntries.mockResolvedValue({ successCount: 1, errors: [] });
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(getRowCheckbox('你好'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete (1)' }));
    expect(screen.getByRole('button', { name: /Yes, Delete 1/ })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Yes, Delete 1/ }));
    });

    expect(bulkDeleteEntries).toHaveBeenCalledWith('properNouns-Test', ['你好']);
    expect(screen.queryByRole('button', { name: /Delete \(/ })).not.toBeInTheDocument();
  });

  test('bulk-move dialog opens with the lifted selection, and resets selection on success', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(getRowCheckbox('你好'));
    });
    fireEvent.click(screen.getByRole('button', { name: /Move \(1\)/ }));

    expect(screen.getByTestId('move-dialog-entries')).toHaveTextContent('你好');
    expect(screen.getByTestId('move-dialog-current-dict')).toHaveTextContent('properNouns-Test');

    fireEvent.click(screen.getByText('confirm-move'));

    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete \(/ })).not.toBeInTheDocument();
  });

  test('context menu -> Edit Entry opens the modal with the right entry', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.contextMenu(screen.getByText('你好'));
    fireEvent.click(screen.getByText('Edit Entry'));

    expect(screen.getByTestId('dictionary-entry-mode')).toHaveTextContent('edit');
    expect(screen.getByTestId('dictionary-entry-source')).toHaveTextContent('你好');

    fireEvent.click(screen.getByText('close-entry-modal'));
    expect(screen.queryByTestId('dictionary-entry-modal')).not.toBeInTheDocument();
  });

  test('context menu -> Move to... opens MoveDialog with a single-element entries array', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.contextMenu(screen.getByText('你好'));
    fireEvent.click(screen.getByText('Move to...'));

    expect(screen.getByTestId('move-dialog-entries')).toHaveTextContent('你好');
    expect(screen.getByTestId('move-dialog-current-dict')).toHaveTextContent('properNouns-Test');

    fireEvent.click(screen.getByText('close-move-dialog'));
    expect(screen.queryByTestId('move-dialog')).not.toBeInTheDocument();
  });

  test('context menu -> Delete Entry needs a second click to confirm', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.contextMenu(screen.getByText('你好'));
    await act(async () => {
      fireEvent.click(screen.getByText('Delete Entry'));
    });
    expect(deleteEntry).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Click again to delete'));
    });
    expect(deleteEntry).toHaveBeenCalledWith('properNouns-Test', '你好');
  });

  test('inline translation edit patches the translation', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByText('Xin chào'));
    const input = screen.getByDisplayValue('Xin chào');
    fireEvent.change(input, { target: { value: 'Xin chào mới' } });

    await act(async () => {
      fireEvent.blur(input);
    });

    expect(patchEntry).toHaveBeenCalledWith('properNouns-Test', '你好', {
      translation: 'Xin chào mới',
    });
  });

  test('add-entry button opens DictionaryEntry in add mode (no entry prop)', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

    expect(screen.getByTestId('dictionary-entry-mode')).toHaveTextContent('add');
    expect(screen.queryByTestId('dictionary-entry-source')).not.toBeInTheDocument();
  });

  test('switching dictionaries resets selection and closes the context menu (5-way reset effect)', async () => {
    const { rerender } = render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(getRowCheckbox('你好'));
    });
    fireEvent.contextMenu(screen.getByText('再见'));
    expect(screen.getByText('Edit Entry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete \(1\)/ })).toBeInTheDocument();

    selectedDictionaryRef.current = 'properNouns-Other';
    await act(async () => {
      rerender(<DictionaryManager />, { wrapper: VisibleTabProvider });
    });

    await screen.findByText('Bye');
    expect(screen.queryByText('Edit Entry')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete \(/ })).not.toBeInTheDocument();
  });
});

describe('Show in Finder', () => {
  const stubOpenFolder = (openDictionaryFolder: () => Promise<unknown>): void => {
    global.window.electronAPI = {
      openDictionaryFolder,
    } as unknown as typeof window.electronAPI;
  };

  test('a failed open shows the error banner, as export and import do', async () => {
    stubOpenFolder(async () => ({ success: false, error: 'Failed to open dictionary folder' }));
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByRole('button', { name: /Show in Finder/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Open folder failed: Failed to open dictionary folder'
    );
  });

  test('a rejected call shows the error banner too', async () => {
    stubOpenFolder(async () => {
      throw new Error('ipc down');
    });
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByRole('button', { name: /Show in Finder/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Open folder error: ipc down');
  });

  test('a successful open shows nothing — the folder opening is the feedback', async () => {
    const open = vi.fn(async () => ({ success: true }));
    stubOpenFolder(open);
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByRole('button', { name: /Show in Finder/ }));

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
