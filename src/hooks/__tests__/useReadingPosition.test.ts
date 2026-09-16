import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import {
  computeAnchor,
  tryRestorePosition,
  useReadingPosition,
  type RestoreTarget,
} from '../useReadingPosition';

const setReadingPosition = vi.fn();

vi.mock('../../utils/reader/BookRecordsBackend', () => ({
  setReadingPosition: (fingerprint: string, position: unknown) =>
    setReadingPosition(fingerprint, position),
}));

beforeEach(() => {
  setReadingPosition.mockReset();
  setReadingPosition.mockResolvedValue(undefined);
});

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
  function makeVirtualizer(items: { index: number; start: number; size: number }[]): {
    target: RestoreTarget;
    scrollToIndex: ReturnType<typeof vi.fn>;
  } {
    const scrollToIndex = vi.fn();
    return {
      scrollToIndex,
      target: { scrollToIndex, getVirtualItems: () => items },
    };
  }

  it('returns false (retry) when the scroll element has no layout yet', () => {
    const { target } = makeVirtualizer([]);
    const el = { clientHeight: 0 } as HTMLElement;
    expect(tryRestorePosition(el, target, 100, { line: 5, fraction: 0 })).toBe(false);
  });

  it('returns false when there is no scroll element at all', () => {
    const { target } = makeVirtualizer([]);
    expect(tryRestorePosition(null, target, 100, { line: 5, fraction: 0 })).toBe(false);
  });

  it('is a no-op success for an empty book', () => {
    const { target, scrollToIndex } = makeVirtualizer([]);
    const el = { clientHeight: 400, scrollTop: 0 } as HTMLElement;
    expect(tryRestorePosition(el, target, 0, { line: 0, fraction: 0 })).toBe(true);
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it('clamps the target line to the book length', () => {
    const { target, scrollToIndex } = makeVirtualizer([]);
    const el = { clientHeight: 400, scrollTop: 0 } as HTMLElement;
    tryRestorePosition(el, target, 10, { line: 999, fraction: 0 });
    expect(scrollToIndex).toHaveBeenCalledWith(9, { align: 'start' });
  });

  it('scrolls to the line and nudges by the fraction once the row is measured', () => {
    const { target } = makeVirtualizer([{ index: 5, start: 150, size: 40 }]);
    const el = { clientHeight: 400, scrollTop: 150 } as HTMLElement;
    tryRestorePosition(el, target, 100, { line: 5, fraction: 0.5 });
    expect(el.scrollTop).toBe(150 + 0.5 * 40);
  });

  it('leaves scrollTop alone when the row has not been measured yet', () => {
    const { target } = makeVirtualizer([]);
    const el = { clientHeight: 400, scrollTop: 150 } as HTMLElement;
    tryRestorePosition(el, target, 100, { line: 5, fraction: 0.5 });
    expect(el.scrollTop).toBe(150);
  });
});

// ── Hook ─────────────────────────────────────────────────────────────────────

function makeScrollEl(overrides: Partial<HTMLElement> = {}): HTMLElement {
  return { clientHeight: 400, scrollTop: 0, ...overrides } as HTMLElement;
}

function makeVirtualizer(
  items: { index: number; start: number; size: number }[] = []
): RestoreTarget & { scrollToIndex: ReturnType<typeof vi.fn> } {
  const scrollToIndex = vi.fn();
  return { scrollToIndex, getVirtualItems: () => items };
}

