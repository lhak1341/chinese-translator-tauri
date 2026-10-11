/**
 * Pattern Processing Type Definitions
 *
 * Part of Phase 6: JSDoc Integration & Extended Type Definitions
 *
 * @file PatternProcessingTypes.d.ts
 */

import type { Token } from './SemanticTypes';
import type { TranslationSource } from './TranslationEngineTypes';

// ============================================================================
// Pattern Processing Options
// ============================================================================

/**
 * Pattern processing options
 */
export interface PatternProcessingOptions {
  /** Active proper noun dictionaries (read by TwoPhasePatternProcessor) */
  activeProperNouns?: string[];
  /** Dictionary manager instance, DictionaryManager type (read by TwoPhasePatternProcessor) */
  dictionaryManager?: unknown;
}

/**
 * Output shape returned by the pattern processor.
 * Consumed by applyHierarchicalResults(); the processor does not mutate tokens directly.
 */
export interface PatternProcessorResult {
  startIndex: number;
  endIndex: number;
  originalText: string;
  translation: string;
  translationSource: TranslationSource;
  semanticType: string | null;
  pattern: { originalPattern: string };
  type: 'simple' | 'composite' | 'hierarchical';
  components?: unknown[];
}

/**
 * Contract the pattern processor satisfies (TwoPhasePatternProcessor over the WASM matcher; the
 * JS matcher that was a second adapter is gone, ADR-101). applyHierarchicalResults() reads the
 * result shape.
 */
export interface PatternProcessorAdapter {
  processTokens(
    tokens: Token[],
    options: PatternProcessingOptions
  ): Promise<PatternProcessorResult[]>;
}
