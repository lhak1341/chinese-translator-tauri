import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMoveTargetDictionaries } from '../useMoveTargetDictionaries';

let dictionaryTypes: Record<string, object>;

// The list comes from the Dictionary Store, through the provider.
vi.mock('../../components/dictionary/DictionaryContext', () => ({
  useDictionary: () => ({ dictionaryTypes }),
}));

describe('useMoveTargetDictionaries', () => {
  beforeEach(() => {
    dictionaryTypes = {};
  });

  it('offers same-family targets only, filtering out the current one, base dictionaries first', () => {
    dictionaryTypes = {
      properNouns: {},
      phrases: {},
      characters: {},
      patterns: {},
      'properNouns-HarryPotter': {},
    };

    const { result } = renderHook(() => useMoveTargetDictionaries('phrases'));

    expect(result.current.availableDictionaries).toEqual([
      { id: 'properNouns', label: 'Proper Nouns (Base)' },
      { id: 'properNouns-HarryPotter', label: 'Proper Nouns - HarryPotter' },
    ]);
  });

  it('offers only pattern dictionaries for a pattern source', () => {
    dictionaryTypes = {
      patterns: {},
      'patterns-f_DuongThan': {},
      phrases: {},
      properNouns: {},
    };

    const { result } = renderHook(() => useMoveTargetDictionaries('patterns-f_DuongThan'));

    expect(result.current.availableDictionaries).toEqual([
      { id: 'patterns', label: 'Patterns (Base)' },
    ]);
  });

  it('offers nothing for a string-only lookup table', () => {
    dictionaryTypes = { characters: {}, conversion: {}, phrases: {} };

    const { result } = renderHook(() => useMoveTargetDictionaries('characters'));

    expect(result.current.availableDictionaries).toEqual([]);
  });

  it('excludes the current dictionary id from the available list', () => {
    dictionaryTypes = { properNouns: {}, phrases: {} };

    const { result } = renderHook(() => useMoveTargetDictionaries('properNouns'));

    expect(result.current.availableDictionaries.map((d) => d.id)).toEqual(['phrases']);
  });

  it('follows the list when the store changes it (a dictionary renamed or created)', () => {
    dictionaryTypes = { properNouns: {}, phrases: {} };
    const { result, rerender } = renderHook(() => useMoveTargetDictionaries('phrases'));

    dictionaryTypes = { properNouns: {}, phrases: {}, 'properNouns-New': {} };
    rerender();

    expect(result.current.availableDictionaries.map((d) => d.id)).toEqual([
      'properNouns',
      'properNouns-New',
    ]);
  });

  it.each([
    ['properNouns', 'Proper Nouns (Base)'],
    ['properNouns-HarryPotter', 'Proper Nouns - HarryPotter'],
    ['characters', 'Characters'],
  ])('derives sourceLabel for %s from the id alone', (id, expected) => {
    const { result } = renderHook(() => useMoveTargetDictionaries(id));

    expect(result.current.sourceLabel).toBe(expected);
  });
});
