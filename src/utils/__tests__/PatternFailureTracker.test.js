import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PatternFailureTracker } from '../pattern/PatternFailureTracker.js';

const WINDOW_MS = 5 * 60 * 1000;

describe('PatternFailureTracker', () => {
  let tracker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
    tracker = new PatternFailureTracker({ failureWindowMs: WINDOW_MS, disableThreshold: 3 });
  });
  afterEach(() => vi.useRealTimers());

  test('the first failure warns, later ones below the threshold stay quiet', () => {
    expect(tracker.reportFailure()).toEqual({ action: 'warn', count: 1 });
    expect(tracker.reportFailure()).toEqual({ action: 'none', count: 2 });
  });

  test('reaching the threshold within the window of the first failure disables', () => {
    tracker.reportFailure();
    tracker.reportFailure();
    expect(tracker.reportFailure()).toEqual({ action: 'disable', count: 3 });
  });

  test('a processor that never succeeded still disables (no success is needed to start the window)', () => {
    vi.advanceTimersByTime(10 * WINDOW_MS); // a long time since the tracker was made
    tracker.reportFailure();
    tracker.reportFailure();
    expect(tracker.reportFailure().action).toBe('disable');
  });

  test('an old success does not stop the failures that follow it from disabling', () => {
    tracker.reportSuccess();
    vi.advanceTimersByTime(10 * WINDOW_MS);
    tracker.reportFailure();
    tracker.reportFailure();
    expect(tracker.reportFailure().action).toBe('disable');
  });

  test('reaching the threshold after the window since the first failure resets to 1', () => {
    tracker.reportFailure();
    tracker.reportFailure();
    vi.advanceTimersByTime(WINDOW_MS + 1);
    expect(tracker.reportFailure()).toEqual({ action: 'reset', count: 1 });
    expect(tracker.count).toBe(1);
  });

  test('after a reset the window runs from the failure that reset it', () => {
    tracker.reportFailure();
    tracker.reportFailure();
    vi.advanceTimersByTime(WINDOW_MS + 1);
    tracker.reportFailure(); // reset, count 1
    tracker.reportFailure();
    expect(tracker.reportFailure().action).toBe('disable');
  });

  test('a reset starts a new sequence, so its first failure warns again', () => {
    tracker.reportFailure();
    tracker.reportFailure();
    vi.advanceTimersByTime(WINDOW_MS + 1);
    tracker.reportFailure(); // reset
    expect(tracker.reportFailure()).toEqual({ action: 'warn', count: 2 });
  });

  test('a success reports the recovery and clears the count', () => {
    tracker.reportFailure();
    tracker.reportFailure();
    expect(tracker.reportSuccess()).toEqual({ recovered: true, previousCount: 2 });
    expect(tracker.count).toBe(0);
    expect(tracker.reportSuccess()).toEqual({ recovered: false, previousCount: 0 });
  });

  test('a failure after a recovery warns again', () => {
    tracker.reportFailure();
    tracker.reportSuccess();
    expect(tracker.reportFailure()).toEqual({ action: 'warn', count: 1 });
  });

  test('a tracker that cannot disable warns once per sequence and never resets', () => {
    const jsTracker = new PatternFailureTracker({
      failureWindowMs: WINDOW_MS,
      disableThreshold: Infinity,
    });
    const actions = Array.from({ length: 6 }, () => jsTracker.reportFailure().action);
    expect(actions).toEqual(['warn', 'none', 'none', 'none', 'none', 'none']);
  });
});
