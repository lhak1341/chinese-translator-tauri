/**
 * WASM Dictionary Manager Error Handling Tests
 *
 * Tests HIGH-4: WASM Dictionary Fallback Notifications
 * Verifies that users are notified when WASM dictionary engine enters fallback mode
 * due to repeated failures (slower performance)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import toast from '../toast';

// Mock react-hot-toast
vi.mock('../toast', () => ({
  default: {
    warning: vi.fn(),
  },
}));

// Mock WASM module
const mockDictionaryEngine = {
  load_dictionary: vi.fn(),
  find_matches: vi.fn(),
  find_longest_match: vi.fn(),
  get_total_entries: vi.fn(),
};

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: vi.fn(() => Promise.resolve()),
  DictionaryEngine: vi.fn(function () {
    return mockDictionaryEngine;
  }),
}));

// Mock memory pool
vi.mock('../wasm/WasmMemoryPoolManager.js', () => ({
  wasmMemoryPoolManager: {
    getCurrentMemoryUsage: vi.fn(() => 0),
    getStats: vi.fn(() => ({ totalMemoryUsage: 0 })),
  },
  WasmDictionaryOperationHelper: vi.fn(),
}));

// Mock WasmTextAssembler to prevent module-bottom prewarm from firing async
// console logs that race with worker teardown (EnvironmentTeardownError).
vi.mock('../wasm/WasmTextAssembler', () => ({
  wasmTextAssembler: {
    retireOnSharedModulePanic: vi.fn(),
    initialized: false,
  },
}));

// Mock WasmProcessorLifecycle so DictionaryManager init succeeds without real WASM binary
vi.mock('../wasm/WasmProcessorLifecycle', () => ({
  WasmProcessorLifecycle: vi.fn(function () {
    return {
      initialize: vi.fn(async (instantiateFn) => {
        await instantiateFn(new ArrayBuffer(0));
        return true;
      }),
      hasFailed: false,
      pendingInit: null,
    };
  }),
}));

describe('WasmDictionaryManager Error Handling', () => {
  let WasmDictionaryManager;
  let manager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset module registry each test so module-level _sharedModuleCorrupted
    // starts false (cascade-retire from prior tests doesn't bleed through).
    vi.resetModules();

    // Import module after mocks are set up
    const module = await import('../wasm/WasmDictionaryManager.js');
    WasmDictionaryManager = module.WasmDictionaryManager;

    manager = new WasmDictionaryManager();

    // Default successful responses
    mockDictionaryEngine.load_dictionary.mockReturnValue(true);
    mockDictionaryEngine.find_matches.mockReturnValue([]);
    mockDictionaryEngine.find_longest_match.mockReturnValue(null);
    mockDictionaryEngine.get_total_entries.mockReturnValue(0);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HIGH-4: Fallback mode notifications', () => {
    it('should show toast warning when entering fallback mode', async () => {
      const mockFallbackManager = { findMatches: vi.fn(() => []) };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Trigger threshold via handleFailure() — findMatches exceptions trigger
      // cascade-retire on the first call, making subsequent calls short-circuit
      // and preventing the threshold from being reached via the exception path.
      manager.handleFailure();
      manager.handleFailure();
      manager.handleFailure();

      expect(toast.warning).toHaveBeenCalledWith(
        'Dictionary system using slower fallback mode. Performance may be reduced.',
        { duration: 5000, id: 'wasm-dict-fallback' }
      );
      expect(manager.fallbackHandler.isInFallbackMode()).toBe(true);
    });

    it('should only show toast warning once', async () => {
      const mockFallbackManager = { findMatches: vi.fn(() => []) };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      for (let i = 0; i < 5; i++) {
        manager.handleFailure();
      }

      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.warning).toHaveBeenCalledWith(
        'Dictionary system using slower fallback mode. Performance may be reduced.',
        { duration: 5000, id: 'wasm-dict-fallback' }
      );
    });

    it('should not show toast if failures are non-consecutive (reset via loadDictionary)', async () => {
      const mockFallbackManager = {};

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      manager.handleFailure();
      manager.handleFailure();
      expect(manager.fallbackHandler.getFailureCount()).toBe(2);

      // Successful loadDictionary resets counter
      mockDictionaryEngine.load_dictionary.mockReturnValue(true);
      await manager.loadDictionary('characters', [{ chinese: '测试', vietnamese: 'test' }]);
      expect(manager.fallbackHandler.getFailureCount()).toBe(0);

      manager.handleFailure();
      manager.handleFailure();

      // Only 2 consecutive failures after reset — not at threshold yet
      expect(manager.fallbackHandler.getFailureCount()).toBe(2);
      expect(toast.warning).not.toHaveBeenCalled();
      expect(manager.fallbackHandler.isInFallbackMode()).toBe(false);
    });
  });

  describe('Failure tracking', () => {
    it('should track consecutive failures', async () => {
      const mockFallbackManager = { findMatches: vi.fn(() => []) };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      manager.handleFailure();
      manager.handleFailure();

      expect(manager.fallbackHandler.getFailureCount()).toBe(2);
    });

    it('should reset failure counter on successful dictionary load', async () => {
      const mockFallbackManager = {};

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      manager.handleFailure();
      manager.handleFailure();
      expect(manager.fallbackHandler.getFailureCount()).toBe(2);

      mockDictionaryEngine.load_dictionary.mockReturnValue(true);
      await manager.loadDictionary('characters', [{ chinese: '测试', vietnamese: 'test' }]);

      expect(manager.fallbackHandler.getFailureCount()).toBe(0);
    });

    it('should enter fallback mode after maxFailuresBeforeFallback', async () => {
      const mockFallbackManager = { findMatches: vi.fn(() => []) };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      for (let i = 0; i < manager.fallbackHandler.maxFailures; i++) {
        manager.handleFailure();
      }

      expect(manager.fallbackHandler.isInFallbackMode()).toBe(true);
      expect(manager.fallbackHandler.getFailureCount()).toBe(manager.fallbackHandler.maxFailures);
    });
  });

  describe('Fallback behavior', () => {
    it('should use fallback manager when in fallback mode', async () => {
      const mockFallbackManager = {
        findMatches: vi.fn(() => [{ word: 'test', translation: 'test' }]),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // REFACTOR (2026-01-28): Trigger fallback mode via failure tracking
      for (let i = 0; i < manager.fallbackHandler.maxFailures; i++) {
        manager.fallbackHandler.recordFailure();
      }

      // Action: Find matches while in fallback mode
      const results = manager.findMatches('characters', '测试', 0);

      // Assert: Fallback manager used, not WASM engine
      expect(mockFallbackManager.findMatches).toHaveBeenCalledWith('characters', '测试', 0);
      expect(mockDictionaryEngine.find_matches).not.toHaveBeenCalled();
      expect(results).toEqual([{ word: 'test', translation: 'test' }]);
    });

    it('should use fallback for findLongestMatch in fallback mode', async () => {
      const mockFallbackManager = {
        findLongestMatch: vi.fn(() => ({ word: 'longest', translation: 'longest' })),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // REFACTOR (2026-01-28): Trigger fallback mode via failure tracking
      for (let i = 0; i < manager.fallbackHandler.maxFailures; i++) {
        manager.fallbackHandler.recordFailure();
      }

      const result = manager.findLongestMatch('characters', '测试', 0);

      expect(mockFallbackManager.findLongestMatch).toHaveBeenCalledWith('characters', '测试', 0);
      expect(mockDictionaryEngine.find_longest_match).not.toHaveBeenCalled();
      expect(result).toEqual({ word: 'longest', translation: 'longest' });
    });

    it('should handle errors when fallback manager not available', async () => {
      await manager.initialize(null); // No fallback
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // REFACTOR (2026-01-28): Trigger fallback mode via failure tracking
      for (let i = 0; i < manager.fallbackHandler.maxFailures; i++) {
        manager.fallbackHandler.recordFailure();
      }

      const results = manager.findMatches('characters', '测试', 0);

      expect(results).toEqual([]);
    });
  });

  describe('Error propagation', () => {
    it('should handle dictionary loading errors', async () => {
      const mockFallbackManager = {
        loadDictionary: vi.fn(() => false),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      mockDictionaryEngine.load_dictionary.mockImplementation(() => {
        throw new Error('Loading failed');
      });

      const result = await manager.loadDictionary('characters', [
        { chinese: '测试', vietnamese: 'test' },
      ]);

      expect(mockFallbackManager.loadDictionary).toHaveBeenCalled();
      expect(manager.fallbackHandler.getFailureCount()).toBe(1);
    });

    it('should handle find_matches exceptions', async () => {
      const mockFallbackManager = {
        findMatches: vi.fn(() => []),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      mockDictionaryEngine.find_matches.mockImplementation(() => {
        throw new Error('Find matches failed');
      });

      const results = manager.findMatches('characters', '测试', 0);

      // Single exception: cascade-retires module but records 1 failure
      expect(mockFallbackManager.findMatches).toHaveBeenCalled();
      expect(manager.fallbackHandler.getFailureCount()).toBe(1);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle find_longest_match exceptions', async () => {
      const mockFallbackManager = {
        findLongestMatch: vi.fn(() => null),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      mockDictionaryEngine.find_longest_match.mockImplementation(() => {
        throw new Error('Find longest match failed');
      });

      const result = manager.findLongestMatch('characters', '测试', 0);

      expect(mockFallbackManager.findLongestMatch).toHaveBeenCalled();
      expect(manager.fallbackHandler.getFailureCount()).toBe(1);
    });
  });
});
