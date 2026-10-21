/**
 * The provider's store operations beyond edits — rename, import and force reload — through
 * the real DictionaryProvider and Dictionary Store (ADR-055), over a fake disk. The store's
 * ordering rules are tested without React in DictionaryStore.test.ts.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { DictionaryProvider, useDictionary } from '../DictionaryContext';
import type { DictionaryData } from '../../../types/DictionaryTypes';
import toast from '../../../utils/toast';

let disk: Record<string, DictionaryData>;

vi.mock('../../../utils/toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('../DictionaryTypes', () => ({
  getDictionaryTypes: vi.fn(async () =>
    Object.fromEntries(Object.keys(disk).map((id) => [id, { id, label: id }]))
  ),
}));
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({
    session: { lastSelectedDictionary: null },
  }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));

const loadAllDictionaries = vi.fn();
vi.mock('../../../utils/dictionary/DictionaryBackend', () => ({
  loadAllDictionaries: (ids: string[]) => loadAllDictionaries(ids),
}));

const saveDictionary = vi.fn();
const importDictionaries = vi.fn();

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
    properNouns: { 张三: 'Trương Tam' },
    'properNouns-Test': { 李四: 'Lý Tứ' },
  };
  loadAllDictionaries.mockImplementation(async (ids: string[]) => ({
    loadedDictionaries: Object.fromEntries(ids.map((id) => [id, structuredClone(disk[id] ?? {})])),
    stillFailedIds: [],
    total: ids.length,
  }));
  saveDictionary.mockImplementation(async (id: string, data: DictionaryData) => {
    disk[id] = structuredClone(data);
    return { success: true };
  });
  importDictionaries.mockResolvedValue({ success: true, message: 'Imported' });
  (window as any).electronAPI = { saveDictionary, importDictionaries };
});

describe('DictionaryContext — applyRename', () => {
  test('swaps the old id for the new one, lists it, and clears history', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry('properNouns', '王五', 'Vương Ngũ');
    });
    expect(result.current.canUndo).toBe(true);

    disk['properNouns-Renamed'] = disk['properNouns-Test'];
    delete disk['properNouns-Test'];
    await act(async () => {
      await result.current.applyRename([['properNouns-Test', 'properNouns-Renamed']]);
    });

    expect(result.current.dictionaries).not.toHaveProperty('properNouns-Test');
    expect(result.current.dictionaries['properNouns-Renamed']).toEqual({ 李四: 'Lý Tứ' });
    expect(Object.keys(result.current.dictionaryTypes).sort()).toEqual(
      ['properNouns', 'properNouns-Renamed'].sort()
    );
    expect(result.current.canUndo).toBe(false);
  });
});

describe('DictionaryContext — importDictionaries', () => {
  test('re-reads every dictionary, so an edit to one that was not selected keeps the import', async () => {
    const result = await ready();
    expect(result.current.selectedDictionary).toBe('properNouns');

    importDictionaries.mockImplementation(async () => {
      disk['properNouns-Test'] = { 李四: 'imported', 赵六: 'imported too' };
      return { success: true, message: 'Imported' };
    });
    await act(async () => {
      await result.current.importDictionaries();
    });
    await act(async () => {
      await result.current.addEntry('properNouns-Test', '王五', 'Vương Ngũ');
    });

    expect(Object.keys(disk['properNouns-Test']).sort()).toEqual(['李四', '王五', '赵六'].sort());
    expect(disk['properNouns-Test']['李四']).toBe('imported');
  });

  test('clears history', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry('properNouns', '王五', 'Vương Ngũ');
    });

    await act(async () => {
      await result.current.importDictionaries();
    });

    expect(result.current.canUndo).toBe(false);
  });
});

describe('DictionaryContext — reloadAllDictionaries', () => {
  test('resolves to what memory holds after reading every file, and keeps history', async () => {
    const result = await ready();
    await act(async () => {
      await result.current.addEntry('properNouns', '王五', 'Vương Ngũ');
    });
    disk['properNouns-Test'] = { 李四: 'changed on disk' };

    let reloaded: Record<string, DictionaryData> = {};
    await act(async () => {
      reloaded = (await result.current.reloadAllDictionaries()).dictionaries;
    });

    expect(reloaded['properNouns-Test']).toEqual({ 李四: 'changed on disk' });
    expect(result.current.dictionaries).toEqual(reloaded);
    expect(result.current.canUndo).toBe(true);
  });
});

describe('DictionaryContext — the load-failure banner and toast follow the last full load', () => {
  /** Every file fails to read. */
  function failEveryRead() {
    loadAllDictionaries.mockImplementation(async (ids: string[]) => ({
      loadedDictionaries: {},
      stillFailedIds: ids,
      total: ids.length,
    }));
  }

  test('a good force reload after a failed startup clears the banner', async () => {
    failEveryRead();
    const result = await ready();
    expect(result.current.loadError).toMatch(/All 2 dictionaries failed/);

    loadAllDictionaries.mockImplementation(async (ids: string[]) => ({
      loadedDictionaries: Object.fromEntries(ids.map((id) => [id, structuredClone(disk[id])])),
      stillFailedIds: [],
      total: ids.length,
    }));
    await act(async () => {
      await result.current.reloadAllDictionaries();
    });

    expect(result.current.loadError).toBeNull();
  });

  test('a force reload where some files fail warns, as startup does', async () => {
    const result = await ready();
    expect(toast.warning).not.toHaveBeenCalled();

    loadAllDictionaries.mockImplementation(async (ids: string[]) => ({
      loadedDictionaries: { properNouns: structuredClone(disk.properNouns) },
      stillFailedIds: ids.filter((id) => id !== 'properNouns'),
      total: ids.length,
    }));
    await act(async () => {
      await result.current.reloadAllDictionaries();
    });

    expect(toast.warning).toHaveBeenCalledWith(
      expect.stringContaining('1 of 2 dictionaries failed'),
      expect.anything()
    );
    expect(result.current.loadError).toBeNull();
  });
});