describe('useReadingPosition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces position writes — several scrolls within the window coalesce into one write', async () => {
    const scrollRef = createRef<HTMLElement>();
    (scrollRef as { current: HTMLElement }).current = makeScrollEl();
    const virtualizer = makeVirtualizer([{ index: 0, start: 0, size: 30 }]);

    const { result } = renderHook(() =>
      useReadingPosition({
        fingerprint: 'fp1',
        initialPosition: null,
        scrollRef,
        virtualizer,
        lineCount: 1000,
        isActive: true,
      })
    );

    (scrollRef.current as HTMLElement).scrollTop = 10;
    act(() => result.current.onScroll());
    await vi.advanceTimersByTimeAsync(500);
    (scrollRef.current as HTMLElement).scrollTop = 20;
    act(() => result.current.onScroll());

    expect(setReadingPosition).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);

    expect(setReadingPosition).toHaveBeenCalledTimes(1);
    expect(setReadingPosition).toHaveBeenCalledWith('fp1', { line: 0, fraction: 20 / 30 });
  });

  it('flushes immediately when isActive turns false, without waiting for the debounce', async () => {
    const scrollRef = createRef<HTMLElement>();
    (scrollRef as { current: HTMLElement }).current = makeScrollEl({ scrollTop: 15 });
    const virtualizer = makeVirtualizer([{ index: 0, start: 0, size: 30 }]);

    const { result, rerender } = renderHook(
      ({ isActive }) =>
        useReadingPosition({
          fingerprint: 'fp1',
          initialPosition: null,
          scrollRef,
          virtualizer,
          lineCount: 1000,
          isActive,
        }),
      { initialProps: { isActive: true } }
    );

    act(() => result.current.onScroll());
    rerender({ isActive: false });
    await vi.advanceTimersByTimeAsync(0);

    expect(setReadingPosition).toHaveBeenCalledTimes(1);
  });

  it('flushes on unmount (book close)', async () => {
    const scrollRef = createRef<HTMLElement>();
    (scrollRef as { current: HTMLElement }).current = makeScrollEl({ scrollTop: 15 });
    const virtualizer = makeVirtualizer([{ index: 0, start: 0, size: 30 }]);

    const { result, unmount } = renderHook(() =>
      useReadingPosition({
        fingerprint: 'fp1',
        initialPosition: null,
        scrollRef,
        virtualizer,
        lineCount: 1000,
        isActive: true,
      })
    );

    act(() => result.current.onScroll());
    unmount();
    await vi.advanceTimersByTimeAsync(0);

    expect(setReadingPosition).toHaveBeenCalledTimes(1);
  });

  it('does not write anything when the reader never scrolled', async () => {
    const scrollRef = createRef<HTMLElement>();
    (scrollRef as { current: HTMLElement }).current = makeScrollEl();
    const virtualizer = makeVirtualizer();

    const { unmount } = renderHook(() =>
      useReadingPosition({
        fingerprint: 'fp1',
        initialPosition: null,
        scrollRef,
        virtualizer,
        lineCount: 1000,
        isActive: true,
      })
    );

    unmount();
    await vi.advanceTimersByTimeAsync(0);

    expect(setReadingPosition).not.toHaveBeenCalled();
  });

  it('restores the initial position once on mount, via scrollToIndex', async () => {
    const scrollRef = createRef<HTMLElement>();
    (scrollRef as { current: HTMLElement }).current = makeScrollEl();
    const virtualizer = makeVirtualizer([{ index: 42, start: 1260, size: 30 }]);

    renderHook(() =>
      useReadingPosition({
        fingerprint: 'fp1',
        initialPosition: { line: 42, fraction: 0.25 },
        scrollRef,
        virtualizer,
        lineCount: 1000,
        isActive: true,
      })
    );

    await vi.runOnlyPendingTimersAsync();

    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(42, { align: 'start' });
  });

  it('does nothing on mount when there is no initial position (never opened before)', async () => {
    const scrollRef = createRef<HTMLElement>();
    (scrollRef as { current: HTMLElement }).current = makeScrollEl();
    const virtualizer = makeVirtualizer();

    renderHook(() =>
      useReadingPosition({
        fingerprint: 'fp1',
        initialPosition: null,
        scrollRef,
        virtualizer,
        lineCount: 1000,
        isActive: true,
      })
    );

    await vi.runOnlyPendingTimersAsync();

    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });
});
