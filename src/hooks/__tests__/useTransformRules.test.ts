import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTransformRules } from '../useTransformRules';
import type { TransformRule } from '../../types/TransformRuleTypes';

const { loadTransformRules, saveTransformRules, toastError, toastWarning } = vi.hoisted(() => ({
  loadTransformRules: vi.fn(),
  saveTransformRules: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('../../utils/dictionary/TransformRuleBackend', () => ({
  loadTransformRules,
  saveTransformRules,
}));

vi.mock('../../utils/toast', () => ({ default: { error: toastError, warning: toastWarning } }));

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

function loadResult(rules: TransformRule[], droppedCount = 0) {
  return { rules, droppedCount };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadTransformRules.mockResolvedValue(loadResult([]));
  saveTransformRules.mockResolvedValue(undefined);
});

describe('useTransformRules', () => {
  test('loads persisted rules on mount', async () => {
    const rules = [makeRule()];
    loadTransformRules.mockResolvedValue(loadResult(rules));

    const { result } = renderHook(() => useTransformRules());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rules).toEqual(rules);
  });

  test('toasts a warning when the backend reports dropped rules', async () => {
    loadTransformRules.mockResolvedValue(loadResult([makeRule()], 2));

    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(toastWarning).toHaveBeenCalledWith(expect.stringContaining('2'));
  });

  test('does not toast when nothing was dropped', async () => {
    loadTransformRules.mockResolvedValue(loadResult([makeRule()], 0));

    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(toastWarning).not.toHaveBeenCalled();
  });

  test('addRule persists a new rule with a generated id', async () => {
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addRule({
        matchKind: 'suffix',
        key: '城',
        relocate: true,
        capitalizeExceptN: 1,
        semanticType: 'location',
        enabled: true,
      });
    });

    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rules[0].id).toBeTruthy();
    expect(saveTransformRules).toHaveBeenCalledWith(result.current.rules);
  });

  test('updateRule replaces the matching rule', async () => {
    loadTransformRules.mockResolvedValue(loadResult([makeRule({ label: 'old' })]));
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateRule(makeRule({ label: 'new' }));
    });

    expect(result.current.rules[0].label).toBe('new');
  });

  test('a save failure rolls back the optimistic update and toasts', async () => {
    loadTransformRules.mockResolvedValue(loadResult([makeRule({ label: 'original' })]));
    saveTransformRules.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.updateRule(makeRule({ label: 'changed' }))).rejects.toThrow(
      'disk full'
    );

    // Rolled back to the pre-save snapshot, not left showing the failed change.
    expect(result.current.rules[0].label).toBe('original');
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('reverted'));
  });

  test('deleteRule removes the rule', async () => {
    loadTransformRules.mockResolvedValue(loadResult([makeRule()]));
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteRule('r1');
    });

    expect(result.current.rules).toHaveLength(0);
  });

  test('toggleEnabled flips only the targeted rule', async () => {
    loadTransformRules.mockResolvedValue(
      loadResult([makeRule({ id: 'r1', enabled: true }), makeRule({ id: 'r2', enabled: true })])
    );
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleEnabled('r1');
    });

    expect(result.current.rules.find((r) => r.id === 'r1')?.enabled).toBe(false);
    expect(result.current.rules.find((r) => r.id === 'r2')?.enabled).toBe(true);
  });

  test('addRule rejects a rule that collides with an existing (matchKind, key)', async () => {
    loadTransformRules.mockResolvedValue(
      loadResult([makeRule({ id: 'existing', matchKind: 'suffix', key: '城' })])
    );
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.addRule({
        matchKind: 'suffix',
        key: '城',
        relocate: true,
        capitalizeExceptN: 1,
        semanticType: 'location',
        enabled: true,
      })
    ).rejects.toThrow();
    expect(result.current.rules).toHaveLength(1); // unchanged, nothing persisted
    expect(saveTransformRules).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  test('updateRule rejects a change that collides with a different existing rule', async () => {
    loadTransformRules.mockResolvedValue(
      loadResult([
        makeRule({ id: 'r1', matchKind: 'suffix', key: '城' }),
        makeRule({ id: 'r2', matchKind: 'suffix', key: '市' }),
      ])
    );
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.updateRule(makeRule({ id: 'r2', matchKind: 'suffix', key: '城' }))
    ).rejects.toThrow();
    expect(result.current.rules.find((r) => r.id === 'r2')?.key).toBe('市'); // unchanged
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  test('checkConflict finds a same-(matchKind,key) rule other than itself', async () => {
    loadTransformRules.mockResolvedValue(loadResult([makeRule({ id: 'existing' })]));
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.checkConflict({ id: 'new', matchKind: 'suffix', key: '城' })).toEqual(
      result.current.rules[0]
    );
    expect(
      result.current.checkConflict({ id: 'existing', matchKind: 'suffix', key: '城' })
    ).toBeUndefined();
  });
});

