/**
 * Tracks pattern processor failure state and decides when to warn or permanently disable.
 *
 * Owns: failure count, last-success timestamp, warning-shown flag, threshold logic.
 * Does NOT own: enableTwoPhasePatterns flag, toast calls, performance monitor — caller
 * interprets the returned action and handles those side effects.
 *
 * Failure state machine:
 *   reportFailure() count < threshold            → 'warn'    (first failure in sequence)
 *   reportFailure() count < threshold, warned    → 'none'    (subsequent, warning already shown)
 *   reportFailure() count >= threshold, in window → 'disable' (permanent disable signal)
 *   reportFailure() count >= threshold, out window → 'reset'  (window expired, counter reset to 1)
 */
export class PatternFailureTracker {
  constructor({ failureWindowMs, disableThreshold }) {
    this._count = 0;
    this._lastSuccessTime = null;
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
    this._lastSuccessTime = Date.now();
    return { recovered: previousCount > 0, previousCount };
  }

  /**
   * Call when pattern processing throws. Returns the action the engine should take.
   * @returns {{ action: 'disable'|'warn'|'reset'|'none', count: number }}
   *   'disable' — threshold reached within window; caller should permanently disable
   *   'warn'    — first failure in sequence; caller should show retry toast
   *   'reset'   — threshold reached but window expired; counter reset to 1, caller should
   *               log the reset and show retry toast for attempt 1
   *   'none'    — subsequent failure, warning already shown; no UI action needed
   */
  reportFailure() {
    this._count++;
    const timeSinceLastSuccess = this._lastSuccessTime
      ? Date.now() - this._lastSuccessTime
      : Infinity;
    const count = this._count;

    if (count >= this._disableThreshold && timeSinceLastSuccess < this._failureWindowMs) {
      return { action: 'disable', count };
    }

    if (count >= this._disableThreshold) {
      this._count = 1;
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
