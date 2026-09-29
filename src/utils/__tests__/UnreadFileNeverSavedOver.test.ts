/**
 * One rule across the four JSON files the app keeps (architecture review 2026-09-29,
 * candidate #4 grilling): a file that failed to load is never saved over.
 *
 * Every loader used to turn `{ success: false }` into "no data" — `{}`, `[]` or defaults —
 * and cache it, so the next read-modify-write replaced the whole file with that emptiness:
 * every reading position and binding, the active dictionaries, every Transform Rule.
 * A failed load is now cached nowhere, the loaders that can throw do, and each file's save
 * refuses until a load of it has succeeded.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  loadBookRecords,
  invalidateBookRecords,
  setReadingPosition,
} from '../reader/BookRecordsBackend';
import { reconcileLibraryScan } from '../reader/ReconcileLibrary';
import { loadAppConfig, saveAppConfig, invalidateAppConfig } from '../appConfig';
import {
  loadTransformRules,
  saveTransformRules,
  invalidateTransformRules,
} from '../dictionary/TransformRuleBackend';
import {
  DEFAULT_APPEARANCE,
  loadAppearanceConfig,
  saveAppearanceConfig,
  invalidateAppearanceConfig,
} from '../appearanceConfig';

const failed = { success: false, error: 'Invalid JSON format in config file' };

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  invalidateBookRecords();
  invalidateAppConfig();
  invalidateTransformRules();
  invalidateAppearanceConfig();
  api = {
    loadBookRecords: vi.fn().mockResolvedValue(failed),
    saveBookRecords: vi.fn().mockResolvedValue({ success: true }),
    loadConfiguration: vi.fn().mockResolvedValue(failed),
    saveConfiguration: vi.fn().mockResolvedValue({ success: true }),
    loadTransformRules: vi.fn().mockResolvedValue(failed),
    saveTransformRules: vi.fn().mockResolvedValue({ success: true }),
    loadAppearanceSettings: vi.fn().mockResolvedValue(failed),
    saveAppearanceSettings: vi.fn().mockResolvedValue({ success: true }),
  };
  global.window.electronAPI = api as unknown as typeof window.electronAPI;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('books.json', () => {
  test('a failed load throws, and is not cached', async () => {
    await expect(loadBookRecords()).rejects.toThrow();
    api.loadBookRecords.mockResolvedValue({ success: true, data: {} });
    await expect(loadBookRecords()).resolves.toEqual({ records: {}, droppedCount: 0 });
  });

  test('a write after a failed load saves nothing', async () => {
    await expect(setReadingPosition('fp1', { line: 3, fraction: 0 })).rejects.toThrow();
    expect(api.saveBookRecords).not.toHaveBeenCalled();
  });

  test('a rescan after a failed load saves nothing', async () => {
    const fingerprint = vi.fn();
    await expect(
      reconcileLibraryScan(
        [{ fileName: 'a.txt', title: 'a', sizeBytes: 1, modifiedMs: 1 }],
        null,
        fingerprint
      )
    ).rejects.toThrow();
    expect(api.saveBookRecords).not.toHaveBeenCalled();
  });
});

describe('config.json', () => {
  test('a failed load still hands the app its defaults, but they are not saved over the file', async () => {
    const config = await loadAppConfig();
    expect(config.engine.activeProperNouns).toEqual(['properNouns']);

    await expect(saveAppConfig({ session: { lastSelectedDictionary: 'phrases' } })).rejects.toThrow(
      /not saving over it/
    );
    expect(api.saveConfiguration).not.toHaveBeenCalled();
  });

  test('once a load succeeds, saves go through', async () => {
    await loadAppConfig();
    api.loadConfiguration.mockResolvedValue({ success: true, data: { activeProperNouns: [] } });
    await loadAppConfig();
    await saveAppConfig({ session: { lastSelectedDictionary: 'phrases' } });
    expect(api.saveConfiguration).toHaveBeenCalledTimes(1);
  });
});

describe('transform-rules.json', () => {
  test('a failed load throws, and a save refuses until a load succeeds', async () => {
    await expect(loadTransformRules()).rejects.toThrow();
    await expect(saveTransformRules([])).rejects.toThrow(/not saving over it/);
    expect(api.saveTransformRules).not.toHaveBeenCalled();

    api.loadTransformRules.mockResolvedValue({ success: true, data: [] });
    await loadTransformRules();
    await saveTransformRules([]);
    expect(api.saveTransformRules).toHaveBeenCalledTimes(1);
  });
});

describe('appearance.json', () => {
  test('a failed load hands back defaults, but a save refuses until a load succeeds', async () => {
    expect(await loadAppearanceConfig()).toEqual(DEFAULT_APPEARANCE);
    await expect(saveAppearanceConfig(DEFAULT_APPEARANCE)).rejects.toThrow(/not saving over it/);
    expect(api.saveAppearanceSettings).not.toHaveBeenCalled();

    api.loadAppearanceSettings.mockResolvedValue({ success: true, data: {} });
    await loadAppearanceConfig();
    await saveAppearanceConfig(DEFAULT_APPEARANCE);
    expect(api.saveAppearanceSettings).toHaveBeenCalledTimes(1);
  });
});
