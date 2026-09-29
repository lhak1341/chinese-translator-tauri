import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntryEditAndMove } from '../useEntryEditAndMove';
import type { DictionaryData } from '../../types/DictionaryTypes';

const DICT_ID = 'phrases';
const SOURCE = '龙';
const TRANSLATION = 'rồng';

const phraseEntry = { translation: TRANSLATION, allowAsPatternVariable: true };
const dictionaries: Record<string, DictionaryData> = {
  [DICT_ID]: { [SOURCE]: phraseEntry },
};

function makeParams(overrides: Partial<Parameters<typeof useEntryEditAndMove>[0]> = {}) {
  return {
    dictionaries,
    updateEntry: vi.fn().mockResolvedValue(undefined),
    patchEntry: vi.fn().mockResolvedValue(undefined),
    withScrollPreservation: vi.fn().mockImplementation(async (fn: () => Promise<void>) => {
      await fn();
    }),
    ...overrides,
  };
}

describe('useEntryEditAndMove — initial state', () => {
  it('starts with no editing or move entry', () => {
    const { result } = renderHook(() => useEntryEditAndMove(makeParams()));
    expect(result.current.editingEntry).toBeNull();
    expect(result.current.moveEntry).toBeNull();
  });
});

describe('useEntryEditAndMove — onContextMenuEdit', () => {
  it('sets editingEntry from dictionary lookup', () => {
    const { result } = renderHook(() => useEntryEditAndMove(makeParams()));
    act(() =>
      result.current.onContextMenuEdit({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: DICT_ID,
      })
    );
    expect(result.current.editingEntry).toEqual({
      source: SOURCE,
      translation: phraseEntry,
      allowAsPatternVariable: true,
      dictionaryId: DICT_ID,
    });
  });

  it('sets allowAsPatternVariable=false when value is a plain string', () => {
    const params = makeParams({
      dictionaries: { [DICT_ID]: { [SOURCE]: TRANSLATION } },
    });
    const { result } = renderHook(() => useEntryEditAndMove(params));
    act(() =>
      result.current.onContextMenuEdit({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: DICT_ID,
      })
    );
    expect(result.current.editingEntry?.allowAsPatternVariable).toBe(false);
  });

  it('returns early when dictionary is not found', () => {
    const { result } = renderHook(() => useEntryEditAndMove(makeParams()));
    act(() =>
      result.current.onContextMenuEdit({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: 'nonexistent',
      })
    );
    expect(result.current.editingEntry).toBeNull();
  });
});

describe('useEntryEditAndMove — onContextMenuMove', () => {
  it('sets moveEntry', () => {
    const { result } = renderHook(() => useEntryEditAndMove(makeParams()));
    act(() =>
      result.current.onContextMenuMove({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: DICT_ID,
      })
    );
    expect(result.current.moveEntry).toEqual({
      source: SOURCE,
      translation: TRANSLATION,
      dictionaryId: DICT_ID,
    });
  });
});

describe('useEntryEditAndMove — updateEntryWithScrollPreservation', () => {
  it('calls updateEntry with correct arguments', async () => {
    const updateEntry = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEntryEditAndMove(makeParams({ updateEntry })));

    await act(async () => {
      await result.current.updateEntryWithScrollPreservation(DICT_ID, SOURCE, '龍', TRANSLATION);
    });

    expect(updateEntry).toHaveBeenCalledWith(DICT_ID, SOURCE, '龍', TRANSLATION, undefined);
  });

  it('calls updateEntry with metadata when provided', async () => {
    const updateEntry = vi.fn().mockResolvedValue(undefined);
    const metadata = { allowAsPatternVariable: true };
    const { result } = renderHook(() => useEntryEditAndMove(makeParams({ updateEntry })));

    await act(async () => {
      await result.current.updateEntryWithScrollPreservation(
        DICT_ID,
        SOURCE,
        SOURCE,
        TRANSLATION,
        metadata
      );
    });

    expect(updateEntry).toHaveBeenCalledWith(DICT_ID, SOURCE, SOURCE, TRANSLATION, metadata);
  });

  it('delegates to withScrollPreservation', async () => {
    const withScrollPreservation = vi.fn().mockImplementation(async (fn: () => Promise<void>) => {
      await fn();
    });
    const { result } = renderHook(() =>
      useEntryEditAndMove(makeParams({ withScrollPreservation }))
    );

    await act(async () => {
      await result.current.updateEntryWithScrollPreservation(DICT_ID, SOURCE, SOURCE, TRANSLATION);
    });

    expect(withScrollPreservation).toHaveBeenCalledOnce();
  });

  it('patchEntryWithScrollPreservation passes the patch through inside withScrollPreservation', async () => {
    const patchEntry = vi.fn().mockResolvedValue(undefined);
    const withScrollPreservation = vi.fn().mockImplementation(async (fn: () => Promise<void>) => {
      await fn();
    });
    const { result } = renderHook(() =>
      useEntryEditAndMove(makeParams({ patchEntry, withScrollPreservation }))
    );

    await act(async () => {
      await result.current.patchEntryWithScrollPreservation(DICT_ID, SOURCE, {
        semanticType: 'concept',
      });
    });

    expect(withScrollPreservation).toHaveBeenCalledOnce();
    expect(patchEntry).toHaveBeenCalledWith(DICT_ID, SOURCE, { semanticType: 'concept' });
  });

  it('propagates updateEntry rejection', async () => {
    const updateEntry = vi.fn().mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => useEntryEditAndMove(makeParams({ updateEntry })));

    await expect(
      act(async () => {
        await result.current.updateEntryWithScrollPreservation(
          DICT_ID,
          SOURCE,
          SOURCE,
          TRANSLATION
        );
      })
    ).rejects.toThrow('save failed');

    expect(updateEntry).toHaveBeenCalled();
  });
});

describe('useEntryEditAndMove — closeEdit / closeMove', () => {
  it('closeEdit() clears editingEntry without affecting moveEntry', () => {
    const { result } = renderHook(() => useEntryEditAndMove(makeParams()));
    act(() => {
      result.current.onContextMenuEdit({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: DICT_ID,
      });
      result.current.onContextMenuMove({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: DICT_ID,
      });
    });
    act(() => result.current.closeEdit());
    expect(result.current.editingEntry).toBeNull();
    expect(result.current.moveEntry).not.toBeNull();
  });

  it('closeMove() clears moveEntry without affecting editingEntry', () => {
    const { result } = renderHook(() => useEntryEditAndMove(makeParams()));
    act(() => {
      result.current.onContextMenuEdit({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: DICT_ID,
      });
      result.current.onContextMenuMove({
        source: SOURCE,
        translation: TRANSLATION,
        dictionaryId: DICT_ID,
      });
    });
    act(() => result.current.closeMove());
    expect(result.current.moveEntry).toBeNull();
    expect(result.current.editingEntry).not.toBeNull();
  });
});
