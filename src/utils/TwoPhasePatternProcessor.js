import PatternAnalyzer from './PatternAnalyzer.js';
import {
  processTokensWasm,
  isWasmPatternProcessorAvailable
} from './WasmPatternProcessor.js';

/**
 * TwoPhasePatternProcessor - Rust WASM-accelerated hierarchical pattern processing
 *
 * Implements two-phase pattern matching using Rust WASM (10-50x speedup):
 * - Phase A: Process patterns with allowAsPatternVariable: true
 * - Phase B: Process all patterns, using Phase A results as enhanced variables
 * - Composite Detection: Identify when Phase A results can be absorbed into Phase B patterns
 * - Decision Engine: Select optimal translation from all candidates
 *
 * JavaScript fallback removed after parity verification (January 2025)
 * Requires WASM initialization - will throw error if WASM unavailable
 *
 * @import {
 *   SemanticPattern,
 *   PhaseAResult,
 *   PhaseBResult,
 *   CompositePatternResult,
 *   PatternMatchResult,
 *   PatternProcessingOptions,
 *   TwoPhasePatternProcessorConfig,
 *   PatternCategorizationResult,
 *   PhaseProcessingStats,
 *   DecisionEngineResult
 * } from '../types/PatternProcessingTypes'
 */
class TwoPhasePatternProcessor {
  constructor(patterns, options = {}) {
    this.analyzer = new PatternAnalyzer();
    this.options = {
      maxCompositeDetectionTime: 100, // ms
      enableFallback: true,
      debugMode: false,
      enableWasm: true, // Enable WASM acceleration by default
      ...options
    };

    // Analyze and categorize patterns
    this.processedPatterns = this.analyzer.analyzePatterns(patterns);
    this.categorizePatterns();

    // TwoPhasePatternProcessor initialized successfully
  }
  
  /**
   * Categorize patterns into processing phases
   */
  categorizePatterns() {
    // Phase A: Patterns that can serve as variables for other patterns
    this.variablePatterns = this.processedPatterns.filter(p => p.allowAsPatternVariable === true);

    // Phase B eligible: Patterns that can use composite variables (single-variable only)
    this.compositeEligiblePatterns = this.processedPatterns.filter(p => p.compositeEligible);

    // All patterns for comprehensive processing
    this.allPatterns = this.processedPatterns;

    // Pattern categorization completed
  }

  /**
   * Extract semantic tokens (Chinese characters/words only) with originalIndex
   * Matches the format expected by WASM pattern processor
   * @param {Array} tokens - Full token array
   * @returns {Array} Semantic tokens with originalIndex field
   */
  extractSemanticTokens(tokens) {
    const semanticTokens = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip grouped followers and non-Chinese tokens
      if (token.isGrouped && token.groupLeader !== null) {
        continue;
      }

      if (token.type === 'chinese_char' || token.type === 'chinese_word') {
        semanticTokens.push({
          ...token,
          originalIndex: i
        });
      }
    }

