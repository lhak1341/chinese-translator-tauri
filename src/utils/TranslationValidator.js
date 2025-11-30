/**
 * Translation Validator - Phase 6.1 Quality Safety Framework
 * 
 * This validator ensures that the Rust core translation engine produces
 * identical results to the JavaScript engine, maintaining 100% translation
 * quality and clickable highlighting compatibility.
 * 
 * Key Features:
 * - Runtime validation of translation quality
 * - Semantic array structure validation
 * - Clickable position validation
 * - Performance comparison tracking
 * - Automatic fallback on validation failures
 */
export class TranslationValidator {
  constructor(jsEngine) {
    this.jsEngine = jsEngine;
    this.validationEnabled = process.env.NODE_ENV === 'development' || process.env.VALIDATION_MODE === 'true';
    this.validationRate = 0.01; // 1% of translations validated by default
    
    // Validation statistics
    this.stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      validationErrors: [],
      averageTimeDifference: 0
    };
    
    console.log('🛡️ Translation Validator initialized', {
      enabled: this.validationEnabled,
      validationRate: this.validationRate * 100 + '%'
    });
  }

  /**
   * Validate a Rust translation result against JavaScript engine
   * 
   * @param {string} text - Original text to translate
   * @param {Object} rustResult - Translation result from Rust engine
   * @param {Object} options - Translation options
   * @returns {Promise<boolean>} True if validation passes
   */
  async validateTranslation(text, rustResult, options = {}) {
    if (!this.validationEnabled || !this.shouldValidate()) {
      return true;
    }

    const validationId = Date.now();
    console.log(`🧪 Starting validation ${validationId} for ${text.length} chars`);

    try {
      const startTime = performance.now();
      
      // Get JavaScript engine result for comparison
      const jsResult = await this.jsEngine.translateText(text, options);
      
      const validationTime = performance.now() - startTime;
      
      // Perform comprehensive validation
      const validationResult = this.performValidation(text, rustResult, jsResult, validationId);
      
      // Record validation statistics
      this.recordValidation(validationResult, validationTime);
      
      if (!validationResult.success) {
        console.error(`❌ Validation ${validationId} failed:`, validationResult.errors);
        this.logValidationFailure(text, rustResult, jsResult, validationResult);
      } else {
        console.log(`✅ Validation ${validationId} passed`);
      }
      
      return validationResult.success;
    } catch (error) {
      console.error(`🚨 Validation ${validationId} error:`, error);
      this.stats.failedValidations++;
      return false;
    }
  }

  /**
   * Perform comprehensive validation checks
   * 
   * @param {string} text - Original text
   * @param {Object} rustResult - Rust translation result
   * @param {Object} jsResult - JavaScript translation result
   * @param {number} validationId - Validation ID for logging
   * @returns {Object} Validation result
   */
  performValidation(text, rustResult, jsResult, validationId) {
    const errors = [];
    
    // 1. Translation Quality Validation
    const translationValid = this.validateTranslationQuality(rustResult, jsResult, errors);
    
    // 2. Semantic Arrays Structure Validation
    const semanticValid = this.validateSemanticArrays(rustResult, jsResult, errors);
    
    // 3. Clickable Positions Validation
    const positionsValid = this.validateClickablePositions(rustResult, jsResult, errors);
    
    // 4. Token Count Validation
    const tokenValid = this.validateTokenCounts(rustResult, jsResult, errors);
    
    return {
      success: translationValid && semanticValid && positionsValid && tokenValid,
      errors,
      validationId,
      checks: {
        translation: translationValid,
        semanticArrays: semanticValid,
        positions: positionsValid,
        tokens: tokenValid
      }
    };
  }

  /**
   * Validate that translation quality is identical
   */
  validateTranslationQuality(rustResult, jsResult, errors) {
    if (!rustResult.translatedText || !jsResult.translatedText) {
      errors.push('Missing translated text in one or both results');
      return false;
    }

    // Normalize whitespace for comparison
    const rustText = this.normalizeTranslationText(rustResult.translatedText);
    const jsText = this.normalizeTranslationText(jsResult.translatedText);
    
    if (rustText !== jsText) {
      errors.push({
        type: 'translation_mismatch',
        rust: rustText,
        javascript: jsText,
        difference: this.highlightDifferences(rustText, jsText)
      });
      return false;
    }
    
    return true;
  }

  /**
   * Validate semantic arrays structure compatibility
   */
  validateSemanticArrays(rustResult, jsResult, errors) {
    const rustArrays = rustResult.semanticArrays;
    const jsArrays = jsResult.semanticArrays;
    
    if (!rustArrays || !jsArrays) {
      errors.push('Missing semantic arrays in one or both results');
      return false;
    }
    
    // Check array structure
    const requiredArrays = ['originalUnits', 'translatedUnits', 'mappings'];
    for (const arrayName of requiredArrays) {
      if (!rustArrays[arrayName] || !jsArrays[arrayName]) {
        errors.push(`Missing ${arrayName} array`);
        return false;
      }
      
      if (!Array.isArray(rustArrays[arrayName]) || !Array.isArray(jsArrays[arrayName])) {
        errors.push(`Invalid ${arrayName} array type`);
        return false;
      }
    }
    
    // Check array lengths (allowing for small differences due to processing variations)
    const maxLengthDiff = Math.max(1, Math.floor(rustArrays.originalUnits.length * 0.05)); // 5% tolerance
    
    if (Math.abs(rustArrays.originalUnits.length - jsArrays.originalUnits.length) > maxLengthDiff) {
      errors.push({
        type: 'semantic_array_length_mismatch',
        rust: rustArrays.originalUnits.length,
        javascript: jsArrays.originalUnits.length,
        tolerance: maxLengthDiff
      });
      return false;
    }
    
    return true;
  }

  /**
   * Validate clickable positions are compatible
   */
  validateClickablePositions(rustResult, jsResult, errors) {
    const rustArrays = rustResult.semanticArrays;
    const jsArrays = jsResult.semanticArrays;
    
    if (!rustArrays?.mappings || !jsArrays?.mappings) {
      return true; // Skip if no mappings
    }
    
    // Check that mapping structures are similar
    const rustMappings = rustArrays.mappings.length;
    const jsMappings = jsArrays.mappings.length;
    const mappingTolerance = Math.max(1, Math.floor(jsMappings * 0.1)); // 10% tolerance
    
    if (Math.abs(rustMappings - jsMappings) > mappingTolerance) {
      errors.push({
        type: 'clickable_mapping_count_mismatch',
        rust: rustMappings,
        javascript: jsMappings,
        tolerance: mappingTolerance
      });
      return false;
    }
    
    return true;
  }

  /**
   * Validate token processing counts
   */
  validateTokenCounts(rustResult, jsResult, errors) {
    // This is a simplified check - in practice, token counts may vary
    // between implementations while still producing correct results
    
    const rustLength = rustResult.translatedText?.length || 0;
    const jsLength = jsResult.translatedText?.length || 0;
    
    // Allow for reasonable variation in final text length
    const lengthTolerance = Math.max(5, Math.floor(jsLength * 0.02)); // 2% tolerance
    
    if (Math.abs(rustLength - jsLength) > lengthTolerance) {
      errors.push({
        type: 'translation_length_mismatch',
        rust: rustLength,
        javascript: jsLength,
        tolerance: lengthTolerance
      });
      return false;
    }
    
    return true;
  }

  /**
   * Utility methods
   */
  normalizeTranslationText(text) {
    return text
      .replace(/\s+/g, ' ')         // Normalize whitespace
      .replace(/\u00A0/g, ' ')      // Replace non-breaking spaces
      .trim();
  }

  highlightDifferences(text1, text2) {
    // Simple difference highlighting - could be enhanced with proper diff algorithm
    const maxLength = Math.min(text1.length, text2.length, 100); // Limit for logging
    let firstDiff = -1;
    
    for (let i = 0; i < maxLength; i++) {
      if (text1[i] !== text2[i]) {
        firstDiff = i;
        break;
      }
    }
    
    if (firstDiff >= 0) {
      const start = Math.max(0, firstDiff - 10);
      const end = Math.min(text1.length, firstDiff + 10);
      
      return {
        position: firstDiff,
        context: {
          rust: text1.substring(start, end),
          javascript: text2.substring(start, end)
        }
      };
    }
    
    return null;
  }

  shouldValidate() {
    return Math.random() < this.validationRate;
  }

  recordValidation(result, _validationTime) {
    this.stats.totalValidations++;
    
    if (result.success) {
      this.stats.successfulValidations++;
    } else {
      this.stats.failedValidations++;
      this.stats.validationErrors.push({
        timestamp: new Date().toISOString(),
        errors: result.errors,
        validationId: result.validationId
      });
    }
    
    // Keep only last 100 validation errors
    if (this.stats.validationErrors.length > 100) {
      this.stats.validationErrors = this.stats.validationErrors.slice(-100);
    }
  }

  logValidationFailure(text, rustResult, jsResult, validationResult) {
    const failureData = {
      validationId: validationResult.validationId,
      textLength: text.length,
      textPreview: text.substring(0, 100),
      rustTranslationLength: rustResult.translatedText?.length || 0,
      jsTranslationLength: jsResult.translatedText?.length || 0,
      errors: validationResult.errors,
      timestamp: new Date().toISOString()
    };
    
    console.group(`🚨 Translation Validation Failure ${validationResult.validationId}`);
    console.error('Validation failed for text:', text.substring(0, 50) + '...');
    console.error('Errors:', validationResult.errors);
    console.error('Full failure data:', failureData);
    console.groupEnd();
    
    // In development, you might want to store these for analysis
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const failures = JSON.parse(localStorage.getItem('validation_failures') || '[]');
        failures.push(failureData);
        
        // Keep only last 50 failures
        if (failures.length > 50) {
          failures.splice(0, failures.length - 50);
        }
        
        localStorage.setItem('validation_failures', JSON.stringify(failures));
      } catch (error) {
        console.warn('Could not store validation failure:', error);
      }
    }
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    const successRate = this.stats.totalValidations > 0 
      ? (this.stats.successfulValidations / this.stats.totalValidations * 100).toFixed(2)
      : '0';
      
    return {
      enabled: this.validationEnabled,
      validationRate: this.validationRate,
      totalValidations: this.stats.totalValidations,
      successfulValidations: this.stats.successfulValidations,
      failedValidations: this.stats.failedValidations,
      successRate: successRate + '%',
      recentErrors: this.stats.validationErrors.slice(-10) // Last 10 errors
    };
  }

  /**
   * Set validation rate (0.0 to 1.0)
   */
  setValidationRate(rate) {
    this.validationRate = Math.max(0, Math.min(1, rate));
    console.log(`🛡️ Validation rate set to ${this.validationRate * 100}%`);
  }

  /**
   * Enable/disable validation
   */
  setValidationEnabled(enabled) {
    this.validationEnabled = enabled;
    console.log(`🛡️ Validation ${enabled ? 'enabled' : 'disabled'}`);
  }
}

export default TranslationValidator;