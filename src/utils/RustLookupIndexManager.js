// @ts-check
/**
 * Rust Lookup Index Manager
 *
 * High-performance wrapper around the Rust-based lookup index builder.
 * Provides automatic fallback to JavaScript implementation if Rust build fails.
 *
 * Expected Performance:
 * - Rust + Rayon: 200-800ms for 10KB text (6-50x faster)
 * - JavaScript fallback: 5-10 seconds for 10KB text
 */

import tauriAPI from '../tauriAPI.js';
import { logger } from './logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../constants/toastConfig';
import { FallbackManager } from './FallbackManager'; // REFACTOR (2026-01-28): Centralized failure handling

class RustLookupIndexManager {
  constructor() {
    this.enabled = true;
    this.useParallel = true;
    this.minTextLength = 50; // Don't build index for very short texts

    // REFACTOR (2026-01-28): Centralized failure handling via FallbackManager
    this.fallbackHandler = new FallbackManager({
      systemName: 'Rust Lookup Index',
      maxFailures: 3,
      toastMessage: 'High-performance indexing unavailable. Large texts may translate slower.',
      toastId: TOAST_IDS.RUST_INDEX_UNAVAILABLE,
      toastDuration: TOAST_DURATIONS.LOAD_FAILURE,
    });

    // Performance tracking
    this.stats = {
      totalBuilds: 0,
      totalBuildTimeMs: 0,
      averageBuildTimeMs: 0,
      totalPositionsIndexed: 0,
      totalMatches: 0,
      failures: 0,
    };
  }

  /**
   * Build comprehensive lookup index using Rust
   *
   * @param {string} text - The input text to index
   * @param {Object} flatEntriesMap - Map of dictionary name -> flat {chinese,vietnamese,metadata}[] (DictionaryManager.flatEntries)
   * @param {string[]} dictionaryOrder - Order to search dictionaries
   * @param {Map<string, number>} priorityByName - Real dictionary priority per name (DictionaryManager.getPriorityForDictionary) — NOT derived from dictionaryOrder's array position
   * @param {{ minTextLength?: number, enableIndexing?: boolean, useParallel?: boolean }} [options] - Build options
   * @returns {Promise<{success: boolean, index: Object, buildTimeMs: number, positionsIndexed: number, indexSize: number, error?: string}>}
   */
  async buildLookupIndex(text, flatEntriesMap, dictionaryOrder, priorityByName, options = {}) {
    // Use options.minTextLength if provided, otherwise use default
    const minTextLength = options.minTextLength ?? this.minTextLength;
    const enableIndexing = options.enableIndexing ?? true;

    // Check if we should skip (let Rust do the actual checking, this is just a fast path)
    if (!this.enabled) {
      return {
        success: false,
        index: {},
        buildTimeMs: 0,
        positionsIndexed: 0,
        indexSize: 0,
        error: 'Rust indexing disabled due to previous failures',
      };
    }

    try {
      // Convert flat entries to the format expected by Rust
      const dictionaries = this.convertDictionariesToRustFormat(
        flatEntriesMap,
        dictionaryOrder,
        priorityByName
      );

      // Debug: Log what dictionaries are being indexed
      if (process.env.NODE_ENV === 'development') {
        logger.log(
          `📚 Building Rust index with ${dictionaries.length} dictionaries:`,
          dictionaries.map((d) => `${d.name} (${d.entries.length} entries)`).join(', ')
        );
      }

      // Call Rust implementation (let Rust do the minTextLength check)
      const result = await tauriAPI.buildLookupIndex(text, dictionaries, dictionaryOrder, {
        minTextLength,
        enableIndexing,
        useParallel: options.useParallel ?? this.useParallel,
      });

      if (result.success) {
        // Update stats
        this.stats.totalBuilds++;
        this.stats.totalBuildTimeMs += result.buildTimeMs;
        this.stats.averageBuildTimeMs = this.stats.totalBuildTimeMs / this.stats.totalBuilds;
        this.stats.totalPositionsIndexed += result.positionsIndexed;
        this.stats.totalMatches += result.indexSize;

        // Reset failure counter on success
        this.fallbackHandler.recordSuccess();

        return result;
      } else {
        this.handleFailure(result.error);
        return result;
      }
    } catch (/** @type {any} */ error) {
      logger.error('❌ Rust lookup index build failed:', error);
      this.handleFailure(error.message);

      return {
        success: false,
        index: {},
        buildTimeMs: 0,
        positionsIndexed: 0,
        indexSize: 0,
        error: error.toString(),
      };
    }
  }

  /**
   * Convert DictionaryManager's flat entries map to Rust format.
   *
   * @param {Object} flatEntriesMap - Map of dictionary name -> flat {chinese,vietnamese,metadata}[]
   * @param {string[]} dictionaryOrder - Order to search dictionaries
   * @param {Map<string, number>} [priorityByName] - Real dictionary priority per name. Falls back
   *   to 999 (the codebase's existing "unknown/lowest" sentinel, matching
   *   DictionaryManager._extractPriorityMap) for any name missing from the map.
   * @returns {Array<{name: string, entries: Array<*>, priority: number}>}
   */
  convertDictionariesToRustFormat(flatEntriesMap, dictionaryOrder, priorityByName) {
    const dictionaries = [];

    // Handle both Map and plain object for flatEntriesMap
    const entriesMap =
      flatEntriesMap instanceof Map ? Object.fromEntries(flatEntriesMap) : flatEntriesMap;

    // Handle missing or invalid dictionaryOrder
    if (!dictionaryOrder || !Array.isArray(dictionaryOrder)) {
      // If no order provided, use all dictionaries from the map
      dictionaryOrder = Object.keys(entriesMap);
    }

    for (const dictName of dictionaryOrder) {
      const entries = entriesMap[dictName];
      if (!entries) continue;

      dictionaries.push({
        name: dictName,
        entries,
        priority: priorityByName?.get(dictName) ?? 999,
      });
    }

    return dictionaries;
  }

  /**
   * Handle build failure
   * REFACTOR (2026-01-28): Delegates to FallbackManager for consistent handling
   * @param {any} error
   */
  handleFailure(error) {
    this.stats.failures++;

    const enteredFallback = this.fallbackHandler.recordFailure();
    if (enteredFallback) {
      this.enabled = false; // Disable Rust implementation
    }

    logger.error(
      `Rust lookup index failure (${this.fallbackHandler.getFailureCount()}/${this.fallbackHandler.maxFailures}):`,
      error
    );
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      enabled: this.enabled,
      consecutiveFailures: this.fallbackHandler.getFailureCount(),
    };
  }

  /**
   * Reset to enabled state (useful for testing or after fixing issues)
   */
  reset() {
    this.enabled = true;
    this.fallbackHandler.reset();
  }

  /**
   * Check if Rust implementation is available
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Clean up resources
   * CODE REVIEW FIX (MEDIUM-7): Added cleanup method for consistency
   */
  cleanup() {
    // Reset all state
    this.enabled = true;
    this.fallbackHandler.exitFallbackMode(); // Full reset including warning flag

    // Clear stats
    this.stats = {
      totalBuilds: 0,
      totalBuildTimeMs: 0,
      averageBuildTimeMs: 0,
      totalPositionsIndexed: 0,
      totalMatches: 0,
      failures: 0,
    };

    logger.log('🧹 Rust Lookup Index Manager cleaned up');
    // Note: No intervals to clear in this module
  }
}

// Export singleton instance
export const rustLookupIndexManager = new RustLookupIndexManager();

// Export class for testing
export default RustLookupIndexManager;
