/**
 * Regression coverage for the DictionaryContext <-> Translator.jsx cache-invalidator seam
 * (architecture review 2026-07-29, candidate #4). Before this test, nothing exercised the
 * interleaving between registerCacheInvalidator's null/non-null states and a CRUD mutation —
 * a mutation landing while the engine ref is null (first launch, or a reinit window) silently
 * dropped the cache invalidation with no signal.
 *
 * Three states under test:
 * 1. Never registered (pre-first-ready) — silent, no toast (nothing was ever cached).
 * 2. Registered once, then nulled (reinit window) — a real stale cache exists, must warn.
 * 3. Currently registered — the real invalidator runs, no warning toast.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { DictionaryProvider, useDictionary } from '../DictionaryContext';
import { TOAST_IDS } from '../../../constants/toastConfig';

vi.mock('../DictionaryTypes', () => ({
  getDictionaryTypes: vi.fn().mockResolvedValue({ 'properNouns-Test': {} }),
}));
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({
    session: { lastSelectedDictionary: null },
  }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../utils/toast', () => ({
  default: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

const loadAllDictionaries = vi.fn();
vi.mock('../../../utils/dictionary/DictionaryBackend', () => ({
  loadAllDictionaries: (ids: string[]) => loadAllDictionaries(ids),
}));

import toast from '../../../utils/toast';

function wrapper({ children }: { children: React.ReactNode }) {
  return <DictionaryProvider>{children}</DictionaryProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadAllDictionaries.mockImplementation(async (ids: string[]) => ({
    loadedDictionaries: Object.fromEntries(ids.map((id) => [id, {}])),
    stillFailedIds: [],
    total: ids.length,
  }));
  (window as any).electronAPI = {
    saveDictionary: vi
      .fn()
      .mockImplementation((_id: string, data: unknown) => Promise.resolve({ success: true, data })),
  };
});

async function ready() {
  const { result } = renderHook(() => useDictionary(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result;
}

describe('DictionaryContext — cache-invalidator seam', () => {
  test('never registered: mutation is silent, no skipped-cache toast', async () => {
    const result = await ready();

    await act(async () => {
      await result.current.addEntry('properNouns-Test', 'first', 'dau tien');
    });

    expect(toast.warning).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: TOAST_IDS.CACHE_INVALIDATION_SKIPPED })
    );
  });

  test('registered then nulled (reinit window): mutation warns with CACHE_INVALIDATION_SKIPPED', async () => {
    const result = await ready();
    const invalidator = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.registerCacheInvalidator(invalidator);
    });
    act(() => {
      result.current.registerCacheInvalidator(null); // simulates Translator.jsx's reinit-window null
    });

    await act(async () => {
      await result.current.addEntry('properNouns-Test', 'second', 'thu hai');
    });

    expect(invalidator).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: TOAST_IDS.CACHE_INVALIDATION_SKIPPED })
    );
  });

  test('currently registered: real invalidator runs, no skipped-cache toast', async () => {
    const result = await ready();
    const invalidator = vi.fn().mockResolvedValue(undefined);

    act(() => {
      result.current.registerCacheInvalidator(invalidator);
    });

    await act(async () => {
      await result.current.addEntry('properNouns-Test', 'third', 'thu ba');
    });

    expect(invalidator).toHaveBeenCalledWith('properNouns-Test');
    expect(toast.warning).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: TOAST_IDS.CACHE_INVALIDATION_SKIPPED })
    );
  });
});
