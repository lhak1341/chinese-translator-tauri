import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCachePoisoningGuard } from '../useCachePoisoningGuard';

vi.mock('../../utils/toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('../../constants/toastConfig', () => ({
  TOAST_DURATIONS: { ERROR: 5000 },
  TOAST_IDS: { CACHE_POISONING: 'cache-poisoning' },
}));

import toast from '../../utils/toast';

function makeListenFn(trigger?: { fire: (payload: unknown) => void }) {
  const unsub = vi.fn();
  const listenFn = vi.fn().mockImplementation((_event, handler) => {
    if (trigger) trigger.fire = (payload) => handler({ payload });
    return Promise.resolve(unsub);
  });
  return { listenFn, unsub };
}

const basePayload = {
  event_count: 3,
  message: 'Cache corrupted (3 events).',
  recommendation: 'Save and restart.',
};

describe('useCachePoisoningGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with no poisoning', () => {
    const { listenFn } = makeListenFn();
    const { result } = renderHook(() => useCachePoisoningGuard(listenFn));
    expect(result.current.poisoning).toBeNull();
  });

  it('subscribes to dictionary-cache-critical-error on mount', async () => {
    const { listenFn } = makeListenFn();
    renderHook(() => useCachePoisoningGuard(listenFn));
    await act(async () => {});
    expect(listenFn).toHaveBeenCalledWith('dictionary-cache-critical-error', expect.any(Function));
  });

  it('sets poisoning event on event', async () => {
    const trigger = { fire: (_: unknown) => {} };
    const { listenFn } = makeListenFn(trigger);
    const { result } = renderHook(() => useCachePoisoningGuard(listenFn));
    await act(async () => {});

    await act(async () => {
      trigger.fire(basePayload);
    });

    expect(result.current.poisoning).toEqual({ count: 3, recommendation: 'Save and restart.' });
  });

  it('fires toast with message + recommendation', async () => {
    const trigger = { fire: (_: unknown) => {} };
    const { listenFn } = makeListenFn(trigger);
    renderHook(() => useCachePoisoningGuard(listenFn));
    await act(async () => {});
    await act(async () => {
      trigger.fire(basePayload);
    });

    expect(toast.error).toHaveBeenCalledWith(
      'Cache corrupted (3 events).\n\nSave and restart.',
      expect.objectContaining({ id: 'cache-poisoning' })
    );
  });

  it('updates poisoning on subsequent events', async () => {
    const trigger = { fire: (_: unknown) => {} };
    const { listenFn } = makeListenFn(trigger);
    const { result } = renderHook(() => useCachePoisoningGuard(listenFn));
    await act(async () => {});

    await act(async () => {
      trigger.fire(basePayload);
    });
    await act(async () => {
      trigger.fire({
        event_count: 101,
        message: 'Critical: 101 events.',
        recommendation: 'Save and restart.',
      });
    });

    expect(result.current.poisoning).toEqual({
      count: 101,
      recommendation: 'Save and restart.',
    });
  });

  it('dismiss resets poisoning to null', async () => {
    const trigger = { fire: (_: unknown) => {} };
    const { listenFn } = makeListenFn(trigger);
    const { result } = renderHook(() => useCachePoisoningGuard(listenFn));
    await act(async () => {});
    await act(async () => {
      trigger.fire(basePayload);
    });
    expect(result.current.poisoning).not.toBeNull();

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.poisoning).toBeNull();
  });

  it('calls unsubscribe on unmount', async () => {
    const { listenFn, unsub } = makeListenFn();
    const { unmount } = renderHook(() => useCachePoisoningGuard(listenFn));
    await act(async () => {});
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('ignores events fired after unmount', async () => {
    const trigger = { fire: (_: unknown) => {} };
    const { listenFn } = makeListenFn(trigger);
    const { result, unmount } = renderHook(() => useCachePoisoningGuard(listenFn));
    await act(async () => {});
    unmount();

    act(() => {
      trigger.fire(basePayload);
    });
    expect(result.current.poisoning).toBeNull();
  });

  it('logs error when listen setup fails', async () => {
    const { logger } = await import('../../utils/logger');
    const failingListenFn = vi.fn().mockRejectedValue(new Error('Tauri unavailable'));
    renderHook(() => useCachePoisoningGuard(failingListenFn));
    await act(async () => {});
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to set up cache poisoning event listener:',
      expect.any(Error)
    );
  });

  it('immediately unsubscribes if component unmounts before listen resolves', async () => {
    const unsub = vi.fn();
    let resolvePromise!: (v: () => void) => void;
    const listenFn = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolvePromise = r;
        })
    );

    const { unmount } = renderHook(() => useCachePoisoningGuard(listenFn));
    unmount();

    await act(async () => {
      resolvePromise(unsub);
    });
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
