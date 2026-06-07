import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSegmentComputation } from '../useSegmentComputation';

// ---------------------------------------------------------------------------
// Mocks — keep tests focused on strategy dispatch, not segment content
// vi.mock is hoisted; constants defined before beforeEach sets return values.
// ---------------------------------------------------------------------------

const SYNC_SEGMENT = {
  text: 'sync',
  unitIndex: 0,
  isClickable: true,
  start: 0,
  end: 4,
  type: 'semantic' as const,
};
const ASYNC_SEGMENT = {
  text: 'async',
  unitIndex: 0,
  isClickable: true,
  start: 0,
  end: 5,
  type: 'semantic' as const,
};

vi.mock('../../utils/highlighting', () => ({
  SegmentPrecomputer: { precomputeSegments: vi.fn() },
}));

vi.mock('../../utils/highlighting/PositionMetadataSegmenter', () => ({
  segmentFromPositionMetadata: vi.fn(),
}));

import { SegmentPrecomputer } from '../../utils/highlighting';
import { segmentFromPositionMetadata } from '../../utils/highlighting/PositionMetadataSegmenter';

const mockPrecompute = SegmentPrecomputer.precomputeSegments as ReturnType<typeof vi.fn>;
const mockSync = segmentFromPositionMetadata as ReturnType<typeof vi.fn>;

// Stable fixture — must NOT be created inside renderHook callbacks.
// A new object per render changes the `semanticArrays` dep → infinite effect loop.
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
  mockSync.mockReturnValue([SYNC_SEGMENT]);
});

// ---------------------------------------------------------------------------

describe('useSegmentComputation — empty / guard cases', () => {
  test('returns [] when semanticArrays is undefined', () => {
    const { result } = renderHook(() =>
      useSegmentComputation('translation-to-original', 'text', undefined)
    );
    expect(result.current).toEqual([]);
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockPrecompute).not.toHaveBeenCalled();
  });

  test('returns [] when semanticArrays.translated is empty', () => {
    const { result } = renderHook(() =>
      useSegmentComputation('translation-to-original', 'text', EMPTY_ARRAYS)
    );
    expect(result.current).toEqual([]);
  });

  test('returns [] when translatedText is undefined in character-only mode', () => {
    const { result } = renderHook(() =>
      useSegmentComputation('character-only-to-original', undefined, ARRAYS)
    );
    expect(result.current).toEqual([]);
    expect(mockSync).not.toHaveBeenCalled();
  });

  test('returns [] when translatedText is undefined in async mode', () => {
    const { result } = renderHook(() =>
      useSegmentComputation('translation-to-original', undefined, ARRAYS)
    );
    expect(result.current).toEqual([]);
    expect(mockPrecompute).not.toHaveBeenCalled();
  });
});

describe('useSegmentComputation — character-only-to-original path (sync)', () => {
  test('calls segmentFromPositionMetadata, not SegmentPrecomputer', () => {
    renderHook(() => useSegmentComputation('character-only-to-original', 'tốt của tốt', ARRAYS));
    expect(mockSync).toHaveBeenCalledOnce();
    expect(mockSync).toHaveBeenCalledWith('tốt của tốt', ARRAYS);
    expect(mockPrecompute).not.toHaveBeenCalled();
  });

  test('returns segments synchronously without waiting', () => {
    const { result } = renderHook(() =>
      useSegmentComputation('character-only-to-original', 'tốt', ARRAYS)
    );
    expect(result.current).toEqual([SYNC_SEGMENT]);
  });
});

describe('useSegmentComputation — translation-to-original path (async)', () => {
  test('calls SegmentPrecomputer.precomputeSegments, not segmentFromPositionMetadata', async () => {
    renderHook(() => useSegmentComputation('translation-to-original', 'hello world', ARRAYS));
    await waitFor(() => expect(mockPrecompute).toHaveBeenCalledOnce());
    expect(mockSync).not.toHaveBeenCalled();
  });

  test('returns async segments once promise resolves', async () => {
    const { result } = renderHook(() =>
      useSegmentComputation('translation-to-original', 'hello', ARRAYS)
    );
    await waitFor(() => expect(result.current).toEqual([ASYNC_SEGMENT]));
  });

  test('original-to-translation direction also uses async path', async () => {
    renderHook(() => useSegmentComputation('original-to-translation', 'text', ARRAYS));
    await waitFor(() => expect(mockPrecompute).toHaveBeenCalledOnce());
    expect(mockSync).not.toHaveBeenCalled();
  });
});

describe('useSegmentComputation — cancellation guard', () => {
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
      ({ text }) => useSegmentComputation('translation-to-original', text, ARRAYS),
      { initialProps: { text: 'first' } }
    );

    // trigger second call (changes text dep, cancels first)
    rerender({ text: 'second' });
    await waitFor(() => expect(mockPrecompute).toHaveBeenCalledTimes(2));

    // resolve stale first call after fresh is settled
    resolveFirst([staleSegment]);

    await waitFor(() => expect(result.current).toEqual([freshSegment]));
    expect(result.current).not.toEqual([staleSegment]);
  });
});
