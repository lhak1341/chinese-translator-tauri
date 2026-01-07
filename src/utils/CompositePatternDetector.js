/**
 * CompositePatternDetector - Detects and generates composite pattern translations
 *
 * Identifies when Phase A variable patterns can be absorbed into Phase B patterns
 * to create more coherent composite translations.
 *
 * Example: Phase A "这位X" + Phase B "X的耳朵里" = Composite "这位部长的耳朵里"
 *
 * @import {
 *   PhaseAResult,
 *   PhaseBResult,
 *   CompositePatternResult,
 *   AbsorptionInfo,
 *   PatternVariable,
 *   VariableExtractorConfig,
 *   CompositeGeneratorConfig,
 *   VariableExtractionResult,
 *   CompositeDetectionConfig
 * } from '../types/PatternProcessingTypes'
 */
class CompositePatternDetector {
  constructor(options = {}) {
    this.options = {
      debugMode: false,
      maxCompositeSpan: 20, // Maximum token span for composite patterns
      ...options,
    };

    this.variableExtractor = new VariableExtractor(this.options);
    this.compositeGenerator = new CompositeGenerator(this.options);
  }

  /**
   * Detect composite opportunities between Phase A and Phase B results
   * @param {Array} phaseAResults - Phase A variable pattern results
   * @param {Array} phaseBCandidates - Phase B pattern candidates
   * @param {Array} tokens - Token array for context analysis
   * @returns {Array} Array of composite pattern opportunities
   */
  detectComposites(phaseAResults, phaseBCandidates, tokens) {
    const composites = [];

    for (const phaseAResult of phaseAResults) {
      for (const phaseBCandidate of phaseBCandidates) {
        // Only process composite eligible patterns (single-variable patterns)
        if (phaseBCandidate.pattern && phaseBCandidate.pattern.compositeEligible) {
          const composite = this.tryCreateComposite(phaseAResult, phaseBCandidate, tokens);
          if (composite) {
            composites.push(composite);

            if (this.options.debugMode) {
              console.log('Composite detected:', {
                phaseA: phaseAResult.originalText,
                phaseB: phaseBCandidate.originalText,
                composite: composite.originalText,
              });
            }
          }
        }
      }
    }

    return composites;
  }

  /**
   * Attempt to create a composite from Phase A and Phase B patterns
   * @param {Object} phaseAResult - Phase A pattern result
   * @param {Object} phaseBCandidate - Phase B pattern candidate
   * @param {Array} tokens - Token array
   * @returns {Object|null} Composite result or null if not possible
   */
  tryCreateComposite(phaseAResult, phaseBCandidate, tokens) {
    // Check if Phase A variable can be absorbed into Phase B pattern
    const absorption = this.findAbsorptionPattern(phaseAResult, phaseBCandidate, tokens);

    if (absorption) {
      return this.compositeGenerator.generateComposite(
        phaseAResult,
        phaseBCandidate,
        absorption,
        tokens
      );
    }

    return null;
  }

  /**
   * Find if Phase A result can be absorbed into Phase B pattern
   * @param {Object} phaseAResult - Phase A result
   * @param {Object} phaseBCandidate - Phase B candidate
   * @param {Array} tokens - Token array
   * @returns {Object|null} Absorption information or null
   */
  findAbsorptionPattern(phaseAResult, phaseBCandidate, tokens) {
    // Extract what variable X represented in Phase A
    const phaseAVariable = this.variableExtractor.extractPhaseAVariable(phaseAResult, tokens);

    // Extract what Phase B pattern wants as X variable
    const phaseBVariable = this.variableExtractor.extractPhaseBVariable(phaseBCandidate, tokens);

    // Check if they can be absorbed (same variable content)
    if (this.variableExtractor.canAbsorb(phaseAVariable, phaseBVariable)) {
      return {
        phaseAVariable,
        phaseBVariable,
        absorptionType: 'variable_match',
        confidence: this.calculateAbsorptionConfidence(phaseAResult, phaseBCandidate, tokens),
      };
    }

    return null;
  }

