import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVirtualScrollRange } from '../useVirtualScrollRange';
import { adaptiveBufferCalculator } from '../../utils/ui';

vi.mock('../../utils/ui', () => ({
  adaptiveBufferCalculator: {
    trackScrollingMetrics: vi.fn(),
    calculateOptimalBufferSize: vi.fn(),
  },
}));

const ITEM_H = 40;

function makeOptions(overrides: Partial<Parameters<typeof useVirtualScrollRange>[1]> = {}) {
  return { itemHeight: ITEM_H, ...overrides };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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

  it('floors fractional bufferSize from adaptive calculator to avoid sub-pixel positioning', async () => {
    vi.mocked(adaptiveBufferCalculator.calculateOptimalBufferSize).mockResolvedValue(7.5);
    const { result } = renderHook(() => useVirtualScrollRange(100, makeOptions()));
    await act(async () => {
      vi.advanceTimersByTime(110);
    });
    // bufferSize floored to 7: endIndex = 0 + 15 + 7*2 = 29 (not 30 with unfloored 7.5)
    expect(result.current.visibleRange.endIndex).toBe(29);
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

    // visibleRange startIndex = floor(400/40) - 10 = 10-10 = 0
    expect(result.current.visibleRange.startIndex).toBe(0);
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

// ─── adaptive buffer sizing ───────────────────────────────────────────────────

describe('adaptive buffer sizing', () => {
  it('calls calculateOptimalBufferSize with current context after 100ms', async () => {
    vi.mocked(adaptiveBufferCalculator.calculateOptimalBufferSize).mockResolvedValue(20);
    renderHook(() => useVirtualScrollRange(150, makeOptions()));
    await act(async () => {
      vi.advanceTimersByTime(110);
    });
    expect(adaptiveBufferCalculator.calculateOptimalBufferSize).toHaveBeenCalledWith(
      expect.objectContaining({ totalItems: 150, itemHeight: ITEM_H })
    );
  });

  it('updates visibleRange when calculator returns new bufferSize', async () => {
    vi.mocked(adaptiveBufferCalculator.calculateOptimalBufferSize).mockResolvedValue(20);
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    await act(async () => {
      vi.advanceTimersByTime(110);
    });
    // bufferSize=20: endIndex = 0 + 15 + 20*2 = 55
    expect(result.current.visibleRange.endIndex).toBe(55);
  });

  it('ignores non-number return from calculator', async () => {
    vi.mocked(adaptiveBufferCalculator.calculateOptimalBufferSize).mockResolvedValue(
      undefined as unknown as number
    );
    const { result } = renderHook(() => useVirtualScrollRange(200, makeOptions()));
    await act(async () => {
      vi.advanceTimersByTime(110);
    });
    // bufferSize stays at 10: endIndex = 0 + 15 + 10*2 = 35
    expect(result.current.visibleRange.endIndex).toBe(35);
  });
});
