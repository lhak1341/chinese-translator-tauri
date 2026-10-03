/**
 * @import { DictionaryTrieInterface, DictionarySearchOrder, DictionaryMatchResult, TrieMatch } from '../types/DictionaryManagerTypes'
 */

import { logger } from '../logger.js';
import { compareMatchesBySpecificityThenPriority } from './MatchComparator.js';

/** The WASM tier is only tried for a lookup across at least this many dictionaries. */
const WASM_MIN_DICTIONARIES = 2;

/**
 * Owns the match-lookup dispatch: thread-safe trie walk, sequential scan, and the
 * WASM-first choice for multi-dictionary lookups. DictionaryManager exposes exactly two
 * public methods (findAllMatches, findAllMatchesAsync) that delegate here — this class
 * owns everything behind them.
 */
export class DictionaryMatchLookup {
  constructor({ dictionaries, metadata, wasmLookup, getDefaultSearchOrder, isReady }) {
    this._dictionaries = dictionaries;
    this._metadata = metadata;
    this._wasmLookup = wasmLookup;
    this._getDefaultSearchOrder = getDefaultSearchOrder;
    this._isReady = isReady;
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

    return allMatches.sort(compareMatchesBySpecificityThenPriority);
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
   * Async lookup. A lookup across WASM_MIN_DICTIONARIES or more dictionaries tries the WASM
   * tier first when it is ready; a WASM failure, or any other lookup, takes the sequential
   * JS scan. Callers never need to know WASM is involved.
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {DictionarySearchOrder|null} dictionaryOrder - Dictionary search order
   * @returns {Promise<DictionaryMatchResult[]>} All matches sorted by priority and length
   */
  async findAllMatchesAsync(text, startPos = 0, dictionaryOrder = null) {
    if (!this._isReady()) return [];

    const searchOrder = dictionaryOrder || this._getDefaultSearchOrder();

    if (searchOrder.length >= WASM_MIN_DICTIONARIES && this._wasmLookup?.isReady()) {
      try {
        return await this._wasmLookup.findAllMatches(text, startPos, searchOrder);
      } catch (error) {
        logger.warn('⚠️ WASM lookup failed, using JavaScript:', error);
      }
    }

    return this.findAllMatchesSequential(text, startPos, searchOrder);
  }
}
