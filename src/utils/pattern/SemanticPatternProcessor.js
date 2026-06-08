/**
 * Semantic Pattern Processor for Unified Pattern Matching
 * Replaces regex-based PatternCompiler with semantic token-based approach
 * Implements unified architecture similar to NumberProcessor for consistency
 *
 * @import {
 *   SemanticPattern,
 *   PatternToken,
 *   PatternVariable,
 *   PatternMatchResult,
 *   PatternProcessingOptions,
 *   PatternInitializationOptions,
 *   PatternProcessorStats,
 *   VariableCacheEntry,
 *   PrecomputedStringStats,
 *   StringOptimizationStats,
 *   TemplateSubstitutionResult,
 *   PatternPriorityFactors
 * } from '../types/PatternProcessingTypes'
 */

import { calculatePatternPriority } from './PatternPriorityCalculator.js';
import { logger } from '../logger.js';
import { wasmStringProcessor } from '../wasm/WasmStringProcessor.js';
import { buildPatternVariableCache } from './PatternVariableCache.js';

/**
 * PrecomputedTokenStrings - Optimization for fast string generation during pattern matching
 *
 * Pre-computes all possible token substring combinations to eliminate expensive
 * slice().map().join() operations during variable resolution.
 *
 * Performance impact: 5-10x speedup in pattern matching by replacing
 * ~15,000 dynamic string operations with ~70 pre-computed Map lookups.
 */
class PrecomputedTokenStrings {
  constructor(semanticTokens, maxSpan = 10) {
    this.stringLookup = new Map();
    this.enabled = true;

    // Performance tracking
    this.stats = {
      totalPrecomputed: 0,
      totalLookups: 0,
      totalMisses: 0,
      precomputeTime: 0,
    };

    const startTime = performance.now();

    // Pre-compute all possible substrings
    for (let pos = 0; pos < semanticTokens.length; pos++) {
      for (let span = 1; span <= maxSpan; span++) {
        if (pos + span <= semanticTokens.length) {
          const key = `${pos}_${span}`;
          const value = semanticTokens
            .slice(pos, pos + span)
            .map((t) => t.value)
            .join('');
          this.stringLookup.set(key, value);
          this.stats.totalPrecomputed++;
        }
      }
    }

    this.stats.precomputeTime = performance.now() - startTime;
  }

  /**
   * Get pre-computed string for position and span
   * @param {number} position - Starting position
   * @param {number} span - Number of tokens to include
   * @returns {string|null} Pre-computed string or null if not available
   */
  getString(position, span) {
    if (!this.enabled) return null;

    this.stats.totalLookups++;
    const key = `${position}_${span}`;
    const value = this.stringLookup.get(key);
    if (value === undefined) {
      this.stats.totalMisses++;
      return null;
    }
    return value;
  }

  /**
   * Fallback to dynamic string generation (original method)
   * @param {Array} semanticTokens - Semantic tokens array
   * @param {number} position - Starting position
   * @param {number} span - Number of tokens
   * @returns {string} Dynamically generated string
   */
  static generateDynamic(semanticTokens, position, span) {
    return semanticTokens
      .slice(position, position + span)
      .map((t) => t.value)
      .join('');
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate:
        this.stats.totalLookups > 0
          ? (this.stats.totalLookups - this.stats.totalMisses || 0) / this.stats.totalLookups
          : 0,
    };
  }
}

export class SemanticPatternProcessor {
  constructor() {
    // Core pattern storage
    this.patterns = [];
    this.patternIndex = new Map(); // First token -> patterns for O(1) lookup
    this.variableCache = new Map(); // Pre-computed variable translations
    this.isInitialized = false;

    // WASM pattern processor state
    this.wasmAvailable = false;
    this.wasmInitialized = false;

    // Pre-computed string optimization
    this.precomputedStrings = null;
    this.enableStringOptimization = true; // Toggle for A/B testing

    // Statistics tracking
    this.stats = {
      totalMatches: 0,
      totalTime: 0,
      totalVariableResolutionTime: 0,
      totalTemplateBuildTime: 0,
      patternUsage: new Map(),
      cacheHits: 0,
      cacheMisses: 0,
      bottleneckPatterns: new Map(), // Pattern ID -> bottleneck score
      sessionStart: Date.now(),
      lastResetTime: Date.now(),
      // Pre-computation stats
      stringOptimization: {
        enabled: false,
        precomputeTime: 0,
        dynamicStringOps: 0,
        precomputedLookups: 0,
        speedupFactor: 0,
      },
    };
  }

  /**
   * Initialize patterns with semantic parsing and indexing
   * @param {Object} patternsDict - Pattern dictionary from patterns.json
   * @param {Object} options - Initialization options
   */
  async initializePatterns(patternsDict, options = {}) {
    this.patterns = [];
    this.patternIndex.clear();

    // Convert patterns to semantic pattern objects with metadata
    for (const [patternText, templateOrObject] of Object.entries(patternsDict)) {
      // Handle both string templates and object with metadata
      let template, allowedVariableTypes, allowAsPatternVariable, lowPriority;
      if (typeof templateOrObject === 'string') {
        template = templateOrObject;
        allowedVariableTypes = null;
        allowAsPatternVariable = false;
        lowPriority = false;
      } else {
        template = templateOrObject.translation || templateOrObject;
        allowedVariableTypes = templateOrObject.allowedVariableTypes;
        allowAsPatternVariable = templateOrObject.allowAsPatternVariable || false;
        lowPriority = templateOrObject.lowPriority || false;
      }

      const semanticPattern = this.parsePattern(
        patternText,
        template,
        allowedVariableTypes,
        allowAsPatternVariable,
        lowPriority
      );
      if (semanticPattern) {
        this.patterns.push(semanticPattern);
        this.indexPattern(semanticPattern);
      }
    }

    // Sort patterns by priority (metadata-driven instead of complex algorithm)
    this.patterns.sort((a, b) => {
      // Patterns with more variables take priority
      if (a.variables.length !== b.variables.length) {
        return b.variables.length - a.variables.length;
      }
      // Then by pattern length
      return b.tokens.length - a.tokens.length;
    });

    // Patterns are now ready for matching
    this.isInitialized = true;

    // Try to initialize WASM pattern processor alongside JavaScript version
    try {
      // Import reinitializeWasmPatternProcessor for dictionary reload support
      const { reinitializeWasmPatternProcessor } = await import('../wasm/WasmPatternProcessor.js');

      // Always reinitialize to pick up new patterns (fixes reload bug)
      this.wasmAvailable = await reinitializeWasmPatternProcessor(patternsDict);
      this.wasmInitialized = this.wasmAvailable;

      if (this.wasmAvailable) {
        this.log(options.debugLevel, 5, '✅ WASM pattern matching enabled (10-50x speedup)');
      } else {
        this.log(options.debugLevel, 5, '⚠️ WASM pattern matching unavailable, using JavaScript');
      }
    } catch (error) {
      logger.warn('Failed to initialize WASM pattern processor:', error);
      this.wasmAvailable = false;
      this.wasmInitialized = false;
    }

    this.log(
      options.debugLevel,
      5,
      `🔧 SemanticPatternProcessor initialized with ${this.patterns.length} patterns`
    );
  }

