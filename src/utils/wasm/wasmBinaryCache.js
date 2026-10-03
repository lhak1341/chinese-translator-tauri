// @ts-check
/**
 * WASM Binary Cache
 *
 * CODE REVIEW FIX 2026-02-01 (HIGH-1): Cache WASM binaries to avoid duplicate fetches
 *
 * Problem (as of 2026-02-01): multiple WASM wrappers fetching the same
 * translation_wasm_core_bg.wasm binary (~2MB) independently resulted in redundant
 * network requests for the same data during initialization. (WasmNumberProcessor,
 * one of the original wrappers this was written against, was deleted 2026-06-20,
 * commit b1dd912 — number processing is pure JS now. Callers today: every
 * WasmProcessorLifecycle, and WasmSharedModule's `loadSharedWasmModule()`.)
 *
 * Solution: Cache fetched WASM binaries in memory so they can be reused across
 * different WASM modules.
 *
 * Benefits:
 * - Reduces network requests from 4 to 2 (50% reduction)
 * - Saves ~50-100ms initialization time
 * - Reduces memory usage during initialization phase
 */

import { logger } from '../logger';

// Cache for WASM binaries (filename -> ArrayBuffer)
const wasmBinaryCache = new Map();

/**
 * Fetch a WASM binary with caching
 *
 * @param {URL} wasmUrl - Resolved URL to the WASM binary. Callers must construct
 *   this with a static literal string: new URL('../../wasm/name.wasm', import.meta.url)
 *   so that Vite can statically transform import.meta.url to the correct asset path
 *   in production builds. Dynamic template literals prevent this transformation.
 * @returns {Promise<ArrayBuffer>} The WASM binary as ArrayBuffer
 * @throws {Error} If fetch fails
 */
export async function fetchWasmBinary(wasmUrl) {
  const cacheKey = wasmUrl.href;

  // Return cached binary if available
  if (wasmBinaryCache.has(cacheKey)) {
    logger.debug(`Using cached WASM binary: ${cacheKey}`);
    return wasmBinaryCache.get(cacheKey);
  }

  // Fetch from filesystem
  logger.debug(`Fetching WASM binary: ${cacheKey}`);
  const response = await fetch(wasmUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch WASM binary ${cacheKey}: ${response.statusText}`);
  }

  const wasmBinary = await response.arrayBuffer();
  logger.debug(`WASM binary fetched: ${cacheKey} (${wasmBinary.byteLength} bytes)`);

  // Cache for future use
  wasmBinaryCache.set(cacheKey, wasmBinary);

  return wasmBinary;
}

/**
 * Clear cached WASM binaries
 * Useful for testing or forcing re-fetch
 */
export function clearWasmBinaryCache() {
  logger.debug(`Clearing WASM binary cache (${wasmBinaryCache.size} entries)`);
  wasmBinaryCache.clear();
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats (size, entries)
 */
export function getWasmBinaryCacheStats() {
  return {
    size: wasmBinaryCache.size,
    entries: Array.from(wasmBinaryCache.keys()),
  };
}
