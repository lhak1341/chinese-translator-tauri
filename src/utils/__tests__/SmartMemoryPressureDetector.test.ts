/**
 * Direct tests for SmartMemoryPressureDetector (src/utils/memory/SmartMemoryPressureDetector.ts) —
 * previously a real collaborator with zero direct test coverage (architecture review 2026-07-18,
 * candidate 2). Its own threshold math and sampling loop had only ever been exercised indirectly
 * through a mock in WasmMemoryPoolManager.test.ts.
 *
 * Fake timers include 'performance' so `performance.now()` advances deterministically with
 * `vi.advanceTimersByTime` — required to test the 30s/60s/120s cleanup-throttle windows and the
 * MB/min growth-rate calculation precisely.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartMemoryPressureDetector } from '../memory/SmartMemoryPressureDetector';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function setMemory(usedMB: number, limitMB: number, totalMB = limitMB) {
  Object.defineProperty(performance, 'memory', {
    configurable: true,
    value: {
      usedJSHeapSize: usedMB * 1024 * 1024,
      totalJSHeapSize: totalMB * 1024 * 1024,
      jsHeapSizeLimit: limitMB * 1024 * 1024,
    },
  });
}

function clearMemory() {
  Object.defineProperty(performance, 'memory', { configurable: true, value: undefined });
}

let detectors: SmartMemoryPressureDetector[] = [];
function makeDetector(options: ConstructorParameters<typeof SmartMemoryPressureDetector>[0] = {}) {
  const detector = new SmartMemoryPressureDetector(options);
  detectors.push(detector);
  return detector;
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  detectors = [];
});

afterEach(() => {
  detectors.forEach((d) => d.stop());
  clearMemory();
  vi.useRealTimers();
});

describe('getCurrentPressureLevel', () => {
  test('returns unknown when performance.memory is absent', () => {
    clearMemory();
    const detector = makeDetector();
    const pressure = detector.getCurrentPressureLevel();
    expect(pressure.level).toBe('unknown');
    expect(pressure.ratio).toBe(0);
  });

  test('returns none below the low threshold', () => {
    setMemory(50, 100); // 0.5
    const detector = makeDetector();
    expect(detector.getCurrentPressureLevel().level).toBe('none');
  });

  test('returns low at the low threshold boundary', () => {
    setMemory(60, 100); // 0.6
    const detector = makeDetector();
    expect(detector.getCurrentPressureLevel().level).toBe('low');
  });

  test('returns medium at the medium threshold boundary', () => {
    setMemory(75, 100); // 0.75
    const detector = makeDetector();
    expect(detector.getCurrentPressureLevel().level).toBe('medium');
  });

  test('returns high at the high threshold boundary', () => {
    setMemory(85, 100); // 0.85
    const detector = makeDetector();
    expect(detector.getCurrentPressureLevel().level).toBe('high');
  });

  test('returns critical at the critical threshold boundary', () => {
    setMemory(95, 100); // 0.95
    const detector = makeDetector();
    expect(detector.getCurrentPressureLevel().level).toBe('critical');
  });

  test('custom thresholds override the defaults', () => {
    setMemory(50, 100); // 0.5, below default low (0.6) but above custom low (0.4)
    const detector = makeDetector({ lowPressure: 0.4 });
    expect(detector.getCurrentPressureLevel().level).toBe('low');
  });

  test('ratio and available reflect the raw byte values', () => {
    setMemory(60, 100);
    const detector = makeDetector();
    const pressure = detector.getCurrentPressureLevel();
    expect(pressure.ratio).toBeCloseTo(0.6);
    expect(pressure.used).toBe(60 * 1024 * 1024);
    expect(pressure.available).toBe(40 * 1024 * 1024);
    expect(pressure.limit).toBe(100 * 1024 * 1024);
  });
});

describe('sampling loop', () => {
  test('samples once synchronously at construction', () => {
    setMemory(50, 100);
    const detector = makeDetector();
    expect(detector.getStats()?.samples).toBe(1);
  });

  test('samples again after the sampling interval elapses', () => {
    setMemory(50, 100);
    const detector = makeDetector({ samplingInterval: 5000 });
    vi.advanceTimersByTime(5000);
    expect(detector.getStats()?.samples).toBe(2);
  });

  test('stop() clears the interval — no further samples', () => {
    setMemory(50, 100);
    const detector = makeDetector({ samplingInterval: 5000 });
    detector.stop();
    vi.advanceTimersByTime(20000);
    expect(detector.getStats()?.samples).toBe(1);
  });

  test('history respects historyLimit via ring-buffer overwrite', () => {
    setMemory(50, 100);
    const detector = makeDetector({ samplingInterval: 1000, historyLimit: 3 });
    vi.advanceTimersByTime(1000 * 5); // 5 more ticks on top of the initial sample = 6 total
    expect(detector.getStats()?.samples).toBe(3);
  });
});

describe('getMemoryGrowthRate', () => {
  test('returns 0 with fewer than 2 samples', () => {
    setMemory(50, 100);
    const detector = makeDetector();
    expect(detector.getMemoryGrowthRate()).toBe(0);
  });

  test('computes MB/min growth between the first and most recent sample', () => {
    setMemory(50, 100);
    const detector = makeDetector({ samplingInterval: 30000 });
    setMemory(80, 100); // +30MB
    vi.advanceTimersByTime(30000); // 30s later
    // 30MB over 30s = 60MB/min
    expect(detector.getMemoryGrowthRate()).toBeCloseTo(60, 0);
  });
});

describe('cleanup throttling and dispatch', () => {
  test('critical pressure fires a cleanup event once the 30s global cooldown elapses', () => {
    // shouldTriggerCleanup's first guard is a flat 30s cooldown since lastCleanup (initialized
    // to 0) — even 'critical' pressure is blocked until 30s of clock time have passed.
    setMemory(96, 100); // critical
    const detector = makeDetector({ samplingInterval: 35000 });
    const cleanupCb = vi.fn();
    detector.onMemoryEvent('cleanup', cleanupCb);
    vi.advanceTimersByTime(35000);
    expect(cleanupCb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cleanup-needed', urgency: 'critical' })
    );
  });

  test('critical pressure does NOT fire before the 30s global cooldown elapses', () => {
    setMemory(96, 100); // critical
    const detector = makeDetector({ samplingInterval: 5000 });
    const cleanupCb = vi.fn();
    detector.onMemoryEvent('cleanup', cleanupCb);
    vi.advanceTimersByTime(5000);
    expect(cleanupCb).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cleanup-needed' }));
  });

  test('high pressure does not fire cleanup before the 60s window', () => {
    setMemory(90, 100); // high
    const detector = makeDetector({ samplingInterval: 5000 });
    const cleanupCb = vi.fn();
    detector.onMemoryEvent('cleanup', cleanupCb);
    vi.advanceTimersByTime(5000);
    expect(cleanupCb).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'cleanup-needed' }));
  });

  test('high pressure fires cleanup once the 60s window has passed', () => {
    setMemory(90, 100); // high
    // interval offset by 1ms so the 2nd tick (t=60002) lands strictly past the 60s window —
    // the check is `timeSinceLastCleanup > 60000`, not `>=`.
    const detector = makeDetector({ samplingInterval: 30001 });
    const cleanupCb = vi.fn();
    detector.onMemoryEvent('cleanup', cleanupCb);
    vi.advanceTimersByTime(30001); // t=30001ms, within window
    vi.advanceTimersByTime(30001); // t=60002ms, strictly past the 60s window
    expect(cleanupCb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cleanup-needed', urgency: 'high' })
    );
  });

  test('growth rate above threshold fires cleanup regardless of level', () => {
    setMemory(10, 100); // none
    const detector = makeDetector({ samplingInterval: 60000, growthThreshold: 5 });
    const cleanupCb = vi.fn();
    detector.onMemoryEvent('cleanup', cleanupCb);
    setMemory(70, 100); // +60MB over 60s = 60MB/min, far above threshold of 5
    vi.advanceTimersByTime(60000);
    expect(cleanupCb).toHaveBeenCalledWith(expect.objectContaining({ type: 'cleanup-needed' }));
  });

  test('all registered callbacks receive the plain sample data every tick', () => {
    setMemory(50, 100);
    const detector = makeDetector({ samplingInterval: 5000 });
    const monitoringCb = vi.fn();
    detector.onMemoryEvent('monitoring', monitoringCb);
    vi.advanceTimersByTime(5000);
    expect(monitoringCb).toHaveBeenCalledWith(
      expect.objectContaining({
        pressure: expect.objectContaining({ level: 'none' }),
        shouldCleanup: false,
      })
    );
  });

  test('a callback throwing does not stop other callbacks or crash the sampler', () => {
    setMemory(50, 100);
    const detector = makeDetector({ samplingInterval: 5000 });
    detector.onMemoryEvent('broken', () => {
      throw new Error('boom');
    });
    const okCb = vi.fn();
    detector.onMemoryEvent('ok', okCb);
    vi.advanceTimersByTime(5000);
    expect(okCb).toHaveBeenCalled();
  });
});

describe('getStats', () => {
  test('reports current level, ratio, and sample count', () => {
    setMemory(75, 100);
    const detector = makeDetector();
    const stats = detector.getStats();
    expect(stats?.current).toBe('medium');
    expect(stats?.samples).toBe(1);
    expect(Number(stats?.availableMB)).toBeCloseTo(25, 0);
  });
});