  /**
   * Parse a pattern into semantic components with metadata
   * @param {string} patternText - Pattern with variables (e.g., "这些X")
   * @param {string} template - Translation template (e.g., "những X này")
   * @param {Object} allowedVariableTypes - Optional variable type constraints
   * @param {boolean} allowAsPatternVariable - Whether pattern can be used as variable in hierarchical processing
   * @returns {Object} Semantic pattern object
   */
  parsePattern(
    patternText,
    template,
    allowedVariableTypes = null,
    allowAsPatternVariable = false,
    lowPriority = false
  ) {
    const tokens = [];
    const variables = [];

    // Parse pattern into literal and variable tokens
    for (let i = 0; i < patternText.length; i++) {
      const char = patternText[i];

      if (/[A-Z]/.test(char)) {
        // Variable token
        tokens.push({
          type: 'variable',
          name: char,
          position: i,
        });
        if (!variables.includes(char)) {
          variables.push(char);
        }
      } else {
        // Literal token
        tokens.push({
          type: 'literal',
          value: char,
          position: i,
        });
      }
    }

    // HIGH FIX: Validate that template contains all declared variables
    const missingVariables = [];
    for (const varName of variables) {
      if (!template.includes(varName)) {
        missingVariables.push(varName);
      }
    }

    if (missingVariables.length > 0) {
      logger.warn(
        `⚠️ Pattern template validation failed for "${patternText}":`,
        `Template "${template}" missing variables: ${missingVariables.join(', ')}`
      );
      logger.warn(
        'This pattern will produce incorrect translations. Please fix the pattern dictionary.'
      );
    }

    return {
      id: patternText,
      originalPattern: patternText,
      template: template,
      tokens: tokens,
      variables: variables,
      firstToken: tokens[0],
      allowAsPatternVariable: allowAsPatternVariable,
      lowPriority: lowPriority,
      priority: calculatePatternPriority(tokens, variables, lowPriority),
      metadata: {
        priority: calculatePatternPriority(tokens, variables, lowPriority),
        complexity: variables.length,
        length: tokens.length,
        allowedVariableTypes: allowedVariableTypes,
        lowPriority: lowPriority,
      },
      usage: {
        matchCount: 0,
        totalTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        variableResolutionTime: 0,
        templateBuildTime: 0,
        lastUsed: null,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
      },
    };
  }

  /**
   * Index pattern by first token for O(1) lookup performance
   *
   * Patterns are indexed by their first token to enable fast lookup during matching.
   * Variable-starting patterns go into a special '__VARIABLE__' index.
   *
   * @param {Object} pattern - Semantic pattern object with firstToken property
   */
  indexPattern(pattern) {
    const firstToken = pattern.firstToken;

    if (firstToken.type === 'literal') {
      const key = firstToken.value;
      if (!this.patternIndex.has(key)) {
        this.patternIndex.set(key, []);
      }
      this.patternIndex.get(key).push(pattern);
    } else {
      // Variable-starting patterns go in special index
      const key = '__VARIABLE__';
      if (!this.patternIndex.has(key)) {
        this.patternIndex.set(key, []);
      }
      this.patternIndex.get(key).push(pattern);
    }
  }

  /**
   * Pre-compute variable cache from tokens to eliminate async resolution
   * Enhanced for hierarchical pattern processing with Phase A results
   * @param {Token[]} tokens - All tokens with their translations
   * @param {Array} activeProperNouns - Active proper noun dictionaries
   * @param {Object} dictionaryManager - Dictionary manager instance
   * @param {Array} phaseAResults - Optional Phase A pattern results for enhanced variable resolution
   */
  buildVariableCache(tokens, activeProperNouns, dictionaryManager, phaseAResults = []) {
    // Phase A results seed the cache at lowest priority — shared stages 1–4 can overwrite them.
    const phaseAInitial = {};
    for (const phaseAResult of phaseAResults) {
      if (phaseAResult.originalText && phaseAResult.translation) {
        const variableTexts = this.extractVariableFromPhaseAResult(phaseAResult);
        for (const variableText of variableTexts) {
          phaseAInitial[variableText] = {
            translation: phaseAResult.translation,
            source: 'phaseA_pattern',
            type: 'structural_pattern',
            confidence: 'high',
            phaseAResult,
          };
        }
        phaseAInitial[phaseAResult.originalText] = {
          translation: phaseAResult.translation,
          source: 'phaseA_full_pattern',
          type: 'structural_pattern',
          confidence: 'high',
          phaseAResult,
        };
      }
    }

    const result = buildPatternVariableCache(
      tokens,
      { activeProperNouns, dictionaryManager, patterns: this.patterns },
      (source, word, meta) => this.classifyVariableType(source, word, meta),
      phaseAInitial
    );

    this.variableCache = new Map(Object.entries(result));

    const MAX_VARIABLE_CACHE_SIZE = 10000;
    if (this.variableCache.size > MAX_VARIABLE_CACHE_SIZE) {
      logger.warn(
        `⚠️ Variable cache size (${this.variableCache.size}) exceeded limit ${MAX_VARIABLE_CACHE_SIZE}, performance may degrade`
      );
    }
  }

  /**
   * Extract variable contents from Phase A pattern result.
   * Returns extracted text for each variable placeholder (X, Y) found in the pattern.
   * @param {Object} phaseAResult - Phase A pattern result
   * @returns {Array<string>} Variable texts substituted for X and/or Y (may be empty)
   */
  extractVariableFromPhaseAResult(phaseAResult) {
    const pattern = phaseAResult.pattern?.originalPattern;
    const matchedText = phaseAResult.originalText;

    if (!pattern || !matchedText) {
      return [];
    }

    const results = [];
    for (const varName of ['X', 'Y']) {
      if (!pattern.includes(varName)) continue;

      const varIndex = pattern.indexOf(varName);
      const prefix = pattern.substring(0, varIndex);
      const suffix = pattern.substring(varIndex + 1);

      let variableText = matchedText;
      if (prefix) {
        if (variableText.startsWith(prefix)) {
          variableText = variableText.substring(prefix.length);
        }
      }
      if (suffix) {
        if (variableText.endsWith(suffix)) {
          variableText = variableText.substring(0, variableText.length - suffix.length);
        }
      }

      const trimmed = variableText.trim();
      if (trimmed) results.push(trimmed);
    }

    return results;
  }

