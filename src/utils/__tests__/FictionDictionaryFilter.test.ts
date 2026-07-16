import { describe, test, expect } from 'vitest';
import { filterDictionariesForEngine } from '../dictionary/FictionDictionaryFilter';

describe('filterDictionariesForEngine', () => {
  test('drops inactive properNouns-* dicts, keeps active ones and base dicts', () => {
    const result = filterDictionariesForEngine(
      {
        properNouns: { a: 1 },
        'properNouns-Active': { b: 2 },
        'properNouns-Inactive': { c: 3 },
        patterns: { p: 1 },
        phrases: { f: 1 },
      },
      ['properNouns', 'properNouns-Active']
    );

    expect(result).toEqual({
      properNouns: { a: 1 },
      'properNouns-Active': { b: 2 },
      patterns: { p: 1 },
      phrases: { f: 1 },
    });
  });

  test('the base "properNouns" dict is dropped too if not itself in activeProperNouns', () => {
    const result = filterDictionariesForEngine(
      { properNouns: { a: 1 }, 'properNouns-Active': { b: 2 } },
      ['properNouns-Active']
    );

    expect(result).toEqual({ 'properNouns-Active': { b: 2 } });
  });

  test('merges a fiction patterns-f_X dict into patterns and strips the raw key', () => {
    const result = filterDictionariesForEngine(
      {
        'properNouns-f_DuongThan': { name: 'x' },
        'patterns-f_DuongThan': { X的Y: 'X của Y' },
        patterns: { base: 'template' },
      },
      ['properNouns-f_DuongThan']
    );

    expect(result.patterns).toEqual({ X的Y: 'X của Y', base: 'template' });
    expect(result['patterns-f_DuongThan']).toBeUndefined();
  });

  test('fiction entries win over global patterns on same-template conflict', () => {
    const result = filterDictionariesForEngine(
      {
        'properNouns-f_DuongThan': { name: 'x' },
        'patterns-f_DuongThan': { X的Y: 'FICTION VERSION' },
        patterns: { X的Y: 'GLOBAL VERSION' },
      },
      ['properNouns-f_DuongThan']
    );

    expect(result.patterns).toEqual({ X的Y: 'FICTION VERSION' });
  });

  test('multiple active fictions merge together', () => {
    const result = filterDictionariesForEngine(
      {
        'properNouns-f_Alpha': {},
        'properNouns-f_Beta': {},
        'patterns-f_Alpha': { a: '1' },
        'patterns-f_Beta': { b: '2' },
      },
      ['properNouns-f_Alpha', 'properNouns-f_Beta']
    );

    expect(result.patterns).toEqual({ a: '1', b: '2' });
  });

  test('empty patterns-f_X dict is a no-op — does not create a patterns key', () => {
    const result = filterDictionariesForEngine(
      {
        'properNouns-f_DuongThan': {},
        'patterns-f_DuongThan': {},
      },
      ['properNouns-f_DuongThan']
    );

    expect(result.patterns).toBeUndefined();
    expect(result['patterns-f_DuongThan']).toBeUndefined();
  });

  test('fiction proper-nouns dict with no paired patterns dict present is unaffected', () => {
    const result = filterDictionariesForEngine({ 'properNouns-f_NoPatterns': { name: 'x' } }, [
      'properNouns-f_NoPatterns',
    ]);

    expect(result).toEqual({ 'properNouns-f_NoPatterns': { name: 'x' } });
  });
});
