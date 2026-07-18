/**
 * Viewport & Position Mapping Type Definitions
 *
 * Type definitions for viewport optimization and position mapping systems:
 * - ViewportSegmentComputer: Basic viewport-based segment computation (50ms vs 6800ms)
 * - ViewportSegmentComputerEnhanced: Web Worker acceleration (~20ms with workers)
 *
 * Performance Impact: 98.5% faster initial rendering through viewport optimization
 *
 * These types enable JSDoc integration for full IDE support without migrating performance-critical code.
 */

import type { SemanticMetadata } from './SemanticTypes';

// =============================================================================
// Core Position Mapping Types
// =============================================================================

/**
 * Semantic range for position mapping
 * Lightweight representation of semantic units in text
 */
export interface SemanticRange {
  /** Start position in translated text */
  startPos: number;
  /** End position in translated text */
  endPos: number;
  /** Unit index in semantic arrays */
  unitIndex: number;
  /** Original Chinese text */
  originalText: string;
  /** Translated Vietnamese text */
  translatedText: string;
  /** Translation source (pattern, phrase, character, etc.) */
  source: string;
  /** Full semantic metadata */
  metadata: SemanticMetadata;
}

/**
 * Text position mapping result
 * Fast mapping structure for viewport-based rendering
 */
export interface TextPositionMapping {
  /** Total text length */
  textLength: number;
  /** Semantic ranges for position lookup */
  semanticRanges: SemanticRange[];
  /** Full translated text */
  fullText: string;
  /** Computation statistics */
  stats: PositionMappingStats;
  /** Acceleration information (if accelerated) */
  accelerationInfo?: AccelerationInfo;
}

/**
 * Position mapping computation statistics
 */
export interface PositionMappingStats {
  /** Time to compute position mapping (ms) */
  computeTime: number;
  /** Number of semantic ranges computed */
  rangeCount: number;
  /** Whether Web Worker was used */
  usedWorker?: boolean;
  /** Worker communication overhead (ms) */
  workerTime?: number;
  /** Fallback reason if strategy failed */
  fallbackReason?: string;
  /** Reason for skipping optimization */
  skipReason?: string;
}

/**
 * Acceleration information for position mapping
 */
export interface AccelerationInfo {
  /** Strategy used for acceleration */
  strategy: 'wasm' | 'worker' | 'main_thread' | 'fallback';
  /** Reason for choosing this strategy */
  reason: string;
  /** Input text length */
  textLength: number;
  /** Number of ranges computed */
  rangeCount: number;
  /** Time spent on computation (ms) */
  computeTime?: number;
  /** Total time including overhead (ms) */
  totalTime?: number;
  /** Validation result (if strict validation enabled) */
  validationResult?: ValidationResult;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation result for position mapping
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors (if any) */
  errors: ValidationError[];
  /** Validation warnings (if any) */
  warnings: ValidationWarning[];
  /** Time spent on validation (ms) */
  validationTime: number;
}

/**
 * Validation error
 */
export interface ValidationError {
  /** Error type */
  type: 'missing_range' | 'incorrect_position' | 'text_mismatch' | 'metadata_error';
  /** Error message */
  message: string;
  /** Unit index where error occurred */
  unitIndex?: number;
  /** Expected value */
  expected?: any;
  /** Actual value */
  actual?: any;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Warning type */
  type: 'position_drift' | 'performance' | 'cache_inefficiency';
  /** Warning message */
  message: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
}

// Export empty object to make this a module
export {};
