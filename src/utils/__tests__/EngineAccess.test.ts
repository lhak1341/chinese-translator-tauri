import { describe, it, expect, vi } from 'vitest';
import {
  createEngineAccess,
  EngineAccessPreemptedError,
  EngineAccessRefusedError,
  type EngineOwner,
} from '../EngineAccess';
import type { TabId } from '../../types/ComponentTypes';
import type { TranslationEngine } from '../../types/TranslationEngineTypes';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const engine = { isReady: () => true } as unknown as TranslationEngine;

function setup(initialTab: TabId = 'reader') {
  const state = { tab: initialTab, engine: engine as TranslationEngine | null };
  const access = createEngineAccess({
    getEngine: () => state.engine,
    getVisibleTab: () => state.tab,
  });
  /** Records start/finish order and the largest number of calls in flight at once. */
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const call = (owner: EngineOwner, name: string, gate?: Promise<unknown>) =>
    access.run(owner, async () => {
      log.push(`start ${name}`);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate;
      inFlight -= 1;
      log.push(`end ${name}`);
      return name;
    });
  return { state, access, log, call, maxInFlight: () => maxInFlight };
}

describe('EngineAccess — one call at a time', () => {
  it('starts a second call only after the first has settled, across both tabs', async () => {
    const t = setup('reader');
    const first = deferred();
    const a = t.call('reader', 'a', first.promise);
    t.state.tab = 'translator';
    const b = t.call('translator', 'b');
    await settle();

    expect(t.log).toEqual(['start a']);

    first.resolve();
    await Promise.all([a, b]);
    expect(t.log).toEqual(['start a', 'end a', 'start b', 'end b']);
    expect(t.maxInFlight()).toBe(1);
  });

  it('does not let a rejected call block the calls behind it', async () => {
    const t = setup('reader');
    const failed = t.access.run('reader', async () => {
      throw new Error('engine blew up');
    });
    const next = t.call('reader', 'next');

    await expect(failed).rejects.toThrow('engine blew up');
    await expect(next).resolves.toBe('next');
  });

  it('reads the engine when a call runs, not when it was queued', async () => {
    const t = setup('reader');
    const first = deferred();
    const seen: unknown[] = [];
    const newEngine = { isReady: () => true } as unknown as TranslationEngine;
    void t.call('reader', 'a', first.promise);
    const queued = t.access.run('reader', async (e) => void seen.push(e));
    await settle();
    t.state.engine = newEngine;
    first.resolve();
    await queued;

    expect(seen).toEqual([newEngine]);
  });

  it('rejects, rather than throwing, when there is no engine or it is not ready', async () => {
    const t = setup('reader');
    t.state.engine = null;
    await expect(t.call('reader', 'a')).rejects.toThrow('Translation engine is not ready');
    t.state.engine = { isReady: () => false } as unknown as TranslationEngine;
    await expect(t.call('reader', 'b')).rejects.toThrow('Translation engine is not ready');
  });
});

describe('EngineAccess — replacing the engine takes a turn', () => {
  it('starts the swap only once the call in flight has finished', async () => {
    const t = setup('reader');
    const gate = deferred();
    const chunk = t.call('reader', 'chunk', gate.promise);
    const swap = t.access.replace(async () => void t.log.push('swap'));
    await settle();

    expect(t.log).toEqual(['start chunk']);
    gate.resolve();
    await Promise.all([chunk, swap]);
    expect(t.log).toEqual(['start chunk', 'end chunk', 'swap']);
  });

  it('holds back a call made during the swap, which then runs on the replacement', async () => {
    const t = setup('reader');
    const built = deferred();
    const replacement = { isReady: () => true } as unknown as TranslationEngine;
    const swap = t.access.replace(async () => {
      t.state.engine = { isReady: () => false } as unknown as TranslationEngine;
      await built.promise;
      t.state.engine = replacement;
      return 'swapped';
    });
    const seen: unknown[] = [];
    const queued = t.access.run('reader', async (e) => void seen.push(e));
    await settle();

    expect(seen).toEqual([]);
    built.resolve();
    await expect(swap).resolves.toBe('swapped');
    await queued;
    expect(seen).toEqual([replacement]);
  });

  it("cancels either tab's preemptible call rather than waiting for it", async () => {
    const t = setup('translator');
    const stop = deferred();
    const onPreempt = vi.fn(() => stop.reject(new Error('aborted')));
    const doc = t.access.run('translator', async () => stop.promise, { onPreempt });
    await settle();

    const swap = t.access.replace(async () => 'swapped');
    await expect(doc).rejects.toThrow('aborted');
    await expect(swap).resolves.toBe('swapped');
    expect(onPreempt).toHaveBeenCalledTimes(1);
  });

  it('does not let a failed swap block the calls behind it', async () => {
    const t = setup('reader');
    const swap = t.access.replace(async () => {
      throw new Error('init blew up');
    });
    const next = t.call('reader', 'next');

    await expect(swap).rejects.toThrow('init blew up');
    await expect(next).resolves.toBe('next');
  });
});

