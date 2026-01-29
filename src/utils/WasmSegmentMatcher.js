/**
 * WASM Segment Matcher
 *
 * JavaScript wrapper for WASM-accelerated segment matching using trie structures.
 * Provides 8-20x speedup over JavaScript O(n*m*k) implementation.
 *
 * Algorithm:
 * - Build trie from semantic units: O(m*k) where m=units, k=avg unit length
 * - Find matches: O(n+k) where n=text length, k=match length
 * - Total: O(n+m*k) instead of O(n*m*k)
 *
 * Usage:
 * ```javascript
 * const matcher = new WasmSegmentMatcher();
 * await matcher.initialize(semanticUnits);
 * const matches = matcher.findMatches(text);
 * ```
 */

import { logger } from './logger.js';

let SegmentMatcher = null;
let wasmInitialized = false;

/**
 * Initialize WASM module (done once)
 */
async function initializeWasm() {
  if (wasmInitialized) return true;

  try {
    const wasmModule = await import('../wasm/translation_wasm_core.js');
    SegmentMatcher = wasmModule.SegmentMatcher;
    wasmInitialized = true;

    if (process.env.NODE_ENV === 'development') {
      logger.log('✅ WASM SegmentMatcher initialized successfully');
    }

    return true;
  } catch (error) {
    logger.warn('⚠️ Failed to initialize WASM SegmentMatcher:', error);
    return false;
  }
}

/**
 * WASM Segment Matcher wrapper
 */
export class WasmSegmentMatcher {
  constructor() {
    this.matcher = null;
    this.initialized = false;
  }

  /**
   * Initialize matcher with semantic units
   *
   * @param {Array} semanticUnits - Array of semantic units with { unit, index, original, metadata }
   * @returns {Promise<boolean>} True if initialization succeeded
   */
  async initialize(semanticUnits) {
    try {
      // Initialize WASM module if not done
      const wasmReady = await initializeWasm();
      if (!wasmReady) {
        return false;
      }

      // Create new matcher instance
      this.matcher = new SegmentMatcher();

      // Convert semantic units to format expected by WASM
      // Filter out empty units and normalize to NFC
      const units = semanticUnits
        .filter((u) => u.unit && u.unit.length > 0)
        .map((u) => ({
          unit: u.unit.normalize('NFC'),
          index: u.index,
          original: u.original || '',
          metadata: null, // Metadata handled separately in JavaScript
        }));

      if (units.length === 0) {
        logger.warn('⚠️ No valid units to build index');
        return false;
      }

      // Build trie index
      const success = this.matcher.buildIndex(units);

      if (success) {
        this.initialized = true;

        if (process.env.NODE_ENV === 'development') {
          const stats = this.matcher.getStats();
          logger.log('✅ WASM SegmentMatcher index built:', {
            units: units.length,
            stats,
          });
        }

        return true;
      } else {
        logger.warn('⚠️ Failed to build WASM segment matcher index');
        return false;
      }
    } catch (error) {
      logger.warn('⚠️ Error initializing WASM segment matcher:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Find all matches in text
   *
   * @param {string} text - Text to search (should be NFC normalized)
   * @param {Array} semanticUnits - Original semantic units (for metadata lookup)
   * @returns {Array|null} Array of matches or null if WASM unavailable
   */
  findMatches(text, semanticUnits) {
    if (!this.initialized || !this.matcher) {
      return null;
    }

    try {
      // Normalize text to NFC for consistent matching
      const normalizedText = text.normalize('NFC');

      // Find matches using WASM trie
      const matches = this.matcher.findMatches(normalizedText);

      // Enrich matches with metadata from original semantic units
      return matches.map((match) => {
        const originalUnit = semanticUnits[match.unit_index];
        return {
          position: match.position,
          length: match.length,
          offset: match.offset,
          unitIndex: match.unit_index,
          original: match.original,
          translated: match.translated,
          metadata: originalUnit?.metadata || null,
        };
      });
    } catch (error) {
      logger.warn('⚠️ Error in WASM segment matching:', error);
      return null;
    }
  }

  /**
   * Get statistics about the trie
   *
   * @returns {Object|null} Statistics or null if not initialized
   */
  getStats() {
    if (!this.initialized || !this.matcher) {
      return null;
    }

    try {
      return this.matcher.getStats();
    } catch (error) {
      logger.warn('⚠️ Error getting WASM segment matcher stats:', error);
      return null;
    }
  }

  /**
   * Check if WASM is available and initialized
   *
   * @returns {boolean} True if WASM is ready
   */
  isAvailable() {
    return wasmInitialized && this.initialized;
  }
}

/**
 * Check if WASM segment matcher is supported
 *
 * @returns {Promise<boolean>} True if WASM is available
 */
export async function isWasmSegmentMatcherSupported() {
  return await initializeWasm();
}
