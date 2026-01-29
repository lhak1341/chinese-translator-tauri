/**
 * WASM Text Normalizer
 *
 * JavaScript wrapper for WASM-accelerated Unicode normalization (NFC).
 *
 * Provides 2-5x speedup over JavaScript String.prototype.normalize() by:
 * - Batch operations reduce WASM boundary crossings
 * - unicode-normalization crate is highly optimized
 * - NFC normalization ensures consistent Unicode representation
 *
 * Used for:
 * - Dictionary entry normalization
 * - Semantic array text normalization
 * - Pattern matching text preprocessing
 *
 * Usage:
 * ```javascript
 * const normalizer = new WasmNormalizer();
 * await normalizer.initialize();
 *
 * // Batch normalization (preferred)
 * const texts = ['café', '北京', 'Москва'];
 * const normalized = normalizer.normalizeBatch(texts);
 *
 * // Single normalization
 * const text = normalizer.normalize('café');
 * ```
 */

import { logger } from './logger.js';

let normalizeBatchWasm = null;
let normalizeSingleWasm = null;
let wasmInitialized = false;

/**
 * Initialize WASM module (done once)
 */
async function initializeWasm() {
  if (wasmInitialized) return true;

  try {
    const wasmModule = await import('../wasm/translation_wasm_core.js');
    normalizeBatchWasm = wasmModule.normalizeBatch;
    normalizeSingleWasm = wasmModule.normalizeSingle;
    wasmInitialized = true;

    if (process.env.NODE_ENV === 'development') {
      logger.log('✅ WASM Normalizer initialized successfully');
    }

    return true;
  } catch (error) {
    logger.warn('⚠️ Failed to initialize WASM Normalizer:', error);
    return false;
  }
}

/**
 * WASM Text Normalizer wrapper
 */
export class WasmNormalizer {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the normalizer
   *
   * @returns {Promise<boolean>} True if initialization succeeded
   */
  async initialize() {
    try {
      const wasmReady = await initializeWasm();
      if (!wasmReady) {
        return false;
      }

      this.initialized = true;

      if (process.env.NODE_ENV === 'development') {
        logger.log('✅ WASM Normalizer ready');
      }

      return true;
    } catch (error) {
      logger.warn('⚠️ Error initializing WASM normalizer:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Normalize a batch of texts to NFC
   *
   * Preferred method for multiple texts - reduces WASM boundary crossings
   *
   * @param {string[]} texts - Array of texts to normalize
   * @returns {string[]|null} Array of normalized texts or null if WASM unavailable
   *
   * @example
   * const normalizer = new WasmNormalizer();
   * await normalizer.initialize();
   * const normalized = normalizer.normalizeBatch(['café', '北京']);
   * // Returns: ['café', '北京'] (NFC normalized)
   */
  normalizeBatch(texts) {
    if (!this.initialized || !normalizeBatchWasm) {
      return null;
    }

    if (!Array.isArray(texts)) {
      logger.warn('⚠️ normalizeBatch expects an array, got:', typeof texts);
      return null;
    }

    try {
      const normalized = normalizeBatchWasm(texts);
      return normalized;
    } catch (error) {
      logger.warn('⚠️ Error in WASM batch normalization:', error);
      return null;
    }
  }

  /**
   * Normalize a single text to NFC
   *
   * Use normalizeBatch() for multiple texts to reduce overhead
   *
   * @param {string} text - Text to normalize
   * @returns {string|null} Normalized text or null if WASM unavailable
   *
   * @example
   * const normalizer = new WasmNormalizer();
   * await normalizer.initialize();
   * const normalized = normalizer.normalize('café');
   * // Returns: 'café' (NFC normalized)
   */
  normalize(text) {
    if (!this.initialized || !normalizeSingleWasm) {
      return null;
    }

    if (typeof text !== 'string') {
      logger.warn('⚠️ normalize expects a string, got:', typeof text);
      return null;
    }

    try {
      const normalized = normalizeSingleWasm(text);
      return normalized;
    } catch (error) {
      logger.warn('⚠️ Error in WASM single normalization:', error);
      return null;
    }
  }

  /**
   * Check if WASM is available and initialized
   *
   * @returns {boolean} True if WASM is ready
   */
  isAvailable() {
    return wasmInitialized && this.initialized;
  }
}

/**
 * Check if WASM normalizer is supported
 *
 * @returns {Promise<boolean>} True if WASM is available
 */
export async function isWasmNormalizerSupported() {
  return await initializeWasm();
}

/**
 * Convenience function to normalize a batch of texts with automatic fallback
 *
 * Tries WASM first, falls back to JavaScript String.prototype.normalize()
 *
 * @param {string[]} texts - Array of texts to normalize
 * @returns {Promise<string[]>} Array of NFC-normalized texts
 *
 * @example
 * const normalized = await normalizeBatchWithFallback(['café', '北京']);
 * // Returns: ['café', '北京'] (always succeeds)
 */
export async function normalizeBatchWithFallback(texts) {
  const normalizer = new WasmNormalizer();
  const initialized = await normalizer.initialize();

  if (initialized) {
    const result = normalizer.normalizeBatch(texts);
    if (result !== null) {
      return result;
    }
  }

  // Fallback to JavaScript
  return texts.map((text) => text.normalize('NFC'));
}

/**
 * Convenience function to normalize a single text with automatic fallback
 *
 * Tries WASM first, falls back to JavaScript String.prototype.normalize()
 *
 * @param {string} text - Text to normalize
 * @returns {Promise<string>} NFC-normalized text
 *
 * @example
 * const normalized = await normalizeWithFallback('café');
 * // Returns: 'café' (always succeeds)
 */
export async function normalizeWithFallback(text) {
  const normalizer = new WasmNormalizer();
  const initialized = await normalizer.initialize();

  if (initialized) {
    const result = normalizer.normalize(text);
    if (result !== null) {
      return result;
    }
  }

  // Fallback to JavaScript
  return text.normalize('NFC');
}
