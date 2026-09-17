import { describe, expect, it } from 'vitest';
import { boundQuickAddTargets } from '../BoundQuickAddTargets';

const loaded = {
  properNouns: {},
  'properNouns-f_DuongThan': {},
  'patterns-f_DuongThan': {},
};

describe('boundQuickAddTargets', () => {
  it('points both targets at the bound fiction pair', () => {
    expect(boundQuickAddTargets('properNouns-f_DuongThan', loaded)).toEqual({
      properNouns: 'properNouns-f_DuongThan',
      structuralPatterns: 'patterns-f_DuongThan',
    });
  });

  it('answers nothing for a book bound to no fiction dictionary', () => {
    expect(boundQuickAddTargets(null, loaded)).toEqual({
      properNouns: null,
      structuralPatterns: null,
    });
  });

  it('answers nothing for a binding that is not a fiction dictionary', () => {
    // The generic dictionary is a standing choice, never a book's binding — a record
    // carrying it is damaged, and quick-add should fall back rather than act on it.
    expect(boundQuickAddTargets('properNouns', loaded)).toEqual({
      properNouns: null,
      structuralPatterns: null,
    });
    expect(boundQuickAddTargets('properNouns-_Cultivation', loaded)).toEqual({
      properNouns: null,
      structuralPatterns: null,
    });
  });

  it('keeps the proper-noun target when only the paired patterns file is missing', () => {
    const halfPair = { 'properNouns-f_DuongThan': {} };
    expect(boundQuickAddTargets('properNouns-f_DuongThan', halfPair)).toEqual({
      properNouns: 'properNouns-f_DuongThan',
      structuralPatterns: null,
    });
  });
});
