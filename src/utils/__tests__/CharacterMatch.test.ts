import { describe, test, expect } from 'vitest';
import { characterMatchFor } from '../dictionary/CharacterMatch';

const lookup = (entries: Record<string, string>) => ({
  lookupCharacter: (word: string) => entries[word] ?? null,
});

describe('characterMatchFor', () => {
  test('a one-token match for a word the dictionary has', () => {
    expect(characterMatchFor(lookup({ 说: 'thuyết' }), { value: '说' })).toEqual({
      word: '说',
      translation: 'thuyết',
      dictionary: 'characters',
      tokenLength: 1,
    });
  });

  test('null for a word it lacks', () => {
    expect(characterMatchFor(lookup({ 说: 'thuyết' }), { value: '别' })).toBeNull();
  });

  test('null for an empty translation, as for a miss', () => {
    expect(characterMatchFor(lookup({ 说: '' }), { value: '说' })).toBeNull();
  });
});
