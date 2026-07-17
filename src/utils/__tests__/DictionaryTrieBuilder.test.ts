import { describe, test, expect, vi } from 'vitest';
import {
  resolveDictionaryPriority,
  buildTrieFromDictionary,
} from '../dictionary/DictionaryTrieBuilder';

describe('resolveDictionaryPriority', () => {
  test('fiction-specific proper noun prefix always wins, priority 1', () => {
    expect(
      resolveDictionaryPriority('properNouns-f_MyNovel', { 'properNouns-f_MyNovel': 99 })
    ).toBe(1);
  });

  test('generic proper noun prefix wins over caller priorities map, priority 2', () => {
    expect(resolveDictionaryPriority('properNouns-_generic', { 'properNouns-_generic': 99 })).toBe(
      2
    );
  });

  test('uses caller-supplied priorities map when present', () => {
    expect(resolveDictionaryPriority('phrases', { phrases: 3 })).toBe(3);
  });

  test('falls back to 3 for an unmapped properNouns-prefixed dictionary', () => {
    expect(resolveDictionaryPriority('properNouns', {})).toBe(3);
  });

  test('falls back to 10 for an unmapped, non-properNouns dictionary', () => {
    expect(resolveDictionaryPriority('unknownDict', {})).toBe(10);
  });
});

describe('buildTrieFromDictionary', () => {
  const estimateFrequency = vi.fn((source: string) => source.length);

  test('inserts string-value entries with computed metadata', () => {
    const result = buildTrieFromDictionary({ 好: 'tốt' }, 'characters', 4, estimateFrequency);

    expect(result.entryCount).toBe(1);
    expect(result.invalidSources).toEqual([]);
    const entry = result.trie.getWithMetadata('好');
    expect(entry.translation).toBe('tốt');
    expect(entry.metadata).toMatchObject({
      dictionary: 'characters',
      priority: 4,
      frequency: 1,
    });
  });

  test('inserts object-value entries, preserving allowAsPatternVariable/semanticType/allowedVariableTypes', () => {
    const result = buildTrieFromDictionary(
      {
        你好: {
          translation: 'xin chào',
          allowAsPatternVariable: true,
          semanticType: 'greeting',
          allowedVariableTypes: ['concept'],
        },
      },
      'phrases',
      3,
      estimateFrequency
    );

    const entry = result.trie.getWithMetadata('你好');
    expect(entry.translation).toBe('xin chào');
    expect(entry.metadata).toMatchObject({
      allowAsPatternVariable: true,
      semanticType: 'greeting',
      allowedVariableTypes: ['concept'],
    });
  });

  test('preserves explicit allowAsPatternVariable: false rather than defaulting it away', () => {
    const result = buildTrieFromDictionary(
      { 大: { translation: 'to', allowAsPatternVariable: false } },
      'characters',
      4,
      estimateFrequency
    );

    expect(result.trie.getWithMetadata('大').metadata.allowAsPatternVariable).toBe(false);
  });

  test('collects invalid entries (no translation field) without inserting them', () => {
    const result = buildTrieFromDictionary(
      { good: 'tốt', bad: { note: 'missing translation field' } },
      'characters',
      4,
      estimateFrequency
    );

    expect(result.entryCount).toBe(1);
    expect(result.invalidSources).toEqual(['bad']);
    expect(result.trie.getWithMetadata('bad')).toBeNull();
  });

  test('same priority value is used for every entry in the dictionary', () => {
    const result = buildTrieFromDictionary(
      { 一: '1', 二: '2', 三: '3' },
      'characters',
      4,
      estimateFrequency
    );

    expect(result.trie.getWithMetadata('一').metadata.priority).toBe(4);
    expect(result.trie.getWithMetadata('二').metadata.priority).toBe(4);
    expect(result.trie.getWithMetadata('三').metadata.priority).toBe(4);
  });
});
