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
import { userEvent } from '@testing-library/user-event';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import React from 'react';
import DictionaryManager from '../DictionaryManager';
import { VisibleTabProvider } from '../../VisibleTabContext';
import { installFakeConfigDisk } from '../../../test/fakeConfigDisk';
import { loadAppConfig, saveAppConfig } from '../../../utils/appConfig';

let configDisk: ReturnType<typeof installFakeConfigDisk>;

// What is active is config as the open book's binding implies it: config comes from a fake
// config.json behind the real `appConfig`, the binding from this mock, which re-renders its
// consumer on `notifyContextChange` like the provider would.
const binding = vi.hoisted(() => ({
  isBookOpen: false,
  boundFictionDictionary: null as string | null,
}));
vi.mock('../../BookBindingContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    contextVersion.listeners.add(listener);
    return () => contextVersion.listeners.delete(listener);
  };
  return {
    useBookBinding: () => {
      useSyncExternalStore(subscribe, () => contextVersion.value);
      return { ...binding };
    },
  };
});

const {
  dictionariesRef,
  unreadRef,
  selectedDictionaryRef,
  setSelectedDictionary,
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
  bulkDeleteEntries: vi.fn().mockResolvedValue({ count: 0, missing: [] }),
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

// Undo/redo buttons are disabled until the store says there is history.
const history = vi.hoisted(() => ({ canUndo: false, canRedo: false }));

// A real context re-renders its consumers when its value changes; a ref read by the mock does
// not, and `DictionaryManager` is memoized, so a bare `rerender` with the same props skips it.
// `notifyContextChange` plays the provider publishing a new value.
const contextVersion = vi.hoisted(() => ({ value: 0, listeners: new Set<() => void>() }));
function notifyContextChange(): void {
  contextVersion.value += 1;
  contextVersion.listeners.forEach((listener) => listener());
}

vi.mock('../DictionaryContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    contextVersion.listeners.add(listener);
    return () => contextVersion.listeners.delete(listener);
  };
  return {
    useDictionary: () => {
      useSyncExternalStore(subscribe, () => contextVersion.value);
      return {
        dictionaries: dictionariesRef.current,
        unreadDictionaryIds: unreadRef.current,
        isLoading: false,
        selectedDictionary: selectedDictionaryRef.current,
        setSelectedDictionary,
        bulkDeleteEntries,
        updateEntry,
        renameEntry,
        patchEntry,
        undo,
        redo,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        loadDictionary,
        importDictionaries,
        dictionaryTypes,
      };
    },
  };
});

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
  bulkDeleteEntries.mockResolvedValue({ count: 0, missing: [] });
  history.canUndo = false;
  history.canRedo = false;
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

  binding.isBookOpen = false;
  binding.boundFictionDictionary = null;
  configDisk = installFakeConfigDisk({
    activeProperNouns: ['properNouns-Test', 'properNouns-Other'],
  });
});

/** The dictionary selector is the kit Select: its options exist only while it is open. */
async function openSelector(): Promise<HTMLElement> {
  const trigger = await screen.findByRole('combobox', { name: 'Dictionary' });
  await waitFor(() => expect(trigger).not.toHaveAttribute('data-disabled'));
  const user = userEvent.setup();
  act(() => trigger.focus());
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('listbox');
  return trigger;
}

describe('DictionaryManager — which dictionaries the selector lists', () => {
  const option = (name: string) => screen.queryByRole('option', { name });

  test('lists what the open book binds, not what config alone says', async () => {
    // A book is open whose binding adds its fiction dictionary; config never listed it.
    binding.isBookOpen = true;
    binding.boundFictionDictionary = 'properNouns-f_Novel';
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await act(async () => {
      await loadAppConfig();
    });
    await openSelector();

    expect(await screen.findByRole('option', { name: 'Novel' })).toBeInTheDocument();
    expect(option('Inactive')).not.toBeInTheDocument();
  });

  test('always lists the selected dictionary, active or not, so the selector matches the table', async () => {
    selectedDictionaryRef.current = 'properNouns-Inactive';
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });

    const trigger = await screen.findByRole('combobox', { name: 'Dictionary' });
    await waitFor(() => expect(trigger).toHaveTextContent('Inactive'));
    await openSelector();
    await waitFor(() => expect(option('Other')).toBeInTheDocument());
    expect(option('Inactive')).toBeInTheDocument();
    expect(option('Novel')).not.toBeInTheDocument();
  });

  test('lists every dictionary while config is still loading', async () => {
    // Held, then released at the end: a load left in flight would be shared by the next test.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const realLoad = configDisk.loadConfiguration.getMockImplementation()!;
    configDisk.loadConfiguration.mockImplementationOnce(async () => {
      await held;
      return realLoad();
    });
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });

    await openSelector();
    expect(await screen.findByRole('option', { name: 'Inactive' })).toBeInTheDocument();
    expect(option('Novel')).toBeInTheDocument();

    await act(async () => {
      release();
      await loadAppConfig();
    });
    await waitFor(() => expect(option('Inactive')).not.toBeInTheDocument());
  });

  test('follows a config save and a bind made elsewhere while it stays mounted and shown', async () => {
    const user = userEvent.setup();
    render(<DictionaryManager isActive />, { wrapper: VisibleTabProvider });
    await act(async () => {
      await loadAppConfig();
    });
    await openSelector();
    await waitFor(() => expect(option('Other')).toBeInTheDocument());
    expect(option('Inactive')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    // The Configuration tab activates a dictionary: no remount, no isActive edge.
    await act(async () => {
      await saveAppConfig({
        engine: {
          activeProperNouns: ['properNouns-Test', 'properNouns-Other', 'properNouns-Inactive'],
        },
      });
    });
    await openSelector();
    expect(await screen.findByRole('option', { name: 'Inactive' })).toBeInTheDocument();
    expect(option('Novel')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    // The Reader binds the open book to its fiction dictionary.
    act(() => {
      binding.isBookOpen = true;
      binding.boundFictionDictionary = 'properNouns-f_Novel';
      notifyContextChange();
    });
    await openSelector();
    expect(await screen.findByRole('option', { name: 'Novel' })).toBeInTheDocument();
  });
});

