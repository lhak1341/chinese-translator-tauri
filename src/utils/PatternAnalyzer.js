/**
 * PatternAnalyzer - Analyzes pattern capabilities for hierarchical processing
 * 
 * Automatically determines pattern characteristics:
 * - Variable presence (X, Y)
 * - Composite eligibility (single-variable patterns only)
 * - Multi-variable detection
 */
class PatternAnalyzer {
  /**
   * Analyze a pattern and determine its capabilities
   * @param {Object} pattern - Pattern object with originalPattern property
   * @returns {Object} Enhanced pattern with analysis metadata
   */
  analyzePattern(pattern) {
    const patternText = pattern.originalPattern;
    
    if (!patternText) {
      throw new Error('Pattern must have originalPattern property');
    }
    
    const analysis = {
      hasVariables: this.hasVariables(patternText),
      hasXVariable: this.hasXVariable(patternText),
      hasYVariable: this.hasYVariable(patternText),
      isMultiVariable: this.isMultiVariable(patternText),
      compositeEligible: this.isCompositeEligible(patternText),
      variableCount: this.countVariables(patternText)
    };
    
    return {
      ...pattern,
      ...analysis
    };
  }
  
  /**
   * Check if pattern contains any variables (X or Y)
   * @param {string} patternText - The pattern text to analyze
   * @returns {boolean} True if pattern contains variables
   */
  hasVariables(patternText) {
    return /[XY]/.test(patternText);
  }
  
  /**
   * Check if pattern contains X variable
   * @param {string} patternText - The pattern text to analyze
   * @returns {boolean} True if pattern contains X
   */
  hasXVariable(patternText) {
    return patternText.includes('X');
  }
  
  /**
   * Check if pattern contains Y variable
   * @param {string} patternText - The pattern text to analyze
   * @returns {boolean} True if pattern contains Y
   */
  hasYVariable(patternText) {
    return patternText.includes('Y');
  }
  
  /**
   * Check if pattern contains multiple variables (both X and Y)
   * @param {string} patternText - The pattern text to analyze
   * @returns {boolean} True if pattern contains both X and Y
   */
  isMultiVariable(patternText) {
    return this.hasXVariable(patternText) && this.hasYVariable(patternText);
  }
  
  /**
   * Determine if pattern is eligible for composite generation
   * Rule: Only single-variable patterns (X only, no Y) can participate in composites
   * @param {string} patternText - The pattern text to analyze
   * @returns {boolean} True if pattern can participate in composite generation
   */
  isCompositeEligible(patternText) {
    // Must have X variable but not Y variable to be composite eligible
    return this.hasXVariable(patternText) && !this.hasYVariable(patternText);
  }
  
  /**
   * Count total number of variables in pattern
   * @param {string} patternText - The pattern text to analyze
   * @returns {number} Total count of X and Y variables
   */
  countVariables(patternText) {
    const xCount = (patternText.match(/X/g) || []).length;
    const yCount = (patternText.match(/Y/g) || []).length;
    return xCount + yCount;
  }
  
  /**
   * Analyze multiple patterns in batch
   * @param {Array} patterns - Array of pattern objects
   * @returns {Array} Array of analyzed patterns
   */
  analyzePatterns(patterns) {
    return patterns.map(pattern => this.analyzePattern(pattern));
  }
  
  /**
   * Filter patterns by capability
   * @param {Array} analyzedPatterns - Array of analyzed patterns
   * @param {string} capability - Capability to filter by ('hasVariables', 'compositeEligible', etc.)
   * @returns {Array} Filtered patterns matching the capability
   */
  filterByCapability(analyzedPatterns, capability) {
    return analyzedPatterns.filter(pattern => pattern[capability]);
  }
  
  /**
   * Get patterns suitable for Phase A (variable patterns)
   * @param {Array} analyzedPatterns - Array of analyzed patterns
   * @returns {Array} Patterns eligible for Phase A processing
   */
  getPhaseAPatterns(analyzedPatterns) {
    return analyzedPatterns.filter(pattern => pattern.allowAsPatternVariable === true);
  }
  
  /**
   * Get patterns suitable for Phase B composite generation
   * @param {Array} analyzedPatterns - Array of analyzed patterns
   * @returns {Array} Patterns eligible for composite generation
   */
  getCompositeEligiblePatterns(analyzedPatterns) {
    return this.filterByCapability(analyzedPatterns, 'compositeEligible');
  }
  
  /**
   * Validate pattern structure and report issues
   * @param {Object} pattern - Pattern to validate
   * @returns {Object} Validation result with issues array
   */
  validatePattern(pattern) {
    const issues = [];
    const patternText = pattern.originalPattern;
    
    if (!patternText) {
      issues.push('Pattern missing originalPattern property');
      return { valid: false, issues };
    }
    
    if (!this.hasVariables(patternText)) {
      issues.push('Pattern has no variables - should be in phrases dictionary instead');
    }
    
    if (this.isMultiVariable(patternText) && pattern.allowAsPatternVariable) {
      issues.push('Multi-variable patterns (containing Y) cannot be used as pattern variables');
    }
    
    if (!pattern.template) {
      issues.push('Pattern missing template property for translation');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Generate summary statistics for pattern collection
   * @param {Array} patterns - Array of patterns to analyze
   * @returns {Object} Summary statistics
   */
  generateSummary(patterns) {
    const analyzed = this.analyzePatterns(patterns);
    
    return {
      total: patterns.length,
      withVariables: analyzed.filter(p => p.hasVariables).length,
      withXOnly: analyzed.filter(p => p.hasXVariable && !p.hasYVariable).length,
      withYOnly: analyzed.filter(p => p.hasYVariable && !p.hasXVariable).length,
      multiVariable: analyzed.filter(p => p.isMultiVariable).length,
      compositeEligible: analyzed.filter(p => p.compositeEligible).length,
      phaseAEligible: analyzed.filter(p => p.allowAsPatternVariable === true).length,
      validationIssues: analyzed
        .map(p => this.validatePattern(p))
        .filter(v => !v.valid).length
    };
  }
}

export default PatternAnalyzer;