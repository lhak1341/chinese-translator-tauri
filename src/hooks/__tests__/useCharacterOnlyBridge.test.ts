import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCharacterOnlyBridge } from '../useCharacterOnlyBridge';

// ---------------------------------------------------------------------------
// Mocks — keep tests off the highlighting barrel (re-exports WASM; crashes worker).
// vi.mock is hoisted; assign return values in beforeEach.
// ---------------------------------------------------------------------------

vi.mock('../../utils/highlighting', () => ({
  findCharacterOnlyMatch: vi.fn(),
  scrollToHighlightedElement: vi.fn(),
  HIGHLIGHT_SCROLL_DELAY_MS: 10,
}));

import { findCharacterOnlyMatch, scrollToHighlightedElement } from '../../utils/highlighting';

const mockFind = findCharacterOnlyMatch as ReturnType<typeof vi.fn>;
const mockScroll = scrollToHighlightedElement as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Stable fixtures — must NOT be created inside renderHook callbacks.
// New object per render changes the dep reference → infinite re-render loop.
// ---------------------------------------------------------------------------

const ARRAYS = {
  original: ['原0', '原1', '原2'],
  translated: ['tr0', 'tr1', 'tr2'],
  metadata: [
    { source: 'characters', tokenIndex: 0 },
    { source: 'characters', tokenIndex: 1 },
    { source: 'characters', tokenIndex: 2 },
  ],
};

// Stable ref — scrollToHighlightedElement is mocked, so .current value doesn't matter.
const charOnlyRef = { current: document.createElement('div') };

const BASE = {
  unitIndex: -1,
  translationUnitIndex: -1,
  characterOnlyUnitIndex: -1 as number | number[],
  isCharacterOnlyClick: false,
  semanticArrays: ARRAYS,
  characterOnlySemanticArrays: ARRAYS,
  setCharacterOnlyIndex: vi.fn(),
  characterOnlyTextRef: charOnlyRef,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFind.mockReturnValue([1]);
});

// ---------------------------------------------------------------------------
// Guard cases — match effect should not fire setCharacterOnlyIndex
// ---------------------------------------------------------------------------

describe('guard: missing arrays', () => {
  test('semanticArrays null → setCharacterOnlyIndex not called', () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, semanticArrays: null }));
    expect(BASE.setCharacterOnlyIndex).not.toHaveBeenCalled();
  });

  test('characterOnlySemanticArrays null → setCharacterOnlyIndex not called', () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, characterOnlySemanticArrays: null }));
    expect(BASE.setCharacterOnlyIndex).not.toHaveBeenCalled();
  });
});

describe('guard: isCharacterOnlyClick', () => {
  test('true → skips match, setCharacterOnlyIndex not called', () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, isCharacterOnlyClick: true, unitIndex: 1 }));
    expect(mockFind).not.toHaveBeenCalled();
    expect(BASE.setCharacterOnlyIndex).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Index resolution — both -1, priority, in-bounds
// ---------------------------------------------------------------------------

describe('index resolution', () => {
  test('both indices -1 → setCharacterOnlyIndex(-1) (null match)', () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, unitIndex: -1, translationUnitIndex: -1 }));
    expect(mockFind).not.toHaveBeenCalled();
    expect(BASE.setCharacterOnlyIndex).toHaveBeenCalledWith(-1);
  });

  test('translationUnitIndex takes priority over unitIndex when both valid', () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, unitIndex: 0, translationUnitIndex: 2 }));
    expect(mockFind).toHaveBeenCalledWith(2, ARRAYS, ARRAYS);
  });

  test('falls back to unitIndex when translationUnitIndex is -1', () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, unitIndex: 1, translationUnitIndex: -1 }));
    expect(mockFind).toHaveBeenCalledWith(1, ARRAYS, ARRAYS);
  });
});

// ---------------------------------------------------------------------------
// Bounds check — out-of-range indices set -1 and skip findCharacterOnlyMatch
// ---------------------------------------------------------------------------

describe('bounds check', () => {
  test('translationUnitIndex ≥ array length → setCharacterOnlyIndex(-1), no find', () => {
    renderHook(() =>
      // ARRAYS.original.length === 3; index 5 is out of bounds
      useCharacterOnlyBridge({ ...BASE, translationUnitIndex: 5 })
    );
    expect(mockFind).not.toHaveBeenCalled();
    expect(BASE.setCharacterOnlyIndex).toHaveBeenCalledWith(-1);
  });

  test('unitIndex ≥ array length → setCharacterOnlyIndex(-1), no find', () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, unitIndex: 99, translationUnitIndex: -1 }));
    expect(mockFind).not.toHaveBeenCalled();
    expect(BASE.setCharacterOnlyIndex).toHaveBeenCalledWith(-1);
  });
});

