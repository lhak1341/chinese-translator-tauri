import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReadingAnchor,
  computeAnchor,
  tryRestorePosition,
  type AnchorVirtualizer,
  type RestoreTarget,
} from '../ReadingAnchor';
import type { ReadingPosition } from '../../../types/ReaderTypes';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('computeAnchor', () => {
  it('picks the item whose start is at or before scrollTop, closest to it', () => {
    const items = [
      { index: 0, start: 0, size: 30 },
      { index: 1, start: 30, size: 30 },
      { index: 2, start: 60, size: 30 },
    ];
    expect(computeAnchor(45, items)).toEqual({ line: 1, fraction: 0.5 });
  });

  it('returns fraction 0 when scrollTop lands exactly on an item start', () => {
    const items = [
      { index: 0, start: 0, size: 30 },
      { index: 1, start: 30, size: 30 },
    ];
    expect(computeAnchor(30, items)).toEqual({ line: 1, fraction: 0 });
  });

  it('falls back to the first item when scrollTop is before every item start', () => {
    const items = [{ index: 5, start: 100, size: 30 }];
    expect(computeAnchor(0, items)).toEqual({ line: 5, fraction: 0 });
  });

  it('returns null for an empty viewport', () => {
    expect(computeAnchor(0, [])).toBeNull();
  });
});

describe('tryRestorePosition', () => {
  function makeTarget(items: { index: number; start: number; size: number }[]): {
    target: RestoreTarget;
    scrollToIndex: ReturnType<typeof vi.fn>;
  } {
    const scrollToIndex = vi.fn();
    return { scrollToIndex, target: { scrollToIndex, getVirtualItems: () => items } };
  }

  it('returns false (retry) when the scroll element has no layout yet', () => {
    const { target } = makeTarget([]);
    const el = { clientHeight: 0 } as HTMLElement;
    expect(tryRestorePosition(el, target, 100, { line: 5, fraction: 0 })).toBe(false);
  });

  it('returns false when there is no scroll element at all', () => {
    const { target } = makeTarget([]);
    expect(tryRestorePosition(null, target, 100, { line: 5, fraction: 0 })).toBe(false);
  });

  it('is a no-op success for an empty book', () => {
    const { target, scrollToIndex } = makeTarget([]);
    const el = { clientHeight: 400, scrollTop: 0 } as HTMLElement;
    expect(tryRestorePosition(el, target, 0, { line: 0, fraction: 0 })).toBe(true);
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it('clamps the target line to the book length', () => {
    const { target, scrollToIndex } = makeTarget([]);
    const el = { clientHeight: 400, scrollTop: 0 } as HTMLElement;
    tryRestorePosition(el, target, 10, { line: 999, fraction: 0 });
    expect(scrollToIndex).toHaveBeenCalledWith(9, { align: 'start' });
  });

  it('scrolls to the line and nudges by the fraction once the row is measured', () => {
    const { target } = makeTarget([{ index: 5, start: 150, size: 40 }]);
    const el = { clientHeight: 400, scrollTop: 150 } as HTMLElement;
    tryRestorePosition(el, target, 100, { line: 5, fraction: 0.5 });
    expect(el.scrollTop).toBe(150 + 0.5 * 40);
  });

  it('leaves scrollTop alone when the row has not been measured yet', () => {
    const { target } = makeTarget([]);
    const el = { clientHeight: 400, scrollTop: 150 } as HTMLElement;
    tryRestorePosition(el, target, 100, { line: 5, fraction: 0.5 });
    expect(el.scrollTop).toBe(150);
  });
});

// ── The module ───────────────────────────────────────────────────────────────

interface Row {
  index: number;
  start: number;
  size: number;
}

/** One clock for `now`, debounce timers and animation frames, advanced by hand so each
 * test states exactly how much time and how many frames have passed. */
function makeEnvironment() {
  let now = 1_000_000;
  let nextId = 1;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  let frames: { id: number; fn: () => void }[] = [];

  const env = {
    now: () => now,
    timers: {
      set: (fn: () => void, ms: number): number => {
        const id = nextId++;
        timers.push({ id, at: now + ms, fn });
        return id;
      },
      clear: (id: unknown): void => {
        timers = timers.filter((timer) => timer.id !== id);
      },
    },
    frames: {
      request: (fn: () => void): number => {
        const id = nextId++;
        frames.push({ id, fn });
        return id;
      },
      cancel: (id: number): void => {
        frames = frames.filter((frame) => frame.id !== id);
      },
    },
  };

  /** Move the clock; fires every debounce timer that comes due. Frames do not run. */
  const advance = (ms: number): void => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now);
    timers = timers.filter((timer) => timer.at > now);
    for (const timer of due) timer.fn();
  };
  /** Run every frame queued so far — the ones they queue wait for the next call. */
  const runFrame = (): void => {
    const queued = frames;
    frames = [];
    for (const frame of queued) frame.fn();
  };
  const pendingFrames = (): number => frames.length;

  return { env, advance, runFrame, pendingFrames };
}

