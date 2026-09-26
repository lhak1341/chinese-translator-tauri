import { describe, test, expect } from 'vitest';
import { getIndexedMatches } from '../dictionary/LookupIndexUtils';

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

  test('properNouns key (both JS-built and Rust-built indexes use camelCase)', () => {
    const m: Match = { word: '天道', priority: 1 };
    const index = makeIndex(0, { properNouns: [m] });
    expect(getIndexedMatches(index, 0, 'properNouns')).toEqual([m]);
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
