/**
 * Tests for WasmPatternProcessor Error Handling
 *
 * Verifies graceful degradation when WASM fails:
 * - Returns empty results instead of throwing
 * - One-time user notifications
 * - Proper fallback behavior
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock toast utility
const mockToast = vi.fn();
mockToast.warning = vi.fn();
mockToast.error = vi.fn();
vi.mock('../utils/toast', () => ({
  default: mockToast,
}));

// Reset module state before tests
beforeEach(async () => {
  // Clear all mocks and reset modules
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WasmPatternProcessor Error Handling', () => {
  describe('Initialization Failures', () => {
    it('should return false when WASM module fails to load', async () => {
      // Re-import with failing WASM
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.reject(new Error('WASM load failed'))),
      }));

      const { initializeWasmPatternProcessor } = await import('../utils/WasmPatternProcessor.js');

      const result = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
    });

    it('should return false when pattern processor creation fails', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          throw new Error('Processor creation failed');
        }),
      }));

      const { initializeWasmPatternProcessor } = await import('../utils/WasmPatternProcessor.js');

      const result = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
    });

    it('should return false when initialization returns false', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: vi.fn(() => false), // Initialization fails
            isInitialized: vi.fn(() => false),
          };
        }),
      }));

      const { initializeWasmPatternProcessor } = await import('../utils/WasmPatternProcessor.js');

      const result = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
    });

    it('should not re-initialize if already initialized', async () => {
      const mockInit = vi.fn(() => true);
      const mockIsInitialized = vi.fn(() => true);
      const mockGetStats = vi.fn(() => ({ phaseAPatterns: 5 }));

      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: mockInit,
            getStatistics: mockGetStats,
            isInitialized: mockIsInitialized,
          };
        }),
      }));

      const { initializeWasmPatternProcessor } = await import('../utils/WasmPatternProcessor.js');

      // First initialization - should call initialize
      const result1 = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result1).toBe(true);
      expect(mockInit).toHaveBeenCalledTimes(1);

      // Second attempt - should return early without calling initialize again
      const result2 = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result2).toBe(true);
      expect(mockInit).toHaveBeenCalledTimes(1); // Still only called once
    });
  });

  describe('Processing Failures', () => {
    it('should return empty results when not initialized', async () => {
      // Don't initialize, just call processTokens
      const { processTokensWasm } = await import('../utils/WasmPatternProcessor.js');

      const tokens = [{ value: '在', type: 'chinese_char' }];
      const result = await processTokensWasm(tokens, {});

      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
      expect(result.error).toContain('not initialized');
    });

    it('should return empty results when processing throws error', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: vi.fn(() => true),
            processTokens: vi.fn(() => {
              throw new Error('Processing failed');
            }),
            isInitialized: vi.fn(() => true),
            getStatistics: vi.fn(() => ({ phaseAPatterns: 5 })),
          };
        }),
      }));

      const { initializeWasmPatternProcessor, processTokensWasm } =
        await import('../utils/WasmPatternProcessor.js');

      const result1 = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result1).toBe(true);

      const tokens = [{ value: '在', type: 'chinese_char' }];
      const result = await processTokensWasm(tokens, {});

      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
      // Error message should mention the processing error
      expect(result.error).toContain('WASM pattern processing error');
    });

    it('should handle null/undefined tokens gracefully', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: vi.fn(() => true),
            processTokens: vi.fn(() => []),
            isInitialized: vi.fn(() => true),
            getStatistics: vi.fn(() => ({ phaseAPatterns: 5 })),
          };
        }),
      }));

      const { initializeWasmPatternProcessor, processTokensWasm } =
        await import('../utils/WasmPatternProcessor.js');

      const result = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result).toBe(true);

      // Test null tokens
      const result1 = await processTokensWasm(null, {});
      expect(result1.results).toEqual([]);

      // Test undefined tokens
      const result2 = await processTokensWasm(undefined, {});
      expect(result2.results).toEqual([]);
    });
  });

  describe('Status Checking', () => {
    it('should correctly report availability status', async () => {
      const mockIsInitialized = vi.fn(() => true);
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: vi.fn(() => true),
            isInitialized: mockIsInitialized,
            getStatistics: vi.fn(() => ({ phaseAPatterns: 10 })),
          };
        }),
      }));

      const { initializeWasmPatternProcessor, isWasmPatternProcessorAvailable } =
        await import('../utils/WasmPatternProcessor.js');

      // Before initialization
      expect(isWasmPatternProcessorAvailable()).toBe(false);

      // After successful initialization
      const result = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result).toBe(true);
      expect(isWasmPatternProcessorAvailable()).toBe(true);
      expect(mockIsInitialized).toHaveBeenCalled();
    });

    it('should correctly report failure status', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.reject(new Error('Load failed'))),
      }));

      const { initializeWasmPatternProcessor, hasWasmPatternProcessorFailed } =
        await import('../utils/WasmPatternProcessor.js');

      // Before initialization
      expect(hasWasmPatternProcessorFailed()).toBe(false);

      // After failed initialization
      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(hasWasmPatternProcessorFailed()).toBe(true);
    });
  });

  describe('Re-initialization', () => {
    it('should allow re-initialization with new patterns', async () => {
      const mockInit = vi.fn(() => true);
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: mockInit,
            getStatistics: vi.fn(() => ({ phaseAPatterns: 5 })),
            isInitialized: vi.fn(() => true),
          };
        }),
      }));

      const { initializeWasmPatternProcessor, reinitializeWasmPatternProcessor } =
        await import('../utils/WasmPatternProcessor.js');

      // Initial setup
      const result1 = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result1).toBe(true);
      expect(mockInit).toHaveBeenCalledTimes(1);

      // Re-initialize with new patterns (clears state and re-initializes)
      const result2 = await reinitializeWasmPatternProcessor({ X中Y: 'Y trong X' });

      expect(result2).toBe(true);
      expect(mockInit).toHaveBeenCalledTimes(2); // Called twice (initial + reinit)
    });

    it('should clear failure state on re-initialization', async () => {
      let shouldFail = true;
      const mockInit = vi.fn(() => true);

      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => {
          if (shouldFail) {
            return Promise.reject(new Error('First attempt fails'));
          }
          return Promise.resolve();
        }),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: mockInit,
            isInitialized: vi.fn(() => true),
            getStatistics: vi.fn(() => ({ phaseAPatterns: 5 })),
          };
        }),
      }));

      const {
        initializeWasmPatternProcessor,
        reinitializeWasmPatternProcessor,
        hasWasmPatternProcessorFailed,
      } = await import('../utils/WasmPatternProcessor.js');

      // First attempt fails
      const result1 = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result1).toBe(false);
      expect(hasWasmPatternProcessorFailed()).toBe(true);

      // CODE REVIEW FIX: Wait for cooldown period (5 seconds) before retry
      // The race condition fix adds a cooldown to prevent duplicate initialization attempts
      await new Promise((resolve) => setTimeout(resolve, 5500)); // Wait 5.5s (cooldown is 5s)

      // Second attempt succeeds (clears failure state)
      shouldFail = false;
      const result2 = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result2).toBe(true);
      expect(hasWasmPatternProcessorFailed()).toBe(false); // Failure cleared
      expect(mockInit).toHaveBeenCalledTimes(1); // Called once on successful reinit
    }, 10000); // 10 second timeout to accommodate 5.5s cooldown wait
  });

  describe('Statistics', () => {
    it('should return null when not initialized', async () => {
      const { getWasmPatternProcessorStats } = await import('../utils/WasmPatternProcessor.js');

      const stats = getWasmPatternProcessorStats();

      expect(stats).toBeNull();
    });

    it('should return statistics when initialized', async () => {
      const mockStats = {
        phaseAPatterns: 10,
        phaseBPatterns: 20,
        totalPatterns: 30,
      };
      const mockGetStats = vi.fn(() => mockStats);

      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: vi.fn(() => true),
            getStatistics: mockGetStats,
            isInitialized: vi.fn(() => true),
          };
        }),
      }));

      const { initializeWasmPatternProcessor, getWasmPatternProcessorStats } =
        await import('../utils/WasmPatternProcessor.js');

      const result = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result).toBe(true);

      const stats = getWasmPatternProcessorStats();

      expect(stats).toEqual(mockStats);
      expect(mockGetStats).toHaveBeenCalled();
    });

    it('should handle statistics errors gracefully', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: vi.fn(() => true),
            getStatistics: vi.fn(() => {
              throw new Error('Stats failed');
            }),
            isInitialized: vi.fn(() => true),
          };
        }),
      }));

      const { initializeWasmPatternProcessor, getWasmPatternProcessorStats } =
        await import('../utils/WasmPatternProcessor.js');

      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      const stats = getWasmPatternProcessorStats();

      expect(stats).toBeNull();
    });
  });
});
