/**
 * Tests for tauriAPI.ts's `callTauriCommand` seam — the shared invoke/catch shell for the
 * 17 command wrappers whose failure contract is exactly `{success: false, error: String(error)}`.
 * Previously untested: 19 near-identical inline try/catch blocks were untested because there
 * was nothing worth isolating (architecture review 2026-09-09, candidate #2 grilling).
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
      error: 'Invalid dictionary ID format (no path traversal allowed)',
    });
  });

  it('calls invoke with a valid id', async () => {
    mockInvoke.mockResolvedValueOnce({ success: true, dictionaries: ['properNouns-Foo'] });

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
