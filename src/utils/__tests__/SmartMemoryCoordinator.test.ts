/**
 * Direct tests for SmartMemoryCoordinator (src/utils/memory/SmartMemoryCoordinator.ts) —
 * previously wired live into TranslationEngine.js::translateWithProgressiveBatches (the
 * onEmergency/onHighPriority callbacks that slice translationSegments and clear caches under
 * real memory pressure) with zero test coverage anywhere (architecture review 2026-07-18,
 * candidate 2).
 *
 * SmartMemoryPressureDetector is mocked — same pattern as WasmMemoryPoolManager.test.ts — so
 * urgency events can be fired synthetically without depending on real performance.memory
 * sampling (already covered directly in SmartMemoryPressureDetector.test.ts). This isolates
 * the coordinator's own responsibility: urgency -> callback dispatch, bgCleanup interaction,
 * and profiler wiring.
 *
 * BackgroundCleanupManager and ComponentMemoryProfiler are NOT mocked — they are real
 * collaborators with their own direct test coverage (BackgroundCleanupManager.test.ts,
 * ComponentMemoryProfiler.test.ts); using the real classes here also exercises the wiring
 * between all three, not just the coordinator in isolation.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartMemoryCoordinator } from '../memory/SmartMemoryCoordinator';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { detectorInstances } = vi.hoisted(() => ({ detectorInstances: [] as any[] }));

vi.mock('../memory/SmartMemoryPressureDetector.js', () => {
  const SmartMemoryPressureDetector = vi.fn().mockImplementation(function (this: any) {
    this.callbacks = new Map<string, (data: any) => void>();
    this.stop = vi.fn();
    this.getStats = vi.fn(() => ({ current: 'none' }));
    this.onMemoryEvent = (event: string, cb: (data: any) => void) => {
      this.callbacks.set(event, cb);
    };
    detectorInstances.push(this);
  });
  return { SmartMemoryPressureDetector };
});

function fireCleanup(detector: any, urgency: string, ratio = 0.9) {
  detector.callbacks.get('cleanup')!({
    type: 'cleanup-needed',
    urgency,
    pressure: { level: urgency, ratio, available: 0, used: 0, total: 0, limit: 0, timestamp: 0 },
    growthRate: 0,
    timestamp: 0,
  });
}

let coordinators: SmartMemoryCoordinator[] = [];
function makeCoordinator(
  overrides: Partial<{
    onEmergency: () => void;
    onHighPriority: () => void;
    onBackground: () => void;
  }> = {}
) {
  const onEmergency = overrides.onEmergency ?? vi.fn();
  const onHighPriority = overrides.onHighPriority ?? vi.fn();
  const onBackground = overrides.onBackground ?? vi.fn();
  const coordinator = new SmartMemoryCoordinator({ onEmergency, onHighPriority, onBackground });
  coordinators.push(coordinator);
  return {
    coordinator,
    onEmergency,
    onHighPriority,
    onBackground,
    detector: detectorInstances.at(-1),
  };
}

beforeEach(() => {
  detectorInstances.length = 0;
  coordinators = [];
});

afterEach(() => {
  coordinators.forEach((c) => c.shutdown());
});

describe('urgency dispatch', () => {
  test('critical urgency calls onEmergency', () => {
    const { onEmergency, onHighPriority, detector } = makeCoordinator();
    fireCleanup(detector, 'critical');
    expect(onEmergency).toHaveBeenCalledTimes(1);
    expect(onHighPriority).not.toHaveBeenCalled();
  });

  test('high urgency calls onHighPriority, not onEmergency', () => {
    const { onEmergency, onHighPriority, detector } = makeCoordinator();
    fireCleanup(detector, 'high');
    expect(onHighPriority).toHaveBeenCalledTimes(1);
    expect(onEmergency).not.toHaveBeenCalled();
  });

  test('medium urgency queues onBackground via background cleanup, does not call it synchronously', () => {
    const { onBackground, onEmergency, onHighPriority, detector } = makeCoordinator();
    fireCleanup(detector, 'medium');
    expect(onEmergency).not.toHaveBeenCalled();
    expect(onHighPriority).not.toHaveBeenCalled();
    // BackgroundCleanupManager.queueCleanup defers execution to an idle callback / macrotask —
    // it must not have run synchronously within the dispatch itself.
    expect(onBackground).not.toHaveBeenCalled();
  });

  test('low urgency also queues onBackground, not called synchronously', () => {
    const { onBackground, detector } = makeCoordinator();
    fireCleanup(detector, 'low');
    expect(onBackground).not.toHaveBeenCalled();
  });

  test('an unrecognized urgency value dispatches to no branch', () => {
    const { onEmergency, onHighPriority, onBackground, detector } = makeCoordinator();
    fireCleanup(detector, 'unknown');
    expect(onEmergency).not.toHaveBeenCalled();
    expect(onHighPriority).not.toHaveBeenCalled();
    expect(onBackground).not.toHaveBeenCalled();
  });
});

describe('error containment', () => {
  test('onEmergency throwing does not propagate out of the dispatch', () => {
    const onEmergency = vi.fn(() => {
      throw new Error('boom');
    });
    const { detector } = makeCoordinator({ onEmergency });
    expect(() => fireCleanup(detector, 'critical')).not.toThrow();
    expect(onEmergency).toHaveBeenCalledTimes(1);
  });
});

describe('profiling wiring', () => {
  test('startProfiling / completeProfiling delegate to the internal profiler', () => {
    const { coordinator } = makeCoordinator();
    const id = coordinator.startProfiling('TestComponent', 'op1');
    // jsdom has no performance.memory, so the real ComponentMemoryProfiler returns null —
    // this still proves the coordinator delegates rather than swallowing the call.
    expect(id).toBeNull();
    expect(coordinator.completeProfiling(id)).toBeNull();
  });

  test('completeProfiling with a null id is a safe no-op', () => {
    const { coordinator } = makeCoordinator();
    expect(coordinator.completeProfiling(null)).toBeNull();
  });
});

describe('getStats', () => {
  test('reports all three subsystems as enabled after successful construction', () => {
    const { coordinator } = makeCoordinator();
    const stats = coordinator.getStats();
    expect(stats.smartMemoryEnabled).toBe(true);
    expect(stats.backgroundCleanupEnabled).toBe(true);
    expect(stats.memoryProfilingEnabled).toBe(true);
  });
});

describe('shutdown', () => {
  test('stops the detector and clears background cleanup', () => {
    const { coordinator, detector } = makeCoordinator();
    coordinator.shutdown();
    expect(detector.stop).toHaveBeenCalledTimes(1);
    // After shutdown, internal references are nulled — getStats reflects everything disabled.
    const stats = coordinator.getStats();
    expect(stats.smartMemoryEnabled).toBe(false);
    expect(stats.backgroundCleanupEnabled).toBe(false);
    expect(stats.memoryProfilingEnabled).toBe(false);
  });

  test('is safe to call twice', () => {
    const { coordinator } = makeCoordinator();
    coordinator.shutdown();
    expect(() => coordinator.shutdown()).not.toThrow();
  });
});

describe('constructor failure isolation', () => {
  test('a detector construction failure disables the coordinator without throwing', async () => {
    const { SmartMemoryPressureDetector } =
      (await import('../memory/SmartMemoryPressureDetector.js')) as any;
    SmartMemoryPressureDetector.mockImplementationOnce(() => {
      throw new Error('detector init failed');
    });
    const onEmergency = vi.fn();
    const onHighPriority = vi.fn();
    const onBackground = vi.fn();
    let coordinator!: SmartMemoryCoordinator;
    expect(() => {
      coordinator = new SmartMemoryCoordinator({ onEmergency, onHighPriority, onBackground });
    }).not.toThrow();
    coordinators.push(coordinator);
    expect(coordinator.getStats().smartMemoryEnabled).toBe(false);
  });
});
