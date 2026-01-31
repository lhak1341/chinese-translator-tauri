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
    /** @type {number} */
    this.wasmHits = 0;
    /** @type {number} */
    this.fallbackHits = 0;
  }

  /**
   * Initialize WASM text chunker
   *
   * @param {boolean} useUnicodeProperties - Use Unicode property detection (default: true)
   * @returns {Promise<boolean>} Success status
   */
  async initialize(useUnicodeProperties = true) {
    try {
      await init();
      this.chunker = new TextChunker(useUnicodeProperties);
      this.initialized = true;
      logger.log('✅ WASM TextChunker initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize WASM TextChunker:', error);
      return false;
    }
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
  chunkText(text) {
    if (!this.initialized) {
      // Not initialized yet - caller should initialize first or use fallback
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
      this.wasmHits++;
      return chunks;
    } catch (error) {
      logger.warn('WASM TextChunker failed, using fallback:', error);
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

// Eager initialization - start loading WASM immediately
// This allows the chunker to be ready by the time it's first used
wasmTextChunker.initialize().catch((error) => {
  logger.debug('WASM TextChunker initialization failed, will use JavaScript fallback:', error);
});

// Expose globally for debugging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.wasmTextChunker = wasmTextChunker;
}
