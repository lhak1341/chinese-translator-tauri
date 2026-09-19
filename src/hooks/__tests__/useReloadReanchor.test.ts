import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReloadReanchor } from '../useReloadReanchor';
import type { ReadingPosition } from '../../types/ReaderTypes';

// jsdom has no layout: `clientHeight` is always 0, which `tryRestorePosition` reads as
// "not laid out yet" and refuses to act on. Stub it, per src/components/CLAUDE.md.
function makeScrollElement(): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientHeight', { value: 800, configurable: true });
  return element;
}

function makeVirtualizer() {
  return {
    scrollToIndex: vi.fn(),
    getVirtualItems: () => [{ index: 120, start: 4000, size: 40 }],
  };
}

// requestAnimationFrame is driven by hand rather than by fake timers: the hook's loop is
// one frame deep, so a queue of pending callbacks is enough and makes "how many frames
// have passed" the thing each test states.
let frames: FrameRequestCallback[] = [];
let now = 0;

function runFrame(): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(now);
}

beforeEach(() => {
  frames = [];
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => {
    frames = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface Props {
  engineVersion: number;
  isEnabled: boolean;
  isRefilling: boolean;
}

function setup(anchor: ReadingPosition | null = { line: 120, fraction: 0.25 }) {
  const scrollElement = makeScrollElement();
  const virtualizer = makeVirtualizer();
  const anchorRef = { current: anchor };
  const scrollRef = { current: scrollElement as HTMLElement | null };

  const view = renderHook(
    ({ engineVersion, isEnabled, isRefilling }: Props) =>
      useReloadReanchor({
        engineVersion,
        isEnabled,
        isRefilling,
        anchorRef,
        scrollRef,
        virtualizer,
        lineCount: 75_000,
      }),
    { initialProps: { engineVersion: 1, isEnabled: true, isRefilling: false } }
  );

  /** The reload landing, with the refill already under way unless told otherwise. */
  const reload = (isRefilling = true): void =>
    view.rerender({ engineVersion: 2, isEnabled: true, isRefilling });

  return { view, reload, virtualizer, scrollElement, anchorRef };
}

describe('useReloadReanchor', () => {
  it('does nothing while no reload has landed', () => {
    const { virtualizer } = setup();
    runFrame();
    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('scrolls back to the captured anchor when the engine version bumps', () => {
    const { virtualizer, scrollElement, reload } = setup();

    reload();

    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(120, { align: 'start' });
    // The sub-line fraction is applied on top of the line, not rounded away — 25% into a
    // 40px row.
    expect(scrollElement.scrollTop).toBe(10);
  });

  it('keeps re-applying across frames, because the refill keeps moving rows', () => {
    const { virtualizer, reload } = setup();

    reload();
    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);

    runFrame();
    runFrame();

    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(3);
  });

  it('keeps re-anchoring for as long as the refill runs, past any fixed window', () => {
    // Why the loop settles on the refill rather than on a stopwatch: a wide band or a slow
    // engine outlived the old three-second window, and every chunk that landed after it
    // closed moved the line under the reader with nothing left to correct it.
    const { virtualizer, reload } = setup();
    reload();
    virtualizer.scrollToIndex.mockClear();

    now += 10_000;
    runFrame();

    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('stops once the refill has been quiet long enough', () => {
    const { view, virtualizer, reload } = setup();
    reload();

    view.rerender({ engineVersion: 2, isEnabled: true, isRefilling: false });
    runFrame();
    virtualizer.scrollToIndex.mockClear();

    now += 251;
    runFrame();
    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();

    // And it really has stopped: no further frame was queued.
    runFrame();
    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('does not mistake a refill that has not started yet for one that has finished', () => {
    // The anchor is captured when the engine version bumps, which is before the fill effect
    // has re-planned anything. Believing that quiet would close the window before the
    // refill that moves the rows had even begun.
    const { virtualizer, reload } = setup();
    reload(false);

    now += 251;
    runFrame();
    virtualizer.scrollToIndex.mockClear();
    runFrame();

    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('gives up on a refill that never starts, once the grace period is over', () => {
    const { virtualizer, reload } = setup();
    reload(false);

    now += 1501;
    runFrame();
    virtualizer.scrollToIndex.mockClear();
    runFrame();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('stops at the ceiling even if the refill never settles', () => {
    const { virtualizer, reload } = setup();
    reload();

    now += 15_001;
    runFrame();
    virtualizer.scrollToIndex.mockClear();
    runFrame();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it.each(['wheel', 'pointerdown'])('hands the position back on %s', (eventType) => {
    const { virtualizer, reload } = setup();
    reload();
    virtualizer.scrollToIndex.mockClear();

    window.dispatchEvent(new Event(eventType));
    runFrame();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('hands the position back on a navigation key', () => {
    const { virtualizer, reload } = setup();
    reload();
    virtualizer.scrollToIndex.mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ']' }));
    runFrame();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('keeps going when only a modifier is pressed', () => {
    const { virtualizer, reload } = setup();
    reload();
    virtualizer.scrollToIndex.mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    runFrame();

    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way while the Reader is a background tab', () => {
    const { view, virtualizer } = setup();

    view.rerender({ engineVersion: 2, isEnabled: false, isRefilling: true });
    runFrame();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('does nothing when there is no anchor yet', () => {
    const { virtualizer, reload } = setup(null);

    reload();
    runFrame();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });

  it('cancels its loop on unmount', () => {
    const { view, virtualizer, reload } = setup();
    reload();
    virtualizer.scrollToIndex.mockClear();

    view.unmount();
    runFrame();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });
});
