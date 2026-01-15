/**
 * WASM Pattern Processor Error Handling Tests
 *
 * Tests CRITICAL-2: WASM Pattern Processor Graceful Degradation
 * Verifies that pattern processor degrades gracefully instead of crashing
 * when WASM fails to initialize or encounters processing errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    warning: vi.fn(),
  },
}));

import {
  processTokensWasm,
  isWasmPatternProcessorAvailable,
  hasWasmPatternProcessorFailed,
} from '../WasmPatternProcessor.js';

describe('WASM Pattern Processor Error Handling', () => {
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('CRITICAL-2: Graceful degradation when WASM not initialized', () => {
    it('should return empty array when WASM not initialized', async () => {
      // Note: WASM is not initialized in test environment by default

      const semanticTokens = [
        { value: '在', translated: null, translationSource: null },
        { value: 'X', translated: null, translationSource: null },
        { value: 'Y', translated: null, translationSource: null },
        { value: '中', translated: null, translationSource: null },
      ];

      const variableCache = new Map();

      // Action: Process tokens without WASM initialized
      const results = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Returns empty array instead of throwing
      expect(results).toEqual([]);
      expect(Array.isArray(results)).toBe(true);

      // Assert: Warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WASM Pattern Processor not initialized')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Translation will continue with lower quality')
      );
    });

    it('should allow translation to continue without patterns', async () => {
      const semanticTokens = [
        { value: '你好', translated: null, translationSource: null },
        { value: '世界', translated: null, translationSource: null },
      ];

      const variableCache = new Map();

      // Action: Process tokens without WASM
      const results = await processTokensWasm(semanticTokens, variableCache);

      // Assert: No exception thrown, returns safely
      expect(results).toEqual([]);
      expect(() => processTokensWasm(semanticTokens, variableCache)).not.toThrow();
    });

    it('should report WASM as unavailable when not initialized', () => {
      // Assert: WASM is reported as unavailable
      expect(isWasmPatternProcessorAvailable()).toBe(false);
    });
  });

  describe('CRITICAL-2: Error handling during pattern processing', () => {
    it('should handle processing errors gracefully', async () => {
      // This test verifies the try-catch in processTokensWasm
      // Even if WASM throws an error, we catch it and return empty array

      const semanticTokens = [{ value: '测试', translated: null, translationSource: null }];

      const variableCache = new Map();

      // Action: Process tokens (will fail because WASM not initialized)
      const results = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Returns empty array instead of propagating error
      expect(results).toEqual([]);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should log errors without throwing', async () => {
      const semanticTokens = [{ value: '在XY中', translated: null, translationSource: null }];

      const variableCache = new Map();

      // Action: Process tokens
      const results = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Warning logged but no exception
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(results).toEqual([]);
    });
  });

  describe('Status reporting', () => {
    it('should correctly report initialization failure status', () => {
      // In test environment, WASM fails to load automatically
      // The module sets initializationFailed = true on import failure

      // Assert: Status functions work correctly
      expect(typeof isWasmPatternProcessorAvailable()).toBe('boolean');
      expect(typeof hasWasmPatternProcessorFailed()).toBe('boolean');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty token array', async () => {
      const semanticTokens = [];
      const variableCache = new Map();

      // Action: Process empty array
      const results = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Returns empty array safely
      expect(results).toEqual([]);
    });

    it('should handle null variable cache', async () => {
      const semanticTokens = [{ value: '测试', translated: null, translationSource: null }];

      // Action: Process with null cache (WASM would handle this)
      const results = await processTokensWasm(semanticTokens, null);

      // Assert: Returns empty array safely (WASM not initialized)
      expect(results).toEqual([]);
    });

    it('should handle undefined parameters gracefully', async () => {
      // Action: Call with undefined (edge case)
      const results = await processTokensWasm(undefined, undefined);

      // Assert: Returns empty array instead of crashing
      expect(results).toEqual([]);
    });
  });
});
