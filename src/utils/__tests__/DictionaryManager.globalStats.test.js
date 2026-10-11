import { describe, test, expect, vi, afterEach } from 'vitest';

import { DictionaryManager } from '../dictionary/DictionaryManager.js';
import { DictionaryTrie } from '../dictionary/DictionaryTrie.js';

// getGlobalStats is a devtools console read. Its per-dictionary trie statistics are four full
// walks of each trie, so they are computed when asked for, not on every loadDictionaries.
describe('DictionaryManager.getGlobalStats', () => {
  afterEach(() => vi.restoreAllMocks());

  const load = async () => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ alpha: { 你: 'bạn', 你好: 'xin chào' }, beta: { 我: 'tôi' } });
    return manager;
  };

  test('loadDictionaries does not walk the tries', async () => {
    const getStats = vi.spyOn(DictionaryTrie.prototype, 'getStats');
    await load();
    expect(getStats).not.toHaveBeenCalled();
  });

  test('reports the same shape as before: counts, nodes and per-dictionary stats', async () => {
    const manager = await load();
    const stats = manager.getGlobalStats();

    expect(stats.dictionaryCount).toBe(2);
    expect(stats.totalEntries).toBe(3);
    expect(stats.dictionaries.alpha).toMatchObject({ name: 'alpha', entryCount: 2 });
    expect(stats.dictionaries.alpha.stats).toMatchObject({ size: 2, maxDepth: 2 });
    expect(stats.dictionaries.beta.stats.nodeCount).toBe(2);
    expect(stats.totalNodes).toBe(
      stats.dictionaries.alpha.stats.nodeCount + stats.dictionaries.beta.stats.nodeCount
    );
  });

  test('metadata itself carries no stats, so search order reads stay cheap', async () => {
    const manager = await load();
    expect(manager.metadata.get('alpha')).not.toHaveProperty('stats');
  });
});
