/**
 * `DictionaryManager.findMatchesAtToken`: what "the dictionary matches that start at this token"
 * means, the one lookup Phase 2 reads (ADR-108). The cases were the MatchSource parity fixture
 * (`lookup_index_parity.json`, ADR-082) until the Rust index it held equal was deleted; the
 * Rust-only fields (`category`, `charPosition`) went with it. Expected lists are winner-first:
 * longer word first, lower priority number on a tie.
 */
import { describe, it, expect, vi } from 'vitest';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';
import { priorityOf } from '../dictionary/DictionaryIdClassifier.js';

vi.mock('../logger.js', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '../logger.js';

// Priorities come from the production ladder (priorityOf), checked below
const DICTIONARIES = {
  properNouns: { priority: 3, entries: { 你好吗: 'Ni Hao Ma', 墨子: 'Mặc Tử' } },
  phrases: { priority: 3, entries: { 你好: 'xin chào', 你好吗: 'bạn khỏe không' } },
  characters: { priority: 4, entries: { 你: 'bạn', 好: 'tốt' } },
  customDict: { priority: 10, entries: { 好吗: 'ok?' } },
};

async function loadManager() {
  const manager = new DictionaryManager();
  await manager.loadDictionaries(
    Object.fromEntries(Object.entries(DICTIONARIES).map(([name, d]) => [name, d.entries]))
  );
  return manager;
}

const pick = (matches) => matches.map(({ word, dictionary }) => ({ word, dictionary }));

const TYPES = { '。': 'punctuation', ' ': 'whitespace' };
function tokensFor(text) {
  let start = 0;
  return [...text].map((value) => {
    const token = { type: TYPES[value] ?? 'chinese_char', value, start };
    start += value.length;
    return token;
  });
}

const CASES = [
  {
    name: 'one dictionary at a time',
    text: '你好吗',
    lookups: [
      { at: 0, set: ['properNouns'], expected: [{ word: '你好吗', dictionary: 'properNouns' }] },
      {
        at: 0,
        set: ['phrases'],
        expected: [
          { word: '你好吗', dictionary: 'phrases' },
          { word: '你好', dictionary: 'phrases' },
        ],
      },
      { at: 0, set: ['characters'], expected: [{ word: '你', dictionary: 'characters' }] },
      { at: 2, set: ['characters'], expected: [] },
    ],
  },
  {
    name: 'only the dictionaries asked for count',
    text: '你好吗',
    lookups: [
      {
        at: 1,
        set: ['phrases', 'customDict'],
        expected: [{ word: '好吗', dictionary: 'customDict' }],
      },
      { at: 1, set: ['phrases'], expected: [] },
    ],
  },
  {
    name: 'longest first, then the lower priority number',
    text: '你好吗',
    lookups: [
      {
        at: 0,
        set: ['characters', 'phrases', 'properNouns'],
        expected: [
          { word: '你好吗', dictionary: 'phrases' },
          { word: '你好吗', dictionary: 'properNouns' },
          { word: '你好', dictionary: 'phrases' },
          { word: '你', dictionary: 'characters' },
        ],
      },
    ],
  },
  {
    name: 'an astral character before the token',
    text: '😀你好',
    lookups: [
      { at: 1, set: ['characters'], expected: [{ word: '你', dictionary: 'characters' }] },
      { at: 2, set: ['characters'], expected: [{ word: '好', dictionary: 'characters' }] },
    ],
  },
];

describe('findMatchesAtToken', () => {
  it('gives each test dictionary its production priority (priorityOf)', () => {
    for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
      expect(priorityOf(name), name).toBe(dictionary.priority);
    }
  });

  for (const testCase of CASES) {
    describe(testCase.name, () => {
      for (const lookup of testCase.lookups) {
        it(`token ${lookup.at} over [${lookup.set}]`, async () => {
          const manager = await loadManager();
          const matches = manager.findMatchesAtToken(tokensFor(testCase.text), lookup.at, [
            ...lookup.set,
          ]);
          expect(pick(matches)).toEqual(lookup.expected);
        });
      }
    });
  }

  it('stops at the next punctuation: a match never spans it', async () => {
    const manager = await loadManager();
    expect(pick(manager.findMatchesAtToken(tokensFor('你好。吗'), 0, ['phrases']))).toEqual([
      { word: '你好', dictionary: 'phrases' },
    ]);
  });

  it('reads across a space: 墨 子 matches 墨子', async () => {
    const manager = await loadManager();
    expect(pick(manager.findMatchesAtToken(tokensFor('墨 子'), 0, ['properNouns']))).toEqual([
      { word: '墨子', dictionary: 'properNouns' },
    ]);
  });

  describe('tokenLength: the tokens a match covers, read off the walk that built the text', () => {
    async function managerWith(entries) {
      const manager = new DictionaryManager();
      await manager.loadDictionaries({ properNouns: entries });
      return manager;
    }
    const spans = (matches) => matches.map(({ word, tokenLength }) => ({ word, tokenLength }));
    const token = (type, value, extra = {}) => ({ type, value, ...extra });

    it('counts the whole run of tokens a match covers', async () => {
      const manager = await managerWith({ 在那些: 'ở những', 那些: 'những' });
      const tokens = tokensFor('在那些魔');
      expect(spans(manager.findMatchesAtToken(tokens, 0, ['properNouns']))).toEqual([
        { word: '在那些', tokenLength: 3 },
      ]);
      expect(spans(manager.findMatchesAtToken(tokens, 1, ['properNouns']))).toEqual([
        { word: '那些', tokenLength: 2 },
      ]);
    });

    it('includes a space inside the match, not one after it (墨 子 claimed 2 of 3 once)', async () => {
      const manager = await loadManager();
      expect(spans(manager.findMatchesAtToken(tokensFor('墨 子 '), 0, ['properNouns']))).toEqual([
        { word: '墨子', tokenLength: 3 },
      ]);
    });

    it("reads a grouped leader's own character, so a later phase does not see its text twice", async () => {
      // After Phase 2 places 魔杖, the leader's value is the grouped text and the follower keeps
      // its own; reading value gave 降魔杖杖 and a span one token short
      const manager = await managerWith({ 降魔杖: 'Hàng Ma Trượng', 降魔杖杖: 'wrong' });
      const tokens = [
        token('chinese_char', '降'),
        token('chinese_char', '魔杖', { originalValue: '魔' }),
        token('chinese_char', '杖', { originalValue: '杖' }),
      ];
      expect(spans(manager.findMatchesAtToken(tokens, 0, ['properNouns']))).toEqual([
        { word: '降魔杖', tokenLength: 3 },
      ]);
    });

    it('covers the mark of a key with punctuation in it', async () => {
      const manager = await managerWith({ '乔斯-韦登': 'Joss Whedon' });
      const tokens = [...'乔斯-韦登'].map((value) =>
        token(value === '-' ? 'punctuation' : 'chinese_char', value)
      );
      expect(spans(manager.findMatchesAtToken(tokens, 0, ['properNouns']))).toEqual([
        { word: '乔斯-韦登', tokenLength: 5 },
      ]);
    });

    it('reads through a symbol the tokenizer types punctuation, with no other punctuated key loaded', async () => {
      // `+` is not \p{P}; under that test 甲+乙 matched only when a longer punctuated key was loaded
      const manager = await managerWith({ '甲+乙': 'Plus' });
      const tokens = [...'甲+乙'].map((value) =>
        token(value === '+' ? 'punctuation' : 'chinese_char', value)
      );
      expect(spans(manager.findMatchesAtToken(tokens, 0, ['properNouns']))).toEqual([
        { word: '甲+乙', tokenLength: 3 },
      ]);
    });

    it('leaves out a match that would end partway through a token', async () => {
      const manager = await managerWith({ 战警X: 'half', 战警XY: 'whole', 战警: 'cảnh sát' });
      const tokens = [
        token('chinese_char', '战'),
        token('chinese_char', '警'),
        token('latin_word', 'XY'),
      ];
      expect(spans(manager.findMatchesAtToken(tokens, 0, ['properNouns']))).toEqual([
        { word: '战警XY', tokenLength: 3 },
        { word: '战警', tokenLength: 2 },
      ]);
    });
  });

  it('returns nothing, and logs, for a position past the last token', async () => {
    const manager = await loadManager();
    const findAllMatches = vi.spyOn(manager, 'findAllMatches');

    expect(manager.findMatchesAtToken(tokensFor('你好'), 2, ['phrases'])).toEqual([]);
    expect(findAllMatches).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('out of bounds'));
  });
});
