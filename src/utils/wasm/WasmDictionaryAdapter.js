/**
 * Narrow adapter: the seam between DictionaryManager and WasmDictionaryManager.
 *
 * Exposes only the 5 operations DictionaryManager needs. Breaks the backward
 * coupling where WasmDictionaryManager received the JS manager as `fallbackManager`
 * during init — DictionaryManager now owns the JS/WASM branch decision.
 *
 * Two implementations:
 *   WasmDictionaryAdapter — wraps WasmDictionaryManager (production)
 *   NullWasmAdapter       — no-ops (default; tests use this automatically)
 *
 * @import {
 *   WasmDictionaryAdapterInterface
 * } from '../types/DictionaryManagerTypes'
 */

import { WasmDictionaryManager } from './WasmDictionaryManager.js';

export class WasmDictionaryAdapter {
  constructor() {
    this._inner = new WasmDictionaryManager();
  }

  /**
   * Initialize the WASM engine.
   * `fallbackManager` intentionally omitted — WasmDictionaryManager handles null
   * gracefully via optional chaining. DictionaryManager owns fallback routing.
   */
  async initialize(config = {}) {
    return this._inner.initialize(null, config);
  }

  isReady() {
    return this._inner.isUsable();
  }

  async loadDictionary(name, entries) {
    return this._inner.loadDictionary(name, entries);
  }

  findMatches(dictionaryName, text, startPos = 0) {
    return this._inner.findMatches(dictionaryName, text, startPos);
  }

  findLongestMatch(dictionaryName, text, startPos = 0) {
    return this._inner.findLongestMatch(dictionaryName, text, startPos);
  }

  hasDictionary(name) {
    return this._inner.hasDictionary(name);
  }

  clearAll() {
    this._inner.clearAllDictionaries();
  }

  getTimingStats() {
    return this._inner.getPerformanceReport();
  }

  cleanup() {
    this._inner.cleanup();
  }
}

export const NullWasmAdapter = Object.freeze({
  async initialize() {
    return false;
  },
  isReady() {
    return false;
  },
  async loadDictionary() {
    return false;
  },
  findMatches() {
    return [];
  },
  findLongestMatch() {
    return null;
  },
  hasDictionary() {
    return false;
  },
  clearAll() {},
  getTimingStats() {
    return null;
  },
  cleanup() {},
});
