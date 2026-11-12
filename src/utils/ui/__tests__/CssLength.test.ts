import { describe, it, expect } from 'vitest';
import { cssLengthToPx, lineHeightToPx } from '../CssLength';

const context = { rootFontSizePx: 16, fontSizePx: 20 };

describe('cssLengthToPx', () => {
  it('reads a pixel length as itself', () => {
    expect(cssLengthToPx('12px', context)).toBe(12);
  });

  it('scales rem by the root font size', () => {
    expect(cssLengthToPx('1.5rem', context)).toBe(24);
  });

  it('scales em by the element’s own font size', () => {
    expect(cssLengthToPx('0.5em', context)).toBe(10);
  });

  it('reads a bare number as pixels — what a stray "0" means', () => {
    expect(cssLengthToPx('0', context)).toBe(0);
  });

  it('tolerates the whitespace a computed custom property comes back with', () => {
    expect(cssLengthToPx('  1rem  ', context)).toBe(16);
  });

  it('returns null for an unset property, so the caller can fall back', () => {
    expect(cssLengthToPx('', context)).toBeNull();
    expect(cssLengthToPx('   ', context)).toBeNull();
  });

  it('returns null for a unit it cannot resolve without layout', () => {
    expect(cssLengthToPx('5%', context)).toBeNull();
    expect(cssLengthToPx('2vh', context)).toBeNull();
    expect(cssLengthToPx('normal', context)).toBeNull();
  });

  it('returns null for a negative length — no row has negative padding', () => {
    expect(cssLengthToPx('-1rem', context)).toBeNull();
  });
});

describe('lineHeightToPx', () => {
  it('scales a unitless ratio by the element’s font size', () => {
    expect(lineHeightToPx('1.45', context)).toBe(29);
  });

  it('scales a percentage by the element’s font size', () => {
    expect(lineHeightToPx('150%', context)).toBe(30);
  });

  it('resolves a length the way cssLengthToPx does', () => {
    expect(lineHeightToPx('28px', context)).toBe(28);
    expect(lineHeightToPx('2rem', context)).toBe(32);
    expect(lineHeightToPx('1.5em', context)).toBe(30);
  });

  it('returns null for `normal` and an unset property, so the caller can fall back', () => {
    expect(lineHeightToPx('normal', context)).toBeNull();
    expect(lineHeightToPx('', context)).toBeNull();
  });
});
