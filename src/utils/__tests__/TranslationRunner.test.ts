import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  createTranslationRunner,
  translationTimeoutMs,
  TranslationCancelledError,
  TranslationTimeoutError,
} from '../TranslationRunner';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('translationTimeoutMs', () => {
  it('is 30s for short text, grows 100ms per character, and stops at 60s', () => {
    expect(translationTimeoutMs(0)).toBe(30_000);
    expect(translationTimeoutMs(300)).toBe(30_000);
    expect(translationTimeoutMs(450)).toBe(45_000);
    expect(translationTimeoutMs(600)).toBe(60_000);
    expect(translationTimeoutMs(100_000)).toBe(60_000);
  });
});

describe('TranslationRunner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the task result and runs cleanup once', async () => {
    const runner = createTranslationRunner();
    const cleanup = vi.fn();
    const result = await runner.run(async () => 'done', { timeoutMs: 1000, cleanup });
    expect(result).toBe('done');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith({ superseded: false });
    expect(runner.getActiveCount()).toBe(0);
  });

  it('rejects with the task error and still cleans up', async () => {
    const runner = createTranslationRunner();
    const cleanup = vi.fn();
    await expect(
      runner.run(
        async () => {
          throw new Error('boom');
        },
        { timeoutMs: 1000, cleanup }
      )
    ).rejects.toThrow('boom');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(runner.getActiveCount()).toBe(0);
  });

  it('times out: aborts the signal and rejects with TranslationTimeoutError', async () => {
    const runner = createTranslationRunner();
    let seen: AbortSignal | undefined;
    const never = deferred();
    const run = runner.run(
      ({ signal }) => {
        seen = signal;
        return never.promise;
      },
      { timeoutMs: 5000 }
    );
    const assertion = expect(run).rejects.toBeInstanceOf(TranslationTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(seen?.aborted).toBe(true);
  });

  it('a new run cancels the previous one and flags its cleanup as superseded', async () => {
    const runner = createTranslationRunner();
    const first = deferred<string>();
    const cleanupFirst = vi.fn();
    const runFirst = runner.run(() => first.promise, { timeoutMs: 1000, cleanup: cleanupFirst });
    const firstAssertion = expect(runFirst).rejects.toBeInstanceOf(TranslationCancelledError);

    const cleanupSecond = vi.fn();
    const runSecond = runner.run(async () => 'second', { timeoutMs: 1000, cleanup: cleanupSecond });

    await firstAssertion;
    expect(await runSecond).toBe('second');
    expect(cleanupFirst).toHaveBeenCalledWith({ superseded: true });
    expect(cleanupSecond).toHaveBeenCalledWith({ superseded: false });
    expect(runner.getActiveCount()).toBe(0);
  });

  it('guard turns callbacks into no-ops once the run is cancelled', async () => {
    const runner = createTranslationRunner();
    const onProgress = vi.fn();
    let guarded!: (n: number) => void;
    const gate = deferred();
    const run = runner.run(
      async ({ guard }) => {
        guarded = guard(onProgress);
        guarded(1);
        await gate.promise;
      },
      { timeoutMs: 1000 }
    );
    const assertion = expect(run).rejects.toBeInstanceOf(TranslationCancelledError);

    runner.cancelAll();
    guarded(2);
    await assertion;

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it("cancelAll reports the count and waits for the aborted run's cleanup", async () => {
    const runner = createTranslationRunner();
    const cleanupGate = deferred();
    const order: string[] = [];
    const run = runner.run(() => new Promise<void>(() => {}), {
      timeoutMs: 1000,
      cleanup: async () => {
        await cleanupGate.promise;
        order.push('cleanup done');
      },
    });
    const assertion = expect(run).rejects.toBeInstanceOf(TranslationCancelledError);

    const { count, cleanupComplete } = runner.cancelAll();
    expect(count).toBe(1);
    const waited = cleanupComplete.then(() => order.push('reload may proceed'));

    await assertion;
    await Promise.resolve();
    expect(order).toEqual([]);

    cleanupGate.resolve();
    await waited;
    expect(order).toEqual(['cleanup done', 'reload may proceed']);
  });

  it('cancelAll with nothing running returns count 0 and an already-settled promise', async () => {
    const runner = createTranslationRunner();
    const { count, cleanupComplete } = runner.cancelAll();
    expect(count).toBe(0);
    await expect(cleanupComplete).resolves.toBeUndefined();
  });

  it('a failing cleanup does not fail the run and still lets cancelAll settle', async () => {
    const runner = createTranslationRunner();
    const result = await runner.run(async () => 'x', {
      timeoutMs: 1000,
      cleanup: () => {
        throw new Error('cleanup failed');
      },
    });
    expect(result).toBe('x');
    await expect(runner.cancelAll().cleanupComplete).resolves.toBeUndefined();
  });
});
