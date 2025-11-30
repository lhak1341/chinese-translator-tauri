/**
 * Pattern Compiler for efficient template-based translation
 * Pre-compiles translation patterns into optimized regex and replacement functions
 */

export class CompiledPattern {
  constructor(originalPattern, template, regex, variableNames, replacementFunction) {
    this.originalPattern = originalPattern;
    this.template = template;
    this.regex = regex;
    this.variableNames = variableNames;
    this.replacementFunction = replacementFunction;
    this.matchCount = 0;
    this.totalMatchTime = 0;
  }

  /**
   * Apply this pattern to text
   * @param {string} text - Input text
   * @param {Function} variableResolver - Function to resolve variable values
   * @returns {Promise<string>} Text with pattern applied
   */
  async apply(text, variableResolver) {
    const startTime = performance.now();
    
    try {
      const result = await this.replacementFunction(text, variableResolver);
      this.matchCount++;
      this.totalMatchTime += performance.now() - startTime;
      return result;
    } catch (error) {
      console.error(`Error applying pattern ${this.originalPattern}:`, error);
      return text;
    }
  }

  getStats() {
    return {
      pattern: this.originalPattern,
      matchCount: this.matchCount,
      totalTime: this.totalMatchTime,
      avgTime: this.matchCount > 0 ? this.totalMatchTime / this.matchCount : 0
    };
  }
}

export class PatternCompiler {
  constructor() {
    this.compiledPatterns = new Map();
    this.patternStats = new Map();
  }

  /**
   * Compile a set of patterns for efficient matching
   * @param {Object} patterns - Pattern dictionary {pattern: template}
   * @returns {CompiledPattern[]} Array of compiled patterns
   */
  compilePatterns(patterns) {
    const compiled = [];
    
    // Sort patterns by complexity and length for optimal matching order
    const sortedPatterns = Object.entries(patterns).sort((a, b) => {
      // Prioritize patterns with more variables
      const aVars = (a[0].match(/[A-Z]/g) || []).length;
      const bVars = (b[0].match(/[A-Z]/g) || []).length;
      if (aVars !== bVars) return bVars - aVars;
      
      // Then by pattern length
      return b[0].length - a[0].length;
    });

    for (const [pattern, template] of sortedPatterns) {
      try {
        const compiledPattern = this.compilePattern(pattern, template);
        if (compiledPattern) {
          compiled.push(compiledPattern);
          this.compiledPatterns.set(pattern, compiledPattern);
        }
      } catch (error) {
        console.error(`Failed to compile pattern "${pattern}":`, error);
      }
    }

    return compiled;
  }

  /**
   * Compile a single pattern into optimized regex and replacement function
   * @param {string} pattern - Pattern with variables (e.g., "X的手")
   * @param {string} template - Template for replacement (e.g., "tay của X")
   * @returns {CompiledPattern} Compiled pattern object
   */
  compilePattern(pattern, template) {
    const variableNames = this.extractVariables(pattern);
    const regex = this.buildRegex(pattern, variableNames);
    
    if (!regex) {
      console.warn(`Could not build regex for pattern: ${pattern}`);
      return null;
    }

    const replacementFunction = this.buildReplacementFunction(template, variableNames, regex);

    return new CompiledPattern(
      pattern,
      template,
      regex,
      variableNames,
      replacementFunction
    );
  }

  /**
   * Extract variable names from pattern (currently supports single character variables)
   * @param {string} pattern - Pattern string
   * @returns {string[]} Array of variable names
   */
  extractVariables(pattern) {
    const variables = [];
    const matches = pattern.match(/[A-Z]/g);
    
    if (matches) {
      // Remove duplicates and sort for consistent ordering
      variables.push(...new Set(matches).values());
    }
    
    return variables;
  }

  /**
   * Build optimized regex from pattern
   * @param {string} pattern - Pattern string
   * @param {string[]} variableNames - Variable names in pattern
   * @returns {RegExp} Compiled regex
   */
  buildRegex(pattern, variableNames) {
    let regexPattern = this.escapeRegExp(pattern);
    
    // Replace variables with appropriate capture groups
    variableNames.forEach((variable, _index) => {
      const variableRegex = this.getVariableRegex(variable, pattern);
      regexPattern = regexPattern.replace(
        new RegExp(this.escapeRegExp(variable), 'g'),
        `(${variableRegex})`
      );
    });

    // Add word boundaries to prevent partial matches
    regexPattern = this.addWordBoundaries(regexPattern, pattern);

    try {
      return new RegExp(regexPattern, 'g');
    } catch (error) {
      console.error(`Invalid regex pattern: ${regexPattern}`, error);
      return null;
    }
  }

  /**
   * Get appropriate regex for variable based on context
   * @param {string} variable - Variable name
   * @param {string} pattern - Full pattern for context
   * @returns {string} Regex string for the variable
   */
  getVariableRegex(variable, pattern) {
    // For patterns that end with X (like "这些X"), use non-greedy but try shortest first
    if (pattern.endsWith(variable)) {
      return '[一-龥]{1,2}'; // Match 1-2 Chinese characters for end-of-pattern variables (most words are 1-2 chars)
    }
    
    // For patterns with X in the middle (like "在X中"), use greedy matching
    if (pattern.includes('的') || pattern.includes('在')) {
      return '[一-龥]+'; // Greedy Chinese characters for better word capture
    }
    
    // Default to moderate length matching
    return '[一-龥]{1,2}';
  }

