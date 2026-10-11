/**
 * Tests for segment pre-computation functions.
 *
 * Covers: precomputeOriginalSegments (original Chinese text) and its
 * buildSegmentsFromPositions fast path.
 */

import { describe, test, expect } from 'vitest';
import { precomputeOriginalSegments } from '../highlighting/SegmentPrecomputer';
import type { SemanticArrays } from '../../types/SemanticTypes';
import type { Segment } from '../highlighting/SegmentPrecomputer';
import { makeMeta } from '../../test/makeMeta';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSemanticArrays(
  translated: string[],
  original: string[],
  sources?: string[]
): SemanticArrays {
  const metadata = translated.map((_, i) =>
    makeMeta({ source: sources ? sources[i] : 'character', tokenIndex: i })
  );
  return { translated, original, metadata };
}

function semanticSegments(segments: Segment[]) {
  return segments.filter((s) => s.type === 'semantic');
}

function nonSemanticSegments(segments: Segment[]) {
  return segments.filter((s) => s.type !== 'semantic');
}

/** Builds SemanticArrays with originalStart/originalEnd on every entry, which routes
 * precomputeOriginalSegments through the buildSegmentsFromPositions fast path instead
 * of the greedy scan (see the `allHavePositions` gate in SegmentPrecomputer.ts). */
function makeSemanticArraysWithPositions(
  entries: Array<{
    original: string;
    translated: string;
    originalStart: number;
    originalEnd: number;
    tokenIndex?: number;
  }>
): SemanticArrays {
  return {
    translated: entries.map((e) => e.translated),
    original: entries.map((e) => e.original),
    metadata: entries.map((e, i) =>
      makeMeta({
        source: 'character',
        tokenIndex: e.tokenIndex ?? i,
        originalStart: e.originalStart,
        originalEnd: e.originalEnd,
      })
    ),
  };
}

// ---------------------------------------------------------------------------
// precomputeOriginalSegments
// ---------------------------------------------------------------------------

