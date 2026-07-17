/**
 * Direct tests for DictionaryContext's removeDictionaryKey — added alongside
 * ConfigurationManager's create/rename refresh wiring (architecture review 2026-07-17).
 * `loadDictionary` never deletes a key (it only adds/overwrites); rename needs a
 * companion operation to drop the old ID once the new one has loaded.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { DictionaryProvider, useDictionary } from '../DictionaryContext';

vi.mock('../DictionaryTypes', () => ({
  getDictionaryTypes: vi.fn().mockResolvedValue({ 'properNouns-Test': {} }),
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

function wrapper({ children }: { children: React.ReactNode }) {
  return <DictionaryProvider>{children}</DictionaryProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadAllDictionaries.mockImplementation(async (ids: string[]) => ({
    loadedDictionaries: Object.fromEntries(ids.map((id) => [id, { entry: `${id}-value` }])),
    stillFailedIds: [],
    total: ids.length,
  }));
});

describe('DictionaryContext — removeDictionaryKey', () => {
  test('removes an existing key, leaving other keys untouched', async () => {
    const { result } = renderHook(() => useDictionary(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.dictionaries).toHaveProperty('properNouns-Test');

    await act(async () => {
      await result.current.loadDictionary('properNouns-Other');
    });
    expect(result.current.dictionaries).toHaveProperty('properNouns-Other');

    act(() => {
      result.current.removeDictionaryKey('properNouns-Test');
    });

    expect(result.current.dictionaries).not.toHaveProperty('properNouns-Test');
    expect(result.current.dictionaries).toHaveProperty('properNouns-Other');
  });

  test('is a no-op when the key is absent', async () => {
    const { result } = renderHook(() => useDictionary(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = result.current.dictionaries;
    act(() => {
      result.current.removeDictionaryKey('properNouns-DoesNotExist');
    });

    expect(result.current.dictionaries).toBe(before);
  });
});
