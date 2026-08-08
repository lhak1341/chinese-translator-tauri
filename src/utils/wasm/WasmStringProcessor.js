// @ts-check
import init, { StringProcessor } from '../../wasm/translation_wasm_core.js';
import { logger } from '../logger';
import { WasmProcessorLifecycle } from './WasmProcessorLifecycle';
import { registerCascadeHandler, fireCascadeRetire } from './WasmCascadeRegistry';

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

// Static literal required so Vite transforms import.meta.url to the correct asset URL in production
const _WASM_BINARY_URL = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);

const lifecycle = new WasmProcessorLifecycle({
  name: 'StringProcessor',
  wasmFileName: 'translation_wasm_core_bg.wasm',
  wasmBinaryUrl: _WASM_BINARY_URL,
  expectedMethods: ['buildCache', 'getString', 'getStats', 'clear', 'free'],
});

/** @type {StringProcessor | null} */
let _processor = null;

async function _initializeStringProcessor() {
  return lifecycle.initialize(async (wasmBinary) => {
    await init(wasmBinary);
    const instance = new StringProcessor(10); // maxSpan = 10
    logger.log('✅ WASM StringProcessor initialized');
    _processor = instance;
    return instance;
  });
}

class WasmStringProcessor {
  /**
   * Build precomputed string cache from semantic tokens.
   * JSON.stringify contract: tokens_json = JSON.stringify(semanticTokens).
   *
   * @param {Array<{value: string, type: string, position: number}>} semanticTokens
   * @returns {Promise<boolean>} Success status
   */
  async buildCache(semanticTokens) {
    if (!lifecycle.isReady || !_processor) {
      const success = await _initializeStringProcessor();
      if (!success || !_processor) return false;
    }

    try {
      // JSON.stringify required — buildCache takes &str to avoid JS interop during Rc borrow
      const success = _processor.buildCache(JSON.stringify(semanticTokens));

      if (success) {
        const stats = JSON.parse(_processor.getStats());
        logger.log(
          `📦 String cache built: ${stats.cacheSize} entries, ${(stats.memoryBytes / 1024).toFixed(1)}KB`
        );
      }

      return success;
    } catch (error) {
      logger.error('Failed to build string cache:', error);
      // @ts-ignore — __destroy_into_raw is a wasm-bindgen internal absent from the generated types
      _processor?.__destroy_into_raw();
      _processor = null;
      lifecycle.permanentlyFail();
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
    if (!lifecycle.isReady || !_processor) return null;
    return _processor.getString(position, span) ?? null;
  }

  /**
   * Check if a string is cached
   *
   * @param {number} position - Start position
   * @param {number} span - Number of tokens
   * @returns {boolean} True if cached, false otherwise
   */
  hasString(position, span) {
    if (!lifecycle.isReady || !_processor) return false;
    return _processor.hasString(position, span);
  }

  /**
   * Get all precomputed strings as JavaScript Map
   *
   * @returns {Map<string, string>}
   */
  getAllStrings() {
    if (!lifecycle.isReady || !_processor) return new Map();
    try {
      const obj = JSON.parse(_processor.getAllStrings());
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
    if (!lifecycle.isReady || !_processor) {
      return { tokenCount: 0, cacheSize: 0, maxSpan: 0, memoryBytes: 0, stringBytes: 0 };
    }
    try {
      return JSON.parse(_processor.getStats());
    } catch {
      return { tokenCount: 0, cacheSize: 0, maxSpan: 0, memoryBytes: 0, stringBytes: 0 };
    }
  }

  /**
   * Clear cache and free memory
   */
  clear() {
    if (lifecycle.isReady && _processor) {
      _processor.clear();
    }
  }

  /** Retire this processor when shared WASM module panics */
  retireOnSharedModulePanic() {
    // @ts-ignore — __destroy_into_raw is a wasm-bindgen internal absent from the generated types
    _processor?.__destroy_into_raw();
    _processor = null;
    lifecycle.permanentlyFail();
  }
}

// Export singleton instance
export const wasmStringProcessor = new WasmStringProcessor();

// Register cascade handler so other panicking wrappers can retire this one
registerCascadeHandler(() => wasmStringProcessor.retireOnSharedModulePanic());

// Trigger background initialization at import time so WASM is ready before first call
_initializeStringProcessor().catch((err) => {
  logger.warn('Background WASM StringProcessor initialization failed:', err);
});