describe('precomputeOriginalSegments', () => {
  test('matches original Chinese characters', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const segments = precomputeOriginalSegments('你好', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(1);
    expect(sem[0].text).toBe('你');
    expect(sem[0].translatedText).toBe('bạn');
  });

  test('unmatched characters become non-clickable', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const segments = precomputeOriginalSegments('你好', sa);

    const nonSem = nonSemanticSegments(segments);
    expect(nonSem.some((s) => s.text === '好')).toBe(true);
  });

  test('empty original returns empty array', () => {
    const sa = makeSemanticArrays([], [], []);
    const segments = precomputeOriginalSegments('你好', sa);
    expect(segments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// precomputeOriginalSegments — duplicate characters (greedy-scan tie-breaking)
// ---------------------------------------------------------------------------

describe('precomputeOriginalSegments — duplicate characters', () => {
  test('two identical original characters each get their own segment', () => {
    // '你' appears twice in the original text, mapping to two different units
    const sa = makeSemanticArrays(['bạn', 'ông'], ['你', '你']);
    const segments = precomputeOriginalSegments('你你', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
    expect(sem[0].unitIndex).not.toBe(sem[1].unitIndex);
  });

  test('duplicate characters preserve order: first occurrence maps to first unit', () => {
    const sa = makeSemanticArrays(['bạn', 'ông'], ['你', '你']);
    const segments = precomputeOriginalSegments('你你', sa);

    const sem = semanticSegments(segments);
    expect(sem[0].unitIndex).toBe(0); // metadata.tokenIndex=0
    expect(sem[1].unitIndex).toBe(1); // metadata.tokenIndex=1
    expect(sem[0].translatedText).toBe('bạn');
    expect(sem[1].translatedText).toBe('ông');
  });
});

// ---------------------------------------------------------------------------
// buildSegmentsFromPositions — fast path, entered via precomputeOriginalSegments
// when every metadata entry has originalStart >= 0. Module-private (not exported),
// so exercised only through precomputeOriginalSegments's routing.
// ---------------------------------------------------------------------------

describe('buildSegmentsFromPositions (fast path)', () => {
  test('routes to the fast path when every entry has originalStart', () => {
    const sa = makeSemanticArraysWithPositions([
      { original: '你', translated: 'bạn', originalStart: 0, originalEnd: 1 },
      { original: '好', translated: 'tốt', originalStart: 1, originalEnd: 2 },
    ]);
    const segments = precomputeOriginalSegments('你好', sa);
    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
    expect(sem[0].start).toBe(0);
    expect(sem[1].start).toBe(1);
  });

  test('gap before first entry becomes a non-clickable text segment', () => {
    const sa = makeSemanticArraysWithPositions([
      { original: '你好', translated: 'bạn tốt', originalStart: 1, originalEnd: 3 },
    ]);
    const segments = precomputeOriginalSegments('X你好', sa);

    expect(segments[0]).toMatchObject({ type: 'text', text: 'X', start: 0, end: 1 });
    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(1);
    expect(sem[0]).toMatchObject({ start: 1, end: 3, text: '你好' });
  });

  test('trailing text after the last entry becomes a non-clickable text segment', () => {
    const sa = makeSemanticArraysWithPositions([
      { original: '你好', translated: 'bạn tốt', originalStart: 0, originalEnd: 2 },
    ]);
    const segments = precomputeOriginalSegments('你好X', sa);

    const trailing = segments[segments.length - 1];
    expect(trailing).toMatchObject({ type: 'text', text: 'X', start: 2, end: 3 });
  });

  test('multiple entries with no gaps reconstruct the full text in order', () => {
    const sa = makeSemanticArraysWithPositions([
      { original: '你好', translated: 'bạn tốt', originalStart: 0, originalEnd: 2 },
      { original: '世界', translated: 'thế giới', originalStart: 2, originalEnd: 4 },
    ]);
    const text = '你好世界';
    const segments = precomputeOriginalSegments(text, sa);

    const reconstructed = segments.map((s) => s.text).join('');
    expect(reconstructed).toBe(text);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start).toBeGreaterThanOrEqual(segments[i - 1].end);
    }
  });

  test('overlap guard: an entry whose originalStart is already covered is skipped', () => {
    // Sorted by originalStart: entryA [0,2) processed first, advancing currentPosition
    // to 2. entryB's originalStart (1) < currentPosition (2) — must be skipped, not
    // just reordered — per the `if (meta.originalStart < currentPosition) continue;` guard.
    const sa = makeSemanticArraysWithPositions([
      { original: '你好', translated: 'bạn tốt', originalStart: 0, originalEnd: 2 },
      { original: '好世', translated: 'overlap', originalStart: 1, originalEnd: 3 },
    ]);
    const segments = precomputeOriginalSegments('你好世', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(1);
    expect(sem[0].translatedText).toBe('bạn tốt');
    expect(sem.some((s) => s.translatedText === 'overlap')).toBe(false);
  });

  test('entries are walked in originalStart order regardless of array order', () => {
    // Array order is reversed relative to originalStart order.
    const sa = makeSemanticArraysWithPositions([
      { original: '世界', translated: 'thế giới', originalStart: 2, originalEnd: 4 },
      { original: '你好', translated: 'bạn tốt', originalStart: 0, originalEnd: 2 },
    ]);
    const segments = precomputeOriginalSegments('你好世界', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
    expect(sem[0].translatedText).toBe('bạn tốt'); // originalStart=0, walked first
    expect(sem[1].translatedText).toBe('thế giới'); // originalStart=2, walked second
  });
});

// ---------------------------------------------------------------------------
// precomputeOriginalSegments — fast-path gating
// ---------------------------------------------------------------------------

describe('precomputeOriginalSegments — fast-path gating', () => {
  test('falls back to the greedy scan when even one entry lacks originalStart', () => {
    // Mixed: one entry has originalStart, one doesn't — allHavePositions must be false,
    // so this must NOT go through buildSegmentsFromPositions.
    const withPos = makeSemanticArraysWithPositions([
      { original: '你', translated: 'bạn', originalStart: 0, originalEnd: 1 },
    ]);
    const sa: SemanticArrays = {
      translated: [...withPos.translated, 'tốt'],
      original: [...withPos.original, '好'],
      metadata: [...withPos.metadata, makeMeta({ source: 'character', tokenIndex: 1 })],
    };
    const segments = precomputeOriginalSegments('你好', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
  });
});
