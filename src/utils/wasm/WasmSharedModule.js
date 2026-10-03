// @ts-check
/**
 * The one place the shared WASM binary is loaded.
 *
 * All seven wrappers import the same `translation_wasm_core.js`, whose generated `init` does not
 * guard against concurrent first calls: every caller that arrives before the first one finishes
 * instantiates the module again, and the last to finish overwrites the module's `wasm` binding.
 * Two wrappers (TextAssembler, ConflictResolution) used to call a bare `init()` at import time, so
 * they ran first, unverified, and the SHA-256 check the other five wrappers do was decided by
 * call order. Every wrapper now goes through `loadSharedWasmModule()`: fetch, verify, then
 * instantiate once, with the verified binary.
 *
 * It owns no retry or cooldown. Each wrapper's `WasmProcessorLifecycle` already retries its whole
 * init sequence, calling this each time, so a failed load is simply tried again. A panic retires
 * it for good: the module's memory is corrupt, and nothing may re-instantiate it.
 *
 * See: docs/adr/ADR-009-wasm-processor-lifecycle.md, src/utils/wasm/CLAUDE.md
 */

import { logger } from '../logger';
import { fetchWasmBinary } from './wasmBinaryCache';
import { verifyWasmBinaryIntegrity } from './wasmIntegrityVerifier';
import { registerCascadeHandler } from './WasmCascadeRegistry';

// Static literal required so Vite transforms import.meta.url to the correct asset URL in production
const _WASM_BINARY_URL = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);
const WASM_FILE_NAME = 'translation_wasm_core_bg.wasm';

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
  const wasmBinary = await fetchWasmBinary(_WASM_BINARY_URL);

  const integrity = /** @type {{ valid: boolean, errors: string[], warnings: string[] }} */ (
    await verifyWasmBinaryIntegrity(WASM_FILE_NAME, wasmBinary)
  );
  if (!integrity.valid) {
    throw new Error(`WASM binary integrity check failed: ${integrity.errors.join(', ')}`);
  }
  if (integrity.warnings.length > 0) {
    logger.warn('Shared WASM module integrity warnings:', integrity.warnings);
  }

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
