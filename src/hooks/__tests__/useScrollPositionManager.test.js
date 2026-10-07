import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollPositionManager, tryRestoreScrollPositions } from '../useScrollPositionManager';

describe('useScrollPositionManager', () => {
  let mockRefs;

  beforeEach(() => {
    // Create mock refs with realistic DOM properties
    mockRefs = {
      original: {
        current: {
          scrollTop: 0,
          scrollLeft: 0,
          scrollHeight: 1000,
          clientHeight: 500,
          scrollWidth: 800,
          clientWidth: 600,
        },
      },
      translation: {
        current: {
          scrollTop: 0,
          scrollLeft: 0,
          scrollHeight: 1200,
          clientHeight: 500,
          scrollWidth: 900,
          clientWidth: 600,
        },
      },
      characterOnly: {
        current: {
          scrollTop: 0,
          scrollLeft: 0,
          scrollHeight: 800,
          clientHeight: 500,
          scrollWidth: 700,
          clientWidth: 600,
        },
      },
    };
  });

  describe('savePositions', () => {
    test('saves scroll positions from all refs', () => {
      const { result } = renderHook(() => useScrollPositionManager(mockRefs));

      mockRefs.original.current.scrollTop = 100;
      mockRefs.original.current.scrollLeft = 50;
      mockRefs.translation.current.scrollTop = 200;
      mockRefs.characterOnly.current.scrollTop = 150;

      let positions;
      act(() => {
        positions = result.current.savePositions();
      });

      expect(positions.original.scrollTop).toBe(100);
      expect(positions.original.scrollLeft).toBe(50);
      expect(positions.translation.scrollTop).toBe(200);
      expect(positions.characterOnly.scrollTop).toBe(150);
    });

    test('handles null refs gracefully', () => {
      const nullRefs = {
        original: { current: null },
        translation: { current: null },
        characterOnly: { current: null },
      };

      const { result } = renderHook(() => useScrollPositionManager(nullRefs));

      let positions;
      act(() => {
        positions = result.current.savePositions();
      });

      expect(positions.original.scrollTop).toBe(0);
      expect(positions.translation.scrollTop).toBe(0);
      expect(positions.characterOnly.scrollTop).toBe(0);
    });
  });

  describe('hook interface', () => {
    test('returns correct interface', () => {
      const { result } = renderHook(() => useScrollPositionManager(mockRefs));

      expect(result.current).toHaveProperty('savedPositions');
      expect(result.current).toHaveProperty('savePositions');
      expect(result.current).toHaveProperty('restorePositions');
      expect(result.current).toHaveProperty('cleanup');
    });

    test('savedPositions starts as null', () => {
      const { result } = renderHook(() => useScrollPositionManager(mockRefs));

      expect(result.current.savedPositions).toBeNull();
    });

    test('functions are callable', () => {
      const { result } = renderHook(() => useScrollPositionManager(mockRefs));

      expect(typeof result.current.savePositions).toBe('function');
      expect(typeof result.current.restorePositions).toBe('function');
      expect(typeof result.current.cleanup).toBe('function');
    });
  });

  describe('cleanup', () => {
    test('cleanup function exists and is callable', () => {
      const { result } = renderHook(() => useScrollPositionManager(mockRefs));

      act(() => {
        result.current.cleanup();
      });

      expect(true).toBe(true); // Should not throw
    });

    test('cleanup on unmount does not throw', () => {
      const { unmount } = renderHook(() => useScrollPositionManager(mockRefs));

      unmount(); // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('configuration', () => {
    test('accepts custom configuration', () => {
      const { result } = renderHook(() =>
        useScrollPositionManager(mockRefs, {
          maxRetryAttempts: 5,
          maxRetryDelay: 500,
        })
      );

      expect(result.current).toBeDefined();
      expect(result.current.savePositions).toBeInstanceOf(Function);
    });

    test('works with default configuration', () => {
      const { result } = renderHook(() => useScrollPositionManager(mockRefs));

      expect(result.current).toBeDefined();
      expect(result.current.savePositions).toBeInstanceOf(Function);
    });
  });
});

describe('tryRestoreScrollPositions', () => {
  /** A panel ref as the DOM reports it: scrollable by (scrollHeight - clientHeight) vertically. */
  const panel = (overrides = {}) => ({
    current: {
      scrollTop: 0,
      scrollLeft: 0,
      scrollHeight: 1000,
      clientHeight: 400,
      scrollWidth: 800,
      clientWidth: 500,
      ...overrides,
    },
  });
  const makeRefs = () => ({ original: panel(), translation: panel(), characterOnly: panel() });
  const at = (scrollTop, scrollLeft = 0) => ({ scrollTop, scrollLeft });

  test('writes every saved panel and reports success', () => {
    const refs = makeRefs();

    const done = tryRestoreScrollPositions(refs, {
      original: at(100, 10),
      translation: at(200, 20),
      characterOnly: at(300, 30),
    });

    expect(done).toBe(true);
    expect(
      [refs.original, refs.translation, refs.characterOnly].map((r) => r.current.scrollTop)
    ).toEqual([100, 200, 300]);
    expect(
      [refs.original, refs.translation, refs.characterOnly].map((r) => r.current.scrollLeft)
    ).toEqual([10, 20, 30]);
  });

  test('is not ready, and writes nothing, while a saved panel has no layout yet', () => {
    const refs = makeRefs();
    refs.translation = panel({ scrollHeight: 0 });

    const done = tryRestoreScrollPositions(refs, {
      original: at(100),
      translation: at(200),
    });

    expect(done).toBe(false);
    // The panel that was ready is not written either: a restore is all or nothing per attempt.
    expect(refs.original.current.scrollTop).toBe(0);
  });

  test('is not ready while a saved panel is not mounted', () => {
    const refs = makeRefs();
    refs.characterOnly = { current: null };

    expect(tryRestoreScrollPositions(refs, { characterOnly: at(50) })).toBe(false);
  });

  test('ignores a panel that was not saved, even one without layout', () => {
    const refs = makeRefs();
    refs.translation = { current: null };

    const done = tryRestoreScrollPositions(refs, { original: at(100) });

    expect(done).toBe(true);
    expect(refs.original.current.scrollTop).toBe(100);
    expect(refs.characterOnly.current.scrollTop).toBe(0);
  });

  test('clamps each write to what the panel can now scroll', () => {
    const refs = makeRefs();
    // Content shrank after a reload: 1000 - 400 = 600 vertical, 800 - 500 = 300 horizontal.
    const done = tryRestoreScrollPositions(refs, { original: at(5000, 5000) });

    expect(done).toBe(true);
    expect(refs.original.current.scrollTop).toBe(600);
    expect(refs.original.current.scrollLeft).toBe(300);
  });

  test('clamps a panel that cannot scroll at all to zero', () => {
    const refs = makeRefs();
    refs.original = panel({
      scrollHeight: 300,
      clientHeight: 400,
      scrollWidth: 300,
      clientWidth: 500,
    });

    tryRestoreScrollPositions(refs, { original: at(100, 100) });

    expect(refs.original.current.scrollTop).toBe(0);
    expect(refs.original.current.scrollLeft).toBe(0);
  });

  test("clamps every panel by its own size, not another panel's", () => {
    const refs = makeRefs();
    refs.translation = panel({ scrollHeight: 500, clientHeight: 400 });
    refs.characterOnly = panel({ scrollHeight: 2000, clientHeight: 400 });

    tryRestoreScrollPositions(refs, {
      original: at(900),
      translation: at(900),
      characterOnly: at(900),
    });

    expect(refs.original.current.scrollTop).toBe(600);
    expect(refs.translation.current.scrollTop).toBe(100);
    expect(refs.characterOnly.current.scrollTop).toBe(900);
  });
});
