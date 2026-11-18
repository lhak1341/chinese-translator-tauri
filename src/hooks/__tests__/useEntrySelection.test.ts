import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntrySelection } from '../useEntrySelection';
import toast from '../../utils/toast';
import type { DictionaryData, DictionaryEntryValue } from '../../types/DictionaryTypes';
import type { EntryRef } from '../../utils/dictionary/DictionaryEdit';

vi.mock('../../utils/toast', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const phrases: DictionaryData = {
  龙: { translation: 'rồng' } as DictionaryEntryValue,
  凤凰: { translation: 'phượng hoàng' } as DictionaryEntryValue,
};
const dicts: Record<string, DictionaryData> = { phrases };

const ref = (dictionaryId: string, key: string): EntryRef => ({ dictionaryId, key });
const 龙 = ref('phrases', '龙');
const 凤凰 = ref('phrases', '凤凰');
// The duplicate view's rows: the same source in two dictionaries.
const duplicateEntries = [ref('phrases', '龙'), ref('properNouns', '龙')];

function makeProps(overrides = {}) {
  return {
    entries: [龙, 凤凰],
    dictionaries: dicts,
    canBulkMove: true,
    withScrollPreservation: vi.fn().mockImplementation(async (fn: () => Promise<void>) => {
      await fn();
    }),
    bulkDeleteEntries: vi.fn().mockResolvedValue({ count: 2, missing: [] }),
    onSelectionChange: undefined,
    ...overrides,
  };
}

describe('useEntrySelection — initial state', () => {
  it('starts with empty selection and all flags false', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.showBulkDeleteConfirm).toBe(false);
    expect(result.current.showBulkMoveDialog).toBe(false);
  });
});

describe('useEntrySelection — setSelected', () => {
  it('adds entry to selection', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.setSelected(龙, true));
    expect(result.current.isSelected(ref('phrases', '龙'))).toBe(true);
  });

  it('removes entry from selection', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.setSelected(龙, true));
    act(() => result.current.setSelected(ref('phrases', '龙'), false));
    expect(result.current.isSelected(龙)).toBe(false);
  });

  it('adding second entry keeps first', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.setSelected(龙, true));
    act(() => result.current.setSelected(凤凰, true));
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.selectedRefs).toEqual([龙, 凤凰]);
  });

  it('keeps the same source in two dictionaries apart', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.setSelected(ref('phrases', '龙'), true));
    expect(result.current.isSelected(ref('properNouns', '龙'))).toBe(false);
    act(() => result.current.setSelected(ref('properNouns', '龙'), true));
    expect(result.current.selectedCount).toBe(2);
  });

  // The old composite key `source::dictionaryId` threw on such a source while rendering.
  it('selects an entry whose source holds "::" or ":"', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.setSelected(ref('phrases', 'a::b'), true));
    act(() => result.current.setSelected(ref('phrases', 'a'), true));
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.isSelected(ref('phrases', 'a::b'))).toBe(true);
  });
});

describe('useEntrySelection — handleSelectAll', () => {
  it('selects every entry the view shows', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectAll(true));
    expect(result.current.selectedRefs).toEqual([龙, 凤凰]);
  });

  it('deselects all when false', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectAll(true));
    act(() => result.current.handleSelectAll(false));
    expect(result.current.selectedCount).toBe(0);
  });

  it('selects duplicate-view rows by their own dictionary', () => {
    const { result } = renderHook(() =>
      useEntrySelection(makeProps({ entries: duplicateEntries }))
    );
    act(() => result.current.handleSelectAll(true));
    expect(result.current.selectedRefs).toEqual(duplicateEntries);
  });
});

// `bulkDeleteEntries` owns every bulk-delete message (useDictionaryCRUD.test.ts); this hook
// only hands it the selected entries and never toasts.
const noToasts = () => {
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.warning).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
};

describe('useEntrySelection — handleBulkDelete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls bulkDeleteEntries once with the selected entries', async () => {
    const bulkDeleteEntries = vi.fn().mockResolvedValue({ count: 2, missing: [] });
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.handleSelectAll(true));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).toHaveBeenCalledTimes(1);
    expect(bulkDeleteEntries).toHaveBeenCalledWith([龙, 凤凰]);
    noToasts();
  });

  it('sends a selection spanning two dictionaries as one call', async () => {
    const bulkDeleteEntries = vi.fn().mockResolvedValue({ count: 2, missing: [] });
    const props = makeProps({ entries: duplicateEntries, bulkDeleteEntries });
    const { result } = renderHook(() => useEntrySelection(props));
    act(() => result.current.handleSelectAll(true));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).toHaveBeenCalledTimes(1);
    expect(bulkDeleteEntries).toHaveBeenCalledWith(duplicateEntries);
    noToasts();
  });

  it('deletes an entry whose source holds "::" by its own source', async () => {
    const bulkDeleteEntries = vi.fn().mockResolvedValue({ count: 1, missing: [] });
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.setSelected(ref('patterns-f_x', 'X::Y'), true));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).toHaveBeenCalledWith([{ dictionaryId: 'patterns-f_x', key: 'X::Y' }]);
  });

  it('leaves an entry whose dictionary is gone to the plan, which refuses the whole delete', async () => {
    const bulkDeleteEntries = vi.fn().mockRejectedValue(new Error('does not exist'));
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.setSelected(龙, true));
    act(() => result.current.setSelected(ref('nonexistent', '龙'), true));
    await act(async () => result.current.handleBulkDelete());
    expect(bulkDeleteEntries).toHaveBeenCalledWith([龙, ref('nonexistent', '龙')]);
    expect(result.current.selectedCount).toBe(2);
    noToasts();
  });

  it('clears selection after a delete that removed something', async () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.handleSelectAll(true));
    act(() => result.current.setShowBulkDeleteConfirm(true));
    await act(async () => result.current.handleBulkDelete());
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.showBulkDeleteConfirm).toBe(false);
  });

  it('keeps selection when nothing was deleted', async () => {
    const bulkDeleteEntries = vi.fn().mockResolvedValue({ count: 0, missing: [] });
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.handleSelectAll(true));
    await act(async () => result.current.handleBulkDelete());
    expect(result.current.selectedCount).toBe(2);
  });

  it('keeps selection and adds no toast when the delete rejects', async () => {
    const bulkDeleteEntries = vi.fn().mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.handleSelectAll(true));
    act(() => result.current.setShowBulkDeleteConfirm(true));
    await act(async () => result.current.handleBulkDelete());
    expect(result.current.selectedCount).toBe(2);
    expect(result.current.showBulkDeleteConfirm).toBe(true);
    expect(result.current.isDeleting).toBe(false);
    noToasts();
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
      return { count: 1, missing: [] };
    });
    const { result } = renderHook(() => useEntrySelection(makeProps({ bulkDeleteEntries })));
    act(() => result.current.setSelected(龙, true));
    await act(async () => result.current.handleBulkDelete());
    expect(capturedDeleting).toBe(true);
    expect(result.current.isDeleting).toBe(false);
  });
});

