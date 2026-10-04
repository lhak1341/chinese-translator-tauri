/**
 * @import { DictionaryTrieInterface, DictionarySearchOrder, DictionaryMatchResult, TrieMatch } from '../types/DictionaryManagerTypes'
 */

import { logger } from '../logger.js';
import { compareMatchesBySpecificityThenPriority } from './MatchComparator.js';

/**
 * Owns the match lookup: thread-safe trie walk and the sequential scan across a search order.
 * DictionaryManager's `findAllMatches` delegates here — this class owns everything behind it.
 */
export class DictionaryMatchLookup {
  constructor({ dictionaries, metadata, getDefaultSearchOrder, isReady }) {
    this._dictionaries = dictionaries;
    this._metadata = metadata;
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
  findAllMatches(text, startPos = 0, dictionaryOrder = null) {
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
}
