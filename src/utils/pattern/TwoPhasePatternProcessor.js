import PatternAnalyzer from './PatternAnalyzer.js';
import { processTokensWasm, isWasmPatternProcessorReady } from '../wasm/WasmPatternProcessor.js';
import { isPatternMatchInBounds } from '../wasm/WasmBoundaryValidation.js';
import { logger } from '../logger.js';
import { getSemanticTokens } from '../TokenHelpers.js';
import { buildPatternVariableCache } from './PatternVariableCache.js';
import { isPatternSource } from '../TranslationSourcePriority.js';

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

    // Shared stages 1–4 (proper nouns, phrases, full-text scan).
    // resolveType: metadata?.semanticType if present; phrase source defaults to 'concept';
    // proper noun sources default to null (untyped — the matcher reads it as 'unknown').
    const cache = buildPatternVariableCache(
      tokens,
      {
        activeProperNouns: options.activeProperNouns || [],
        dictionaryManager: options.dictionaryManager,
        patterns: this.processedPatterns,
      },
      (source, word, meta) => {
        const t = meta?.semanticType || (source.includes('phrase') ? 'concept' : 'proper_noun');
        return t === 'proper_noun' ? null : t;
      }
    );

    // Step 1b (WASM-specific): pattern-translated tokens with explicit semantic types.
    // Runs after shared stages so it wins over stage-1 proper-noun entries for the same word.
    // These come from a prior translation pass where a pattern match set token.patternSemanticType,
    // letting subsequent WASM processing use them as typed variables in constrained patterns.
    for (const token of tokens) {
      if (
        token.translated &&
        token.patternSemanticType &&
        isPatternSource(token.translationSource)
      ) {
        cache[token.value] = {
          translation: token.translated,
          source: token.translationSource,
          type: token.patternSemanticType,
        };
      }
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
    if (!this.options.enableWasm || !isWasmPatternProcessorReady()) {
      throw new Error(
        'WASM Pattern Processor not available. Two-phase pattern matching requires Rust WASM acceleration.'
      );
    }

    try {
      // Extract semantic tokens (Chinese characters/words only with originalIndex)
      const start1 = performance.now();
      const semanticTokens = getSemanticTokens(tokens);
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

      if (!wasmResponse.success) {
        throw new Error(`WASM pattern processing returned failure: ${wasmResponse.error}`);
      }

      const wasmResults = wasmResponse.results;
      if (!wasmResults || wasmResults.length === 0) {
        // Empty results are valid (e.g., no patterns matched)
        return [];
      }

      // Bounds-check each result against the ORIGINAL tokens array it indexes into —
      // NOT semanticTokens.length (extractSemanticTokens filters non-semantic tokens
      // out, so the two lengths differ). A result failing this check is dropped
      // individually; the token it would have covered falls through to later phases
      // exactly as if no pattern matched, which is already a safe, handled case.
      const validResults = wasmResults.filter((result) => {
        const inBounds = isPatternMatchInBounds(result, tokens.length);
        if (!inBounds) {
          logger.warn('WASM pattern match failed bounds check, dropping:', result);
        }
        return inBounds;
      });

      return validResults;
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