  /**
   * Calculate confidence score for absorption
   * @param {Object} phaseAResult - Phase A result
   * @param {Object} phaseBCandidate - Phase B candidate
   * @param {Array} tokens - Token array
   * @returns {number} Confidence score (0-1)
   */
  calculateAbsorptionConfidence(phaseAResult, phaseBCandidate, _tokens) {
    let confidence = 0.8; // Base confidence for valid absorption

    // Bonus for adjacent or overlapping patterns
    const gap = phaseBCandidate.startIndex - phaseAResult.endIndex;
    if (gap <= 1) {
      confidence += 0.1; // Adjacent patterns are more likely to form composites
    }

    // Penalty for very long spans
    const totalSpan = phaseBCandidate.endIndex - phaseAResult.startIndex;
    if (totalSpan > this.options.maxCompositeSpan) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Validate composite opportunity against constraints
   * @param {Object} phaseAResult - Phase A result
   * @param {Object} phaseBCandidate - Phase B candidate
   * @param {Array} tokens - Token array
   * @returns {boolean} True if composite is valid
   */
  validateComposite(phaseAResult, phaseBCandidate, _tokens) {
    // Check token span constraint
    const totalSpan = phaseBCandidate.endIndex - phaseAResult.startIndex;
    if (totalSpan > this.options.maxCompositeSpan) {
      return false;
    }

    // Check for token overlap conflicts
    if (this.hasTokenOverlap(phaseAResult, phaseBCandidate)) {
      return false;
    }

    // Ensure Phase B pattern is composite eligible
    if (!phaseBCandidate.pattern?.compositeEligible) {
      return false;
    }

    return true;
  }

  /**
   * Check if two results have overlapping token ranges
   * @param {Object} resultA - First result
   * @param {Object} resultB - Second result
   * @returns {boolean} True if there's overlap
   */
  hasTokenOverlap(resultA, resultB) {
    return !(resultA.endIndex < resultB.startIndex || resultB.endIndex < resultA.startIndex);
  }
}

/**
 * VariableExtractor - Extracts and analyzes pattern variables
 */
class VariableExtractor {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Extract what variable X represented in Phase A pattern
   * @param {Object} phaseAResult - Phase A pattern result
   * @param {Array} tokens - Token array for text reconstruction
   * @returns {Object} Variable information
   */
  extractPhaseAVariable(phaseAResult, _tokens) {
    const pattern = phaseAResult.pattern?.originalPattern;
    const matchedText = phaseAResult.originalText;

    if (!pattern || !matchedText) {
      return null;
    }

    // Find where X is in the pattern and extract corresponding text
    const xIndex = pattern.indexOf('X');
    if (xIndex === -1) {
      return null;
    }

    // Split pattern around X to find prefix and suffix
    const prefix = pattern.substring(0, xIndex);
    const suffix = pattern.substring(xIndex + 1);

    // Extract variable text by removing prefix and suffix from matched text
    let variableText = matchedText;
    if (prefix) {
      variableText = variableText.replace(prefix, '');
    }
    if (suffix) {
      variableText = variableText.replace(new RegExp(suffix + '$'), '');
    }

    return {
      text: variableText.trim(),
      fullTranslation: phaseAResult.translation,
      position: {
        start: phaseAResult.startIndex + (prefix ? prefix.length : 0),
        end: phaseAResult.endIndex - (suffix ? suffix.length : 0),
      },
      source: 'phaseA',
    };
  }

  /**
   * Extract what Phase B pattern wants as X variable
   * @param {Object} phaseBCandidate - Phase B pattern candidate
   * @param {Array} tokens - Token array
   * @returns {Object} Variable requirement information
   */
  extractPhaseBVariable(phaseBCandidate, tokens) {
    const pattern = phaseBCandidate.pattern?.originalPattern;
    const candidateText = this.getTokenText(phaseBCandidate, tokens);

    if (!pattern || !candidateText) {
      return null;
    }

    // Find where X is in the pattern
    const xIndex = pattern.indexOf('X');
    if (xIndex === -1) {
      return null;
    }

    // Split pattern around X
    const prefix = pattern.substring(0, xIndex);
    const suffix = pattern.substring(xIndex + 1);

    // Extract what text would fill the X variable
    let variableText = candidateText;
    if (prefix) {
      variableText = variableText.replace(prefix, '');
    }
    if (suffix) {
      variableText = variableText.replace(new RegExp(suffix + '$'), '');
    }

    return {
      text: variableText.trim(),
      requiredBy: pattern,
      source: 'phaseB',
    };
  }

