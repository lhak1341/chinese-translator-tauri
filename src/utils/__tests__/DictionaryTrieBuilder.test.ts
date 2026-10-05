import { describe, test, expect } from 'vitest';
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
  test('inserts string-value entries with an empty-field metadata object', () => {
    const result = buildTrieFromDictionary({ 好: 'tốt' });

    expect(result.entryCount).toBe(1);
    expect(result.invalidSources).toEqual([]);
    const entry = result.trie.getWithMetadata('好');
    expect(entry.translation).toBe('tốt');
    expect(entry.metadata).toEqual({ allowAsPatternVariable: undefined });
  });

  test('inserts object-value entries, keeping only allowAsPatternVariable/semanticType', () => {
    const result = buildTrieFromDictionary({
      你好: {
        translation: 'xin chào',
        allowAsPatternVariable: true,
        semanticType: 'greeting',
        allowedVariableTypes: ['concept'],
      },
    });

    const entry = result.trie.getWithMetadata('你好');
    expect(entry.translation).toBe('xin chào');
    expect(entry.metadata).toEqual({
      allowAsPatternVariable: true,
      semanticType: 'greeting',
    });
  });

  test('preserves explicit allowAsPatternVariable: false rather than defaulting it away', () => {
    const result = buildTrieFromDictionary({
      大: { translation: 'to', allowAsPatternVariable: false },
    });

    expect(result.trie.getWithMetadata('大').metadata.allowAsPatternVariable).toBe(false);
  });

  test('collects invalid entries (no translation field) without inserting them', () => {
    const result = buildTrieFromDictionary({
      good: 'tốt',
      bad: { note: 'missing translation field' },
    });

    expect(result.entryCount).toBe(1);
    expect(result.invalidSources).toEqual(['bad']);
    expect(result.trie.getWithMetadata('bad')).toBeNull();
  });
});
