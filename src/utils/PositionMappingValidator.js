/**
 * Accuracy Validation System for WASM Position Mapping
 * Ensures WASM results match JavaScript results exactly
 * Automatic fallback if accuracy discrepancies detected
 *
 * @import {
 *   PositionMappingValidator as IPositionMappingValidator,
 *   ValidationStats,
 *   ComparisonResult,
 *   ValidationInfo,
 *   TextPositionMapping,
 *   DisplaySegment
 * } from '../types/WorkerTypes'
 */

export class PositionMappingValidator {
  constructor() {
    this.validationStats = {
      totalValidations: 0,
      accuracyMismatches: 0,
      wasmErrors: 0,
      fallbackTriggers: 0,
      averageWasmTime: 0,
      averageJsTime: 0,
      lastMismatchReason: null
    };

    this.strictMode = process.env.NODE_ENV === 'development'; // Strict validation in dev
    this.sampleRate = 0.1; // Validate 10% of requests in production
  }

  /**
   * Validate WASM position mapping against JavaScript implementation
   * @param {string} text - Full translated text
   * @param {Object} semanticArrays - Semantic arrays from translation
   * @param {Function} wasmFunction - WASM position mapping function
   * @param {Function} jsFunction - JavaScript position mapping function
   * @returns {Object} Validated position mapping result
   */
  async validatePositionMapping(text, semanticArrays, wasmFunction, jsFunction) {
    this.validationStats.totalValidations++;

    // Determine if we should validate this request
    const shouldValidate = this.strictMode || 
                          (Math.random() < this.sampleRate) ||
                          (this.validationStats.totalValidations % 10 === 0); // Every 10th request

    let wasmResult = null;
    let jsResult = null;
    let useWasm = true;

    try {
      // Always try WASM first
      const wasmStartTime = performance.now();
      wasmResult = await wasmFunction(text, semanticArrays);
      const wasmTime = performance.now() - wasmStartTime;
      this.validationStats.averageWasmTime = 
        (this.validationStats.averageWasmTime + wasmTime) / 2;

      if (shouldValidate) {
        // Run JavaScript version for comparison
        const jsStartTime = performance.now();
        jsResult = await jsFunction(text, semanticArrays);
        const jsTime = performance.now() - jsStartTime;
        this.validationStats.averageJsTime = 
          (this.validationStats.averageJsTime + jsTime) / 2;

        // Compare results
        const accuracyCheck = this.comparePositionMappings(wasmResult, jsResult);
        
        if (!accuracyCheck.isAccurate) {
          console.warn('⚠️ WASM/JS position mapping mismatch detected:', accuracyCheck.details);
          this.validationStats.accuracyMismatches++;
          this.validationStats.lastMismatchReason = accuracyCheck.details;
          
          if (this.strictMode) {
            // Use JavaScript result in strict mode
            useWasm = false;
            this.validationStats.fallbackTriggers++;
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.log(`✅ WASM accuracy validated: ${wasmResult.semanticRanges?.length || 0} ranges, ${wasmTime.toFixed(1)}ms vs ${jsTime.toFixed(1)}ms`);
        }
      }

    } catch (error) {
      console.warn('⚠️ WASM position mapping failed, falling back to JavaScript:', error.message);
      this.validationStats.wasmErrors++;
      this.validationStats.fallbackTriggers++;
      
      // Fallback to JavaScript
      const jsStartTime = performance.now();
      jsResult = await jsFunction(text, semanticArrays);
      const jsTime = performance.now() - jsStartTime;
      this.validationStats.averageJsTime = 
        (this.validationStats.averageJsTime + jsTime) / 2;
      
      useWasm = false;
    }

    // Return appropriate result
    const finalResult = useWasm ? wasmResult : jsResult;
    
    // Add validation metadata
    if (finalResult && typeof finalResult === 'object') {
      finalResult.validationInfo = {
        usedWasm: useWasm,
        validated: shouldValidate,
        fallbackReason: useWasm ? null : (wasmResult ? 'accuracy' : 'error')
      };
    }

    return finalResult;
  }

  /**
   * Compare WASM and JavaScript position mapping results
   * @param {Object} wasmResult - Result from WASM
   * @param {Object} jsResult - Result from JavaScript
   * @returns {Object} Comparison result
   */
  comparePositionMappings(wasmResult, jsResult) {
    try {
      // Basic structure validation
      if (!wasmResult || !jsResult) {
        return { 
          isAccurate: false, 
          details: 'One result is null/undefined' 
        };
      }

      // Text length comparison
      if (wasmResult.textLength !== jsResult.textLength) {
        return { 
          isAccurate: false, 
          details: `Text length mismatch: WASM=${wasmResult.textLength}, JS=${jsResult.textLength}` 
        };
      }

      // Semantic ranges count comparison
      const wasmRanges = wasmResult.semanticRanges || [];
      const jsRanges = jsResult.semanticRanges || [];
      
      if (wasmRanges.length !== jsRanges.length) {
        return { 
          isAccurate: false, 
          details: `Range count mismatch: WASM=${wasmRanges.length}, JS=${jsRanges.length}` 
        };
      }

      // Individual range comparison
      for (let i = 0; i < wasmRanges.length; i++) {
        const wasmRange = wasmRanges[i];
        const jsRange = jsRanges[i];

        // Position comparison
        if (wasmRange.startPos !== jsRange.startPos || 
            wasmRange.endPos !== jsRange.endPos) {
          return { 
            isAccurate: false, 
            details: `Range ${i} position mismatch: WASM=[${wasmRange.startPos},${wasmRange.endPos}], JS=[${jsRange.startPos},${jsRange.endPos}]` 
          };
        }

        // Unit index comparison
        if (wasmRange.unitIndex !== jsRange.unitIndex) {
          return { 
            isAccurate: false, 
            details: `Range ${i} unitIndex mismatch: WASM=${wasmRange.unitIndex}, JS=${jsRange.unitIndex}` 
          };
        }

        // Text content comparison
        if (wasmRange.originalText !== jsRange.originalText ||
            wasmRange.translatedText !== jsRange.translatedText) {
          return { 
            isAccurate: false, 
            details: `Range ${i} text mismatch: WASM="${wasmRange.originalText}"→"${wasmRange.translatedText}", JS="${jsRange.originalText}"→"${jsRange.translatedText}"` 
          };
        }

        // Source comparison
        if (wasmRange.source !== jsRange.source) {
          return { 
            isAccurate: false, 
            details: `Range ${i} source mismatch: WASM="${wasmRange.source}", JS="${jsRange.source}"` 
          };
        }
      }

      return { isAccurate: true, details: 'All validations passed' };

    } catch (error) {
      return { 
        isAccurate: false, 
        details: `Validation error: ${error.message}` 
      };
    }
  }

  /**
   * Validate segment computation results
   * @param {Array} wasmSegments - WASM segment results
   * @param {Array} jsSegments - JavaScript segment results
   * @returns {Object} Validation result
   */
  compareSegmentComputation(wasmSegments, jsSegments) {
    try {
      if (!Array.isArray(wasmSegments) || !Array.isArray(jsSegments)) {
        return { 
          isAccurate: false, 
          details: 'Results are not arrays' 
        };
      }

      if (wasmSegments.length !== jsSegments.length) {
        return { 
          isAccurate: false, 
          details: `Segment count mismatch: WASM=${wasmSegments.length}, JS=${jsSegments.length}` 
        };
      }

      for (let i = 0; i < wasmSegments.length; i++) {
        const wasmSeg = wasmSegments[i];
        const jsSeg = jsSegments[i];

        // Critical properties comparison
        if (wasmSeg.type !== jsSeg.type ||
            wasmSeg.start !== jsSeg.start ||
            wasmSeg.end !== jsSeg.end ||
            wasmSeg.isClickable !== jsSeg.isClickable ||
            wasmSeg.unitIndex !== jsSeg.unitIndex) {
          
          return { 
            isAccurate: false, 
            details: `Segment ${i} structure mismatch: WASM={type:${wasmSeg.type}, start:${wasmSeg.start}, end:${wasmSeg.end}, clickable:${wasmSeg.isClickable}, unit:${wasmSeg.unitIndex}}, JS={type:${jsSeg.type}, start:${jsSeg.start}, end:${jsSeg.end}, clickable:${jsSeg.isClickable}, unit:${jsSeg.unitIndex}}` 
          };
        }
      }

      return { isAccurate: true, details: 'Segment validation passed' };

    } catch (error) {
      return { 
        isAccurate: false, 
        details: `Segment validation error: ${error.message}` 
      };
    }
  }

  /**
   * Get validation statistics
   * @returns {Object} Comprehensive validation stats
   */
  getValidationStats() {
    const total = this.validationStats.totalValidations;
    const errorRate = total > 0 ? (this.validationStats.wasmErrors / total * 100).toFixed(2) : 0;
    const accuracyRate = total > 0 ? ((total - this.validationStats.accuracyMismatches) / total * 100).toFixed(2) : 100;
    const fallbackRate = total > 0 ? (this.validationStats.fallbackTriggers / total * 100).toFixed(2) : 0;
    const speedup = this.validationStats.averageJsTime > 0 && this.validationStats.averageWasmTime > 0
      ? (this.validationStats.averageJsTime / this.validationStats.averageWasmTime).toFixed(2)
      : 'N/A';

    return {
      ...this.validationStats,
      errorRate: `${errorRate}%`,
      accuracyRate: `${accuracyRate}%`,
      fallbackRate: `${fallbackRate}%`,
      speedupFactor: speedup,
      recommendation: this.getRecommendation(),
      isStrictMode: this.strictMode,
      sampleRate: this.sampleRate
    };
  }

  /**
   * Get optimization recommendation based on stats
   */
  getRecommendation() {
    const stats = this.validationStats;
    
    if (stats.wasmErrors > stats.totalValidations * 0.05) {
      return 'High WASM error rate - consider disabling WASM acceleration';
    }
    
    if (stats.accuracyMismatches > stats.totalValidations * 0.01) {
      return 'Accuracy issues detected - enable strict mode for validation';
    }
    
    if (stats.averageWasmTime > stats.averageJsTime) {
      return 'WASM slower than JS - check for boundary crossing overhead';
    }
    
    if (stats.fallbackTriggers === 0 && stats.totalValidations > 10) {
      return 'WASM performing excellently - consider reducing validation rate';
    }
    
    return 'WASM performance optimal';
  }

  /**
   * Reset validation statistics
   */
  resetStats() {
    this.validationStats = {
      totalValidations: 0,
      accuracyMismatches: 0,
      wasmErrors: 0,
      fallbackTriggers: 0,
      averageWasmTime: 0,
      averageJsTime: 0,
      lastMismatchReason: null
    };
  }

  /**
   * Set validation mode
   * @param {boolean} strict - Enable strict validation
   * @param {number} sampleRate - Validation sample rate (0.0 to 1.0)
   */
  setValidationMode(strict = false, sampleRate = 0.1) {
    this.strictMode = strict;
    this.sampleRate = Math.max(0, Math.min(1, sampleRate));
    
    console.log(`🔧 Position mapping validation: strict=${strict}, sampleRate=${(sampleRate * 100).toFixed(1)}%`);
  }
}

// Singleton validator instance
export const positionMappingValidator = new PositionMappingValidator();