/**
 * Tests for WasmPatternProcessor Error Handling
 *
 * Verifies graceful degradation when WASM fails, through the wrapper's whole interface:
 * `reinitializeWasmPatternProcessor`, `isWasmPatternProcessorReady`, `processTokensWasm`.
 * - Returns empty results instead of throwing
 * - A processing panic retires the processor for good
 * - A failed init can be retried after the cooldown
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock toast utility
const mockToast = vi.fn();
mockToast.warning = vi.fn();
mockToast.error = vi.fn();
vi.mock('../toast', () => ({
  default: mockToast,
}));

/**
 * A mock WasmPatternProcessor instance with the wrapper's real method set — the lifecycle's
 * instance check requires every expected method — each test overriding what it exercises.
 */
const patternInstance = (overrides = {}) => ({
  initialize: vi.fn(() => true),
  processTokens: vi.fn(() => []),
  free: vi.fn(),
  ...overrides,
});

// CODE REVIEW FIX: Mock fetch for WASM binary loading
global.fetch = vi.fn(async () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(8),
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
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.reject(new Error('WASM load failed'))),
      }));

      const { reinitializeWasmPatternProcessor } = await import('../wasm/WasmPatternProcessor.js');

      const result = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
    });

    it('should return false when pattern processor creation fails', async () => {
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          throw new Error('Processor creation failed');
        }),
      }));

      const { reinitializeWasmPatternProcessor } = await import('../wasm/WasmPatternProcessor.js');

      const result = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
    });

    it('should return false when initialization returns false', async () => {
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return patternInstance({
            initialize: vi.fn(() => false), // Initialization fails
            isInitialized: vi.fn(() => false),
          });
        }),
      }));

      const { reinitializeWasmPatternProcessor } = await import('../wasm/WasmPatternProcessor.js');

      const result = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
    });

    it('should call __destroy_into_raw on instance when instance verification fails after instantiation', async () => {
      const mockDestroyIntoRaw = vi.fn();

      // The instance lacks `free`, one of the wrapper's expected methods — so the lifecycle's
      // instance check fails AFTER instantiateFn already set wasmPatternProcessor = instance.
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return {
            initialize: vi.fn(() => true),
            processTokens: vi.fn(() => []),
            __destroy_into_raw: mockDestroyIntoRaw,
          };
        }),
      }));

      const { reinitializeWasmPatternProcessor } = await import('../wasm/WasmPatternProcessor.js');

      const result = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result).toBe(false);
      // __destroy_into_raw must be called to unregister the FinalizationRegistry —
      // without it, a stale callback can free memory reused by TextAssembler, corrupting
      // borrow_count and causing "recursive use" on the next assembleWithSpacing call.
      expect(mockDestroyIntoRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('Processing Failures', () => {
    it('should return empty results when not initialized', async () => {
      // Don't initialize, just call processTokens
      const { processTokensWasm } = await import('../wasm/WasmPatternProcessor.js');

      const tokens = [{ value: '在', type: 'chinese_char' }];
      const result = await processTokensWasm(tokens, {});

      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
      expect(result.error).toContain('not initialized');
    });

    it('should return empty results when processing throws error', async () => {
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return patternInstance({
            initialize: vi.fn(() => true),
            processTokens: vi.fn(() => {
              throw new Error('Processing failed');
            }),
            isInitialized: vi.fn(() => true),
            __destroy_into_raw: vi.fn(),
          });
        }),
      }));

      const { reinitializeWasmPatternProcessor, processTokensWasm, isWasmPatternProcessorReady } =
        await import('../wasm/WasmPatternProcessor.js');

      const result1 = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result1).toBe(true);

      const tokens = [{ value: '在', type: 'chinese_char' }];
      const result = await processTokensWasm(tokens, {});

      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
      // Error message should mention the processing error
      expect(result.error).toContain('WASM pattern processing error');
      // A throw may be a Rust panic, so the processor is retired for good
      expect(isWasmPatternProcessorReady()).toBe(false);
    });

    it('should handle null/undefined tokens gracefully', async () => {
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return patternInstance({
            initialize: vi.fn(() => true),
            processTokens: vi.fn(() => []),
            isInitialized: vi.fn(() => true),
            __destroy_into_raw: vi.fn(),
          });
        }),
      }));

      const { reinitializeWasmPatternProcessor, processTokensWasm } =
        await import('../wasm/WasmPatternProcessor.js');

      const result = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result).toBe(true);

      // Test null tokens
      const result1 = await processTokensWasm(null, {});
      expect(result1.results).toEqual([]);

      // Test undefined tokens
      const result2 = await processTokensWasm(undefined, {});
      expect(result2.results).toEqual([]);
    });
  });

  describe('Readiness', () => {
    it('should report ready only after a successful initialization', async () => {
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return patternInstance({ initialize: vi.fn(() => true) });
        }),
      }));

      const { reinitializeWasmPatternProcessor, isWasmPatternProcessorReady } =
        await import('../wasm/WasmPatternProcessor.js');

      expect(isWasmPatternProcessorReady()).toBe(false);

      const result = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result).toBe(true);
      expect(isWasmPatternProcessorReady()).toBe(true);
    });

    it('should stay not ready after a failed initialization', async () => {
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.reject(new Error('Load failed'))),
      }));

      const { reinitializeWasmPatternProcessor, isWasmPatternProcessorReady } =
        await import('../wasm/WasmPatternProcessor.js');

      expect(isWasmPatternProcessorReady()).toBe(false);

      await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(isWasmPatternProcessorReady()).toBe(false);
    });
  });

  describe('Re-initialization', () => {
    it('should allow re-initialization with new patterns', async () => {
      const mockInit = vi.fn(() => true);
      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => Promise.resolve()),
        WasmPatternProcessor: vi.fn(function () {
          return patternInstance({
            initialize: mockInit,
            isInitialized: vi.fn(() => true),
            __destroy_into_raw: vi.fn(),
          });
        }),
      }));

      const { reinitializeWasmPatternProcessor } = await import('../wasm/WasmPatternProcessor.js');

      // Initial setup
      const result1 = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });
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

      vi.doMock('../../wasm/translation_wasm_core.js', () => ({
        default: vi.fn(() => {
          if (shouldFail) {
            return Promise.reject(new Error('First attempt fails'));
          }
          return Promise.resolve();
        }),
        WasmPatternProcessor: vi.fn(function () {
          return patternInstance({
            initialize: mockInit,
            isInitialized: vi.fn(() => true),
          });
        }),
      }));

      const { reinitializeWasmPatternProcessor, isWasmPatternProcessorReady } =
        await import('../wasm/WasmPatternProcessor.js');

      // First attempt fails
      const result1 = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });
      expect(result1).toBe(false);
      expect(isWasmPatternProcessorReady()).toBe(false);

      // CODE REVIEW FIX: Wait for cooldown period (5 seconds) before retry
      // The race condition fix adds a cooldown to prevent duplicate initialization attempts
      await new Promise((resolve) => setTimeout(resolve, 5500)); // Wait 5.5s (cooldown is 5s)

      // Second attempt succeeds (clears failure state)
      shouldFail = false;
      const result2 = await reinitializeWasmPatternProcessor({ X的Y: 'Y của X' });

      expect(result2).toBe(true);
      expect(isWasmPatternProcessorReady()).toBe(true); // Failure cleared
      expect(mockInit).toHaveBeenCalledTimes(1); // Called once on successful reinit
    }, 10000); // 10 second timeout to accommodate 5.5s cooldown wait
  });
});
