import { describe, it, expect } from 'vitest';
import { compareMatchesBySpecificityThenPriority } from '../dictionary/MatchComparator';

describe('compareMatchesBySpecificityThenPriority', () => {
  it('sorts longer word before shorter word regardless of priority', () => {
    const short = { word: '元', priority: 1 };
    const long = { word: '元始圣人', priority: 10 };
    expect(compareMatchesBySpecificityThenPriority(long, short)).toBeLessThan(0);
    expect(compareMatchesBySpecificityThenPriority(short, long)).toBeGreaterThan(0);
  });

  it('tie-breaks equal-length words by lower priority number winning', () => {
    const higherPriority = { word: '孔宣', priority: 1 };
    const lowerPriority = { word: '宣兄', priority: 10 };
    expect(compareMatchesBySpecificityThenPriority(higherPriority, lowerPriority)).toBeLessThan(0);
    expect(compareMatchesBySpecificityThenPriority(lowerPriority, higherPriority)).toBeGreaterThan(
      0
    );
  });

  it('returns 0 for equal length and equal priority', () => {
    const a = { word: '张三', priority: 5 };
    const b = { word: '李四', priority: 5 };
    expect(compareMatchesBySpecificityThenPriority(a, b)).toBe(0);
  });

  it('sorts a mixed array into length-desc then priority-asc order', () => {
    const matches = [
      { word: 'a', priority: 1 },
      { word: 'abc', priority: 5 },
      { word: 'ab', priority: 2 },
      { word: 'ab', priority: 1 },
    ];
    const sorted = [...matches].sort(compareMatchesBySpecificityThenPriority);
    expect(sorted.map((m) => `${m.word}:${m.priority}`)).toEqual(['abc:5', 'ab:1', 'ab:2', 'a:1']);
  });
});
