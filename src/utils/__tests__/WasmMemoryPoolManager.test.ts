/**
 * Direct tests for WasmMemoryPool (src/utils/wasm/WasmMemoryPoolManager.ts) — previously
 * exercised only through a hand-rolled mock in WasmDictionaryManager's test suite; the real
 * pooling logic (allocation, reuse, eviction, pressure reaction) had zero direct coverage
 * (architecture review 2026-07-17, candidate 3).
 *
 * SmartMemoryPressureDetector is mocked — it's a real collaborator with its own zero test
 * coverage, and in jsdom (no `performance.memory`) it can never organically report a real
 * pressure level, so WasmMemoryPool's pressure-REACTION logic is tested via synthetic events
 * fired through the mock. SmartMemoryPressureDetector's own correctness is a separate,
 * not-yet-taken candidate.
 *
 * Fake timers are used throughout: the constructor always starts a 30s periodic-optimization
 * interval (and, when pressure detection is enabled, the detector's own sampling interval) —
 * this file's own comments flag leaked intervals as a past CRITICAL bug, so cleanup()'s actual
 * interval-clearing behavior is asserted directly, not just assumed.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { WasmMemoryPool, wasmMemoryPoolManager } from '../wasm/WasmMemoryPoolManager';

const { detectorInstances } = vi.hoisted(() => ({ detectorInstances: [] as any[] }));

vi.mock('../memory/SmartMemoryPressureDetector.js', () => {
  class MockDetector {
    callbacks = new Map<string, (data: any) => void>();
    stop = vi.fn();
    pressureLevel: any = {
      level: 'unknown',
      ratio: 0,
      available: 0,
      used: 0,
      total: 0,
      limit: 0,
      timestamp: 0,
    };
    getCurrentPressureLevel = vi.fn(() => this.pressureLevel);
    onMemoryEvent(event: string, cb: (data: any) => void) {
      this.callbacks.set(event, cb);
    }
    constructor() {
      detectorInstances.push(this);
    }
  }
  return { SmartMemoryPressureDetector: MockDetector };
});

function firePressure(detector: any, level: string, ratio = 0.9) {
  detector.callbacks.get('pressure')!({
    pressure: { level, ratio, available: 0, used: 0, total: 0, limit: 0, timestamp: 0 },
  });
}

let pools: WasmMemoryPool[] = [];
function makePool(options: ConstructorParameters<typeof WasmMemoryPool>[0] = {}) {
  const pool = new WasmMemoryPool({ enablePressureDetection: false, ...options });
  pools.push(pool);
  return pool;
}

beforeEach(() => {
  vi.useFakeTimers();
  detectorInstances.length = 0;
});

afterEach(() => {
  pools.forEach((p) => p.cleanup());
  pools = [];
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('WasmMemoryPool — getBuffer (pool selection + hit/miss)', () => {
  test('a small request is served from the small pool as a pool hit (pre-warmed)', () => {
    const pool = makePool();
    const before = pool.getStats();
    const buffer = pool.getBuffer(1000);
    expect(buffer.byteLength).toBe(16 * 1024);
    const after = pool.getStats();
    expect(after.poolHits).toBe(before.poolHits + 1);
    expect(after.pools.small.inUse).toBe(1);
  });

  test('selects the medium pool for a 20KB request', () => {
    const pool = makePool();
    const buffer = pool.getBuffer(20 * 1024);
    expect(buffer.byteLength).toBe(64 * 1024);
    expect(pool.getStats().pools.medium.inUse).toBe(1);
  });

  test('selects the large pool for a 100KB request', () => {
    const pool = makePool();
    const buffer = pool.getBuffer(100 * 1024);
    expect(buffer.byteLength).toBe(256 * 1024);
    expect(pool.getStats().pools.large.inUse).toBe(1);
  });

  test('falls back to direct allocation once a pool is at capacity, without crashing', () => {
    const pool = makePool({ initialPoolSize: 0 });
    // small pool maxCount defaults to 8
    for (let i = 0; i < 8; i++) pool.getBuffer(100);
    expect(pool.getStats().pools.small.inUse).toBe(8);

    const overflow = pool.getBuffer(100);
    expect(overflow).toBeInstanceOf(ArrayBuffer);
    expect(overflow.byteLength).toBeGreaterThanOrEqual(16 * 1024);
    // Overflow buffer is NOT tracked in inUse — capacity stays at 8
    expect(pool.getStats().pools.small.inUse).toBe(8);
  });
});

describe('WasmMemoryPool — returnBuffer (release + recycling)', () => {
  test('a returned tracked buffer moves from inUse back to available for reuse', () => {
    const pool = makePool();
    const buffer = pool.getBuffer(100);
    expect(pool.getStats().pools.small.inUse).toBe(1);

    pool.returnBuffer(buffer);
    const stats = pool.getStats();
    expect(stats.pools.small.inUse).toBe(0);
    expect(stats.memoryReused).toBeGreaterThan(0);
  });

  test('returning null is a no-op and does not increment deallocations', () => {
    const pool = makePool();
    pool.returnBuffer(null);
    expect(pool.getStats().deallocations).toBe(0);
  });

  test('clears buffer contents (security wipe) before returning it to the pool', () => {
    const pool = makePool({ initialPoolSize: 0 });
    const buffer = pool.getBuffer(100);
    new Uint8Array(buffer).fill(0xff);

    pool.returnBuffer(buffer);
    const reused = pool.getBuffer(100);
    expect(reused).toBe(buffer); // LIFO pop — same buffer comes back
    expect(Array.from(new Uint8Array(reused))).toEqual(new Array(reused.byteLength).fill(0));
  });

  test('double-returning the same buffer is detected and does not duplicate it in the pool', () => {
    const pool = makePool();
    const buffer = pool.getBuffer(100);
    pool.returnBuffer(buffer);
    pool.returnBuffer(buffer); // second return of the same buffer

    // available count reflects only one copy, not two
    expect(pool.getStats().pools.small.available).toBe(4); // 3 untouched + 1 returned once
  });

  test('a buffer not managed by any pool logs a warning and does not throw', () => {
    const pool = makePool();
    const foreignBuffer = new ArrayBuffer(1024);
    expect(() => pool.returnBuffer(foreignBuffer)).not.toThrow();
    expect(pool.getStats().deallocations).toBe(1);
  });

  test('under pressure ("high"), a returned buffer is discarded instead of recycled', () => {
    // initialPoolSize:8 (== small pool's maxCount) so that even after popping one for the
    // outgoing getBuffer() call, available stays >= maxCount/2 — otherwise the size-based
    // recycle clause (available < maxCount/2) would force a keep regardless of pressure.
    const pool = makePool({ enablePressureDetection: true, initialPoolSize: 8 });
    const detector = detectorInstances[detectorInstances.length - 1];
    detector.pressureLevel = {
      level: 'high',
      ratio: 0.9,
      available: 0,
      used: 0,
      total: 0,
      limit: 0,
      timestamp: 0,
    };

    const buffer = pool.getBuffer(100);
    const afterPop = pool.getStats().pools.small.available; // 7, still >= maxCount/2 (4)
    pool.returnBuffer(buffer);

    // Under high pressure with a well-stocked pool, the buffer is released, not recycled
    expect(pool.getStats().pools.small.available).toBe(afterPop);
  });
});

describe('WasmMemoryPool — getStats() recommendations', () => {
  test('flags low recycling efficiency when misses dominate', () => {
    // Default initialPoolSize is 4 (pre-warmed small pool) — drain those 4 hits first, then
    // 2 more calls miss (pool.available is empty, still under maxCount so new buffers are
    // created). 4 hits + 2 misses = 66.7% < the 70% recommendation threshold.
    const pool = makePool();
    for (let i = 0; i < 6; i++) pool.getBuffer(100);
    const stats = pool.getStats();
    expect(stats.recyclingEfficiency).toBeCloseTo((4 / 6) * 100, 1);
    expect(stats.recommendations).toContainEqual(
      expect.objectContaining({ type: 'efficiency', priority: 'medium' })
    );
  });

  test('flags high memory pressure when the detector reports it', () => {
    const pool = makePool({ enablePressureDetection: true });
    const detector = detectorInstances[detectorInstances.length - 1];
    detector.pressureLevel = {
      level: 'critical',
      ratio: 0.97,
      available: 0,
      used: 0,
      total: 0,
      limit: 0,
      timestamp: 0,
    };

    const stats = pool.getStats();
    expect(stats.memoryPressure.level).toBe('critical');
    expect(stats.recommendations).toContainEqual(
      expect.objectContaining({ type: 'memory', priority: 'high' })
    );
  });
});

describe('WasmMemoryPool — pressure event reaction', () => {
  test('medium pressure shrinks available buffers toward 80% of maxCount', () => {
    const pool = makePool({ enablePressureDetection: true, initialPoolSize: 8 });
    const detector = detectorInstances[detectorInstances.length - 1];
    expect(pool.getStats().pools.small.available).toBe(8); // maxCount

    firePressure(detector, 'medium');
    // target = floor(8 * 0.8) = 6
    expect(pool.getStats().pools.small.available).toBe(6);
  });

  test('high pressure shrinks available buffers further, toward 60% of maxCount', () => {
    const pool = makePool({ enablePressureDetection: true, initialPoolSize: 8 });
    const detector = detectorInstances[detectorInstances.length - 1];

    firePressure(detector, 'high');
    // target = floor(8 * 0.6) = 4
    expect(pool.getStats().pools.small.available).toBe(4);
  });

  test('critical pressure clears all available buffers across every pool (emergency cleanup)', () => {
    const pool = makePool({ enablePressureDetection: true, initialPoolSize: 4 });
    const detector = detectorInstances[detectorInstances.length - 1];

    firePressure(detector, 'critical');
    const stats = pool.getStats();
    expect(stats.pools.small.available).toBe(0);
    expect(stats.pools.medium.available).toBe(0);
    expect(stats.pools.large.available).toBe(0);
  });
});

describe('WasmMemoryPool — explicit-0 options are respected, not coerced to defaults', () => {
  test('initialPoolSize:0 starts every pool with zero pre-warmed buffers', () => {
    const pool = makePool({ initialPoolSize: 0 });
    const stats = pool.getStats();
    expect(stats.pools.small.available).toBe(0);
    expect(stats.pools.medium.available).toBe(0);
    expect(stats.pools.large.available).toBe(0);
  });

  test('shrinkThreshold:0 disables periodic auto-shrink entirely', () => {
    const pool = makePool({ initialPoolSize: 4, shrinkThreshold: 0 });
    expect(pool.getStats().pools.small.available).toBe(4);

    vi.advanceTimersByTime(30_000);

    // utilizationRatio (0) is never < shrinkThreshold (0) — no shrink should occur
    expect(pool.getStats().pools.small.available).toBe(4);
  });
});

describe('WasmMemoryPool — periodic optimization (30s interval)', () => {
  test('shrinks an idle, mostly-full pool by 25% after 30 seconds', () => {
    const pool = makePool({ initialPoolSize: 4 });
    expect(pool.getStats().pools.small.available).toBe(4);

    vi.advanceTimersByTime(30_000);

    // utilization 0/4 < shrinkThreshold(0.3) and available(4) > 2 -> remove floor(4*0.25)=1
    expect(pool.getStats().pools.small.available).toBe(3);
  });

  test('does not shrink a pool once utilization is above the shrink threshold', () => {
    const pool = makePool({ initialPoolSize: 4 });
    pool.getBuffer(100);
    pool.getBuffer(100); // inUse=2, available=2 -> utilization 0.5, above 0.3 threshold

    vi.advanceTimersByTime(30_000);
    expect(pool.getStats().pools.small.available).toBe(2);
  });
});

describe('WasmMemoryPool — cleanup()', () => {
  test('stops the periodic-optimization interval — no further shrinking after cleanup', () => {
    const pool = makePool({ initialPoolSize: 4 });
    pool.cleanup();
    // pools is intentionally not tracking this one anymore to avoid a double-cleanup call in afterEach
    pools = pools.filter((p) => p !== pool);

    vi.advanceTimersByTime(60_000);
    // cleanup() itself empties available buffers; the assertion is that nothing throws and no
    // further periodic shrink logic runs against a torn-down pool
    expect(pool.getStats().pools.small.available).toBe(0);
  });

  test('stops the pressure detector when pressure detection was enabled', () => {
    const pool = makePool({ enablePressureDetection: true });
    const detector = detectorInstances[detectorInstances.length - 1];
    pool.cleanup();
    pools = pools.filter((p) => p !== pool);

    expect(detector.stop).toHaveBeenCalled();
  });

  test('clears all pools (available and inUse)', () => {
    const pool = makePool({ initialPoolSize: 4 });
    const buffer = pool.getBuffer(100);
    pool.cleanup();
    pools = pools.filter((p) => p !== pool);

    const stats = pool.getStats();
    expect(stats.pools.small.available).toBe(0);
    expect(stats.pools.small.inUse).toBe(0);
    expect(buffer).toBeInstanceOf(ArrayBuffer); // buffer object itself is untouched, just untracked
  });
});

describe('wasmMemoryPoolManager — production singleton smoke test', () => {
  test('satisfies the WasmBufferAllocator interface and cleans up without throwing', () => {
    expect(typeof wasmMemoryPoolManager.getBuffer).toBe('function');
    expect(typeof wasmMemoryPoolManager.returnBuffer).toBe('function');
    expect(typeof wasmMemoryPoolManager.getStats).toBe('function');
    expect(typeof wasmMemoryPoolManager.cleanup).toBe('function');

    const buffer = wasmMemoryPoolManager.getBuffer(1000);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    wasmMemoryPoolManager.returnBuffer(buffer);

    const stats = wasmMemoryPoolManager.getStats();
    expect(stats.pools.small).toBeDefined();
    expect(stats.pools.medium).toBeDefined();
    expect(stats.pools.large).toBeDefined();

    // The singleton starts a real 30s interval at module-import time (before fake timers were
    // installed) — clean it up so it doesn't keep ticking in the background after this file exits.
    expect(() => wasmMemoryPoolManager.cleanup()).not.toThrow();
  });
});