// ---------------------------------------------------------------------------
// Match result forwarding
// ---------------------------------------------------------------------------

describe('match result', () => {
  test('findCharacterOnlyMatch result forwarded to setCharacterOnlyIndex', () => {
    mockFind.mockReturnValue([2, 3]);
    renderHook(() => useCharacterOnlyBridge({ ...BASE, unitIndex: 1 }));
    expect(BASE.setCharacterOnlyIndex).toHaveBeenCalledWith([2, 3]);
  });

  test('null match → setCharacterOnlyIndex(-1)', () => {
    mockFind.mockReturnValue(null);
    renderHook(() => useCharacterOnlyBridge({ ...BASE, unitIndex: 1 }));
    expect(BASE.setCharacterOnlyIndex).toHaveBeenCalledWith(-1);
  });
});

// ---------------------------------------------------------------------------
// Reactivity — dep changes re-run the effect
// ---------------------------------------------------------------------------

describe('reactivity', () => {
  test('changing unitIndex re-runs match effect', () => {
    const { rerender } = renderHook(
      ({ idx }: { idx: number }) => useCharacterOnlyBridge({ ...BASE, unitIndex: idx }),
      { initialProps: { idx: 0 } }
    );
    expect(mockFind).toHaveBeenCalledTimes(1);

    rerender({ idx: 1 });
    expect(mockFind).toHaveBeenCalledTimes(2);
    expect(mockFind).toHaveBeenLastCalledWith(1, ARRAYS, ARRAYS);
  });

  test('changing translationUnitIndex re-runs match effect', () => {
    const { rerender } = renderHook(
      ({ idx }: { idx: number }) => useCharacterOnlyBridge({ ...BASE, translationUnitIndex: idx }),
      { initialProps: { idx: 0 } }
    );
    rerender({ idx: 2 });
    expect(mockFind).toHaveBeenCalledTimes(2);
    expect(mockFind).toHaveBeenLastCalledWith(2, ARRAYS, ARRAYS);
  });
});

// ---------------------------------------------------------------------------
// Scroll effect (uses setTimeout(10ms))
// ---------------------------------------------------------------------------

describe('scroll effect', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('characterOnlyUnitIndex = -1 → no scroll', async () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, characterOnlyUnitIndex: -1 }));
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(mockScroll).not.toHaveBeenCalled();
  });

  test('single index → scrolls to that index after 10ms', async () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, characterOnlyUnitIndex: 2 }));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(mockScroll).toHaveBeenCalledOnce();
    expect(mockScroll).toHaveBeenCalledWith(charOnlyRef, 2);
  });

  test('array of indices → uses first index', async () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, characterOnlyUnitIndex: [3, 5] }));
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(mockScroll).toHaveBeenCalledWith(charOnlyRef, 3);
  });

  test('scroll does not fire before 10ms elapses', async () => {
    renderHook(() => useCharacterOnlyBridge({ ...BASE, characterOnlyUnitIndex: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(5);
    });
    expect(mockScroll).not.toHaveBeenCalled();
  });

  test('timeout cancelled on unmount before 10ms', async () => {
    const { unmount } = renderHook(() =>
      useCharacterOnlyBridge({ ...BASE, characterOnlyUnitIndex: 1 })
    );
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(mockScroll).not.toHaveBeenCalled();
  });

  test('timeout cancelled when characterOnlyUnitIndex changes before 10ms', async () => {
    const { rerender } = renderHook(
      ({ idx }: { idx: number | number[] }) =>
        useCharacterOnlyBridge({ ...BASE, characterOnlyUnitIndex: idx }),
      { initialProps: { idx: 1 as number | number[] } }
    );
    // change dep before timeout fires — old timeout should be cancelled
    await act(async () => {
      vi.advanceTimersByTime(5);
    });
    rerender({ idx: 2 });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    // only the second index scrolled; first was cancelled
    expect(mockScroll).toHaveBeenCalledOnce();
    expect(mockScroll).toHaveBeenCalledWith(charOnlyRef, 2);
  });
});
