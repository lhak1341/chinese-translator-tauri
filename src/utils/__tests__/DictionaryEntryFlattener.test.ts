import { describe, it, expect } from 'vitest';
import { flattenDictionaryEntries } from '../dictionary/DictionaryEntryFlattener';

describe('flattenDictionaryEntries', () => {
  it('flattens string-valued entries with null metadata', () => {
    const result = flattenDictionaryEntries({ 你好: 'xin chào' });
    expect(result).toEqual([{ chinese: '你好', vietnamese: 'xin chào', metadata: null }]);
  });

  it('flattens object-valued entries, extracting translation and stringifying the rest as metadata', () => {
    const result = flattenDictionaryEntries({
      张三: { translation: 'Trương Tam', semanticType: 'person' },
    });
    expect(result).toEqual([
      {
        chinese: '张三',
        vietnamese: 'Trương Tam',
        metadata: JSON.stringify({ semanticType: 'person' }),
      },
    ]);
  });

  it('does not compute priority/frequency/dictionary itself — only passes through what the source object already has', () => {
    // Confirms the deliberate simplification vs DictionaryManager's trie-insert loop, which
    // derives these fields. The flattener never adds them; it only echoes source JSON fields.
    const withNone = flattenDictionaryEntries({ 张三: { translation: 'Trương Tam' } });
    expect(withNone[0].metadata).toBeNull();

    const withExplicit = flattenDictionaryEntries({
      张三: { translation: 'Trương Tam', priority: 1 },
    });
    expect(JSON.parse(withExplicit[0].metadata as string)).toEqual({ priority: 1 });
  });

  it('sets metadata to null when the object value has no fields besides translation', () => {
    const result = flattenDictionaryEntries({ 你好: { translation: 'xin chào' } });
    expect(result).toEqual([{ chinese: '你好', vietnamese: 'xin chào', metadata: null }]);
  });

  it('skips malformed entries (object without a string translation)', () => {
    const result = flattenDictionaryEntries({
      good: 'ok',
      // @ts-expect-error deliberately malformed for the test
      bad: { notTranslation: true },
    });
    expect(result).toEqual([{ chinese: 'good', vietnamese: 'ok', metadata: null }]);
  });

  it('returns an empty array for an empty dictionary', () => {
    expect(flattenDictionaryEntries({})).toEqual([]);
  });

  it('preserves entry order matching Object.entries iteration order', () => {
    const result = flattenDictionaryEntries({ 一: 'one', 二: 'two', 三: 'three' });
    expect(result.map((e) => e.chinese)).toEqual(['一', '二', '三']);
  });
});