    return semanticTokens;
  }

  /**
   * Build variable cache from already-translated tokens and dictionaries
   * Simplified version for WASM - extracts variables from:
   * 1. Already-translated proper noun tokens
   * 2. Dictionary lookups for proper nouns and phrases
   * 3. Full-text scanning for multi-character proper nouns
   * @param {Array} tokens - Token array
   * @param {Object} options - Options containing activeProperNouns and dictionaryManager
   * @returns {Object} Variable cache {text: {translation, source, type}}
   */
  buildVariableCache(tokens, options) {
    const cache = {};

    // Get options
    const activeProperNouns = options.activeProperNouns || [];
    const dictionaryManager = options.dictionaryManager;

    if (!dictionaryManager) {
      // No dictionary manager, return empty cache
      return cache;
    }

    // Filter out 'phrases' from proper noun dictionaries
    const actualProperNounDictionaries = activeProperNouns.filter(dict => dict !== 'phrases');

    // 1. Cache already-translated proper nouns from tokens
    for (const token of tokens) {
      if (token.translated && token.translationSource?.includes('properNoun')) {
        cache[token.value] = {
          translation: token.translated,
          source: token.translationSource,
          type: 'proper_noun'
        };
      }
    }

    // 2. Cache phrase translations with allowAsPatternVariable flag
    // Check both single tokens AND multi-character combinations
    for (let i = 0; i < tokens.length; i++) {
      // Check single token
      const singleResult = dictionaryManager.translate(tokens[i].value, ['phrases']);
      if (singleResult?.metadata?.allowAsPatternVariable) {
        cache[tokens[i].value] = {
          translation: singleResult.translation,
          source: 'phrases_pattern_variable',
          type: 'phrase'
        };
      }

      // Check multi-character combinations (up to 6 characters)
      for (let len = 2; len <= Math.min(6, tokens.length - i); len++) {
        const combinedText = tokens.slice(i, i + len).map(t => t.value).join('');
        const multiResult = dictionaryManager.translate(combinedText, ['phrases']);
        if (multiResult?.metadata?.allowAsPatternVariable) {
          cache[combinedText] = {
            translation: multiResult.translation,
            source: 'phrases_pattern_variable',
            type: 'phrase'
          };
        }
      }
    }

    // 3. Cache single-token proper noun dictionary lookups
    for (const token of tokens) {
      const properNounResult = dictionaryManager.translate(token.value, actualProperNounDictionaries);
      if (properNounResult) {
        cache[token.value] = {
          translation: properNounResult.translation,
          source: properNounResult.dictionary + '_pattern_variable',
          type: 'proper_noun'
        };
      }
    }

    // 4. CRITICAL: Full-text scanning for multi-character proper nouns
    // This is essential because pattern variables can be multi-character names
    // that span multiple tokens (e.g., "张三", "李四")
    const fullText = tokens.map(t => t.value).join('');

    for (let pos = 0; pos < fullText.length; pos++) {
      const allProperNounMatches = dictionaryManager.findAllMatches(fullText, pos, actualProperNounDictionaries);

      for (const match of allProperNounMatches) {
        if (match.word && match.translation) {
          cache[match.word] = {
            translation: match.translation,
            source: match.dictionary + '_fulltext_scan',
            type: 'proper_noun'
          };
        }
      }
    }

    return cache;
  }

  /**
   * Main processing entry point
   * @param {Array} tokens - Token array to process
   * @param {Object} options - Processing options including dictionaries and managers
   * @returns {Promise<Array>} Optimal translation results
   */
  async processTokens(tokens, options) {
    // WASM-only implementation (JavaScript fallback removed after parity verification)
    if (!this.options.enableWasm || !isWasmPatternProcessorAvailable()) {
      throw new Error('WASM Pattern Processor not available. Two-phase pattern matching requires Rust WASM acceleration.');
    }

    try {
      // Extract semantic tokens (Chinese characters/words only with originalIndex)
      const semanticTokens = this.extractSemanticTokens(tokens);

      // Build variable cache
      const variableCache = this.buildVariableCache(tokens, options);

      const wasmResults = await processTokensWasm(semanticTokens, variableCache);

      if (!wasmResults || wasmResults.length === 0) {
        // Empty results are valid (e.g., no patterns matched)
        return [];
      }

      return wasmResults;
    } catch (error) {
      console.error('❌ WASM pattern processing failed:', error);
      throw error;
    }
  }
  
  /**
   * Get processing statistics and performance metrics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    return {
      patterns: {
        total: this.processedPatterns.length,
        variablePatterns: this.variablePatterns.length,
        compositeEligible: this.compositeEligiblePatterns.length
      },
      analysis: this.analyzer.generateSummary(this.processedPatterns),
      options: this.options
    };
  }
  
  /**
   * Validate configuration and pattern setup
   * @returns {Object} Validation results
   */
  validateSetup() {
    const issues = [];
    
    if (this.processedPatterns.length === 0) {
      issues.push('No patterns provided for processing');
    }
    
    if (this.variablePatterns.length === 0) {
      issues.push('No variable patterns available for Phase A');
    }
    
    if (this.compositeEligiblePatterns.length === 0) {
      issues.push('No composite-eligible patterns available for Phase B');
    }
    
    // Validate individual patterns
    for (const pattern of this.processedPatterns) {
      const validation = this.analyzer.validatePattern(pattern);
      if (!validation.valid) {
        issues.push(`Pattern "${pattern.originalPattern}": ${validation.issues.join(', ')}`);
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings: issues.filter(issue => issue.includes('No ')) // Categorize missing components as warnings
    };
  }
}

export default TwoPhasePatternProcessor;