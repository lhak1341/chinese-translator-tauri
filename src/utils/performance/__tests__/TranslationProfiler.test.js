import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger.js', () => ({
  logger: { log: vi.fn(), table: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TranslationProfiler } from '../TranslationProfiler.js';
import { logger } from '../../logger.js';

describe('TranslationProfiler', () => {
  let profiler;

  beforeEach(() => {
    vi.clearAllMocks();
    profiler = new TranslationProfiler();
  });

  it('passes calls through and records nothing while disabled', async () => {
    const asyncResult = await profiler.profile('phrases', async () => 'a');
    const syncResult = profiler.profileSync('phrases', () => 'b');

    expect(asyncResult).toBe('a');
    expect(syncResult).toBe('b');
    expect(profiler.phases.phrases.calls).toBe(0);
    expect(profiler.getReport().enabled).toBe(false);
  });

  it('counts calls per phase once enabled, for async, sync and throwing functions', async () => {
    profiler.enable();
    await profiler.profile('phrases', async () => 1);
    profiler.profileSync('phrases', () => 2);
    await expect(
      profiler.profile('characters', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(profiler.phases.phrases.calls).toBe(2);
    expect(profiler.phases.characters.calls).toBe(1);
  });

  it('reports only phases that ran, largest first, with percentages of the total', () => {
    profiler.enable();
    profiler.recordTime('total', 100);
    profiler.recordTime('phrases', 30);
    profiler.recordTime('characters', 60);

    const report = profiler.getReport();

    expect(report.enabled).toBe(true);
    expect(report.totalTimeMs).toBe('100.00');
    expect(report.phases.map((p) => p.phase)).toEqual([
      'Total Translation',
      'Character Dictionary',
      'Phrase Dictionary',
    ]);
    expect(report.phases[1]).toMatchObject({ timeMs: '60.00', calls: 1, percentage: '60.0%' });
  });

  it('gives no optimisation advice: the table is the report', () => {
    profiler.enable();
    profiler.recordTime('total', 100);
    profiler.recordTime('phrases', 90);

    expect(profiler.getReport()).not.toHaveProperty('recommendations');
    profiler.printReport();
    const printed = logger.log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(printed).not.toMatch(/RECOMMEND|WASM/i);
  });

  it('labels the number phase as JavaScript, since NumberProcessor.js runs it', () => {
    expect(profiler.phases.numbers.name).not.toMatch(/WASM/);
  });

  it('reset clears the counters', () => {
    profiler.enable();
    profiler.recordTime('phrases', 5);
    profiler.reset();

    expect(profiler.phases.phrases).toMatchObject({ time: 0, calls: 0 });
  });
});
