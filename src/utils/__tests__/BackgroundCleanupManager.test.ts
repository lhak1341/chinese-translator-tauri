/**
 * Direct tests for BackgroundCleanupManager (src/utils/memory/BackgroundCleanupManager.ts) —
 * a real collaborator of SmartMemoryCoordinator with zero prior test coverage (architecture
 * review 2026-07-18, candidate 2).
 *
 * jsdom does not implement `requestIdleCallback`, so every test exercises the `setTimeout`
 * fallback path (`typeof requestIdleCallback === 'function'` is false in this environment) —
 * the same path real users hit on any browser without idle-callback support.
 *
 * The fallback's `timeRemaining()` is a fixed constant (16ms on first dispatch, 10ms on
 * continuations), never decreasing per iteration — so a single scheduled tick drains the
 * entire queue length captured at that tick's start in one synchronous burst. Tests rely on
 * this: `vi.advanceTimersByTime(0)` runs the first tick to completion.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundCleanupManager } from '../memory/BackgroundCleanupManager';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let manager: BackgroundCleanupManager;

beforeEach(() => {
  vi.useFakeTimers();
  manager = new BackgroundCleanupManager();
});

afterEach(() => {
  manager.clear();
  vi.useRealTimers();
});

describe('ordering', () => {
  test('urgent tasks jump to the front of the queue; normal/low stay FIFO', () => {
    const order: string[] = [];
    manager.queueCleanup(() => order.push('a'), 'normal');
    manager.queueCleanup(() => order.push('b'), 'normal');
    manager.queueCleanup(() => order.push('c'), 'urgent');
    vi.advanceTimersByTime(0);
    expect(order).toEqual(['c', 'a', 'b']);
  });
});

describe('MAX_QUEUE_SIZE eviction', () => {
  test('evicts a low-priority task to make room for a new one when full', () => {
    for (let i = 0; i < 100; i++) manager.queueCleanup(() => {}, 'low');
    expect(manager.getStats().queueLength).toBe(100);

    manager.queueCleanup(() => {}, 'normal');
    // one low task evicted, the new normal task added — net length still capped at 100
    expect(manager.getStats().queueLength).toBe(100);
  });

  test('rejects a new normal task when full and no low-priority task exists to evict', () => {
    for (let i = 0; i < 100; i++) manager.queueCleanup(() => {}, 'normal');
    const beforeQueued = manager.getStats().tasksQueued;

    manager.queueCleanup(() => {}, 'normal');

    expect(manager.getStats().queueLength).toBe(100);
    expect(manager.getStats().tasksQueued).toBe(beforeQueued); // rejected task not counted
  });

  test('forces an urgent task in even when full and no low-priority task exists to evict', () => {
    for (let i = 0; i < 100; i++) manager.queueCleanup(() => {}, 'normal');

    manager.queueCleanup(() => {}, 'urgent');

    expect(manager.getStats().queueLength).toBe(101);
  });
});

describe('processing', () => {
  test('a queued task runs and increments tasksProcessed', () => {
    const fn = vi.fn();
    manager.queueCleanup(fn, 'normal');
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(manager.getStats().tasksProcessed).toBe(1);
    expect(manager.getStats().queueLength).toBe(0);
  });

  test('isProcessing is true once scheduled, false again once the queue drains', () => {
    manager.queueCleanup(() => {}, 'normal');
    expect(manager.getStats().isProcessing).toBe(true);
    vi.advanceTimersByTime(0);
    expect(manager.getStats().isProcessing).toBe(false);
  });

  test('a failing task is retried at low priority up to maxAttempts, then dropped', async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls++;
      if (calls < 3) throw new Error('transient failure');
    });
    manager.queueCleanup(fn, 'normal');

    // 3 attempts total, each retried on a separate macrotask (100ms fallback continuation)
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(manager.getStats().tasksProcessed).toBe(1); // only the successful 3rd run counts
    expect(manager.getStats().queueLength).toBe(0);
  });

  test('a task that never succeeds is dropped after maxAttempts without crashing the queue', async () => {
    const fn = vi.fn(() => {
      throw new Error('permanent failure');
    });
    manager.queueCleanup(fn, 'normal');

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(manager.getStats().tasksProcessed).toBe(0);
    expect(manager.getStats().queueLength).toBe(0);
  });
});

describe('processUrgentTasks', () => {
  test('runs urgent tasks synchronously, bypassing the idle-callback queue entirely', () => {
    const normalFn = vi.fn();
    const urgentFn = vi.fn();
    manager.queueCleanup(normalFn, 'normal');
    manager.queueCleanup(urgentFn, 'urgent');

    manager.processUrgentTasks();

    expect(urgentFn).toHaveBeenCalledTimes(1);
    expect(normalFn).not.toHaveBeenCalled();
    expect(manager.getStats().queueLength).toBe(1); // only the normal task remains
    expect(manager.getStats().tasksProcessed).toBe(1);
  });

  test('a failing urgent task is still removed from the queue, not retried', () => {
    const urgentFn = vi.fn(() => {
      throw new Error('boom');
    });
    manager.queueCleanup(urgentFn, 'urgent');

    manager.processUrgentTasks();

    expect(manager.getStats().queueLength).toBe(0);
  });
});

describe('clear', () => {
  test('empties the queue and resets isProcessing', () => {
    manager.queueCleanup(() => {}, 'normal');
    manager.queueCleanup(() => {}, 'normal');
    manager.clear();
    expect(manager.getStats().queueLength).toBe(0);
    expect(manager.getStats().isProcessing).toBe(false);
  });

  test('a pending scheduled tick becomes a no-op after clear — task never runs', () => {
    const fn = vi.fn();
    manager.queueCleanup(fn, 'normal'); // schedules a setTimeout(0) tick internally
    manager.clear();
    vi.advanceTimersByTime(0);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('getStats', () => {
  test('averageTaskTimeMs is reported as a non-negative numeric string after processing', () => {
    manager.queueCleanup(() => {}, 'normal');
    vi.advanceTimersByTime(0);
    expect(Number(manager.getStats().averageTaskTimeMs)).toBeGreaterThanOrEqual(0);
  });
});
