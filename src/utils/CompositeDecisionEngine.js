/**
 * CompositeDecisionEngine - Selects optimal translations from competing candidates
 * 
 * Implements intelligent conflict resolution between:
 * - Phase A variable patterns
 * - Phase B regular patterns  
 * - Composite patterns (Phase A + Phase B combinations)
 * 
 * Selection criteria: composites > longest spans > phase precedence
 */
class CompositeDecisionEngine {
  constructor(options = {}) {
    this.options = {
      debugMode: false,
      preferComposites: true,
      minConfidenceThreshold: 0.3,
      ...options
    };
  }
  
  /**
   * Select optimal results from all translation candidates
   * @param {Array} phaseAResults - Phase A variable pattern results
   * @param {Array} phaseBResults - Phase B pattern results
   * @param {Array} compositeResults - Composite pattern results
   * @returns {Array} Optimal non-overlapping translation results
   */
  selectOptimalResults(phaseAResults, phaseBResults, compositeResults) {
    // Score all translation options
    const allOptions = [
      ...this.scoreResults(phaseAResults, 'phaseA'),
      ...this.scoreResults(phaseBResults, 'phaseB'),
      ...this.scoreResults(compositeResults, 'composite')
    ];
    
    if (this.options.debugMode) {
      console.log('Scoring results:', {
        phaseA: phaseAResults.length,
        phaseB: phaseBResults.length,
        composite: compositeResults.length,
        totalOptions: allOptions.length
      });
    }
    
    // Filter by minimum confidence threshold
    const viableOptions = allOptions.filter(option => 
      option.result.confidence >= this.options.minConfidenceThreshold
    );
    
    // Resolve conflicts and select optimal combination
    const selectedResults = this.resolveConflicts(viableOptions);
    
    if (this.options.debugMode) {
      console.log('Decision engine results:', {
        totalCandidates: allOptions.length,
        viableCandidates: viableOptions.length,
        selectedResults: selectedResults.length,
        resultTypes: this.summarizeResultTypes(selectedResults)
      });
    }
    
    return selectedResults.map(scored => scored.result);
  }
  
  /**
   * Score results by type and characteristics
   * @param {Array} results - Results to score
   * @param {string} type - Result type ('phaseA', 'phaseB', 'composite')
   * @returns {Array} Scored results with metadata
   */
  scoreResults(results, type) {
    return results.map(result => ({
      result,
      score: this.calculateScore(result, type),
      type,
      span: result.endIndex - result.startIndex + 1,
      confidence: result.confidence || 0.8
    }));
  }
  
  /**
   * Calculate comprehensive score for a translation result
   * @param {Object} result - Translation result
   * @param {string} type - Result type
   * @returns {number} Calculated score
   */
  calculateScore(result, type) {
    // Base score: span length (longer matches preferred)
    let score = (result.endIndex - result.startIndex + 1) * 10;
    
    // Type bonuses (composites strongly preferred)
    const typeBonus = this.getTypeBonus(type);
    score += typeBonus;
    
    // Confidence bonus
    const confidence = result.confidence || 0.8;
    score += confidence * 20;
    
    // Quality bonuses
    score += this.calculateQualityBonus(result, type);
    
    return score;
  }
  
  /**
   * Get score bonus based on result type
   * @param {string} type - Result type
   * @returns {number} Type bonus score
   */
  getTypeBonus(type) {
    if (!this.options.preferComposites) {
      return 0; // No type preference
    }
    
    switch(type) {
      case 'composite': return 50; // Highest preference - coherent composite translations
      case 'phaseA': return 30;    // Variable patterns are valuable structural components
      case 'phaseB': return 20;    // Regular patterns are good fallbacks
      default: return 0;
    }
  }
  
  /**
   * Calculate quality-based score bonus
   * @param {Object} result - Translation result
   * @param {string} type - Result type
   * @returns {number} Quality bonus score
   */
  calculateQualityBonus(result, type) {
    let bonus = 0;
    
    // Composite-specific quality factors
    if (type === 'composite') {
      // High confidence absorption
      if (result.confidence > 0.8) {
        bonus += 15;
      }
      
      // Good component integration
      if (result.components?.phaseA && result.components?.phaseB) {
        bonus += 10;
      }
      
      // Natural variable absorption
      if (result.absorptionType === 'variable_match') {
        bonus += 5;
      }
    }
    
    // Pattern-specific quality factors
    if (type === 'phaseA' || type === 'phaseB') {
      // Strong pattern match
      if (result.matchStrength === 'exact') {
        bonus += 10;
      }
      
      // Good translation quality
      if (result.translationQuality === 'high') {
        bonus += 5;
      }
    }
    
    return bonus;
  }
  
  /**
   * Resolve conflicts between overlapping translation candidates
   * @param {Array} scoredOptions - Array of scored translation options
   * @returns {Array} Non-overlapping optimal results
   */
  resolveConflicts(scoredOptions) {
    // Sort by score (highest first)
    const sortedOptions = [...scoredOptions].sort((a, b) => b.score - a.score);
    
    const selectedResults = [];
    const usedTokens = new Set();
    
    for (const option of sortedOptions) {
      const result = option.result;
      
      // Check for token overlap with already selected results
      if (!this.hasTokenOverlap(result, usedTokens)) {
        selectedResults.push(option);
        
        // Mark tokens as used
        for (let i = result.startIndex; i <= result.endIndex; i++) {
          usedTokens.add(i);
        }
        
        if (this.options.debugMode) {
          console.log(`Selected ${option.type} result:`, {
            text: result.originalText,
            translation: result.translation,
            score: option.score,
            span: `${result.startIndex}-${result.endIndex}`
          });
        }
      } else if (this.options.debugMode) {
        console.log(`Rejected overlapping ${option.type} result:`, {
          text: result.originalText,
          score: option.score,
          span: `${result.startIndex}-${result.endIndex}`
        });
      }
    }
    
    return selectedResults;
  }
  
