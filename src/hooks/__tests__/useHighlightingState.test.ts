import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useHighlightingState,
  MAX_SAFE_SEGMENTS,
  HIGHLIGHT_SCROLL_DELAY_MS,
} from '../useHighlightingState';

vi.mock('../../utils/toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import toast from '../../utils/toast';
import { logger } from '../../utils/logger';

const CLEARED = {
  unitIndex: -1,
  translationUnitIndex: -1,
  characterOnlyUnitIndex: -1,
  isCharacterOnlyClick: false,
};

describe('useHighlightingState', () => {
  describe('exported constants', () => {
    it('MAX_SAFE_SEGMENTS is a positive finite integer', () => {
      expect(Number.isFinite(MAX_SAFE_SEGMENTS)).toBe(true);
      expect(MAX_SAFE_SEGMENTS).toBeGreaterThan(0);
      expect(Number.isInteger(MAX_SAFE_SEGMENTS)).toBe(true);
    });

    it('HIGHLIGHT_SCROLL_DELAY_MS is 10', () => {
      expect(HIGHLIGHT_SCROLL_DELAY_MS).toBe(10);
    });
  });

  describe('initial state', () => {
    it('starts with all indices -1 and isCharacterOnlyClick false', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      expect(result.current.highlighting).toEqual(CLEARED);
    });
  });

  describe('clearHighlighting', () => {
    it('resets all indices after a dispatch', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      act(() => {
        result.current.dispatchHighlighting({ type: 'HIGHLIGHT_ORIGINAL', unitIndex: 3 });
      });
      expect(result.current.highlighting.unitIndex).toBe(3);

      act(() => {
        result.current.clearHighlighting();
      });
      expect(result.current.highlighting).toEqual(CLEARED);
    });
  });

  describe('clear-on-new-translation invariant', () => {
    it('clears highlighting when semanticArrays transitions from null to a value', () => {
      const arrays = { original: [{}], translated: [{}] } as any;
      const { result, rerender } = renderHook(({ sa }) => useHighlightingState(sa), {
        initialProps: { sa: null as typeof arrays | null },
      });

      act(() => {
        result.current.dispatchHighlighting({ type: 'HIGHLIGHT_ORIGINAL', unitIndex: 5 });
      });
      expect(result.current.highlighting.unitIndex).toBe(5);

      rerender({ sa: arrays });
      expect(result.current.highlighting).toEqual(CLEARED);
    });

    it('does not clear when semanticArrays stays null', () => {
      const { result, rerender } = renderHook(({ sa }) => useHighlightingState(sa), {
        initialProps: { sa: null as any },
      });
      act(() => {
        result.current.dispatchHighlighting({ type: 'HIGHLIGHT_ORIGINAL', unitIndex: 2 });
      });
      rerender({ sa: null });
      expect(result.current.highlighting.unitIndex).toBe(2);
    });

    it('clears on each new arrays reference', () => {
      const a1 = { original: [{}], translated: [{}] } as any;
      const a2 = { original: [{}, {}], translated: [{}, {}] } as any;
      const { result, rerender } = renderHook(({ sa }) => useHighlightingState(sa), {
        initialProps: { sa: a1 },
      });

      act(() => {
        result.current.dispatchHighlighting({ type: 'HIGHLIGHT_TRANSLATION', unitIndex: 4 });
      });
      rerender({ sa: a2 });
      expect(result.current.highlighting.translationUnitIndex).toBe(-1);
    });
  });

  describe('validateSemanticArraySize', () => {
    it('does not throw when arrays is null', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      expect(() => result.current.validateSemanticArraySize(null, 'test')).not.toThrow();
    });

    it('does not throw when arrays has no original', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      expect(() => result.current.validateSemanticArraySize({} as any, 'test')).not.toThrow();
    });

    it('does not throw when array length is exactly MAX_SAFE_SEGMENTS', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      const arrays = { original: { length: MAX_SAFE_SEGMENTS } } as any;
      expect(() => result.current.validateSemanticArraySize(arrays, 'test')).not.toThrow();
    });

    it('throws when array length exceeds MAX_SAFE_SEGMENTS', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      const arrays = { original: { length: MAX_SAFE_SEGMENTS + 1 } } as any;
      expect(() => result.current.validateSemanticArraySize(arrays, 'test')).toThrow(
        'Document too large'
      );
    });

    it('calls toast.error on overflow', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      const arrays = { original: { length: MAX_SAFE_SEGMENTS + 1 } } as any;
      try {
        result.current.validateSemanticArraySize(arrays, 'test');
      } catch {}
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Document too large'));
    });

    it('calls logger.error on overflow', () => {
      const { result } = renderHook(() => useHighlightingState(null));
      const arrays = { original: { length: MAX_SAFE_SEGMENTS + 1 } } as any;
      try {
        result.current.validateSemanticArraySize(arrays, 'ctx');
      } catch {}
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ctx'));
    });
  });
});
