/**
 * DictionaryTrie: the per-dictionary lookup structure. `findMatches` is the one prefix walk that
 * DictionaryMatchLookup and PatternVariableCache read matches through, so it is pinned here
 * rather than through either caller.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS module, no declaration file
import { DictionaryTrie } from '../dictionary/DictionaryTrie.js';

function trieOf(entries: Array<[string, string, object?]>) {
  const trie = new DictionaryTrie();
  for (const [word, translation, metadata] of entries) {
    trie.insert(word, translation, metadata ?? null);
  }
  return trie;
}

describe('DictionaryTrie.findMatches', () => {
  it('returns every word that starts at startPos, shortest first', () => {
    const trie = trieOf([
      ['你', 'you'],
      ['你好', 'hello'],
      ['你好吗', 'how are you'],
    ]);
    const matches = trie.findMatches('你好吗', 0);
    expect(matches.map((m: { word: string }) => m.word)).toEqual(['你', '你好', '你好吗']);
    expect(matches.map((m: { endPos: number }) => m.endPos)).toEqual([1, 2, 3]);
    expect(matches[1]).toMatchObject({ translation: 'hello' });
  });

  it('starts at startPos, not at the beginning of the text', () => {
    const trie = trieOf([['好', 'good']]);
    expect(trie.findMatches('你好', 0)).toEqual([]);
    expect(trie.findMatches('你好', 1)).toEqual([
      { word: '好', translation: 'good', endPos: 2, metadata: null },
    ]);
  });

  it('stops at the first dead end and skips non-words on the way', () => {
    // "你好吗" is a path but only "你好吗嘛" is a word, and the text diverges before it.
    const trie = trieOf([['你好吗嘛', 'x']]);
    expect(trie.findMatches('你好吗吧', 0)).toEqual([]);
  });

  it('returns nothing when the text is exhausted or the start is past the end', () => {
    const trie = trieOf([['你', 'you']]);
    expect(trie.findMatches('', 0)).toEqual([]);
    expect(trie.findMatches('你', 5)).toEqual([]);
  });

  it('carries each entry’s metadata', () => {
    const trie = trieOf([['部分', 'bộ phận', { allowAsPatternVariable: true }]]);
    expect(trie.findMatches('部分', 0)[0].metadata).toEqual({ allowAsPatternVariable: true });
  });

  // insert() keys the trie by code point, so the walk must too; a UTF-16 walk could never match
  // an astral character (CJK Ext-B), though get() could.
  it('matches words holding an astral character, with UTF-16 offsets', () => {
    const trie = trieOf([
      ['𠮷', 'x'],
      ['𠮷野家', 'y'],
    ]);
    const matches = trie.findMatches('𠮷野家', 0);
    expect(matches.map((m: { word: string }) => m.word)).toEqual(['𠮷', '𠮷野家']);
    // 𠮷 is two UTF-16 units, so the offsets are 2 and 4, and slicing with them is exact.
    expect(matches.map((m: { endPos: number }) => m.endPos)).toEqual([2, 4]);
    expect('𠮷野家'.slice(0, matches[0].endPos)).toBe('𠮷');
  });

  it('matches a word that starts after an astral character', () => {
    const trie = trieOf([['野家', 'y']]);
    expect(trie.findMatches('𠮷野家', 2).map((m: { word: string }) => m.word)).toEqual(['野家']);
  });

  it('agrees with get() on every inserted word', () => {
    const words = ['你', '你好', '𠮷', '𠮷野', 'abc'];
    const trie = trieOf(words.map((w) => [w, `T-${w}`] as [string, string]));
    for (const word of words) {
      const match = trie.findMatches(word, 0).find((m: { word: string }) => m.word === word);
      expect(match?.translation).toBe(trie.get(word));
    }
  });
});
