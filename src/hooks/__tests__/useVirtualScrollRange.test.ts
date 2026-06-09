import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVirtualScrollRange } from '../useVirtualScrollRange';

vi.mock('../../utils/ui', () => ({
  adaptiveBufferCalculator: {
    trackScrollingMetrics: vi.fn(),
    calculateOptimalBufferSize: vi.fn(),
  },
}));

const ITEM_H = 40;

function makeOptions(overrides: Partial<Parameters<typeof useVirtualScrollRange>[1]> = {}) {
  return { itemHeight: ITEM_H, bufferSize: 5, ...overrides };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// ─── visibleRange ────────────────────────────────────────────────────────────

describe('visibleRange', () => {
  it('renders first buffer+visible items when scrolled to top', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions({ bufferSize: 5 })));
    const { startIndex, endIndex, visibleCount } = result.current.visibleRange;
    expect(startIndex).toBe(0);
    // 600px container / 40px = 15 visible, +5 buffer*2=10 → 25
    expect(endIndex).toBe(25);
    expect(visibleCount).toBe(15);
  });

  it('clamps startIndex when totalItems is 0', () => {
    const { result } = renderHook(() => useVirtualScrollRange(0, makeOptions()));
    expect(result.current.visibleRange.startIndex).toBe(0);
    expect(result.current.visibleRange.endIndex).toBe(0);
  });

  it('floors fractional bufferSize to avoid sub-pixel positioning', () => {
    const { result } = renderHook(() =>
      useVirtualScrollRange(100, makeOptions({ bufferSize: 7.5 }))
    );
    const { startIndex } = result.current.visibleRange;
    // With scrollTop=0 and bufferSize floored to 7: rawStart = max(0, 0-7)=0
    expect(startIndex).toBe(0);
  });
});

// ─── handleScroll ─────────────────────────────────────────────────────────────

describe('handleScroll', () => {
  it('updates scrollTop and isScrolling on scroll event', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    const fakeEvent = { currentTarget: { scrollTop: 400 } } as React.UIEvent<HTMLDivElement>;

    act(() => {
      result.current.handleScroll(fakeEvent);
    });

    // visibleRange startIndex = floor(400/40) - 5 = 10-5 = 5
    expect(result.current.visibleRange.startIndex).toBe(5);
    expect(result.current.isScrolling).toBe(true);
  });

  it('clears isScrolling after 150ms timeout', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    const fakeEvent = { currentTarget: { scrollTop: 200 } } as React.UIEvent<HTMLDivElement>;

    act(() => {
      result.current.handleScroll(fakeEvent);
    });
    expect(result.current.isScrolling).toBe(true);

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.isScrolling).toBe(false);
    expect(result.current.scrollVelocity).toBe(0);
  });
});

// ─── resetScroll ─────────────────────────────────────────────────────────────

describe('resetScroll', () => {
  it('resets scrollTop, isScrolling and scrollVelocity to zero', () => {
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    const fakeEvent = { currentTarget: { scrollTop: 800 } } as React.UIEvent<HTMLDivElement>;

    act(() => {
      result.current.handleScroll(fakeEvent);
    });
    expect(result.current.visibleRange.startIndex).toBeGreaterThan(0);

    act(() => {
      result.current.resetScroll();
    });

    expect(result.current.visibleRange.startIndex).toBe(0);
    expect(result.current.isScrolling).toBe(false);
    expect(result.current.scrollVelocity).toBe(0);
  });
});

// ─── scrollRefCallback + containerHeight ──────────────────────────────────────

describe('scrollRefCallback', () => {
  it('disconnects previous ResizeObserver when called with null', () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    class MockRO {
      observe = observe;
      disconnect = disconnect;
    }
    const RealRO = global.ResizeObserver;
    global.ResizeObserver = MockRO as unknown as typeof ResizeObserver;

    const { result } = renderHook(() => useVirtualScrollRange(50, makeOptions()));
    const fakeNode = document.createElement('div');

    act(() => result.current.scrollRefCallback(fakeNode));
    act(() => result.current.scrollRefCallback(null));

    expect(disconnect).toHaveBeenCalledOnce();
    global.ResizeObserver = RealRO;
  });

  it('updates containerHeight when ResizeObserver fires', () => {
    let observerCallback: ResizeObserverCallback = () => {};
    class MockRO {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(cb: ResizeObserverCallback) {
        observerCallback = cb;
      }
    }
    const RealRO = global.ResizeObserver;
    global.ResizeObserver = MockRO as unknown as typeof ResizeObserver;

    const { result } = renderHook(() => useVirtualScrollRange(100, makeOptions()));
    const fakeNode = document.createElement('div');

    act(() => result.current.scrollRefCallback(fakeNode));
    act(() => {
      // entry.contentRect.height is what the hook reads
      const entry = { contentRect: { height: 300 } } as ResizeObserverEntry;
      observerCallback([entry], {} as ResizeObserver);
    });

    // visibleCount = ceil(300/40) = 8
    expect(result.current.visibleRange.visibleCount).toBe(8);
    global.ResizeObserver = RealRO;
  });
});

// ─── scrollRestore RAF effect ─────────────────────────────────────────────────

describe('scrollRestore', () => {
  it('starts the RAF retry loop when scrollRestore is provided', () => {
    // Full completion requires a mounted DOM node (scrollRef.current must be set).
    // This test verifies the RAF loop is initiated; completion is covered by integration.
    const rafCalls: number[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = rafCalls.length + 1;
      rafCalls.push(id);
      return id;
    });

    const onScrollSave = vi.fn();
    renderHook(() => useVirtualScrollRange(100, makeOptions({ scrollRestore: 400, onScrollSave })));

    expect(rafCalls.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('does not call onScrollSave when scrollRestore is null', () => {
    const onScrollSave = vi.fn();
    renderHook(() =>
      useVirtualScrollRange(100, makeOptions({ scrollRestore: null, onScrollSave }))
    );
    expect(onScrollSave).not.toHaveBeenCalled();
  });
});
