/**
 * Tracks pattern processor failure state and decides when to warn or permanently disable.
 *
 * Owns: failure count, when the current run of failures began, warning-shown flag, threshold
 * logic. Does NOT own: enableTwoPhasePatterns flag, toast calls, performance monitor — caller
 * interprets the returned action and handles those side effects.
 *
 * A "run" is consecutive failures with no success between them; a success ends it. The window
 * is measured from the first failure of the run, so a processor that never worked (or last worked
 * long ago) is judged the same way as one that failed just after a success.
 *
 * Failure state machine:
 *   reportFailure() count < threshold            → 'warn'    (first failure in a run; a success or a reset starts a new run)
 *   reportFailure() count < threshold, warned    → 'none'    (subsequent, warning already shown)
 *   reportFailure() count >= threshold, run began within the window → 'disable' (permanent disable signal)
 *   reportFailure() count >= threshold, run older than the window   → 'reset'   (new run starting at this failure, count 1)
 */
export class PatternFailureTracker {
  constructor({ failureWindowMs, disableThreshold }) {
    this._count = 0;
    this._runStartedAt = null;
    this._warningShown = false;
    this._failureWindowMs = failureWindowMs;
    this._disableThreshold = disableThreshold;
  }

  /**
   * Call on every successful pattern processing run.
   * @returns {{ recovered: boolean, previousCount: number }}
   */
  reportSuccess() {
    const previousCount = this._count;
    this._count = 0;
    this._warningShown = false; // the next failure starts a new run, so it warns
    this._runStartedAt = null;
    return { recovered: previousCount > 0, previousCount };
  }

  /**
   * Call when pattern processing throws. Returns the action the engine should take.
   * @returns {{ action: 'disable'|'warn'|'reset'|'none', count: number }}
   *   'disable' — threshold reached within the window of the run's first failure; caller should
   *               permanently disable
   *   'warn'    — first failure in a run; caller should show retry toast
   *   'reset'   — threshold reached but the run is older than the window; counter reset to 1,
   *               caller should log the reset and show retry toast for attempt 1
   *   'none'    — subsequent failure, warning already shown; no UI action needed
   */
  reportFailure() {
    const now = Date.now();
    if (this._count === 0) this._runStartedAt = now;
    this._count++;
    const count = this._count;

    if (count >= this._disableThreshold) {
      if (now - this._runStartedAt < this._failureWindowMs) {
        return { action: 'disable', count };
      }
      this._count = 1;
      this._runStartedAt = now;
      this._warningShown = false;
      return { action: 'reset', count: 1 };
    }

    if (!this._warningShown) {
      this._warningShown = true;
      return { action: 'warn', count };
    }

    return { action: 'none', count };
  }

  get count() {
    return this._count;
  }
}