describe('EngineAccess — ownership follows the visible tab', () => {
  it('refuses a call from a tab that is not on screen, and never runs it', async () => {
    const t = setup('translator');
    const work = vi.fn(async () => 'x');

    await expect(t.access.run('reader', work)).rejects.toBeInstanceOf(EngineAccessRefusedError);
    expect(work).not.toHaveBeenCalled();
  });

  it('lets a call that was queued while its tab was visible run after the tab switches', async () => {
    const t = setup('reader');
    const first = deferred();
    void t.call('reader', 'a', first.promise);
    const queued = t.call('reader', 'b');
    t.state.tab = 'translator';
    first.resolve();

    await expect(queued).resolves.toBe('b');
  });
});

describe('EngineAccess — a preemptible call yields to the other tab', () => {
  /** A document run that stops (rejects) when told to, as the engine does on abort. */
  function documentRun(t: ReturnType<typeof setup>) {
    const stop = deferred();
    const onPreempt = vi.fn(() => stop.reject(new Error('aborted')));
    const run = t.access.run(
      'translator',
      async () => {
        t.log.push('start doc');
        await stop.promise;
      },
      { onPreempt }
    );
    return { run, onPreempt, stop };
  }

  it("cancels the other tab's preemptible call and starts only once the engine has stopped", async () => {
    const t = setup('translator');
    const doc = documentRun(t);
    await settle();
    t.state.tab = 'reader';

    const chunk = t.call('reader', 'chunk');
    await expect(doc.run).rejects.toThrow('aborted');
    await expect(chunk).resolves.toBe('chunk');

    expect(doc.onPreempt).toHaveBeenCalledTimes(1);
    expect(t.log).toEqual(['start doc', 'start chunk', 'end chunk']);
  });

  it('waits for the engine to actually stop, not just for the cancel to be requested', async () => {
    const t = setup('translator');
    const stop = deferred();
    const run = t.access.run('translator', async () => stop.promise, { onPreempt: () => {} });
    await settle();
    t.state.tab = 'reader';

    const chunk = t.call('reader', 'chunk');
    await settle();
    expect(t.log).toEqual([]);

    stop.resolve();
    await run;
    await chunk;
    expect(t.log).toEqual(['start chunk', 'end chunk']);
  });

  it('drains a call that has no onPreempt instead of cancelling it', async () => {
    const t = setup('reader');
    const gate = deferred();
    const chunk = t.call('reader', 'chunk', gate.promise);
    t.state.tab = 'translator';
    const other = t.call('translator', 'gloss');
    await settle();

    expect(t.log).toEqual(['start chunk']);
    gate.resolve();
    await Promise.all([chunk, other]);
    expect(t.log).toEqual(['start chunk', 'end chunk', 'start gloss', 'end gloss']);
  });

  it('skips a preemptible call that was still queued, and rejects it as preempted', async () => {
    const t = setup('reader');
    const gate = deferred();
    void t.call('reader', 'chunk', gate.promise);
    t.state.tab = 'translator';
    const work = vi.fn(async () => 'doc');
    const onPreempt = vi.fn();
    const doc = t.access.run('translator', work, { onPreempt });
    t.state.tab = 'reader';
    const next = t.call('reader', 'next');

    gate.resolve();
    await expect(doc).rejects.toBeInstanceOf(EngineAccessPreemptedError);
    await expect(next).resolves.toBe('next');
    expect(work).not.toHaveBeenCalled();
    expect(onPreempt).toHaveBeenCalledTimes(1);
  });

  it('does not preempt its own tab', async () => {
    const t = setup('translator');
    const stop = deferred();
    const onPreempt = vi.fn();
    const first = t.access.run('translator', async () => stop.promise, { onPreempt });
    const second = t.call('translator', 'second');
    await settle();

    expect(onPreempt).not.toHaveBeenCalled();
    stop.resolve();
    await first;
    await expect(second).resolves.toBe('second');
  });
});