  /**
   * Classify variable type for metadata with enhanced semantic analysis
   *
   * Uses explicit semantic type from metadata if available, otherwise applies
   * heuristic-based classification. Variable types are used for pattern matching
   * constraints (e.g., allowedVariableTypes).
   *
   * @param {string} source - Translation source (e.g., 'properNoun_pattern_variable')
   * @param {string} word - The actual word for enhanced classification (default: '')
   * @param {Object} metadata - Dictionary metadata with optional semanticType field (default: {})
   * @returns {string} Variable type string used for allowedVariableTypes constraint matching.
   *
   * IMPORTANT: This method returns two distinct sets of strings:
   *
   * 1. **Canonical SemanticType values** (from SemanticTypes.ts) when `metadata.semanticType` is
   *    set or when heuristic classification succeeds:
   *    'character', 'location', 'organization', 'concept', 'object'
   *    These match the values stored in dictionary JSON and used in allowedVariableTypes constraints.
   *
   * 2. **Internal discriminator strings** returned only as heuristic fallbacks when no
   *    explicit semanticType exists. These are NOT canonical SemanticType values:
   *    - 'proper_noun' — generic proper noun without explicit type; TwoPhasePatternProcessor
   *      special-cases this to null (always include). See TwoPhasePatternProcessor.js shouldInclude().
   *    - 'character_unit' — character dictionary entry (individual hanzi, not a character name)
   *    - 'unknown' — no information available
   *
   *    Tokens classified as 'character_unit' or 'unknown' will FAIL allowedVariableTypes
   *    constraints that require canonical types (e.g. 'character'). This is intentional:
   *    untyped character-dictionary entries are not the same as named characters.
   */
  classifyVariableType(source, word = '', metadata = {}) {
    // Use explicit semantic type from dictionary metadata if available.
    // Returns a canonical SemanticType value ('character', 'location', etc.)
    if (metadata?.semanticType) {
      return metadata.semanticType;
    }

    // Enhanced classification based on source
    if (source?.includes('properNoun')) {
      // Try to infer semantic type from dictionary name for proper nouns
      if (source.includes('HarryPotter') || source.includes('DuongThan')) {
        return 'character'; // Character names from novel dictionaries (canonical)
      }

      // For generic proper nouns, try heuristic classification first
      if (word) {
        const heuristicType = this.getHeuristicType(word);
        if (heuristicType !== 'unknown') {
          return heuristicType; // Returns canonical type or 'unknown'
        }
      }

      // Internal discriminator: TwoPhasePatternProcessor maps this to null (always include)
      return 'proper_noun';
    }

    if (source?.includes('phrase')) {
      return 'concept'; // Canonical SemanticType
    }

    if (source?.includes('character')) {
      // Internal discriminator: individual hanzi, not a named character.
      // Fails 'character' allowedVariableTypes constraints intentionally.
      return 'character_unit';
    }

    // Heuristic-based classification for words without metadata
    if (word) {
      return this.getHeuristicType(word);
    }

    return 'unknown'; // Internal discriminator: no constraint matching
  }

  /**
   * Get semantic type based on heuristic analysis of Chinese words
   *
   * Uses common Chinese patterns to infer semantic type when explicit metadata
   * is unavailable. Checks for place indicators (市, 省, 国), person indicators
   * (common surnames), and concept indicators (法, 术, 道).
   *
   * @param {string} word - Chinese word to analyze
   * @returns {string} Inferred semantic type ('location', 'character', 'concept', 'unknown')
   */
  getHeuristicType(word) {
    if (!word) return 'unknown';

    // Enhanced heuristics based on common Chinese patterns
    // Place indicators
    if (
      word.includes('市') ||
      word.includes('省') ||
      word.includes('国') ||
      word.includes('县') ||
      word.includes('区') ||
      word.includes('镇') ||
      word.includes('村') ||
      word.includes('州') ||
      word.includes('府') ||
      word.endsWith('京') ||
      word.endsWith('海') ||
      word.endsWith('川')
    ) {
      return 'location';
    }

    // Person indicators
    if (
      word.length >= 2 &&
      /[人名姓李王张刘陈杨赵黄周吴徐孙胡朱高林何郭罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文]/.test(
        word
      )
    ) {
      return 'character';
    }

    // Object/concept indicators
    if (
      word.includes('法') ||
      word.includes('术') ||
      word.includes('道') ||
      word.includes('力') ||
      word.includes('功') ||
      word.includes('技')
    ) {
      return 'concept';
    }

    return 'unknown';
  }

  /**
   * Convert prioritized pattern to match result format expected by applyPatternMatch
   * @param {Object} prioritizedMatch - Prioritized pattern from conflict resolution
   * @param {Token[]} tokens - Array of tokens
   * @returns {Object} Match result in the format expected by applyPatternMatch
   */
  convertPrioritizedPatternToMatchResult(prioritizedMatch, tokens) {
    const pattern = prioritizedMatch.pattern;
    const startIndex = prioritizedMatch.startIndex;
    const endIndex = prioritizedMatch.endIndex;

    // Get the pattern template
    const template =
      pattern.template ||
      this.dictionaryManager?.translate(pattern.originalPattern, ['patterns'])?.translation;

    if (!template) {
      logger.warn(`No template found for pattern: ${pattern.originalPattern}`);
      return null;
    }

    const matchedTokens = [];
    let result = template;

    // Process each token and resolve variables using existing variable cache
    for (let i = startIndex; i <= endIndex; i++) {
      const tokenValue = tokens[i].value;
      matchedTokens.push({
        value: tokenValue,
        originalIndex: i,
      });

      // Check if this token is a variable (not a literal part of the pattern)
      if (!pattern.originalPattern.includes(tokenValue)) {
        // This is the variable - try to translate it using variable cache
        const translation = this.variableCache?.get(tokenValue);

        if (translation) {
          // Variable cache stores objects with .translation property
          const translatedValue =
            typeof translation === 'string' ? translation : translation.translation;
          result = result.replace('X', translatedValue || tokenValue);
        } else {
          result = result.replace('X', tokenValue);
        }
      }
    }

    return {
      success: true,
      pattern: pattern,
      variables: {},
      result: result,
      matchedTokens: matchedTokens,
      startPosition: startIndex,
      endPosition: endIndex,
      matchTime: 0,
    };
  }

