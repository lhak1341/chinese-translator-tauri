/**
 * Translation Result Caching System
 * Provides intelligent caching for translation results to improve performance
 *
 * @import {
 *   TranslationCacheOptions,
 *   TranslationCache as ITranslationCache,
 *   PreWarmOptions,
 *   PreWarmResult,
 *   LRUCache as ILRUCache,
 *   CacheStats
 * } from '../types/CacheTypes'
 */

import { LRUCache } from './LRUCache.js';

export class TranslationCache {
  constructor(options = {}) {
    // Configure cache sizes based on usage patterns
    this.characterCacheSize = options.characterCacheSize || 500; // Most frequently used
    this.phraseCacheSize = options.phraseCacheSize || 1000; // Moderate frequency
    this.patternCacheSize = options.patternCacheSize || 200; // Less frequent but expensive

    // Initialize separate caches for different types
    this.characterCache = new LRUCache(this.characterCacheSize);
    this.phraseCache = new LRUCache(this.phraseCacheSize);
    this.patternCache = new LRUCache(this.patternCacheSize);

    // Combined lookup cache for multi-dictionary searches
    this.lookupCache = new LRUCache(options.lookupCacheSize || 800);

    this.isEnabled = options.enabled !== false; // Default to enabled
  }

  /**
   * Generate cache key for dictionary lookup
   * @param {string} text - Text to translate
   * @param {string} dictionaryName - Dictionary name
   * @returns {string} Cache key
   */
  generateLookupKey(text, dictionaryName) {
    return `${dictionaryName}:${text}`;
  }

  /**
   * Generate cache key for multi-dictionary lookup
   * @param {string} text - Text to translate
   * @param {Array} dictionaryNames - Array of dictionary names
   * @returns {string} Cache key
   */
  generateMultiLookupKey(text, dictionaryNames) {
    return `${dictionaryNames.join(',')}:${text}`;
  }

  /**
   * Get cached character translation
   * @param {string} character - Character to translate
   * @param {string} dictionaryName - Dictionary name
   * @returns {*} Cached result or undefined
   */
  getCharacter(character, dictionaryName) {
    if (!this.isEnabled) return undefined;
    return this.characterCache.get(this.generateLookupKey(character, dictionaryName));
  }

  /**
   * Cache character translation result
   * @param {string} character - Character translated
   * @param {string} dictionaryName - Dictionary name
   * @param {*} result - Translation result
   */
  setCharacter(character, dictionaryName, result) {
    if (!this.isEnabled) return;
    this.characterCache.set(this.generateLookupKey(character, dictionaryName), result);
  }

  /**
   * Get cached phrase translation
   * @param {string} phrase - Phrase to translate
   * @param {string} dictionaryName - Dictionary name
   * @returns {*} Cached result or undefined
   */
  getPhrase(phrase, dictionaryName) {
    if (!this.isEnabled) return undefined;
    return this.phraseCache.get(this.generateLookupKey(phrase, dictionaryName));
  }

  /**
   * Cache phrase translation result
   * @param {string} phrase - Phrase translated
   * @param {string} dictionaryName - Dictionary name
   * @param {*} result - Translation result
   */
  setPhrase(phrase, dictionaryName, result) {
    if (!this.isEnabled) return;
    this.phraseCache.set(this.generateLookupKey(phrase, dictionaryName), result);
  }

  /**
   * Get cached pattern match result
   * @param {string} pattern - Pattern to match
   * @param {string} text - Text being matched
   * @returns {*} Cached result or undefined
   */
  getPattern(pattern, text) {
    if (!this.isEnabled) return undefined;
    return this.patternCache.get(`${pattern}:${text}`);
  }

  /**
   * Cache pattern match result
   * @param {string} pattern - Pattern matched
   * @param {string} text - Text that was matched
   * @param {*} result - Match result
   */
  setPattern(pattern, text, result) {
    if (!this.isEnabled) return;
    this.patternCache.set(`${pattern}:${text}`, result);
  }