  /**
   * Check if result overlaps with used token positions
   * @param {Object} result - Translation result to check
   * @param {Set} usedTokens - Set of already used token positions
   * @returns {boolean} True if there's overlap
   */
  hasTokenOverlap(result, usedTokens) {
    for (let i = result.startIndex; i <= result.endIndex; i++) {
      if (usedTokens.has(i)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Analyze selection patterns and provide insights
   * @param {Array} selectedResults - Final selected results
   * @returns {Object} Selection analysis
   */
  analyzeSelection(selectedResults) {
    const analysis = {
      totalResults: selectedResults.length,
      typeDistribution: {},
      averageScore: 0,
      averageSpan: 0,
      qualityMetrics: {
        highConfidence: 0,
        compositeCount: 0,
        variablePatternCount: 0
      }
    };
    
    let totalScore = 0;
    let totalSpan = 0;
    
    for (const scoredResult of selectedResults) {
      const type = scoredResult.type;
      const result = scoredResult.result;
      
      // Type distribution
      analysis.typeDistribution[type] = (analysis.typeDistribution[type] || 0) + 1;
      
      // Accumulate metrics
      totalScore += scoredResult.score;
      totalSpan += scoredResult.span;
      
      // Quality metrics
      if (result.confidence > 0.8) {
        analysis.qualityMetrics.highConfidence++;
      }
      
      if (type === 'composite') {
        analysis.qualityMetrics.compositeCount++;
      }
      
      if (type === 'phaseA') {
        analysis.qualityMetrics.variablePatternCount++;
      }
    }
    
    analysis.averageScore = selectedResults.length > 0 ? totalScore / selectedResults.length : 0;
    analysis.averageSpan = selectedResults.length > 0 ? totalSpan / selectedResults.length : 0;
    
    return analysis;
  }
  
  /**
   * Summarize result types for debugging
   * @param {Array} results - Results to summarize
   * @returns {Object} Type summary
   */
  summarizeResultTypes(results) {
    const summary = {};
    for (const result of results) {
      const type = result.type || 'unknown';
      summary[type] = (summary[type] || 0) + 1;
    }
    return summary;
  }
  
  /**
   * Validate selection quality and detect potential issues
   * @param {Array} selectedResults - Selected results to validate
   * @returns {Object} Validation report
   */
  validateSelection(selectedResults) {
    const issues = [];
    const warnings = [];
    
    // Check for gaps in coverage
    const tokenCoverage = this.calculateTokenCoverage(selectedResults);
    if (tokenCoverage.gapCount > 0) {
      warnings.push(`${tokenCoverage.gapCount} token gaps in coverage`);
    }
    
    // Check for low-quality results
    const lowQualityCount = selectedResults.filter(r => 
      r.result.confidence < 0.5
    ).length;
    if (lowQualityCount > 0) {
      warnings.push(`${lowQualityCount} low-confidence results selected`);
    }
    
    // Check composite utilization
    const compositeCount = selectedResults.filter(r => r.type === 'composite').length;
    const compositeOpportunities = selectedResults.filter(r => 
      r.type === 'phaseA' || r.type === 'phaseB'
    ).length;
    
    if (compositeOpportunities > compositeCount * 2) {
      warnings.push('Potential missed composite opportunities');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      metrics: {
        totalResults: selectedResults.length,
        compositeUtilization: compositeCount / Math.max(1, selectedResults.length),
        averageConfidence: selectedResults.reduce((sum, r) => 
          sum + (r.result.confidence || 0.8), 0) / Math.max(1, selectedResults.length)
      }
    };
  }
  
  /**
   * Calculate token coverage statistics
   * @param {Array} results - Translation results
   * @returns {Object} Coverage statistics
   */
  calculateTokenCoverage(results) {
    if (results.length === 0) {
      return { coveredTokens: 0, gapCount: 0, coverageRatio: 0 };
    }
    
    // Find token range
    const allIndices = results.flatMap(r => 
      Array.from({length: r.result.endIndex - r.result.startIndex + 1}, 
                 (_, i) => r.result.startIndex + i)
    );
    
    const minIndex = Math.min(...allIndices);
    const maxIndex = Math.max(...allIndices);
    const totalRange = maxIndex - minIndex + 1;
    
    const coveredTokens = new Set(allIndices);
    const gapCount = totalRange - coveredTokens.size;
    
    return {
      coveredTokens: coveredTokens.size,
      totalRange,
      gapCount,
      coverageRatio: coveredTokens.size / totalRange
    };
  }
  
  /**
   * Generate decision report for analysis and debugging
   * @param {Array} allOptions - All translation options considered
   * @param {Array} selectedResults - Final selected results
   * @returns {Object} Comprehensive decision report
   */
  generateDecisionReport(allOptions, selectedResults) {
    return {
      timestamp: new Date().toISOString(),
      options: {
        totalCandidates: allOptions.length,
        byType: this.summarizeResultTypes(allOptions.map(o => o.result))
      },
      selection: {
        selectedCount: selectedResults.length,
        byType: this.summarizeResultTypes(selectedResults),
        analysis: this.analyzeSelection(selectedResults)
      },
      validation: this.validateSelection(selectedResults),
      performance: {
        selectionEfficiency: selectedResults.length / Math.max(1, allOptions.length),
        compositeSuccessRate: selectedResults.filter(r => r.type === 'composite').length / 
                             Math.max(1, allOptions.filter(o => o.type === 'composite').length)
      }
    };
  }
}

export default CompositeDecisionEngine;