  /**
   * Process specific patterns against tokens (used by hierarchical processor)
   * @param {Array} tokens - Token array to process
   * @param {Array} patterns - Specific patterns to process
   * @param {Object} options - Processing options with optional phaseAResults
   * @returns {Promise<Array>} Array of pattern match results
   */
  async processPatterns(tokens, patterns, options = {}) {
    // Initialize with provided patterns - preserve full pattern objects with metadata
    const patternsDict = {};
    for (const pattern of patterns) {
      // Preserve full pattern object including allowAsPatternVariable metadata
      patternsDict[pattern.originalPattern] = {
        translation: pattern.template || pattern.translation,
        allowAsPatternVariable: pattern.allowAsPatternVariable || false,
        allowedVariableTypes: pattern.allowedVariableTypes,
        lowPriority: pattern.lowPriority || false,
      };
    }

    await this.initializePatterns(patternsDict, options);

    // Build variable cache with Phase A results if provided
    const phaseAResults = options.phaseAResults || [];
    this.buildVariableCache(
      tokens,
      options.activeProperNouns || [],
      options.dictionaryManager,
      phaseAResults
    );

    // Collect pattern matches
    const results = [];
    const semanticTokens = this.getSemanticTokens(tokens);

    for (let i = 0; i < semanticTokens.length; i++) {
      // Skip tokens already consumed by patterns
      // BUT allow patterns to override Phase A protection if they are longer
      if (semanticTokens[i].translationSource === 'pattern_consumed') {
        continue;
      }

      const matchResult = this.findBestPatternMatch(semanticTokens, i, options);

      if (matchResult) {
        // Convert match result to the format expected by hierarchical processor
        const result = {
          startIndex: matchResult.matchedTokens[0].originalIndex,
          endIndex: matchResult.matchedTokens[matchResult.matchedTokens.length - 1].originalIndex,
          originalText: matchResult.matchedTokens.map((t) => t.value).join(''),
          translation: matchResult.result,
          pattern: matchResult.pattern,
          originalPattern: matchResult.pattern, // Add this for debugging
          confidence: this.calculateMatchConfidence(matchResult),
          translationSource: 'pattern',
          variables: matchResult.variables,
        };

        results.push(result);

        // Mark follower tokens (index 1+) as consumed to prevent overlap.
        // CONSUMED TOKEN CONTRACT: both fields must be set together so that any code path
        // (including postProcess on exception) sees a contract-compliant state.
        // The leader (index 0) is intentionally NOT marked here — applyPatternMatch sets
        // its final translated/translationSource. Marking it consumed prematurely would
        // create a transient contract violation (non-_consumed source with null translated).
        for (let idx = 1; idx < matchResult.matchedTokens.length; idx++) {
          const tokenIndex = matchResult.matchedTokens[idx].originalIndex;
          if (tokens[tokenIndex]) {
            tokens[tokenIndex].translationSource = 'pattern_consumed';
            tokens[tokenIndex].translated = null; // Direction A: consumed source → translated must be null
          }
        }

        // Skip processed tokens
        const tokensProcessed = matchResult.endPosition - matchResult.startPosition + 1;
        i += tokensProcessed - 1;
      }
    }

    return results;
  }

  /**
   * Calculate confidence score for a pattern match
   * @param {Object} matchResult - Pattern match result
   * @returns {number} Confidence score (0-1)
   */
  calculateMatchConfidence(matchResult) {
    let confidence = 0.8; // Base confidence for successful pattern match

    // Bonus for patterns with multiple variables (more context)
    if (matchResult.pattern.variables.length > 1) {
      confidence += 0.1;
    }

    // Bonus for longer patterns (more specific)
    if (matchResult.pattern.tokens.length > 3) {
      confidence += 0.05;
    }

    // Bonus for cached variable resolution (known translations)
    const cacheHitRatio =
      matchResult.pattern.usage.cacheHits /
      Math.max(1, matchResult.pattern.usage.cacheHits + matchResult.pattern.usage.cacheMisses);
    confidence += cacheHitRatio * 0.05;

    return Math.min(1, confidence);
  }

  /**
   * Process pattern matching for tokens using unified semantic approach
   * @param {Token[]} tokens - Array of tokens to process
   * @param {Object} options - Processing options
   */
  async processTokens(tokens, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SemanticPatternProcessor not initialized');
    }

    const debugLevel = options.debugLevel || 3; // TEMP: Enable debug for pattern investigation
    const prioritizedPatterns = options.prioritizedPatterns || [];
    /** @type {import('../../types/PatternProcessingTypes').PatternProcessorResult[]} */
    const results = [];
    const consumedOriginalIndices = new Set();

    this.log(debugLevel, 5, '🔍 Starting semantic pattern matching');

    // Process prioritized patterns first — collect as results, do not mutate tokens
    if (prioritizedPatterns.length > 0) {
      this.log(
        debugLevel,
        5,
        `🎯 Processing ${prioritizedPatterns.length} prioritized patterns first`
      );

      for (const prioritizedMatch of prioritizedPatterns) {
        this.log(
          debugLevel,
          5,
          `🎯 Applying prioritized pattern: "${prioritizedMatch.pattern.originalPattern}"`
        );
        const matchResult = this.convertPrioritizedPatternToMatchResult(prioritizedMatch, tokens);
        if (!matchResult) continue;
        const startIndex = matchResult.matchedTokens[0].originalIndex;
        const endIndex =
          matchResult.matchedTokens[matchResult.matchedTokens.length - 1].originalIndex;
        results.push({
          startIndex,
          endIndex,
          originalText: matchResult.matchedTokens.map((t) => t.value).join(''),
          translation: matchResult.result,
          translationSource: 'pattern',
          semanticType: matchResult.pattern?.metadata?.semanticType ?? null,
          pattern: matchResult.pattern,
          type: 'simple',
        });
        for (let idx = startIndex; idx <= endIndex; idx++) consumedOriginalIndices.add(idx);
        this.stats.totalMatches++;
      }
    }

    // Get semantic tokens (Chinese characters/words only)
    const semanticTokens = this.getSemanticTokens(tokens);

