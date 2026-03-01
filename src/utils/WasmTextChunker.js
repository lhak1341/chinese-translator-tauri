// @ts-check
import init, {
  TextChunker,
  recordFallback,
  getGlobalChunkerStats,
} from '../wasm/translation_wasm_core.js';
import { logger } from './logger';

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
export class WasmTextChunker {
  constructor() {
    /** @type {TextChunker | null} */
    this.chunker = null;
    /** @type {boolean} */
    this.initialized = false;
    /** @type {Promise<boolean> | null} - Track initialization promise to prevent race conditions */
    this.initializationPromise = null;
    /** @type {boolean} */
    this.initializationFailed = false;
    /** @type {number} */
    this.wasmHits = 0;
    /** @type {number} */
    this.fallbackHits = 0;
  }

  /**
   * Initialize WASM text chunker (LAZY - call on first use)
   *
   * @param {boolean} useUnicodeProperties - Use Unicode property detection (default: true)
   * @param {number} timeoutMs - Timeout for initialization (default: 5000ms)
   * @returns {Promise<boolean>} Success status
   */
  async initialize(useUnicodeProperties = true, timeoutMs = 10000) {
    // Return cached result if already initialized or failed
    if (this.chunker && this.initialized) {
      return true;
    }
    if (this.initializationFailed) {
      return false;
    }

    // Return existing promise if initialization in progress (RACE CONDITION FIX)
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Assign promise synchronously before async work to prevent concurrent init attempts
    this.initializationPromise = (async () => {
      try {
        const startTime = performance.now();
        logger.log(
          `[WASM TextChunker] 🔄 Starting init (timeout: ${timeoutMs}ms, env: ${process.env.NODE_ENV})`
        );

        // Add timeout to prevent hangs
        const initPromise = init();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`WASM initialization timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        );

        await Promise.race([initPromise, timeoutPromise]);
        const initTime = performance.now() - startTime;

        logger.log(`[WASM TextChunker] ✅ WASM module loaded in ${initTime.toFixed(1)}ms`);

        this.chunker = new TextChunker(useUnicodeProperties);
        this.initialized = true;

        const totalTime = performance.now() - startTime;
        logger.log(`[WASM TextChunker] ✅ Fully initialized in ${totalTime.toFixed(1)}ms`);
        return true;
      } catch (/** @type {any} */ error) {
        logger.error('[WASM TextChunker] ❌ Initialization error:', {
          error: error.message,
          stack: error.stack,
          env: process.env.NODE_ENV,
          timeout: timeoutMs,
        });
        this.initialized = false;
        this.initializationFailed = true;
        return false;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Chunk text by punctuation boundaries (synchronous after initialization)
   *
   * Performance:
   * - JavaScript: ~1-2ms for 5000 chars (regex + iteration)
   * - Rust: ~0.3-0.7ms for same (native Unicode)
   * - Speedup: 2-3x
   *
   * @param {string} text - Input text to chunk
   * @returns {Array<{content: string, punctuation: string, startIndex: number, lineBreaks: string, startedBy: string}> | null}
   *   Array of chunk objects or null on error/not initialized
   */
  /**
   * Chunk text (synchronous - triggers lazy init if needed)
   * @param {string} text - Input text
   * @returns {Array<*>|null} Chunks or null if not initialized
   */
  chunkText(text) {
    // LAZY INITIALIZATION: Trigger initialization on first use (non-blocking)
    if (!this.initialized && !this.initializationFailed && !this.initializationPromise) {
      logger.log('[WASM TextChunker] Triggering lazy initialization');
      this.initialize().catch((err) => {
        logger.error('[WASM TextChunker] Lazy init failed:', err);
      });
    }

    logger.log(
      `[WASM TextChunker] chunkText (initialized: ${this.initialized}, chunker: ${!!this.chunker}, textLength: ${text.length})`
    );

    if (!this.initialized || !this.chunker) {
      // Not initialized yet - use JS fallback
      logger.log('[WASM TextChunker] Not ready, using JS fallback');
      try {
        recordFallback();
      } catch (e) {
        // WASM not loaded, ignore
      }
      this.fallbackHits++;
      return null;
    }

    try {
      const chunks = this.chunker.chunkText(text);
      logger.log(`[WASM TextChunker] ✅ Chunked into ${chunks.length} chunks`);
      this.wasmHits++;

      return chunks;
    } catch (/** @type {any} */ error) {
      logger.error('[WASM TextChunker] ❌ Error during chunking:', {
        message: error.message,
        stack: error.stack,
        textLength: text.length,
        env: process.env.NODE_ENV,
      });
      try {
        recordFallback();
      } catch (e) {
        // WASM error, ignore
      }
      this.fallbackHits++;
      return null;
    }
  }

  /**
   * Get performance statistics
   *
   * @returns {Object} Statistics object with chunksProcessed, totalTimeUs, avgTimeUs, fallbackCount
   */
  getStats() {
    if (!this.initialized || !this.chunker) {
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
      const wasmStats = this.chunker.getStats();
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
      return getGlobalChunkerStats();
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
   * Reset statistics
   */
  resetStats() {
    this.wasmHits = 0;
    this.fallbackHits = 0;
    if (this.initialized && this.chunker) {
      try {
        this.chunker.resetStats();
      } catch (error) {
        logger.error('Failed to reset WASM TextChunker stats:', error);
      }
    }
  }
}

// Create singleton instance
export const wasmTextChunker = new WasmTextChunker();

// Background init: warms up WASM so first caller hits the fast path
wasmTextChunker.initialize().catch((err) => {
  logger.warn('Background WASM TextChunker initialization failed:', err);
});

// Expose globally for debugging
if (typeof window !== 'undefined') {
  // @ts-ignore - debug convenience property
  window.wasmTextChunker = wasmTextChunker;
}
