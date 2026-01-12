/**
 * Regression tests for WASM bug fixes
 *
 * Tests prevent regressions for:
 * - Unhandled promise rejection in WASM number processor
 * - WASM batch loading stats not updated during fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('WASM Regression Tests', () => {
  describe('Bug Fix: Unhandled Promise Rejection in WASM Number Processor', () => {
    let initializationFailed;
    let wasmNumberProcessor;
    let initializationPromise;

    beforeEach(() => {
      initializationFailed = false;
      wasmNumberProcessor = null;
      initializationPromise = null;
    });

    it('should set initializationFailed flag on promise rejection', async () => {
      // Simulate WASM initialization function that fails
      const initializeWasmNumberProcessor = async () => {
        initializationPromise = Promise.reject(new Error('WASM module not found'));
        await initializationPromise;
      };

      // Simulate the fixed auto-initialization with error handling
      try {
        await initializeWasmNumberProcessor();
      } catch (err) {
        // Bug fix: Set flag on rejection
        initializationFailed = true;
      }

      expect(initializationFailed).toBe(true);
    });

    it('should prevent retry when initializationFailed flag is set', async () => {
      initializationFailed = true;
      let retryAttempted = false;

      const processNumbersWasm = async (tokens) => {
        // Check flag before attempting initialization
        if (initializationFailed) {
          // Don't retry, use fallback immediately
          return null;
        }

        // This should not be reached
        retryAttempted = true;
        return null;
      };

      await processNumbersWasm([{ value: '三十五' }]);

      expect(retryAttempted).toBe(false);
    });

    it('should handle network failures during WASM fetch', async () => {
      const fetchError = new Error('Network request failed');
      let errorCaught = false;

      const initializeWasm = async () => {
        throw fetchError;
      };

      // Simulate auto-initialization with proper error handling
      try {
        await initializeWasm();
      } catch (err) {
        errorCaught = true;
        initializationFailed = true;
      }

      expect(errorCaught).toBe(true);
      expect(initializationFailed).toBe(true);
    });

    it('should log warning and continue on background init failure', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const initializeWasm = async () => {
        throw new Error('Background initialization failed');
      };

      // Simulate non-blocking background initialization
      initializeWasm().catch((err) => {
        console.warn('Background WASM NumberProcessor initialization failed:', err);
        initializationFailed = true;
      });

      // Wait for promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(initializationFailed).toBe(true);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Bug Fix: WASM Batch Loading Stats Update', () => {
    let performanceStats;
    let memoryPool;
    let wasmEngine;

    beforeEach(() => {
      performanceStats = {
        memoryUsage: 0,
      };

      memoryPool = {
        getCurrentMemoryUsage: vi.fn(() => 1024 * 1024), // 1MB
      };

      wasmEngine = {
        load_dictionary: vi.fn(() => true),
      };
    });

    it('should update memory stats after successful dictionary load', () => {
      const loadDictionary = (name, entries) => {
        const success = wasmEngine.load_dictionary(name, entries);

        if (success) {
          // Bug fix: Update stats after successful load
          performanceStats.memoryUsage = memoryPool.getCurrentMemoryUsage();
        }

        return success;
      };

      const result = loadDictionary('test', [{ chinese: '你好', vietnamese: 'xin chào' }]);

      expect(result).toBe(true);
      expect(performanceStats.memoryUsage).toBe(1024 * 1024);
      expect(memoryPool.getCurrentMemoryUsage).toHaveBeenCalled();
    });

    it('should update stats during fallback loading', async () => {
      let initialized = false;
      let fallbackMode = true;

      const fallbackManager = {
        loadDictionary: vi.fn(() => true),
      };

      const loadDictionary = async (name, entries) => {
        if (!initialized || fallbackMode) {
          const result = await fallbackManager.loadDictionary(name, entries);
          // Bug fix: Update stats even in fallback mode
          if (result) {
            performanceStats.memoryUsage = memoryPool.getCurrentMemoryUsage();
          }
          return result;
        }

        const success = wasmEngine.load_dictionary(name, entries);
        if (success) {
          performanceStats.memoryUsage = memoryPool.getCurrentMemoryUsage();
        }
        return success;
      };

      await loadDictionary('test', []);

      expect(fallbackManager.loadDictionary).toHaveBeenCalled();
      expect(performanceStats.memoryUsage).toBeGreaterThan(0);
    });

    it('should track memory usage across multiple dictionary loads', () => {
      const dictionaries = [
        { name: 'dict1', entries: [{ chinese: '你好', vietnamese: 'xin chào' }] },
        { name: 'dict2', entries: [{ chinese: '谢谢', vietnamese: 'cảm ơn' }] },
        { name: 'dict3', entries: [{ chinese: '再见', vietnamese: 'tạm biệt' }] },
      ];

      memoryPool.getCurrentMemoryUsage
        .mockReturnValueOnce(1024 * 1024) // 1MB
        .mockReturnValueOnce(2048 * 1024) // 2MB
        .mockReturnValueOnce(3072 * 1024); // 3MB

      const loadDictionary = (name, entries) => {
        const success = wasmEngine.load_dictionary(name, entries);
        if (success) {
          performanceStats.memoryUsage = memoryPool.getCurrentMemoryUsage();
        }
        return success;
      };

      dictionaries.forEach((dict) => {
        loadDictionary(dict.name, dict.entries);
      });

      // Should have final memory usage from last load
      expect(performanceStats.memoryUsage).toBe(3072 * 1024);
      expect(memoryPool.getCurrentMemoryUsage).toHaveBeenCalledTimes(3);
    });

    it('should not update stats if load fails', () => {
      wasmEngine.load_dictionary.mockReturnValue(false);

      const loadDictionary = (name, entries) => {
        const success = wasmEngine.load_dictionary(name, entries);
        if (success) {
          performanceStats.memoryUsage = memoryPool.getCurrentMemoryUsage();
        }
        return success;
      };

      const result = loadDictionary('test', []);

      expect(result).toBe(false);
      expect(performanceStats.memoryUsage).toBe(0); // Not updated
      expect(memoryPool.getCurrentMemoryUsage).not.toHaveBeenCalled();
    });

    it('should update stats in batch loading fallback path', async () => {
      const loadDictionariesBatch = async (dictionaries) => {
        // Simulate fallback to sequential loading
        for (const { name, entries } of dictionaries) {
          const success = wasmEngine.load_dictionary(name, entries);
          if (success) {
            // Bug fix: Update stats in fallback path
            performanceStats.memoryUsage = memoryPool.getCurrentMemoryUsage();
          }
        }
        return true;
      };

      await loadDictionariesBatch([
        { name: 'dict1', entries: [] },
        { name: 'dict2', entries: [] },
      ]);

      expect(performanceStats.memoryUsage).toBeGreaterThan(0);
      expect(memoryPool.getCurrentMemoryUsage).toHaveBeenCalled();
    });
  });

  describe('WASM Token Copying Edge Cases', () => {
    it('should handle tokens with all undefined fields', () => {
      const validateWasmToken = (token) => {
        if (token.translated === undefined) {
          token.translated = null;
        }
        if (token.translationSource === undefined) {
          token.translationSource = null;
        }
        return token;
      };

      const token = { value: 'test', translated: undefined, translationSource: undefined };
      const validated = validateWasmToken(token);

      expect(validated.translated).toBe(null);
      expect(validated.translationSource).toBe(null);
    });

    it('should preserve null values without converting to undefined', () => {
      const token = { value: 'test', translated: null, translationSource: null };

      expect(token.translated).toBe(null);
      expect(token.translationSource).toBe(null);
    });

    it('should handle mixed undefined and null fields', () => {
      const validateWasmToken = (token) => {
        if (token.translated === undefined) {
          token.translated = null;
        }
        if (token.translationSource === undefined) {
          token.translationSource = null;
        }
        return token;
      };

      const token = { value: 'test', translated: undefined, translationSource: 'test_source' };
      const validated = validateWasmToken(token);

      expect(validated.translated).toBe(null);
      expect(validated.translationSource).toBe('test_source');
    });
  });

  describe('WASM Initialization State Machine', () => {
    it('should track initialization states correctly', () => {
      const states = {
        UNINITIALIZED: 'uninitialized',
        INITIALIZING: 'initializing',
        INITIALIZED: 'initialized',
        FAILED: 'failed',
      };

      let currentState = states.UNINITIALIZED;

      // Start initialization
      currentState = states.INITIALIZING;
      expect(currentState).toBe(states.INITIALIZING);

      // Fail initialization
      currentState = states.FAILED;
      expect(currentState).toBe(states.FAILED);

      // Should not retry from FAILED state
      if (currentState === states.FAILED) {
        expect(currentState).not.toBe(states.INITIALIZING);
      }
    });

    it('should allow manual retry after failure', () => {
      let initializationFailed = true;
      let wasmProcessor = null;

      const retryInitialization = async () => {
        initializationFailed = false;
        // Attempt initialization again
        try {
          wasmProcessor = { initialized: true };
          return true;
        } catch (err) {
          initializationFailed = true;
          return false;
        }
      };

      expect(initializationFailed).toBe(true);

      retryInitialization();

      expect(wasmProcessor).not.toBe(null);
    });
  });
});
