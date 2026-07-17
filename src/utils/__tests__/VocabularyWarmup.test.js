import { describe, test, expect, vi } from 'vitest';
import {
  extractHighFrequencyVocabulary,
  generateCharacterCombinations,
  warmNovelSpecificVocabulary,
} from '../dictionary/VocabularyWarmup.js';
import { DictionaryTrie } from '../dictionary/DictionaryTrie.js';

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
}));

function makeTrie(entries) {
  const trie = new DictionaryTrie();
  for (const [word, translation] of entries) {
    trie.insert(word, translation);
  }
  return trie;
}

function makeCache() {
  return { setCharacter: vi.fn(), setPhrase: vi.fn() };
}

describe('extractHighFrequencyVocabulary', () => {
  test('collects word/translation pairs from the trie', () => {
    const trie = makeTrie([
      ['孔', 'khổng'],
      ['孔子', 'khổng tử'],
    ]);

    const result = extractHighFrequencyVocabulary(trie, 'properNouns-test');

    expect(result).toEqual(
      expect.arrayContaining([
        { word: '孔', translation: 'khổng', priority: 1, dictionary: 'properNouns-test' },
        { word: '孔子', translation: 'khổng tử', priority: 1, dictionary: 'properNouns-test' },
      ])
    );
    expect(result).toHaveLength(2);
  });

  test('priority buckets by word length: <=3 -> 1, <=5 -> 2, else -> 3', () => {
    const trie = makeTrie([
      ['abc', 't1'], // length 3 -> priority 1
      ['abcde', 't2'], // length 5 -> priority 2
      ['abcdefg', 't3'], // length 7 -> priority 3
    ]);

    const result = extractHighFrequencyVocabulary(trie, 'd');
    const byWord = Object.fromEntries(result.map((e) => [e.word, e.priority]));

    expect(byWord['abc']).toBe(1);
    expect(byWord['abcde']).toBe(2);
    expect(byWord['abcdefg']).toBe(3);
  });

  test('sorts by priority ascending, tie-breaks alphabetically', () => {
    const trie = makeTrie([
      ['乙', 't-yi'], // priority 1
      ['甲', 't-jia'], // priority 1
      ['abcdefg', 't-long'], // priority 3
    ]);

    const result = extractHighFrequencyVocabulary(trie, 'd');

    expect(result.map((e) => e.word)).toEqual(['乙', '甲', 'abcdefg']);
  });

  test('skips end-of-word nodes with no translation, but still walks their children', () => {
    const trie = new DictionaryTrie();
    trie.insert('孔子', 'khổng tử');
    // Manually mark an intermediate node as end-of-word with no translation,
    // simulating a trie node that is a prefix but not itself a dictionary entry.
    trie.root.children.get('孔').isEndOfWord = true;
    trie.root.children.get('孔').translation = null;

    const result = extractHighFrequencyVocabulary(trie, 'd');

    expect(result.map((e) => e.word)).toEqual(['孔子']);
  });

  test('caps at 50 entries even when the trie has more', () => {
    const entries = [];
    for (let i = 0; i < 60; i++) {
      // Pad to keep every word unique and >5 chars so they land in the same priority bucket,
      // isolating the cap behavior from sort/priority effects.
      entries.push([`word${String(i).padStart(3, '0')}`, `t${i}`]);
    }
    const trie = makeTrie(entries);

    const result = extractHighFrequencyVocabulary(trie, 'd');

    expect(result).toHaveLength(50);
  });

  test('empty trie returns empty array', () => {
    const trie = new DictionaryTrie();
    expect(extractHighFrequencyVocabulary(trie, 'd')).toEqual([]);
  });
});

describe('generateCharacterCombinations', () => {
  test('generates char+functionWord and functionWord+char pairs for words <= 3 chars', () => {
    const result = generateCharacterCombinations([{ word: '孔' }]);

    expect(result).toEqual(
      expect.arrayContaining([
        '孔的',
        '的孔',
        '孔了',
        '了孔',
        '孔在',
        '在孔',
        '孔说',
        '说孔',
        '孔看',
        '看孔',
      ])
    );
    expect(result).toHaveLength(10); // 1 char x 5 function words x 2 orderings
  });

  test('ignores words longer than 3 characters when collecting source characters', () => {
    const result = generateCharacterCombinations([{ word: 'abcdefg' }]);
    expect(result).toEqual([]);
  });

  test('empty vocabulary produces empty combinations', () => {
    expect(generateCharacterCombinations([])).toEqual([]);
  });

  test('caps combinations at 30', () => {
    // 20+ distinct short words -> more than 20 unique characters feeding the generator,
    // which is already more than enough (4 chars x 5 words x 2 orderings = 40 > 30) to hit the cap.
    const vocabularyEntries = ['甲', '乙', '丙', '丁'].map((word) => ({ word }));

    const result = generateCharacterCombinations(vocabularyEntries);

    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.length).toBe(30);
  });

  test('only draws from the first 20 unique source characters', () => {
    const chars = Array.from({ length: 25 }, (_, i) => String.fromCharCode(0x4e00 + i));
    const vocabularyEntries = chars.map((word) => ({ word }));

    const result = generateCharacterCombinations(vocabularyEntries);
    const usedChars = new Set(
      result.map((combo) => Array.from(combo).find((c) => chars.includes(c)))
    );

    // Only the first 20 characters (insertion order) should ever appear in a combination.
    for (const usedChar of usedChars) {
      expect(chars.indexOf(usedChar)).toBeLessThan(20);
    }
  });
});

