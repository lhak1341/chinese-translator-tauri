import { describe, test, expect } from 'vitest';
import { isDictionaryCategory, getIndexedMatches } from '../dictionary/LookupIndexUtils';

// ---------------------------------------------------------------------------
// isDictionaryCategory
// ---------------------------------------------------------------------------

describe('isDictionaryCategory', () => {
  describe('patterns', () => {
    test('matches dict with "pattern" in name', () => {
      expect(isDictionaryCategory('patterns', 'patterns')).toBe(true);
      expect(isDictionaryCategory('pattern-structural', 'patterns')).toBe(true);
    });
    test('rejects unrelated names', () => {
      expect(isDictionaryCategory('phrases', 'patterns')).toBe(false);
      expect(isDictionaryCategory('characters', 'patterns')).toBe(false);
    });
  });

  describe('properNouns', () => {
    test('matches "proper" prefix', () => {
      expect(isDictionaryCategory('properNouns', 'properNouns')).toBe(true);
      expect(isDictionaryCategory('properNouns-f_DuongThan', 'properNouns')).toBe(true);
    });
    test('matches "noun" substring', () => {
      expect(isDictionaryCategory('propernouns', 'properNouns')).toBe(true);
    });
    test('matches "place" substring', () => {
      expect(isDictionaryCategory('placeNames', 'properNouns')).toBe(true);
    });
    test('matches "character" substring (preserves existing behaviour)', () => {
      expect(isDictionaryCategory('characters', 'properNouns')).toBe(true);
    });
    test('rejects phrases / numbers', () => {
      expect(isDictionaryCategory('phrases', 'properNouns')).toBe(false);
      expect(isDictionaryCategory('numbers', 'properNouns')).toBe(false);
    });
  });

  describe('phrases', () => {
    test('matches "phrases" exact and substring', () => {
      expect(isDictionaryCategory('phrases', 'phrases')).toBe(true);
      expect(isDictionaryCategory('phrases-extended', 'phrases')).toBe(true);
    });
    test('rejects unrelated', () => {
      expect(isDictionaryCategory('characters', 'phrases')).toBe(false);
    });
  });

  describe('characters', () => {
    test('matches exact name "characters" only', () => {
      expect(isDictionaryCategory('characters', 'characters')).toBe(true);
    });
    test('rejects names that merely contain "characters"', () => {
      expect(isDictionaryCategory('extraCharacters', 'characters')).toBe(false);
    });
    test('rejects other dicts', () => {
      expect(isDictionaryCategory('phrases', 'characters')).toBe(false);
    });
  });

  describe('numbers', () => {
    test('matches "number" substring', () => {
      expect(isDictionaryCategory('numbers', 'numbers')).toBe(true);
      expect(isDictionaryCategory('numberConversions', 'numbers')).toBe(true);
    });
    test('rejects unrelated', () => {
      expect(isDictionaryCategory('characters', 'numbers')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getIndexedMatches
// ---------------------------------------------------------------------------

type Match = { word: string; priority?: number; dictionary?: string };

function makeIndex(
  position: number,
  entries: Record<string, Match[]>
): Map<number, Record<string, Match[]>> {
  return new Map([[position, entries]]);
}

describe('getIndexedMatches', () => {
  test('returns empty array when position not in index', () => {
    const index = makeIndex(5, { properNouns: [] });
    expect(getIndexedMatches(index, 99, 'properNouns')).toEqual([]);
  });

  test('returns empty array when category absent at position', () => {
    const index = makeIndex(0, { patterns: [{ word: '道' }] });
    expect(getIndexedMatches(index, 0, 'properNouns')).toEqual([]);
  });

  test('JS-built index (camelCase key): properNouns', () => {
    const m: Match = { word: '天道', priority: 1 };
    const index = makeIndex(0, { properNouns: [m] });
    expect(getIndexedMatches(index, 0, 'properNouns')).toEqual([m]);
  });

  test('Rust-built index (snake_case key proper_nouns)', () => {
    const m: Match = { word: '天道', priority: 1 };
    const index = makeIndex(0, { proper_nouns: [m] } as Record<string, Match[]>);
    expect(getIndexedMatches(index, 0, 'properNouns')).toEqual([m]);
  });

  test('JS key takes precedence over Rust key when both present', () => {
    const jsMatch: Match = { word: 'js', priority: 1 };
    const rustMatch: Match = { word: 'rust', priority: 1 };
    const index = makeIndex(0, {
      properNouns: [jsMatch],
      proper_nouns: [rustMatch],
    } as Record<string, Match[]>);
    expect(getIndexedMatches(index, 0, 'properNouns')).toEqual([jsMatch]);
  });

  test('single match returned without copying', () => {
    const m: Match = { word: '道', priority: 2 };
    const index = makeIndex(0, { characters: [m] });
    const result = getIndexedMatches(index, 0, 'characters');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(m);
  });

  test('sorts by word length descending', () => {
    const short: Match = { word: '道', priority: 1 };
    const long: Match = { word: '天道', priority: 2 };
    const index = makeIndex(0, { properNouns: [short, long] });
    const result = getIndexedMatches(index, 0, 'properNouns');
    expect(result[0].word).toBe('天道');
    expect(result[1].word).toBe('道');
  });

  test('equal length: lower priority number wins (tiebreak)', () => {
    const highPri: Match = { word: '天道', priority: 1 };
    const lowPri: Match = { word: '大道', priority: 5 };
    const index = makeIndex(0, { properNouns: [lowPri, highPri] });
    const result = getIndexedMatches(index, 0, 'properNouns');
    expect(result[0]).toBe(highPri);
  });

  test('missing priority treated as 0', () => {
    const noPri: Match = { word: '天道' };
    const withPri: Match = { word: '大道', priority: 1 };
    const index = makeIndex(0, { properNouns: [withPri, noPri] });
    const result = getIndexedMatches(index, 0, 'properNouns');
    expect(result[0]).toBe(noPri);
  });

  test('does not mutate original array', () => {
    const m1: Match = { word: '道', priority: 1 };
    const m2: Match = { word: '天道', priority: 2 };
    const original = [m1, m2];
    const index = makeIndex(0, { properNouns: original });
    getIndexedMatches(index, 0, 'properNouns');
    expect(original[0]).toBe(m1);
    expect(original[1]).toBe(m2);
  });
});
