/**
 * An unread dictionary is never saved over (CONTEXT.md "Unread dictionary", ADR-053).
 *
 * Runs the real load protocol (`DictionaryBackend`) and the real `EditCommitter` against a
 * fake IPC, so what is pinned is the whole chain: a dictionary whose file could not be read
 * must not reach an edit as an empty dictionary, or the save writes a one-entry file over
 * everything the file held.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { DictionaryProvider, useDictionary } from '../DictionaryContext';

vi.mock('../DictionaryTypes', () => ({
  getDictionaryTypes: vi.fn().mockResolvedValue({ properNouns: {}, phrases: {} }),
}));
vi.mock('../../../utils/appConfig', () => ({
  loadAppConfig: vi.fn().mockResolvedValue({ session: { lastSelectedDictionary: null } }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));

const onDisk: Record<string, unknown> = {};
const unreadable = new Set<string>();

function loadOne(id: string) {
  if (unreadable.has(id)) return { success: false, error: `Invalid JSON in dictionary '${id}'` };
  return { success: true, data: onDisk[id] ?? {} };
}

const saveDictionary = vi.fn(async () => ({ success: true }));

function wrapper({ children }: { children: React.ReactNode }) {
  return <DictionaryProvider>{children}</DictionaryProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  unreadable.clear();
  onDisk.properNouns = { 张三: { translation: 'Trương Tam' } };
  onDisk.phrases = { 你好: { translation: 'xin chào' } };
  (window as any).electronAPI = {
    loadDictionariesParallel: vi.fn(async (ids: string[]) => {
      const results = ids.map((id) => ({ dictionary_id: id, ...loadOne(id) }));
      const successful = results.filter((r) => r.success).length;
      return { total: ids.length, successful, failed: ids.length - successful, results };
    }),
    loadDictionary: vi.fn(async (id: string) => loadOne(id)),
    saveDictionary,
  };
});

async function renderLoaded() {
  const hook = renderHook(() => useDictionary(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe('an unread dictionary', () => {
  test('an Add to a dictionary that failed to load is refused and nothing is saved', async () => {
    unreadable.add('phrases');
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.addEntry('phrases', '再见', 'tạm biệt').catch(() => {});
    });

    expect(saveDictionary).not.toHaveBeenCalled();
  });

  test('is left out of the dictionaries and listed as unread', async () => {
    unreadable.add('phrases');
    const { result } = await renderLoaded();

    expect(result.current.dictionaries).not.toHaveProperty('phrases');
    expect(result.current.dictionaries).toHaveProperty('properNouns');
    expect(result.current.unreadDictionaryIds).toEqual(['phrases']);
  });

  test('a clean Reload makes it writable again', async () => {
    unreadable.add('phrases');
    const { result } = await renderLoaded();

    unreadable.delete('phrases');
    await act(async () => {
      await result.current.loadDictionary('phrases');
    });

    expect(result.current.unreadDictionaryIds).toEqual([]);
    expect(result.current.dictionaries.phrases).toHaveProperty('你好');
  });

  test('a failed Reload of a loaded dictionary makes it unread, so the next Add cannot save over the file', async () => {
    const { result } = await renderLoaded();
    expect(result.current.dictionaries).toHaveProperty('phrases');

    unreadable.add('phrases');
    await act(async () => {
      await result.current.loadDictionary('phrases');
    });

    expect(result.current.dictionaries).not.toHaveProperty('phrases');
    expect(result.current.unreadDictionaryIds).toEqual(['phrases']);

    await act(async () => {
      await result.current.addEntry('phrases', '再见', 'tạm biệt').catch(() => {});
    });
    expect(saveDictionary).not.toHaveBeenCalled();
  });

  test('a dictionary whose file does not exist yet loads empty and stays writable', async () => {
    delete onDisk.phrases;
    const { result } = await renderLoaded();

    expect(result.current.dictionaries.phrases).toEqual({});
    expect(result.current.unreadDictionaryIds).toEqual([]);

    await act(async () => {
      await result.current.addEntry('phrases', '再见', 'tạm biệt');
    });
    expect(saveDictionary).toHaveBeenCalledWith(
      'phrases',
      expect.objectContaining({ 再见: expect.anything() })
    );
  });
});