describe('warmNovelSpecificVocabulary', () => {
  function makeManager({ dictionaries = {}, translateResult = (word) => `t-${word}` } = {}) {
    return {
      getDictionary: (name) => dictionaries[name] ?? null,
      translate: vi.fn((word) => translateResult(word)),
    };
  }

  test('warms characters and phrases into the cache and returns total count', async () => {
    const trie = makeTrie([['孔', 'khổng']]);
    const manager = makeManager({ dictionaries: { 'properNouns-test': trie } });
    const cache = makeCache();

    const total = await warmNovelSpecificVocabulary(manager, ['properNouns-test'], {}, cache);

    expect(cache.setCharacter).toHaveBeenCalledWith('孔', 'properNouns-test', 't-孔');
    expect(cache.setPhrase).toHaveBeenCalled();
    expect(total).toBeGreaterThan(0);
  });

  test('skips a dictionary name that getDictionary cannot resolve', async () => {
    const manager = makeManager({ dictionaries: {} });
    const cache = makeCache();

    const total = await warmNovelSpecificVocabulary(manager, ['missing-dict'], {}, cache);

    expect(total).toBe(0);
    expect(cache.setCharacter).not.toHaveBeenCalled();
  });

  test('a throwing dictionary is caught and logged, other dictionaries still warm', async () => {
    const trie = makeTrie([['孔', 'khổng']]);
    const manager = {
      getDictionary: (name) => {
        if (name === 'bad-dict') throw new Error('boom');
        return name === 'good-dict' ? trie : null;
      },
      translate: vi.fn(() => 't-result'),
    };
    const cache = makeCache();
    const { logger } = await import('../logger.js');

    const total = await warmNovelSpecificVocabulary(manager, ['bad-dict', 'good-dict'], {}, cache);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bad-dict'), 'boom');
    expect(total).toBeGreaterThan(0);
  });

  test('falsy translate() result is not cached and not counted', async () => {
    const trie = makeTrie([['孔', 'khổng']]);
    const manager = makeManager({ dictionaries: { d: trie }, translateResult: () => '' });
    const cache = makeCache();

    const total = await warmNovelSpecificVocabulary(manager, ['d'], {}, cache);

    expect(cache.setCharacter).not.toHaveBeenCalled();
    expect(cache.setPhrase).not.toHaveBeenCalled();
    expect(total).toBe(0);
  });

  test('EDGE CASE: more active proper-noun dicts than maxCharacters floors the per-dict budget to 0', async () => {
    const trie = makeTrie([['孔', 'khổng']]);
    const dictionaries = {};
    const names = [];
    for (let i = 0; i < 5; i++) {
      const name = `dict${i}`;
      names.push(name);
      dictionaries[name] = trie;
    }
    const manager = makeManager({ dictionaries });
    const cache = makeCache();

    // maxCharacters (3) < names.length (5) -> Math.floor(3/5) === 0 per-dict budget.
    const total = await warmNovelSpecificVocabulary(
      manager,
      names,
      { maxCharacters: 3, maxPhrases: 0 },
      cache
    );

    expect(cache.setCharacter).not.toHaveBeenCalled();
    expect(total).toBe(0);
  });

  test('REGRESSION: explicit maxCharacters:0 warms zero characters (?? not ||)', async () => {
    const trie = makeTrie([['孔', 'khổng']]);
    const manager = makeManager({ dictionaries: { d: trie } });
    const cache = makeCache();

    await warmNovelSpecificVocabulary(manager, ['d'], { maxCharacters: 0, maxPhrases: 30 }, cache);

    expect(cache.setCharacter).not.toHaveBeenCalled();
  });

  test('REGRESSION: explicit maxPhrases:0 warms zero phrases (?? not ||)', async () => {
    const trie = makeTrie([['孔', 'khổng']]);
    const manager = makeManager({ dictionaries: { d: trie } });
    const cache = makeCache();

    const total = await warmNovelSpecificVocabulary(
      manager,
      ['d'],
      { maxCharacters: 0, maxPhrases: 0 },
      cache
    );

    expect(cache.setPhrase).not.toHaveBeenCalled();
    expect(total).toBe(0);
  });

  test('respects the global maxCharacters cap across multiple dictionaries', async () => {
    const trie = makeTrie([
      ['甲', 't1'],
      ['乙', 't2'],
      ['丙', 't3'],
    ]);
    const manager = makeManager({ dictionaries: { d1: trie, d2: trie } });
    const cache = makeCache();

    await warmNovelSpecificVocabulary(
      manager,
      ['d1', 'd2'],
      { maxCharacters: 2, maxPhrases: 0 },
      cache
    );

    expect(cache.setCharacter).toHaveBeenCalledTimes(2);
  });

  test('default limits are maxCharacters=50, maxPhrases=30 when limits omitted', async () => {
    const entries = [];
    for (let i = 0; i < 60; i++) {
      entries.push([`word${String(i).padStart(3, '0')}`, `t${i}`]);
    }
    const trie = makeTrie(entries);
    const manager = makeManager({ dictionaries: { d: trie } });
    const cache = makeCache();

    await warmNovelSpecificVocabulary(manager, ['d'], undefined, cache);

    expect(cache.setCharacter.mock.calls.length).toBeLessThanOrEqual(50);
    expect(cache.setPhrase.mock.calls.length).toBeLessThanOrEqual(30);
  });
});
