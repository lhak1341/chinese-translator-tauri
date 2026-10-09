import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listFictionPatternDictionaryIds,
  listProperNounsDictionaryIds,
  loadAllDictionaries,
} from '../dictionary/DictionaryBackend';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  (window as any).electronAPI = {};
});

describe('loadAllDictionaries', () => {
  it('loads all dictionaries successfully on the first parallel attempt, no retry', async () => {
    const parallel = vi.fn().mockResolvedValue({
      total: 2,
      successful: 2,
      failed: 0,
      results: [
        { dictionary_id: 'a', success: true, data: { foo: 'bar' } },
        { dictionary_id: 'b', success: true, data: { baz: 'qux' } },
      ],
    });
    (window as any).electronAPI.loadDictionariesParallel = parallel;

    const result = await loadAllDictionaries(['a', 'b']);

    expect(result.total).toBe(2);
    expect(result.stillFailedIds).toEqual([]);
    expect(result.loadedDictionaries).toEqual({ a: { foo: 'bar' }, b: { baz: 'qux' } });
    expect(parallel).toHaveBeenCalledTimes(1);
  });

  it('retries only the failed ids, in one batch, and succeeds on retry', async () => {
    const parallel = vi
      .fn()
      .mockResolvedValueOnce({
        total: 2,
        successful: 1,
        failed: 1,
        results: [
          { dictionary_id: 'a', success: true, data: { foo: 'bar' } },
          { dictionary_id: 'b', success: false, error: 'cold launch race' },
        ],
      })
      .mockResolvedValueOnce({
        total: 1,
        successful: 1,
        failed: 0,
        results: [{ dictionary_id: 'b', success: true, data: { retried: true } }],
      });
    (window as any).electronAPI.loadDictionariesParallel = parallel;

    const result = await loadAllDictionaries(['a', 'b']);

    expect(parallel).toHaveBeenCalledTimes(2);
    expect(parallel).toHaveBeenLastCalledWith(['b']);
    expect(result.stillFailedIds).toEqual([]);
    expect(result.loadedDictionaries.b).toEqual({ retried: true });
  });

  it('classifies a dictionary that fails both the first load and the retry', async () => {
    (window as any).electronAPI.loadDictionariesParallel = vi
      .fn()
      .mockResolvedValueOnce({
        total: 1,
        successful: 0,
        failed: 1,
        results: [{ dictionary_id: 'a', success: false, error: 'disk error' }],
      })
      .mockResolvedValueOnce({
        total: 1,
        successful: 0,
        failed: 1,
        results: [{ dictionary_id: 'a', success: false, error: 'still broken' }],
      });

    const result = await loadAllDictionaries(['a']);

    expect(result.stillFailedIds).toEqual(['a']);
    // Absent, not `{}`: an empty placeholder would be saved over the unread file.
    expect(result.loadedDictionaries).not.toHaveProperty('a');
  });

  it('classifies a retry that throws as still-failed', async () => {
    (window as any).electronAPI.loadDictionariesParallel = vi
      .fn()
      .mockResolvedValueOnce({
        total: 1,
        successful: 0,
        failed: 1,
        results: [{ dictionary_id: 'a', success: false, error: 'disk error' }],
      })
      .mockRejectedValueOnce(new Error('IPC channel closed'));

    const result = await loadAllDictionaries(['a']);

    expect(result.stillFailedIds).toEqual(['a']);
    // Absent, not `{}`: an empty placeholder would be saved over the unread file.
    expect(result.loadedDictionaries).not.toHaveProperty('a');
  });

  it('classifies each retried id on its own, mixed retry outcomes', async () => {
    (window as any).electronAPI.loadDictionariesParallel = vi
      .fn()
      .mockResolvedValueOnce({
        total: 3,
        successful: 1,
        failed: 2,
        results: [
          { dictionary_id: 'a', success: true, data: { ok: true } },
          { dictionary_id: 'b', success: false, error: 'x' },
          { dictionary_id: 'c', success: false, error: 'y' },
        ],
      })
      .mockResolvedValueOnce({
        total: 2,
        successful: 1,
        failed: 1,
        results: [
          { dictionary_id: 'b', success: true, data: { id: 'b' } },
          { dictionary_id: 'c', success: false, error: 'still bad' },
        ],
      });

    const result = await loadAllDictionaries(['a', 'b', 'c']);

    expect(result.stillFailedIds).toEqual(['c']);
    expect(result.loadedDictionaries.b).toEqual({ id: 'b' });
    expect(result.loadedDictionaries).not.toHaveProperty('c');
  });

  it('handles an empty dictionary list without attempting any retry', async () => {
    const parallel = vi.fn().mockResolvedValue({
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    });
    (window as any).electronAPI.loadDictionariesParallel = parallel;

    const result = await loadAllDictionaries([]);

    expect(result).toEqual({ loadedDictionaries: {}, stillFailedIds: [], total: 0 });
    expect(parallel).toHaveBeenCalledTimes(1);
  });

  it('derives total from the requested ID list, not from the batch response', async () => {
    (window as any).electronAPI.loadDictionariesParallel = vi.fn().mockResolvedValue({
      total: 999, // deliberately wrong, to prove `total` isn't sourced from here
      successful: 2,
      failed: 0,
      results: [
        { dictionary_id: 'a', success: true, data: {} },
        { dictionary_id: 'b', success: true, data: {} },
      ],
    });

    const result = await loadAllDictionaries(['a', 'b']);

    expect(result.total).toBe(2);
  });
});

describe.each([
  ['listProperNounsDictionaryIds', listProperNounsDictionaryIds, 'listProperNounsDictionaries'],
  [
    'listFictionPatternDictionaryIds',
    listFictionPatternDictionaryIds,
    'listFictionPatternDictionaries',
  ],
] as const)('%s', (_name, list, command) => {
  it('returns plain id strings as they are', async () => {
    (window as any).electronAPI[command] = vi
      .fn()
      .mockResolvedValue({ success: true, dictionaries: ['a', 'b'] });
    expect(await list()).toEqual(['a', 'b']);
  });

  it('reads the id off a DictionaryInfo entry', async () => {
    (window as any).electronAPI[command] = vi
      .fn()
      .mockResolvedValue({ success: true, dictionaries: [{ id: 'a' }, 'b'] });
    expect(await list()).toEqual(['a', 'b']);
  });

  it('throws on a failed list rather than reporting an empty one', async () => {
    (window as any).electronAPI[command] = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'disk' });
    await expect(list()).rejects.toThrow('disk');
  });
});
