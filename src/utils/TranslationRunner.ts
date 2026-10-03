/**
 * Runs one cancellable, timed translation at a time.
 *
 * Owns three things the Translator tab used to scatter across `translateText` and
 * `useTranslationController`: the timeout, the abort, and the cleanup that a dictionary reload
 * must wait for (CRITICAL-3). Starting a run cancels the previous one, so there is never more than
 * one in flight; there is no concurrency cap because there is nothing to cap.
 *
 * A cancelled or timed-out run is inert: the task gets an `AbortSignal` for the engine and a
 * `guard` that turns its callbacks into no-ops once the signal fires, so a run that lost cannot
 * write state over the run that replaced it.
 */

import { logger } from './logger';

export const MIN_TRANSLATION_TIMEOUT_MS = 30_000;
export const MAX_TRANSLATION_TIMEOUT_MS = 60_000;
const MS_PER_CHARACTER = 100;

/** 30s minimum, +100ms per character, never more than 60s. */
export function translationTimeoutMs(textLength: number): number {
  return Math.min(
    MAX_TRANSLATION_TIMEOUT_MS,
    Math.max(MIN_TRANSLATION_TIMEOUT_MS, textLength * MS_PER_CHARACTER)
  );
}

export interface RunContext {
  signal: AbortSignal;
  /** Wraps a callback so it does nothing once this run is cancelled or timed out. */
  guard: <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void;
}

export interface RunOptions {
  timeoutMs: number;
  /**
   * Runs once the task has settled, whatever the outcome. `superseded` is true when a newer run
   * started in the meantime: state that run now owns (streaming flags, progress handlers) must be
   * left alone. A reload awaits this work through `cancelAll().cleanupComplete`.
   */
  cleanup?: (info: { superseded: boolean }) => void | Promise<void>;
}

export interface TranslationRunner {
  run<T>(task: (ctx: RunContext) => Promise<T>, options: RunOptions): Promise<T>;
  /** Aborts the active run. `cleanupComplete` settles after that run's cleanup has finished. */
  cancelAll(): { count: number; cleanupComplete: Promise<void> };
  getActiveCount(): number;
}

interface ActiveRun {
  controller: AbortController;
  settled: Promise<void>;
}

export class TranslationCancelledError extends Error {
  constructor() {
    super('Translation cancelled');
    this.name = 'TranslationCancelledError';
  }
}

export class TranslationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Translation timed out after ${timeoutMs}ms`);
    this.name = 'TranslationTimeoutError';
  }
}

export function createTranslationRunner(): TranslationRunner {
  let active: ActiveRun | null = null;
  // Runs that were aborted but whose cleanup has not finished yet.
  const unsettled = new Set<Promise<void>>();

  function run<T>(task: (ctx: RunContext) => Promise<T>, options: RunOptions): Promise<T> {
    active?.controller.abort();

    const controller = new AbortController();
    const { signal } = controller;

    let markSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });
    const me: ActiveRun = { controller, settled };
    active = me;
    unsettled.add(settled);

    const guard: RunContext['guard'] =
      (fn) =>
      (...args) => {
        if (!signal.aborted) fn(...args);
      };

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    const outcome = new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        if (signal.aborted) return;
        // Reject first: aborting fires the cancel listener, which would win the race otherwise.
        reject(new TranslationTimeoutError(options.timeoutMs));
        controller.abort();
      }, options.timeoutMs);

      onAbort = () => reject(new TranslationCancelledError());
      signal.addEventListener('abort', onAbort, { once: true });

      task({ signal, guard }).then(resolve, reject);
    });

    return outcome.finally(() => {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener('abort', onAbort);
      const superseded = active !== me;
      if (!superseded) active = null;
      // The result does not wait for cleanup; `cancelAll().cleanupComplete` does.
      void (async () => {
        try {
          await options.cleanup?.({ superseded });
        } catch (error) {
          logger.error('Translation cleanup failed:', error);
        } finally {
          unsettled.delete(settled);
          markSettled();
        }
      })();
    });
  }

  return {
    run,
    cancelAll() {
      const count = active ? 1 : 0;
      active?.controller.abort();
      const pending = [...unsettled];
      return { count, cleanupComplete: Promise.all(pending).then(() => undefined) };
    },
    getActiveCount: () => (active ? 1 : 0),
  };
}