    // Initialize pre-computed strings optimization
    if (this.enableStringOptimization && semanticTokens.length > 5) {
      // CRITICAL FIX: Clear previous instance to prevent memory leak
      if (this.precomputedStrings) {
        if (this.precomputedStrings.stringLookup) {
          this.precomputedStrings.stringLookup.clear();
        }
        if (this.precomputedStrings.clear) {
          this.precomputedStrings.clear();
        }
        this.precomputedStrings = null;
      }

      const precomputeStart = performance.now();

      // Try WASM string processor first (5-15x faster)
      let useWasm = false;
      try {
        const wasmSuccess = await wasmStringProcessor.buildCache(semanticTokens);
        if (wasmSuccess) {
          this.precomputedStrings = wasmStringProcessor;
          this.usingWasm = true;
          useWasm = true;

          const stats = wasmStringProcessor.getStats();
          this.log(
            debugLevel,
            5,
            `⚡ WASM: Pre-computed ${stats.cacheSize} strings in ${(performance.now() - precomputeStart).toFixed(2)}ms (${(stats.memoryBytes / 1024).toFixed(1)}KB)`
          );
        }
      } catch (error) {
        logger.warn('⚠️ WASM string processor failed, falling back to JavaScript:', error);
      }

      // Fallback to JavaScript PrecomputedTokenStrings
      if (!useWasm) {
        this.precomputedStrings = new PrecomputedTokenStrings(semanticTokens);
        this.usingWasm = false;

        this.log(
          debugLevel,
          5,
          `⚡ JS: Pre-computed ${this.precomputedStrings.stats.totalPrecomputed} strings in ${(performance.now() - precomputeStart).toFixed(2)}ms`
        );
      }

      const precomputeTime = performance.now() - precomputeStart;
      this.stats.stringOptimization.enabled = true;
      this.stats.stringOptimization.precomputeTime += precomputeTime;
    } else {
      // CRITICAL FIX: Clear existing instance when optimization disabled
      if (this.precomputedStrings) {
        if (this.precomputedStrings.stringLookup) {
          this.precomputedStrings.stringLookup.clear();
        }
        if (this.precomputedStrings.clear) {
          this.precomputedStrings.clear();
        }
      }
      this.precomputedStrings = null;
      this.usingWasm = false;
      this.stats.stringOptimization.enabled = false;
    }

    this.log(
      debugLevel,
      5,
      `🔍 Processing ${semanticTokens.length} semantic tokens:`,
      semanticTokens.map((t) => `"${t.value}"`).join(', ')
    );

    // MEDIUM FIX: Add timeout protection to prevent pathological patterns from blocking indefinitely
    const MAX_PATTERN_PROCESSING_TIME = 5000; // 5 seconds
    const patternProcessingStartTime = performance.now();

    // Process each semantic position for pattern matches
    for (let i = 0; i < semanticTokens.length; i++) {
      // Check timeout
      if (performance.now() - patternProcessingStartTime > MAX_PATTERN_PROCESSING_TIME) {
        logger.error(
          `⚠️ Pattern processing timeout after ${MAX_PATTERN_PROCESSING_TIME}ms, aborting at position ${i}/${semanticTokens.length}`
        );
        logger.error('This may indicate pathological patterns or extremely long input text');
        break;
      }

      // Skip tokens consumed by prioritized patterns or earlier iterations
      if (consumedOriginalIndices.has(semanticTokens[i].originalIndex)) {
        continue;
      }

      const matchResult = this.findBestPatternMatch(semanticTokens, i, options);

      if (matchResult) {
        this.log(
          debugLevel,
          5,
          `🎯 Pattern matched: "${matchResult.pattern.originalPattern}" -> "${matchResult.result}"`
        );

        const startIndex = matchResult.matchedTokens[0].originalIndex;
        const endIndex =
          matchResult.matchedTokens[matchResult.matchedTokens.length - 1].originalIndex;
        results.push({
          startIndex,
          endIndex,
          originalText: matchResult.matchedTokens.map((t) => t.value).join(''),
          translation: matchResult.result,
          translationSource: 'pattern',
          semanticType: matchResult.pattern?.metadata?.semanticType ?? null,
          pattern: matchResult.pattern,
          type: 'simple',
        });
        for (let idx = startIndex; idx <= endIndex; idx++) consumedOriginalIndices.add(idx);
        this.stats.totalMatches++;

        // Skip ahead past consumed tokens (semantic positions)
        const tokensProcessed = matchResult.endPosition - matchResult.startPosition + 1;
        i += tokensProcessed - 1; // -1 because loop will increment
      }
    }

    return results;

    // Calculate and log performance metrics for the optimization
    if (this.stats.stringOptimization.enabled && this.precomputedStrings) {
      const _precomputedStats = this.precomputedStrings.getStats();
      const totalStringOps =
        this.stats.stringOptimization.precomputedLookups +
        this.stats.stringOptimization.dynamicStringOps;
      const optimizationRate =
        totalStringOps > 0
          ? (this.stats.stringOptimization.precomputedLookups / totalStringOps) * 100
          : 0;

      // Estimate speedup: pre-computed lookup ~0.001ms vs dynamic generation ~0.1ms
      const estimatedSpeedup =
        totalStringOps > 0
          ? (this.stats.stringOptimization.dynamicStringOps * 0.1 +
              this.stats.stringOptimization.precomputedLookups * 0.001) /
            (totalStringOps * 0.1)
          : 1;

      this.stats.stringOptimization.speedupFactor = 1 / estimatedSpeedup;

      this.log(
        debugLevel,
        5,
        `⚡ String optimization: ${optimizationRate.toFixed(1)}% lookups pre-computed (${this.stats.stringOptimization.precomputedLookups}/${totalStringOps}), estimated ${this.stats.stringOptimization.speedupFactor.toFixed(1)}x speedup`
      );
    }

