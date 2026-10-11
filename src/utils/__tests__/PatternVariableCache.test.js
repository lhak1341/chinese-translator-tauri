import { describe, test, expect } from 'vitest';
import { buildPatternVariableCache } from '../pattern/PatternVariableCache.js';
import { DictionaryTrie } from '../dictionary/DictionaryTrie.js';

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

describe('buildPatternVariableCache — Stage 2 token boundaries', () => {
  const flag = { allowAsPatternVariable: true };
  const run = (trie, tokens) =>
    buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) }, resolveType);

  test('a phrase ending mid-token is not a match', () => {
    // "ab" is a phrase, but the tokens are "a" + "bc": the phrase ends inside the second token.
    const trie = makeTrie([['ab', 'x', flag]]);
    expect(run(trie, [{ value: 'a' }, { value: 'bc' }])).toEqual({});
  });

  test('a phrase ending exactly on a multi-character token boundary is a match', () => {
    const trie = makeTrie([['abc', 'x', flag]]);
    expect(run(trie, [{ value: 'a' }, { value: 'bc' }])['abc']).toMatchObject({ translation: 'x' });
  });

  test('looks at most 6 tokens ahead', () => {
    const trie = makeTrie([
      ['aaaaaa', 'six', flag],
      ['aaaaaaa', 'seven', flag],
    ]);
    const tokens = Array.from({ length: 7 }, () => ({ value: 'a' }));
    const result = run(trie, tokens);
    expect(result['aaaaaa']).toMatchObject({ translation: 'six' });
    expect(result['aaaaaaa']).toBeUndefined();
  });

  test('a phrase holding an astral character matches', () => {
    const trie = makeTrie([['𠮷野', 'x', flag]]);
    expect(run(trie, [{ value: '𠮷' }, { value: '野' }])['𠮷野']).toMatchObject({
      translation: 'x',
    });
  });

  test('an entry without allowAsPatternVariable is skipped', () => {
    const trie = makeTrie([['ab', 'x', { allowAsPatternVariable: false }]]);
    expect(run(trie, [{ value: 'a' }, { value: 'b' }])).toEqual({});
  });
});

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
});