function makeVirtualizer(rows: Row[] = []): AnchorVirtualizer & {
  rows: Row[];
  scrollToIndex: ReturnType<typeof vi.fn>;
  measure: ReturnType<typeof vi.fn>;
} {
  const virtualizer = {
    rows,
    scrollToIndex: vi.fn(),
    measure: vi.fn(),
    getVirtualItems: () => virtualizer.rows,
  };
  return virtualizer;
}

/** Evenly sized rows `from..to`, each `size` px tall. */
function rowsBetween(from: number, to: number, size = 40): Row[] {
  const rows: Row[] = [];
  for (let index = from; index <= to; index += 1) rows.push({ index, start: index * size, size });
  return rows;
}

function setup(
  options: {
    rows?: Row[];
    clientHeight?: number;
    lineCount?: number;
    isActive?: boolean;
    initialPosition?: ReadingPosition | null;
  } = {}
) {
  const environment = makeEnvironment();
  const persist = vi.fn((_fingerprint: string, _position: ReadingPosition) => Promise.resolve());
  const scrollEl = { clientHeight: options.clientHeight ?? 800, scrollTop: 0 } as HTMLElement;
  const master = makeVirtualizer(options.rows ?? rowsBetween(0, 40));
  const followers = [{ measure: vi.fn() }, { measure: vi.fn() }];
  const refill = { value: false };

  const anchor = new ReadingAnchor({
    persist,
    now: environment.env.now,
    timers: environment.env.timers,
    frames: environment.env.frames,
  });
  anchor.setInputs({
    master: { scrollRef: { current: scrollEl }, virtualizer: master },
    followers,
    lineCount: options.lineCount ?? 75_000,
    isRefilling: () => refill.value,
  });
  anchor.open('fp1', options.initialPosition ?? null);
  anchor.setActive(options.isActive ?? true);

  const scrollTo = (scrollTop: number): void => {
    scrollEl.scrollTop = scrollTop;
    anchor.onScroll();
  };

  return { ...environment, anchor, persist, scrollEl, master, followers, refill, scrollTo };
}

