import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVirtualScrollRange } from '../useVirtualScrollRange';

const ITEM_H = 40;

type Options = Parameters<typeof useVirtualScrollRange>[1];

function makeOptions(overrides: Partial<Options> = {}): Options {
  return { itemHeight: ITEM_H, ...overrides };
}

/** A scroll event reading `scrollTop`, as `handleScroll` takes it. */
function scrollEvent(scrollTop: number): React.UIEvent<HTMLDivElement> {
  return { currentTarget: { scrollTop } } as React.UIEvent<HTMLDivElement>;
}

/** A `ResizeObserver` the test can fire by hand; `scrollRefCallback` builds one per node. */
function stubResizeObserver() {
  const instances: { disconnect: ReturnType<typeof vi.fn>; fire: (height: number) => void }[] = [];
  class FakeResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      instances.push({
        disconnect: this.disconnect,
        fire: (height) =>
          this.callback([{ contentRect: { height } } as ResizeObserverEntry], {} as ResizeObserver),
      });
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return instances;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── visibleRange ────────────────────────────────────────────────────────────

describe('visibleRange', () => {
  it('renders first buffer+visible items when scrolled to top', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    const { startIndex, endIndex, visibleCount } = result.current.visibleRange;
    expect(startIndex).toBe(0);
    // 600px container / 40px = 15 visible, +10 buffer*2=20 → 35
    expect(endIndex).toBe(35);
    expect(visibleCount).toBe(15);
  });

  it('clamps startIndex when totalItems is 0', () => {
    const { result } = renderHook(() => useVirtualScrollRange(0, makeOptions()));
    expect(result.current.visibleRange.startIndex).toBe(0);
    expect(result.current.visibleRange.endIndex).toBe(0);
  });

  it('keeps a fixed 10-row overscan above and below once scrolled', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    act(() => result.current.handleScroll(scrollEvent(40 * 50)));
    const { firstVisibleIndex, startIndex, endIndex } = result.current.visibleRange;
    expect(firstVisibleIndex).toBe(50);
    expect(startIndex).toBe(40);
    // 15 visible + 10 above + 10 below, counted from startIndex: 40 + 15 + 20
    expect(endIndex).toBe(75);
  });
});

// ─── handleScroll ─────────────────────────────────────────────────────────────

describe('handleScroll', () => {
  it('moves the range to the row at the top of the viewport', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    act(() => result.current.handleScroll(scrollEvent(800)));
    expect(result.current.visibleRange.firstVisibleIndex).toBe(20);
    expect(result.current.visibleRange.startIndex).toBe(10);
  });

  it('snaps to the row boundary, so a sub-row scroll does not move the range', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    act(() => result.current.handleScroll(scrollEvent(800)));
    const before = result.current.visibleRange;

    act(() => result.current.handleScroll(scrollEvent(800 + ITEM_H - 1)));

    // Same state value, so the memoised range is the very same object: no re-render of the table.
    expect(result.current.visibleRange).toBe(before);
  });
});

// ─── resetKey ────────────────────────────────────────────────────────────────

describe('resetKey', () => {
  function mountScrolled(initialKey: string) {
    const instances = stubResizeObserver();
    const hook = renderHook(
      ({ resetKey }: { resetKey: string }) => useVirtualScrollRange(200, makeOptions({ resetKey })),
      { initialProps: { resetKey: initialKey } }
    );
    const node = { scrollTop: 0 } as HTMLDivElement;
    act(() => hook.result.current.scrollRefCallback(node));
    act(() => hook.result.current.handleScroll(scrollEvent(800)));
    node.scrollTop = 800;
    return { ...hook, node, instances };
  }

  it('returns a new list to the top: the container and the range both reset', () => {
    const { result, rerender, node } = mountScrolled('dictionary-a');
    expect(result.current.visibleRange.firstVisibleIndex).toBe(20);

    rerender({ resetKey: 'dictionary-b' });

    expect(node.scrollTop).toBe(0);
    expect(result.current.visibleRange.firstVisibleIndex).toBe(0);
  });

  it('leaves the position alone while the key is unchanged', () => {
    const { result, rerender, node } = mountScrolled('dictionary-a');

    rerender({ resetKey: 'dictionary-a' });

    expect(node.scrollTop).toBe(800);
    expect(result.current.visibleRange.firstVisibleIndex).toBe(20);
  });

  it('does nothing on the first render: a fresh list is already at the top', () => {
    const { result } = renderHook(() =>
      useVirtualScrollRange(200, makeOptions({ resetKey: 'dictionary-a' }))
    );
    expect(result.current.visibleRange.firstVisibleIndex).toBe(0);
  });
});

