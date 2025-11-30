import PatternAnalyzer from './PatternAnalyzer.js';

/**
 * TwoPhasePatternProcessor - Main orchestrator for hierarchical pattern processing
 *
 * Implements two-phase pattern matching:
 * - Phase A: Process patterns with allowAsPatternVariable: true
 * - Phase B: Process all patterns, using Phase A results as enhanced variables
 * - Composite Detection: Identify when Phase A results can be absorbed into Phase B patterns
 * - Decision Engine: Select optimal translation from all candidates
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
   * Main processing entry point
   * @param {Array} tokens - Token array to process
   * @param {Object} options - Processing options including dictionaries and managers
   * @returns {Promise<Array>} Optimal translation results
   */
  async processTokens(tokens, options) {
    const startTime = Date.now();

    try {
      // Phase A: Variable patterns only
      const phaseAResults = await this.processPhaseA(tokens, options);

      // Mark Phase A tokens as protected from Phase B processing
      this.markTokensAsProtected(tokens, phaseAResults);

      // Phase B: All patterns with enhanced variable resolution
      const phaseBResults = await this.processPhaseB(tokens, phaseAResults, options);

      // Composite Recognition: Detect absorption opportunities
      const compositeResults = await this.detectComposites(phaseAResults, phaseBResults, tokens);

      // Decision Engine: Select optimal results
      const finalResults = this.selectOptimalResults(phaseAResults, phaseBResults, compositeResults);

      const _processingTime = Date.now() - startTime;

      // Two-phase processing completed successfully

      return finalResults;
      
    } catch (_error) {
      if (this.options.enableFallback) {
        console.warn('Two-phase processing failed, falling back to single-phase:', _error);
        return await this.processSinglePhaseFallback(tokens, options);
      } else {
        throw _error;
      }
    }
  }
  
  /**
   * Process Phase A: Variable patterns only
   * @param {Array} tokens - Token array
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Phase A results
   */
  async processPhaseA(tokens, options) {
    if (this.variablePatterns.length === 0) {
      console.log(`🔍 Phase A: No variable patterns available`);
      return [];
    }
    
    // Create clean token copies for Phase A to prevent token contamination
    const cleanTokens = tokens.map(token => ({
      ...token,
      translated: null,
      translationSource: null,
      protectedByPhaseA: undefined
    }));
    
    // Use existing pattern processing logic but only with variable patterns
    const { SemanticPatternProcessor } = await import('./SemanticPatternProcessor.js');
    const phaseAProcessor = new SemanticPatternProcessor();
    const results = await phaseAProcessor.processPatterns(cleanTokens, this.variablePatterns, options);
    
    return results;
  }
  
  /**
   * Process Phase B: All patterns with enhanced variable resolution
   * @param {Array} tokens - Token array
   * @param {Array} phaseAResults - Results from Phase A to use as variables
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Phase B results
   */
  async processPhaseB(tokens, phaseAResults, options) {
    
    // Create enhanced options with Phase A results as additional variables
    const enhancedOptions = {
      ...options,
      phaseAResults,
      enableEnhancedVariableResolution: true
    };
    
    // Use existing pattern processing logic with all patterns
    const { SemanticPatternProcessor } = await import('./SemanticPatternProcessor.js');
    const phaseBProcessor = new SemanticPatternProcessor();
    const phaseBResults = await phaseBProcessor.processPatterns(tokens, this.allPatterns, enhancedOptions);
    
    
    return phaseBResults;
  }
  
  /**
   * Mark tokens consumed by Phase A as protected from Phase B
   * @param {Array} tokens - Token array to modify
   * @param {Array} phaseAResults - Phase A results containing token spans
   */
  markTokensAsProtected(tokens, phaseAResults) {
    for (const result of phaseAResults) {
      for (let i = result.startIndex; i <= result.endIndex; i++) {
        if (tokens[i]) {
          tokens[i].protectedByPhaseA = true;
          tokens[i].phaseAResult = result;
        }
      }
    }
  }
  
  /**
   * Detect composite opportunities between Phase A and Phase B results
   * @param {Array} phaseAResults - Phase A variable pattern results
   * @param {Array} phaseBResults - Phase B pattern candidates
   * @param {Array} tokens - Token array for text analysis
   * @returns {Promise<Array>} Composite translation opportunities
   */
  async detectComposites(phaseAResults, phaseBResults, tokens) {
    const compositeDetectionStart = Date.now();
    
    // Import composite detector (will be created in Week 2)
    let CompositePatternDetector;
    try {
      CompositePatternDetector = (await import('./CompositePatternDetector.js')).default;
    } catch (_error) {
      // Graceful degradation if CompositePatternDetector not yet implemented
      if (this.options.debugMode) {
        console.log('CompositePatternDetector not available, skipping composite detection');
      }
      return [];
    }
    
    const detector = new CompositePatternDetector(this.options);
    const composites = detector.detectComposites(phaseAResults, phaseBResults, tokens);
    
    const detectionTime = Date.now() - compositeDetectionStart;
    
    
    return composites;
  }
  
  /**
   * Select optimal results from all candidates using decision engine
   * @param {Array} phaseAResults - Phase A results
   * @param {Array} phaseBResults - Phase B results  
   * @param {Array} compositeResults - Composite results
   * @returns {Array} Optimal translation results
   */
  selectOptimalResults(phaseAResults, phaseBResults, compositeResults) {
    // Import decision engine (will be created in Week 3)
    let CompositeDecisionEngine;
    try {
      CompositeDecisionEngine = require('./CompositeDecisionEngine.js').default;
      const engine = new CompositeDecisionEngine(this.options);
      return engine.selectOptimalResults(phaseAResults, phaseBResults, compositeResults);
    } catch (_error) {
      // Fallback to simple longest-match-first for now
      // CompositeDecisionEngine not available, using simple selection
      return this.simpleResultSelection(phaseAResults, phaseBResults, compositeResults);
    }
  }
  
  /**
   * Simple fallback result selection (longest match wins)
   * @param {Array} phaseAResults - Phase A results
   * @param {Array} phaseBResults - Phase B results
   * @param {Array} compositeResults - Composite results
   * @returns {Array} Selected results
   */
  simpleResultSelection(phaseAResults, phaseBResults, compositeResults) {
    // Check for hierarchical composition: Phase B using Phase A as variable
    const hierarchicalResults = this.detectHierarchicalComposition(phaseAResults, phaseBResults);
    if (hierarchicalResults.length > 0) {
      // BUGFIX: Also include non-overlapping Phase B patterns that weren't part of hierarchical composition
      const usedPhaseBIndices = new Set();
      hierarchicalResults.forEach(hr => {
        // Track which Phase B results were used in hierarchical composition
        if (hr.phaseB) {
          for (let i = hr.phaseB.startIndex; i <= hr.phaseB.endIndex; i++) {
            usedPhaseBIndices.add(i);
          }
        }
      });

      // Add non-overlapping Phase B patterns
      const nonOverlappingPhaseBResults = phaseBResults.filter(phaseBResult => {
        // Check if this Phase B result overlaps with any hierarchical result
        for (let i = phaseBResult.startIndex; i <= phaseBResult.endIndex; i++) {
          if (usedPhaseBIndices.has(i)) {
            return false; // Overlaps, don't include
          }
        }
        return true; // No overlap, include it
      });

      const finalResults = [...hierarchicalResults, ...nonOverlappingPhaseBResults];
      return finalResults;
    }
    
    // Fallback to standard selection if no hierarchical composition detected
    const allResults = [
      ...phaseAResults.map(r => ({ ...r, source: 'phaseA' })),
      ...phaseBResults.map(r => ({ ...r, source: 'phaseB' })),
      ...compositeResults.map(r => ({ ...r, source: 'composite' }))
    ];
    
    // Sort by span length (longest first) and remove overlaps
    
    // Sort by pattern character length (longest first), not token span
    allResults.sort((a, b) => {
      const aLength = a.pattern?.originalPattern?.length || (a.endIndex - a.startIndex + 1);
      const bLength = b.pattern?.originalPattern?.length || (b.endIndex - b.startIndex + 1);
      return bLength - aLength;
    });
    
    
    const selectedResults = [];
    const usedTokens = new Set();
    
    for (const result of allResults) {
      let hasOverlap = false;
      for (let i = result.startIndex; i <= result.endIndex; i++) {
        if (usedTokens.has(i)) {
          hasOverlap = true;
          break;
        }
      }
      
      if (!hasOverlap) {
        selectedResults.push(result);
        for (let i = result.startIndex; i <= result.endIndex; i++) {
          usedTokens.add(i);
        }
      }
    }
    
    return selectedResults;
  }
  
  /**
   * Detect hierarchical composition where Phase B uses Phase A results as variables
   * @param {Array} phaseAResults - Phase A results
   * @param {Array} phaseBResults - Phase B results
   * @returns {Array} Hierarchical composition results
   */
  detectHierarchicalComposition(phaseAResults, phaseBResults) {
    const hierarchicalResults = [];
    
    for (const phaseBResult of phaseBResults) {
      // Check if this Phase B result's translation contains any Phase A result's translation
      for (const phaseAResult of phaseAResults) {
        if (phaseBResult.translation && phaseAResult.translation && 
            phaseBResult.translation.includes(phaseAResult.translation)) {
          // Phase B contains Phase A translation - this is hierarchical composition
          // Create a combined result that spans both Phase A and Phase B tokens
          const combinedResult = {
            originalText: phaseAResult.originalText + phaseBResult.originalText,
            translation: phaseBResult.translation,
            pattern: phaseBResult.pattern,
            startIndex: Math.min(phaseAResult.startIndex, phaseBResult.startIndex),
            endIndex: Math.max(phaseAResult.endIndex, phaseBResult.endIndex),
            source: 'hierarchical_composition',
            phaseA: phaseAResult,
            phaseB: phaseBResult
          };
          
          hierarchicalResults.push(combinedResult);
        }
      }
    }
    
    return hierarchicalResults;
  }
  
  /**
   * Fallback to single-phase processing if two-phase fails
   * @param {Array} tokens - Token array
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Fallback results
   */
  async processSinglePhaseFallback(tokens, options) {
    console.log('Using single-phase fallback processing');
    
    // Use existing single-phase pattern processing
    const { SemanticPatternProcessor } = await import('./SemanticPatternProcessor.js');
    const singlePhaseProcessor = new SemanticPatternProcessor();
    return await singlePhaseProcessor.processPatterns(tokens, this.allPatterns, options);
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