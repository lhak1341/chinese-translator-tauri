import { describe, expect, it } from 'vitest';
import { clipAroundMatch, glossParts, splitAroundMatches } from '../CandidateHighlight';

describe('splitAroundMatches', () => {
  it('marks every occurrence and keeps the text between them', () => {
    expect(splitAroundMatches('他说滕青山来了，滕青山笑了', '滕青山')).toEqual([
      { text: '他说', match: false },
      { text: '滕青山', match: true },
      { text: '来了，', match: false },
      { text: '滕青山', match: true },
      { text: '笑了', match: false },
    ]);
  });

  it('handles a match at either edge and joins back to the line', () => {
    const line = '滕青山走了滕青山';
    const parts = splitAroundMatches(line, '滕青山');
    expect(parts[0].match).toBe(true);
    expect(parts[parts.length - 1].match).toBe(true);
    expect(parts.map((part) => part.text).join('')).toBe(line);
  });

  it('returns one plain part when there is no match or no needle', () => {
    expect(splitAroundMatches('没有', '滕青山')).toEqual([{ text: '没有', match: false }]);
    expect(splitAroundMatches('没有', '')).toEqual([{ text: '没有', match: false }]);
    expect(splitAroundMatches('', '滕青山')).toEqual([{ text: '', match: false }]);
  });
});

describe('clipAroundMatch', () => {
  const pad = (n: number): string => '甲'.repeat(n);

  it('leaves a short line alone', () => {
    expect(clipAroundMatch('他说滕青山来了', '滕青山', 20)).toEqual({
      source: '他说滕青山来了',
      cutBefore: false,
      cutAfter: false,
    });
  });

  it('keeps the candidate in a window and says which side(s) it cut', () => {
    const middle = clipAroundMatch(`${pad(50)}滕青山${pad(50)}`, '滕青山', 20);
    expect(middle.cutBefore && middle.cutAfter).toBe(true);
    expect(middle.source).toContain('滕青山');
    expect(Array.from(middle.source)).toHaveLength(20);

    const atStart = clipAroundMatch(`滕青山${pad(50)}`, '滕青山', 20);
    expect(atStart.source.startsWith('滕青山')).toBe(true);
    expect([atStart.cutBefore, atStart.cutAfter]).toEqual([false, true]);

    const atEnd = clipAroundMatch(`${pad(50)}滕青山`, '滕青山', 20);
    expect(atEnd.source.endsWith('滕青山')).toBe(true);
    expect([atEnd.cutBefore, atEnd.cutAfter]).toEqual([true, false]);
    // Sliding back inside the line keeps the full window, not a short one.
    expect(Array.from(atEnd.source)).toHaveLength(20);
    expect(Array.from(atStart.source)).toHaveLength(20);
  });

  it("keeps the book's own ellipsis in the source and adds none for a cut", () => {
    const line = `${pad(40)}他沉默了……滕青山终于开口${pad(40)}`;
    const clipped = clipAroundMatch(line, '滕青山', 20);
    expect(clipped.source).toContain('沉默了……滕青山');
    expect(line).toContain(clipped.source);
    expect([clipped.cutBefore, clipped.cutAfter]).toEqual([true, true]);
  });

  it('keeps the head of a line that does not hold the needle', () => {
    expect(clipAroundMatch(pad(50), '滕青山', 20)).toEqual({
      source: pad(20),
      cutBefore: false,
      cutAfter: true,
    });
  });
});

describe('glossParts', () => {
  // A character-only gloss of 他说滕青山来了: one unit per character.
  const arrays = {
    original: ['他', '说', '滕', '青', '山', '来', '了'],
    translated: ['anh', 'nói', 'Đằng', 'Thanh', 'Sơn', 'đến', 'rồi'],
    metadata: [0, 1, 2, 3, 4, 5, 6].map((tokenIndex) => ({ tokenIndex })),
  };
  const text = 'anh nói Đằng Thanh Sơn đến rồi';

  it('marks the stretch of units that spell the candidate', () => {
    const parts = glossParts(text, arrays, '滕青山');
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(['Đằng Thanh Sơn']);
    expect(parts.map((part) => part.text).join('')).toBe(text);
  });

  it('is one plain part with no units or no match', () => {
    expect(glossParts(text, null, '滕青山')).toEqual([{ text, match: false }]);
    expect(glossParts(text, arrays, '云梦泽').every((part) => !part.match)).toBe(true);
  });
});
