/**
 * Undo through the real DictionaryProvider, against a fake disk (architecture review
 * 2026-09-29, candidate #1). Each case is an edit that overwrote something: undo must bring
 * back what was overwritten, and a failed undo must leave memory and disk agreeing.
 *
 * `test.fails` marks the known bugs until the Dictionary Edit module lands (ADR-052).
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
  test.fails('undo of an Add over an existing key restores the old value', async () => {
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

  test.fails('undo of an Update renamed onto an existing key restores both entries', async () => {
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

  test.fails(
    "undo of a Move into a dictionary already holding the key restores the target's value",
    async () => {
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
    }
  );

  test.fails('a Move undo whose second save fails leaves memory and disk agreeing', async () => {
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
