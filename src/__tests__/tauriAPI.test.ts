/**
 * Tests for tauriAPI.ts's `callTauriCommand` seam — the shared invoke/catch shell for the
 * wrappers whose failure contract is exactly `{success: false, error: String(error)}` — and for
 * the wrappers that stay inline because their failure handling differs: saveDictionary and
 * loadDictionariesParallel (readClipboard rethrows). Why
 * the shell stays narrow: ADR-090. These inline blocks were untested until round 20.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import tauriAPI from '../tauriAPI';

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

import { logger } from '../utils/logger';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(logger.error).mockClear();
});

describe('callTauriCommand seam — via a representative wrapper (loadConfiguration)', () => {
  it('returns the invoke result on success', async () => {
    const configResult = { success: true, data: { wasmEnabled: true } };
    mockInvoke.mockResolvedValueOnce(configResult);

    const result = await tauriAPI.loadConfiguration();

    expect(mockInvoke).toHaveBeenCalledWith('load_configuration', undefined);
    expect(result).toEqual(configResult);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns {success:false, error} and logs on invoke rejection', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('backend unreachable'));

    const result = await tauriAPI.loadConfiguration();

    expect(result).toEqual({ success: false, error: 'Error: backend unreachable' });
    expect(logger.error).toHaveBeenCalledWith('Error in loadConfiguration:', expect.any(Error));
  });
});

describe('callTauriCommand seam — a second wrapper with args (saveTransformRules)', () => {
  it('passes args through to invoke', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true });
    const rules = [{ id: '1' }] as unknown as Parameters<typeof tauriAPI.saveTransformRules>[0];

    await tauriAPI.saveTransformRules(rules);

    expect(mockInvoke).toHaveBeenCalledWith('save_transform_rules', { rules });
  });

  it('falls back to {success:false, error} on rejection', async () => {
    mockInvoke.mockRejectedValueOnce('plain string error');

    const result = await tauriAPI.saveTransformRules([]);

    expect(result).toEqual({ success: false, error: 'plain string error' });
  });
});

describe('createProperNounsDictionary — validation runs before the seam', () => {
  it('rejects a path-traversal id without calling invoke', async () => {
    const result = await tauriAPI.createProperNounsDictionary('../etc/passwd');

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: 'Invalid dictionary ID: use letters, digits, _ . - only, at most 100 characters',
    });
  });

  it('calls invoke with a valid id', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true });

    await tauriAPI.createProperNounsDictionary('Foo');

    expect(mockInvoke).toHaveBeenCalledWith('create_proper_nouns_dictionary', {
      dictionaryId: 'Foo',
    });
  });
});

describe('excluded from the seam — readClipboard rethrows instead of returning a fallback', () => {
  it('propagates the rejection', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('clipboard denied'));

    await expect(tauriAPI.readClipboard()).rejects.toThrow('clipboard denied');
  });
});

const INVALID_ID_ERROR =
  'Invalid dictionary ID: use letters, digits, _ . - only, at most 100 characters';

describe('saveDictionary — inline, logs a failure the backend returned', () => {
  it('rejects an invalid id without calling invoke', async () => {
    const result = await tauriAPI.saveDictionary('../x', {});

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: INVALID_ID_ERROR });
  });

  it('passes a success result through without logging', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true });

    const result = await tauriAPI.saveDictionary('characters', { a: 'b' });

    expect(mockInvoke).toHaveBeenCalledWith('save_dictionary', {
      dictionaryId: 'characters',
      data: { a: 'b' },
    });
    expect(result).toEqual({ success: true });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns a failure the backend returned unchanged, and logs it', async () => {
    mockInvoke.mockResolvedValueOnce({ success: false, error: 'disk full' });

    const result = await tauriAPI.saveDictionary('characters', {});

    expect(result).toEqual({ success: false, error: 'disk full' });
    expect(logger.error).toHaveBeenCalledWith('Save dictionary failed:', 'disk full');
  });

  it('turns a rejection into the failure shape', async () => {
    mockInvoke.mockRejectedValueOnce('ipc down');

    expect(await tauriAPI.saveDictionary('characters', {})).toEqual({
      success: false,
      error: 'ipc down',
    });
  });
});

describe('loadDictionariesParallel — inline, failure is a batch of failed ids', () => {
  it('passes the batch to invoke when every id is valid', async () => {
    const batch = { total: 2, successful: 2, failed: 0, results: [] };
    mockInvoke.mockResolvedValueOnce(batch);

    const result = await tauriAPI.loadDictionariesParallel(['characters', 'phrases']);

    expect(mockInvoke).toHaveBeenCalledWith('load_dictionaries_parallel', {
      dictionaryIds: ['characters', 'phrases'],
    });
    expect(result).toBe(batch);
  });

  it('fails every id without calling invoke when any id is invalid', async () => {
    const result = await tauriAPI.loadDictionariesParallel(['characters', '../x']);

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toEqual({
      total: 2,
      successful: 0,
      failed: 2,
      results: [
        { dictionary_id: 'characters', success: false, error: 'Batch validation failed' },
        { dictionary_id: '../x', success: false, error: INVALID_ID_ERROR },
      ],
    });
  });

  it('turns a rejection into one failed result per id', async () => {
    mockInvoke.mockRejectedValueOnce('ipc down');

    expect(await tauriAPI.loadDictionariesParallel(['characters', 'phrases'])).toEqual({
      total: 2,
      successful: 0,
      failed: 2,
      results: [
        { dictionary_id: 'characters', success: false, error: 'ipc down' },
        { dictionary_id: 'phrases', success: false, error: 'ipc down' },
      ],
    });
  });
});
