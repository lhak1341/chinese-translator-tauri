/**
 * Tests for useTranslationExecutionContext — extracted from Translator.jsx's
 * inline executionCtx object literal (architecture review 2026-07-29,
 * candidate #3). Assembly-only (every field is already a ref/setter from
 * another hook) — coverage is the passthrough shape and the dev-only guard.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useTranslationExecutionContext } from '../useTranslationExecutionContext';

function baseParams(overrides = {}) {
  return {
    consumeReloadTransition: vi.fn(() => false),
    clearHighlighting: vi.fn(),
    setIsTranslating: vi.fn(),
    isTranslatingRef: { current: false },
    setResultArrays: vi.fn(),
    setStreamingText: vi.fn(),
    isClipboardTranslationRef: { current: false },
    resetClipboardFlag: vi.fn(),
    translationTextRef: { current: null },
    ...overrides,
  };
}

describe('useTranslationExecutionContext', () => {
  test('returns all 9 fields unchanged (assembly-only, no logic)', () => {
    const params = baseParams();
    const { result } = renderHook(() => useTranslationExecutionContext(params));

    expect(result.current).toEqual(params);
    expect(result.current.clearHighlighting).toBe(params.clearHighlighting);
    expect(result.current.isTranslatingRef).toBe(params.isTranslatingRef);
  });

  describe('dev-only input-shape guard', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('throws when a required ref param is not ref-shaped', () => {
      const params = baseParams({ translationTextRef: undefined });
      expect(() => renderHook(() => useTranslationExecutionContext(params))).toThrow(
        /translationTextRef/
      );
    });

    test('throws when a required function param is missing', () => {
      const params = baseParams({ resetClipboardFlag: undefined });
      expect(() => renderHook(() => useTranslationExecutionContext(params))).toThrow(
        /resetClipboardFlag/
      );
    });

    test('does not throw in production even with a wrong-shaped param', () => {
      process.env.NODE_ENV = 'production';
      const params = baseParams({ resetClipboardFlag: undefined });
      expect(() => renderHook(() => useTranslationExecutionContext(params))).not.toThrow();
    });
  });
});
