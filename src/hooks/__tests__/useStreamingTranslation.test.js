import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingTranslation } from '../useStreamingTranslation';

// ─── Hook integration tests ────────────────────────────────────────────────────
// Uses fake timers to advance past the throttle delay.

describe('useStreamingTranslation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resetStreaming returns the streaming state to its initial values', async () => {
    const { result } = renderHook(() => useStreamingTranslation(100));

    act(() => {
      result.current.updateStreaming({ isStreaming: true, completedChunks: 3, totalChunks: 5 });
    });
    act(() => {
      result.current.resetStreaming();
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.throttledStreamingState.isStreaming).toBe(false);
    expect(result.current.throttledStreamingState.progress).toBe(0);
    expect(result.current.throttledStreamingState.totalChunks).toBe(0);
  });

  it('updateStreaming merges into the streaming state', async () => {
    const { result } = renderHook(() => useStreamingTranslation(100));

    act(() => {
      result.current.updateStreaming({ isStreaming: true, partialText: 'Xin chào' });
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.throttledStreamingState.isStreaming).toBe(true);
    expect(result.current.throttledStreamingState.partialText).toBe('Xin chào');
    expect(result.current.throttledStreamingState.progress).toBe(0);
  });

  it('derives progress from the chunk counts, and ignores a progress passed in (ADR-105)', async () => {
    const { result } = renderHook(() => useStreamingTranslation(100));

    act(() => {
      result.current.updateStreaming({ totalChunks: 3 });
    });
    act(() => {
      result.current.updateStreaming({ completedChunks: 1, progress: 99 });
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.throttledStreamingState.progress).toBe(33.3);

    act(() => {
      result.current.updateStreaming({ completedChunks: 3 });
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.throttledStreamingState.progress).toBe(100);
  });

  it('progress is 0 while totalChunks is 0', async () => {
    const { result } = renderHook(() => useStreamingTranslation(100));

    act(() => {
      result.current.updateStreaming({ completedChunks: 2, totalChunks: 0 });
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.throttledStreamingState.progress).toBe(0);
  });

  it('latestPartialText returns the last text written, before the throttle lets it through', () => {
    const { result } = renderHook(() => useStreamingTranslation(100));

    act(() => {
      result.current.updateStreaming({ isStreaming: true, partialText: 'Một' });
    });
    act(() => {
      result.current.updateStreaming({ partialText: 'Một hai' });
    });
    act(() => {
      result.current.updateStreaming({ completedChunks: 2 });
    });

    // No timer advanced: the throttled state may still hold an older text.
    expect(result.current.latestPartialText()).toBe('Một hai');

    act(() => {
      result.current.resetStreaming();
    });
    expect(result.current.latestPartialText()).toBe('');
  });

  it('callbacks are stable across renders', () => {
    const { result, rerender } = renderHook(() => useStreamingTranslation());
    const first = {
      updateStreaming: result.current.updateStreaming,
      latestPartialText: result.current.latestPartialText,
      resetStreaming: result.current.resetStreaming,
    };
    rerender();
    expect(result.current.updateStreaming).toBe(first.updateStreaming);
    expect(result.current.latestPartialText).toBe(first.latestPartialText);
    expect(result.current.resetStreaming).toBe(first.resetStreaming);
  });
});
