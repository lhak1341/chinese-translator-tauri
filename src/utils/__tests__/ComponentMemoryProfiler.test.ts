/**
 * Direct tests for ComponentMemoryProfiler (src/utils/memory/ComponentMemoryProfiler.ts) —
 * a real collaborator of SmartMemoryCoordinator with zero prior test coverage (architecture
 * review 2026-07-18, candidate 2).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ComponentMemoryProfiler } from '../memory/ComponentMemoryProfiler';

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

let profiler: ComponentMemoryProfiler;

beforeEach(() => {
  profiler = new ComponentMemoryProfiler();
});

afterEach(() => {
  clearMemory();
});

describe('startProfiling / completeProfiling lifecycle', () => {
  test('returns null when performance.memory is unavailable', () => {
    clearMemory();
    expect(profiler.startProfiling('Comp', 'op1')).toBeNull();
  });

  test('returns a profileId shaped "componentName:operationId" when memory is available', () => {
    setMemory(50, 100);
    const id = profiler.startProfiling('Comp', 'op1');
    expect(id).toBe('Comp:op1');
  });

  test('defaults operationId to "default" when omitted', () => {
    setMemory(50, 100);
    const id = profiler.startProfiling('Comp');
    expect(id).toBe('Comp:default');
  });

  test('completeProfiling computes memoryUsed as the delta between start and end', () => {
    setMemory(50, 100);
    const id = profiler.startProfiling('Comp', 'op1');
    setMemory(80, 100); // +30MB
    const metrics = profiler.completeProfiling(id);
    expect(metrics?.memoryUsed).toBe(30 * 1024 * 1024);
    expect(metrics?.memoryUsedMB).toBeCloseTo(30, 5);
  });

  test('completeProfiling with a null id is a safe no-op', () => {
    expect(profiler.completeProfiling(null)).toBeNull();
  });

  test('completeProfiling for an unknown profileId returns null', () => {
    setMemory(50, 100);
    expect(profiler.completeProfiling('nonexistent:id')).toBeNull();
  });

  test('completing the same profileId twice returns null the second time', () => {
    setMemory(50, 100);
    const id = profiler.startProfiling('Comp', 'op1');
    profiler.completeProfiling(id);
    expect(profiler.completeProfiling(id)).toBeNull();
  });

  test('sample() records a delta-tracked sample against the active profile', () => {
    setMemory(50, 100);
    const id = profiler.startProfiling('Comp', 'op1');
    setMemory(60, 100); // +10MB
    profiler.sample(id, 'checkpoint-1');
    setMemory(90, 100); // +40MB from start
    const metrics = profiler.completeProfiling(id);
    expect(metrics?.sampleCount).toBe(1);
    expect(metrics?.peakMemoryDelta).toBe(10 * 1024 * 1024);
  });

  test('sample() with a null profileId is a safe no-op', () => {
    expect(() => profiler.sample(null, 'x')).not.toThrow();
  });

  test('sample() against an already-completed profile is a safe no-op', () => {
    setMemory(50, 100);
    const id = profiler.startProfiling('Comp', 'op1');
    profiler.completeProfiling(id);
    expect(() => profiler.sample(id, 'late-sample')).not.toThrow();
  });
});

describe('aggregated component stats', () => {
  test('storeMetrics accumulates totalMemoryUsed and averageMemoryUsed across operations', () => {
    setMemory(50, 100);
    const id1 = profiler.startProfiling('Comp', 'op1');
    setMemory(60, 100); // +10MB
    profiler.completeProfiling(id1);

    const id2 = profiler.startProfiling('Comp', 'op2');
    setMemory(90, 100); // +30MB
    profiler.completeProfiling(id2);

    const stats = profiler.getComponentStats('Comp');
    expect(stats).not.toBeNull();
    expect((stats as any).operationCount).toBe(2);
    expect((stats as any).totalMemoryUsed).toBe(40 * 1024 * 1024);
    expect((stats as any).averageMemoryUsed).toBe(20 * 1024 * 1024);
  });

  test('getComponentStats(null) returns all components sorted by averageMemoryUsed descending', () => {
    setMemory(50, 100);
    const idA = profiler.startProfiling('Small', 'op1');
    setMemory(55, 100); // +5MB
    profiler.completeProfiling(idA);

    const idB = profiler.startProfiling('Big', 'op1');
    setMemory(50, 100);
    setMemory(100, 100); // +50MB
    profiler.completeProfiling(idB);

    const all = profiler.getComponentStats() as any[];
    expect(all.map((s) => s.componentName)).toEqual(['Big', 'Small']);
  });

  test('getComponentStats for an unknown component returns null', () => {
    expect(profiler.getComponentStats('Nope')).toBeNull();
  });

  test('rolling window trims operations beyond 50, adjusting totals accordingly', () => {
    setMemory(0, 1000);
    for (let i = 0; i < 51; i++) {
      const id = profiler.startProfiling('Comp', `op${i}`);
      setMemory(i + 1, 1000); // +1MB each operation
      profiler.completeProfiling(id);
      setMemory(i + 1, 1000); // next iteration starts from where this one ended
    }
    const stats = profiler.getComponentStats('Comp') as any;
    expect(stats.operationCount).toBe(50); // oldest (op0) evicted
    expect(stats.operations).toHaveLength(50);
    expect(stats.operations[0].operationId).toBe('op1'); // op0 was shifted out
  });
});

describe('getTopMemoryConsumers', () => {
  test('returns components sorted by average usage, limited and with recentOperations', () => {
    setMemory(0, 1000);
    const idA = profiler.startProfiling('A', 'op1');
    setMemory(10, 1000);
    profiler.completeProfiling(idA);

    const idB = profiler.startProfiling('B', 'op1');
    setMemory(60, 1000);
    profiler.completeProfiling(idB);

    const top = profiler.getTopMemoryConsumers(1);
    expect(top).toHaveLength(1);
    expect(top[0].component).toBe('B');
    expect(top[0].recentOperations.length).toBeGreaterThan(0);
  });
});

describe('setEnabled', () => {
  test('disabling stops new profiles from starting', () => {
    profiler.setEnabled(false);
    setMemory(50, 100);
    expect(profiler.startProfiling('Comp', 'op1')).toBeNull();
  });

  test('disabling clears in-flight (active) profiles but keeps completed component stats', () => {
    setMemory(50, 100);
    const completedId = profiler.startProfiling('Comp', 'done');
    setMemory(60, 100);
    profiler.completeProfiling(completedId);

    const activeId = profiler.startProfiling('Comp', 'in-flight');
    expect(activeId).not.toBeNull();

    profiler.setEnabled(false);

    // re-enable to read state without the disabled-guard short-circuiting completeProfiling
    profiler.setEnabled(true);
    expect(profiler.completeProfiling(activeId)).toBeNull(); // active profile was purged
    expect(profiler.getComponentStats('Comp')).not.toBeNull(); // completed stats survived
  });
});

describe('getProfilerStats', () => {
  test('reports enabled flag, active profile count, and component/operation totals', () => {
    setMemory(50, 100);
    profiler.startProfiling('Comp', 'in-flight');
    const doneId = profiler.startProfiling('Comp', 'done');
    setMemory(60, 100);
    profiler.completeProfiling(doneId);

    const stats = profiler.getProfilerStats();
    expect(stats.enabled).toBe(true);
    expect(stats.activeProfiles).toBe(1);
    expect(stats.componentCount).toBe(1);
    expect(stats.totalOperationsTracked).toBe(1);
  });
});
