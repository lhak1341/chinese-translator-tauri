import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTransformRules } from '../useTransformRules';
import type { TransformRule } from '../../types/TransformRuleTypes';

const { loadTransformRules, saveTransformRules, toastError } = vi.hoisted(() => ({
  loadTransformRules: vi.fn(),
  saveTransformRules: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../utils/dictionary/TransformRuleBackend', () => ({
  loadTransformRules,
  saveTransformRules,
}));

vi.mock('../../utils/toast', () => ({ default: { error: toastError } }));

function makeRule(overrides: Partial<TransformRule> = {}): TransformRule {
  return {
    id: 'r1',
    matchKind: 'suffix',
    key: '城',
    moveWords: 1,
    capitalizeExceptN: 1,
    semanticType: 'location',
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadTransformRules.mockResolvedValue([]);
  saveTransformRules.mockResolvedValue(undefined);
});

describe('useTransformRules', () => {
  test('loads persisted rules on mount', async () => {
    const rules = [makeRule()];
    loadTransformRules.mockResolvedValue(rules);

    const { result } = renderHook(() => useTransformRules());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rules).toEqual(rules);
  });

  test('addRule persists a new rule with a generated id', async () => {
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addRule({
        matchKind: 'suffix',
        key: '城',
        moveWords: 1,
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
    loadTransformRules.mockResolvedValue([makeRule({ label: 'old' })]);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateRule(makeRule({ label: 'new' }));
    });

    expect(result.current.rules[0].label).toBe('new');
  });

  test('a save failure rolls back the optimistic update and toasts', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ label: 'original' })]);
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
    loadTransformRules.mockResolvedValue([makeRule()]);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteRule('r1');
    });

    expect(result.current.rules).toHaveLength(0);
  });

  test('toggleEnabled flips only the targeted rule', async () => {
    loadTransformRules.mockResolvedValue([
      makeRule({ id: 'r1', enabled: true }),
      makeRule({ id: 'r2', enabled: true }),
    ]);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleEnabled('r1');
    });

    expect(result.current.rules.find((r) => r.id === 'r1')?.enabled).toBe(false);
    expect(result.current.rules.find((r) => r.id === 'r2')?.enabled).toBe(true);
  });

  test('addRule rejects a rule that collides with an existing (matchKind, key)', async () => {
    loadTransformRules.mockResolvedValue([
      makeRule({ id: 'existing', matchKind: 'suffix', key: '城' }),
    ]);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.addRule({
        matchKind: 'suffix',
        key: '城',
        moveWords: 1,
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
    loadTransformRules.mockResolvedValue([
      makeRule({ id: 'r1', matchKind: 'suffix', key: '城' }),
      makeRule({ id: 'r2', matchKind: 'suffix', key: '市' }),
    ]);
    const { result } = renderHook(() => useTransformRules());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.updateRule(makeRule({ id: 'r2', matchKind: 'suffix', key: '城' }))
    ).rejects.toThrow();
    expect(result.current.rules.find((r) => r.id === 'r2')?.key).toBe('市'); // unchanged
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  test('checkConflict finds a same-(matchKind,key) rule other than itself', async () => {
    loadTransformRules.mockResolvedValue([makeRule({ id: 'existing' })]);
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
