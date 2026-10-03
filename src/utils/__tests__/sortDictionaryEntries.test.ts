import { describe, test, expect } from 'vitest';
import { sortDictionaryEntries } from '../dictionary/sortDictionaryEntries';

describe('sortDictionaryEntries', () => {
  test('puts longer keys first, then alphabetical within a length', () => {
    const sorted = sortDictionaryEntries({ b: '1', ccc: '2', a: '3', bb: '4', aa: '5' });
    expect(Object.keys(sorted)).toEqual(['ccc', 'aa', 'bb', 'a', 'b']);
  });

  test('returns a new object and leaves the input alone', () => {
    const input = { b: '1', a: '2' };
    const sorted = sortDictionaryEntries(input);
    expect(sorted).not.toBe(input);
    expect(Object.keys(input)).toEqual(['b', 'a']);
  });

  test('keeps every entry and its value', () => {
    const input = { 张三: { translation: 'x' }, 李: { translation: 'y' } };
    expect(sortDictionaryEntries(input)).toEqual(input);
  });

  test('keeps no state between calls', () => {
    sortDictionaryEntries({ a: 'old', bb: '2' });
    expect(sortDictionaryEntries({ a: 'new', bb: '2' }).a).toBe('new');
  });

  test('an empty dictionary stays empty', () => {
    expect(sortDictionaryEntries({})).toEqual({});
  });
});
