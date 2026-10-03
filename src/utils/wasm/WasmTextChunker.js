// @ts-check
import init, {
  TextChunker,
  recordFallback,
  getGlobalChunkerStats,
} from '../../wasm/translation_wasm_core.js';
import { logger } from '../logger';
import { WasmProcessorLifecycle } from './WasmProcessorLifecycle';
import { registerCascadeHandler, fireCascadeRetire } from './WasmCascadeRegistry';
import { areChunksInBounds } from './WasmBoundaryValidation';

/**
 * High-performance text chunker using Rust WASM
 *
 * Provides 2-3x speedup over JavaScript chunking by:
 * - Native Unicode property detection (faster than regex)
 * - Zero-cost string slicing (&str is just pointer + length)
 * - Efficient character iteration (UTF-8 native processing)
 * - Minimal allocations and GC pressure
 * - Single-pass character scanning
 *
 * Performance:
 * - JavaScript TextChunker: ~1-2ms for 5000-char text (regex + char-by-char iteration)
 * - Rust TextChunker: ~0.3-0.7ms for same (native Unicode + zero-copy)
 * - Speedup: 2-3x for punctuation-heavy texts
 *
 * @class WasmTextChunker
 */

// Static literal required so Vite transforms import.meta.url to the correct asset URL in production
const _WASM_BINARY_URL = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);

const lifecycle = new WasmProcessorLifecycle({
  name: 'TextChunker',
  wasmFileName: 'translation_wasm_core_bg.wasm',
  wasmBinaryUrl: _WASM_BINARY_URL,
  expectedMethods: ['chunkText', 'getStats', 'resetStats', 'free'],
});

/** @type {TextChunker | null} */
let _chunker = null;

