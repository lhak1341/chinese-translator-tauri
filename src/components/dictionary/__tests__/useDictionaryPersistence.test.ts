import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useDictionaryPersistence } from '../useDictionaryPersistence';
import type { DictionaryData } from '../../../types/DictionaryTypes';

const OLD: DictionaryData = { 你好: { translation: 'xin chào' } };
const NEW: DictionaryData = { 你好: { translation: 'updated' }, 再见: { translation: 'tạm biệt' } };

const mockSave = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as Record<string, unknown>).electronAPI = { saveDictionary: mockSave };
});

// Wraps the hook inside a real useState so setDictionaries is a genuine React setter.
function useFixture() {
  const [dicts, setDictionaries] = useState<Record<string, DictionaryData>>({ phrases: OLD });
  const persistence = useDictionaryPersistence(setDictionaries);
  return { dicts, ...persistence };
}

// ──────────────────────────────────────────────
// persistDictionaryMutation
// ──────────────────────────────────────────────

describe('persistDictionaryMutation', () => {
  it('success: optimistic update applied, returns true', async () => {
    mockSave.mockResolvedValue({ success: true, data: NEW });
    const { result } = renderHook(() => useFixture());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.persistDictionaryMutation('phrases', OLD, NEW);
    });

    expect(ok!).toBe(true);
    expect(result.current.dicts['phrases']).toEqual(NEW);
    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith('phrases', NEW);
  });

  it('failure: optimistic update then rollback, returns false', async () => {
    mockSave.mockResolvedValue({ success: false, data: null });
    const { result } = renderHook(() => useFixture());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.persistDictionaryMutation('phrases', OLD, NEW);
    });

    expect(ok!).toBe(false);
    // State rolled back to oldData
    expect(result.current.dicts['phrases']).toEqual(OLD);
    expect(mockSave).toHaveBeenCalledOnce();
  });
});

// ──────────────────────────────────────────────
// commitMoveOp
// ──────────────────────────────────────────────

const SRC_OLD: DictionaryData = {
  你好: { translation: 'xin chào' },
  再见: { translation: 'tạm biệt' },
};
const SRC_NEW: DictionaryData = { 再见: { translation: 'tạm biệt' } };
const TGT_OLD: DictionaryData = {};
const TGT_NEW: DictionaryData = { 你好: { translation: 'xin chào' } };

function useMoveFixture() {
  const [dicts, setDictionaries] = useState<Record<string, DictionaryData>>({
    phrases: SRC_OLD,
    characters: TGT_OLD,
  });
  const persistence = useDictionaryPersistence(setDictionaries);
  return { dicts, ...persistence };
}

describe('commitMoveOp', () => {
  it('success: both dicts updated, returns true', async () => {
    mockSave.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useMoveFixture());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.commitMoveOp({
        sourceDictId: 'phrases',
        oldSource: SRC_OLD,
        newSource: SRC_NEW,
        targetDictId: 'characters',
        oldTarget: TGT_OLD,
        newTarget: TGT_NEW,
      });
    });

    expect(ok!).toBe(true);
    expect(result.current.dicts['phrases']).toEqual(SRC_NEW);
    expect(result.current.dicts['characters']).toEqual(TGT_NEW);
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('both saves fail: state rolled back to old, returns false', async () => {
    mockSave.mockResolvedValue({ success: false });
    const { result } = renderHook(() => useMoveFixture());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.commitMoveOp({
        sourceDictId: 'phrases',
        oldSource: SRC_OLD,
        newSource: SRC_NEW,
        targetDictId: 'characters',
        oldTarget: TGT_OLD,
        newTarget: TGT_NEW,
      });
    });

    expect(ok!).toBe(false);
    expect(result.current.dicts['phrases']).toEqual(SRC_OLD);
    expect(result.current.dicts['characters']).toEqual(TGT_OLD);
  });

  it('source succeeds, target fails: source reverted on disk', async () => {
    mockSave
      .mockResolvedValueOnce({ success: true }) // source save
      .mockResolvedValueOnce({ success: false }) // target save
      .mockResolvedValue({ success: true }); // source revert

    const { result } = renderHook(() => useMoveFixture());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.commitMoveOp({
        sourceDictId: 'phrases',
        oldSource: SRC_OLD,
        newSource: SRC_NEW,
        targetDictId: 'characters',
        oldTarget: TGT_OLD,
        newTarget: TGT_NEW,
      });
    });

    expect(ok!).toBe(false);
    // State rolled back
    expect(result.current.dicts['phrases']).toEqual(SRC_OLD);
    // Source reverted to disk: 3rd save call with old source data
    expect(mockSave).toHaveBeenCalledTimes(3);
    expect(mockSave).toHaveBeenNthCalledWith(3, 'phrases', SRC_OLD);
  });

  it('target succeeds, source fails: target reverted on disk', async () => {
    mockSave
      .mockResolvedValueOnce({ success: false }) // source save
      .mockResolvedValueOnce({ success: true }) // target save
      .mockResolvedValue({ success: true }); // target revert

    const { result } = renderHook(() => useMoveFixture());

    let ok: boolean;
    await act(async () => {
      ok = await result.current.commitMoveOp({
        sourceDictId: 'phrases',
        oldSource: SRC_OLD,
        newSource: SRC_NEW,
        targetDictId: 'characters',
        oldTarget: TGT_OLD,
        newTarget: TGT_NEW,
      });
    });

    expect(ok!).toBe(false);
    // Target reverted to disk
    expect(mockSave).toHaveBeenCalledTimes(3);
    expect(mockSave).toHaveBeenNthCalledWith(3, 'characters', TGT_OLD);
  });
});
