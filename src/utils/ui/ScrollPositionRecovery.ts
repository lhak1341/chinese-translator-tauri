/** The translator's 3-panel scroll-position shape — ScrollPositionRecovery's first adapter. */
export interface ScrollPositions {
  original?: { scrollTop: number; scrollLeft: number };
  translation?: { scrollTop: number; scrollLeft: number };
  characterOnly?: { scrollTop: number; scrollLeft: number };
}

export interface RecoveryOptions {
  maxRetryAttempts?: number;
  maxRetryDelay?: number;
  initialAttemptDelay?: number;
  /**
   * 'timeout' (default): RAF-first attempt, then exponential-backoff setTimeout
   * retries (delay doubles each miss, capped at maxRetryDelay).
   * 'raf': every attempt (including retries) runs via requestAnimationFrame —
   * no backoff, no delay options consulted. For callers whose readiness check
   * needs frame-cadence polling instead of a growing wait (e.g. waiting for a
   * virtualized list to finish laying out after remount).
   */
  scheduler?: 'timeout' | 'raf';
}

/**
 * AttemptFn: try to restore positions. Return true if refs were ready and
 * restore was applied; false if refs were not ready yet (retry needed).
 */
export type AttemptFn<T> = (positions: T) => boolean;

/**
 * Pure retry algorithm for scroll position restoration.
 *
 * Owns the timer handles (rAF + setTimeout). Callers inject the DOM work via
 * AttemptFn so the backoff/retry logic is testable without a DOM. Generic over
 * the positions shape — this class never reads into `positions` itself, it's
 * passed through opaquely to attemptFn on every call.
 */
export class ScrollPositionRecovery<T> {
  readonly #attemptFn: AttemptFn<T>;
  #timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  #rafHandle: ReturnType<typeof requestAnimationFrame> | null = null;

  constructor(attemptFn: AttemptFn<T>) {
    this.#attemptFn = attemptFn;
  }

  restore(positions: T, options: RecoveryOptions = {}): Promise<void> {
    const {
      maxRetryAttempts = 10,
      maxRetryDelay = 1000,
      initialAttemptDelay = 50,
      scheduler = 'timeout',
    } = options;

    this.cancel();

    return new Promise((resolve) => {
      const attempt = (attemptsLeft: number, delay: number): void => {
        if (this.#attemptFn(positions)) {
          this.#timeoutHandle = null;
          this.#rafHandle = null;
          resolve();
        } else if (attemptsLeft > 0) {
          if (scheduler === 'raf') {
            this.#rafHandle = requestAnimationFrame(() => {
              this.#rafHandle = null;
              attempt(attemptsLeft - 1, 0);
            });
          } else {
            const nextDelay =
              delay === 0 ? initialAttemptDelay : Math.min(delay * 2, maxRetryDelay);
            this.#timeoutHandle = setTimeout(() => attempt(attemptsLeft - 1, nextDelay), nextDelay);
          }
        } else {
          this.#timeoutHandle = null;
          this.#rafHandle = null;
          resolve();
        }
      };

      this.#rafHandle = requestAnimationFrame(() => {
        this.#rafHandle = null;
        attempt(maxRetryAttempts, 0);
      });
    });
  }

  cancel(): void {
    if (this.#timeoutHandle !== null) {
      clearTimeout(this.#timeoutHandle);
      this.#timeoutHandle = null;
    }
    if (this.#rafHandle !== null) {
      cancelAnimationFrame(this.#rafHandle);
      this.#rafHandle = null;
    }
  }
}
