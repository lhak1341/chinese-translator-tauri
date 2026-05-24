// @ts-check
/**
 * NumberProcessingAdapter
 *
 * Single export: processNumbers(tokens, options) → Promise<tokens>
 *
 * Contract: numbers are always processed. Callers don't know or care
 * whether WASM or the JS NumberProcessor did the work.
 *
 * Strategy:
 *   1. WASM available → call processNumbersWasm. If WASM retires mid-call
 *      (lifecycle.reset() clears isReady), re-check availability and fall through.
 *   2. WASM unavailable or retired → JS NumberProcessor, mutates tokens in-place.
 *
 * Note: semanticArrayBuilder is intentionally NOT forwarded to the JS fallback.
 * The engine's post-WASM loop (scanning for number_conversion sources) handles
 * semantic array entries for both paths — forwarding it would double-add entries.
 */

import { processNumbersWasm, isWasmNumberProcessorAvailable } from './WasmNumberProcessor.js';
import { NumberProcessor } from '../NumberProcessor.js';

/** @type {NumberProcessor|null} */
let _jsProcessor = null;

function getJsProcessor() {
  if (!_jsProcessor) _jsProcessor = new NumberProcessor();
  return _jsProcessor;
}

/**
 * Process tokens to convert Chinese numbers using WASM when available,
 * falling back to the JS NumberProcessor when WASM is unavailable or panics.
 *
 * @param {Array<*>} tokens
 * @param {{ debugLevel?: number }} [options]
 * @returns {Promise<Array<*>>}
 */
export async function processNumbers(tokens, options = {}) {
  if (isWasmNumberProcessorAvailable()) {
    const processed = await processNumbersWasm(tokens);
    // If WASM retired during the call (panic → lifecycle.reset()), fall through to JS.
    // processNumbersWasm guarantees original tokens are returned unchanged on panic,
    // so it is safe to run the JS processor on them.
    if (isWasmNumberProcessorAvailable()) {
      return processed;
    }
  }

  // JS fallback: mutates tokens in-place (no return value).
  getJsProcessor().processTokens(tokens, { debugLevel: options.debugLevel });
  return tokens;
}