  /**
   * Add appropriate word boundaries to prevent partial matches
   * @param {string} regexPattern - Base regex pattern
   * @param {string} originalPattern - Original pattern for context
   * @returns {string} Pattern with word boundaries
   */
  addWordBoundaries(regexPattern, originalPattern) {
    // For Chinese structural patterns with variables, don't add restrictive boundaries
    // as they need to match within longer sentences
    if (/[一-龥]/.test(originalPattern) && originalPattern.includes('X')) {
      // Structural patterns like "X脸上" should match within sentences like "奚平脸上露出"
      return regexPattern;
    }
    
    // For non-variable Chinese patterns, use negative lookahead to prevent partial matches
    if (/[一-龥]/.test(originalPattern)) {
      return `${regexPattern}(?![一-龥])`;
    }
    
    return regexPattern;
  }

  /**
   * Build replacement function for efficient substitution
   * @param {string} template - Replacement template
   * @param {string[]} variableNames - Variable names in order
   * @param {RegExp} regex - Compiled regex
   * @returns {Function} Async replacement function
   */
  buildReplacementFunction(template, variableNames, regex) {
    return async (text, variableResolver) => {
      return await this.replaceAsync(text, regex, async (...args) => {
        const _match = args[0];
        const captureGroups = args.slice(1, -2); // Remove offset and string from args
        
        // Resolve variables using the provided resolver
        const resolvedVariables = new Map();
        
        for (let i = 0; i < variableNames.length && i < captureGroups.length; i++) {
          const variableName = variableNames[i];
          const capturedValue = captureGroups[i];
          
          if (capturedValue && variableResolver) {
            const resolvedValue = await variableResolver(capturedValue, variableName);
            resolvedVariables.set(variableName, resolvedValue);
          } else {
            resolvedVariables.set(variableName, capturedValue);
          }
        }

        // Replace variables in template
        let result = template;
        variableNames.forEach(variable => {
          const value = resolvedVariables.get(variable) || variable;
          result = result.replace(new RegExp(this.escapeRegExp(variable), 'g'), value);
        });

        return result;
      });
    };
  }

  /**
   * Async string replacement helper
   * @param {string} str - Input string
   * @param {RegExp} regex - Regex pattern
   * @param {Function} asyncFn - Async replacement function
   * @returns {Promise<string>} String with replacements
   */
  async replaceAsync(str, regex, asyncFn) {
    const promises = [];
    const matches = [];
    
    // Collect all matches and their replacement promises
    str.replace(regex, (...args) => {
      matches.push({
        match: args[0],
        offset: args[args.length - 2],
        fullArgs: args
      });
      promises.push(asyncFn(...args));
      return args[0];
    });

    if (promises.length === 0) {
      return str;
    }

    // Wait for all replacements to resolve
    const replacements = await Promise.all(promises);
    
    // Apply replacements in reverse order to maintain string positions
    let result = str;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const match = matches[i];
      const replacement = replacements[i];
      
      // Only replace if we got a valid replacement
      if (replacement !== null && replacement !== undefined) {
        result = result.substring(0, match.offset) + 
                replacement + 
                result.substring(match.offset + match.match.length);
      }
    }
    
    return result;
  }

  /**
   * Escape special regex characters
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get performance statistics for compiled patterns
   * @returns {Object} Performance stats
   */
  getStats() {
    const stats = Array.from(this.compiledPatterns.values()).map(pattern => pattern.getStats());
    
    return {
      totalPatterns: this.compiledPatterns.size,
      patterns: stats,
      totalMatches: stats.reduce((sum, s) => sum + s.matchCount, 0),
      totalTime: stats.reduce((sum, s) => sum + s.totalTime, 0),
      avgTimePerPattern: stats.length > 0 
        ? stats.reduce((sum, s) => sum + s.avgTime, 0) / stats.length 
        : 0
    };
  }

  /**
   * Clear all compiled patterns and stats
   */
  clear() {
    this.compiledPatterns.clear();
    this.patternStats.clear();
  }

  /**
   * Get compiled pattern for debugging
   * @param {string} pattern - Original pattern
   * @returns {CompiledPattern|null} Compiled pattern if exists
   */
  getCompiledPattern(pattern) {
    return this.compiledPatterns.get(pattern) || null;
  }
}

// Factory function
export const createPatternCompiler = () => new PatternCompiler();

// Utility function to test pattern compilation
export const testPatternCompilation = async (patterns, testText, variableResolver) => {
  const compiler = new PatternCompiler();
  const compiled = compiler.compilePatterns(patterns);
  
  console.log(`Compiled ${compiled.length} patterns`);
  
  let result = testText;
  for (const pattern of compiled) {
    const before = result;
    result = await pattern.apply(result, variableResolver);
    
    if (result !== before) {
      console.log(`Pattern "${pattern.originalPattern}" matched:`, before, '->', result);
    }
  }
  
  console.log('Final result:', result);
  console.log('Performance stats:', compiler.getStats());
  
  return { result, stats: compiler.getStats() };
};