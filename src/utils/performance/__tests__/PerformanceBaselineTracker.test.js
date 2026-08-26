import { describe, test, expect, vi, afterEach } from 'vitest';
import { PerformanceBaselineTracker } from '../PerformanceBaselineTracker.js';

function makeTrackerAtBaseline(options = {}) {
  const tracker = new PerformanceBaselineTracker(options);
  // establishBaseline needs >= 10 samples in history before it fires.
  for (let i = 0; i < 10; i++) {
    tracker.recordPerformance('op', { duration: 100 });
  }
  return tracker;
}

describe('PerformanceBaselineTracker critical-alert debug callback', () => {
  let tracker;

  afterEach(() => {
    tracker?.destroy();
  });

  test('calls the injected onCriticalAlert instead of logBasicMemoryDebug', () => {
    const onCriticalAlert = vi.fn();
    tracker = makeTrackerAtBaseline({ onCriticalAlert });
    const basicDebugSpy = vi.spyOn(tracker, 'logBasicMemoryDebug');

    // criticalDegradation default is 1.5x — 200ms vs a 100ms baseline triggers it.
    tracker.recordPerformance('op', { duration: 200 });

    expect(onCriticalAlert).toHaveBeenCalledTimes(1);
    const [alert] = onCriticalAlert.mock.calls[0];
    expect(alert.level).toBe('critical');
    expect(alert.operationType).toBe('op');
    expect(basicDebugSpy).not.toHaveBeenCalled();
  });

  test('falls back to logBasicMemoryDebug when no callback was injected', () => {
    tracker = makeTrackerAtBaseline();
    const basicDebugSpy = vi.spyOn(tracker, 'logBasicMemoryDebug').mockImplementation(() => {});

    tracker.recordPerformance('op', { duration: 200 });

    expect(basicDebugSpy).toHaveBeenCalledTimes(1);
    expect(basicDebugSpy).toHaveBeenCalledWith(
      'op',
      expect.objectContaining({ level: 'critical' })
    );
  });

  test('does not touch window at all for the critical-alert path', () => {
    const onCriticalAlert = vi.fn();
    tracker = makeTrackerAtBaseline({ onCriticalAlert });

    expect(() => tracker.recordPerformance('op', { duration: 200 })).not.toThrow();
    expect(onCriticalAlert).toHaveBeenCalledTimes(1);
  });
});
