import { describe, test, expect } from 'vitest';
import {
  kindOf,
  tierOf,
  isFictionProperNounsId,
  isFictionPatternsId,
  toPatternsId,
  toProperNounsId,
  toProperNounsDictionaryId,
} from '../dictionary/DictionaryIdClassifier';

// Every id shape that exists on disk (the id space is closed: fixed names, or ids built by
// toProperNounsDictionaryId / toPatternsId), plus one unknown.
describe.each([
  // id                          kind            tier
  ['properNouns', 'properNouns', 'root'],
  ['properNouns-f_DuongThan', 'properNouns', 'fiction'],
  ['properNouns-_AiCap', 'properNouns', 'generic'],
  ['properNouns-HarryPotter', 'properNouns', 'custom'],
  ['patterns', 'patterns', 'root'],
  ['patterns-f_DuongThan', 'patterns', 'fiction'],
  ['phrases', 'phrases', 'root'],
  ['characters', 'lookupTable', 'root'],
  ['conversion', 'lookupTable', 'root'],
  ['punctuation', 'lookupTable', 'root'],
  ['somethingDroppedInByHand', 'lookupTable', 'root'],
] as const)('%s', (id, kind, tier) => {
  test(`kindOf is ${kind}`, () => expect(kindOf(id)).toBe(kind));
  test(`tierOf is ${tier}`, () => expect(tierOf(id)).toBe(tier));
  test('fiction predicates agree with kind + tier', () => {
    expect(isFictionProperNounsId(id)).toBe(kind === 'properNouns' && tier === 'fiction');
    expect(isFictionPatternsId(id)).toBe(kind === 'patterns' && tier === 'fiction');
  });
});

describe('toPatternsId', () => {
  test('derives paired patterns id from a fiction proper-nouns id', () => {
    expect(toPatternsId('properNouns-f_DuongThan')).toBe('patterns-f_DuongThan');
  });
});

describe('toProperNounsId', () => {
  test('derives paired proper-nouns id from a fiction patterns id', () => {
    expect(toProperNounsId('patterns-f_DuongThan')).toBe('properNouns-f_DuongThan');
  });
});

describe('toProperNounsDictionaryId', () => {
  test('prefixes the raw name with properNouns-', () => {
    expect(toProperNounsDictionaryId('HarryPotter')).toBe('properNouns-HarryPotter');
  });

  test('strips internal whitespace', () => {
    expect(toProperNounsDictionaryId('Harry Potter')).toBe('properNouns-HarryPotter');
  });

  test('trims leading/trailing whitespace', () => {
    expect(toProperNounsDictionaryId('  Harry Potter  ')).toBe('properNouns-HarryPotter');
  });

  test('produces a fiction id when the raw name already carries the f_ convention', () => {
    expect(toProperNounsDictionaryId('f_HarryPotter')).toBe('properNouns-f_HarryPotter');
  });
});

describe('round-trip', () => {
  test('toProperNounsId(toPatternsId(id)) === id', () => {
    const id = 'properNouns-f_HarryPotter';
    expect(toProperNounsId(toPatternsId(id))).toBe(id);
  });

  test('toPatternsId(toProperNounsId(id)) === id', () => {
    const id = 'patterns-f_HarryPotter';
    expect(toPatternsId(toProperNounsId(id))).toBe(id);
  });
});
