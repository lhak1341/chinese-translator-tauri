import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrollPositionRecovery } from '../ScrollPositionRecovery';
import type { ScrollPositions } from '../ScrollPositionRecovery';

const positions: ScrollPositions = {
  original: { scrollTop: 100, scrollLeft: 0 },
  translation: { scrollTop: 200, scrollLeft: 0 },
};

describe('ScrollPositionRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when attempt succeeds on first try', async () => {
    const attempt = vi.fn(() => true);
    const recovery = new ScrollPositionRecovery(attempt);

    const promise = recovery.restore(positions);
    await vi.runAllTimersAsync();
    await promise;

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(positions);
  });

  it('retries until attempt succeeds', async () => {
    let callCount = 0;
    const attempt = vi.fn(() => ++callCount === 3);
    const recovery = new ScrollPositionRecovery(attempt);

    const promise = recovery.restore(positions, { initialAttemptDelay: 50 });
    await vi.runAllTimersAsync();
    await promise;

    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('resolves after exhausting retries without throwing', async () => {
    const attempt = vi.fn(() => false);
    const recovery = new ScrollPositionRecovery(attempt);

    const promise = recovery.restore(positions, { maxRetryAttempts: 3, initialAttemptDelay: 50 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();

    // RAF attempt + 3 retries = 4 total
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it('uses exponential backoff: 50 → 100 → 200 → capped at maxRetryDelay', async () => {
    const delays: number[] = [];
    let lastTime = 0;

    const attempt = vi.fn(() => {
      const now = Date.now();
      if (lastTime > 0) delays.push(now - lastTime);
      lastTime = now;
      return false;
    });

    const recovery = new ScrollPositionRecovery(attempt);
    const promise = recovery.restore(positions, {
      maxRetryAttempts: 4,
      initialAttemptDelay: 50,
      maxRetryDelay: 200,
    });
    await vi.runAllTimersAsync();
    await promise;

    // delays: [50, 100, 200, 200] (capped at 200)
    expect(delays).toEqual([50, 100, 200, 200]);
  });

  it('cancel() aborts pending retry before it fires', async () => {
    const attempt = vi.fn(() => false);
    const recovery = new ScrollPositionRecovery(attempt);

    recovery.restore(positions, { initialAttemptDelay: 100 });
    // Advance past RAF (~16ms) so first attempt runs, but not past retry delay (100ms)
    await vi.advanceTimersByTimeAsync(20);
    recovery.cancel();
    await vi.runAllTimersAsync();

    // Only the initial RAF attempt ran; retry was cancelled
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('second restore() cancels the first', async () => {
    let firstResolved = false;
    let secondResolved = false;

    const attempt = vi.fn(() => false);
    const recovery = new ScrollPositionRecovery(attempt);

    recovery.restore(positions, { initialAttemptDelay: 200, maxRetryAttempts: 5 }).then(() => {
      firstResolved = true;
    });

    // Let RAF fire for first call, then start second call which cancels first
    await vi.advanceTimersByTimeAsync(0);
    recovery.restore(positions, { initialAttemptDelay: 50, maxRetryAttempts: 1 }).then(() => {
      secondResolved = true;
    });

    await vi.runAllTimersAsync();

    // First promise never resolves (cancelled); second resolves
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(true);
  });

  it('passes positions object through to attemptFn unchanged', async () => {
    const attempt = vi.fn(() => true);
    const recovery = new ScrollPositionRecovery(attempt);

    const promise = recovery.restore(positions);
    await vi.runAllTimersAsync();
    await promise;

    expect(attempt).toHaveBeenCalledWith(positions);
  });

  it('uses default options when none provided', async () => {
    const attempt = vi.fn(() => false);
    const recovery = new ScrollPositionRecovery(attempt);

    const promise = recovery.restore(positions);
    await vi.runAllTimersAsync();
    await promise;

    // default maxRetryAttempts=10 → 11 calls (RAF + 10 retries)
    expect(attempt).toHaveBeenCalledTimes(11);
  });

  describe("scheduler: 'raf'", () => {
    it('does not apply exponential backoff between retries', async () => {
      const delays: number[] = [];
      let lastTime = 0;

      const attempt = vi.fn(() => {
        const now = Date.now();
        if (lastTime > 0) delays.push(now - lastTime);
        lastTime = now;
        return false;
      });

      const recovery = new ScrollPositionRecovery(attempt);
      const promise = recovery.restore(positions, {
        scheduler: 'raf',
        maxRetryAttempts: 4,
        // These backoff options must be ignored entirely in 'raf' mode.
        initialAttemptDelay: 500,
        maxRetryDelay: 5000,
      });
      await vi.runAllTimersAsync();
      await promise;

      expect(attempt).toHaveBeenCalledTimes(5);
      // Every inter-attempt delay is a single RAF tick, not a growing 500 → 1000 → ... backoff.
      const maxDelay = Math.max(...delays);
      expect(maxDelay).toBeLessThan(500);
    });

    it('force-resolves after exhausting maxRetryAttempts, same as timeout mode', async () => {
      const attempt = vi.fn(() => false);
      const recovery = new ScrollPositionRecovery(attempt);

      const promise = recovery.restore(positions, { scheduler: 'raf', maxRetryAttempts: 3 });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBeUndefined();

      // RAF attempt + 3 retries = 4 total
      expect(attempt).toHaveBeenCalledTimes(4);
    });

    it("cancel() aborts a pending 'raf' retry", async () => {
      let resolved = false;
      const attempt = vi.fn(() => false);
      const recovery = new ScrollPositionRecovery(attempt);

      recovery.restore(positions, { scheduler: 'raf', maxRetryAttempts: 10 }).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(0);
      recovery.cancel();
      await vi.runAllTimersAsync();

      expect(resolved).toBe(false);
    });
  });
});
