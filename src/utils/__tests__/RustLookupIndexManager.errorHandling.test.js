/**
 * Rust Lookup Index Manager Error Handling Tests
 *
 * Tests HIGH-2: Rust Lookup Index Fallback Notifications
 * Verifies that users are notified when Rust indexing falls back to JavaScript
 * due to repeated failures (6-50x performance degradation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import toast from '../toast';

// Mock react-hot-toast
vi.mock('../toast', () => ({
  default: {
    warning: vi.fn(),
  },
}));

// Mock tauriAPI
const mockTauriAPI = {
  buildLookupIndex: vi.fn(),
};

vi.mock('../../tauriAPI.js', () => ({
  default: mockTauriAPI,
}));

describe('RustLookupIndexManager Error Handling', () => {
  let RustLookupIndexManager;
  let manager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import module after mocks are set up
    const module = await import('../RustLookupIndexManager.js');
    RustLookupIndexManager = module.default;

    manager = new RustLookupIndexManager();

    // Default successful response
    mockTauriAPI.buildLookupIndex.mockResolvedValue({
      success: true,
      index: {},
      buildTimeMs: 100,
      positionsIndexed: 100,
      indexSize: 10,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HIGH-2: Fallback mode notifications', () => {
    it('should show toast warning when entering fallback mode', async () => {
      // Setup: Mock 3 consecutive failures to trigger fallback
      mockTauriAPI.buildLookupIndex
        .mockResolvedValueOnce({
          success: false,
          error: 'Rust build failed 1',
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Rust build failed 2',
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Rust build failed 3',
        });

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: Trigger 3 failures
      await manager.buildLookupIndex('测试文本', dictionariesMap, dictionaryOrder);
      await manager.buildLookupIndex('测试文本', dictionariesMap, dictionaryOrder);
      await manager.buildLookupIndex('测试文本', dictionariesMap, dictionaryOrder);

      // Assert: Toast warning was shown
      expect(toast.warning).toHaveBeenCalledWith(
        'High-performance indexing unavailable. Large texts may translate slower.',
        { duration: 5000 }
      );

      // Assert: Manager disabled
      expect(manager.enabled).toBe(false);
    });

    it('should only show toast warning once', async () => {
      // Setup: Mock 5 failures (3 to trigger, 2 more to verify no duplicate toasts)
      mockTauriAPI.buildLookupIndex.mockResolvedValue({
        success: false,
        error: 'Rust build failed',
      });

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        await manager.buildLookupIndex('测试文本', dictionariesMap, dictionaryOrder);
      }

      // Assert: Toast shown exactly once (not for failures 4 and 5)
      expect(toast.warning).toHaveBeenCalledTimes(1);
      expect(toast.warning).toHaveBeenCalledWith(
        'High-performance indexing unavailable. Large texts may translate slower.',
        { duration: 5000 }
      );
    });

    it('should not show toast if failures are non-consecutive', async () => {
      // Setup: Alternating success and failure (should not trigger fallback)
      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: 2 failures, 1 success, 2 failures
      mockTauriAPI.buildLookupIndex.mockResolvedValueOnce({
        success: false,
        error: 'Failure 1',
      });
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      mockTauriAPI.buildLookupIndex.mockResolvedValueOnce({
        success: false,
        error: 'Failure 2',
      });
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      mockTauriAPI.buildLookupIndex.mockResolvedValueOnce({
        success: true,
        index: {},
        buildTimeMs: 100,
        positionsIndexed: 100,
        indexSize: 10,
      });
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      // Assert: Failure counter should be reset, no toast shown
      expect(toast.warning).not.toHaveBeenCalled();
      expect(manager.enabled).toBe(true);
    });
  });

  describe('Failure tracking', () => {
    it('should track consecutive failures', async () => {
      mockTauriAPI.buildLookupIndex.mockResolvedValue({
        success: false,
        error: 'Build failed',
      });

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: 2 failures
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      // Assert: Consecutive failures tracked
      expect(manager.consecutiveFailures).toBe(2);
      expect(manager.stats.failures).toBe(2);
    });

    it('should reset failure counter on success', async () => {
      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Setup: 2 failures then success
      mockTauriAPI.buildLookupIndex
        .mockResolvedValueOnce({
          success: false,
          error: 'Failure 1',
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Failure 2',
        })
        .mockResolvedValueOnce({
          success: true,
          index: {},
          buildTimeMs: 100,
          positionsIndexed: 100,
          indexSize: 10,
        });

      // Action: 2 failures then 1 success
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      // Assert: Counter reset after success
      expect(manager.consecutiveFailures).toBe(0);
      expect(manager.stats.failures).toBe(2); // Total failures still counted
    });

    it('should disable after maxFailuresBeforeFallback', async () => {
      mockTauriAPI.buildLookupIndex.mockResolvedValue({
        success: false,
        error: 'Persistent failure',
      });

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: Trigger failures up to threshold (default: 3)
      for (let i = 0; i < manager.maxFailuresBeforeFallback; i++) {
        await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);
      }

      // Assert: Manager disabled after threshold
      expect(manager.enabled).toBe(false);
      expect(manager.consecutiveFailures).toBe(manager.maxFailuresBeforeFallback);
    });
  });

  describe('Error handling behavior', () => {
    it('should return error result when disabled', async () => {
      // Setup: Disable manager
      manager.enabled = false;

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: Try to build index while disabled
      const result = await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      // Assert: Returns error result without calling Rust
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rust indexing disabled');
      expect(mockTauriAPI.buildLookupIndex).not.toHaveBeenCalled();
    });

    it('should handle Tauri API exceptions', async () => {
      mockTauriAPI.buildLookupIndex.mockRejectedValueOnce(new Error('Tauri command not found'));

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: Build index with exception
      const result = await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      // Assert: Returns error result safely
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tauri command not found');
      expect(manager.consecutiveFailures).toBe(1);
    });
  });

  describe('Performance statistics', () => {
    it('should track performance stats on success', async () => {
      mockTauriAPI.buildLookupIndex.mockResolvedValueOnce({
        success: true,
        index: {},
        buildTimeMs: 250,
        positionsIndexed: 500,
        indexSize: 50,
      });

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      // Action: Successful build
      await manager.buildLookupIndex('测试文本', dictionariesMap, dictionaryOrder);

      // Assert: Stats updated
      expect(manager.stats.totalBuilds).toBe(1);
      expect(manager.stats.totalBuildTimeMs).toBe(250);
      expect(manager.stats.averageBuildTimeMs).toBe(250);
      expect(manager.stats.totalPositionsIndexed).toBe(500);
      expect(manager.stats.totalMatches).toBe(50);
    });

    it('should not update stats on failure', async () => {
      mockTauriAPI.buildLookupIndex.mockResolvedValueOnce({
        success: false,
        error: 'Build failed',
      });

      const dictionariesMap = new Map();
      const dictionaryOrder = ['characters'];

      const initialStats = { ...manager.stats };

      // Action: Failed build
      await manager.buildLookupIndex('测试', dictionariesMap, dictionaryOrder);

      // Assert: Stats unchanged (except failures)
      expect(manager.stats.totalBuilds).toBe(initialStats.totalBuilds);
      expect(manager.stats.totalBuildTimeMs).toBe(initialStats.totalBuildTimeMs);
      expect(manager.stats.failures).toBe(initialStats.failures + 1);
    });
  });
});