async function _initializeTextChunker(timeoutMs = 10000) {
  return lifecycle.initialize(async (wasmBinary) => {
    logger.log(
      `[WASM TextChunker] 🔄 Starting init (timeout: ${timeoutMs}ms, env: ${process.env.NODE_ENV})`
    );
    const startTime = performance.now();

    // Timeout lives inside instantiateFn — WasmProcessorLifecycle._isTransientError handles
    // 'timeout' as transient, so a timeout triggers retry with exponential backoff.
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`WASM initialization timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    );
    await Promise.race([init(wasmBinary), timeoutPromise]);

    logger.log(
      `[WASM TextChunker] ✅ WASM module loaded in ${(performance.now() - startTime).toFixed(1)}ms`
    );
    const instance = new TextChunker();
    _chunker = instance;
    logger.log(
      `[WASM TextChunker] ✅ Fully initialized in ${(performance.now() - startTime).toFixed(1)}ms`
    );
    return instance;
  });
}

export class WasmTextChunker {
  constructor() {
    /** @type {number} */
    this.wasmHits = 0;
    /** @type {number} */
    this.fallbackHits = 0;
    /** @type {boolean} - Re-entrancy guard: prevents a second WASM borrow_mut while one is live */
    this.isProcessing = false;
  }

  /**
   * Chunk text by punctuation boundaries.
   *
   * Triggers lazy background init if not yet started.
   * Returns null when WASM not ready — caller uses JS fallback.
   *
   * @param {string} text - Input text to chunk
   * @returns {Array<{content: string, punctuation: string, startIndex: number, lineBreaks: string, startedBy: string}> | null}
   */
  chunkText(text) {
    // Lazy background init: trigger once if lifecycle has never started
    if (!lifecycle.isReady && !lifecycle.hasFailed && !lifecycle.pendingInit) {
      logger.log('[WASM TextChunker] Triggering lazy initialization');
      _initializeTextChunker().catch((err) => {
        logger.error('[WASM TextChunker] Lazy init failed:', err);
      });
    }

    logger.log(
      `[WASM TextChunker] chunkText (ready: ${lifecycle.isReady}, chunker: ${!!_chunker}, textLength: ${text.length})`
    );

    if (!lifecycle.isReady || !_chunker) {
      logger.log('[WASM TextChunker] Not ready, using JS fallback');
      try {
        recordFallback();
      } catch {
        // WASM not loaded, ignore
      }
      this.fallbackHits++;
      return null;
    }

    // Re-entrancy guard: if a WASM callback somehow triggers a second chunkText call while
    // borrow_mut is still active, the second call would get "recursive use" panic. Return null
    // (JS fallback) instead so the outer call can complete cleanly.
    if (this.isProcessing) {
      this.fallbackHits++;
      return null;
    }

    this.isProcessing = true;
    try {
      // chunk_text returns a JSON string (pure Rust serde_json) to keep all JS interop
      // outside the &mut self borrow — prevents the Rc debug assertion in Rust 1.84+.
      const chunks = JSON.parse(_chunker.chunkText(text));
      // Whole-array bounds check — chunks partition the whole text, so a single bad
      // chunk can't be dropped in isolation without losing content. Any violation
      // rejects the entire array; returning null here is the same "not ready" signal
      // this function already returns above, and TextChunker.js's existing
      // `wasmChunks && Array.isArray(wasmChunks)` check already falls back to JS on it.
      if (!areChunksInBounds(chunks)) {
        logger.error('[WASM TextChunker] Chunk array failed bounds check, falling back to JS:', {
          textLength: text.length,
        });
        this.fallbackHits++;
        return null;
      }
      logger.log(`[WASM TextChunker] ✅ Chunked into ${chunks.length} chunks`);
      this.wasmHits++;
      return chunks;
    } catch (/** @type {any} */ error) {
      // A WASM trap (Rust panic → `unreachable` instruction) leaves the WASM linear memory
      // allocator in a potentially corrupt state. Log once, then permanently retire all
      // wrappers so future calls go straight to JS fallback without retrying.
      logger.error(
        '[WASM TextChunker] ❌ WASM panic — retiring instance, falling back to JS permanently:',
        {
          message: error.message,
          textLength: text.length,
          env: process.env.NODE_ENV,
        }
      );
      // The cascade retires this chunker too: its own handler destroys and fails it.
      fireCascadeRetire();
      try {
        recordFallback();
      } catch {
        // WASM not loaded, ignore
      }
      this.fallbackHits++;
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get performance statistics
   *
   * @returns {Object} Statistics object with chunksProcessed, totalTimeUs, avgTimeUs, fallbackCount
   */
  getStats() {
    if (!lifecycle.isReady || !_chunker) {
      return {
        chunksProcessed: 0,
        totalTimeUs: 0,
        avgTimeUs: 0,
        fallbackCount: this.fallbackHits,
        wasmHits: this.wasmHits,
        hitRate: 0,
      };
    }

    try {
      const wasmStats = JSON.parse(_chunker.getStats());
      const total = this.wasmHits + this.fallbackHits;
      const hitRate = total > 0 ? ((this.wasmHits / total) * 100).toFixed(1) : 0;

      return {
        ...wasmStats,
        wasmHits: this.wasmHits,
        fallbackHits: this.fallbackHits,
        hitRate: `${hitRate}%`,
      };
    } catch (error) {
      logger.error('Failed to get WASM TextChunker stats:', error);
      return {
        chunksProcessed: 0,
        totalTimeUs: 0,
        avgTimeUs: 0,
        fallbackCount: this.fallbackHits,
        wasmHits: this.wasmHits,
        hitRate: 0,
      };
    }
  }

  /**
   * Get global statistics across all instances
   *
   * @returns {Object} Global statistics
   */
  getGlobalStats() {
    try {
      return JSON.parse(getGlobalChunkerStats());
    } catch (error) {
      logger.error('Failed to get global chunker stats:', error);
      return {
        totalChunks: 0,
        totalTimeUs: 0,
        avgTimeUs: 0,
        fallbackCount: 0,
      };
    }
  }

  /**
   * Proactively retire this chunker when the shared WASM module is known-corrupted
   * (e.g. NumberProcessor panicked — shared linear memory is already tainted).
   * Prevents a secondary panic on the next chunkText call.
   */
  retireOnSharedModulePanic() {
    // @ts-ignore — __destroy_into_raw is a wasm-bindgen internal absent from the generated types
    _chunker?.__destroy_into_raw();
    _chunker = null;
    lifecycle.permanentlyFail();
  }

  /**
   * Reset hit statistics
   */
  resetStats() {
    this.wasmHits = 0;
    this.fallbackHits = 0;
    if (lifecycle.isReady && _chunker) {
      try {
        _chunker.resetStats();
      } catch (error) {
        logger.error('Failed to reset WASM TextChunker stats:', error);
      }
    }
  }
}

// Create singleton instance
export const wasmTextChunker = new WasmTextChunker();

// Register cascade handler so other panicking wrappers can retire this one
registerCascadeHandler(() => wasmTextChunker.retireOnSharedModulePanic());

// Background init: warms up WASM so first caller hits the fast path
if (import.meta.env.MODE !== 'test') {
  _initializeTextChunker().catch((err) => {
    logger.warn('Background WASM TextChunker initialization failed:', err);
  });
}

// Expose globally for debugging
if (typeof window !== 'undefined') {
  // @ts-ignore - debug convenience property
  window.wasmTextChunker = wasmTextChunker;
}
