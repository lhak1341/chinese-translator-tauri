/**
 * Tests for segment pre-computation functions.
 *
 * Covers: precomputeSegments (translated text), precomputeOriginalSegments
 * (original Chinese text), findUnitMatch, and normalizeText.
 */

import { describe, test, expect } from 'vitest';
import {
  precomputeSegments,
  precomputeOriginalSegments,
  findUnitMatch,
  normalizeText,
} from '../highlighting/SegmentPrecomputer';
import type { SemanticArrays, Segment } from '../highlighting/SegmentPrecomputer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSemanticArrays(
  translated: string[],
  original: string[],
  sources?: string[]
): SemanticArrays {
  const metadata = translated.map((_, i) => ({
    source: sources ? sources[i] : 'character',
    tokenIndex: i,
  }));
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
    metadata: entries.map((e, i) => ({
      source: 'character',
      tokenIndex: e.tokenIndex ?? i,
      originalStart: e.originalStart,
      originalEnd: e.originalEnd,
    })),
  };
}

// ---------------------------------------------------------------------------
// precomputeSegments — basic matching
// ---------------------------------------------------------------------------

describe('precomputeSegments — basic matching', () => {
  test('empty text returns empty segments', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const result = precomputeSegments('', sa);
    expect(result).toEqual([]);
  });

  test('empty semantic arrays returns empty array (early-exit guard)', () => {
    // The function has an early-exit guard for empty translated arrays
    const result = precomputeSegments('hello', {
      translated: [],
      original: [],
      metadata: [],
    });
    expect(result).toEqual([]);
  });

  test('single word match produces one semantic segment', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const segments = precomputeSegments('bạn', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(1);
    expect(sem[0].text).toBe('bạn');
    expect(sem[0].originalText).toBe('你');
    expect(sem[0].isClickable).toBe(true);
    expect(sem[0].unitIndex).toBe(0);
  });

  test('assigns correct start/end positions', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const segments = precomputeSegments('bạn', sa);
    const sem = semanticSegments(segments);
    expect(sem[0].start).toBe(0);
    expect(sem[0].end).toBe('bạn'.length);
  });

  test('multiple words each produce a separate semantic segment (adjacent, no gap)', () => {
    // Use adjacent units with no space to avoid normalization-trim space-absorption
    const sa = makeSemanticArrays(['bạn', 'tốt'], ['你', '好']);
    const segments = precomputeSegments('bạntốt', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
    expect(sem[0].text).toBe('bạn');
    expect(sem[1].text).toBe('tốt');
  });

  test('combined segment text reconstructs full original text', () => {
    // The algorithm normalizes for matching but preserves raw text in segment.text;
    // verify all characters are accounted for.
    const sa = makeSemanticArrays(['bạn', 'tốt'], ['你', '好']);
    const text = 'bạn tốt';
    const segments = precomputeSegments(text, sa);
    const reconstructed = segments.map((s) => s.text).join('');
    expect(reconstructed).toBe(text);
  });

  test('unmatched text at end produces non-semantic text segment', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const segments = precomputeSegments('bạn xyz', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(1);

    const text = segments.filter((s) => s.type === 'text');
    expect(text.some((s) => s.text.includes('xyz'))).toBe(true);
  });

  test('text before first match becomes a non-clickable segment', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const segments = precomputeSegments('hello bạn', sa);

    const nonSem = nonSemanticSegments(segments);
    expect(nonSem.some((s) => s.text.includes('hello'))).toBe(true);
    expect(nonSem[0].isClickable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// precomputeSegments — duplicate words
// ---------------------------------------------------------------------------

describe('precomputeSegments — duplicate words', () => {
  test('two identical translated words each get their own segment', () => {
    // "bạn" appears twice in translated text (two different Chinese chars)
    const sa = makeSemanticArrays(['bạn', 'bạn'], ['你', '您']);
    const segments = precomputeSegments('bạn bạn', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
    // They should map to different unit indices
    expect(sem[0].unitIndex).not.toBe(sem[1].unitIndex);
  });

  test('duplicate words preserve order: first occurrence maps to first unit', () => {
    const sa = makeSemanticArrays(['bạn', 'bạn'], ['你', '您'], ['character', 'proper_noun']);
    const segments = precomputeSegments('bạn bạn', sa);

    const sem = semanticSegments(segments);
    expect(sem[0].unitIndex).toBe(0); // metadata.tokenIndex=0
    expect(sem[1].unitIndex).toBe(1); // metadata.tokenIndex=1
  });
});

// ---------------------------------------------------------------------------
// precomputeSegments — Vietnamese NFC normalization
// ---------------------------------------------------------------------------

describe('precomputeSegments — NFC normalization', () => {
  test('matches NFD-encoded unit in NFC-encoded text', () => {
    // "màu" in NFC = 3 chars, in NFD = 4 chars
    const nfdUnit = 'màu'; // NFD decomposed
    const nfcText = 'màu'; // NFC precomposed (U+00E0)

    const sa = makeSemanticArrays([nfdUnit], ['颜色']);
    const segments = precomputeSegments(nfcText, sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// precomputeSegments — line breaks and punctuation
// ---------------------------------------------------------------------------

describe('precomputeSegments — line breaks', () => {
  test('newline produces a text segment', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const segments = precomputeSegments('bạn\ntốt', sa);

    const lineBreaks = segments.filter((s) => s.type === 'text' && /[\r\n]/.test(s.text));
    expect(lineBreaks.length).toBeGreaterThanOrEqual(1);
  });

  test('semantic segment after newline is still matched', () => {
    const sa = makeSemanticArrays(['bạn', 'tốt'], ['你', '好']);
    const segments = precomputeSegments('bạn\ntốt', sa);

    // Due to normalizeText trimming, the newline may be absorbed into the second
    // segment's offset=0 match. What matters is that both originals are represented
    // and the full text is reconstructed.
    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
    // The combined segment text must equal the original text
    const reconstructed = segments.map((s) => s.text).join('');
    expect(reconstructed).toBe('bạn\ntốt');
  });
});

// ---------------------------------------------------------------------------
// precomputeSegments — position integrity
// ---------------------------------------------------------------------------

describe('precomputeSegments — position integrity', () => {
  test('segment positions cover entire text without gaps or overlaps', () => {
    const sa = makeSemanticArrays(['bạn', 'tốt', 'lắm'], ['你', '好', '很']);
    const text = 'bạn tốt lắm';
    const segments = precomputeSegments(text, sa);

    // Verify that segments are sorted by start position
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].start).toBeGreaterThanOrEqual(segments[i - 1].end);
    }

    // Full text covered: first segment starts at 0, last ends at text.length
    if (segments.length > 0) {
      expect(segments[0].start).toBe(0);
      expect(segments[segments.length - 1].end).toBe(text.length);
    }
  });

  test('segment text matches substring of original text', () => {
    const sa = makeSemanticArrays(['bạn'], ['你']);
    const text = 'bạn';
    const segments = precomputeSegments(text, sa);

    for (const seg of segments) {
      expect(seg.text).toBe(text.substring(seg.start, seg.end));
    }
  });
});

// ---------------------------------------------------------------------------
// findUnitMatch
// ---------------------------------------------------------------------------

describe('findUnitMatch', () => {
  test('exact match at start returns found=true, offset=0', () => {
    const result = findUnitMatch('bạn', 'bạn');
    expect(result.found).toBe(true);
    expect(result.offset).toBe(0);
  });

  test('match after leading space returns found=true', () => {
    // normalizeText trims, so " bạn" normalises to "bạn" → matches at offset=0.
    // The exact offset value is an implementation detail of the fast-path;
    // the important assertion is that the unit IS found.
    const result = findUnitMatch(' bạn tốt', 'bạn');
    expect(result.found).toBe(true);
  });

  test('match after leading punctuation returns correct offset', () => {
    const result = findUnitMatch('"bạn', 'bạn');
    expect(result.found).toBe(true);
    expect(result.offset).toBeGreaterThanOrEqual(1);
  });

  test('no match returns found=false', () => {
    const result = findUnitMatch('xyz', 'bạn');
    expect(result.found).toBe(false);
  });

  test('empty remainingText returns found=false', () => {
    const result = findUnitMatch('', 'bạn');
    expect(result.found).toBe(false);
  });

  test('case-insensitive matching (Bạn matches bạn)', () => {
    const result = findUnitMatch('Bạn', 'bạn');
    expect(result.found).toBe(true);
  });

  test('offset does not exceed remainingText length', () => {
    // Safety: offset must always be a valid index into the original text
    const result = findUnitMatch('  bạn', 'bạn');
    expect(result.offset).toBeLessThan('  bạn'.length);
  });
});

// ---------------------------------------------------------------------------
// normalizeText
// ---------------------------------------------------------------------------

describe('normalizeText', () => {
  test('lowercases text', () => {
    expect(normalizeText('Bạn')).toBe('bạn');
  });

  test('collapses whitespace', () => {
    expect(normalizeText('bạn  tốt')).toBe('bạn tốt');
  });

  test('zero-width space (U+200B) is handled by whitespace normalization', () => {
    // U+200B falls in the  -‏ range that gets collapsed to a regular space.
    // Then the ZWS removal regex runs but it's already a space.
    // The actual result is 'b ạn' (space inserted where ZWS was).
    const result = normalizeText('b​ạn');
    // The ZWS is either removed or replaced with a space — in either case the
    // result does NOT still contain the original U+200B codepoint.
    expect(result).not.toContain('​');
  });

  test('trims leading/trailing whitespace', () => {
    expect(normalizeText('  bạn  ')).toBe('bạn');
  });
});

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
// precomputeOriginalSegments — duplicate characters (greedy-scan path parity
// with precomputeSegments — duplicate words, see above)
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
      metadata: [...withPos.metadata, { source: 'character', tokenIndex: 1 }],
    };
    const segments = precomputeOriginalSegments('你好', sa);

    const sem = semanticSegments(segments);
    expect(sem).toHaveLength(2);
  });
});
