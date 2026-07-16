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

import { describe, test, expect, beforeEach } from 'vitest';
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

    test('findAllMatchesParallel() may return Promise (async is acceptable)', async () => {
      const result = manager.findAllMatchesParallel('在那里', 0, ['test_dict']);

      // Can be either array or Promise - both are acceptable
      if (result instanceof Promise) {
        const resolved = await result;
        expect(Array.isArray(resolved)).toBe(true);
      } else {
        expect(Array.isArray(result)).toBe(true);
      }
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

  describe('flatEntries (for RustLookupIndexManager)', () => {
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

    test('clear() empties flatEntries alongside dictionaries', () => {
      manager.clear();
      expect(manager.flatEntries.size).toBe(0);
    });

    test('dispose() nullifies flatEntries alongside dictionaries', () => {
      manager.dispose();
      expect(manager.flatEntries).toBeNull();
    });
  });
});

describe('DictionaryManager (WASM adapter) API Contract', () => {
  let manager;

  beforeEach(async () => {
    manager = new DictionaryManager({ enableVerboseLogging: false });
    await manager.loadDictionaries({
      test_dict: {
        在: 'ở',
        那: 'đó',
      },
    });
  });

  describe('translate() inheritance contract', () => {
    test('CRITICAL: Enhanced translate() must remain synchronous', () => {
      const result = manager.translate('在', ['test_dict']);

      // CRITICAL: Must NOT break synchronous contract
      expect(result).not.toBeInstanceOf(Promise);

      // Should work identically to parent
      expect(result).toMatchObject({
        word: '在',
        translation: 'ở',
      });
    });

    test('Enhanced translate() must handle WASM initialization gracefully', () => {
      // Even during WASM init, translate() must stay synchronous
      const result = manager.translate('那', ['test_dict']);

      expect(result).not.toBeInstanceOf(Promise);
      expect(result.translation).toBe('đó');
    });

    test('Enhanced translate() must fallback to JS during WASM init', () => {
      // Simulate WASM not yet initialized
      const originalFlag = manager.wasmInitialized;
      manager.wasmInitialized = false;
      manager.wasmInitPromise = Promise.resolve(true);

      const result = manager.translate('在', ['test_dict']);

      // Should still work synchronously via JS fallback
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.translation).toBe('ở');

      // Restore state
      manager.wasmInitialized = originalFlag;
    });
  });

  describe('WASM integration contract', () => {
    test('getWasmStatus() must return object (not Promise)', () => {
      const status = manager.getWasmStatus();

      expect(status).not.toBeInstanceOf(Promise);
      expect(status).toMatchObject({
        initialized: expect.any(Boolean),
        ready: expect.any(Boolean),
        hasAdapter: expect.any(Boolean),
      });
    });

    test('isWasmBeneficial() must return boolean (not Promise)', () => {
      const result = manager.isWasmBeneficial();

      expect(result).not.toBeInstanceOf(Promise);
      expect(typeof result).toBe('boolean');
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

    const criticalSyncMethods = [
      'translate',
      'findAllMatches',
      'getDefaultSearchOrder',
      'validateIntegrity',
    ];

    for (const methodName of criticalSyncMethods) {
      const method = manager[methodName];
      if (method) {
        const isAsync = method.constructor.name === 'AsyncFunction';
        expect(isAsync).toBe(false);
      }
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
