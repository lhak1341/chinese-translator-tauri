import PatternAnalyzer from './PatternAnalyzer.js';
import { processTokensWasm, isWasmPatternProcessorAvailable } from './WasmPatternProcessor.js';
import { logger } from './logger.js';

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
      ...options,
    };

    // Analyze and categorize patterns
    this.processedPatterns = this.analyzer.analyzePatterns(patterns);
    this.categorizePatterns();

    // Internal performance profiling
    this.internalProfiling = {
      enabled: false,
      extractSemanticTokens: { time: 0, calls: 0 },
      buildVariableCache: { time: 0, calls: 0 },
      buildVariableCache_alreadyTranslated: { time: 0, calls: 0 },
      buildVariableCache_phraseLookups: { time: 0, calls: 0 },
      buildVariableCache_properNounLookups: { time: 0, calls: 0 },
      buildVariableCache_fullTextScan: { time: 0, calls: 0 },
      processTokensWasm: { time: 0, calls: 0 },
    };

    // TwoPhasePatternProcessor initialized successfully
  }

  /**
   * Categorize patterns into processing phases
   */
  categorizePatterns() {
    // Phase A: Patterns that can serve as variables for other patterns
    this.variablePatterns = this.processedPatterns.filter((p) => p.allowAsPatternVariable === true);

    // Phase B eligible: Patterns that can use composite variables (single-variable only)
    this.compositeEligiblePatterns = this.processedPatterns.filter((p) => p.compositeEligible);

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

      // Skip grouped followers
      if (token.isGrouped && token.groupLeader !== null) {
        continue;
      }

      // BUGFIX: Include Latin words and numbers for pattern matching
      // so that patterns can properly handle mixed Chinese/Latin text like "yuan主厨"
      if (
        token.type === 'chinese_char' ||
        token.type === 'chinese_word' ||
        token.type === 'latin_word' ||
        token.type === 'number'
      ) {
        semanticTokens.push({
          ...token,
          originalIndex: i,
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
    const startTotal = performance.now();
    const cache = {};

    // Get options
    const activeProperNouns = options.activeProperNouns || [];
    const dictionaryManager = options.dictionaryManager;

    // Performance optimization: pre-scan patterns for required variable types.
    // If patterns specify allowedVariableTypes, we can skip cache entries of
    // unneeded types — BUT only when ALL patterns are constrained. If any
    // pattern has no allowedVariableTypes, it accepts any type, so filtering
    // by type would silently exclude entries that the unconstrained pattern needs.
    let requiredTypes = null;
    let hasUnconstrainedPatterns = false;
    for (const pattern of this.processedPatterns) {
      if (pattern.metadata?.allowedVariableTypes) {
        if (!requiredTypes) requiredTypes = new Set();
        for (const types of Object.values(pattern.metadata.allowedVariableTypes)) {
          for (const t of types) {
            requiredTypes.add(t);
          }
        }
      } else {
        hasUnconstrainedPatterns = true;
      }
    }

    // Helper: check if an entry's type should be included in the cache.
    const shouldInclude = (entryType) => {
      if (!requiredTypes || hasUnconstrainedPatterns) return true; // No filter needed
      if (!entryType) return true; // Untyped entries always included
      return requiredTypes.has(entryType); // Skip if type not needed by any pattern
    };

    // Filter out 'phrases' from proper noun dictionaries
    const actualProperNounDictionaries = activeProperNouns.filter((dict) => dict !== 'phrases');

    // 1. Cache already-translated proper nouns from tokens
    const start1 = performance.now();
    for (const token of tokens) {
      if (token.translated && token.translationSource?.includes('properNoun')) {
        const entryType = token.metadata?.semanticType || 'proper_noun';
        if (shouldInclude(entryType === 'proper_noun' ? null : entryType)) {
          cache[token.value] = {
            translation: token.translated,
            source: token.translationSource,
            type: entryType,
          };
        }
      }
    }
    if (this.internalProfiling.enabled) {
      this.internalProfiling.buildVariableCache_alreadyTranslated.time +=
        performance.now() - start1;
      this.internalProfiling.buildVariableCache_alreadyTranslated.calls++;
    }

    // 1b. Cache pattern-translated tokens that carry an explicit semantic type
    // These come from a prior translation pass (cross-chunk or cross-pass) where
    // a pattern match set token.patternSemanticType.  Adding them here lets
    // subsequent WASM processing use the typed result as a typed variable in
    // patterns whose allowedVariableTypes constraints would otherwise filter
    // the token out.
    for (const token of tokens) {
      if (
        token.translated &&
        token.patternSemanticType &&
        (token.translationSource === 'pattern' ||
          token.translationSource === 'hierarchical_pattern' ||
          token.translationSource === 'hierarchical_patterns' ||
          token.translationSource === 'hierarchical_patterns_composite')
      ) {
        if (shouldInclude(token.patternSemanticType)) {
          cache[token.value] = {
            translation: token.translated,
            source: token.translationSource,
            type: token.patternSemanticType,
          };
        }
      }
    }

    // 2. Cache phrase translations with allowAsPatternVariable flag
    if (!dictionaryManager) {
      // No dictionary manager — Phases 1 and 1b have run; nothing more to do
      return cache;
    }
    // Check both single tokens AND multi-character combinations
    const start2 = performance.now();
    for (let i = 0; i < tokens.length; i++) {
      // Check single token
      const singleResult = dictionaryManager.translate(tokens[i].value, ['phrases']);
      if (singleResult?.metadata?.allowAsPatternVariable) {
        const singleType = singleResult.metadata?.semanticType || 'concept';
        if (shouldInclude(singleType)) {
          cache[tokens[i].value] = {
            translation: singleResult.translation,
            source: 'phrases_pattern_variable',
            type: singleType,
          };
        }
      }

      // Check multi-character combinations (up to 6 characters)
      for (let len = 2; len <= Math.min(6, tokens.length - i); len++) {
        const combinedText = tokens
          .slice(i, i + len)
          .map((t) => t.value)
          .join('');
        const multiResult = dictionaryManager.translate(combinedText, ['phrases']);
        if (multiResult?.metadata?.allowAsPatternVariable) {
          const multiType = multiResult.metadata?.semanticType || 'concept';
          if (shouldInclude(multiType)) {
            cache[combinedText] = {
              translation: multiResult.translation,
              source: 'phrases_pattern_variable',
              type: multiType,
            };
          }
        }
      }
    }
    if (this.internalProfiling.enabled) {
      this.internalProfiling.buildVariableCache_phraseLookups.time += performance.now() - start2;
      this.internalProfiling.buildVariableCache_phraseLookups.calls++;
    }

    // 3. Cache single-token proper noun dictionary lookups
    const start3 = performance.now();
    for (const token of tokens) {
      const properNounResult = dictionaryManager.translate(
        token.value,
        actualProperNounDictionaries
      );
      if (properNounResult) {
        const pnType = properNounResult.metadata?.semanticType || 'proper_noun';
        if (shouldInclude(pnType === 'proper_noun' ? null : pnType)) {
          cache[token.value] = {
            translation: properNounResult.translation,
            source: properNounResult.dictionary + '_pattern_variable',
            type: pnType,
          };
        }
      }
    }
    if (this.internalProfiling.enabled) {
      this.internalProfiling.buildVariableCache_properNounLookups.time +=
        performance.now() - start3;
      this.internalProfiling.buildVariableCache_properNounLookups.calls++;
    }

    // 4. CRITICAL: Full-text scanning for multi-character proper nouns
    // This is essential because pattern variables can be multi-character names
    // that span multiple tokens (e.g., "张三", "李四")
    const start4 = performance.now();
    const fullText = tokens.map((t) => t.value).join('');

    for (let pos = 0; pos < fullText.length; pos++) {
      const allProperNounMatches = dictionaryManager.findAllMatches(
        fullText,
        pos,
        actualProperNounDictionaries
      );

      for (const match of allProperNounMatches) {
        if (match.word && match.translation) {
          // Defensive: if a phrase entry leaks through (actualProperNounDictionaries excludes 'phrases',
          // so this guard should not fire in practice) apply the same allowAsPatternVariable gate used
          // in step 2. Mirrors SemanticPatternProcessor.buildVariableCache full-text scan guard.
          if (match.dictionary === 'phrases') {
            const phrasesResult = dictionaryManager.translate(match.word, ['phrases']);
            if (phrasesResult?.metadata?.allowAsPatternVariable !== true) {
              continue;
            }
          }
          // All proper nouns are valid pattern variables by design — no allowAsPatternVariable gate needed.
          const matchType = match.metadata?.semanticType || 'proper_noun';
          if (shouldInclude(matchType === 'proper_noun' ? null : matchType)) {
            cache[match.word] = {
              translation: match.translation,
              source: match.dictionary + '_fulltext_scan',
              type: matchType,
            };
          }
        }
      }
    }
    if (this.internalProfiling.enabled) {
      this.internalProfiling.buildVariableCache_fullTextScan.time += performance.now() - start4;
      this.internalProfiling.buildVariableCache_fullTextScan.calls++;
    }

    if (this.internalProfiling.enabled) {
      this.internalProfiling.buildVariableCache.time += performance.now() - startTotal;
      this.internalProfiling.buildVariableCache.calls++;
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
      throw new Error(
        'WASM Pattern Processor not available. Two-phase pattern matching requires Rust WASM acceleration.'
      );
    }

    try {
      // Extract semantic tokens (Chinese characters/words only with originalIndex)
      const start1 = performance.now();
      const semanticTokens = this.extractSemanticTokens(tokens);
      if (this.internalProfiling.enabled) {
        this.internalProfiling.extractSemanticTokens.time += performance.now() - start1;
        this.internalProfiling.extractSemanticTokens.calls++;
      }

      // Build variable cache (this calls buildVariableCache which has its own internal profiling)
      const variableCache = this.buildVariableCache(tokens, options);

      // Call WASM pattern processor
      const start3 = performance.now();
      const wasmResponse = await processTokensWasm(semanticTokens, variableCache);
      if (this.internalProfiling.enabled) {
        this.internalProfiling.processTokensWasm.time += performance.now() - start3;
        this.internalProfiling.processTokensWasm.calls++;
      }

      // MEDIUM FIX: Handle structured error response from WASM processor
      if (!wasmResponse.success) {
        logger.warn(`⚠️ WASM pattern processing failed: ${wasmResponse.error}`);
        return [];
      }

      const wasmResults = wasmResponse.results;
      if (!wasmResults || wasmResults.length === 0) {
        // Empty results are valid (e.g., no patterns matched)
        return [];
      }

      return wasmResults;
    } catch (error) {
      logger.error('❌ WASM pattern processing failed:', error);
      throw error;
    }
  }

  /**
   * Enable internal profiling
   */
  enableInternalProfiling() {
    this.internalProfiling.enabled = true;
    logger.log('🔬 TwoPhasePatternProcessor internal profiling enabled');
  }

  /**
   * Disable internal profiling
   */
  disableInternalProfiling() {
    this.internalProfiling.enabled = false;
    logger.log('🔬 TwoPhasePatternProcessor internal profiling disabled');
  }

  /**
   * Reset internal profiling data
   */
  resetInternalProfiling() {
    for (const key in this.internalProfiling) {
      if (key !== 'enabled' && this.internalProfiling[key].time !== undefined) {
        this.internalProfiling[key].time = 0;
        this.internalProfiling[key].calls = 0;
      }
    }
    logger.log('🔬 TwoPhasePatternProcessor profiling data reset');
  }

  /**
   * Get internal profiling report
   * @returns {Object} Profiling report
   */
  getInternalProfilingReport() {
    if (!this.internalProfiling.enabled) {
      return {
        enabled: false,
        message: 'Internal profiling not enabled. Call enableInternalProfiling() first.',
      };
    }

    const report = [];
    const totalTime =
      this.internalProfiling.buildVariableCache.time +
      this.internalProfiling.extractSemanticTokens.time +
      this.internalProfiling.processTokensWasm.time;

    // Top-level breakdown
    report.push({
      phase: 'Extract Semantic Tokens',
      timeMs: this.internalProfiling.extractSemanticTokens.time.toFixed(2),
      calls: this.internalProfiling.extractSemanticTokens.calls,
      avgMs: (
        this.internalProfiling.extractSemanticTokens.time /
        Math.max(1, this.internalProfiling.extractSemanticTokens.calls)
      ).toFixed(2),
      percentage:
        ((this.internalProfiling.extractSemanticTokens.time / totalTime) * 100).toFixed(1) + '%',
    });

    report.push({
      phase: 'Build Variable Cache (TOTAL)',
      timeMs: this.internalProfiling.buildVariableCache.time.toFixed(2),
      calls: this.internalProfiling.buildVariableCache.calls,
      avgMs: (
        this.internalProfiling.buildVariableCache.time /
        Math.max(1, this.internalProfiling.buildVariableCache.calls)
      ).toFixed(2),
      percentage:
        ((this.internalProfiling.buildVariableCache.time / totalTime) * 100).toFixed(1) + '%',
    });

    // Variable cache sub-steps
    report.push({
      phase: '  ↳ Already Translated Tokens',
      timeMs: this.internalProfiling.buildVariableCache_alreadyTranslated.time.toFixed(2),
      calls: this.internalProfiling.buildVariableCache_alreadyTranslated.calls,
      avgMs: (
        this.internalProfiling.buildVariableCache_alreadyTranslated.time /
        Math.max(1, this.internalProfiling.buildVariableCache_alreadyTranslated.calls)
      ).toFixed(2),
      percentage:
        (
          (this.internalProfiling.buildVariableCache_alreadyTranslated.time / totalTime) *
          100
        ).toFixed(1) + '%',
    });

    report.push({
      phase: '  ↳ Phrase Lookups',
      timeMs: this.internalProfiling.buildVariableCache_phraseLookups.time.toFixed(2),
      calls: this.internalProfiling.buildVariableCache_phraseLookups.calls,
      avgMs: (
        this.internalProfiling.buildVariableCache_phraseLookups.time /
        Math.max(1, this.internalProfiling.buildVariableCache_phraseLookups.calls)
      ).toFixed(2),
      percentage:
        ((this.internalProfiling.buildVariableCache_phraseLookups.time / totalTime) * 100).toFixed(
          1
        ) + '%',
    });

    report.push({
      phase: '  ↳ Proper Noun Lookups',
      timeMs: this.internalProfiling.buildVariableCache_properNounLookups.time.toFixed(2),
      calls: this.internalProfiling.buildVariableCache_properNounLookups.calls,
      avgMs: (
        this.internalProfiling.buildVariableCache_properNounLookups.time /
        Math.max(1, this.internalProfiling.buildVariableCache_properNounLookups.calls)
      ).toFixed(2),
      percentage:
        (
          (this.internalProfiling.buildVariableCache_properNounLookups.time / totalTime) *
          100
        ).toFixed(1) + '%',
    });

    report.push({
      phase: '  ↳ Full-Text Scan',
      timeMs: this.internalProfiling.buildVariableCache_fullTextScan.time.toFixed(2),
      calls: this.internalProfiling.buildVariableCache_fullTextScan.calls,
      avgMs: (
        this.internalProfiling.buildVariableCache_fullTextScan.time /
        Math.max(1, this.internalProfiling.buildVariableCache_fullTextScan.calls)
      ).toFixed(2),
      percentage:
        ((this.internalProfiling.buildVariableCache_fullTextScan.time / totalTime) * 100).toFixed(
          1
        ) + '%',
    });

    report.push({
      phase: 'Process Tokens (WASM)',
      timeMs: this.internalProfiling.processTokensWasm.time.toFixed(2),
      calls: this.internalProfiling.processTokensWasm.calls,
      avgMs: (
        this.internalProfiling.processTokensWasm.time /
        Math.max(1, this.internalProfiling.processTokensWasm.calls)
      ).toFixed(2),
      percentage:
        ((this.internalProfiling.processTokensWasm.time / totalTime) * 100).toFixed(1) + '%',
    });

    return {
      enabled: true,
      totalTimeMs: totalTime.toFixed(2),
      totalCalls: this.internalProfiling.buildVariableCache.calls,
      breakdown: report,
    };
  }

  /**
   * Print internal profiling report to console
   */
  printInternalProfilingReport() {
    const report = this.getInternalProfilingReport();

    if (!report.enabled) {
      logger.log(report.message);
      return;
    }

    logger.log('\n' + '='.repeat(80));
    logger.log('📊 TWO-PHASE PATTERN PROCESSOR - INTERNAL PROFILING');
    logger.log('='.repeat(80));
    logger.log(`Total Time: ${report.totalTimeMs}ms over ${report.totalCalls} call(s)\n`);

    logger.log('Internal Breakdown:');
    logger.log('-'.repeat(80));
    logger.table(report.breakdown);

    logger.log('\n' + '='.repeat(80));
    logger.log('Next Steps:');
    logger.log('- Review breakdown above to identify bottlenecks');
    logger.log('- Reset profiling: twoPhaseProcessor.resetInternalProfiling()');
    logger.log('='.repeat(80) + '\n');
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
        compositeEligible: this.compositeEligiblePatterns.length,
      },
      analysis: this.analyzer.generateSummary(this.processedPatterns),
      options: this.options,
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
      warnings: issues.filter((issue) => issue.includes('No ')), // Categorize missing components as warnings
    };
  }
}

export default TwoPhasePatternProcessor;
