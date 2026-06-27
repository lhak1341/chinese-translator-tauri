import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFullTranslationSegments } from '../useFullTranslationSegments';

const ASYNC_SEGMENT = {
  text: 'async',
  unitIndex: 0,
  isClickable: true,
  start: 0,
  end: 5,
  type: 'semantic' as const,
};

vi.mock('../../utils/highlighting', () => ({
  precomputeSegments: vi.fn(),
}));

import { precomputeSegments } from '../../utils/highlighting';
const mockPrecompute = precomputeSegments as ReturnType<typeof vi.fn>;

const ARRAYS = {
  original: ['原0', '原1', '原2'],
  translated: ['tr0', 'tr1', 'tr2'],
  metadata: [
    { source: 'characters', tokenIndex: 0 },
    { source: 'characters', tokenIndex: 1 },
    { source: 'characters', tokenIndex: 2 },
  ],
};
const EMPTY_ARRAYS = { original: [], translated: [], metadata: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrecompute.mockResolvedValue([ASYNC_SEGMENT]);
});

describe('useFullTranslationSegments — guard cases', () => {
  test('returns [] when semanticArrays is undefined', () => {
    const { result } = renderHook(() => useFullTranslationSegments('text', undefined));
    expect(result.current).toEqual([]);
    expect(mockPrecompute).not.toHaveBeenCalled();
  });

  test('returns [] when semanticArrays.translated is empty', () => {
    const { result } = renderHook(() => useFullTranslationSegments('text', EMPTY_ARRAYS));
    expect(result.current).toEqual([]);
    expect(mockPrecompute).not.toHaveBeenCalled();
  });

  test('returns [] when translatedText is undefined', () => {
    const { result } = renderHook(() => useFullTranslationSegments(undefined, ARRAYS));
    expect(result.current).toEqual([]);
    expect(mockPrecompute).not.toHaveBeenCalled();
  });
});

describe('useFullTranslationSegments — async path', () => {
  test('calls precomputeSegments with text and arrays', async () => {
    renderHook(() => useFullTranslationSegments('hello world', ARRAYS));
    await waitFor(() => expect(mockPrecompute).toHaveBeenCalledOnce());
    expect(mockPrecompute).toHaveBeenCalledWith('hello world', ARRAYS);
  });

  test('returns async segments once promise resolves', async () => {
    const { result } = renderHook(() => useFullTranslationSegments('hello', ARRAYS));
    await waitFor(() => expect(result.current).toEqual([ASYNC_SEGMENT]));
  });
});

describe('useFullTranslationSegments — cancellation guard', () => {
  test('stale async result discarded when text dep changes before resolution', async () => {
    let resolveFirst!: (v: (typeof ASYNC_SEGMENT)[]) => void;
    const staleSegment = { ...ASYNC_SEGMENT, text: 'stale' };
    const freshSegment = { ...ASYNC_SEGMENT, text: 'fresh' };

    mockPrecompute
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          })
      )
      .mockResolvedValueOnce([freshSegment]);

    const { result, rerender } = renderHook(
      ({ text }) => useFullTranslationSegments(text, ARRAYS),
      { initialProps: { text: 'first' } }
    );

    rerender({ text: 'second' });
    await waitFor(() => expect(mockPrecompute).toHaveBeenCalledTimes(2));

    resolveFirst([staleSegment]);

    await waitFor(() => expect(result.current).toEqual([freshSegment]));
    expect(result.current).not.toEqual([staleSegment]);
  });
});
