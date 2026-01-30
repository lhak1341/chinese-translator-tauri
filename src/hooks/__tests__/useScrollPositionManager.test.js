import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollPositionManager } from '../useScrollPositionManager';

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
