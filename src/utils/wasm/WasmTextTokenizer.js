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
 * Shares `translation_wasm_core.js`'s linear memory with the other 6 WASM
 * wrappers — goes through `WasmProcessorLifecycle` + `WasmCascadeRegistry`
 * like the rest of them (see src/utils/CLAUDE.md, "All 7 WASM Wrappers
 * Share One Binary"). Exposes no owned WASM struct instance (tokenizeText /
 * getTokenizerStats are plain wasm-bindgen free functions), so retire is
 * just a lifecycle flag flip — no `__destroy_into_raw()` needed.
 *
 * Usage:
 * ```javascript
 * import { wasmTextTokenizer } from './WasmTextTokenizer';
 * const tokens = wasmTextTokenizer.tokenize(text); // null if WASM not ready — caller falls back to JS
 * ```
 */

import { tokenizeText, getTokenizerStats } from '../../wasm/translation_wasm_core.js';
import { logger } from '../logger.js';
import { WasmProcessorLifecycle } from './WasmProcessorLifecycle';
import { registerCascadeHandler, fireCascadeRetire } from './WasmCascadeRegistry';
import { loadSharedWasmModule } from './WasmSharedModule';

// Static literal required so Vite transforms import.meta.url to the correct asset URL in production
const _WASM_BINARY_URL = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);

const lifecycle = new WasmProcessorLifecycle({
  name: 'TextTokenizer',
  wasmFileName: 'translation_wasm_core_bg.wasm',
  wasmBinaryUrl: _WASM_BINARY_URL,
  expectedMethods: ['tokenizeText', 'getTokenizerStats'],
});

async function _initializeTextTokenizer() {
  return lifecycle.initialize(async () => {
    await loadSharedWasmModule();
    logger.log('✅ WASM TextTokenizer initialized');
    // tokenizeText/getTokenizerStats are live bindings to this same module's
    // top-level `wasm` var — no owned instance to hand back, just prove the
    // expected functions exist for verifyWasmInstance.
    return { tokenizeText, getTokenizerStats };
  });
}

class WasmTextTokenizer {
  /**
   * Tokenize text using WASM.
   *
   * Triggers lazy background init if not yet started. Returns null when WASM
   * isn't ready — caller uses JS fallback. Synchronous by design (hot-path
   * caller in TranslationEngine.js never awaits this).
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
    // Lazy background init: trigger once if lifecycle has never started
    if (!lifecycle.isReady && !lifecycle.hasFailed && !lifecycle.pendingInit) {
      _initializeTextTokenizer().catch((err) => {
        logger.warn('Lazy WASM TextTokenizer initialization failed:', err);
      });
    }

    if (!lifecycle.isReady) {
      return null;
    }

    try {
      // WASM tokenizer expects NFC-normalized text for consistent Unicode handling
      const normalizedText = text.normalize('NFC');
      return tokenizeText(normalizedText);
    } catch (error) {
      // A WASM trap (Rust panic → `unreachable` instruction) leaves the shared linear
      // memory allocator in a potentially corrupt state. Retire permanently and cascade
      // to the other 6 wrappers so nothing else calls into the corrupted module either.
      logger.error(
        '❌ WASM TextTokenizer panic — retiring instance, falling back to JS permanently:',
        error
      );
      fireCascadeRetire();
      return null;
    }
  }

  /**
   * Get tokenizer statistics
   *
   * @returns {Object|null} Statistics or null if not initialized
   */
  getStats() {
    if (!lifecycle.isReady) return null;

    try {
      return getTokenizerStats();
    } catch (error) {
      logger.warn('⚠️ Error getting WASM tokenizer stats:', error);
      return null;
    }
  }

  /** Retire this wrapper when a sibling WASM wrapper's shared module panics */
  retireOnSharedModulePanic() {
    lifecycle.permanentlyFail();
  }
}

// Export singleton instance
export const wasmTextTokenizer = new WasmTextTokenizer();

// Register cascade handler so other panicking wrappers can retire this one
registerCascadeHandler(() => wasmTextTokenizer.retireOnSharedModulePanic());

// Background init: warms up WASM so first caller hits the fast path
if (import.meta.env.MODE !== 'test') {
  _initializeTextTokenizer().catch((err) => {
    logger.warn('Background WASM TextTokenizer initialization failed:', err);
  });
}

// Expose globally for debugging
if (typeof window !== 'undefined') {
  // @ts-ignore - debug convenience property
  window.wasmTextTokenizer = wasmTextTokenizer;
}
