import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  streamingReducer,
  INITIAL_STATE,
  INITIAL_STREAMING,
  useStreamingTranslation,
} from '../useStreamingTranslation';

// ─── Pure reducer tests ────────────────────────────────────────────────────────
// No React, no timers — the invariants that matter most live here.

describe('streamingReducer', () => {
  const populated = {
    progressInfo: { total: 10, current: 4 },
    streamingTranslation: {
      partialText: 'hello',
      progress: 40,
      isStreaming: true,
      completedChunks: 4,
      totalChunks: 10,
      batchNumber: 2,
      avgTimePerChunk: 150,
    },
    partialSemanticArrays: { original: ['你好'], translated: ['hello'] },
  };

  it('RESET returns exact INITIAL_STATE regardless of current state', () => {
    expect(streamingReducer(populated, { type: 'RESET' })).toEqual(INITIAL_STATE);
  });

  it('RESET nulls all three pieces simultaneously', () => {
    const next = streamingReducer(populated, { type: 'RESET' });
    expect(next.progressInfo).toBeNull();
    expect(next.partialSemanticArrays).toBeNull();
    expect(next.streamingTranslation).toEqual(INITIAL_STREAMING);
  });

  it('UPDATE_STREAMING merges partial data, leaves other fields unchanged', () => {
    const next = streamingReducer(INITIAL_STATE, {
      type: 'UPDATE_STREAMING',
      payload: { isStreaming: true, progress: 25 },
    });
    expect(next.streamingTranslation.isStreaming).toBe(true);
    expect(next.streamingTranslation.progress).toBe(25);
    expect(next.streamingTranslation.partialText).toBe('');
    expect(next.progressInfo).toBeNull();
    expect(next.partialSemanticArrays).toBeNull();
  });

  it('UPDATE_STREAMING does not mutate state', () => {
    streamingReducer(INITIAL_STATE, { type: 'UPDATE_STREAMING', payload: { progress: 50 } });
    expect(INITIAL_STATE.streamingTranslation.progress).toBe(0);
  });

  it('SET_PROGRESS_INFO updates progressInfo only', () => {
    const info = { total: 5, current: 2 };
    const next = streamingReducer(INITIAL_STATE, { type: 'SET_PROGRESS_INFO', payload: info });
    expect(next.progressInfo).toBe(info);
    expect(next.streamingTranslation).toBe(INITIAL_STATE.streamingTranslation);
    expect(next.partialSemanticArrays).toBeNull();
  });

  it('SET_PROGRESS_INFO with null clears progressInfo', () => {
    const next = streamingReducer(populated, { type: 'SET_PROGRESS_INFO', payload: null });
    expect(next.progressInfo).toBeNull();
  });

  it('SET_PARTIAL_ARRAYS updates partialSemanticArrays only', () => {
    const arrays = { original: ['甲'], translated: ['A'] };
    const next = streamingReducer(INITIAL_STATE, { type: 'SET_PARTIAL_ARRAYS', payload: arrays });
    expect(next.partialSemanticArrays).toBe(arrays);
    expect(next.progressInfo).toBeNull();
    expect(next.streamingTranslation).toBe(INITIAL_STATE.streamingTranslation);
  });

  it('SET_PARTIAL_ARRAYS with null clears arrays', () => {
    const next = streamingReducer(populated, { type: 'SET_PARTIAL_ARRAYS', payload: null });
    expect(next.partialSemanticArrays).toBeNull();
  });

  it('unknown action returns state unchanged', () => {
    const next = streamingReducer(INITIAL_STATE, { type: 'UNKNOWN' });
    expect(next).toBe(INITIAL_STATE);
  });
});

// ─── Hook integration test ─────────────────────────────────────────────────────
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
