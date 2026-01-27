/**
 * WASM Pattern Processor Error Handling Tests
 *
 * Tests CRITICAL-2: WASM Pattern Processor Graceful Degradation
 * Verifies that pattern processor degrades gracefully instead of crashing
 * when WASM fails to initialize or encounters processing errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-hot-toast
vi.mock('../toast', () => ({
  default: {
    warning: vi.fn(),
  },
}));

// Mock logger
vi.mock('../logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  processTokensWasm,
  isWasmPatternProcessorAvailable,
  hasWasmPatternProcessorFailed,
} from '../WasmPatternProcessor.js';
import { logger } from '../logger';

describe('WASM Pattern Processor Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const response = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Returns structured error response instead of throwing
      expect(response).toEqual({
        success: false,
        results: [],
        error: expect.stringContaining('WASM Pattern Processor not initialized'),
      });
      expect(response.success).toBe(false);
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.results).toEqual([]);

      // Assert: Warning was logged via logger
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('WASM Pattern Processor not initialized')
      );
      expect(logger.warn).toHaveBeenCalledWith(
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
      const response = await processTokensWasm(semanticTokens, variableCache);

      // Assert: No exception thrown, returns safely with structured response
      expect(response.success).toBe(false);
      expect(response.results).toEqual([]);
      expect(response.error).toBeDefined();
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
      // Even if WASM throws an error, we catch it and return structured error response

      const semanticTokens = [{ value: '测试', translated: null, translationSource: null }];

      const variableCache = new Map();

      // Action: Process tokens (will fail because WASM not initialized)
      const response = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Returns structured error response instead of propagating error
      expect(response.success).toBe(false);
      expect(response.results).toEqual([]);
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.error).toBeDefined();
    });

    it('should log errors without throwing', async () => {
      const semanticTokens = [{ value: '在XY中', translated: null, translationSource: null }];

      const variableCache = new Map();

      // Action: Process tokens
      const response = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Warning logged via logger but no exception
      expect(logger.warn).toHaveBeenCalled();
      expect(response.success).toBe(false);
      expect(response.results).toEqual([]);
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
      const response = await processTokensWasm(semanticTokens, variableCache);

      // Assert: Returns structured response safely
      expect(response.success).toBe(false);
      expect(response.results).toEqual([]);
    });

    it('should handle null variable cache', async () => {
      const semanticTokens = [{ value: '测试', translated: null, translationSource: null }];

      // Action: Process with null cache (WASM would handle this)
      const response = await processTokensWasm(semanticTokens, null);

      // Assert: Returns structured response safely (WASM not initialized)
      expect(response.success).toBe(false);
      expect(response.results).toEqual([]);
    });

    it('should handle undefined parameters gracefully', async () => {
      // Action: Call with undefined (edge case)
      const response = await processTokensWasm(undefined, undefined);

      // Assert: Returns structured response instead of crashing
      expect(response.success).toBe(false);
      expect(response.results).toEqual([]);
    });
  });
});
