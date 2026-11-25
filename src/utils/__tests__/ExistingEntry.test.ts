import { describe, it, expect } from 'vitest';
import { findExistingEntry } from '../dictionary/ExistingEntry';
import type { DictionaryData } from '../../types/DictionaryTypes';

// Object key order is insertion order, which plays the disk order `Object.keys` reads.
describe('findExistingEntry', () => {
  it('names the target when it holds the source', () => {
    const dictionaries = { properNouns: { 林动: { translation: 'Lâm Động' } } };
    expect(findExistingEntry(dictionaries, '林动', 'properNouns')).toEqual({
      dictionaryId: 'properNouns',
      translation: 'Lâm Động',
      inTarget: true,
    });
  });

  it('prefers the target over a holder listed before it on disk', () => {
    const dictionaries: Record<string, DictionaryData> = {
      'properNouns-f_A': { 林动: { translation: 'Lam Dong' } },
      phrases: { 林动: 'lâm động' },
      properNouns: { 林动: { translation: 'Lâm Động' } },
    };
    expect(findExistingEntry(dictionaries, '林动', 'properNouns')).toMatchObject({
      dictionaryId: 'properNouns',
      inTarget: true,
    });
  });

  it('without the target, picks the first holder in display order, not disk order', () => {
    const dictionaries: Record<string, DictionaryData> = {
      'properNouns-f_A': { 林动: { translation: 'Lam Dong' } },
      characters: { 林: 'lâm' },
      phrases: { 林动: 'lâm động' },
    };
    expect(findExistingEntry(dictionaries, '林动', 'properNouns-f_B')).toEqual({
      dictionaryId: 'phrases',
      translation: 'lâm động',
      inTarget: false,
    });
  });

  it('counts a lookup table as a holder', () => {
    const dictionaries = { characters: { 林: 'lâm' } };
    expect(findExistingEntry(dictionaries, '林', 'phrases')).toMatchObject({
      dictionaryId: 'characters',
      translation: 'lâm',
    });
  });

  it('trims the source', () => {
    const dictionaries = { phrases: { 你好: 'xin chào' } };
    expect(findExistingEntry(dictionaries, '  你好 ', 'phrases')?.inTarget).toBe(true);
  });

  it('is null for an empty source, the edited entry itself, or no holder', () => {
    const dictionaries = { phrases: { 你好: 'xin chào' } };
    expect(findExistingEntry(dictionaries, '   ', 'phrases')).toBeNull();
    expect(findExistingEntry(dictionaries, '你好', 'phrases', '你好')).toBeNull();
    expect(findExistingEntry(dictionaries, '再见', 'phrases')).toBeNull();
  });

  it('skips an unread dictionary and never reads an inherited key', () => {
    const dictionaries = { phrases: undefined, characters: { 你: 'bạn' } };
    expect(findExistingEntry(dictionaries, '你', 'phrases')?.dictionaryId).toBe('characters');
    expect(findExistingEntry({ characters: {} }, 'constructor', 'phrases')).toBeNull();
  });
});
