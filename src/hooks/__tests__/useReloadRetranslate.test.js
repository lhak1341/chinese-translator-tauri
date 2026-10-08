/**
 * Tests for useReloadRetranslate — extracted from Translator.jsx's forceReloadCtx
 * (2026-07-17c) so this logic (previously zero test coverage, mocked wholesale by
 * useForceReload.test.js) gets exercised directly.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReloadRetranslate } from '../useReloadRetranslate.js';

const mockToastSuccess = vi.fn();
vi.mock('../../utils/toast', () => ({
  default: { success: (...args) => mockToastSuccess(...args) },
}));

function makeDeps(overrides = {}) {
  return {
    engineRef: { current: { isReady: () => true } },
    translateText: vi.fn().mockResolvedValue({ status: 'done', text: 'sequential result' }),
    translateCharacterOnly: vi.fn().mockResolvedValue(undefined),
    setStreamingText: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe('useReloadRetranslate', () => {
  test('translates, streams the result, then runs character-only after the toast', async () => {
    const order = [];
    mockToastSuccess.mockImplementation(() => order.push('toast'));
    const deps = makeDeps({
      translateCharacterOnly: vi.fn().mockImplementation(async () => {
        order.push('characterOnly');
      }),
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    await act(async () => {
      await result.current('hello');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(deps.translateText).toHaveBeenCalledWith('hello');
    expect(deps.setStreamingText).toHaveBeenCalledWith('sequential result');
    expect(deps.translateCharacterOnly).toHaveBeenCalledWith('hello');
    // Character-only is queued with setTimeout, not awaited, so the toast comes first.
    expect(order).toEqual(['toast', 'characterOnly']);
  });

  test('translates at once, without waiting for the engine to settle', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useReloadRetranslate(deps));

    // No timers are advanced: a settle wait would leave this promise pending forever.
    await act(async () => {
      await result.current('hello');
    });

    expect(deps.translateText).toHaveBeenCalledWith('hello');
  });

  test.each([
    ['is not ready', { current: { isReady: () => false } }],
    ['is missing', { current: null }],
  ])('throws instead of translating when the engine %s', async (_label, engineRef) => {
    const deps = makeDeps({ engineRef });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    await expect(result.current('hello')).rejects.toThrow('Engine not ready');

    expect(deps.translateText).not.toHaveBeenCalled();
    expect(deps.setStreamingText).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  test('throws when the translation was skipped, so the reload reports the failure', async () => {
    const deps = makeDeps({
      translateText: vi.fn().mockResolvedValue({ status: 'skipped', reason: 'preempted' }),
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    await expect(result.current('hello')).rejects.toThrow('preempted');

    expect(deps.setStreamingText).not.toHaveBeenCalled();
    expect(deps.translateCharacterOnly).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