  /**
   * Get cached multi-dictionary lookup result
   * @param {string} text - Text to translate
   * @param {Array} dictionaryNames - Array of dictionary names
   * @returns {*} Cached result or undefined
   */
  getLookup(text, dictionaryNames) {
    if (!this.isEnabled) return undefined;
    return this.lookupCache.get(this.generateMultiLookupKey(text, dictionaryNames));
  }

  /**
   * Cache multi-dictionary lookup result
   * @param {string} text - Text translated
   * @param {Array} dictionaryNames - Array of dictionary names
   * @param {*} result - Translation result
   */
  setLookup(text, dictionaryNames, result) {
    if (!this.isEnabled) return;
    this.lookupCache.set(this.generateMultiLookupKey(text, dictionaryNames), result);
  }

  /**
   * Invalidate cache entries for a specific dictionary
   * @param {string} dictionaryName - Dictionary name to invalidate
   */
  invalidateDictionary(dictionaryName) {
    // Character cache invalidation
    const characterKeys = this.characterCache
      .keys()
      .filter((key) => key.startsWith(dictionaryName + ':'));
    characterKeys.forEach((key) => this.characterCache.delete(key));

    // Phrase cache invalidation
    const phraseKeys = this.phraseCache
      .keys()
      .filter((key) => key.startsWith(dictionaryName + ':'));
    phraseKeys.forEach((key) => this.phraseCache.delete(key));

    // Lookup cache invalidation (contains dictionary name in comma-separated list)
    const lookupKeys = this.lookupCache.keys().filter((key) => {
      const dictPart = key.split(':')[0];
      return dictPart.split(',').includes(dictionaryName);
    });
    lookupKeys.forEach((key) => this.lookupCache.delete(key));
  }

  /**
   * Clear all caches
   */
  clear() {
    this.characterCache.clear();
    this.phraseCache.clear();
    this.patternCache.clear();
    this.lookupCache.clear();
  }

  /**
   * Enable or disable caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Get comprehensive cache statistics
   * @returns {Object} Combined cache statistics
   */
  getStats() {
    const characterStats = this.characterCache.getStats();
    const phraseStats = this.phraseCache.getStats();
    const patternStats = this.patternCache.getStats();
    const lookupStats = this.lookupCache.getStats();

    const totalQueries =
      characterStats.totalQueries +
      phraseStats.totalQueries +
      patternStats.totalQueries +
      lookupStats.totalQueries;
    const totalHits = characterStats.hits + phraseStats.hits + patternStats.hits + lookupStats.hits;
    const overallHitRate = totalQueries > 0 ? ((totalHits / totalQueries) * 100).toFixed(1) : 0;

    return {
      enabled: this.isEnabled,
      overall: {
        hitRate: `${overallHitRate}%`,
        totalQueries,
        totalHits,
        totalMisses: totalQueries - totalHits,
      },
      character: characterStats,
      phrase: phraseStats,
      pattern: patternStats,
      lookup: lookupStats,
    };
  }

