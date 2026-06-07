import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSegmentClickHandler } from '../useSegmentClickHandler';

// Stable fixture — must NOT be created inside renderHook callback (new object = dep change = infinite loop).
const ARRAYS = {
  original: ['原0', '原1', '原2'],
  translated: ['tr0', 'tr1', 'tr2'],
  metadata: [
    { source: 'characters', tokenIndex: 0 },
    { source: 'phrases', tokenIndex: 1 },
    { source: 'pattern', tokenIndex: 2 },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('useSegmentClickHandler — guard cases', () => {
  test('no-ops when semanticArrays is undefined', () => {
    const onSegmentClick = vi.fn();
    const { result } = renderHook(() =>
      useSegmentClickHandler(undefined, onSegmentClick, 'original-to-translation')
    );
    act(() => result.current(0));
    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  test('no-ops when unitIndex is negative', () => {
    const onSegmentClick = vi.fn();
    const { result } = renderHook(() =>
      useSegmentClickHandler(ARRAYS, onSegmentClick, 'original-to-translation')
    );
    act(() => result.current(-1));
    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  test('no-ops when unitIndex is out of bounds', () => {
    const onSegmentClick = vi.fn();
    const { result } = renderHook(() =>
      useSegmentClickHandler(ARRAYS, onSegmentClick, 'original-to-translation')
    );
    act(() => result.current(99));
    expect(onSegmentClick).not.toHaveBeenCalled();
  });

  test('no-ops when onSegmentClick is undefined', () => {
    // should not throw
    const { result } = renderHook(() =>
      useSegmentClickHandler(ARRAYS, undefined, 'original-to-translation')
    );
    expect(() => act(() => result.current(0))).not.toThrow();
  });
});

describe('useSegmentClickHandler — payload construction', () => {
  test('passes correct fields for original-to-translation direction', () => {
    const onSegmentClick = vi.fn();
    const { result } = renderHook(() =>
      useSegmentClickHandler(ARRAYS, onSegmentClick, 'original-to-translation')
    );
    act(() => result.current(1));
    expect(onSegmentClick).toHaveBeenCalledOnce();
    expect(onSegmentClick).toHaveBeenCalledWith({
      unitIndex: 1,
      originalText: '原1',
      translatedText: 'tr1',
      source: 'phrases',
      metadata: ARRAYS.metadata[1],
      direction: 'original-to-translation',
    });
  });

  test('passes correct fields for translation-to-original direction', () => {
    const onSegmentClick = vi.fn();
    const { result } = renderHook(() =>
      useSegmentClickHandler(ARRAYS, onSegmentClick, 'translation-to-original')
    );
    act(() => result.current(2));
    expect(onSegmentClick).toHaveBeenCalledWith(
      expect.objectContaining({
        unitIndex: 2,
        originalText: '原2',
        translatedText: 'tr2',
        source: 'pattern',
        direction: 'translation-to-original',
      })
    );
  });

  test('passes correct fields for character-only-to-original direction', () => {
    const onSegmentClick = vi.fn();
    const { result } = renderHook(() =>
      useSegmentClickHandler(ARRAYS, onSegmentClick, 'character-only-to-original')
    );
    act(() => result.current(0));
    expect(onSegmentClick).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'character-only-to-original' })
    );
  });
});

describe('useSegmentClickHandler — stability', () => {
  test('returns same function reference when deps unchanged', () => {
    const onSegmentClick = vi.fn();
    const { result, rerender } = renderHook(() =>
      useSegmentClickHandler(ARRAYS, onSegmentClick, 'original-to-translation')
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  test('returns new function reference when direction changes', () => {
    const onSegmentClick = vi.fn();
    const { result, rerender } = renderHook(
      ({ dir }: { dir: 'original-to-translation' | 'translation-to-original' }) =>
        useSegmentClickHandler(ARRAYS, onSegmentClick, dir),
      { initialProps: { dir: 'original-to-translation' as const } }
    );
    const first = result.current;
    rerender({ dir: 'translation-to-original' });
    expect(result.current).not.toBe(first);
  });
});
