import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  loadAppConfig,
  saveAppConfig,
  transformAppConfig,
  subscribeAppConfig,
  invalidateAppConfig,
  callRustConfigWrite,
} from '../appConfig';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function rawConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activeProperNouns: ['properNouns'],
    defaultQuickAddDictionary: null,
    lastSelectedDictionary: null,
    ...overrides,
  };
}

beforeEach(() => {
  invalidateAppConfig();
  global.window.electronAPI = {
    loadConfiguration: vi.fn().mockResolvedValue({ success: true, data: rawConfig() }),
    saveConfiguration: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as typeof window.electronAPI;
});

describe('callRustConfigWrite / saveAppConfig serialization', () => {
  test('saveAppConfig started while a Rust write is in flight queues behind it and sees the invalidated cache', async () => {
    await loadAppConfig(); // warm cache
    expect(window.electronAPI.loadConfiguration).toHaveBeenCalledTimes(1);

    const rustCall = deferred<{ success: boolean }>();
    const rustWritePromise = callRustConfigWrite(() => rustCall.promise);

    // Fire a plain config write while the Rust write is still pending.
    const savePromise = saveAppConfig({ ui: { defaultQuickAddDictionary: 'properNouns-x' } });

    // Let queued microtasks run without resolving the Rust call — saveAppConfig must
    // not have reached the disk write yet, proving it queued behind the Rust write
    // instead of racing it on the shared cache.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(window.electronAPI.saveConfiguration).not.toHaveBeenCalled();

    rustCall.resolve({ success: true });
    await rustWritePromise;
    await savePromise;

    expect(window.electronAPI.saveConfiguration).toHaveBeenCalledTimes(1);
    // callRustConfigWrite invalidates the cache before releasing the lock, so the
    // queued saveAppConfig re-fetches fresh config instead of merging onto the
    // pre-Rust-write cache.
    expect(window.electronAPI.loadConfiguration).toHaveBeenCalledTimes(2);
  });

  test('a failed Rust write does not invalidate the cache, and still releases the lock for the next queued write', async () => {
    await loadAppConfig();

    const result = await callRustConfigWrite(async () => ({ success: false }));
    expect(result.success).toBe(false);

    await saveAppConfig({ ui: { defaultQuickAddDictionary: 'properNouns-y' } });

    // No re-fetch — the failed Rust write never invalidated the warm cache.
    expect(window.electronAPI.loadConfiguration).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.saveConfiguration).toHaveBeenCalledTimes(1);
  });

  test('two plain saveAppConfig calls fired concurrently serialize instead of both merging onto the same stale snapshot', async () => {
    await loadAppConfig();

    const firstSave = deferred<{ success: boolean }>();
    window.electronAPI.saveConfiguration = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce({ success: true });

    const first = saveAppConfig({
      engine: { activeProperNouns: ['properNouns', 'properNouns-a'] },
    });
    const second = saveAppConfig({ ui: { defaultQuickAddDictionary: 'properNouns-b' } });

    await Promise.resolve();
    await Promise.resolve();
    expect(window.electronAPI.saveConfiguration).toHaveBeenCalledTimes(1);

    firstSave.resolve({ success: true });
    await first;
    await second;

    expect(window.electronAPI.saveConfiguration).toHaveBeenCalledTimes(2);
    // The second call's merge ran after the first committed to `cache`, so its patch
    // is layered on top of the first write's result instead of reverting it.
    const secondCallArg = (window.electronAPI.saveConfiguration as ReturnType<typeof vi.fn>).mock
      .calls[1][0];
    expect(secondCallArg.activeProperNouns).toEqual(['properNouns', 'properNouns-a']);
    expect(secondCallArg.defaultQuickAddDictionary).toBe('properNouns-b');
  });
});

describe('transformAppConfig', () => {
  test('hands back the transform result and saves the value it returns', async () => {
    const result = await transformAppConfig((current) => ({
      value: { ...current, ui: { ...current.ui, defaultQuickAddDictionary: 'properNouns-x' } },
      result: current.ui.defaultQuickAddDictionary,
    }));

    expect(result).toBeNull();
    expect(window.electronAPI.saveConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ defaultQuickAddDictionary: 'properNouns-x' })
    );
  });

  test('returning the config it was given saves nothing', async () => {
    const result = await transformAppConfig((current) => ({ value: current, result: 'kept' }));

    expect(result).toBe('kept');
    expect(window.electronAPI.saveConfiguration).not.toHaveBeenCalled();
  });

  test('decides against a write queued ahead of it, not against the config it started from', async () => {
    await loadAppConfig();
    const firstSave = deferred<{ success: boolean }>();
    window.electronAPI.saveConfiguration = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce({ success: true });

    const first = saveAppConfig({
      engine: { activeProperNouns: ['properNouns', 'properNouns-a'] },
    });
    const seen = transformAppConfig((current) => ({
      value: current,
      result: current.engine.activeProperNouns,
    }));
    firstSave.resolve({ success: true });
    await first;

    expect(await seen).toEqual(['properNouns', 'properNouns-a']);
  });
});

describe('subscribeAppConfig', () => {
  test('is told of a save, of a Rust-side write, and stops after unsubscribe', async () => {
    await loadAppConfig();
    const listener = vi.fn();
    const unsubscribe = subscribeAppConfig(listener);

    await saveAppConfig({ ui: { defaultQuickAddDictionary: 'properNouns-x' } });
    expect(listener).toHaveBeenCalledTimes(1);

    await callRustConfigWrite(async () => ({ success: true }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await saveAppConfig({ ui: { defaultQuickAddDictionary: null } });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
