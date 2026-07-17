/**
 * @import { DictionaryTrieInterface, DictionarySearchOrder, DictionaryMatchResult, TrieMatch, ParallelLookupStats } from '../types/DictionaryManagerTypes'
 */

import { logger } from '../logger.js';
import { compareMatchesBySpecificityThenPriority } from './MatchComparator.js';

/**
 * Owns the JS match-lookup dispatch: thread-safe trie walk, sequential scan,
 * parallel fan-out with WASM-first/JS-fallback, and the auto parallel/sequential
 * choice. DictionaryManager exposes exactly two public methods (findAllMatches,
 * findAllMatchesAsync) that delegate here — this class owns everything behind them.
 */
export class DictionaryMatchLookup {
  constructor({
    dictionaries,
    metadata,
    wasmLookup,
    enableParallelLookups,
    dictionaryParallelThreshold,
    getDefaultSearchOrder,
    isReady,
  }) {
    this._dictionaries = dictionaries;
    this._metadata = metadata;
    this._wasmLookup = wasmLookup;
    this._enableParallelLookups = enableParallelLookups;
    this._dictionaryParallelThreshold = dictionaryParallelThreshold;
    this._getDefaultSearchOrder = getDefaultSearchOrder;
    this._isReady = isReady;
    this.stats = {
      parallelCalls: 0,
      sequentialCalls: 0,
      averageParallelTime: 0,
      averageSequentialTime: 0,
      fallbackCount: 0,
    };
  }

  /**
   * Thread-safe findMatches implementation that doesn't use shared arrays
   * @param {DictionaryTrieInterface} dictionary - Dictionary trie to search
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @returns {TrieMatch[]} Matches from this dictionary
   */
  findMatchesThreadSafe(dictionary, text, startPos = 0) {
    const matches = [];
    let current = dictionary.root;

    for (let i = startPos; i < text.length; i++) {
      const char = text[i];

      if (!current.children.has(char)) {
        break;
      }

      current = current.children.get(char);

      if (current.isEndOfWord) {
        matches.push({
          word: text.slice(startPos, i + 1),
          translation: current.translation,
          endPos: i + 1,
          metadata: current.metadata,
        });
      }
    }

    return matches;
  }

  /**
   * Sequential scan across all dictionaries in search order.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {DictionarySearchOrder|null} dictionaryOrder - Dictionary search order
   * @returns {DictionaryMatchResult[]} All matches sorted by priority and length
   */
  findAllMatchesSequential(text, startPos = 0, dictionaryOrder = null) {
    if (!this._isReady()) return [];

    const searchOrder = dictionaryOrder || this._getDefaultSearchOrder();
    const allMatches = [];
    const startTime = performance.now();

    for (const dictionaryName of searchOrder) {
      const dictionary = this._dictionaries.get(dictionaryName);
      if (!dictionary) continue;

      try {
        const matches = this.findMatchesThreadSafe(dictionary, text, startPos);

        matches.forEach((match) => {
          match.dictionary = dictionaryName;
          match.priority = this._metadata.get(dictionaryName)?.priority || 10;
        });

        allMatches.push(...matches);
      } catch (error) {
        logger.error(`Dictionary ${dictionaryName} lookup failed:`, error);
        // Continue with other dictionaries
      }
    }

    const lookupTime = performance.now() - startTime;

    this.stats.sequentialCalls++;
    this.stats.averageSequentialTime = (this.stats.averageSequentialTime + lookupTime) / 2;

    return allMatches.sort(compareMatchesBySpecificityThenPriority);
  }

  /**
   * Find all matches using parallel dictionary lookups. Tries WASM first;
   * falls back to JS parallel fan-out; falls back further to sequential
   * on unexpected failure. Callers never need to know WASM is involved.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {DictionarySearchOrder|null} dictionaryOrder - Dictionary search order
   * @returns {Promise<DictionaryMatchResult[]>} All matches sorted by priority and length
   */
  async findAllMatchesParallel(text, startPos = 0, dictionaryOrder = null) {
    if (!this._isReady()) return [];

    if (this._wasmLookup?.isReady()) {
      try {
        return await this._wasmLookup.findAllMatches(
          text,
          startPos,
          dictionaryOrder || this._getDefaultSearchOrder()
        );
      } catch (error) {
        logger.warn('⚠️ WASM parallel lookup failed, using JavaScript:', error);
      }
    }

    const searchOrder = dictionaryOrder || this._getDefaultSearchOrder();
    const startTime = performance.now();

    try {
      const lookupPromises = searchOrder.map(async (dictionaryName) => {
        const dictionary = this._dictionaries.get(dictionaryName);
        if (!dictionary) return { dictionaryName, matches: [], success: true };

        try {
          const matches = this.findMatchesThreadSafe(dictionary, text, startPos);
          const priority = this._metadata.get(dictionaryName)?.priority || 10;

          const enrichedMatches = matches.map((match) => ({
            ...match,
            dictionary: dictionaryName,
            priority,
          }));

          return { dictionaryName, matches: enrichedMatches, success: true };
        } catch (error) {
          logger.error(`Dictionary lookup failed for ${dictionaryName}:`, error);
          return { dictionaryName, matches: [], success: false, error };
        }
      });

      const lookupResults = await Promise.all(lookupPromises);

      const failures = lookupResults.filter((result) => !result.success);
      if (failures.length > 0) {
        logger.warn(
          `${failures.length} dictionary lookups failed, proceeding with available results`
        );
      }

      const allMatches = lookupResults
        .filter((result) => result.success)
        .flatMap((result) => result.matches);

      const sortedMatches = allMatches.sort(compareMatchesBySpecificityThenPriority);

      const lookupTime = performance.now() - startTime;

      this.stats.parallelCalls++;
      this.stats.averageParallelTime = (this.stats.averageParallelTime + lookupTime) / 2;

      return sortedMatches;
    } catch (error) {
      logger.error('Parallel dictionary lookup failed, falling back to sequential:', error);

      this.stats.fallbackCount = (this.stats.fallbackCount || 0) + 1;

      return this.findAllMatchesSequential(text, startPos, dictionaryOrder);
    }
  }

  /**
   * Always-sequential lookup — the sync entry point. Required by callers
   * (e.g. PatternVariableCache's per-position hot loop) that cannot await.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {DictionarySearchOrder|null} dictionaryOrder - Dictionary search order
   * @returns {DictionaryMatchResult[]} All matches sorted by priority and length
   */
  findAllMatches(text, startPos = 0, dictionaryOrder = null) {
    return this.findAllMatchesSequential(text, startPos, dictionaryOrder);
  }

  /**
   * Auto parallel/sequential lookup — chooses based on search-order width.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {DictionarySearchOrder|null} dictionaryOrder - Dictionary search order
   * @returns {Promise<DictionaryMatchResult[]>} All matches sorted by priority and length
   */
  async findAllMatchesAsync(text, startPos = 0, dictionaryOrder = null) {
    if (!this._isReady()) return [];

    const searchOrder = dictionaryOrder || this._getDefaultSearchOrder();

    const shouldUseParallel =
      this._enableParallelLookups && searchOrder.length >= this._dictionaryParallelThreshold;

    if (shouldUseParallel) {
      return this.findAllMatchesParallel(text, startPos, dictionaryOrder);
    }
    return this.findAllMatchesSequential(text, startPos, dictionaryOrder);
  }
}
