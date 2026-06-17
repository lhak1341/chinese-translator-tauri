// @ts-check
/**
 * StringProcessingAdapter
 *
 * Single export: buildPrecomputedStrings(semanticTokens) → { impl, usingWasm }
 *
 * Contract: callers always get a precomputed-strings object. WASM vs JS is invisible.
 *
 * Strategy:
 *   1. WASM ready → wasmStringProcessor.buildCache(tokens) → returns wasmStringProcessor on success.
 *   2. WASM unavailable or build fails → new PrecomputedTokenStrings(tokens).
 */

import { wasmStringProcessor } from './WasmStringProcessor.js';
import { PrecomputedTokenStrings } from '../pattern/PrecomputedTokenStrings.js';

/**
 * Build a precomputed strings cache for pattern matching.
 *
 * @param {Array<{value: string, type: string, position: number}>} semanticTokens
 * @returns {Promise<{ impl: *, usingWasm: boolean }>}
 */
export async function buildPrecomputedStrings(semanticTokens) {
  try {
    const wasmSuccess = await wasmStringProcessor.buildCache(semanticTokens);
    if (wasmSuccess) {
      return { impl: wasmStringProcessor, usingWasm: true };
    }
  } catch {
    // WASM unavailable or panicked — WasmStringProcessor handled cascade retire
  }
  return { impl: new PrecomputedTokenStrings(semanticTokens), usingWasm: false };
}