describe('DictionaryManager + EnhancedVirtualizedDictionaryTable — composition', () => {
  test('an unread dictionary is labelled in the selector and says why its table is empty', async () => {
    unreadRef.current = ['properNouns-Test'];
    delete dictionariesRef.current['properNouns-Test'];
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await openSelector();

    expect(await screen.findByRole('option', { name: "Test — couldn't read" })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read properNouns-Test.json");

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /Reload/ }));
    expect(loadDictionary).toHaveBeenCalledWith('properNouns-Test');
  });

  test('switching dictionaries reads nothing from disk: memory is the source of truth', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    selectedDictionaryRef.current = 'properNouns-Other';
    await act(async () => {
      notifyContextChange();
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
    bulkDeleteEntries.mockResolvedValue({ count: 1, missing: [] });
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

    expect(bulkDeleteEntries).toHaveBeenCalledWith([
      { dictionaryId: 'properNouns-Test', key: '你好' },
    ]);
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
    expect(bulkDeleteEntries).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Click again to delete'));
    });
    expect(bulkDeleteEntries).toHaveBeenCalledWith([
      { dictionaryId: 'properNouns-Test', key: '你好' },
    ]);
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
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    await act(async () => {
      fireEvent.click(getRowCheckbox('你好'));
    });
    fireEvent.contextMenu(screen.getByText('再见'));
    expect(await screen.findByText('Edit Entry')).toBeInTheDocument();
    // The open kit menu hides the page behind it from the accessibility tree.
    expect(screen.getByRole('button', { name: /Delete \(1\)/, hidden: true })).toBeInTheDocument();

    selectedDictionaryRef.current = 'properNouns-Other';
    await act(async () => {
      notifyContextChange();
    });

    await screen.findByText('Bye');
    expect(screen.queryByText('Edit Entry')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete \(/ })).not.toBeInTheDocument();
  });
});

describe('Find Duplicates and bulk Move', () => {
  const tickFirstDuplicateRow = async (): Promise<void> => {
    fireEvent.click(await screen.findByRole('button', { name: /Find Duplicates/ }));
    const rowBox = (await screen.findAllByRole('checkbox')).find((box) =>
      (box.getAttribute('title') ?? '').startsWith('Select for')
    )!;
    await act(async () => {
      fireEvent.click(rowBox);
    });
    expect(screen.getByRole('button', { name: 'Delete (1)' })).toBeInTheDocument();
  };

  test('choosing a dictionary while duplicates are shown leaves the duplicate view for it', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');
    await tickFirstDuplicateRow();

    // What a Cmd-1..6 press does: TabbedInterface sets the selected dictionary.
    selectedDictionaryRef.current = 'properNouns-Other';
    await act(async () => {
      notifyContextChange();
    });

    expect(screen.queryByRole('button', { name: /Exit Duplicate View/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find Duplicates/ })).toBeInTheDocument();
    expect(await screen.findByText('Bye')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete \(/ })).not.toBeInTheDocument();
  });

  test('a selection in the duplicate view offers Delete but not Move', async () => {
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');
    await tickFirstDuplicateRow();

    expect(screen.queryByRole('button', { name: /Move \(/ })).not.toBeInTheDocument();
  });

  test('a selection in a lookup table offers Delete but not Move', async () => {
    const types = dictionaryTypes as Record<string, { label: string }>;
    types.characters = { label: 'Characters' };
    dictionariesRef.current.characters = { 你: { translation: 'bạn' } };
    selectedDictionaryRef.current = 'characters';
    try {
      render(<DictionaryManager />, { wrapper: VisibleTabProvider });
      await screen.findByText('bạn');
      await act(async () => {
        fireEvent.click(getRowCheckbox('你'));
      });

      expect(screen.getByRole('button', { name: 'Delete (1)' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Move \(/ })).not.toBeInTheDocument();
    } finally {
      delete types.characters;
    }
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

describe('Undo, redo and export failures', () => {
  test('a failed undo shows the error banner', async () => {
    history.canUndo = true;
    undo.mockRejectedValueOnce(new Error('history gone'));
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByTitle('Undo last change'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to undo last change. Please try again.'
    );
  });

  test('a failed redo shows the error banner', async () => {
    history.canRedo = true;
    redo.mockRejectedValueOnce(new Error('history gone'));
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByTitle('Redo last change'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to redo change. Please try again.'
    );
  });

  const stubExport = (exportDictionaries: () => Promise<unknown>): void => {
    global.window.electronAPI = {
      exportDictionaries,
    } as unknown as typeof window.electronAPI;
  };

  test('an export that reports failure shows the error banner', async () => {
    stubExport(async () => ({ success: false, error: 'Disk full' }));
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByRole('button', { name: /Export All/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed: Disk full');
  });

  test('a rejected export shows the error banner too', async () => {
    stubExport(async () => {
      throw new Error('ipc down');
    });
    render(<DictionaryManager />, { wrapper: VisibleTabProvider });
    await screen.findByText('Xin chào');

    fireEvent.click(screen.getByRole('button', { name: /Export All/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Export error: ipc down');
  });
});
