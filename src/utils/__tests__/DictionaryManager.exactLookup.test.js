/**
 * A lookup is exact: it answers only a word that is itself a dictionary member. The trie
 * walks prefixes (tokenization needs them), so the cases that matter are the ones where a
 * member is a prefix of the word, or the word is a prefix of a member. This used to be the
 * JS half of a WASM/JS parity fixture (ADR-058, deleted with the WASM tier, ADR-073).
 */
import { describe, test, expect } from 'vitest';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';

const ENTRIES = { 我: 'tôi', 我们: 'chúng tôi', 你好: 'xin chào' };

describe('exact dictionary lookup', () => {
  test.each([
    ['member, single char', '我', 'tôi'],
    ['member that is a prefix of another member', '我们', 'chúng tôi'],
    ['member, two chars', '你好', 'xin chào'],
    ['miss, no prefix in the dictionary', '他', null],
    ['miss, a member is a prefix of the word', '我们俩', null],
    ['miss, only a longer member shares the first char', '你', null],
  ])('%s: %s', async (_name, word, expected) => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ chars: ENTRIES });

    const result = manager._findInDictionaries(word, ['chars']);

    expect(result?.translation ?? null).toBe(expected);
  });
});
