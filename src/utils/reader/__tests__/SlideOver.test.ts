import { describe, expect, test } from 'vitest';
import { NO_SLIDE_OVER, nextSlideOver, type SlideOver } from '../SlideOver';

const outline: SlideOver = { kind: 'outline', focusSearch: false };
const finder: SlideOver = { kind: 'finder', litLine: null };
const litFinder: SlideOver = { kind: 'finder', litLine: 42 };

describe('nextSlideOver', () => {
  test('opening the outline leaves the finder: its run is cancelled and the lit line goes', () => {
    expect(nextSlideOver(litFinder, { kind: 'outline', focusSearch: true })).toEqual({
      next: { kind: 'outline', focusSearch: true },
      leftFinder: true,
    });
  });

  test('opening the finder replaces the outline, with nothing lit', () => {
    expect(nextSlideOver(outline, { kind: 'finder' })).toEqual({ next: finder, leftFinder: false });
  });

  test('opening the finder while it is open changes nothing', () => {
    const { next, leftFinder } = nextSlideOver(litFinder, { kind: 'finder' });
    expect(next).toBe(litFinder);
    expect(leftFinder).toBe(false);
  });

  test('opening the outline while it is open applies the new focusSearch', () => {
    const { next } = nextSlideOver(outline, { kind: 'outline', focusSearch: true });
    expect(next).toEqual({ kind: 'outline', focusSearch: true });
    expect(next).not.toBe(outline);
  });

  test('a jump lights its line only while the finder is open', () => {
    expect(nextSlideOver(finder, { kind: 'lit', line: 7 }).next).toEqual({
      kind: 'finder',
      litLine: 7,
    });
    expect(nextSlideOver(outline, { kind: 'lit', line: 7 }).next).toBe(outline);
    expect(nextSlideOver(NO_SLIDE_OVER, { kind: 'lit', line: 7 }).next).toBe(NO_SLIDE_OVER);
  });

  test('a close closes only the panel it names', () => {
    expect(nextSlideOver(litFinder, { kind: 'close', panel: 'finder' })).toEqual({
      next: NO_SLIDE_OVER,
      leftFinder: true,
    });
    expect(nextSlideOver(outline, { kind: 'close', panel: 'outline' }).next).toBe(NO_SLIDE_OVER);
    const stray = nextSlideOver(litFinder, { kind: 'close', panel: 'outline' });
    expect(stray.next).toBe(litFinder);
    expect(stray.leftFinder).toBe(false);
  });
});
