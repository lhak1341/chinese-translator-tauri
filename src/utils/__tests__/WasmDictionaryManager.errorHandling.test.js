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
vi.mock('../WasmMemoryPoolManager.js', () => ({
  wasmMemoryPoolManager: {
    getCurrentMemoryUsage: vi.fn(() => 0),
  },
  WasmDictionaryOperationHelper: vi.fn(),
}));

describe('WasmDictionaryManager Error Handling', () => {
  let WasmDictionaryManager;
  let manager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import module after mocks are set up
    const module = await import('../WasmDictionaryManager.js');
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
      // Setup: Initialize manager
      const mockFallbackManager = {
        findMatches: vi.fn(() => []),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Setup: Mock 3 consecutive failures to trigger fallback
      mockDictionaryEngine.find_matches
        .mockImplementationOnce(() => {
          throw new Error('WASM error 1');
        })
        .mockImplementationOnce(() => {
          throw new Error('WASM error 2');
        })
        .mockImplementationOnce(() => {
          throw new Error('WASM error 3');
        });

      // Action: Trigger 3 failures
      manager.findMatches('characters', '测试', 0);
      manager.findMatches('characters', '测试', 0);
      manager.findMatches('characters', '测试', 0);

      // Assert: Toast warning was shown
      expect(toast.warning).toHaveBeenCalledWith(
        'Dictionary system using slower fallback mode. Performance may be reduced.',
        { duration: 5000 }
      );

      // Assert: Fallback mode enabled
      expect(manager.fallbackMode).toBe(true);
    });

    it('should only show toast warning once', async () => {
      // Setup: Initialize manager
      const mockFallbackManager = {
        findMatches: vi.fn(() => []),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Setup: Mock 5 failures (3 to trigger, 2 more to verify no duplicate toasts)
      mockDictionaryEngine.find_matches.mockImplementation(() => {
        throw new Error('WASM error');
      });

      // Action: Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        manager.findMatches('characters', '测试', 0);
      }

      // Assert: Toast shown exactly once
      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.warning).toHaveBeenCalledWith(
        'Dictionary system using slower fallback mode. Performance may be reduced.',
        { duration: 5000 }
      );
    });

    it('should not show toast if failures are non-consecutive (reset via loadDictionary)', async () => {
      // Setup: Initialize manager
      const mockFallbackManager = {};

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Setup: findMatches failures, then loadDictionary success (which resets counter)
      mockDictionaryEngine.find_matches.mockImplementation(() => {
        throw new Error('WASM error');
      });

      // Action: 2 failures via findMatches
      manager.findMatches('characters', '测试', 0);
      manager.findMatches('characters', '测试', 0);

      expect(manager.consecutiveFailures).toBe(2);

      // Action: Successful loadDictionary resets counter
      mockDictionaryEngine.load_dictionary.mockReturnValue(true);
      await manager.loadDictionary('characters', [{ chinese: '测试', vietnamese: 'test' }]);

      expect(manager.consecutiveFailures).toBe(0);

      // Action: 2 more failures (but counter was reset, so only at 2, not 4)
      manager.findMatches('characters', '测试', 0);
      manager.findMatches('characters', '测试', 0);

      // Assert: Only 2 consecutive failures after reset, no toast shown yet
      expect(manager.consecutiveFailures).toBe(2);
      expect(toast.warning).not.toHaveBeenCalled();
      expect(manager.fallbackMode).toBe(false);
    });
  });

  describe('Failure tracking', () => {
    it('should track consecutive failures', async () => {
      const mockFallbackManager = {
        findMatches: vi.fn(() => []),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Setup: Mock failures
      mockDictionaryEngine.find_matches.mockImplementation(() => {
        throw new Error('WASM error');
      });

      // Action: 2 failures
      manager.findMatches('characters', '测试', 0);
      manager.findMatches('characters', '测试', 0);

      // Assert: Consecutive failures tracked
      expect(manager.consecutiveFailures).toBe(2);
    });

    it('should reset failure counter on successful dictionary load', async () => {
      const mockFallbackManager = {};

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Setup: 2 failures via findMatches
      mockDictionaryEngine.find_matches.mockImplementation(() => {
        throw new Error('WASM error');
      });

      manager.findMatches('characters', '测试', 0);
      manager.findMatches('characters', '测试', 0);

      expect(manager.consecutiveFailures).toBe(2);

      // Action: Successful load_dictionary
      mockDictionaryEngine.load_dictionary.mockReturnValue(true);
      await manager.loadDictionary('characters', [{ chinese: '测试', vietnamese: 'test' }]);

      // Assert: Counter reset after success
      expect(manager.consecutiveFailures).toBe(0);
    });

    it('should enter fallback mode after maxFailuresBeforeFallback', async () => {
      const mockFallbackManager = {
        findMatches: vi.fn(() => []),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      mockDictionaryEngine.find_matches.mockImplementation(() => {
        throw new Error('Persistent error');
      });

      // Action: Trigger failures up to threshold (default: 3)
      for (let i = 0; i < manager.maxFailuresBeforeFallback; i++) {
        manager.findMatches('characters', '测试', 0);
      }

      // Assert: Fallback mode enabled after threshold
      expect(manager.fallbackMode).toBe(true);
      expect(manager.consecutiveFailures).toBe(manager.maxFailuresBeforeFallback);
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
      manager.fallbackMode = true;

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
      manager.fallbackMode = true;

      // Action: Find longest match while in fallback mode
      const result = manager.findLongestMatch('characters', '测试', 0);

      // Assert: Fallback manager used
      expect(mockFallbackManager.findLongestMatch).toHaveBeenCalledWith('characters', '测试', 0);
      expect(mockDictionaryEngine.find_longest_match).not.toHaveBeenCalled();
      expect(result).toEqual({ word: 'longest', translation: 'longest' });
    });

    it('should handle errors when fallback manager not available', async () => {
      await manager.initialize(null); // No fallback
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;
      manager.fallbackMode = true;

      // Action: Try to find matches without fallback manager
      const results = manager.findMatches('characters', '测试', 0);

      // Assert: Returns empty array safely
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

      // Setup: Mock loading error
      mockDictionaryEngine.load_dictionary.mockImplementation(() => {
        throw new Error('Loading failed');
      });

      // Action: Try to load dictionary
      const result = await manager.loadDictionary('characters', [
        { chinese: '测试', vietnamese: 'test' },
      ]);

      // Assert: Falls back to JavaScript manager
      expect(mockFallbackManager.loadDictionary).toHaveBeenCalled();
      expect(manager.consecutiveFailures).toBe(1);
    });

    it('should handle find_matches exceptions', async () => {
      const mockFallbackManager = {
        findMatches: vi.fn(() => []),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Setup: Mock exception
      mockDictionaryEngine.find_matches.mockImplementation(() => {
        throw new Error('Find matches failed');
      });

      // Action: Find matches
      const results = manager.findMatches('characters', '测试', 0);

      // Assert: Falls back to JavaScript manager
      expect(mockFallbackManager.findMatches).toHaveBeenCalled();
      expect(manager.consecutiveFailures).toBe(1);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle find_longest_match exceptions', async () => {
      const mockFallbackManager = {
        findLongestMatch: vi.fn(() => null),
      };

      await manager.initialize(mockFallbackManager);
      manager.initialized = true;
      manager.engine = mockDictionaryEngine;

      // Setup: Mock exception
      mockDictionaryEngine.find_longest_match.mockImplementation(() => {
        throw new Error('Find longest match failed');
      });

      // Action: Find longest match
      const result = manager.findLongestMatch('characters', '测试', 0);

      // Assert: Falls back to JavaScript manager
      expect(mockFallbackManager.findLongestMatch).toHaveBeenCalled();
      expect(manager.consecutiveFailures).toBe(1);
    });
  });
});
