import { describe, test, expect } from 'vitest';
import { buildPatternVariableCache } from '../pattern/PatternVariableCache.js';
import { DictionaryTrie } from '../dictionary/DictionaryManager.js';

function makeTrie(entries) {
  const trie = new DictionaryTrie();
  for (const [word, translation, metadata] of entries) {
    trie.insert(word, translation, metadata);
  }
  return trie;
}

function makeManager(phrasesTrie) {
  return {
    getDictionary: (name) => (name === 'phrases' ? phrasesTrie : null),
    translate: () => null,
    findAllMatches: () => [],
  };
}

const resolveType = () => 'concept';

describe('buildPatternVariableCache — Stage 2 trie walk', () => {
  test('single-token phrase match', () => {
    const trie = makeTrie([['部', 'bộ', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['部']).toEqual({
      translation: 'bộ',
      source: 'phrases_pattern_variable',
      type: 'concept',
    });
  });

  test('multi-token phrase match (len=2)', () => {
    const trie = makeTrie([['部分', 'bộ phận', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部' }, { value: '分' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['部分']).toEqual({
      translation: 'bộ phận',
      source: 'phrases_pattern_variable',
      type: 'concept',
    });
    expect(result['部']).toBeUndefined();
  });

  test('multi-token phrase match (len=3)', () => {
    const trie = makeTrie([['一二三', 'một hai ba', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '一' }, { value: '二' }, { value: '三' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['一二三'].translation).toBe('một hai ba');
  });

  test('both single and multi-token matches at same start position', () => {
    const trie = makeTrie([
      ['部', 'bộ', { allowAsPatternVariable: true }],
      ['部分', 'bộ phận', { allowAsPatternVariable: true }],
    ]);
    const tokens = [{ value: '部' }, { value: '分' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['部'].translation).toBe('bộ');
    expect(result['部分'].translation).toBe('bộ phận');
  });

  test('dead-end at first token breaks span — no later span checked', () => {
    const trie = makeTrie([['部分', 'bộ phận', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: 'X' }, { value: '分' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('dead-end mid-span breaks — partial prefix not cached', () => {
    const trie = makeTrie([['部分人', 'bộ phận người', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部' }, { value: 'X' }, { value: '人' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('allowAsPatternVariable=false excludes entry', () => {
    const trie = makeTrie([['部', 'bộ', { allowAsPatternVariable: false }]]);
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['部']).toBeUndefined();
  });

  test('absent allowAsPatternVariable excludes entry', () => {
    const trie = makeTrie([['部', 'bộ', {}]]);
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['部']).toBeUndefined();
  });

  test('null phrasesTrie skips stage 2 without crash', () => {
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(null) },
      resolveType
    );

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('span capped at 6 tokens — 7-token entry not matched', () => {
    const word7 = '一二三四五六七';
    const trie = makeTrie([[word7, 'seven', { allowAsPatternVariable: true }]]);
    const tokens = word7.split('').map((ch) => ({ value: ch }));

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result[word7]).toBeUndefined();
  });

  test('6-token entry is matched', () => {
    const word6 = '一二三四五六';
    const trie = makeTrie([[word6, 'six', { allowAsPatternVariable: true }]]);
    const tokens = word6.split('').map((ch) => ({ value: ch }));

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result[word6].translation).toBe('six');
  });

  test('matches found at multiple token positions', () => {
    const trie = makeTrie([
      ['部', 'bộ', { allowAsPatternVariable: true }],
      ['分', 'phần', { allowAsPatternVariable: true }],
    ]);
    const tokens = [{ value: '部' }, { value: '分' }];

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['部'].translation).toBe('bộ');
    expect(result['分'].translation).toBe('phần');
  });

  test('multi-char token value traversed correctly', () => {
    // Token value is already a multi-char word (e.g. pre-tokenized chinese_word)
    const trie = makeTrie([['部分', 'bộ phận', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部分' }]; // single token with 2-char value

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType
    );

    expect(result['部分'].translation).toBe('bộ phận');
  });

  test('stage 1 initialCache entries preserved and overwritable by stage 2', () => {
    const trie = makeTrie([['部', 'bộ_stage2', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部' }];
    const initialCache = { 部: { translation: 'bộ_initial', source: 'initial', type: null } };

    const result = buildPatternVariableCache(
      tokens,
      { dictionaryManager: makeManager(trie) },
      resolveType,
      initialCache
    );

    // Stage 2 overwrites initialCache entry
    expect(result['部'].translation).toBe('bộ_stage2');
    expect(result['部'].source).toBe('phrases_pattern_variable');
  });
});
