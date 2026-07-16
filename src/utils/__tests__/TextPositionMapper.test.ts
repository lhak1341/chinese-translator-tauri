import { describe, it, expect } from 'vitest';
import {
  mapToPositions,
  compareByTokenIndex,
  resolveTokenIndex,
} from '../highlighting/TextPositionMapper';

describe('resolveTokenIndex', () => {
  it('passes through a valid non-negative tokenIndex', () => {
    expect(resolveTokenIndex(5)).toBe(5);
    expect(resolveTokenIndex(0)).toBe(0);
  });

  it.each([null, undefined, -1])('treats %s as missing, sorting last', (value) => {
    expect(resolveTokenIndex(value as number | null | undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('compareByTokenIndex', () => {
  it('sorts ascending by tokenIndex', () => {
    expect(compareByTokenIndex(1, 5)).toBeLessThan(0);
    expect(compareByTokenIndex(5, 1)).toBeGreaterThan(0);
    expect(compareByTokenIndex(3, 3)).toBe(0);
  });

  it('sorts missing tokenIndex (null/undefined/-1) after any valid one', () => {
    expect(compareByTokenIndex(undefined, 0)).toBeGreaterThan(0);
    expect(compareByTokenIndex(0, undefined)).toBeLessThan(0);
    expect(compareByTokenIndex(-1, 0)).toBeGreaterThan(0);
  });

  it('treats two missing tokenIndex values as equal', () => {
    expect(compareByTokenIndex(undefined, null)).toBe(0);
  });
});

describe('mapToPositions', () => {
  // ── basic case-sensitive ──────────────────────────────────────────────────

  it('maps each character of a single unit to its index', () => {
    const result = mapToPositions('hello', ['hello'], 1);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0]);
  });

  it('maps multiple non-overlapping units correctly', () => {
    const result = mapToPositions('helloworld', ['hello', 'world'], 2);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it('leaves unmapped characters as -1', () => {
    const result = mapToPositions('hello world', ['hello', 'world'], 2);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, -1, 1, 1, 1, 1, 1]);
  });

  it('returns all -1 for empty text', () => {
    const result = mapToPositions('', ['hello'], 1);
    expect(result.length).toBe(0);
  });

  it('returns all -1 when count is 0', () => {
    const result = mapToPositions('hello', ['hello'], 0);
    expect(Array.from(result)).toEqual([-1, -1, -1, -1, -1]);
  });

  it('returns all -1 when no unit matches', () => {
    const result = mapToPositions('hello', ['world'], 1);
    expect(Array.from(result)).toEqual([-1, -1, -1, -1, -1]);
  });

  // ── case-insensitive ──────────────────────────────────────────────────────

  it('matches case-insensitively when flag is true', () => {
    const result = mapToPositions('Hello World', ['hello', 'world'], 2, true);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, -1, 1, 1, 1, 1, 1]);
  });

  it('does NOT match case-insensitively when flag is false', () => {
    const result = mapToPositions('Hello', ['hello'], 1, false);
    expect(Array.from(result)).toEqual([-1, -1, -1, -1, -1]);
  });

  it('matches Vietnamese uppercase diacritics case-insensitively', () => {
    // "Ở" (U+1EDE) should match unit "ở" (U+1EDF) in caseInsensitive mode
    const upper = 'Ở';
    const lower = 'ở';
    const result = mapToPositions(upper, [lower], 1, true);
    expect(result[0]).toBe(0);
  });

  // ── greedy longest match ──────────────────────────────────────────────────

  it('picks longest match when shorter match also starts at same position', () => {
    // "hello" starts at 0; "hell" also starts at 0 — longer wins
    const result = mapToPositions('hello', ['hell', 'hello'], 2);
    // unit index 1 ("hello") wins over unit index 0 ("hell")
    expect(Array.from(result)).toEqual([1, 1, 1, 1, 1]);
    // unit 0 ("hell") is NOT used
    expect(result[0]).toBe(1);
  });

  it('uses shorter unit when longer one does not match', () => {
    const result = mapToPositions('hell', ['hell', 'hello'], 2);
    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });

  // ── no-reuse invariant ────────────────────────────────────────────────────

  it('maps each unit at most once (usedIndices prevents double-mapping)', () => {
    // "la la" — unit "la" appears twice; only the first occurrence gets index 0
    const result = mapToPositions('la la', ['la'], 1);
    expect(result[0]).toBe(0); // first "la"
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(-1); // space
    // second "la" cannot reuse index 0
    expect(result[3]).toBe(-1);
    expect(result[4]).toBe(-1);
  });

  // ── CRITICAL-1: empty unit strings ───────────────────────────────────────

  it('skips empty strings in units array (CRITICAL-1)', () => {
    // count=3, but units[0] is empty — should not crash, should map via unit[1]
    const result = mapToPositions('hello', ['', 'hello', ''], 3);
    expect(Array.from(result)).toEqual([1, 1, 1, 1, 1]);
  });

  // ── CRITICAL-5: bounds check ──────────────────────────────────────────────

  it('does not match a unit longer than remaining text (CRITICAL-5)', () => {
    // text is "hel", unit is "hello" — unit is longer than remaining text
    const result = mapToPositions('hel', ['hello'], 1);
    expect(Array.from(result)).toEqual([-1, -1, -1]);
  });

  it('matches a unit that exactly fills remaining text', () => {
    const result = mapToPositions('lo', ['hello', 'lo'], 2);
    // "hello" doesn't fit; "lo" fits exactly
    expect(Array.from(result)).toEqual([1, 1]);
  });

  // ── Chinese characters ────────────────────────────────────────────────────

  it('maps Chinese characters by exact match (case-sensitive default)', () => {
    const result = mapToPositions('你好世界', ['你好', '世界'], 2);
    expect(Array.from(result)).toEqual([0, 0, 1, 1]);
  });

  it('returns Int32Array (not regular array)', () => {
    const result = mapToPositions('hi', ['hi'], 1);
    expect(result).toBeInstanceOf(Int32Array);
  });

  // ── count boundary ────────────────────────────────────────────────────────

  it('respects count — units beyond count are ignored', () => {
    // count=1, so only units[0]="hello" is used, units[1]="world" is ignored
    const result = mapToPositions('helloworld', ['hello', 'world'], 1);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, -1, -1, -1, -1, -1]);
  });
});
