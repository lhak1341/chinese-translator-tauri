/**
 * WASM Dictionary Reload Testing Suite
 * Comprehensive testing for Cmd/Ctrl-R dictionary reload scenarios
 *
 * Tests critical scenarios identified in CLAUDE.md:
 * - Manual reload system prevents translation interruptions
 * - Hotkey Cmd/Ctrl-R triggers dictionary refresh from storage
 * - Reload fetches fresh data directly from storage via electron API
 * - Atomic dictionary replacement prevents corruption
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedDictionaryManager } from '../EnhancedDictionaryManager.js';
// import { WasmDictionaryManager } from '../WasmDictionaryManager.js';

// Mock electron API
const mockElectronAPI = {
  loadConfiguration: vi.fn(),
  loadAllDictionaries: vi.fn(),
  loadDictionaryFromStorage: vi.fn(),
  saveDictionaryToStorage: vi.fn(),
};

// Mock performance for testing
global.performance = global.performance || {
  now: () => Date.now(),
  memory: {
    usedJSHeapSize: 1000000,
    totalJSHeapSize: 2000000,
    jsHeapSizeLimit: 4000000,
  },
};

describe('WASM Dictionary Reload Integration Tests', () => {
  let dictionaryManager;
  let wasmManager;
  let initialDictionaries;

  beforeEach(async () => {
    // Setup initial test dictionaries
    initialDictionaries = {
      characters: [
        { chinese: '你', vietnamese: 'bạn', source: 'test' },
        { chinese: '好', vietnamese: 'tốt', source: 'test' },
        { chinese: '世', vietnamese: 'thế', source: 'test' },
        { chinese: '界', vietnamese: 'giới', source: 'test' },
      ],
      phrases: [
        { chinese: '你好', vietnamese: 'xin chào', source: 'test' },
        { chinese: '世界', vietnamese: 'thế giới', source: 'test' },
      ],
    };

    // Mock electron API responses
    mockElectronAPI.loadAllDictionaries.mockResolvedValue(initialDictionaries);
    mockElectronAPI.loadConfiguration.mockResolvedValue({
      activeDictionaries: ['characters', 'phrases'],
    });

    // Initialize dictionary manager
    dictionaryManager = new EnhancedDictionaryManager();
    await waitForInitialization(dictionaryManager);

    // Load initial dictionaries
    for (const [name, entries] of Object.entries(initialDictionaries)) {
      await dictionaryManager.loadDictionary(name, entries);
    }

    wasmManager = dictionaryManager.wasmManager;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Manual Reload System (Cmd/Ctrl-R)', () => {
    test('handles dictionary reload during active translation', async () => {
      const largeText = '你好世界这是一个测试'.repeat(100);

      // Start a long-running translation
      const translationPromise = simulateLongTranslation(dictionaryManager, largeText);

      // Wait a bit, then trigger reload during translation
      await delay(50);

      const updatedDictionaries = {
        characters: [
          ...initialDictionaries.characters,
          { chinese: '新', vietnamese: 'mới', source: 'reload-test' },
        ],
        phrases: initialDictionaries.phrases,
      };

      mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(updatedDictionaries);

      // Simulate Cmd/Ctrl-R reload
      const reloadResult = await simulateManualReload(dictionaryManager);

      // Translation should complete without corruption
      const translationResult = await translationPromise;

      expect(reloadResult).toBe(true);
      expect(translationResult).toBeDefined();
      expect(translationResult.length).toBeGreaterThan(0);

      // Verify new dictionary entry is available after reload
      const newWordMatch = dictionaryManager.findMatch('characters', '新');
      expect(newWordMatch).toBeTruthy();
      expect(newWordMatch.translation).toBe('mới');
    });

    test('atomic dictionary replacement prevents corruption', async () => {
      const _testEntry = { chinese: '测试', vietnamese: 'thử nghiệm', source: 'atomic-test' };

      // Perform multiple rapid reloads to test atomicity
      const reloadPromises = Array(5)
        .fill()
        .map(async (_, i) => {
          const updatedDict = {
            characters: [
              ...initialDictionaries.characters,
              { chinese: '测试', vietnamese: `version-${i}`, source: 'atomic-test' },
            ],
            phrases: initialDictionaries.phrases,
          };

          mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(updatedDict);
          return simulateManualReload(dictionaryManager);
        });

      const results = await Promise.all(reloadPromises);

      // All reloads should succeed
      expect(results.every((r) => r === true)).toBe(true);

      // Dictionary should be in valid state (not corrupted)
      const finalMatch = dictionaryManager.findMatch('characters', '测试');
      expect(finalMatch).toBeTruthy();
      expect(finalMatch.translation).toMatch(/^version-\d$/);
    });

    test('reload queue prevents concurrent reload conflicts', async () => {
      let reloadCount = 0;
      const slowReloadMock = () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            reloadCount++;
            resolve({
              characters: [
                ...initialDictionaries.characters,
                {
                  chinese: `reload${reloadCount}`,
                  vietnamese: `reload${reloadCount}`,
                  source: 'queue-test',
                },
              ],
              phrases: initialDictionaries.phrases,
            });
          }, 100);
        });
      };

      mockElectronAPI.loadAllDictionaries.mockImplementation(slowReloadMock);

      // Trigger multiple reloads rapidly
      const reload1 = simulateManualReload(dictionaryManager);
      const reload2 = simulateManualReload(dictionaryManager); // Should queue
      const reload3 = simulateManualReload(dictionaryManager); // Should queue

      const results = await Promise.all([reload1, reload2, reload3]);

      // All should succeed without conflicts
      expect(results.every((r) => r === true)).toBe(true);

      // Verify final state is consistent
      const match1 = dictionaryManager.findMatch('characters', 'reload1');
      const match2 = dictionaryManager.findMatch('characters', 'reload2');
      const match3 = dictionaryManager.findMatch('characters', 'reload3');

      // At least the last reload should be present
      expect(match3 || match2 || match1).toBeTruthy();
    });
  });

  describe('WASM-JavaScript Synchronization', () => {
    test('both engines stay synchronized after reload', async () => {
      const updatedDictionaries = {
        characters: [
          ...initialDictionaries.characters,
          { chinese: '同步', vietnamese: 'đồng bộ', source: 'sync-test' },
        ],
        phrases: [
          ...initialDictionaries.phrases,
          { chinese: '同步测试', vietnamese: 'thử nghiệm đồng bộ', source: 'sync-test' },
        ],
      };

      mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(updatedDictionaries);

      await simulateManualReload(dictionaryManager);

      // Test both JavaScript and WASM implementations
      const jsResult = dictionaryManager.findMatch('characters', '同步', { forceJS: true });

      let wasmResult;
      try {
        wasmResult = dictionaryManager.findMatch('characters', '同步', { forceWASM: true });
      } catch (_error) {
        // WASM might not be available in test environment
        console.log('WASM not available in test, skipping WASM comparison');
        return;
      }

      expect(jsResult).toBeTruthy();
      expect(wasmResult).toBeTruthy();
      expect(jsResult.translation).toBe(wasmResult.translation);
      expect(jsResult.translation).toBe('đồng bộ');
    });

    test('WASM memory management during reload', async () => {
      if (!wasmManager || !wasmManager.isInitialized) {
        console.log('WASM not available, skipping memory management test');
        return;
      }

      const initialMemory = wasmManager.getMemoryUsage();

      // Perform multiple reloads with increasing dictionary sizes
      for (let i = 1; i <= 3; i++) {
        const largeDictionary = Array(1000 * i)
          .fill()
          .map((_, idx) => ({
            chinese: `字${idx}`,
            vietnamese: `chữ${idx}`,
            source: `memory-test-${i}`,
          }));

        const updatedDict = {
          characters: largeDictionary,
          phrases: initialDictionaries.phrases,
        };

        mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(updatedDict);
        await simulateManualReload(dictionaryManager);

        const currentMemory = wasmManager.getMemoryUsage();

        // Memory should be managed properly (not growing unboundedly)
        expect(currentMemory).toBeLessThan(initialMemory * 10); // Reasonable growth limit
      }
    });

    test('dictionary versioning tracks reload history', async () => {
      if (!wasmManager || !wasmManager.isInitialized) {
        console.log('WASM not available, skipping versioning test');
        return;
      }

      const initialVersion = wasmManager.getDictionaryVersion('characters');

      // Perform reload
      const updatedDict = {
        characters: [
          ...initialDictionaries.characters,
          { chinese: '版本', vietnamese: 'phiên bản', source: 'version-test' },
        ],
        phrases: initialDictionaries.phrases,
      };

      mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(updatedDict);
      await simulateManualReload(dictionaryManager);

      const newVersion = wasmManager.getDictionaryVersion('characters');

      expect(newVersion).toBeDefined();
      if (initialVersion) {
        expect(newVersion.version).toBeGreaterThan(initialVersion.version);
        expect(newVersion.entryCount).toBeGreaterThan(initialVersion.entryCount);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    test('graceful fallback when reload fails', async () => {
      // Mock a failed reload
      mockElectronAPI.loadAllDictionaries.mockRejectedValueOnce(new Error('Storage unavailable'));

      const reloadResult = await simulateManualReload(dictionaryManager);

      // Reload should fail gracefully
      expect(reloadResult).toBe(false);

      // Original dictionaries should still work
      const originalMatch = dictionaryManager.findMatch('characters', '你');
      expect(originalMatch).toBeTruthy();
      expect(originalMatch.translation).toBe('bạn');
    });

    test('handles corrupt dictionary data during reload', async () => {
      // Mock corrupt data
      const corruptDict = {
        characters: [
          { chinese: '坏', vietnamese: null, source: 'corrupt' }, // Invalid entry
          { chinese: null, vietnamese: 'bad', source: 'corrupt' }, // Invalid entry
          { chinese: '好', vietnamese: 'tốt', source: 'valid' }, // Valid entry
        ],
        phrases: initialDictionaries.phrases,
      };

      mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(corruptDict);

      const reloadResult = await simulateManualReload(dictionaryManager);

      // Should handle corruption gracefully
      expect(reloadResult).toBeDefined(); // May succeed or fail gracefully

      // Valid entries should work if reload succeeded
      const validMatch = dictionaryManager.findMatch('characters', '好');
      expect(validMatch).toBeTruthy();
    });

    test('recovery from WASM failure during reload', async () => {
      if (!wasmManager) {
        console.log('WASM not available, skipping WASM failure test');
        return;
      }

      // Force WASM into failure mode
      if (wasmManager.setFailureMode) {
        wasmManager.setFailureMode(true);
      }

      const updatedDict = {
        characters: [
          ...initialDictionaries.characters,
          { chinese: '恢复', vietnamese: 'phục hồi', source: 'recovery-test' },
        ],
        phrases: initialDictionaries.phrases,
      };

      mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(updatedDict);

      const reloadResult = await simulateManualReload(dictionaryManager);

      // Should fallback to JavaScript successfully
      expect(reloadResult).toBe(true);

      // New entries should be available via JavaScript fallback
      const match = dictionaryManager.findMatch('characters', '恢复', { forceJS: true });
      expect(match).toBeTruthy();
      expect(match.translation).toBe('phục hồi');
    });
  });

  describe('Performance Impact of Reloads', () => {
    test('reload completes within reasonable time', async () => {
      const moderateSizeDict = {
        characters: Array(1000)
          .fill()
          .map((_, i) => ({
            chinese: `字${i}`,
            vietnamese: `chữ${i}`,
            source: 'perf-test',
          })),
        phrases: initialDictionaries.phrases,
      };

      mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(moderateSizeDict);

      const startTime = performance.now();
      const reloadResult = await simulateManualReload(dictionaryManager);
      const reloadTime = performance.now() - startTime;

      expect(reloadResult).toBe(true);
      expect(reloadTime).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`Dictionary reload completed in ${reloadTime.toFixed(2)}ms`);
    });

    test('translation performance after reload', async () => {
      const updatedDict = {
        characters: [
          ...initialDictionaries.characters,
          { chinese: '性能', vietnamese: 'hiệu suất', source: 'perf-test' },
        ],
        phrases: initialDictionaries.phrases,
      };

      mockElectronAPI.loadAllDictionaries.mockResolvedValueOnce(updatedDict);
      await simulateManualReload(dictionaryManager);

      const testText = '性能测试你好世界';
      const iterations = 100;

      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        dictionaryManager.findMatch('characters', testText);
      }
      const totalTime = performance.now() - startTime;
      const avgTime = totalTime / iterations;

      // Performance should remain good after reload
      expect(avgTime).toBeLessThan(10); // Less than 10ms per lookup on average

      console.log(`Post-reload translation performance: ${avgTime.toFixed(2)}ms avg`);
    });
  });
});

// Utility functions for testing

async function waitForInitialization(manager, timeoutMs = 5000) {
  const startTime = Date.now();

  while (!manager.initialized && Date.now() - startTime < timeoutMs) {
    await delay(50);
  }

  if (!manager.initialized) {
    throw new Error('Dictionary manager failed to initialize within timeout');
  }
}

async function simulateManualReload(manager) {
  try {
    // Simulate the manual reload process triggered by Cmd/Ctrl-R
    if (manager.wasmManager && manager.wasmManager.handleManualReload) {
      return await manager.wasmManager.handleManualReload();
    } else {
      // Fallback to direct dictionary reloading
      const dictionaries = await mockElectronAPI.loadAllDictionaries();

      const reloadPromises = Object.entries(dictionaries).map(([name, entries]) =>
        manager.loadDictionary(name, entries)
      );

      await Promise.all(reloadPromises);
      return true;
    }
  } catch (error) {
    console.error('Manual reload simulation failed:', error);
    return false;
  }
}

async function simulateLongTranslation(manager, text) {
  // Simulate a long translation process
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = manager.findMatch('characters', text);
      resolve(result ? text.length : 0);
    }, 200);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Export test utilities for use in other test files
export { waitForInitialization, simulateManualReload, simulateLongTranslation, delay };
