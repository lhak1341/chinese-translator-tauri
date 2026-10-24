/**
 * translatePunctuationText: the punctuation dictionary applied to a text, in one pass.
 * ChunkPostProcessor takes it as a function, so these cases pin the dictionary rules here.
 */
import { describe, test, expect } from 'vitest';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';

async function managerWith(dictionaries) {
  const manager = new DictionaryManager();
  await manager.loadDictionaries(dictionaries);
  return manager;
}

describe('DictionaryManager.translatePunctuationText', () => {
  test('the longest key wins at each position', async () => {
    const manager = await managerWith({ punctuation: { '…': 'a', '……': 'b' } });
    expect(manager.translatePunctuationText('……')).toBe('b');
  });

  test('a value is never looked up again', async () => {
    const manager = await managerWith({ punctuation: { '「': '“', '“': '"' } });
    expect(manager.translatePunctuationText('「“')).toBe('“"');
  });

  test('an empty value leaves the character as it is', async () => {
    const manager = await managerWith({ punctuation: { '，': '' } });
    expect(manager.translatePunctuationText('说，')).toBe('说，');
  });

  test('a key falls back to its shorter prefix when the longer key has an empty value', async () => {
    const manager = await managerWith({ punctuation: { '…': 'a', '……': '' } });
    expect(manager.translatePunctuationText('……')).toBe('aa');
  });

  test('an astral character passes through whole', async () => {
    const manager = await managerWith({ punctuation: { '，': ',' } });
    expect(manager.translatePunctuationText('𠮷，')).toBe('𠮷,');
  });

  test('the text is returned as it is without a punctuation dictionary', async () => {
    const manager = await managerWith({ chars: { 我: 'tôi' } });
    expect(manager.translatePunctuationText('，。')).toBe('，。');
  });

  test('the text is returned as it is before any dictionary is loaded', () => {
    expect(new DictionaryManager().translatePunctuationText('，')).toBe('，');
  });
});
