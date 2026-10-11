import { describe, it, expect } from 'vitest';
import { resolveHighlights, type LitUnit } from '../highlighting/HighlightResolver';
import type { SemanticArrays } from '../../types/SemanticTypes';
import { makeMeta } from '../../test/makeMeta';

const arrays = (original: string[]): SemanticArrays => ({
  original,
  translated: original.map((_, i) => `tr${i}`),
  metadata: original.map((_, i) => makeMeta({ source: 'characters', tokenIndex: i })),
});

// Original units are variable-length; Character Only units are one character each.
const SEMANTIC = arrays(['你', '好吗', '世']);
const CHAR_ONLY = arrays(['你', '好', '吗', '世']);

const lit = (index: number, overrides: Partial<LitUnit> = {}): LitUnit => ({
  index,
  arrays: SEMANTIC,
  fromCharacterOnly: false,
  ...overrides,
});

describe('resolveHighlights', () => {
  it('lights nothing when nothing is lit', () => {
    expect(resolveHighlights(null, SEMANTIC, CHAR_ONLY)).toEqual({
      litIndex: -1,
      characterOnlyUnitIndex: -1,
    });
  });

  it('lights the unit in the main panels and maps it to the Character Only units', () => {
    expect(resolveHighlights(lit(1), SEMANTIC, CHAR_ONLY)).toEqual({
      litIndex: 1,
      characterOnlyUnitIndex: [1, 2],
    });
  });

  it('keeps the Character Only panel cleared after a Character Only click, so it is not mapped back', () => {
    expect(resolveHighlights(lit(2, { fromCharacterOnly: true }), SEMANTIC, CHAR_ONLY)).toEqual({
      litIndex: 2,
      characterOnlyUnitIndex: -1,
    });
  });

  it('leaves the Character Only panel cleared without Character Only arrays', () => {
    expect(resolveHighlights(lit(1), SEMANTIC, null)).toEqual({
      litIndex: 1,
      characterOnlyUnitIndex: -1,
    });
  });

  it('leaves the Character Only panel cleared when the unit has no match there', () => {
    const noMatch = arrays(['无', '关']);
    expect(resolveHighlights(lit(0, { arrays: noMatch }), noMatch, CHAR_ONLY)).toEqual({
      litIndex: 0,
      characterOnlyUnitIndex: -1,
    });
  });

  describe('stale highlights', () => {
    it('lights nothing once the main arrays are a different reference', () => {
      const next = arrays(['你', '好吗', '世']); // equal content, new reference
      expect(resolveHighlights(lit(1), next, CHAR_ONLY)).toEqual({
        litIndex: -1,
        characterOnlyUnitIndex: -1,
      });
    });

    it('lights nothing while the main arrays are missing', () => {
      expect(resolveHighlights(lit(1), null, CHAR_ONLY).litIndex).toBe(-1);
    });

    it('still lights the unit when only the Character Only arrays change', () => {
      const nextCharOnly = arrays(['你', '好', '吗', '世']);
      expect(resolveHighlights(lit(1), SEMANTIC, nextCharOnly)).toEqual({
        litIndex: 1,
        characterOnlyUnitIndex: [1, 2],
      });
    });
  });

  describe('out-of-range indices', () => {
    it.each([-1, 3, 99, 1.5, Number.NaN])('lights nothing for index %s', (index) => {
      expect(resolveHighlights(lit(index), SEMANTIC, CHAR_ONLY)).toEqual({
        litIndex: -1,
        characterOnlyUnitIndex: -1,
      });
    });
  });

  it('returns one shared object whenever nothing is lit, so a memo keyed on it stays stable', () => {
    expect(resolveHighlights(null, SEMANTIC, CHAR_ONLY)).toBe(
      resolveHighlights(lit(99), SEMANTIC, CHAR_ONLY)
    );
  });
});
