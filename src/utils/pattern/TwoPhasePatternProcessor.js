import { processTokensWasm, isWasmPatternProcessorReady } from '../wasm/WasmPatternProcessor.js';
import { isPatternMatchInBounds } from '../wasm/WasmBoundaryValidation.js';
import { logger } from '../logger.js';
import { getSemanticTokens } from '../TokenHelpers.js';
import { buildPatternVariableCache } from './PatternVariableCache.js';

/**
 * TwoPhasePatternProcessor - the JS side of Phase 1 pattern matching.
 *
 * The two phases (variable patterns first, then all patterns using those results) and the
 * choice of the best match all run in Rust (`wasm-core/src/pattern_processor/two_phase.rs`).
 * This class gates on WASM readiness, extracts the semantic tokens, builds the variable cache
 * the matcher reads, makes the one WASM call, and drops any result whose token indices fall
 * outside the token array. There is no JS fallback (ADR-007, ADR-101): it throws when WASM is
 * not ready.
 */
class TwoPhasePatternProcessor {
  /**
   * @param {Array<{ originalPattern: string, template: string, allowAsPatternVariable: boolean }>} patterns
   *   PatternStore's entries; read only to decide whether number variables apply
   */
  constructor(patterns) {
    this.patterns = patterns;

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
   * Main processing entry point
   * @param {Array} tokens - Token array to process
   * @param {Object} options - Processing options including dictionaries and managers
   * @returns {Promise<Array>} Optimal translation results
   */
  async processTokens(tokens, options) {
    // WASM-only implementation (JavaScript fallback removed after parity verification)
    if (!isWasmPatternProcessorReady()) {
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

      // Build the variable cache the matcher reads (PatternVariableCache.js has the stages)
      const start2 = performance.now();
      const variableCache = buildPatternVariableCache(tokens, {
        activeProperNouns: options.activeProperNouns || [],
        dictionaryManager: options.dictionaryManager,
        patterns: this.patterns,
      });
      if (this.internalProfiling.enabled) {
        this.internalProfiling.buildVariableCache.time += performance.now() - start2;
        this.internalProfiling.buildVariableCache.calls++;
      }

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
}

export default TwoPhasePatternProcessor;
