/**
 * Invariant tests for useTranslationResults named operations.
 *
 * Each test encodes the field-membership contract for one operation:
 * which of the 5 output fields must change, and which must be preserved.
 *
 * These tests exist to catch the failure mode where a 6th field is added
 * to the hook's state without updating every named operation that should
 * touch it. A missing update causes silent stale-state bugs in the UI.
 *
 * Fields: translatedText · characterOnlyText · semanticArrays ·
 *         characterOnlySemanticArrays · prebuiltSegments
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTranslationResults } from '../useTranslationResults.js';

const MOCK_ARRAYS = {
  original: ['说'],
  translated: ['nói'],
  metadata: [{ source: 'characters' }],
};

const MOCK_ARRAYS_CHAR_ONLY = {
  original: ['话'],
  translated: ['lời'],
  metadata: [{ source: 'characters' }],
};

const MOCK_SEGS = [{ type: 'semantic', start: 0, end: 3 }];

function useHook() {
  return renderHook(() => useTranslationResults());
}

// ── Initial state ────────────────────────────────────────────────────────────

describe('useTranslationResults initial state', () => {
  test('all 5 fields start at their empty/null values', () => {
    const { result } = useHook();
    expect(result.current.translatedText).toBe('');
    expect(result.current.characterOnlyText).toBe('');
    expect(result.current.semanticArrays).toBeNull();
    expect(result.current.characterOnlySemanticArrays).toBeNull();
    expect(result.current.prebuiltSegments).toEqual([]);
  });
});

// ── reset() ─────────────────────────────────────────────────────────────────

describe('useTranslationResults.reset()', () => {
  test('zeros ALL 5 fields regardless of prior state', () => {
    const { result } = useHook();

    // Populate all 5 fields first
    act(() => {
      result.current.setDualResults(
        { translatedText: 'nói', semanticArrays: MOCK_ARRAYS },
        { translatedText: 'lời', semanticArrays: MOCK_ARRAYS_CHAR_ONLY }
      );
    });
    act(() => {
      result.current.setResultArrays(MOCK_ARRAYS, MOCK_SEGS);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.translatedText).toBe('');
    expect(result.current.characterOnlyText).toBe('');
    expect(result.current.semanticArrays).toBeNull();
    expect(result.current.characterOnlySemanticArrays).toBeNull();
    expect(result.current.prebuiltSegments).toEqual([]);
  });
});

// ── setDualResults() ─────────────────────────────────────────────────────────

describe('useTranslationResults.setDualResults()', () => {
  test('populates all 4 text+array fields atomically', () => {
    const { result } = useHook();

    act(() => {
      result.current.setDualResults(
        { translatedText: 'nói', semanticArrays: MOCK_ARRAYS },
        { translatedText: 'lời', semanticArrays: MOCK_ARRAYS_CHAR_ONLY }
      );
    });

    expect(result.current.translatedText).toBe('nói');
    expect(result.current.characterOnlyText).toBe('lời');
    expect(result.current.semanticArrays).toBe(MOCK_ARRAYS);
    expect(result.current.characterOnlySemanticArrays).toBe(MOCK_ARRAYS_CHAR_ONLY);
  });
});

// ── setFullResult() ──────────────────────────────────────────────────────────

describe('useTranslationResults.setFullResult()', () => {
  test('sets translatedText + semanticArrays + prebuiltSegments, preserves charOnly fields', () => {
    const { result } = useHook();

    // Pre-populate charOnly fields
    act(() => {
      result.current.setCharOnlyResult('lời', MOCK_ARRAYS_CHAR_ONLY);
    });

    act(() => {
      result.current.setFullResult('nói', MOCK_ARRAYS, MOCK_SEGS);
    });

    expect(result.current.translatedText).toBe('nói');
    expect(result.current.semanticArrays).toBe(MOCK_ARRAYS);
    expect(result.current.prebuiltSegments).toBe(MOCK_SEGS);
    // charOnly fields preserved
    expect(result.current.characterOnlyText).toBe('lời');
    expect(result.current.characterOnlySemanticArrays).toBe(MOCK_ARRAYS_CHAR_ONLY);
  });

  test('segs optional — omitting leaves prebuiltSegments unchanged', () => {
    const { result } = useHook();
    act(() => {
      result.current.setResultArrays(MOCK_ARRAYS, MOCK_SEGS);
    });
    act(() => {
      result.current.setFullResult('nói', MOCK_ARRAYS);
    });
    // segs defaulted to null → prebuiltSegments untouched
    expect(result.current.prebuiltSegments).toBe(MOCK_SEGS);
  });
});

// ── setResultArrays() ────────────────────────────────────────────────────────

describe('useTranslationResults.setResultArrays()', () => {
  test('updates arrays + segs; preserves translatedText and charOnly fields', () => {
    const { result } = useHook();

    act(() => {
      result.current.setStreamingText('partial');
    });
    act(() => {
      result.current.setCharOnlyResult('lời', MOCK_ARRAYS_CHAR_ONLY);
    });

    act(() => {
      result.current.setResultArrays(MOCK_ARRAYS, MOCK_SEGS);
    });

    expect(result.current.semanticArrays).toBe(MOCK_ARRAYS);
    expect(result.current.prebuiltSegments).toBe(MOCK_SEGS);
    // text preserved (set by streaming)
    expect(result.current.translatedText).toBe('partial');
    // charOnly preserved
    expect(result.current.characterOnlyText).toBe('lời');
    expect(result.current.characterOnlySemanticArrays).toBe(MOCK_ARRAYS_CHAR_ONLY);
  });
});

// ── setStreamingText() ───────────────────────────────────────────────────────

describe('useTranslationResults.setStreamingText()', () => {
  test('updates only translatedText; arrays and charOnly unchanged', () => {
    const { result } = useHook();

    act(() => {
      result.current.setResultArrays(MOCK_ARRAYS, MOCK_SEGS);
    });
    act(() => {
      result.current.setCharOnlyResult('lời', MOCK_ARRAYS_CHAR_ONLY);
    });

    act(() => {
      result.current.setStreamingText('partial…');
    });

    expect(result.current.translatedText).toBe('partial…');
    expect(result.current.semanticArrays).toBe(MOCK_ARRAYS);
    expect(result.current.prebuiltSegments).toBe(MOCK_SEGS);
    expect(result.current.characterOnlyText).toBe('lời');
    expect(result.current.characterOnlySemanticArrays).toBe(MOCK_ARRAYS_CHAR_ONLY);
  });
});

// ── setCharOnlyResult() ──────────────────────────────────────────────────────

describe('useTranslationResults.setCharOnlyResult()', () => {
  test('updates only charOnly fields; full-translation fields unchanged', () => {
    const { result } = useHook();

    act(() => {
      result.current.setFullResult('nói', MOCK_ARRAYS, MOCK_SEGS);
    });

    act(() => {
      result.current.setCharOnlyResult('lời', MOCK_ARRAYS_CHAR_ONLY);
    });

    expect(result.current.characterOnlyText).toBe('lời');
    expect(result.current.characterOnlySemanticArrays).toBe(MOCK_ARRAYS_CHAR_ONLY);
    // full-translation fields preserved
    expect(result.current.translatedText).toBe('nói');
    expect(result.current.semanticArrays).toBe(MOCK_ARRAYS);
    expect(result.current.prebuiltSegments).toBe(MOCK_SEGS);
  });
});

// ── setError() ───────────────────────────────────────────────────────────────

describe('useTranslationResults.setError()', () => {
  test('sets translatedText to error msg; nulls semanticArrays; empties prebuiltSegments', () => {
    const { result } = useHook();
    act(() => {
      result.current.setFullResult('nói', MOCK_ARRAYS, MOCK_SEGS);
    });

    act(() => {
      result.current.setError('Translation failed');
    });

    expect(result.current.translatedText).toBe('Translation failed');
    expect(result.current.semanticArrays).toBeNull();
    expect(result.current.prebuiltSegments).toEqual([]);
  });

  test('clears charOnly fields too (error wipes all output state)', () => {
    const { result } = useHook();
    act(() => {
      result.current.setCharOnlyResult('lời', MOCK_ARRAYS_CHAR_ONLY);
    });

    act(() => {
      result.current.setError('oops');
    });

    // setError clears ALL fields, charOnly included
    expect(result.current.characterOnlyText).toBe('');
    expect(result.current.characterOnlySemanticArrays).toBeNull();
  });
});

// ── setStatusMessage() ───────────────────────────────────────────────────────

describe('useTranslationResults.setStatusMessage()', () => {
  test('sets translatedText to message; nulls semanticArrays + charOnlyArrays; empties segs', () => {
    const { result } = useHook();
    act(() => {
      result.current.setDualResults(
        { translatedText: 'nói', semanticArrays: MOCK_ARRAYS },
        { translatedText: 'lời', semanticArrays: MOCK_ARRAYS_CHAR_ONLY }
      );
    });
    act(() => {
      result.current.setResultArrays(MOCK_ARRAYS, MOCK_SEGS);
    });

    act(() => {
      result.current.setStatusMessage('Đang dịch…');
    });

    expect(result.current.translatedText).toBe('Đang dịch…');
    expect(result.current.semanticArrays).toBeNull();
    expect(result.current.characterOnlySemanticArrays).toBeNull();
    expect(result.current.prebuiltSegments).toEqual([]);
  });
});
