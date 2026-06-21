import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingTranslation } from '../useStreamingTranslation';

// ─── Hook integration tests ────────────────────────────────────────────────────
// Uses fake timers to advance past the throttle delay.

describe('useStreamingTranslation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resetStreaming clears all three state pieces atomically', async () => {
    const { result } = renderHook(() => useStreamingTranslation(100));

    act(() => {
      result.current.setProgressInfo({ total: 5, current: 3 });
      result.current.updateStreaming({ isStreaming: true, progress: 60 });
      result.current.setPartialSemanticArrays({ original: ['甲'], translated: ['A'] });
    });

    expect(result.current.progressInfo).toEqual({ total: 5, current: 3 });
    expect(result.current.partialSemanticArrays).toEqual({ original: ['甲'], translated: ['A'] });

    act(() => {
      result.current.resetStreaming();
    });

    expect(result.current.progressInfo).toBeNull();
    expect(result.current.partialSemanticArrays).toBeNull();

    // Advance past throttle delay to verify streamingTranslation resets too
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.throttledStreamingState.isStreaming).toBe(false);
    expect(result.current.throttledStreamingState.progress).toBe(0);
  });

  it('updateStreaming merges into streamingTranslation', async () => {
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

  it('callbacks are stable across renders', () => {
    const { result, rerender } = renderHook(() => useStreamingTranslation());
    const first = {
      updateStreaming: result.current.updateStreaming,
      setProgressInfo: result.current.setProgressInfo,
      setPartialSemanticArrays: result.current.setPartialSemanticArrays,
      resetStreaming: result.current.resetStreaming,
    };
    rerender();
    expect(result.current.updateStreaming).toBe(first.updateStreaming);
    expect(result.current.setProgressInfo).toBe(first.setProgressInfo);
    expect(result.current.setPartialSemanticArrays).toBe(first.setPartialSemanticArrays);
    expect(result.current.resetStreaming).toBe(first.resetStreaming);
  });
});
