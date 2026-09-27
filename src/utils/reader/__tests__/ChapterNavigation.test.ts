import { describe, expect, test } from 'vitest';
import { currentChapterIndex, patternInEffect, stepChapter } from '../ChapterNavigation';
import type { ChapterHeader } from '../../../types/ReaderTypes';

function headersAt(...lines: number[]): ChapterHeader[] {
  return lines.map((line) => ({ line, title: `Chapter at ${line}` }));
}

describe('currentChapterIndex', () => {
  test('picks the last header at or before the given line', () => {
    const headers = headersAt(0, 100, 250);
    expect(currentChapterIndex(headers, 0)).toBe(0);
    expect(currentChapterIndex(headers, 99)).toBe(0);
    expect(currentChapterIndex(headers, 100)).toBe(1);
    expect(currentChapterIndex(headers, 999)).toBe(2);
  });

  test('returns -1 when the line precedes every header', () => {
    const headers = headersAt(50, 100);
    expect(currentChapterIndex(headers, 10)).toBe(-1);
  });

  test('returns -1 for an empty header list', () => {
    expect(currentChapterIndex([], 500)).toBe(-1);
  });

  test('an exact match on a header line selects that header, not the one before it', () => {
    const headers = headersAt(0, 42, 84);
    expect(currentChapterIndex(headers, 42)).toBe(1);
  });
});

describe('stepChapter', () => {
  test('steps to the next header past the current line', () => {
    const headers = headersAt(0, 100, 250);
    expect(stepChapter(headers, 50, 1)).toEqual({ line: 100, title: 'Chapter at 100' });
  });

  test("steps back to the current chapter's own start when mid-chapter", () => {
    // Media-player back-button convention: from inside chapter 100, one press returns
    // to its own start (100), not straight past it to chapter 0.
    const headers = headersAt(0, 100, 250);
    expect(stepChapter(headers, 150, -1)).toEqual({ line: 100, title: 'Chapter at 100' });
  });

  test('steps to the previous chapter when already sitting on a header line', () => {
    const headers = headersAt(0, 100, 250);
    expect(stepChapter(headers, 100, -1)).toEqual({ line: 0, title: 'Chapter at 0' });
  });

  test('returns null stepping past the last chapter', () => {
    const headers = headersAt(0, 100);
    expect(stepChapter(headers, 150, 1)).toBeNull();
  });

  test("steps back to the first chapter's own start when mid-chapter, rather than null", () => {
    const headers = headersAt(0, 100);
    expect(stepChapter(headers, 10, -1)).toEqual({ line: 0, title: 'Chapter at 0' });
  });

  test("returns null stepping back from the first chapter's own start — nothing before it", () => {
    const headers = headersAt(0, 100);
    expect(stepChapter(headers, 0, -1)).toBeNull();
  });

  test('stepping forward before any chapter starts lands on the first one', () => {
    const headers = headersAt(50, 100);
    expect(stepChapter(headers, 10, 1)).toEqual({ line: 50, title: 'Chapter at 50' });
  });

  test('an empty header list always returns null', () => {
    expect(stepChapter([], 10, 1)).toBeNull();
    expect(stepChapter([], 10, -1)).toBeNull();
  });
});

describe('patternInEffect', () => {
  test("the reader's override wins over election", () => {
    expect(patternInEffect('volume', 'chapter')).toBe('volume');
  });

  test('without an override, election decides', () => {
    expect(patternInEffect(null, 'chapter')).toBe('chapter');
  });

  test('neither means no outline at all', () => {
    expect(patternInEffect(null, null)).toBeNull();
  });
});