describe('ReadingAnchor — measuring', () => {
  it('publishes the anchor line and the viewport line count from a scroll', () => {
    const { anchor, scrollTo } = setup({ clientHeight: 400 });

    scrollTo(130);

    // 130px into 40px rows: line 3. A 400px viewport touches lines 3-13.
    expect(anchor.getSnapshot()).toEqual({ anchorLine: 3, viewportLines: 11 });
    expect(anchor.readLine()).toBe(3);
  });

  it('notifies subscribers only when the snapshot actually changes', () => {
    const { anchor, scrollTo } = setup({ clientHeight: 400 });
    const listener = vi.fn();
    anchor.subscribe(listener);

    scrollTo(130);
    scrollTo(135);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('measures on a range change without persisting it', () => {
    const { anchor, scrollEl, advance, persist } = setup();

    scrollEl.scrollTop = 200;
    anchor.onRangeChange();
    advance(2000);

    expect(anchor.getSnapshot().anchorLine).toBe(5);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('ReadingAnchor — persistence', () => {
  it('debounces writes: several scrolls within the window coalesce into one', () => {
    const { persist, scrollTo, advance } = setup();

    scrollTo(10);
    advance(500);
    scrollTo(20);
    expect(persist).not.toHaveBeenCalled();

    advance(1500);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('fp1', { line: 0, fraction: 20 / 40 });
  });

  it('flushes at once when the Reader stops being the visible tab', () => {
    const { anchor, persist, scrollTo } = setup();

    scrollTo(15);
    anchor.setActive(false);

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('flushes on close, under the book being closed', () => {
    const { anchor, persist, scrollTo } = setup();

    scrollTo(15);
    anchor.close();
    anchor.open('fp2', null);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('fp1', expect.anything());
  });

  it('flushes on demand — the app-exit path', async () => {
    const { anchor, persist, scrollTo } = setup();

    scrollTo(15);
    await anchor.flush();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the reader never scrolled', () => {
    const { anchor, persist, advance } = setup();

    advance(5000);
    anchor.close();

    expect(persist).not.toHaveBeenCalled();
  });

  it('survives a failed write', async () => {
    const { anchor, persist, scrollTo } = setup();
    persist.mockRejectedValueOnce(new Error('disk full'));

    scrollTo(15);

    await expect(anchor.flush()).resolves.toBeUndefined();
  });
});

describe('ReadingAnchor — jumps', () => {
  it('scrolls the master to the line and makes it the anchor at once', () => {
    const { anchor, master } = setup();

    anchor.scrollToLine(4200);

    expect(master.scrollToIndex).toHaveBeenCalledWith(4200, { align: 'start' });
    expect(anchor.getSnapshot().anchorLine).toBe(4200);
    expect(anchor.readLine()).toBe(4200);
  });

  it('persists the line jumped to, even with no scroll afterwards', () => {
    const { anchor, persist, advance } = setup();

    anchor.scrollToLine(4200);
    advance(1500);

    expect(persist).toHaveBeenCalledWith('fp1', { line: 4200, fraction: 0 });
  });

  it("neither publishes nor persists the jump's settling scroll", () => {
    // Rows the virtualizer had only estimated get measured once the jump renders, so the
    // settling scroll resolves to a line *before* the one jumped to. Before this module,
    // the anchor shown ignored that scroll but the position written to disk did not.
    const { anchor, persist, master, scrollEl, advance } = setup({
      rows: [
        { index: 4199, start: 167_900, size: 60 },
        { index: 4200, start: 167_960, size: 40 },
      ],
    });

    anchor.scrollToLine(4200);
    scrollEl.scrollTop = 167_950;
    anchor.onScroll();
    advance(1500);

    expect(anchor.getSnapshot().anchorLine).toBe(4200);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('fp1', { line: 4200, fraction: 0 });
  });

  it('skips exactly one measurement after a jump', () => {
    const { anchor, scrollTo } = setup();

    anchor.scrollToLine(30);
    scrollTo(0);
    scrollTo(200);

    expect(anchor.getSnapshot().anchorLine).toBe(5);
  });
});

describe('ReadingAnchor — restore on open', () => {
  it('restores the saved position on the next frame', () => {
    const { master, runFrame } = setup({ initialPosition: { line: 42, fraction: 0.25 } });

    expect(master.scrollToIndex).not.toHaveBeenCalled();
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledWith(42, { align: 'start' });
  });

  it('keeps retrying each frame while the panel has no layout yet', () => {
    const { master, scrollEl, runFrame } = setup({
      clientHeight: 0,
      initialPosition: { line: 42, fraction: 0 },
    });

    runFrame();
    runFrame();
    expect(master.scrollToIndex).not.toHaveBeenCalled();

    Object.assign(scrollEl, { clientHeight: 800 });
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledWith(42, { align: 'start' });
  });

  it('gives up after a bounded number of frames', () => {
    const { master, runFrame, pendingFrames } = setup({
      clientHeight: 0,
      initialPosition: { line: 42, fraction: 0 },
    });

    for (let frame = 0; frame < 20; frame += 1) runFrame();

    expect(pendingFrames()).toBe(0);
    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('does nothing for a book never opened before', () => {
    const { master, runFrame } = setup({ initialPosition: null });
    runFrame();
    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('does not save a scroll that lands before the restore has: the saved position survives', () => {
    const { persist, scrollTo, advance, anchor } = setup({
      initialPosition: { line: 42, fraction: 0.25 },
    });

    scrollTo(0); // a scroll event from the first layout, before the restore frame runs
    advance(2000);
    void anchor.flush();

    expect(persist).not.toHaveBeenCalled();
  });

  it("does not save the restore's own scroll event, which reads the estimated rows", () => {
    const { persist, scrollTo, advance, anchor, runFrame } = setup({
      initialPosition: { line: 42, fraction: 0.25 },
    });

    runFrame(); // the restore lands
    scrollTo(0); // its scroll event; the rows are still estimates, so this reads line 0
    advance(2000);
    void anchor.flush();

    expect(persist).not.toHaveBeenCalled();
    expect(anchor.readLine()).toBe(42);
  });

  it("saves the reader's own scrolling once the restore has settled", () => {
    const { persist, scrollTo, advance, runFrame } = setup({
      initialPosition: { line: 42, fraction: 0.25 },
    });

    runFrame();
    scrollTo(0); // the restore's own event, skipped
    scrollTo(400); // the reader
    advance(2000);

    expect(persist).toHaveBeenCalledWith('fp1', { line: 10, fraction: 0 });
  });

  it('saves again if the restore never lands, so an unrestorable book is not frozen', () => {
    const { persist, scrollTo, advance, runFrame } = setup({
      clientHeight: 0,
      initialPosition: { line: 42, fraction: 0 },
    });

    for (let frame = 0; frame < 20; frame += 1) runFrame();
    scrollTo(400);
    advance(2000);

    expect(persist).toHaveBeenCalledWith('fp1', { line: 10, fraction: 0 });
  });

  it('cancels a pending restore on close', () => {
    const { anchor, master, runFrame } = setup({ initialPosition: { line: 42, fraction: 0 } });
    anchor.close();
    runFrame();
    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });
});

describe('ReadingAnchor — re-anchor after a dictionary reload', () => {
  /** An anchor 25% into line 120, with the reader since scrolled elsewhere by nothing. */
  function reloadSetup() {
    const context = setup({ rows: [{ index: 120, start: 4000, size: 40 }] });
    context.scrollTo(4010);
    context.master.scrollToIndex.mockClear();
    // The restore moves the reader off the row; put them back somewhere else so each frame
    // has something to correct.
    context.scrollEl.scrollTop = 0;
    return context;
  }

  it('does nothing while no reload has landed', () => {
    const { master, runFrame } = reloadSetup();
    runFrame();
    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('scrolls back to the captured anchor when the reload lands', () => {
    const { anchor, master, scrollEl, refill } = reloadSetup();
    refill.value = true;

    anchor.engineReloaded();

    expect(master.scrollToIndex).toHaveBeenCalledWith(120, { align: 'start' });
    // The fraction is applied on top of the line: 25% into a 40px row.
    expect(scrollEl.scrollTop).toBe(10);
  });

  it('keeps re-applying across frames, because the refill keeps moving rows', () => {
    const { anchor, master, scrollEl, refill, runFrame } = reloadSetup();
    refill.value = true;

    anchor.engineReloaded();
    scrollEl.scrollTop = 0;
    runFrame();
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledTimes(3);
  });

  it('keeps re-anchoring for as long as the refill runs, past any fixed window', () => {
    const { anchor, master, scrollEl, refill, runFrame, advance } = reloadSetup();
    refill.value = true;
    anchor.engineReloaded();
    master.scrollToIndex.mockClear();

    advance(10_000);
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('stops once the refill has been quiet long enough', () => {
    const { anchor, master, scrollEl, refill, runFrame, advance, pendingFrames } = reloadSetup();
    refill.value = true;
    anchor.engineReloaded();

    refill.value = false;
    runFrame();
    master.scrollToIndex.mockClear();

    advance(251);
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).not.toHaveBeenCalled();
    expect(pendingFrames()).toBe(0);
  });

  it('does not mistake a refill that has not started yet for one that has finished', () => {
    const { anchor, master, scrollEl, runFrame, advance } = reloadSetup();
    anchor.engineReloaded();

    advance(251);
    runFrame();
    master.scrollToIndex.mockClear();
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('gives up on a refill that never starts, once the grace period is over', () => {
    const { anchor, master, scrollEl, runFrame, advance } = reloadSetup();
    anchor.engineReloaded();

    advance(1501);
    runFrame();
    master.scrollToIndex.mockClear();
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('stops at the ceiling even if the refill never settles', () => {
    const { anchor, master, scrollEl, refill, runFrame, advance } = reloadSetup();
    refill.value = true;
    anchor.engineReloaded();

    advance(15_001);
    runFrame();
    master.scrollToIndex.mockClear();
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it.each(['wheel', 'pointerdown'])('hands the position back on %s', (type) => {
    const { anchor, master, scrollEl, refill, runFrame } = reloadSetup();
    refill.value = true;
    anchor.engineReloaded();
    master.scrollToIndex.mockClear();

    anchor.userInput({ type });
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('hands the position back on a navigation key', () => {
    const { anchor, master, scrollEl, refill, runFrame } = reloadSetup();
    refill.value = true;
    anchor.engineReloaded();
    master.scrollToIndex.mockClear();

    anchor.userInput({ type: 'keydown', key: ']' });
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('keeps going when only a modifier is pressed', () => {
    const { anchor, master, scrollEl, refill, runFrame } = reloadSetup();
    refill.value = true;
    anchor.engineReloaded();
    master.scrollToIndex.mockClear();

    anchor.userInput({ type: 'keydown', key: 'Shift' });
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no anchor yet', () => {
    const { anchor, master, runFrame, refill } = setup();
    refill.value = true;

    anchor.engineReloaded();
    runFrame();

    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('cancels its loop on close', () => {
    const { anchor, master, scrollEl, refill, runFrame } = reloadSetup();
    refill.value = true;
    anchor.engineReloaded();
    master.scrollToIndex.mockClear();

    anchor.close();
    scrollEl.scrollTop = 0;
    runFrame();

    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('waits for the Reader to be visible when the reload came from another tab', () => {
    // A reload from the Translator lands while the Reader is hidden, and the refill that
    // moves its rows only starts once it is shown again — so that is when to re-anchor.
    const { anchor, master, refill, runFrame } = reloadSetup();
    anchor.setActive(false);
    refill.value = true;

    anchor.engineReloaded();
    runFrame();
    expect(master.scrollToIndex).not.toHaveBeenCalled();

    anchor.setActive(true);

    expect(master.scrollToIndex).toHaveBeenCalledWith(120, { align: 'start' });
  });
});

describe('ReadingAnchor — frames that need no correction', () => {
  /** Line 120 starts at the reader's scroll offset: the anchor is exactly in place. */
  function settledSetup(fraction = 0) {
    const context = setup({ rows: [{ index: 120, start: 0, size: 40 }] });
    context.scrollTo(fraction * 40);
    context.scrollEl.scrollTop = 0;
    context.refill.value = true;
    return context;
  }

  it('does not write when the reader is already on the captured anchor', () => {
    const { anchor, master } = settledSetup();
    anchor.engineReloaded();
    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('stays quiet across many frames while nothing moves', () => {
    const { anchor, master, runFrame } = settledSetup();
    anchor.engineReloaded();
    for (let frame = 0; frame < 30; frame += 1) runFrame();
    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('corrects as soon as a landed chunk moves the rows under the reader', () => {
    const { anchor, master, runFrame } = settledSetup();
    anchor.engineReloaded();
    runFrame();
    expect(master.scrollToIndex).not.toHaveBeenCalled();

    master.rows = [{ index: 120, start: 600, size: 40 }];
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledWith(120, { align: 'start' });
  });

  it('still corrects a fraction that has drifted, not just a changed line', () => {
    const { anchor, master } = settledSetup(0.25);
    anchor.engineReloaded();
    expect(master.scrollToIndex).toHaveBeenCalledTimes(1);
  });
});

describe('ReadingAnchor — relayout after an Appearance change', () => {
  function relayoutSetup() {
    const context = setup({ rows: rowsBetween(4190, 4230) });
    context.scrollTo(4200 * 40);
    context.master.scrollToIndex.mockClear();
    return context;
  }

  it("throws away every panel's measurement cache", () => {
    const { anchor, master, followers } = relayoutSetup();

    anchor.appearanceChanged();

    expect(master.measure).toHaveBeenCalledTimes(1);
    expect(followers[0].measure).toHaveBeenCalledTimes(1);
    expect(followers[1].measure).toHaveBeenCalledTimes(1);
  });

  it('puts the reader back on their line, on the master, one frame later', () => {
    const { anchor, master, runFrame } = relayoutSetup();

    anchor.appearanceChanged();
    expect(master.scrollToIndex).not.toHaveBeenCalled();
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledWith(4200, { align: 'start' });
  });

  it('still re-measures when there is no anchor yet, but restores nothing', () => {
    const { anchor, master, runFrame } = setup();

    anchor.appearanceChanged();
    runFrame();

    expect(master.measure).toHaveBeenCalledTimes(1);
    expect(master.scrollToIndex).not.toHaveBeenCalled();
  });

  it('relayouts on return when the change happened while the Reader was hidden', () => {
    // Appearance is its own tab, so the Reader is always hidden when a font changes. A
    // hidden panel measures every row as zero-height, so the work waits for the return.
    const { anchor, master, followers, runFrame } = relayoutSetup();
    anchor.setActive(false);

    anchor.appearanceChanged();
    runFrame();
    expect(master.measure).not.toHaveBeenCalled();

    anchor.setActive(true);
    expect(master.measure).toHaveBeenCalledTimes(1);
    expect(followers[0].measure).toHaveBeenCalledTimes(1);
    runFrame();

    expect(master.scrollToIndex).toHaveBeenCalledWith(4200, { align: 'start' });
  });

  it('relayouts once, then re-anchors through the refill, when both happened while hidden', () => {
    const { anchor, master, scrollEl, refill, runFrame } = relayoutSetup();
    anchor.setActive(false);
    anchor.appearanceChanged();
    anchor.engineReloaded();
    refill.value = true;

    scrollEl.scrollTop = 0;
    anchor.setActive(true);

    expect(master.measure).toHaveBeenCalledTimes(1);
    // The loop's first step runs at once; a separate one-shot restore would be redundant.
    expect(master.scrollToIndex).toHaveBeenCalledTimes(1);
    scrollEl.scrollTop = 0;
    runFrame();
    expect(master.scrollToIndex).toHaveBeenCalledTimes(2);
  });

  it('forgets deferred work when the book closes', () => {
    const { anchor, master } = relayoutSetup();
    anchor.setActive(false);
    anchor.appearanceChanged();

    anchor.close();
    anchor.open('fp2', null);
    anchor.setActive(true);

    expect(master.measure).not.toHaveBeenCalled();
  });
});
