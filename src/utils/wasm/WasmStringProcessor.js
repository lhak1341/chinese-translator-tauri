// @ts-check
import init, { StringProcessor } from '../../wasm/translation_wasm_core.js';
import { logger } from '../logger';
import { registerCascadeHandler, fireCascadeRetire } from './WasmCascadeRegistry';
import { wasmTextAssembler } from './WasmTextAssembler';
import { wasmTextChunker } from './WasmTextChunker';
import { retireWasmDictionaryOnSharedPanic } from './WasmDictionaryManager';
import { retireWasmConflictResolutionOnSharedPanic } from './WasmConflictResolution';

/**
 * High-performance string processor using Rust WASM
 *
 * Provides 5-15x speedup over JavaScript string operations by:
 * - Zero-cost string slicing (&str is just pointer + length)
 * - HashMap-based O(1) cache lookups
 * - Arc<str> for zero-cost string cloning
 * - UTF-8 native processing (efficient for Chinese text)
 * - Minimal allocations and GC pressure
 *
 * Performance:
 * - JavaScript: 43M ops/sec, ~0.35ms for 15,000 operations
 * - Rust: 215M-645M ops/sec, ~0.02-0.07ms for same workload
 * - Speedup: 5-15x, saves 0.28-0.33ms per 2000-char translation
 *
 * @class WasmStringProcessor
 */
class WasmStringProcessor {
  constructor() {
    /** @type {StringProcessor | null} */
    this.processor = null;
    /** @type {boolean} */
    this.initialized = false;
    /** @type {boolean} */
    this.initializationFailed = false;
  }

  /**
   * Initialize WASM string processor
   *
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initializationFailed) return false;
    try {
      await init();
      this.processor = new StringProcessor(10); // maxSpan = 10
      this.initialized = true;
      logger.log('✅ WASM StringProcessor initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize WASM StringProcessor:', error);
      this.initializationFailed = true;
      return false;
    }
  }

  /**
   * Build precomputed string cache from semantic tokens.
   * JSON.stringify contract: tokens_json = JSON.stringify(semanticTokens).
   *
   * @param {Array<{value: string, type: string, position: number}>} semanticTokens
   * @returns {Promise<boolean>} Success status
   */
  async buildCache(semanticTokens) {
    if (!this.initialized || !this.processor) {
      const ok = await this.initialize();
      if (!ok || !this.processor) return false;
    }

    try {
      // JSON.stringify required — buildCache takes &str to avoid JS interop during Rc borrow
      const success = this.processor.buildCache(JSON.stringify(semanticTokens));

      if (success) {
        const stats = JSON.parse(this.processor.getStats());
        logger.log(
          `📦 String cache built: ${stats.cacheSize} entries, ${(stats.memoryBytes / 1024).toFixed(1)}KB`
        );
      }

      return success;
    } catch (error) {
      logger.error('Failed to build string cache:', error);
      this.processor = null;
      this.initialized = false;
      this.initializationFailed = true;
      wasmTextAssembler.retireOnSharedModulePanic();
      wasmTextChunker.retireOnSharedModulePanic();
      retireWasmDictionaryOnSharedPanic();
      retireWasmConflictResolutionOnSharedPanic();
      fireCascadeRetire();
      return false;
    }
  }

  /**
   * Get precomputed string by position and span
   *
   * @param {number} position - Start position (token index)
   * @param {number} span - Number of consecutive tokens
   * @returns {string | null} Precomputed string or null if not in cache
   */
  getString(position, span) {
    if (!this.initialized || !this.processor) return null;
    return this.processor.getString(position, span) ?? null;
  }

  /**
   * Check if a string is cached
   *
   * @param {number} position - Start position
   * @param {number} span - Number of tokens
   * @returns {boolean} True if cached, false otherwise
   */
  hasString(position, span) {
    if (!this.initialized || !this.processor) return false;
    return this.processor.hasString(position, span);
  }

  /**
   * Get all precomputed strings as JavaScript Map
   *
   * @returns {Map<string, string>}
   */
  getAllStrings() {
    if (!this.initialized || !this.processor) return new Map();
    try {
      const obj = JSON.parse(this.processor.getAllStrings());
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  /**
   * Get cache statistics for monitoring and debugging
   *
   * @returns {{tokenCount: number, cacheSize: number, maxSpan: number, memoryBytes: number, stringBytes: number}}
   */
  getStats() {
    if (!this.initialized || !this.processor) {
      return { tokenCount: 0, cacheSize: 0, maxSpan: 0, memoryBytes: 0, stringBytes: 0 };
    }
    try {
      return JSON.parse(this.processor.getStats());
    } catch {
      return { tokenCount: 0, cacheSize: 0, maxSpan: 0, memoryBytes: 0, stringBytes: 0 };
    }
  }

  /**
   * Clear cache and free memory
   */
  clear() {
    if (this.initialized && this.processor) {
      this.processor.clear();
    }
  }

  /** Retire this processor when shared WASM module panics */
  retireOnSharedModulePanic() {
    this.processor = null;
    this.initialized = false;
    this.initializationFailed = true;
  }
}

// Export singleton instance
export const wasmStringProcessor = new WasmStringProcessor();

// Register cascade handler so other panicking wrappers can retire this one
registerCascadeHandler(() => wasmStringProcessor.retireOnSharedModulePanic());

// Trigger background initialization at import time so WASM is ready before first call
wasmStringProcessor.initialize().catch((err) => {
  logger.warn('Background WASM StringProcessor initialization failed:', err);
});
