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
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import React from 'react';
import DictionaryManager from '../DictionaryManager';
import { VisibleTabProvider } from '../../VisibleTabContext';
import { loadAppConfig } from '../../../utils/appConfig';

vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn(),
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
  reloadAfterImport,
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
  reloadAfterImport: vi.fn().mockResolvedValue(undefined),
  // The Dictionary Store's list, one identity across renders.
  dictionaryTypes: {
    'properNouns-Test': { label: 'Test' },
    'properNouns-Other': { label: 'Other' },
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
    reloadAfterImport,
    dictionaryTypes,
  }),
}));

vi.mock('../../ToastContext', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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

  vi.mocked(loadAppConfig).mockResolvedValue({
    engine: { activeProperNouns: ['properNouns-Test', 'properNouns-Other'] },
    ui: { defaultQuickAddDictionary: null },
    session: { lastSelectedDictionary: null },
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

  test('import re-reads every dictionary through the store, not only the selected one', async () => {
    const importDictionaries = vi.fn().mockResolvedValue({ success: true, message: 'Imported' });
    (window as unknown as { electronAPI: object }).electronAPI = { importDictionaries };
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    });

    expect(importDictionaries).toHaveBeenCalled();
    expect(reloadAfterImport).toHaveBeenCalledOnce();
    expect(loadDictionary).not.toHaveBeenCalled();
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