  /**
   * Pre-warm caches with novel-specific vocabulary and common Chinese characters/phrases
   * @param {Object} dictionaryManager - Dictionary manager instance
   * @param {Object} options - Pre-warming options
   * @param {Array} options.activeProperNouns - Active proper noun dictionaries for novel-specific pre-warming
   * @param {boolean} options.novelSpecific - Whether to prioritize novel-specific vocabulary
   * @returns {Promise<Object>} Pre-warming statistics
   */
  async preWarmCaches(dictionaryManager, options = {}) {
    if (!this.isEnabled || !dictionaryManager) {
      return { skipped: true, reason: 'Cache disabled or no dictionary manager' };
    }

    const startTime = performance.now();
    let charactersWarmed = 0;
    let phrasesWarmed = 0;
    let properNounsWarmed = 0;

    // Most common Chinese characters (top 100 by frequency)
    const commonCharacters = [
      '的',
      '一',
      '是',
      '在',
      '不',
      '了',
      '有',
      '和',
      '人',
      '这',
      '中',
      '大',
      '为',
      '上',
      '个',
      '国',
      '我',
      '以',
      '要',
      '他',
      '时',
      '来',
      '用',
      '们',
      '生',
      '到',
      '作',
      '地',
      '于',
      '出',
      '就',
      '分',
      '对',
      '成',
      '会',
      '可',
      '主',
      '发',
      '年',
      '动',
      '同',
      '工',
      '也',
      '能',
      '下',
      '过',
      '子',
      '说',
      '产',
      '种',
      '面',
      '而',
      '方',
      '后',
      '多',
      '定',
      '行',
      '学',
      '法',
      '所',
      '民',
      '得',
      '经',
      '十',
      '三',
      '之',
      '进',
      '着',
      '等',
      '部',
      '度',
      '家',
      '电',
      '力',
      '里',
      '如',
      '水',
      '化',
      '高',
      '自',
      '二',
      '理',
      '起',
      '小',
      '物',
      '现',
      '实',
      '加',
      '量',
      '都',
      '两',
      '体',
      '制',
      '机',
      '当',
      '使',
      '点',
      '从',
      '业',
      '本',
    ];

    // Pre-warm character cache
    for (const char of commonCharacters) {
      const result = dictionaryManager.translate(char, ['characters']);
      if (result) {
        this.cacheCharacter(char, 'characters', result);
        charactersWarmed++;
      }
    }

    // Common Chinese phrases (frequently used in translation)
    const commonPhrases = [
      '中国',
      '发展',
      '社会',
      '经济',
      '问题',
      '建设',
      '政府',
      '人民',
      '企业',
      '市场',
      '科技',
      '教育',
      '文化',
      '环境',
      '服务',
      '管理',
      '系统',
      '技术',
      '产业',
      '网络',
      '信息',
      '数据',
      '研究',
      '创新',
      '改革',
      '开放',
      '合作',
      '交流',
      '活动',
      '项目',
      '计划',
      '措施',
      '政策',
      '法律',
      '标准',
      '质量',
      '效果',
      '影响',
      '变化',
      '发生',
      '完成',
      '实现',
      '提高',
      '增加',
      '减少',
      '保护',
      '维护',
      '促进',
    ];

    // Pre-warm phrase cache
    for (const phrase of commonPhrases) {
      const result = dictionaryManager.translate(phrase, ['phrases']);
      if (result) {
        this.cachePhrase(phrase, 'phrases', result);
        phrasesWarmed++;
      }
    }

    // Novel-specific pre-warming based on active proper noun dictionaries
    if (
      options.novelSpecific &&
      options.activeProperNouns &&
      options.activeProperNouns.length > 0
    ) {
      properNounsWarmed = await this.preWarmNovelSpecificVocabulary(
        dictionaryManager,
        options.activeProperNouns
      );
    }

    const preWarmTime = performance.now() - startTime;

    return {
      charactersWarmed,
      phrasesWarmed,
      properNounsWarmed,
      timeMs: Math.round(preWarmTime * 100) / 100,
      success: true,
      novelSpecific: options.novelSpecific || false,
    };
  }