/** A save the test resolves or rejects by hand, to hold one change in flight. */
function deferredSave() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The rules of the most recent `saveTransformRules` call — what disk ends up holding. */
function lastSaved(): TransformRule[] {
  const calls = saveTransformRules.mock.calls;
  return calls[calls.length - 1][0] as TransformRule[];
}

// Pinned before the save queue (architecture review 2026-09-29, candidate #3).
describe('useTransformRules — changes made while a save is in flight', () => {
  test('a failed change is dropped alone: a later change survives, in the UI and on disk', async () => {
    loadTransformRules.mockResolvedValue(
      loadResult([makeRule({ id: 'r1', key: '城' }), makeRule({ id: 'r2', key: '市' })])
    );
    const first = deferredSave();
    saveTransformRules.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.toggleEnabled('r1');
    });
    act(() => {
      b = result.current.toggleEnabled('r2');
    });
    await act(async () => {
      first.reject(new Error('disk full'));
      await expect(a).rejects.toThrow('disk full');
      await b;
    });

    expect(result.current.rules.find((r) => r.id === 'r1')?.enabled).toBe(true);
    expect(result.current.rules.find((r) => r.id === 'r2')?.enabled).toBe(false);
    expect(lastSaved().find((r) => r.id === 'r1')?.enabled).toBe(true);
    expect(lastSaved().find((r) => r.id === 'r2')?.enabled).toBe(false);
  });

  test('saves run one at a time, in the order the changes were made', async () => {
    loadTransformRules.mockResolvedValue(
      loadResult([makeRule({ id: 'r1', key: '城' }), makeRule({ id: 'r2', key: '市' })])
    );
    const first = deferredSave();
    saveTransformRules.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.toggleEnabled('r1');
    });
    act(() => {
      b = result.current.toggleEnabled('r2');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(saveTransformRules).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await a;
      await b;
    });
    expect(saveTransformRules).toHaveBeenCalledTimes(2);
    expect(lastSaved().every((r) => !r.enabled)).toBe(true);
  });

  test('a change is checked for conflicts again at its turn, against what really saved', async () => {
    // Delete 城 (fails), then add a new 城 rule. When the add was made the delete looked
    // done, so it passed; at its turn the old 城 rule is still there.
    loadTransformRules.mockResolvedValue(loadResult([makeRule({ id: 'r1', key: '城' })]));
    const first = deferredSave();
    saveTransformRules.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let del!: Promise<void>;
    let add!: Promise<TransformRule>;
    act(() => {
      del = result.current.deleteRule('r1');
    });
    act(() => {
      add = result.current.addRule({
        matchKind: 'suffix',
        key: '城',
        relocate: true,
        capitalizeExceptN: 1,
        semanticType: 'location',
        enabled: true,
      });
    });
    await act(async () => {
      first.reject(new Error('disk full'));
      await expect(del).rejects.toThrow('disk full');
      await expect(add).rejects.toThrow('already exists');
    });

    expect(result.current.rules.map((r) => r.id)).toEqual(['r1']);
    expect(saveTransformRules).toHaveBeenCalledTimes(1);
  });
});
