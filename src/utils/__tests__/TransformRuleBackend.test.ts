import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  loadTransformRules,
  commitRuleChange,
  invalidateTransformRules,
  getTransformRulesSnapshot,
  subscribeTransformRules,
} from '../dictionary/TransformRuleBackend';
import type { TransformRule } from '../../types/TransformRuleTypes';
import { installFakeAppFile } from '../../test/fakeAppFile';

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
  global.window.electronAPI = {} as unknown as typeof window.electronAPI;
  installFakeAppFile({ load: 'loadTransformRules', save: 'saveTransformRules' }, []);
});

describe('loadTransformRules', () => {
  test('returns the persisted rules on success', async () => {
    const rules = [makeRule()];
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: true, data: rules });
    expect(await loadTransformRules()).toEqual({ rules, droppedCount: 0 });
  });

  test('throws when the load fails, rather than handing back an empty list to save over', async () => {
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'boom' });
    await expect(loadTransformRules()).rejects.toThrow(/not saving over it/);
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

    const { rules } = await loadTransformRules();

    expect(rules).toEqual([makeRule({ relocate: true })]);
    expect(rules[0]).not.toHaveProperty('moveWords');
  });

  test('migrates a legacy moveWords: 0 rule to relocate: false', async () => {
    const legacyRule = { ...makeRule(), relocate: undefined, moveWords: 0 };
    delete (legacyRule as { relocate?: boolean }).relocate;
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: true, data: [legacyRule] });

    const { rules } = await loadTransformRules();

    expect(rules).toEqual([makeRule({ relocate: false })]);
  });

  test('drops a malformed rule and reports it in droppedCount, keeping valid siblings', async () => {
    const badRule = { ...makeRule({ id: 'r2' }), semanticType: 'not-a-real-type' };
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: true, data: [makeRule(), badRule] });

    const { rules, droppedCount } = await loadTransformRules();

    expect(rules).toEqual([makeRule()]);
    expect(droppedCount).toBe(1);
  });

  test('treats non-array data as zero rules with no drop reported', async () => {
    window.electronAPI.loadTransformRules = vi
      .fn()
      .mockResolvedValue({ success: true, data: 'not-an-array' });

    expect(await loadTransformRules()).toEqual({ rules: [], droppedCount: 0 });
  });

  test('throws when the IPC result has no boolean success field', async () => {
    window.electronAPI.loadTransformRules = vi.fn().mockResolvedValue({ data: [] });
    await expect(loadTransformRules()).rejects.toThrow();
  });
});

describe('commitRuleChange', () => {
  /** A save whose promise the test settles by hand, then instant ones after it. */
  function holdFirstSave() {
    let settle!: (result: { success: boolean; error?: string }) => void;
    const first = new Promise((resolve) => {
      settle = resolve;
    });
    const saveFn = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ success: true });
    window.electronAPI.saveTransformRules = saveFn;
    return { saveFn, settle };
  }
  const add =
    (rule: TransformRule) =>
    (rules: TransformRule[]): TransformRule[] => [...rules, rule];

  test('saves the change against the saved rules and updates the cache', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveTransformRules = saveFn;

    const next = await commitRuleChange(add(makeRule()));

    expect(next).toEqual([makeRule()]);
    expect(saveFn).toHaveBeenCalledWith([makeRule()]);
    expect(getTransformRulesSnapshot()).toEqual([makeRule()]);
  });

  test('throws when the save fails, and the saved rules stay as they were', async () => {
    window.electronAPI.saveTransformRules = vi
      .fn()
      .mockResolvedValue({ success: false, error: 'disk full' });
    await expect(commitRuleChange(add(makeRule()))).rejects.toThrow('disk full');
    expect(getTransformRulesSnapshot()).toEqual([]);
  });

  test('saves run one at a time, in the order the changes were committed', async () => {
    const { saveFn, settle } = holdFirstSave();
    const a = commitRuleChange(add(makeRule({ id: 'a', key: 'A' })));
    const b = commitRuleChange(add(makeRule({ id: 'b', key: 'B' })));

    await vi.waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    settle({ success: true });
    await Promise.all([a, b]);

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn.mock.calls[1][0].map((r: TransformRule) => r.id)).toEqual(['a', 'b']);
  });

  test('a failed change is dropped alone: the change queued behind it re-plans without it', async () => {
    const { saveFn, settle } = holdFirstSave();
    const a = commitRuleChange(add(makeRule({ id: 'a', key: 'A' })));
    const b = commitRuleChange(add(makeRule({ id: 'b', key: 'B' })));

    await vi.waitFor(() => expect(saveFn).toHaveBeenCalledTimes(1));
    settle({ success: false, error: 'disk full' });

    await expect(a).rejects.toThrow('disk full');
    await b;
    expect(saveFn.mock.calls[1][0].map((r: TransformRule) => r.id)).toEqual(['b']);
    expect(getTransformRulesSnapshot()?.map((r) => r.id)).toEqual(['b']);
  });

  test('a change that throws at its turn saves nothing, and does not block the queue', async () => {
    const saveFn = vi.fn().mockResolvedValue({ success: true });
    window.electronAPI.saveTransformRules = saveFn;

    await expect(
      commitRuleChange(() => {
        throw new Error('conflict');
      })
    ).rejects.toThrow('conflict');
    expect(saveFn).not.toHaveBeenCalled();

    await commitRuleChange(add(makeRule()));
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  test('subscribers hear each save', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTransformRules(listener);
    await commitRuleChange(add(makeRule()));
    unsubscribe();
    // The load, then the save.
    expect(listener).toHaveBeenCalledTimes(2);
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
