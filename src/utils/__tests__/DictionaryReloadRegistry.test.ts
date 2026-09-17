import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  registerDictionaryReload,
  requestDictionaryReload,
} from '../dictionary/DictionaryReloadRegistry';

// Module-level slot: it survives between tests, so clear it rather than inherit whatever
// the previous test left in it.
beforeEach(() => registerDictionaryReload(null));

describe('DictionaryReloadRegistry', () => {
  it('runs the registered reload', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    registerDictionaryReload(reload);

    await requestDictionaryReload();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('resolves without throwing when nothing has registered one', async () => {
    await expect(requestDictionaryReload()).resolves.toBeUndefined();
  });

  it('runs only the latest registration', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    registerDictionaryReload(first);
    registerDictionaryReload(second);

    await requestDictionaryReload();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('goes quiet again once the owner unregisters on unmount', async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    registerDictionaryReload(reload);
    registerDictionaryReload(null);

    await requestDictionaryReload();

    expect(reload).not.toHaveBeenCalled();
  });

  it('propagates a rejection rather than swallowing it', async () => {
    registerDictionaryReload(() => Promise.reject(new Error('reload failed')));

    await expect(requestDictionaryReload()).rejects.toThrow('reload failed');
  });
});
