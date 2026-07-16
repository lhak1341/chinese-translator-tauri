import { describe, test, expect } from 'vitest';
import { toPatternsId, toProperNounsId } from '../dictionary/DictionaryIdClassifier';

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