  /**
   * Pre-warm caches with novel-specific vocabulary from active proper noun dictionaries
   * @param {Object} dictionaryManager - Dictionary manager instance
   * @param {Array} activeProperNouns - List of active proper noun dictionary names
   * @returns {Promise<number>} Number of proper nouns warmed
   */
  async preWarmNovelSpecificVocabulary(dictionaryManager, activeProperNouns) {
    let properNounsWarmed = 0;

    for (const dictionaryName of activeProperNouns) {
      try {
        // Get the dictionary trie for this proper noun dictionary
        const dictionary = dictionaryManager.getDictionary(dictionaryName);
        if (!dictionary) continue;

        // Extract high-frequency vocabulary from the dictionary
        const vocabularyEntries = this.extractHighFrequencyVocabulary(dictionary, dictionaryName);

        // Pre-warm cache with proper noun translations
        for (const entry of vocabularyEntries) {
          const result = dictionaryManager.translate(entry.word, [dictionaryName]);
          if (result) {
            this.cacheCharacter(entry.word, dictionaryName, result);
            properNounsWarmed++;
          }
        }

        // Pre-warm common character combinations that appear with proper nouns
        const characterCombos = this.generateCharacterCombinations(vocabularyEntries);
        for (const combo of characterCombos) {
          const result = dictionaryManager.translate(combo, ['phrases', 'characters']);
          if (result) {
            this.cachePhrase(combo, 'phrases', result);
            properNounsWarmed++;
          }
        }
      } catch (error) {
        console.warn(`Failed to pre-warm vocabulary from ${dictionaryName}:`, error.message);
      }
    }

    return properNounsWarmed;
  }

  /**
   * Extract high-frequency vocabulary from a dictionary trie
   * @param {Object} dictionary - Dictionary trie
   * @param {string} dictionaryName - Name of the dictionary
   * @returns {Array} Array of vocabulary entries with frequency data
   */
  extractHighFrequencyVocabulary(dictionary, dictionaryName) {
    const entries = [];
    const maxEntries = 50; // Limit to top 50 entries per dictionary

    // Traverse the trie to collect all entries
    const collectEntries = (node, currentWord = '') => {
      if (entries.length >= maxEntries) return;

      if (node.isEndOfWord && node.translation) {
        // Prioritize shorter proper nouns (characters, names) over longer phrases
        const priority = currentWord.length <= 3 ? 1 : currentWord.length <= 5 ? 2 : 3;

        entries.push({
          word: currentWord,
          translation: node.translation,
          priority: priority,
          dictionary: dictionaryName,
        });
      }

      // Continue traversing children
      for (const [char, childNode] of node.children.entries()) {
        if (entries.length < maxEntries) {
          collectEntries(childNode, currentWord + char);
        }
      }
    };

    collectEntries(dictionary.root);

    // Sort by priority (shorter entries first) and limit results
    return entries
      .sort((a, b) => a.priority - b.priority || a.word.localeCompare(b.word))
      .slice(0, maxEntries);
  }

  /**
   * Generate common character combinations from proper noun vocabulary
   * @param {Array} vocabularyEntries - Extracted vocabulary entries
   * @returns {Array} Array of character combinations
   */
  generateCharacterCombinations(vocabularyEntries) {
    const combinations = new Set();

    // Extract individual characters from proper nouns for combination generation
    const characters = new Set();
    vocabularyEntries.forEach((entry) => {
      if (entry.word.length <= 3) {
        // Focus on shorter proper nouns
        Array.from(entry.word).forEach((char) => characters.add(char));
      }
    });

    // Generate combinations with common function words used with proper nouns
    const functionWords = ['的', '了', '在', '说', '看', '到', '从', '对', '和', '与'];
    const charArray = Array.from(characters).slice(0, 20); // Limit characters used

    for (const char of charArray) {
      for (const functionWord of functionWords.slice(0, 5)) {
        // Top 5 function words
        combinations.add(char + functionWord);
        combinations.add(functionWord + char);
        if (combinations.size >= 30) break; // Limit total combinations
      }
      if (combinations.size >= 30) break;
    }

    return Array.from(combinations);
  }

  /**
   * Get memory usage information
   * @returns {Object} Memory usage stats
   */
  getMemoryUsage() {
    return {
      characterCache: this.characterCache.size(),
      phraseCache: this.phraseCache.size(),
      patternCache: this.patternCache.size(),
      lookupCache: this.lookupCache.size(),
      totalEntries:
        this.characterCache.size() +
        this.phraseCache.size() +
        this.patternCache.size() +
        this.lookupCache.size(),
      maxCapacity:
        this.characterCacheSize +
        this.phraseCacheSize +
        this.patternCacheSize +
        this.lookupCache.maxSize,
    };
  }
}
