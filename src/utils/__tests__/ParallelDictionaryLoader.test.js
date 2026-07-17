import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ParallelDictionaryLoader,
  loadDictionariesInChunks,
} from '../dictionary/ParallelDictionaryLoader.js';

vi.mock('../logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('ParallelDictionaryLoader', () => {
  let loader;

  beforeEach(() => {
    loader = new ParallelDictionaryLoader();
  });

  const dicts = (names) => names.map((name) => ({ name, path: `/dicts/${name}.json` }));

  const succeed = (name) => Promise.resolve({ loaded: name });
  const fail = (name) => Promise.reject(new Error(`boom-${name}`));

  describe('loadDictionariesParallel', () => {
    it('classifies successes and failures independently, preserving input order', async () => {
      const loadFunction = vi.fn((name) => (name === 'b' ? fail(name) : succeed(name)));

      const result = await loader.loadDictionariesParallel(dicts(['a', 'b', 'c']), loadFunction);

      expect(result.total).toBe(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results.map((r) => r.name)).toEqual(['a', 'b', 'c']);
      expect(result.results[0]).toMatchObject({
        name: 'a',
        success: true,
        result: { loaded: 'a' },
      });
      expect(result.results[1]).toMatchObject({ name: 'b', success: false, error: 'boom-b' });
      expect(result.results[2]).toMatchObject({
        name: 'c',
        success: true,
        result: { loaded: 'c' },
      });
    });

    it('does not let one rejected load reject the whole batch', async () => {
      const loadFunction = vi.fn(() => fail('x'));
      await expect(
        loader.loadDictionariesParallel(dicts(['x']), loadFunction)
      ).resolves.toMatchObject({ successful: 0, failed: 1 });
    });

    it('increments parallelLoads and parallelTime stats', async () => {
      await loader.loadDictionariesParallel(dicts(['a']), () => succeed('a'));
      expect(loader.stats.parallelLoads).toBe(1);
      expect(loader.stats.parallelTime).toBeGreaterThanOrEqual(0);
      expect(loader.stats.totalLoads).toBe(0);
    });

    it('runs loads concurrently, not one-at-a-time', async () => {
      const started = [];
      const loadFunction = vi.fn((name) => {
        started.push(name);
        return new Promise((resolve) => setTimeout(() => resolve(name), 5));
      });

      await loader.loadDictionariesParallel(dicts(['a', 'b', 'c']), loadFunction);

      // All three should have started before any could have resolved (5ms delay each).
      expect(started).toEqual(['a', 'b', 'c']);
    });
  });

  describe('loadDictionariesSequential', () => {
    it('classifies successes and failures independently', async () => {
      const loadFunction = vi.fn((name) => (name === 'b' ? fail(name) : succeed(name)));

      const result = await loader.loadDictionariesSequential(dicts(['a', 'b', 'c']), loadFunction);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results[1]).toMatchObject({ name: 'b', success: false, error: 'boom-b' });
    });

    it('increments totalLoads and totalTime stats, not parallel stats', async () => {
      await loader.loadDictionariesSequential(dicts(['a']), () => succeed('a'));
      expect(loader.stats.totalLoads).toBe(1);
      expect(loader.stats.parallelLoads).toBe(0);
    });

    it('runs loads one at a time, in order', async () => {
      const order = [];
      const loadFunction = vi.fn(async (name) => {
        order.push(`start-${name}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`end-${name}`);
        return name;
      });

      await loader.loadDictionariesSequential(dicts(['a', 'b']), loadFunction);

      expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
    });
  });

  describe('loadDictionariesAuto', () => {
    it('uses sequential loading for fewer than 3 dictionaries', async () => {
      const spy = vi.spyOn(loader, 'loadDictionariesSequential');
      await loader.loadDictionariesAuto(dicts(['a', 'b']), () => succeed('a'));
      expect(spy).toHaveBeenCalled();
    });

    it('uses parallel loading for 3 or more dictionaries', async () => {
      const spy = vi.spyOn(loader, 'loadDictionariesParallel');
      await loader.loadDictionariesAuto(dicts(['a', 'b', 'c']), () => succeed('a'));
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('fetchDictionariesParallel', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      delete global.fetch;
    });

    it('returns parsed JSON data for a successful fetch', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ hello: 'world' }),
      });

      const results = await loader.fetchDictionariesParallel(['/a.json']);

      expect(results).toEqual([{ path: '/a.json', success: true, data: { hello: 'world' } }]);
    });

    it('classifies a non-ok HTTP response as a failure', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      const results = await loader.fetchDictionariesParallel(['/missing.json']);

      expect(results).toEqual([
        { path: '/missing.json', success: false, error: 'HTTP 404: Not Found' },
      ]);
    });

    it('classifies a network-level rejection as a failure', async () => {
      global.fetch.mockRejectedValue(new Error('network down'));

      const results = await loader.fetchDictionariesParallel(['/a.json']);

      expect(results).toEqual([{ path: '/a.json', success: false, error: 'network down' }]);
    });

    it('handles a mix of successful and failed fetches independently', async () => {
      global.fetch.mockImplementation((path) =>
        path === '/bad.json'
          ? Promise.resolve({ ok: false, status: 500, statusText: 'Server Error' })
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ path }) })
      );

      const results = await loader.fetchDictionariesParallel(['/good.json', '/bad.json']);

      expect(results[0]).toMatchObject({ path: '/good.json', success: true });
      expect(results[1]).toMatchObject({ path: '/bad.json', success: false });
    });
  });

  describe('getStats / resetStats', () => {
    it('reports zeroed-out stats with no loads recorded', () => {
      const stats = loader.getStats();
      expect(stats).toMatchObject({
        parallelLoads: 0,
        sequentialLoads: 0,
        avgParallelTime: 0,
        avgSequentialTime: 0,
        speedup: 1,
      });
    });

    it('computes a speedup ratio once both parallel and sequential loads are recorded', async () => {
      loader.stats.parallelLoads = 1;
      loader.stats.parallelTime = 50;
      loader.stats.totalLoads = 1;
      loader.stats.totalTime = 100;

      const stats = loader.getStats();

      expect(stats.avgParallelTime).toBe(50);
      expect(stats.avgSequentialTime).toBe(100);
      expect(stats.speedup).toBe(2);
    });

    it('resetStats zeroes out all counters', async () => {
      await loader.loadDictionariesParallel(dicts(['a']), () => succeed('a'));
      loader.resetStats();
      expect(loader.getStats()).toMatchObject({
        parallelLoads: 0,
        sequentialLoads: 0,
      });
    });
  });

  describe('printStats', () => {
    it('does not throw when logging current stats', async () => {
      await loader.loadDictionariesParallel(dicts(['a']), () => succeed('a'));
      expect(() => loader.printStats()).not.toThrow();
    });
  });
});

describe('loadDictionariesInChunks', () => {
  const dicts = (names) => names.map((name) => ({ name, path: `/dicts/${name}.json` }));

  it('aggregates successful and failed counts across all chunks', async () => {
    const loadFunction = vi.fn((name) =>
      name === 'd' ? Promise.reject(new Error('boom')) : Promise.resolve(name)
    );

    const result = await loadDictionariesInChunks(
      dicts(['a', 'b', 'c', 'd', 'e']),
      loadFunction,
      2
    );

    expect(result.total).toBe(5);
    expect(result.successful).toBe(4);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(5);
  });

  it('loads within a chunk in parallel but processes chunks sequentially', async () => {
    const chunk1Names = ['a', 'b'];
    let chunk1CompletedCount = 0;
    const chunk2CallSnapshots = [];

    const loadFunction = vi.fn((name) => {
      if (!chunk1Names.includes(name)) {
        // Snapshot how many chunk-1 dictionaries had resolved at the moment
        // this chunk-2 dictionary's load was *started*.
        chunk2CallSnapshots.push(chunk1CompletedCount);
      }
      const delay = name === 'a' ? 15 : 1; // 'a' resolves slower than 'b'
      return new Promise((resolve) =>
        setTimeout(() => {
          if (chunk1Names.includes(name)) chunk1CompletedCount++;
          resolve(name);
        }, delay)
      );
    });

    await loadDictionariesInChunks(dicts(['a', 'b', 'c', 'd']), loadFunction, 2);

    // If chunks were flattened into a single Promise.all, 'c'/'d' would be
    // called before 'a' resolves, snapshotting 0 or 1 instead of 2.
    expect(chunk2CallSnapshots).toEqual([2, 2]);
  });

  it('defaults to a chunk size of 3', async () => {
    const loadFunction = vi.fn((name) => Promise.resolve(name));
    const result = await loadDictionariesInChunks(dicts(['a', 'b', 'c', 'd']), loadFunction);
    expect(result.total).toBe(4);
    expect(result.results).toHaveLength(4);
  });
});
