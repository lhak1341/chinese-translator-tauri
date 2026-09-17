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
 * browser would deliver is dispatched explicitly by the tests that care about it.
 */
function scrollElement(scrollHeight: number, clientHeight: number): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
  element.scrollTop = 0;
  return element;
}

function panel(id: string, element: HTMLElement, rowHeight: number): SyncPanel {
  return { id, scrollRef: { current: element }, metrics: uniformMetrics(rowHeight) };
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

describe('usePanelSync', () => {
  it('writes the followers to the master’s anchor line, in their own heights', () => {
    const master = scrollElement(20_000, 400);
    const follower = scrollElement(9_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        panels: [panel('master', master, 100), panel('follower', follower, 40)],
        lineCount: 200,
        masterId: 'master',
      })
    );

    master.scrollTop = 350; // line 3, fraction 0.5
    result.current.handleScroll('master');
    flushFrame();

    expect(follower.scrollTop).toBe(3 * 40 + 0.5 * 40);
  });

  it('coalesces a burst of scroll events into one frame of writes', () => {
    const master = scrollElement(20_000, 400);
    const follower = scrollElement(9_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        panels: [panel('master', master, 100), panel('follower', follower, 40)],
        lineCount: 200,
        masterId: 'master',
      })
    );

    master.scrollTop = 100;
    result.current.handleScroll('master');
    master.scrollTop = 200;
    result.current.handleScroll('master');
    master.scrollTop = 500;
    result.current.handleScroll('master');
    expect(frames).toHaveLength(1);

    flushFrame();
    // The last position wins — the earlier two never reach the follower at all.
    expect(follower.scrollTop).toBe(5 * 40);
  });

  it('ignores a follower’s echo of the write it was just given', () => {
    const master = scrollElement(20_000, 400);
    const follower = scrollElement(9_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        panels: [panel('master', master, 100), panel('follower', follower, 40)],
        lineCount: 200,
        masterId: 'master',
      })
    );

    master.scrollTop = 350;
    result.current.handleScroll('master');
    flushFrame();

    // The browser now delivers the follower's own scroll event for the write above. If it
    // were treated as a drive, the master would be pulled to the follower's position and
    // the two would walk apart a fraction of a pixel at a time.
    result.current.handleScroll('follower');
    expect(frames).toHaveLength(1); // the latch-release frame only

    flushFrame();
    expect(master.scrollTop).toBe(350);
  });

  it('lets a follower drive once the latch has been released', () => {
    const master = scrollElement(20_000, 400);
    const follower = scrollElement(9_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        panels: [panel('master', master, 100), panel('follower', follower, 40)],
        lineCount: 200,
        masterId: 'master',
      })
    );

    master.scrollTop = 350;
    result.current.handleScroll('master');
    flushFrame();
    flushFrame(); // the release frame clears the latch

    follower.scrollTop = 200; // line 5, fraction 0
    result.current.handleScroll('follower');
    flushFrame();

    expect(master.scrollTop).toBe(5 * 100);
  });

  it('clamps a follower that cannot scroll as far as the master can', () => {
    const master = scrollElement(20_000, 400);
    const follower = scrollElement(1_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        panels: [panel('master', master, 100), panel('follower', follower, 40)],
        lineCount: 200,
        masterId: 'master',
      })
    );

    master.scrollTop = 19_000;
    result.current.handleScroll('master');
    flushFrame();

    expect(follower.scrollTop).toBe(600);
  });

  it('resync re-aligns the followers from the master with no scroll event', () => {
    const master = scrollElement(20_000, 400);
    const follower = scrollElement(9_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        panels: [panel('master', master, 100), panel('follower', follower, 40)],
        lineCount: 200,
        masterId: 'master',
      })
    );

    master.scrollTop = 700;
    result.current.resync();
    flushFrame();

    expect(follower.scrollTop).toBe(7 * 40);
  });

  it('does nothing when a panel has no element yet', () => {
    const follower = scrollElement(9_000, 400);
    const { result } = renderHook(() =>
      usePanelSync({
        panels: [
          { id: 'master', scrollRef: { current: null }, metrics: uniformMetrics(100) },
          panel('follower', follower, 40),
        ],
        lineCount: 200,
        masterId: 'master',
      })
    );

    result.current.handleScroll('master');
    flushFrame();

    expect(follower.scrollTop).toBe(0);
  });
});