    this.log(debugLevel, 5, '✅ Semantic pattern matching completed');
  }

  /**
   * Extract semantic tokens (Chinese characters/words only)
   * @param {Token[]} tokens - All tokens
   * @returns {Array} Semantic tokens with position tracking
   */
  getSemanticTokens(tokens) {
    const semanticTokens = [];
    let pendingBoundary = false;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip grouped followers and non-Chinese tokens
      if (token.isGrouped && token.groupLeader !== null) {
        continue;
      }

      if (
        token.type === 'chinese_char' ||
        token.type === 'chinese_word' ||
        token.type === 'latin_word' ||
        token.type === 'number'
      ) {
        semanticTokens.push({
          ...token,
          originalIndex: i,
          hasPrecedingBoundary: pendingBoundary,
        });
        pendingBoundary = false;
      } else if (semanticTokens.length > 0) {
        // Non-semantic token (punctuation, whitespace, etc.) — marks a boundary
        // before the next semantic token. Grouped followers are already skipped above.
        pendingBoundary = true;
      }
    }

    return semanticTokens;
  }

  /**
   * Find the best pattern match at a specific position using indexed lookup
   * @param {Array} semanticTokens - Semantic tokens array
   * @param {number} position - Starting position
   * @param {Object} options - Matching options
   * @returns {Object|null} Best match result or null
   */
  findBestPatternMatch(semanticTokens, position, options) {
    const firstToken = semanticTokens[position];
    if (!firstToken) return null;

    const debugLevel = options.debugLevel || 3; // TEMP: Enable debug for pattern investigation

    // Use traditional O(1) lookup for reliable pattern matching
    // Trie optimization temporarily disabled due to traversal complexity
    const candidatePatterns = [
      ...(this.patternIndex.get(firstToken.value) || []),
      ...(this.patternIndex.get('__VARIABLE__') || []),
    ];

    // Only log candidate counts at very high debug level to avoid console spam
    this.log(
      debugLevel,
      5,
      `🔍 Found ${candidatePatterns.length} candidates for "${firstToken.value}"`
    );

    // Test candidate patterns at current position

    let bestMatch = null;
    let bestPriority = -1;

    // Test each candidate pattern
    for (const pattern of candidatePatterns) {
      const matchResult = this.testPatternMatch(pattern, semanticTokens, position, options);

      // Only log successful matches to reduce noise
      if (matchResult.success) {
        if (debugLevel >= 6) {
          this.log(
            debugLevel,
            6,
            `✅ Pattern MATCH: "${pattern.originalPattern}" (priority: ${pattern.metadata.priority}, lowPriority: ${pattern.metadata.lowPriority})`
          );
        }
      }

      if (matchResult.success) {
        const matchLen = matchResult.matchedTokens.length;
        const bestLen = bestMatch?.matchedTokens.length ?? -1;
        const varCount = pattern.variables.length;
        const bestVarCount = bestMatch?.pattern?.variables?.length ?? Infinity;
        if (
          matchLen > bestLen ||
          (matchLen === bestLen && varCount < bestVarCount) ||
          (matchLen === bestLen &&
            varCount === bestVarCount &&
            pattern.metadata.priority > bestPriority)
        ) {
          bestMatch = matchResult;
          bestPriority = pattern.metadata.priority;
        }
      }
    }

    if (bestMatch && debugLevel >= 6) {
      this.log(
        debugLevel,
        6,
        `🏆 WINNER: "${bestMatch.pattern.originalPattern}" (priority: ${bestMatch.pattern.metadata.priority})`
      );
    }

    return bestMatch;
  }

  /**
   * Test if a specific pattern matches at a position
   *
   * This is the core pattern matching algorithm that handles:
   * - Literal token matching (single and multi-character sequences)
   * - Variable resolution with multi-token support (up to 10 tokens)
   * - Phase A override detection (longer patterns win)
   * - Semantic type validation for pattern variables
   *
   * @param {Object} pattern - Semantic pattern object
   * @param {Array} semanticTokens - Semantic tokens
   * @param {number} position - Starting position
   * @param {Object} options - Test options
   * @returns {Object} Match result with success, variables, matchedTokens
   *
   * @example
   * // Simple single-variable pattern
   * pattern: "这些X"
   * tokens: ["这", "些", "人"]
   * → SUCCESS: variables = {X: "người"}, matchedTokens = 3
   *
   * @example
   * // Multi-token variable resolution
   * pattern: "在X眼中"
   * tokens: ["在", "那些", "魔帅", "眼", "中"]
   * → SUCCESS: variables = {X: "những ma soái kia"}, matchedTokens = 5
   * → X resolved to 2 tokens: "那些" + "魔帅"
   *
   * @example
   * // Phase A override - longer pattern wins
   * pattern: "在X眼中" (5 chars matched)
   * tokens: ["在", "那些", "眼", "中"] (Phase A already matched "那些")
   * → FAILURE: Phase A match is longer, prevent shorter override
   *
   * @example
   * // Multi-character literal grouping
   * pattern: "不知道" (stored as 3 literal tokens)
   * tokens: ["不知道"] (semantic token grouped as single unit)
   * → SUCCESS: consecutive literals match grouped semantic token
   *
   * @example
   * // Variable type validation
   * pattern: "X的Y" with allowedVariableTypes: {X: ['proper-noun']}
   * tokens: ["那些", "的", "人"] (X="那些" is phrase, not proper-noun)
   * → FAILURE: Variable type 'phrase' not allowed for X
   */
  testPatternMatch(pattern, semanticTokens, position, _options) {
    const startTime = performance.now();

    const variables = {};
    const matchedTokens = [];
    let currentPosition = position;

    // Test pattern tokens against semantic tokens

    // Test each pattern token against semantic tokens
    for (let i = 0; i < pattern.tokens.length; i++) {
      const patternToken = pattern.tokens[i];

      // Check if we have a semantic token at the current position
      if (currentPosition >= semanticTokens.length) {
        return { success: false };
      }

      const semanticToken = semanticTokens[currentPosition];

      if (patternToken.type === 'literal') {
        // Literal match - handle both single character and multi-character grouped tokens

        // First try exact match (single character case)
        if (semanticToken.value === patternToken.value) {
          matchedTokens.push(semanticToken);
          currentPosition++;
          // Literal token matched
        } else {
          // Try multi-character literal sequence matching
          // Look ahead to see if consecutive literal tokens can match this semantic token
          let literalSequence = patternToken.value;
          let lookaheadPos = i + 1;

          // Collect consecutive literal tokens
          while (
            lookaheadPos < pattern.tokens.length &&
            pattern.tokens[lookaheadPos].type === 'literal'
          ) {
            literalSequence += pattern.tokens[lookaheadPos].value;
            lookaheadPos++;
          }

          // Accumulate semantic tokens until their concat equals literalSequence.
          // Handles both: many pattern literals → one semantic token (身+体 → 身体)
          // and: many pattern literals → many semantic tokens (手+腕+上 → 手腕, 上).
          // Mirrors Rust matcher.rs literal grouping fallback (lines 478–508).
          let running = '';
          let semConsumed = 0;
          let grouped = false;
          while (currentPosition + semConsumed < semanticTokens.length) {
            running += semanticTokens[currentPosition + semConsumed].value;
            semConsumed++;
            if (running === literalSequence) {
              grouped = true;
              break;
            }
            if (running.length >= literalSequence.length) break;
          }
          if (grouped) {
            for (let k = 0; k < semConsumed; k++) {
              matchedTokens.push(semanticTokens[currentPosition + k]);
            }
            currentPosition += semConsumed;
            i = lookaheadPos - 1; // -1 because loop will increment
          } else {
            return { success: false };
          }
        }
      } else if (patternToken.type === 'variable') {
        // Reject if punctuation/whitespace boundary between last literal and this variable
        if (semanticToken.hasPrecedingBoundary) {
          return { success: false };
        }

        // Variable match using cache - try longest match first WITH backtracking support
        const varResolveStart = performance.now();
        let cachedTranslation = null;
        let tokenSpan = 0;
        let candidateSpans = []; // Store all valid spans for backtracking

        // ENHANCED: Collect ALL possible variable resolutions for backtracking
        // If subsequent pattern tokens don't match, we can try shorter variable spans
        {
          const maxSpan = Math.min(semanticTokens.length - currentPosition, 10); // Reasonable limit
          for (let span = maxSpan; span >= 1; span--) {
            let multiTokenValue;

            // OPTIMIZATION: Use pre-computed strings when available
            if (this.precomputedStrings) {
              multiTokenValue = this.precomputedStrings.getString(currentPosition, span);
              this.stats.stringOptimization.precomputedLookups++;
            }

            // Fallback to dynamic generation if pre-computation unavailable
            if (!multiTokenValue) {
              multiTokenValue = PrecomputedTokenStrings.generateDynamic(
                semanticTokens,
                currentPosition,
                span
              );
              this.stats.stringOptimization.dynamicStringOps++;
            }

            const translation = this.variableCache.get(multiTokenValue);
            if (translation) {
              candidateSpans.push({ span, translation, text: multiTokenValue });
            }
          }
        }

        const varResolveTime = performance.now() - varResolveStart;
        pattern.usage.variableResolutionTime += varResolveTime;
        this.stats.totalVariableResolutionTime += varResolveTime;

        if (candidateSpans.length === 0) {
          pattern.usage.cacheMisses++;
          this.stats.cacheMisses++;
          return { success: false };
        }

        // Try candidate spans from longest to shortest with look-ahead verification
        let validSpan = null;
        for (const candidate of candidateSpans) {
          // Check if there are more pattern tokens after this variable
          const hasMorePatternTokens = i + 1 < pattern.tokens.length;

          if (hasMorePatternTokens) {
            // Look ahead: verify that the next pattern token can match after consuming this variable span
            const nextPatternToken = pattern.tokens[i + 1];
            const nextPosition = currentPosition + candidate.span;

            if (nextPosition >= semanticTokens.length) {
              // Not enough tokens remaining - try shorter span
              continue;
            }

            const nextSemanticToken = semanticTokens[nextPosition];

            // Verify next literal token match (only check if it's a literal)
            if (nextPatternToken.type === 'literal') {
              // Check if next literal matches
              if (nextSemanticToken.value === nextPatternToken.value) {
                validSpan = candidate;
                break; // Found valid span with matching next literal
              } else {
                // Try building literal sequence for multi-character matching
                let literalSequence = nextPatternToken.value;
                let lookahead = i + 2;
                while (
                  lookahead < pattern.tokens.length &&
                  pattern.tokens[lookahead].type === 'literal'
                ) {
                  literalSequence += pattern.tokens[lookahead].value;
                  lookahead++;
                }

                if (nextSemanticToken.value === literalSequence) {
                  validSpan = candidate;
                  break; // Found valid span with matching literal sequence
                }
                // Next literal doesn't match - try shorter variable span
                continue;
              }
            } else {
              // Next token is another variable — do NOT break here.
              // Keep iterating to find the SHORTEST valid span for this variable,
              // matching Rust resolve_variable_with_lookahead behavior.
              // Taking the longest span greedily exhausts tokens the following
              // variable needs, causing the whole pattern to fail silently.
              // candidateSpans is ordered longest→shortest, so overwriting
              // validSpan on each iteration leaves the shortest cache-hit span.
              validSpan = candidate;
              // intentionally no break
            }
          } else {
            // No more pattern tokens - use longest available span
            validSpan = candidate;
            break;
          }
        }

        if (!validSpan) {
          // No valid span found even with backtracking
          pattern.usage.cacheMisses++;
          this.stats.cacheMisses++;
          return {
            success: false,
            reason: 'Variable resolution failed: subsequent pattern tokens cannot match',
          };
        }

        cachedTranslation = validSpan.translation;
        tokenSpan = validSpan.span;

        // SEMANTIC TYPE VALIDATION: Check if variable type is allowed for this pattern
        if (
          pattern.metadata.allowedVariableTypes &&
          pattern.metadata.allowedVariableTypes[patternToken.name]
        ) {
          const allowedTypes = pattern.metadata.allowedVariableTypes[patternToken.name];

          // MEDIUM-7 FIX: Validate allowedTypes is an array before using it
          if (!Array.isArray(allowedTypes)) {
            logger.warn(
              `Invalid allowedTypes for variable ${patternToken.name}: not an array (got ${typeof allowedTypes})`
            );
            pattern.usage.cacheMisses++;
            this.stats.cacheMisses++;
            return {
              success: false,
              reason: `Invalid pattern configuration: allowedTypes must be an array for variable ${patternToken.name}`,
            };
          }

          const variableType = cachedTranslation.type || 'unknown';

          if (!allowedTypes.includes(variableType)) {
            // Variable type not allowed for this pattern - pattern match fails
            pattern.usage.cacheMisses++;
            this.stats.cacheMisses++;
            return {
              success: false,
              reason: `Variable type '${variableType}' not allowed for ${patternToken.name} in pattern '${pattern.originalPattern}'. Allowed: [${allowedTypes.join(', ')}]`,
            };
          }
        }

        variables[patternToken.name] = cachedTranslation.translation;
        pattern.usage.cacheHits++;
        this.stats.cacheHits++;

        // Add all matched tokens to the result (only if we consumed tokens from current position)
        if (tokenSpan > 0) {
          for (let j = 0; j < tokenSpan; j++) {
            matchedTokens.push(semanticTokens[currentPosition + j]);
          }
          // Advance the current position by the number of tokens consumed
          currentPosition += tokenSpan;
        }
        // If tokenSpan = 0, we used a cached variable without consuming tokens from current position
      } else {
        matchedTokens.push(semanticToken);
        currentPosition++;
      }
    }

    // Build result using template
    const templateBuildStart = performance.now();
    const result = this.buildResult(pattern.template, variables);
    const templateBuildTime = performance.now() - templateBuildStart;
    pattern.usage.templateBuildTime += templateBuildTime;
    this.stats.totalTemplateBuildTime += templateBuildTime;

    // Update statistics
    const matchTime = performance.now() - startTime;
    pattern.usage.matchCount++;
    pattern.usage.totalTime += matchTime;
    pattern.usage.lastUsed = Date.now();

    // Update min/max timing and average
    pattern.usage.minTime = Math.min(pattern.usage.minTime, matchTime);
    pattern.usage.maxTime = Math.max(pattern.usage.maxTime, matchTime);
    pattern.usage.avgTime = pattern.usage.totalTime / pattern.usage.matchCount;

    // Update bottleneck tracking (patterns taking >5ms average are potential bottlenecks)
    if (pattern.usage.avgTime > 5 && pattern.usage.matchCount >= 5) {
      const bottleneckScore = pattern.usage.avgTime * pattern.usage.matchCount;
      this.stats.bottleneckPatterns.set(pattern.originalPattern, bottleneckScore);
    }

    // CHECK FOR PHASE A OVERRIDE: If this pattern spans tokens protected by Phase A,
    // check if this pattern is longer than the Phase A pattern(s) it would override
    let hasPhaseAProtection = false;

    for (let i = position; i < currentPosition; i++) {
      if (semanticTokens[i].protectedByPhaseA) {
        hasPhaseAProtection = true;
        break;
      }
    }

    // If this pattern overlaps with Phase A protection, only allow it if it's longer
    if (hasPhaseAProtection) {
      // For hierarchical composition, compare the full matched text character length
      const currentMatchedText = matchedTokens.map((t) => t.value).join('');
      const currentMatchedTextLength = currentMatchedText.length;
      let maxPhaseAMatchedLength = 0;

      for (let i = position; i < currentPosition; i++) {
        const token = semanticTokens[i];
        if (token.protectedByPhaseA && token.phaseAResult && token.phaseAResult.originalText) {
          const phaseAMatchLength = token.phaseAResult.originalText.length;
          maxPhaseAMatchedLength = Math.max(maxPhaseAMatchedLength, phaseAMatchLength);
        }
      }

      if (currentMatchedTextLength <= maxPhaseAMatchedLength) {
        // This pattern match is not longer than the Phase A match(es) it would override
        // Don't allow this match to prevent shorter matches from overriding longer ones
        return { success: false, reason: 'Phase A match is longer or equal length' };
      }
      // Pattern match is longer than Phase A - allow the override for hierarchical composition
    }

    return {
      success: true,
      pattern: pattern,
      variables: variables,
      result: result,
      matchedTokens: matchedTokens,
      startPosition: position,
      endPosition: currentPosition - 1,
      matchTime: matchTime,
    };
  }

  /**
   * Build result string from template and variables
   * @param {string} template - Template string with variables
   * @param {Object} variables - Variable name to translation mapping
   * @returns {string} Final result
   */
  buildResult(template, variables) {
    let result = template;
    const placeholders = {};
    let placeholderIndex = 0;

    // Replace variables with placeholders to avoid collision
    for (const [varName, translation] of Object.entries(variables)) {
      const placeholder = `__PLACEHOLDER_${placeholderIndex++}__`;
      placeholders[placeholder] = translation;
      result = result.replace(new RegExp(varName, 'g'), placeholder);
    }

    // Replace placeholders with translations
    for (const [placeholder, translation] of Object.entries(placeholders)) {
      result = result.replace(new RegExp(placeholder, 'g'), translation);
    }

    return result;
  }

  /**
   * Get debug information about pattern processor performance
   * @returns {Object} Debug statistics
   */
  getDebugInfo() {
    const sessionDuration = Date.now() - this.stats.sessionStart;
    const totalCacheAttempts = this.stats.cacheHits + this.stats.cacheMisses;
    const bottleneckPatterns = Array.from(this.stats.bottleneckPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      // Basic metrics
      patternsLoaded: this.patterns.length,
      indexSize: this.patternIndex.size,
      cacheSize: this.variableCache.size,

      // Performance metrics
      totalMatches: this.stats.totalMatches,
      sessionDurationMs: sessionDuration,
      matchesPerSecond: this.stats.totalMatches / Math.max(sessionDuration / 1000, 0.001),

      // Cache performance
      cacheHitRate:
        totalCacheAttempts > 0
          ? ((this.stats.cacheHits / totalCacheAttempts) * 100).toFixed(1) + '%'
          : '0%',
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,

      // Timing breakdown
      avgVariableResolutionTime:
        this.stats.totalMatches > 0
          ? (this.stats.totalVariableResolutionTime / this.stats.totalMatches).toFixed(3) + 'ms'
          : '0ms',
      avgTemplateBuildTime:
        this.stats.totalMatches > 0
          ? (this.stats.totalTemplateBuildTime / this.stats.totalMatches).toFixed(3) + 'ms'
          : '0ms',

      // Pattern performance analysis
      topPatterns: this.patterns
        .filter((p) => p.usage.matchCount > 0)
        .sort((a, b) => b.usage.matchCount - a.usage.matchCount)
        .slice(0, 5)
        .map((p) => ({
          pattern: p.originalPattern,
          matches: p.usage.matchCount,
          avgTime: p.usage.avgTime.toFixed(3) + 'ms',
          minTime: p.usage.minTime.toFixed(3) + 'ms',
          maxTime: p.usage.maxTime.toFixed(3) + 'ms',
          cacheHitRate:
            p.usage.cacheHits + p.usage.cacheMisses > 0
              ? ((p.usage.cacheHits / (p.usage.cacheHits + p.usage.cacheMisses)) * 100).toFixed(1) +
                '%'
              : '0%',
          lastUsed: p.usage.lastUsed ? new Date(p.usage.lastUsed).toLocaleTimeString() : 'Never',
        })),

      // Bottleneck identification
      bottleneckPatterns: bottleneckPatterns.map(([pattern, score]) => ({
        pattern: pattern,
        bottleneckScore: score.toFixed(2),
        recommendation: score > 50 ? 'Consider optimization' : 'Monitor performance',
      })),

      // Memory usage estimation
      estimatedMemoryUsage: {
        patternsKB: Math.round(this.patterns.length * 0.5), // Rough estimate
        cacheKB: Math.round(this.variableCache.size * 0.1),
        indexKB: Math.round(this.patternIndex.size * 0.05),
      },
    };
  }

  /**
   * Reset performance statistics (useful for benchmarking)
   */
  resetStats() {
    this.stats = {
      totalMatches: 0,
      totalTime: 0,
      totalVariableResolutionTime: 0,
      totalTemplateBuildTime: 0,
      patternUsage: new Map(),
      cacheHits: 0,
      cacheMisses: 0,
      bottleneckPatterns: new Map(),
      sessionStart: Date.now(),
      lastResetTime: Date.now(),
    };

    // Reset individual pattern statistics
    this.patterns.forEach((pattern) => {
      pattern.usage = {
        matchCount: 0,
        totalTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        variableResolutionTime: 0,
        templateBuildTime: 0,
        lastUsed: null,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
      };
    });
  }

  /**
   * Log debug message if debug level is sufficient
   * @param {number} debugLevel - Current debug level
   * @param {number} requiredLevel - Required level for this message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  log(debugLevel, requiredLevel, message, data = null) {
    if (debugLevel >= requiredLevel) {
      // Only log in development for performance
      if (process.env.NODE_ENV === 'development') {
        if (data !== null) {
          logger.log(message, data);
        } else {
          logger.log(message);
        }
      }
    }
  }

  /**
   * Toggle the string pre-computation optimization
   * @param {boolean} enabled - Whether to enable the optimization
   */
  setStringOptimization(enabled) {
    this.enableStringOptimization = enabled;
    logger.log(`⚡ String pre-computation optimization ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Get performance statistics including optimization metrics
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    return {
      ...this.stats,
      stringOptimization: {
        ...this.stats.stringOptimization,
        efficiency:
          this.stats.stringOptimization.precomputedLookups +
            this.stats.stringOptimization.dynamicStringOps >
          0
            ? (this.stats.stringOptimization.precomputedLookups /
                (this.stats.stringOptimization.precomputedLookups +
                  this.stats.stringOptimization.dynamicStringOps)) *
              100
            : 0,
      },
    };
  }
}
