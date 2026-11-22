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

describe('buildPatternVariableCache — Stage 1 token boundaries', () => {
  const flag = { allowAsPatternVariable: true };
  const run = (trie, tokens) =>
    buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

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

describe('buildPatternVariableCache — Stage 1 trie walk', () => {
  test('single-token phrase match', () => {
    const trie = makeTrie([['部', 'bộ', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result['部']).toEqual({
      translation: 'bộ',
      source: 'phrases_pattern_variable',
      type: 'concept',
    });
  });

  test('multi-token phrase match (len=2)', () => {
    const trie = makeTrie([['部分', 'bộ phận', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部' }, { value: '分' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

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

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result['一二三'].translation).toBe('một hai ba');
  });

  test('both single and multi-token matches at same start position', () => {
    const trie = makeTrie([
      ['部', 'bộ', { allowAsPatternVariable: true }],
      ['部分', 'bộ phận', { allowAsPatternVariable: true }],
    ]);
    const tokens = [{ value: '部' }, { value: '分' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result['部'].translation).toBe('bộ');
    expect(result['部分'].translation).toBe('bộ phận');
  });

  test('dead-end at first token breaks span — no later span checked', () => {
    const trie = makeTrie([['部分', 'bộ phận', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: 'X' }, { value: '分' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('dead-end mid-span breaks — partial prefix not cached', () => {
    const trie = makeTrie([['部分人', 'bộ phận người', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部' }, { value: 'X' }, { value: '人' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('allowAsPatternVariable=false excludes entry', () => {
    const trie = makeTrie([['部', 'bộ', { allowAsPatternVariable: false }]]);
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result['部']).toBeUndefined();
  });

  test('absent allowAsPatternVariable excludes entry', () => {
    const trie = makeTrie([['部', 'bộ', {}]]);
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result['部']).toBeUndefined();
  });

  test('null phrasesTrie skips stage 1 without crash', () => {
    const tokens = [{ value: '部' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(null) });

    expect(Object.keys(result)).toHaveLength(0);
  });

  test('span capped at 6 tokens — 7-token entry not matched', () => {
    const word7 = '一二三四五六七';
    const trie = makeTrie([[word7, 'seven', { allowAsPatternVariable: true }]]);
    const tokens = word7.split('').map((ch) => ({ value: ch }));

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result[word7]).toBeUndefined();
  });

  test('6-token entry is matched', () => {
    const word6 = '一二三四五六';
    const trie = makeTrie([[word6, 'six', { allowAsPatternVariable: true }]]);
    const tokens = word6.split('').map((ch) => ({ value: ch }));

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result[word6].translation).toBe('six');
  });

  test('matches found at multiple token positions', () => {
    const trie = makeTrie([
      ['部', 'bộ', { allowAsPatternVariable: true }],
      ['分', 'phần', { allowAsPatternVariable: true }],
    ]);
    const tokens = [{ value: '部' }, { value: '分' }];

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result['部'].translation).toBe('bộ');
    expect(result['分'].translation).toBe('phần');
  });

  test('multi-char token value traversed correctly', () => {
    // Token value is already a multi-char word (e.g. pre-tokenized chinese_word)
    const trie = makeTrie([['部分', 'bộ phận', { allowAsPatternVariable: true }]]);
    const tokens = [{ value: '部分' }]; // single token with 2-char value

    const result = buildPatternVariableCache(tokens, { dictionaryManager: makeManager(trie) });

    expect(result['部分'].translation).toBe('bộ phận');
  });
});

describe('buildPatternVariableCache — entry type', () => {
  const tokens = [{ value: '刘备' }];

  test('a phrase without a semanticType is a concept; one with a semanticType keeps it', () => {
    const concept = buildPatternVariableCache(tokens, {
      dictionaryManager: makeManager(makeTrie([['刘备', 'x', { allowAsPatternVariable: true }]])),
    });
    const typed = buildPatternVariableCache(tokens, {
      dictionaryManager: makeManager(
        makeTrie([['刘备', 'x', { allowAsPatternVariable: true, semanticType: 'location' }]])
      ),
    });

    expect(concept['刘备'].type).toBe('concept');
    expect(typed['刘备'].type).toBe('location');
  });

  test('a proper noun without a semanticType is untyped; one with a semanticType keeps it', () => {
    const lookup = (metadata) => ({
      ...makeManager(null),
      translate: () => ({ dictionary: 'properNouns', translation: 'Lưu Bị', metadata }),
    });
    const options = (metadata) => ({
      activeProperNouns: ['properNouns'],
      dictionaryManager: lookup(metadata),
    });

    expect(buildPatternVariableCache(tokens, options({}))['刘备'].type).toBeNull();
    expect(
      buildPatternVariableCache(tokens, options({ semanticType: 'character' }))['刘备'].type
    ).toBe('character');
  });
});

describe('buildPatternVariableCache — Stage 3 full-text scan', () => {
  const tokens = [{ value: '诸' }, { value: '葛' }, { value: '亮' }];
  const withMatches = (matches, phrasesMetadata) => ({
    ...makeManager(null),
    findAllMatches: (_text, pos) => (pos === 0 ? matches : []),
    translate: () =>
      phrasesMetadata ? { dictionary: 'phrases', metadata: phrasesMetadata } : null,
  });

  test('a multi-character proper noun found in the text is cached', () => {
    const match = { word: '诸葛亮', translation: 'Gia Cát Lượng', dictionary: 'properNouns' };

    const result = buildPatternVariableCache(tokens, {
      activeProperNouns: ['properNouns'],
      dictionaryManager: withMatches([match]),
    });

    expect(result['诸葛亮']).toEqual({
      translation: 'Gia Cát Lượng',
      source: 'properNouns_pattern_variable',
      type: null,
    });
  });

  test('a phrase match is cached only when the phrase allows pattern variables', () => {
    const match = { word: '诸葛亮', translation: 'x', dictionary: 'phrases' };
    const run = (flag) =>
      buildPatternVariableCache(tokens, {
        activeProperNouns: ['properNouns'],
        dictionaryManager: withMatches([match], { allowAsPatternVariable: flag }),
      });

    expect(run(true)['诸葛亮']).toBeDefined();
    expect(run(false)['诸葛亮']).toBeUndefined();
  });
  // ADR-112: the WASM matcher reads a variable from the semantic tokens alone, so a key with
  // punctuation in it is also cached under that spelling.
  test('a key with punctuation is also cached as the matcher reads it', () => {
    const match = { word: '南希-丽诺', translation: 'Nancy Reno', dictionary: 'properNouns' };
    const result = buildPatternVariableCache(tokens, {
      activeProperNouns: ['properNouns'],
      dictionaryManager: withMatches([match]),
      patterns: [],
    });
    expect(result['南希-丽诺']).toMatchObject({ translation: 'Nancy Reno' });
    expect(result['南希丽诺']).toMatchObject({ translation: 'Nancy Reno' });
  });

  test('an entry already cached under the matcher spelling keeps it', () => {
    const exact = { word: '南希丽诺', translation: 'Exact', dictionary: 'properNouns' };
    const punctuated = { word: '南希-丽诺', translation: 'Nancy Reno', dictionary: 'properNouns' };
    const result = buildPatternVariableCache(tokens, {
      activeProperNouns: ['properNouns'],
      dictionaryManager: withMatches([exact, punctuated]),
      patterns: [],
    });
    expect(result['南希丽诺']).toMatchObject({ translation: 'Exact' });
  });
});

describe('buildPatternVariableCache — numbers for # patterns', () => {
  const tokens = [
    { value: '七', type: 'chinese_char' },
    { value: '大', type: 'chinese_char' },
  ];
  const run = (patterns) =>
    buildPatternVariableCache(tokens, { patterns, dictionaryManager: makeManager(null) });

  test('adds numeral spans when a pattern uses #', () => {
    const cache = run([{ originalPattern: '#大X之一', template: 'một trong # đại X' }]);

    expect(cache['七']).toEqual({
      translation: 'bảy',
      source: 'number_pattern_variable',
      type: 'number',
    });
  });

  test('adds no numbers when no pattern uses #', () => {
    expect(run([{ originalPattern: 'X大Y', template: 'X đại Y' }])['七']).toBeUndefined();
  });
});
