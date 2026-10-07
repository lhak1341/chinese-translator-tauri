// @ts-check
/**
 * The one place the shared WASM binary is loaded.
 *
 * The wrappers import the same `translation_wasm_core.js`, whose generated `init` does not
 * guard against concurrent first calls: every caller that arrives before the first one finishes
 * instantiates the module again, and the last to finish overwrites the module's `wasm` binding.
 * Every wrapper goes through `loadSharedWasmModule()`: fetch, then instantiate once. That is also
 * why nothing caches the fetched binary: one load succeeds per session, and a failed one has
 * nothing to cache.
 *
 * It owns no retry or cooldown. Each wrapper's `WasmProcessorLifecycle` already retries its whole
 * init sequence, calling this each time, so a failed load is simply tried again. A panic retires
 * it for good: the module's memory is corrupt, and nothing may re-instantiate it.
 *
 * See: docs/adr/ADR-009-wasm-processor-lifecycle.md, src/utils/wasm/CLAUDE.md
 */

import { registerCascadeHandler } from './WasmCascadeRegistry';

// Static literal required so Vite transforms import.meta.url to the correct asset URL in production
const _WASM_BINARY_URL = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);

let loaded = false;
let retired = false;
/** @type {Promise<void>|null} */
let loading = null;

registerCascadeHandler(() => {
  retired = true;
  loaded = false;
  loading = null;
});

async function load() {
  const response = await fetch(_WASM_BINARY_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM binary ${_WASM_BINARY_URL.href}: ${response.statusText}`);
  }
  const wasmBinary = await response.arrayBuffer();

  const wasmModule = await import('../../wasm/translation_wasm_core.js');
  await wasmModule.default(wasmBinary);

  // The cascade may have fired while suspended above.
  if (retired) throw new Error('Shared WASM module retired after a panic');
  loaded = true;
}

/**
 * Load the shared WASM module once. Concurrent callers share one load; later callers return at
 * once. Rejects with the load error (so a lifecycle can classify it as transient) and clears
 * itself, so the next call tries again. Rejects for good after a panic.
 *
 * @returns {Promise<void>}
 */
export function loadSharedWasmModule() {
  if (retired) return Promise.reject(new Error('Shared WASM module retired after a panic'));
  if (loaded) return Promise.resolve();
  loading ??= load().finally(() => {
    loading = null;
  });
  return loading;
}
