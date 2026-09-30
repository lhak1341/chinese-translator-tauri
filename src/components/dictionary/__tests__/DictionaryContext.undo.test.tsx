/**
 * Undo through the real DictionaryProvider, against a fake disk (architecture review
 * 2026-09-29, candidate #1). Each case is an edit that overwrote something: undo must bring
 * back what was overwritten, and a failed undo must leave memory and disk agreeing.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { DictionaryProvider, useDictionary } from '../DictionaryContext';
import type { DictionaryData } from '../../../types/DictionaryTypes';

const A = 'properNouns-A';
const B = 'properNouns-B';

vi.mock('../DictionaryTypes', () => ({
  getDictionaryTypes: vi.fn().mockResolvedValue({ 'properNouns-A': {}, 'properNouns-B': {} }),
}));
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({ session: { lastSelectedDictionary: null } }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../utils/toast', () => ({
  default: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

import toast from '../../../utils/toast';

let disk: Record<string, DictionaryData>;
const loadAllDictionaries = vi.fn();
vi.mock('../../../utils/dictionary/DictionaryBackend', () => ({
  loadAllDictionaries: (ids: string[]) => loadAllDictionaries(ids),
}));

const saveDictionary = vi.fn();

function entry(translation: string) {
  return { translation, allowAsPatternVariable: false };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <DictionaryProvider>{children}</DictionaryProvider>;
}

async function ready() {
  const { result } = renderHook(() => useDictionary(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  disk = {
    [A]: { 张三: entry('Trương Tam'), 李四: entry('Lý Tứ') },
    [B]: { 张三: entry('Trương Tam (B)') },
  };
  loadAllDictionaries.mockImplementation(async (ids: string[]) => ({
    loadedDictionaries: Object.fromEntries(ids.map((id) => [id, structuredClone(disk[id])])),
    stillFailedIds: [],
    total: ids.length,
  }));
  saveDictionary.mockImplementation(async (id: string, data: DictionaryData) => {
    disk[id] = structuredClone(data);
    return { success: true, data };
  });
  (window as any).electronAPI = { saveDictionary };
});

describe('DictionaryContext — undo restores what an edit overwrote', () => {
  test('undo of an Add over an existing key restores the old value', async () => {
    const result = await ready();

    await act(async () => {
      await result.current.addEntry(A, '张三', 'Trương Tam mới');
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.dictionaries[A]['张三']).toEqual(entry('Trương Tam'));
    expect(disk[A]['张三']).toEqual(entry('Trương Tam'));
  });

  test('undo of an Update renamed onto an existing key restores both entries', async () => {
    const result = await ready();

    await act(async () => {
      await result.current.updateEntry(A, '李四', '张三', 'Lý Tứ');
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.dictionaries[A]).toEqual({
      张三: entry('Trương Tam'),
      李四: entry('Lý Tứ'),
    });
    expect(disk[A]).toEqual(result.current.dictionaries[A]);
  });

  test("undo of a Move into a dictionary already holding the key restores the target's value", async () => {
    const result = await ready();

    await act(async () => {
      await result.current.moveEntry(A, B, '张三', 'B');
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.dictionaries[A]['张三']).toEqual(entry('Trương Tam'));
    expect(result.current.dictionaries[B]['张三']).toEqual(entry('Trương Tam (B)'));
    expect(disk[B]['张三']).toEqual(entry('Trương Tam (B)'));
  });

  test('a Move undo whose second save fails leaves memory and disk agreeing', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.moveEntry(A, B, '李四', 'B');
    });

    saveDictionary.mockImplementation(async (id: string, data: DictionaryData) => {
      if (id === B) return { success: false, error: 'disk full' };
      disk[id] = structuredClone(data);
      return { success: true, data };
    });
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.dictionaries[A]).toEqual(disk[A]);
    expect(result.current.dictionaries[B]).toEqual(disk[B]);
  });
});

describe('DictionaryContext — undo against a changed dictionary', () => {
  test('refuses an undo whose key changed since, and keeps the newer value', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry(A, '张三', 'Trương Tam mới');
    });
    // Changed outside history: a reload brings a different value for the same key.
    disk[A] = { ...disk[A], 张三: entry('from disk') };
    await act(async () => {
      await result.current.loadDictionary(A);
    });

    let undone = true;
    await act(async () => {
      undone = await result.current.undo();
    });

    expect(undone).toBe(false);
    expect(result.current.dictionaries[A]['张三']).toEqual(entry('from disk'));
    expect(disk[A]['张三']).toEqual(entry('from disk'));
    expect(result.current.canUndo).toBe(true);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('张三'));
  });

  test('refuses a redo whose key changed since', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry(A, '张三', 'Trương Tam mới');
    });
    await act(async () => {
      await result.current.undo();
    });
    // Changed outside history: a reload brings a different value for the same key.
    disk[A] = { ...disk[A], 张三: entry('from disk') };
    await act(async () => {
      await result.current.loadDictionary(A);
    });

    let redone = true;
    await act(async () => {
      redone = await result.current.redo();
    });

    expect(redone).toBe(false);
    expect(result.current.dictionaries[A]['张三']).toEqual(entry('from disk'));
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('张三'));
  });

  test('a rename clears history, inside its turn in the queue', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry(A, '赵六', 'Triệu Lục');
    });
    expect(result.current.canUndo).toBe(true);

    disk['properNouns-B2'] = disk[B];
    await act(async () => {
      await result.current.applyRename([[B, 'properNouns-B2']]);
    });

    expect(result.current.canUndo).toBe(false);
  });

  test('a reload of one dictionary keeps history; an undo it made stale is refused', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry(A, '赵六', 'Triệu Lục');
    });
    disk[A] = { ...disk[A], 赵六: entry('changed on disk') };
    await act(async () => {
      await result.current.loadDictionary(A);
    });
    expect(result.current.canUndo).toBe(true);

    let undone = true;
    await act(async () => {
      undone = await result.current.undo();
    });

    expect(undone).toBe(false);
    expect(result.current.dictionaries[A]['赵六']).toEqual(entry('changed on disk'));
  });

  test('clearHistory forgets every edit', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry(A, '赵六', 'Triệu Lục');
    });
    act(() => {
      result.current.clearHistory();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
