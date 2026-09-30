import { describe, test, expect } from 'vitest';
import { hiddenEdges, scrollLeftToReveal } from '../RevealInRow';

// A 300px-wide row; margins of 12px unless a test says otherwise.
const view = { scrollLeft: 100, viewWidth: 300 };

describe('scrollLeftToReveal', () => {
  test('an item already fully in view (margin included) needs no scroll', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 150, itemEnd: 250 })).toBeNull();
  });

  test('an item cut off at the right edge scrolls just far enough to show it', () => {
    // View ends at 400; the item ends at 420, so scroll by 20 + 12 of margin.
    expect(scrollLeftToReveal({ ...view, itemStart: 350, itemEnd: 420 })).toBe(132);
  });

  test('an item cut off at the left edge scrolls back to its start', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 80, itemEnd: 160 })).toBe(68);
  });

  test('an item wholly beyond the right edge is revealed', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 600, itemEnd: 680 })).toBe(392);
  });

  test('the first item scrolls to the very start, never below 0', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 4, itemEnd: 60 })).toBe(0);
  });

  test('an item wider than the view aligns its start', () => {
    expect(scrollLeftToReveal({ ...view, itemStart: 500, itemEnd: 900 })).toBe(488);
  });
});

describe('hiddenEdges', () => {
  test('a row that fits has nothing hidden', () => {
    expect(hiddenEdges({ scrollLeft: 0, scrollWidth: 200, clientWidth: 200 })).toEqual({
      left: false,
      right: false,
    });
  });

  test('at the start, only the right edge hides chips', () => {
    expect(hiddenEdges({ scrollLeft: 0, scrollWidth: 500, clientWidth: 200 })).toEqual({
      left: false,
      right: true,
    });
  });

  test('in the middle, both edges do', () => {
    expect(hiddenEdges({ scrollLeft: 100, scrollWidth: 500, clientWidth: 200 })).toEqual({
      left: true,
      right: true,
    });
  });

  test('at the end, only the left — within a pixel of slack', () => {
    expect(hiddenEdges({ scrollLeft: 299.5, scrollWidth: 500, clientWidth: 200 })).toEqual({
      left: true,
      right: false,
    });
  });
});
