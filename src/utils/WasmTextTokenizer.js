// @ts-check
/**
 * WASM Text Tokenizer
 *
 * JavaScript wrapper for WASM-accelerated text tokenization using direct
 * character classification instead of regex pattern matching.
 *
 * Provides 3-8x speedup over JavaScript regex-based tokenization by:
 * - Direct character range matching (no regex compilation overhead)
 * - Character-by-character processing with inline classification
 * - UTF-8 processing in Rust (more efficient than JavaScript's UTF-16)
 *
 * Algorithm:
 * - Match on character ranges directly: '\u{4E00}'..='\u{9FFF}' for Chinese
 * - Process character-by-character with inline classification
 * - No regex compilation or execution overhead
 *
 * Usage:
 * ```javascript
 * const tokenizer = new WasmTextTokenizer();
 * await tokenizer.initialize();
 * const tokens = tokenizer.tokenize(text);
 * ```
 */

import { logger } from './logger.js';

/** @type {Function|null} */
let tokenizeTextWasm = null;
/** @type {Function|null} */
let getTokenizerStatsWasm = null;
let wasmInitialized = false;

/**
 * Initialize WASM module (done once)
 */
async function initializeWasm() {
  if (wasmInitialized) return true;

  try {
    const wasmModule = await import('../wasm/translation_wasm_core.js');
    tokenizeTextWasm = wasmModule.tokenizeText;
    getTokenizerStatsWasm = wasmModule.getTokenizerStats;
    wasmInitialized = true;

    if (process.env.NODE_ENV === 'development') {
      logger.log('✅ WASM TextTokenizer initialized successfully');
    }

    return true;
  } catch (error) {
    logger.warn('⚠️ Failed to initialize WASM TextTokenizer:', error);
    return false;
  }
}

/**
 * WASM Text Tokenizer wrapper
 */
export class WasmTextTokenizer {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the tokenizer
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
        const stats = this.getStats();
        logger.log('✅ WASM TextTokenizer ready:', stats);
      }

      return true;
    } catch (error) {
      logger.warn('⚠️ Error initializing WASM text tokenizer:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Tokenize text using WASM
   *
   * @param {string} text - Text to tokenize
   * @returns {Array<*>|null} Array of tokens or null if WASM unavailable
   *
   * Token structure:
   * {
   *   type: 'chinese_char' | 'chinese_word' | 'latin_word' | 'number' | 'punctuation' | 'whitespace' | 'unknown',
   *   value: string,
   *   start: number,
   *   end: number
   * }
   */
  tokenize(text) {
    if (!this.initialized || !tokenizeTextWasm) {
      return null;
    }

    try {
      // WASM tokenizer expects NFC-normalized text for consistent Unicode handling
      const normalizedText = text.normalize('NFC');

      // Call WASM tokenizer
      const tokens = tokenizeTextWasm(normalizedText);

      return tokens;
    } catch (error) {
      logger.warn('⚠️ Error in WASM text tokenization:', error);
      return null;
    }
  }

  /**
   * Get tokenizer statistics
   *
   * @returns {Object|null} Statistics or null if not initialized
   */
  getStats() {
    if (!this.initialized || !getTokenizerStatsWasm) {
      return null;
    }

    try {
      return getTokenizerStatsWasm();
    } catch (error) {
      logger.warn('⚠️ Error getting WASM tokenizer stats:', error);
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
 * Check if WASM text tokenizer is supported
 *
 * @returns {Promise<boolean>} True if WASM is available
 */
export async function isWasmTextTokenizerSupported() {
  return await initializeWasm();
}
