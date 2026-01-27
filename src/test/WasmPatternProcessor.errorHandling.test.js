/**
 * Tests for WasmPatternProcessor Error Handling
 *
 * Verifies graceful degradation when WASM fails:
 * - Returns empty results instead of throwing
 * - One-time user notifications
 * - Proper fallback behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the WASM module import
vi.mock('../wasm/translation_wasm_core.js', () => ({
  default: vi.fn(() => Promise.resolve()),
  WasmPatternProcessor: vi.fn(() => ({
    initialize: vi.fn(() => true),
    processTokens: vi.fn(() => []),
    getStatistics: vi.fn(() => ({ phaseAPatterns: 0, phaseBPatterns: 0 })),
    isInitialized: vi.fn(() => true),
  })),
}));

// Reset module state before tests
beforeEach(async () => {
  // Reset module by clearing cache
  vi.resetModules();
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
        WasmPatternProcessor: vi.fn(() => {
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
        WasmPatternProcessor: vi.fn(() => ({
          initialize: vi.fn(() => false), // Initialization fails
          isInitialized: vi.fn(() => false),
        })),
      }));

      const { initializeWasmPatternProcessor } = await import('../utils/WasmPatternProcessor.js');

      const result = await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
    });

    it('should not re-initialize if already initialized', async () => {
      const mockInit = vi.fn(() => true);
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(() => ({
          initialize: mockInit,
          getStatistics: vi.fn(() => ({ phaseAPatterns: 5 })),
          isInitialized: vi.fn(() => true),
        })),
      }));

      const { initializeWasmPatternProcessor } = await import('../utils/WasmPatternProcessor.js');

      // First initialization
      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      // Second attempt (should use cached)
      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      // Initialize should only be called once
      expect(mockInit).toHaveBeenCalledTimes(1);
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
        WasmPatternProcessor: vi.fn(() => ({
          initialize: vi.fn(() => true),
          processTokens: vi.fn(() => {
            throw new Error('Processing failed');
          }),
          isInitialized: vi.fn(() => true),
        })),
      }));

      const { initializeWasmPatternProcessor, processTokensWasm } =
        await import('../utils/WasmPatternProcessor.js');

      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      const tokens = [{ value: '在', type: 'chinese_char' }];
      const result = await processTokensWasm(tokens, {});

      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
      expect(result.error).toContain('error');
    });

    it('should handle null/undefined tokens gracefully', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(() => ({
          initialize: vi.fn(() => true),
          processTokens: vi.fn(() => []),
          isInitialized: vi.fn(() => true),
        })),
      }));

      const { initializeWasmPatternProcessor, processTokensWasm } =
        await import('../utils/WasmPatternProcessor.js');

      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

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
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(() => ({
          initialize: vi.fn(() => true),
          isInitialized: vi.fn(() => true),
          getStatistics: vi.fn(() => ({ phaseAPatterns: 10 })),
        })),
      }));

      const { initializeWasmPatternProcessor, isWasmPatternProcessorAvailable } =
        await import('../utils/WasmPatternProcessor.js');

      // Before initialization
      expect(isWasmPatternProcessorAvailable()).toBe(false);

      // After successful initialization
      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(isWasmPatternProcessorAvailable()).toBe(true);
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
        WasmPatternProcessor: vi.fn(() => ({
          initialize: mockInit,
          getStatistics: vi.fn(() => ({ phaseAPatterns: 5 })),
          isInitialized: vi.fn(() => true),
        })),
      }));

      const { initializeWasmPatternProcessor, reinitializeWasmPatternProcessor } =
        await import('../utils/WasmPatternProcessor.js');

      // Initial setup
      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      // Re-initialize with new patterns
      const result = await reinitializeWasmPatternProcessor({ X中Y: 'Y trong X' });

      expect(result).toBe(true);
      expect(mockInit).toHaveBeenCalledTimes(2); // Called twice (initial + reinit)
    });

    it('should clear failure state on re-initialization', async () => {
      let shouldFail = true;

      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => {
          if (shouldFail) {
            return Promise.reject(new Error('First attempt fails'));
          }
          return Promise.resolve();
        }),
        WasmPatternProcessor: vi.fn(() => ({
          initialize: vi.fn(() => true),
          isInitialized: vi.fn(() => true),
          getStatistics: vi.fn(() => ({ phaseAPatterns: 5 })),
        })),
      }));

      const {
        initializeWasmPatternProcessor,
        reinitializeWasmPatternProcessor,
        hasWasmPatternProcessorFailed,
      } = await import('../utils/WasmPatternProcessor.js');

      // First attempt fails
      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(hasWasmPatternProcessorFailed()).toBe(true);

      // Second attempt succeeds
      shouldFail = false;
      const result = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(true);
      expect(hasWasmPatternProcessorFailed()).toBe(false); // Failure cleared
    });
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

      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(() => ({
          initialize: vi.fn(() => true),
          getStatistics: vi.fn(() => mockStats),
          isInitialized: vi.fn(() => true),
        })),
      }));

      const { initializeWasmPatternProcessor, getWasmPatternProcessorStats } =
        await import('../utils/WasmPatternProcessor.js');

      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      const stats = getWasmPatternProcessorStats();

      expect(stats).toEqual(mockStats);
    });

    it('should handle statistics errors gracefully', async () => {
      vi.doMock('../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(() => ({
          initialize: vi.fn(() => true),
          getStatistics: vi.fn(() => {
            throw new Error('Stats failed');
          }),
          isInitialized: vi.fn(() => true),
        })),
      }));

      const { initializeWasmPatternProcessor, getWasmPatternProcessorStats } =
        await import('../utils/WasmPatternProcessor.js');

      await initializeWasmPatternProcessor({ X的Y: 'Y của X' });

      const stats = getWasmPatternProcessorStats();

      expect(stats).toBeNull();
    });
  });
});
