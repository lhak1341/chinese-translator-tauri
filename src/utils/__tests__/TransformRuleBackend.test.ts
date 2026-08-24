import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  loadTransformRules,
  saveTransformRules,
  invalidateTransformRules,
} from '../dictionary/TransformRuleBackend';
import type { TransformRule } from '../../types/TransformRuleTypes';

function makeRule(overrides: Partial<TransformRule> = {}): TransformRule {
  return {
    id: 'r1',
    matchKind: 'suffix',
    key: '城',
    relocate: true,
    capitalizeExceptN: 1,
    semanticType: 'location',
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  invalidateTransformRules();
  global.window.electronAPI = {
    loadTransformRules: vi.fn().mockResolvedValue({ success: true, data: [] }),
    saveTransformRules: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as typeof window.electronAPI;
});

describe('loadTransformRules', () => {
  test('returns the persisted rules on success', async () => {
    const rules = [makeRule()];
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: true, data: rules });
    expect(await loadTransformRules()).toEqual(rules);
  });

  test('returns an empty array when the load fails', async () => {
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'boom' });
    expect(await loadTransformRules()).toEqual([]);
  });

  test('caches after the first successful load — does not call IPC again', async () => {
    const rules = [makeRule()];
    const loadFn = vi.fn().mockResolvedValue({ success: true, data: rules });
    window.electronAPI.loadTransformRules = loadFn;

    await loadTransformRules();
    await loadTransformRules();

    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  test('migrates a legacy moveWords: 1 rule to relocate: true', async () => {
    const legacyRule = { ...makeRule(), relocate: undefined, moveWords: 1 };
    delete (legacyRule as { relocate?: boolean }).relocate;
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: true, data: [legacyRule] });

    const result = await loadTransformRules();

    expect(result).toEqual([makeRule({ relocate: true })]);
    expect(result[0]).not.toHaveProperty('moveWords');
  });

  test('migrates a legacy moveWords: 0 rule to relocate: false', async () => {
    const legacyRule = { ...makeRule(), relocate: undefined, moveWords: 0 };
    delete (legacyRule as { relocate?: boolean }).relocate;
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: true, data: [legacyRule] });

    const result = await loadTransformRules();

    expect(result).toEqual([makeRule({ relocate: false })]);
  });
});

describe('saveTransformRules', () => {
  test('saves via IPC and updates the cache', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveTransformRules = saveFn;
    window.electronAPI.loadTransformRules = vi.fn().mockResolvedValue({ success: true, data: [] });

    const rules = [makeRule()];
    await saveTransformRules(rules);

    expect(saveFn).toHaveBeenCalledWith(rules);
    // Cache updated — a subsequent load returns the saved rules without hitting IPC again.
    expect(await loadTransformRules()).toEqual(rules);
  });

  test('throws when the save fails', async () => {
    window.electronAPI.saveTransformRules = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'disk full' });
    await expect(saveTransformRules([makeRule()])).rejects.toThrow('disk full');
  });
});

describe('invalidateTransformRules', () => {
  test('forces the next load to hit IPC again', async () => {
    const loadFn = vi.fn().mockResolvedValue({ success: true, data: [] });
    window.electronAPI.loadTransformRules = loadFn;

    await loadTransformRules();
    invalidateTransformRules();
    await loadTransformRules();

    expect(loadFn).toHaveBeenCalledTimes(2);
  });
});
