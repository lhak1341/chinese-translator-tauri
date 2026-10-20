import { describe, test, expect, vi } from 'vitest';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';
import { logger } from '../logger.js';

async function loadManager(dictionaries) {
  const manager = new DictionaryManager();
  await manager.loadDictionaries(dictionaries);
  return manager;
}

describe('DictionaryManager.findAllMatches', () => {
  test('tags each match with its dictionary and priority', async () => {
    const manager = await loadManager({ phrases: { 你好: 'xin chào' }, characters: { 你: 'bạn' } });

    expect(manager.findAllMatches('你好', 0, ['phrases', 'characters'])).toEqual([
      expect.objectContaining({ word: '你好', dictionary: 'phrases', priority: 3 }),
      expect.objectContaining({ word: '你', dictionary: 'characters', priority: 4 }),
    ]);
  });

  test('searches only the dictionaries it is given', async () => {
    const manager = await loadManager({ phrases: { 你好: 'xin chào' }, characters: { 你: 'bạn' } });

    expect(manager.findAllMatches('你好', 0, ['characters'])).toEqual([
      expect.objectContaining({ word: '你', dictionary: 'characters' }),
    ]);
  });

  test('returns [] after dispose instead of reading the released Maps', async () => {
    const manager = await loadManager({ characters: { 你: 'bạn' } });
    manager.dispose();

    expect(manager.findAllMatches('你好', 0, ['characters'])).toEqual([]);
  });

  test('a dictionary whose walk throws is logged and skipped; the others still answer', async () => {
    const manager = await loadManager({ phrases: { 你好: 'xin chào' }, characters: { 你: 'bạn' } });
    vi.spyOn(manager.dictionaries.get('phrases'), 'findMatches').mockImplementation(() => {
      throw new Error('corrupt trie');
    });
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    expect(manager.findAllMatches('你好', 0, ['phrases', 'characters'])).toEqual([
      expect.objectContaining({ word: '你', dictionary: 'characters' }),
    ]);
    expect(logError).toHaveBeenCalledWith('Dictionary phrases lookup failed:', expect.any(Error));
    logError.mockRestore();
  });
});
