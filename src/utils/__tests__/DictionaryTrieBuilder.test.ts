import { describe, test, expect } from 'vitest';
import { buildTrieFromDictionary } from '../dictionary/DictionaryTrieBuilder';

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
