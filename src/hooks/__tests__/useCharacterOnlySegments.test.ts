import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCharacterOnlySegments } from '../useCharacterOnlySegments';

const SYNC_SEGMENT = {
  text: 'sync',
  unitIndex: 0,
  isClickable: true,
  start: 0,
  end: 4,
  type: 'semantic' as const,
};

vi.mock('../../utils/highlighting/PositionMetadataSegmenter', () => ({
  segmentFromPositionMetadata: vi.fn(),
}));

import { segmentFromPositionMetadata } from '../../utils/highlighting/PositionMetadataSegmenter';
import { makeMeta } from '../../test/makeMeta';
const mockSync = segmentFromPositionMetadata as ReturnType<typeof vi.fn>;

const ARRAYS = {
  original: ['原0', '原1', '原2'],
  translated: ['tr0', 'tr1', 'tr2'],
  metadata: [
    makeMeta({ source: 'characters', tokenIndex: 0 }),
    makeMeta({ source: 'characters', tokenIndex: 1 }),
    makeMeta({ source: 'characters', tokenIndex: 2 }),
  ],
};
const EMPTY_ARRAYS = { original: [], translated: [], metadata: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockSync.mockReturnValue([SYNC_SEGMENT]);
});

describe('useCharacterOnlySegments — guard cases', () => {
  test('returns [] when semanticArrays is undefined', () => {
    const { result } = renderHook(() => useCharacterOnlySegments('text', undefined));
    expect(result.current).toEqual([]);
    expect(mockSync).not.toHaveBeenCalled();
  });

  test('returns [] when semanticArrays.translated is empty', () => {
    const { result } = renderHook(() => useCharacterOnlySegments('text', EMPTY_ARRAYS));
    expect(result.current).toEqual([]);
    expect(mockSync).not.toHaveBeenCalled();
  });

  test('returns [] when translatedText is undefined', () => {
    const { result } = renderHook(() => useCharacterOnlySegments(undefined, ARRAYS));
    expect(result.current).toEqual([]);
    expect(mockSync).not.toHaveBeenCalled();
  });
});

describe('useCharacterOnlySegments — sync path', () => {
  test('calls segmentFromPositionMetadata with text and arrays', () => {
    renderHook(() => useCharacterOnlySegments('tốt của tốt', ARRAYS));
    expect(mockSync).toHaveBeenCalledOnce();
    expect(mockSync).toHaveBeenCalledWith('tốt của tốt', ARRAYS);
  });

  test('returns segments synchronously without waiting', () => {
    const { result } = renderHook(() => useCharacterOnlySegments('tốt', ARRAYS));
    expect(result.current).toEqual([SYNC_SEGMENT]);
  });
});