  /**
   * Check if Phase A variable can be absorbed by Phase B pattern
   * @param {Object} phaseAVariable - Phase A variable info
   * @param {Object} phaseBVariable - Phase B variable requirement
   * @returns {boolean} True if absorption is possible
   */
  canAbsorb(phaseAVariable, phaseBVariable) {
    if (!phaseAVariable || !phaseBVariable) {
      return false;
    }

    // Simple text match for now - can be enhanced with fuzzy matching
    return phaseAVariable.text === phaseBVariable.text;
  }

  /**
   * Get text content for a token range
   * @param {Object} result - Result with startIndex and endIndex
   * @param {Array} tokens - Token array
   * @returns {string} Concatenated text
   */
  getTokenText(result, tokens) {
    if (!result || typeof result.startIndex !== 'number' || typeof result.endIndex !== 'number') {
      return '';
    }

    const textParts = [];
    for (let i = result.startIndex; i <= result.endIndex; i++) {
      if (tokens[i] && tokens[i].value) {
        textParts.push(tokens[i].value);
      }
    }

    return textParts.join('');
  }
}

/**
 * CompositeGenerator - Generates composite pattern translations
 */
class CompositeGenerator {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Generate composite translation from Phase A and Phase B components
   * @param {Object} phaseAResult - Phase A result
   * @param {Object} phaseBCandidate - Phase B candidate
   * @param {Object} absorption - Absorption information
   * @param {Array} tokens - Token array
   * @returns {Object} Composite result
   */
  generateComposite(phaseAResult, phaseBCandidate, absorption, tokens) {
    // Calculate composite span
    const startIndex = Math.min(phaseAResult.startIndex, phaseBCandidate.startIndex);
    const endIndex = Math.max(phaseAResult.endIndex, phaseBCandidate.endIndex);

    // Generate composite translation by substituting Phase A translation into Phase B template
    const phaseBTemplate = phaseBCandidate.pattern?.template || phaseBCandidate.translation;
    const compositeTranslation = phaseBTemplate.replace('X', phaseAResult.translation);

    // Get original text span
    const originalText = this.getSpannedText(startIndex, endIndex, tokens);

    return {
      type: 'composite',
      startIndex,
      endIndex,
      translation: compositeTranslation,
      originalText,
      confidence: absorption.confidence,

      // Composite metadata
      components: {
        phaseA: {
          result: phaseAResult,
          variable: absorption.phaseAVariable,
        },
        phaseB: {
          candidate: phaseBCandidate,
          variable: absorption.phaseBVariable,
        },
      },

      // Processing metadata
      translationSource: 'composite_pattern',
      absorptionType: absorption.absorptionType,

      // For debugging and analysis
      debug: this.options.debugMode
        ? {
            phaseAPattern: phaseAResult.pattern?.originalPattern,
            phaseBPattern: phaseBCandidate.pattern?.originalPattern,
            variableMatch: absorption.phaseAVariable?.text,
          }
        : undefined,
    };
  }

  /**
   * Get text content for a token span
   * @param {number} startIndex - Start token index
   * @param {number} endIndex - End token index
   * @param {Array} tokens - Token array
   * @returns {string} Spanned text
   */
  getSpannedText(startIndex, endIndex, tokens) {
    const textParts = [];
    for (let i = startIndex; i <= endIndex; i++) {
      if (tokens[i] && tokens[i].value) {
        textParts.push(tokens[i].value);
      }
    }
    return textParts.join('');
  }

  /**
   * Validate generated composite against quality constraints
   * @param {Object} composite - Generated composite
   * @returns {Object} Validation result
   */
  validateComposite(composite) {
    const issues = [];

    if (!composite.translation) {
      issues.push('Composite missing translation');
    }

    if (!composite.originalText) {
      issues.push('Composite missing original text');
    }

    if (composite.confidence < 0.5) {
      issues.push('Low confidence composite');
    }

    if (composite.endIndex - composite.startIndex > 20) {
      issues.push('Composite span too large');
    }

    return {
      valid: issues.length === 0,
      issues,
      composite,
    };
  }
}

export default CompositePatternDetector;
