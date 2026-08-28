import { describe, test, expect } from 'vitest';
import {
  toPatternsId,
  toProperNounsId,
  toProperNounsDictionaryId,
} from '../dictionary/DictionaryIdClassifier';

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
