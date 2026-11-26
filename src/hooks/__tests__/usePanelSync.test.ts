import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePanelSync } from '../usePanelSync';
import type { SyncPanel } from '../usePanelSync';
import type { RowMetrics } from '../../utils/reader/PanelSync';

/** Rows of a uniform height, so an expected offset is easy to state in the test. */
function uniformMetrics(rowHeight: number): RowMetrics {
  return { start: (index) => index * rowHeight, size: () => rowHeight };
}

/**
 * A stand-in for a scroll element. jsdom gives `scrollHeight` and `clientHeight` as 0 and
 * never fires a scroll event of its own, so both are supplied here — the echo a real
 * browser would deliver is delivered explicitly by the tests that care about it.
 */
function scrollElement(scrollHeight: number, clientHeight: number): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
  element.scrollTop = 0;
  return element;
}

function panel(element: HTMLElement | null, rowHeight: number): SyncPanel {
  return { scrollRef: { current: element }, metrics: uniformMetrics(rowHeight) };
}

let frames: Array<() => void> = [];

/** Run every frame callback queued so far, exactly once. */
function flushFrame(): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback();
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A 100px-row master and one 40px-row follower. */
function setup(followerScrollHeight = 9_000) {
  const master = scrollElement(20_000, 400);
  const follower = scrollElement(followerScrollHeight, 400);
  const { result } = renderHook(() =>
    usePanelSync({
      master: panel(master, 100),
      followers: [panel(follower, 40)],
      lineCount: 200,
    })
  );
  return { master, follower, sync: result };
}

describe('usePanelSync', () => {
  it('writes the followers to the master’s anchor line, in their own heights', () => {
    const { master, follower, sync } = setup();

    master.scrollTop = 350; // line 3, fraction 0.5
    sync.current.onMasterScroll();
    flushFrame();

    expect(follower.scrollTop).toBe(3 * 40 + 0.5 * 40);
  });

  it('coalesces a burst of master scroll events into one frame of writes', () => {
    const { master, follower, sync } = setup();

    master.scrollTop = 100;
    sync.current.onMasterScroll();
    master.scrollTop = 200;
    sync.current.onMasterScroll();
    master.scrollTop = 500;
    sync.current.onMasterScroll();
    expect(frames).toHaveLength(1);

    flushFrame();
    // The last position wins — the earlier two never reach the follower at all.
    expect(follower.scrollTop).toBe(5 * 40);
  });

  it('ignores a follower’s echo of the write it was just given', () => {
    const { master, sync } = setup();

    master.scrollTop = 350;
    sync.current.onMasterScroll();
    flushFrame();

    // The browser now delivers the follower's own scroll event for the write above.
    sync.current.onFollowerScroll(0);

    expect(frames).toHaveLength(0);
    expect(master.scrollTop).toBe(350);
  });

  it('snaps a follower that scrolled itself back level with the master', () => {
    // Followers are `overflow: hidden`, but Tab focus or a selection drag can still move
    // one. It must never drive the master — it is pulled back instead.
    const { master, follower, sync } = setup();
    master.scrollTop = 350;
    sync.current.onMasterScroll();
    flushFrame();

    follower.scrollTop = 1_000;
    sync.current.onFollowerScroll(0);
    flushFrame();

    expect(master.scrollTop).toBe(350);
    expect(follower.scrollTop).toBe(3 * 40 + 0.5 * 40);
  });

  it('snaps back a follower moved before the sync ever wrote it', () => {
    const { follower, sync } = setup();

    follower.scrollTop = 400;
    sync.current.onFollowerScroll(0);
    flushFrame();

    expect(follower.scrollTop).toBe(0);
  });

  it('never writes the master', () => {
    const { master, follower, sync } = setup();
    master.scrollTop = 350;

    follower.scrollTop = 800;
    sync.current.onFollowerScroll(0);
    flushFrame();

    expect(master.scrollTop).toBe(350);
  });

  it('clamps a follower that cannot scroll as far as the master can', () => {
    const { master, follower, sync } = setup(1_000);

    master.scrollTop = 19_000;
    sync.current.onMasterScroll();
    flushFrame();

    expect(follower.scrollTop).toBe(600);
  });

  it('resync re-aligns the followers from the master with no scroll event', () => {
    const { master, follower, sync } = setup();

    master.scrollTop = 700;
    sync.current.resync();
    flushFrame();

    expect(follower.scrollTop).toBe(7 * 40);
  });

  it('does nothing when the master has no element yet', () => {
    const follower = scrollElement(9_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        master: panel(null, 100),
        followers: [panel(follower, 40)],
        lineCount: 200,
      })
    );

    result.current.onMasterScroll();
    flushFrame();

    expect(follower.scrollTop).toBe(0);
  });
});
