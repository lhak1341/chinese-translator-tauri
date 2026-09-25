import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { act, renderHook } from '@testing-library/react';

/**
 * The virtualizer is mocked to three fixed stand-ins, handed out in the order the hook
 * creates its panels — translation, original, character-only — with uniform row heights
 * so every expected offset is plain arithmetic.
 */
interface FakeVirtualizer {
  totalSize: number;
  measurementsCache: { start: number; size: number }[];
  options: { estimateSize: (index: number) => number };
  getTotalSize: () => number;
  getVirtualItems: () => { index: number; start: number; size: number }[];
  scrollToIndex: ReturnType<typeof vi.fn>;
  measure: ReturnType<typeof vi.fn>;
}

function fakeVirtualizer(rowHeight: number): FakeVirtualizer {
  const virtualizer: FakeVirtualizer = {
    totalSize: 0,
    measurementsCache: Array.from({ length: 200 }, (_, index) => ({
      start: index * rowHeight,
      size: rowHeight,
    })),
    options: { estimateSize: () => rowHeight },
    getTotalSize: () => virtualizer.totalSize,
    getVirtualItems: () => [],
    scrollToIndex: vi.fn(),
    measure: vi.fn(),
  };
  return virtualizer;
}

const pool: FakeVirtualizer[] = [];
let created = 0;

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => pool[created++ % 3],
}));

import { useReaderPanels } from '../useReaderPanels';

function scrollElement(scrollHeight: number, clientHeight: number): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
  element.scrollTop = 0;
  return element;
}

let frames: Array<() => void> = [];
function flushFrame(): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback();
}

beforeEach(() => {
  pool.length = 0;
  pool.push(fakeVirtualizer(100), fakeVirtualizer(40), fakeVirtualizer(60));
  created = 0;
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

function setup() {
  const view = renderHook(() => useReaderPanels({ lineCount: 200, getLine: () => '一二三四五' }));
  const elements = {
    translation: scrollElement(20_000, 400),
    original: scrollElement(8_000, 400),
    characterOnly: scrollElement(12_000, 400),
  };
  const { panels } = view.result.current;
  for (const key of ['translation', 'original', 'characterOnly'] as const) {
    (panels[key].scrollRef as { current: HTMLDivElement | null }).current = elements[key];
  }
  return { view, elements };
}

describe('useReaderPanels', () => {
  it('makes the translation panel the master and the other two followers', () => {
    const { view } = setup();
    const { panels, master, followers } = view.result.current;

    expect(master.scrollRef).toBe(panels.translation.scrollRef);
    expect(followers).toEqual([panels.original.virtualizer, panels.characterOnly.virtualizer]);
    expect(panels.translation).not.toHaveProperty('isFollower');
    expect(panels.original.isFollower).toBe(true);
    expect(panels.characterOnly.isFollower).toBe(true);
  });

  it('keeps both followers on the master’s line, each in its own row heights', () => {
    const { view, elements } = setup();

    elements.translation.scrollTop = 350; // line 3, halfway
    view.result.current.panels.translation.onScroll();
    flushFrame();

    expect(elements.original.scrollTop).toBe(3.5 * 40);
    expect(elements.characterOnly.scrollTop).toBe(3.5 * 60);
  });

  it('resyncs the followers when any panel’s measured size changes, with no scroll', () => {
    // A row measuring in one panel moves every row below it in that panel only.
    const { view, elements } = setup();
    elements.translation.scrollTop = 700;

    pool[1].totalSize = 5_000;
    view.rerender();
    flushFrame();

    expect(elements.original.scrollTop).toBe(7 * 40);
    expect(elements.characterOnly.scrollTop).toBe(7 * 60);
  });

  it('snaps a follower that moved itself back to the master’s line', () => {
    const { view, elements } = setup();
    elements.translation.scrollTop = 350;
    view.result.current.panels.translation.onScroll();
    flushFrame();

    elements.original.scrollTop = 2_000;
    view.result.current.panels.original.onScroll();
    flushFrame();

    expect(elements.translation.scrollTop).toBe(350);
    expect(elements.original.scrollTop).toBe(3.5 * 40);
  });

  it('forwards a wheel over a follower to the master', () => {
    const { view, elements } = setup();

    act(() => {
      view.result.current.panels.original.onWheel({
        deltaY: 120,
      } as React.WheelEvent<HTMLDivElement>);
    });

    expect(elements.translation.scrollTop).toBe(120);
    expect(elements.original.scrollTop).toBe(0);
  });

  it('pages the master by most of a viewport, either way', () => {
    const { view, elements } = setup();

    view.result.current.pageBy(1);
    expect(elements.translation.scrollTop).toBe(360);

    view.result.current.pageBy(-1);
    expect(elements.translation.scrollTop).toBe(0);
  });
});
