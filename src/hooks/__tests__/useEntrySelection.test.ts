import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntrySelection } from '../useEntrySelection';
import type { DictionaryData, DictionaryEntryValue } from '../../types/DictionaryTypes';

vi.mock('../components/ToastContext', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../utils/dictionary', () => ({
  parseDuplicateKey: vi.fn((key: string) => {
    const [source, dictionaryId] = key.split('::');
    if (!source || !dictionaryId) throw new Error('Invalid key');
    return { source, dictionaryId };
  }),
}));

const phrases: DictionaryData = {
  龙: { translation: 'rồng' } as DictionaryEntryValue,
  凤凰: { translation: 'phượng hoàng' } as DictionaryEntryValue,
};
const dicts: Record<string, DictionaryData> = { phrases };

function makeScrollRef(scrollTop = 0) {
  return {
    current: { scrollTop } as HTMLDivElement,
  };
}

function makeProps(overrides = {}) {
  return {
    selectedDictionary: 'phrases',
    filteredEntries: Object.entries(phrases) as [string, DictionaryEntryValue][],
    dictionaries: dicts,
    showDuplicatesMode: false,
    scrollRef: makeScrollRef(),
    setScrollTop: vi.fn(),
    bulkDeleteEntries: vi.fn().mockResolvedValue({ successCount: 2, errors: [] }),
    onRefreshDuplicates: undefined,
    onScrollSave: undefined,
    onSelectionChange: undefined,
    ...overrides,
  };
}

describe('useEntrySelection — initial state', () => {
  it('starts with empty selection and all flags false', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    expect(result.current.selectedEntries.size).toBe(0);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.showBulkDeleteConfirm).toBe(false);
    expect(result.current.showBulkMoveDialog).toBe(false);
  });
});

describe('useEntrySelection — handleSelectEntry', () => {
  it('adds entry to selection', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectEntry('龙', true));
    expect(result.current.selectedEntries.has('龙')).toBe(true);
  });

  it('removes entry from selection', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectEntry('龙', true));
    act(() => result.current.handleSelectEntry('龙', false));
    expect(result.current.selectedEntries.has('龙')).toBe(false);
  });

  it('adding second entry keeps first', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectEntry('龙', true));
    act(() => result.current.handleSelectEntry('凤凰', true));
    expect(result.current.selectedEntries.size).toBe(2);
  });
});

describe('useEntrySelection — handleSelectAll', () => {
  it('selects all filtered entries', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectAll(true));
    expect(result.current.selectedEntries.size).toBe(2);
    expect(result.current.selectedEntries.has('龙')).toBe(true);
    expect(result.current.selectedEntries.has('凤凰')).toBe(true);
  });

  it('deselects all when false', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectAll(true));
    act(() => result.current.handleSelectAll(false));
    expect(result.current.selectedEntries.size).toBe(0);
  });
});

describe('useEntrySelection — handleBulkDelete (normal mode)', () => {
  it('calls bulkDeleteEntries with correct args', async () => {
    const bulkDeleteEntries = vi.fn().mockResolvedValue({ successCount: 2, errors: [] });
    const props = makeProps({ bulkDeleteEntries });
    const { result } = renderHook(() => useEntrySelection(props));
    act(() => result.current.handleSelectAll(true));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).toHaveBeenCalledWith('phrases', ['龙', '凤凰']);
  });

  it('clears selection after full success', async () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectAll(true));
    await act(async () => result.current.handleBulkDelete());
    expect(result.current.selectedEntries.size).toBe(0);
    expect(result.current.showBulkDeleteConfirm).toBe(false);
  });

  it('keeps selection when all deletions fail', async () => {
    const bulkDeleteEntries = vi
      .fn()
      .mockResolvedValue({ successCount: 0, errors: ['save failed'] });
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.handleSelectAll(true));
    await act(async () => result.current.handleBulkDelete());
    expect(result.current.selectedEntries.size).toBe(2);
  });

  it('no-op when selection is empty', async () => {
    const bulkDeleteEntries = vi.fn();
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).not.toHaveBeenCalled();
  });

  it('sets isDeleting=true during execution, false after', async () => {
    let capturedDeleting = false;
    const bulkDeleteEntries = vi.fn().mockImplementation(async () => {
      capturedDeleting = true;
      return { successCount: 1, errors: [] };
    });
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.handleSelectEntry('龙', true));
    await act(async () => result.current.handleBulkDelete());
    expect(capturedDeleting).toBe(true);
    expect(result.current.isDeleting).toBe(false);
  });
});

describe('useEntrySelection — handleBulkDelete (duplicate mode)', () => {
  it('groups deletions by dictionaryId parsed from composite key', async () => {
    const bulkDeleteEntries = vi.fn().mockResolvedValue({ successCount: 1, errors: [] });
    const props = makeProps({ showDuplicatesMode: true, bulkDeleteEntries });
    const { result } = renderHook(() => useEntrySelection(props));
    act(() => result.current.handleSelectEntry('龙::phrases', true));
    act(() => result.current.handleSelectEntry('凤凰::phrases', true));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).toHaveBeenCalledTimes(1);
    expect(bulkDeleteEntries).toHaveBeenCalledWith(
      'phrases',
      expect.arrayContaining(['龙', '凤凰'])
    );
  });

  it('skips missing dictionary in duplicate mode', async () => {
    const bulkDeleteEntries = vi.fn().mockResolvedValue({ successCount: 0, errors: [] });
    const props = makeProps({ showDuplicatesMode: true, bulkDeleteEntries });
    const { result } = renderHook(() => useEntrySelection(props));
    act(() => result.current.handleSelectEntry('龙::nonexistent', true));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).not.toHaveBeenCalled();
  });
});

describe('useEntrySelection — handleBulkMove', () => {
  it('opens bulk move dialog when entries selected', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectEntry('龙', true));
    act(() => result.current.handleBulkMove());
    expect(result.current.showBulkMoveDialog).toBe(true);
  });

  it('no-op when selection is empty', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleBulkMove());
    expect(result.current.showBulkMoveDialog).toBe(false);
  });
});

describe('useEntrySelection — resetSelection', () => {
  it('clears all selection state', async () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectAll(true));
    act(() => result.current.setShowBulkDeleteConfirm(true));
    act(() => result.current.handleBulkMove());
    act(() => result.current.resetSelection());
    expect(result.current.selectedEntries.size).toBe(0);
    expect(result.current.showBulkDeleteConfirm).toBe(false);
    expect(result.current.showBulkMoveDialog).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });
});

describe('useEntrySelection — onSelectionChange notification', () => {
  it('fires with current selection state when selection changes', () => {
    const onSelectionChange = vi.fn();
    const { result } = renderHook(() => useEntrySelection(makeProps({ onSelectionChange })));
    act(() => result.current.handleSelectEntry('龙', true));
    const lastCall = onSelectionChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.selectedEntries.has('龙')).toBe(true);
    expect(lastCall?.selectedCount).toBe(1);
  });

  it('exposes onBulkDelete and onBulkMove in the state payload', () => {
    const onSelectionChange = vi.fn();
    renderHook(() => useEntrySelection(makeProps({ onSelectionChange })));
    const lastCall = onSelectionChange.mock.calls.at(-1)?.[0];
    expect(typeof lastCall?.onBulkDelete).toBe('function');
    expect(typeof lastCall?.onBulkMove).toBe('function');
  });
});
