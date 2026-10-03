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
vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeDeps(overrides = {}) {
  return {
    engineRef: { current: { isReady: () => true } },
    translateText: vi.fn().mockResolvedValue('sequential result'),
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
      const p = result.current('hello');
      await vi.advanceTimersByTimeAsync(150);
      await p;
    });

    expect(deps.translateText).toHaveBeenCalledWith('hello');
    expect(deps.setStreamingText).toHaveBeenCalledWith('sequential result');
    expect(deps.translateCharacterOnly).toHaveBeenCalledWith('hello');
    // Character-only is queued with setTimeout, not awaited, so the toast comes first.
    expect(order).toEqual(['toast', 'characterOnly']);
  });

  test('waits an extra 500ms when the engine is not ready after the initial 100ms', async () => {
    let ready = false;
    const deps = makeDeps({
      engineRef: {
        current: {
          isReady: () => ready,
        },
      },
    });
    const { result } = renderHook(() => useReloadRetranslate(deps));

    const p = act(async () => {
      const inner = result.current('hello');
      await vi.advanceTimersByTimeAsync(100);
      // Right after the first wait, engine still not ready — becomes ready
      // during the extra 500ms wait.
      ready = true;
      await vi.advanceTimersByTimeAsync(500);
      await inner;
    });

    await p;

    expect(deps.translateText).toHaveBeenCalledWith('hello');
  });
});