describe('useEntrySelection — bulk move', () => {
  it('offers no bulk move when the caller says a selection cannot move as a whole', () => {
    const onSelectionChange = vi.fn();
    renderHook(() => useEntrySelection(makeProps({ canBulkMove: false, onSelectionChange })));
    expect(onSelectionChange.mock.calls.at(-1)![0].onBulkMove).toBeUndefined();
  });

  it('offers bulk move otherwise', () => {
    const onSelectionChange = vi.fn();
    renderHook(() => useEntrySelection(makeProps({ onSelectionChange })));
    expect(onSelectionChange.mock.calls.at(-1)![0].onBulkMove).toEqual(expect.any(Function));
  });

  it('opens bulk move dialog when entries selected', () => {
    const { result } = renderHook(() => useEntrySelection(makeProps()));
    act(() => result.current.setSelected(龙, true));
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
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.showBulkDeleteConfirm).toBe(false);
    expect(result.current.showBulkMoveDialog).toBe(false);
    expect(result.current.isDeleting).toBe(false);
  });
});

describe('useEntrySelection — onSelectionChange notification', () => {
  it('fires with the selected count when selection changes', () => {
    const onSelectionChange = vi.fn();
    const { result } = renderHook(() => useEntrySelection(makeProps({ onSelectionChange })));
    act(() => result.current.setSelected(龙, true));
    expect(onSelectionChange.mock.calls.at(-1)?.[0]?.selectedCount).toBe(1);
  });

  it('exposes onBulkDelete and onBulkMove in the state payload', () => {
    const onSelectionChange = vi.fn();
    renderHook(() => useEntrySelection(makeProps({ onSelectionChange })));
    const lastCall = onSelectionChange.mock.calls.at(-1)?.[0];
    expect(typeof lastCall?.onBulkDelete).toBe('function');
    expect(typeof lastCall?.onBulkMove).toBe('function');
  });
});

describe('useEntrySelection — pruning stale entries', () => {
  it('drops a selected entry once it no longer exists in the dictionary', () => {
    let props = makeProps();
    const { result, rerender } = renderHook(() => useEntrySelection(props));
    act(() => result.current.setSelected(龙, true));
    act(() => result.current.setSelected(凤凰, true));
    expect(result.current.selectedCount).toBe(2);

    props = makeProps({ dictionaries: { phrases: { 凤凰: phrases['凤凰'] } } });
    rerender();

    expect(result.current.selectedRefs).toEqual([凤凰]);
  });

  it('drops a duplicate-view entry whose own dictionary lost it, keeping the same source elsewhere', () => {
    let props = makeProps({
      entries: duplicateEntries,
      dictionaries: { phrases, properNouns: { 龙: { translation: 'con rồng' } } },
    });
    const { result, rerender } = renderHook(() => useEntrySelection(props));
    act(() => result.current.handleSelectAll(true));

    props = makeProps({ entries: duplicateEntries, dictionaries: { phrases, properNouns: {} } });
    rerender();

    expect(result.current.selectedRefs).toEqual([ref('phrases', '龙')]);
  });

  it('keeps an entry whose source holds "::" while it exists', () => {
    let props = makeProps({ dictionaries: { phrases: { 'a::b': { translation: 'x' } } } });
    const { result, rerender } = renderHook(() => useEntrySelection(props));
    act(() => result.current.setSelected(ref('phrases', 'a::b'), true));

    props = makeProps({ dictionaries: { phrases: { 'a::b': { translation: 'y' } } } });
    rerender();

    expect(result.current.selectedCount).toBe(1);
  });

  it('keeps the same selection instance when nothing is stale (no extra re-render)', () => {
    let props = makeProps();
    const { result, rerender } = renderHook(() => useEntrySelection(props));
    act(() => result.current.setSelected(龙, true));
    const before = result.current.selectedRefs;

    props = makeProps({ dictionaries: { phrases: { ...phrases } } });
    rerender();

    expect(result.current.selectedRefs).toBe(before);
  });
});
