/**
 * Dictionary Manager API Contract Tests
 *
 * CRITICAL: Prevents breaking changes to public API
 *
 * These tests verify that critical methods maintain their API contracts:
 * - Synchronous vs async (return value vs Promise)
 * - Parameter signatures
 * - Return type structure
 *
 * WHY THIS IS CRITICAL:
 * - Breaking API changes cascade through entire translation pipeline
 * - Changing translate() from sync to async broke 485 tests
 * - No warning until runtime failure in production
 *
 * WHAT WE TEST:
 * - translate() MUST be synchronous (returns result, not Promise)
 * - findMatches() can be sync or async (both are acceptable)
 * - Return types match expected structure
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { DictionaryManager } from '../dictionary/DictionaryManager.js';

describe('DictionaryManager API Contract', () => {
  let manager;

  beforeEach(async () => {
    manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({
      test_dict: {
        在: 'ở',
        那: 'đó',
        里: 'trong',
      },
    });
  });

  describe('translate() method contract', () => {
    test('CRITICAL: translate() must be synchronous (not async)', () => {
      const result = manager.translate('在', ['test_dict']);

      // CRITICAL: Result must NOT be a Promise
      expect(result).not.toBeInstanceOf(Promise);

      // Verify it's the actual result (may have extra fields like frequency/priority)
      expect(result).toMatchObject({
        word: '在',
        translation: 'ở',
        dictionary: 'test_dict',
      });
    });

    test('translate() must accept (word, dictionaryOrder) parameters', () => {
      // Should not throw with both parameters
      expect(() => {
        manager.translate('在', ['test_dict']);
      }).not.toThrow();

      // Should not throw with just word
      expect(() => {
        manager.translate('在');
      }).not.toThrow();

      // Should not throw with null order
      expect(() => {
        manager.translate('在', null);
      }).not.toThrow();
    });

    test('translate() must return null for non-existent entries', () => {
      const result = manager.translate('不存在', ['test_dict']);

      expect(result).toBeNull();
      expect(result).not.toBeInstanceOf(Promise);
    });

    test('translate() must return object with expected structure', () => {
      const result = manager.translate('那', ['test_dict']);

      expect(result).toMatchObject({
        word: expect.any(String),
        translation: expect.any(String),
        dictionary: expect.any(String),
      });
    });
  });

  describe('findAllMatches() method contract', () => {
    test('findAllMatches() must return array (not Promise) when called synchronously', () => {
      const result = manager.findAllMatches('在那里', 0, ['test_dict']);

      // Should return array directly (synchronous)
      expect(Array.isArray(result)).toBe(true);
      expect(result).not.toBeInstanceOf(Promise);
    });
  });

  describe('loadDictionaries() method contract', () => {
    test('loadDictionaries() may be async (returns Promise)', async () => {
      const result = manager.loadDictionaries({
        new_dict: { 好: 'tốt' },
      });

      // Async is acceptable for loading operations
      expect(result).toBeInstanceOf(Promise);
      await result; // Should resolve without error
    });
  });

  describe('flatEntries (for the Rust lookup-index build)', () => {
    test('populates flatEntries alongside dictionaries at load time', () => {
      expect(manager.flatEntries.has('test_dict')).toBe(true);
      const entries = manager.flatEntries.get('test_dict');
      expect(entries).toEqual(
        expect.arrayContaining([
          { chinese: '在', vietnamese: 'ở', metadata: null },
          { chinese: '那', vietnamese: 'đó', metadata: null },
          { chinese: '里', vietnamese: 'trong', metadata: null },
        ])
      );
      expect(entries).toHaveLength(3);
    });

    test('dispose() nullifies flatEntries alongside dictionaries', () => {
      manager.dispose();
      expect(manager.flatEntries).toBeNull();
    });
  });
});

describe('API Regression Detection', () => {
  test('detect if translate() accidentally becomes async', () => {
    const manager = new DictionaryManager();

    // Get the function
    const translateFn = manager.translate;

    // Check if it's an async function (would be AsyncFunction constructor)
    const isAsync = translateFn.constructor.name === 'AsyncFunction';

    // CRITICAL: Must NOT be async
    expect(isAsync).toBe(false);
  });

  test('detect if translate() signature changes', () => {
    const manager = new DictionaryManager();

    // translate() has 1 required parameter (word), dictionaryOrder is optional
    // Function.length counts only parameters WITHOUT default values
    expect(manager.translate.length).toBe(1);
  });

  test('verify all critical synchronous methods stay synchronous', () => {
    const manager = new DictionaryManager();

    const criticalSyncMethods = ['translate', 'findAllMatches', 'getDefaultSearchOrder'];

    for (const methodName of criticalSyncMethods) {
      const method = manager[methodName];
      expect(typeof method).toBe('function');
      const isAsync = method.constructor.name === 'AsyncFunction';
      expect(isAsync).toBe(false);
    }
  });
});

describe('DictionaryManager match sort order', () => {
  const activeProperNouns = ['properNouns-f_test', 'properNouns'];

  test('longer match beats higher-priority dict at same position', async () => {
    // f_* is priority 1 (fiction-specific), general is priority 3
    // 2-char general entry must win over 1-char f_* entry
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries(
      { 'properNouns-f_test': { 王: 'Vương' }, properNouns: { 王者: 'Vương Giả' } },
      { activeProperNouns }
    );

    const matches = manager.findAllMatches('王者归来', 0);
    expect(matches[0].word).toBe('王者');
    expect(matches[0].translation).toBe('Vương Giả');
  });

  test('higher-priority dict wins when lengths are equal', async () => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries(
      { 'properNouns-f_test': { 王者: 'Vương Giả (f)' }, properNouns: { 王者: 'Vương Giả' } },
      { activeProperNouns }
    );

    const matches = manager.findAllMatches('王者归来', 0);
    expect(matches[0].word).toBe('王者');
    expect(matches[0].translation).toBe('Vương Giả (f)');
  });
});

describe('DictionaryManager translate()/_findInDictionaries cache split (candidate #5 refactor)', () => {
  test('translate() memoizes a hit via setLookup, once per word and search order', async () => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ chars: { 在: 'ở' }, phrases: { 你好: 'xin chào' } });

    const setLookupSpy = vi.spyOn(manager.cache, 'setLookup');

    const single = manager.translate('在');
    const multi = manager.translate('你好');

    expect(single).toMatchObject({ word: '在', translation: 'ở', dictionary: 'chars' });
    expect(multi).toMatchObject({ word: '你好', translation: 'xin chào', dictionary: 'phrases' });
    expect(setLookupSpy).toHaveBeenCalledTimes(2);
    expect(setLookupSpy).toHaveBeenCalledWith('在', manager.getDefaultSearchOrder(), single);
    expect(setLookupSpy).toHaveBeenCalledWith('你好', manager.getDefaultSearchOrder(), multi);
  });

  test('translate() caches a negative result via setLookup(word, searchOrder, null)', async () => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ chars: { 在: 'ở' } });

    const setLookupSpy = vi.spyOn(manager.cache, 'setLookup');
    const result = manager.translate('不存在');

    expect(result).toBeNull();
    expect(setLookupSpy).toHaveBeenCalledWith('不存在', manager.getDefaultSearchOrder(), null);
  });

  test('a cached miss is served: the second translate() of an unknown word does not search again', async () => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ chars: { 在: 'ở' } });

    const findSpy = vi.spyOn(manager, '_findInDictionaries');
    expect(manager.translate('不存在')).toBeNull();
    expect(manager.translate('不存在')).toBeNull();

    expect(findSpy).toHaveBeenCalledTimes(1);
  });

  test('_findInDictionaries never reads or writes the cache', async () => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ chars: { 在: 'ở' } });

    const getLookupSpy = vi.spyOn(manager.cache, 'getLookup');
    const setLookupSpy = vi.spyOn(manager.cache, 'setLookup');

    const result = manager._findInDictionaries('在', manager.getDefaultSearchOrder());

    expect(result).toMatchObject({ word: '在', translation: 'ở', dictionary: 'chars' });
    expect(getLookupSpy).not.toHaveBeenCalled();
    expect(setLookupSpy).not.toHaveBeenCalled();
  });

  test('_findInDictionaries and translate() agree on a cache-cold lookup', async () => {
    const manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({ chars: { 在: 'ở' } });

    const direct = manager._findInDictionaries('在', manager.getDefaultSearchOrder());
    const viaTranslate = manager.translate('在');

    expect(direct).toEqual(viaTranslate);
  });
});
