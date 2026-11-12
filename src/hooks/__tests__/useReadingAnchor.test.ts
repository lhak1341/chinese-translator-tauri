import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useReadingAnchor, type UseReadingAnchorOptions } from '../useReadingAnchor';
import { flushPendingPosition } from '../../utils/reader/PendingPositionFlush';

// The timing rules live in `ReadingAnchor` and are tested there. These tests cover only
// what this hook adds: turning React props, the Appearance signal and window input into
// calls on it.

const setReadingPosition = vi.fn();

vi.mock('../../utils/reader/BookRecordsBackend', () => ({
  setReadingPosition: (fingerprint: string, position: unknown) =>
    setReadingPosition(fingerprint, position),
}));

beforeEach(() => {
  setReadingPosition.mockReset();
  setReadingPosition.mockResolvedValue(undefined);
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

function makeScrollElement(): HTMLDivElement {
  const element = document.createElement('div');
  // jsdom has no layout; a zero-height element reads as "not laid out yet".
  Object.defineProperty(element, 'clientHeight', { value: 800, configurable: true });
  return element;
}

function setup(overrides: Partial<UseReadingAnchorOptions> = {}) {
  const scrollElement = makeScrollElement();
  const virtualizer = {
    scrollToIndex: vi.fn(),
    getVirtualItems: () => [
      { index: 4200, start: 0, size: 40 },
      { index: 4201, start: 40, size: 40 },
    ],
  };
  const relayout = vi.fn();
  const base: UseReadingAnchorOptions = {
    fingerprint: 'fp1',
    initialPosition: null,
    master: { scrollRef: { current: scrollElement }, virtualizer },
    relayout,
    lineCount: 75_000,
    isActive: true,
    engineVersion: 1,
    isRefilling: () => false,
    ...overrides,
  };
  const view = renderHook((props: UseReadingAnchorOptions) => useReadingAnchor(props), {
    initialProps: base,
  });
  return { view, base, scrollElement, virtualizer, relayout };
}

describe('useReadingAnchor', () => {
  it('re-renders with the anchor line a scroll measured', () => {
    const { view, scrollElement } = setup();

    scrollElement.scrollTop = 50;
    act(() => view.result.current.onScroll());

    expect(view.result.current.anchorLine).toBe(4201);
  });

  it('relayouts on return when the font changed while the Reader was hidden', async () => {
    const { view, base, relayout } = setup({ isActive: false });

    document.documentElement.style.setProperty('--full-translation-size', '1.5rem');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(relayout).not.toHaveBeenCalled();

    view.rerender({ ...base, isActive: true });

    await waitFor(() => expect(relayout).toHaveBeenCalledTimes(1));
  });

  it('re-anchors when the engine version bumps', () => {
    const { view, base, virtualizer, scrollElement } = setup();
    scrollElement.scrollTop = 50;
    act(() => view.result.current.onScroll());
    scrollElement.scrollTop = 500;

    view.rerender({ ...base, engineVersion: 2 });

    expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(4201, { align: 'start' });
  });

  it('hands a re-anchor back to the reader on a wheel', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback)
    );
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames.length = 0;
    });
    try {
      const { view, base, virtualizer, scrollElement } = setup({ isRefilling: () => true });
      scrollElement.scrollTop = 50;
      act(() => view.result.current.onScroll());
      scrollElement.scrollTop = 500;
      view.rerender({ ...base, isRefilling: () => true, engineVersion: 2 });
      virtualizer.scrollToIndex.mockClear();

      window.dispatchEvent(new Event('wheel'));

      expect(frames).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('writes the pending position on unmount', async () => {
    const { view, scrollElement } = setup();
    scrollElement.scrollTop = 50;
    act(() => view.result.current.onScroll());

    view.unmount();
    await Promise.resolve();

    expect(setReadingPosition).toHaveBeenCalledWith('fp1', { line: 4201, fraction: 0.25 });
  });

  it('lets the app-exit handler reach the pending write', async () => {
    const { view, scrollElement } = setup();
    scrollElement.scrollTop = 50;
    act(() => view.result.current.onScroll());

    await flushPendingPosition();

    expect(setReadingPosition).toHaveBeenCalledTimes(1);
  });
});
