// @ts-check
// @ts-ignore — named exports added by wasm-pack build; collapse to one line so @ts-ignore covers all
import init, {
  resolveGlobalConflicts as wasmResolveGlobalConflicts,
} from '../../wasm/translation_wasm_core.js';
import { logger } from '../logger';
import { registerCascadeHandler, fireCascadeRetire } from './WasmCascadeRegistry';

/**
 * WASM-accelerated Phase 4 conflict resolution.
 *
 * Wraps `resolveGlobalConflicts` (Rust, flat Uint32Array boundary) exported from
 * `wasm-core/src/conflict_resolution.rs`. Falls back to the JS implementation when
 * WASM is not yet initialized or fails.
 *
 * Boundary protocol: 4 u32 values per candidate — [startIndex, endIndex, length, typePriority]
 * where typePriority: 1=phrase, 2=pattern, 3=other.
 * Returns a Uint32Array of selected original indices; caller maps back to match objects.
 *
 * Sibling: TranslationEngine.js::resolveGlobalConflicts() — algorithm must stay in sync.
 */

/** @type {boolean} */
let initialized = false;
/** @type {boolean} - Set after any WASM panic to prevent re-init of corrupted module */
let initializationFailed = false;
/** @type {Promise<boolean> | null} */
let initializationPromise = null;

function retireWasmConflictResolutionOnSharedPanic() {
  initialized = false;
  initializationFailed = true;
  initializationPromise = null;
}
registerCascadeHandler(retireWasmConflictResolutionOnSharedPanic);

/**
 * Initialize the WASM module (idempotent, promise-cached).
 * @returns {Promise<boolean>}
 */
async function initialize() {
  if (initialized) return true;
  if (initializationFailed) return false;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      await init();
      initialized = true;
      logger.log('✅ WASM ConflictResolution initialized');
      return true;
    } catch (error) {
      logger.warn('Failed to initialize WASM ConflictResolution:', error);
      initializationFailed = true;
      initializationPromise = null;
      return false;
    }
  })();

  return initializationPromise;
}

/**
 * Pack match objects into a flat Uint32Array for the WASM boundary.
 *
 * @param {Array<{startIndex: number, endIndex: number, length: number, type: string}>} matches
 * @returns {Uint32Array}
 */
function packMatches(matches) {
  const flat = new Uint32Array(matches.length * 4);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const typePriority = m.type === 'phrase' ? 1 : m.type === 'pattern' ? 2 : 3;
    flat[i * 4] = m.startIndex;
    flat[i * 4 + 1] = m.endIndex;
    flat[i * 4 + 2] = m.length;
    flat[i * 4 + 3] = typePriority;
  }
  return flat;
}

/**
 * JS fallback — mirrors the sort+greedy logic in TranslationEngine.js::resolveGlobalConflicts().
 * Non-mutating (does not sort `allMatches` in-place).
 *
 * @param {Array<{startIndex: number, endIndex: number, length: number, type: string}>} allMatches
 * @returns {Array<*>}
 */
function jsFallback(allMatches) {
  const getTypePriority = (/** @type {{ type: string; }} */ m) =>
    m.type === 'phrase' ? 1 : m.type === 'pattern' ? 2 : 3;

  const sorted = [...allMatches].sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const pa = getTypePriority(a);
    const pb = getTypePriority(b);
    if (pa !== pb) return pa - pb;
    return a.startIndex - b.startIndex;
  });

  const selected = [];
  const used = new Set();
  for (const match of sorted) {
    let conflict = false;
    for (let i = match.startIndex; i <= match.endIndex; i++) {
      if (used.has(i)) {
        conflict = true;
        break;
      }
    }
    if (!conflict) {
      selected.push(match);
      for (let i = match.startIndex; i <= match.endIndex; i++) used.add(i);
    }
  }
  return selected;
}

/**
 * Resolve Phase 4 global conflicts using WASM (with JS fallback).
 *
 * Equivalent to TranslationEngine.js::resolveGlobalConflicts() but delegates the
 * sort+greedy computation to Rust via a flat typed-array boundary.
 *
 * @param {Array<{startIndex: number, endIndex: number, length: number, type: string}>} allMatches
 * @returns {Array<*>} Non-overlapping selected matches in acceptance order
 */
export function resolveGlobalConflictsWasm(allMatches) {
  if (allMatches.length === 0) return [];

  if (!initialized) {
    return jsFallback(allMatches);
  }

  try {
    const flat = packMatches(allMatches);
    const selectedIndices = wasmResolveGlobalConflicts(flat);
    return Array.from(selectedIndices).map((i) => allMatches[i]);
  } catch (/** @type {any} */ error) {
    // A WASM panic leaves the module in a permanently unusable state — WASM abort skips
    // cleanup, so borrow_mut_count stays stuck at 1. Retire so future calls go straight
    // to the JS fallback without retrying the corrupted module.
    logger.warn('WASM resolveGlobalConflicts failed, retiring module:', error);
    fireCascadeRetire();
    return jsFallback(allMatches);
  }
}

// Auto-initialize on import (non-blocking).
initialize().catch((err) => {
  logger.warn('Background WASM ConflictResolution initialization failed:', err);
});