// ─── scrollToTop / scrollToBottom ───────────────────────────────────────────────

describe('scrollToTop and scrollToBottom', () => {
  it('jump the mounted container to the first and last row', () => {
    stubResizeObserver();
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    const node = { scrollTop: 300 } as HTMLDivElement;
    act(() => result.current.scrollRefCallback(node));

    act(() => result.current.scrollToBottom());
    expect(node.scrollTop).toBe(200 * ITEM_H);

    act(() => result.current.scrollToTop());
    expect(node.scrollTop).toBe(0);
  });

  it('do nothing before a container is mounted', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    expect(() => {
      result.current.scrollToTop();
      result.current.scrollToBottom();
    }).not.toThrow();
  });
});

// ─── scrollRefCallback + container height ─────────────────────────────────────

describe('scrollRefCallback', () => {
  it('disconnects previous ResizeObserver when called with null', () => {
    const instances = stubResizeObserver();
    const { result } = renderHook(() => useVirtualScrollRange(50, makeOptions()));

    act(() => result.current.scrollRefCallback(document.createElement('div')));
    act(() => result.current.scrollRefCallback(null));

    expect(instances).toHaveLength(1);
    expect(instances[0].disconnect).toHaveBeenCalledOnce();
  });

  it('updates the visible count when the ResizeObserver fires', () => {
    const instances = stubResizeObserver();
    const { result } = renderHook(() => useVirtualScrollRange(100, makeOptions()));

    act(() => result.current.scrollRefCallback(document.createElement('div')));
    act(() => instances[0].fire(300));

    // visibleCount = ceil(300/40) = 8
    expect(result.current.visibleRange.visibleCount).toBe(8);
  });
});

// ─── withScrollPreservation ──────────────────────────────────────────────────

describe('withScrollPreservation', () => {
  function mountAt(scrollTop: number) {
    stubResizeObserver();
    const rafCalls: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCalls.push(cb);
      return 0;
    });
    const hook = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    const node = { scrollTop } as HTMLDivElement;
    act(() => hook.result.current.scrollRefCallback(node));
    return { ...hook, node, runFrames: () => act(() => rafCalls.forEach((cb) => cb(0))) };
  }

  afterEach(() => vi.restoreAllMocks());

  it('calls asyncFn', async () => {
    const { result } = renderHook(() => useVirtualScrollRange(50, makeOptions()));
    const fn = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.withScrollPreservation(fn);
    });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('restores scrollTop, and the range, when the DOM scrollTop drifted during the async op', async () => {
    const { result, node, runFrames } = mountAt(320);

    await act(async () => {
      await result.current.withScrollPreservation(async () => {
        // A re-render jumping scroll to the top.
        node.scrollTop = 0;
      });
    });
    runFrames();

    expect(node.scrollTop).toBe(320);
    expect(result.current.visibleRange.firstVisibleIndex).toBe(8);
  });

  it('writes nothing when the DOM did not drift', async () => {
    const { result, node, runFrames } = mountAt(320);

    await act(async () => {
      await result.current.withScrollPreservation(async () => {});
    });
    runFrames();

    expect(node.scrollTop).toBe(320);
    // The range follows `handleScroll`, not this path, so it stays where it was.
    expect(result.current.visibleRange.firstVisibleIndex).toBe(0);
  });
});
