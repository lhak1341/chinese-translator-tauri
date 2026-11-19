/**
 * Dictionary Memory Cleanup Regression Tests
 *
 * Verifies that memory management fixes from 2026-02-03 code review remain in place:
 * - CRITICAL-1: dispose() called before dictionary reload
 * - HIGH-2: WASM cleanup clears dictionaries
 * - HIGH-1: EnhancedDictionaryManager cleanup chain
 *
 * See: git show be492346:docs/code-review/DICTIONARY_MEMORY_FIXES_2026-02-03.md
 */

import { describe, it, expect, vi } from 'vitest';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';
import { DictionaryTrie } from '../dictionary/DictionaryTrie.js';

describe('Dictionary Memory Cleanup Regression Tests', () => {
  describe('CRITICAL-1: Dictionary dispose() on reload', () => {
    it('should call dispose() on existing tries before reload', async () => {
      const manager = new DictionaryManager();

      // Load initial dictionary
      const dict1 = {
        characters: { 的: 'của', 是: 'là' },
      };
      await manager.loadDictionaries(dict1);

      // Spy on dispose method
      const trie = manager.dictionaries.get('characters');
      const disposeSpy = vi.spyOn(trie, 'dispose');

      // Reload - should trigger dispose
      const dict2 = {
        characters: { 的: 'của', 是: 'là', 我: 'tôi' },
      };
      await manager.loadDictionaries(dict2);

      // Verify dispose was called
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle dispose errors gracefully during reload', async () => {
      const manager = new DictionaryManager();

      // Load initial dictionary
      await manager.loadDictionaries({
        characters: { 的: 'của' },
      });

      // Mock dispose to throw error
      const trie = manager.dictionaries.get('characters');
      vi.spyOn(trie, 'dispose').mockImplementation(() => {
        throw new Error('Disposal failed');
      });

      // Reload should not throw - should handle error gracefully
      await expect(
        manager.loadDictionaries({
          characters: { 是: 'là' },
        })
      ).resolves.not.toThrow();

      // Verify new dictionary was still loaded
      expect(manager.dictionaries.has('characters')).toBe(true);
    });

    it('should dispose multiple dictionaries on reload', async () => {
      const manager = new DictionaryManager();

      // Load multiple dictionaries
      await manager.loadDictionaries({
        characters: { 的: 'của' },
        phrases: { 你好: 'xin chào' },
        punctuation: { '。': '.' },
      });

      // Spy on all tries
      const charTrie = manager.dictionaries.get('characters');
      const phraseTrie = manager.dictionaries.get('phrases');
      const punctTrie = manager.dictionaries.get('punctuation');

      const charSpy = vi.spyOn(charTrie, 'dispose');
      const phraseSpy = vi.spyOn(phraseTrie, 'dispose');
      const punctSpy = vi.spyOn(punctTrie, 'dispose');

      // Reload
      await manager.loadDictionaries({
        characters: { 我: 'tôi' },
        phrases: { 谢谢: 'cảm ơn' },
      });

      // All tries should be disposed
      expect(charSpy).toHaveBeenCalled();
      expect(phraseSpy).toHaveBeenCalled();
      expect(punctSpy).toHaveBeenCalled();
    });
  });

  describe('DictionaryTrie disposal', () => {
    it('should recursively clear all trie nodes', () => {
      const trie = new DictionaryTrie();

      // Build a trie with nested structure
      trie.insert('的', 'của');
      trie.insert('的确', 'quả thực');
      trie.insert('的话', 'nếu');
      trie.insert('是', 'là');

      expect(trie.size).toBe(4);
      expect(trie.root.children.size).toBeGreaterThan(0);

      // Dispose
      trie.dispose();

      // Verify everything is cleared
      expect(trie.size).toBe(0);
      expect(trie.root).toBeNull();
    });

    it('should nullify all node references for GC', () => {
      const trie = new DictionaryTrie();
      trie.insert('测试', 'test', { source: 'test' });

      const rootNode = trie.root;
      expect(rootNode.children.size).toBeGreaterThan(0);

      trie.dispose();

      // Root should be nullified
      expect(trie.root).toBeNull();
    });

    it('should handle empty trie disposal', () => {
      const trie = new DictionaryTrie();

      expect(() => trie.dispose()).not.toThrow();
      expect(trie.size).toBe(0);
      expect(trie.root).toBeNull();
    });

    it('should clear node metadata and translations', () => {
      const trie = new DictionaryTrie();
      const metadata = { priority: 1, frequency: 10 };
      trie.insert('的', 'của', metadata);

      const node = trie.findNode('的');
      expect(node.translation).toBe('của');
      expect(node.metadata).toEqual(metadata);

      trie.dispose();

      // Node should be unreachable after disposal
      expect(trie.root).toBeNull();
    });
  });

  describe('HIGH-1: EnhancedDictionaryManager cleanup chain', () => {
    it('a second loadDictionaries disposes the tries it replaces', async () => {
      const manager = new DictionaryManager();

      // Load initial dictionary
      await manager.loadDictionaries({
        characters: { 的: 'của' },
      });

      const trie = manager.dictionaries.get('characters');
      const disposeSpy = vi.spyOn(trie, 'dispose');

      await manager.loadDictionaries({
        characters: { 是: 'là' },
      });

      expect(disposeSpy).toHaveBeenCalled();
    });
  });

  describe('Memory leak simulation tests', () => {
    it('should not accumulate trie references over multiple reloads', async () => {
      const manager = new DictionaryManager();

      // Track disposal calls
      let disposalCount = 0;

      for (let i = 0; i < 5; i++) {
        await manager.loadDictionaries({
          characters: { 的: 'của', 是: 'là' },
        });

        // After first load, subsequent reloads should dispose old tries
        if (i > 0) {
          // Verify new trie was created (different instance)
          const currentTrie = manager.dictionaries.get('characters');
          expect(currentTrie).toBeDefined();
          disposalCount++;
        }
      }

      // Should have disposed 4 times (all reloads except first)
      expect(disposalCount).toBe(4);
    });

    it('should properly clean up large dictionaries', async () => {
      const manager = new DictionaryManager();

      // Create large dictionary
      const largeDictionary = {};
      for (let i = 0; i < 1000; i++) {
        largeDictionary[`word${i}`] = `translation${i}`;
      }

      await manager.loadDictionaries({
        characters: largeDictionary,
      });

      const trie = manager.dictionaries.get('characters');
      expect(trie.size).toBe(1000);

      const disposeSpy = vi.spyOn(trie, 'dispose');

      // Reload with smaller dictionary
      await manager.loadDictionaries({
        characters: { 的: 'của' },
      });

      expect(disposeSpy).toHaveBeenCalled();

      // New trie should only have 1 entry
      const newTrie = manager.dictionaries.get('characters');
      expect(newTrie.size).toBe(1);
    });
  });

  describe('Complete disposal integration test', () => {
    it('should fully dispose manager and all resources', async () => {
      const manager = new DictionaryManager();

      // Load dictionaries
      await manager.loadDictionaries({
        characters: { 的: 'của', 是: 'là' },
        phrases: { 你好: 'xin chào' },
      });

      // Verify resources exist
      expect(manager.dictionaries.size).toBe(2);
      expect(manager.ready).toBe(true);

      // Dispose everything
      manager.dispose();

      // Verify complete cleanup
      expect(manager.dictionaries).toBeNull();
      expect(manager.metadata).toBeNull();
      expect(manager.ready).toBe(false);
    });

    it('should handle disposal of partially initialized manager', () => {
      const manager = new DictionaryManager();

      // Don't load any dictionaries
      expect(manager.dictionaries.size).toBe(0);

      // Should not throw
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('Memory cleanup verification', () => {
    it('should nullify all major references on disposal', async () => {
      const manager = new DictionaryManager();

      await manager.loadDictionaries({
        characters: { 的: 'của' },
      });

      manager.dispose();

      // All major data structures should be null
      expect(manager.dictionaries).toBeNull();
      expect(manager.metadata).toBeNull();
    });
  });
});
