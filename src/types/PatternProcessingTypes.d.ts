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
// Pattern Structure Types
// ============================================================================

/**
 * Pattern token type
 */
export type PatternTokenType = 'literal' | 'variable';

/**
 * Pattern token (single character in pattern)
 */
export interface PatternToken {
  /** Token type */
  type: PatternTokenType;
  /** Token value (for literals) or variable name (for variables) */
  value?: string;
  /** Variable name (A-Z) */
  name?: string;
  /** Position in pattern string */
  position: number;
}

/**
 * Pattern variable metadata
 */
export interface PatternVariable {
  /** Variable name (single uppercase letter) */
  name: string;
  /** Allowed variable types (e.g., ['properNouns', 'phrases']) */
  allowedTypes?: string[] | null;
  /** Translated value for this variable */
  translation?: string;
  /** Original text that matched this variable */
  originalText?: string;
  /** Source dictionary name */
  source?: string;
}

/**
 * Pattern usage statistics
 */
export interface PatternUsageStats {
  /** Number of times pattern matched */
  matchCount: number;
  /** Total time spent on this pattern */
  totalTime: number;
  /** Cache hits for variable resolution */
  cacheHits: number;
  /** Cache misses for variable resolution */
  cacheMisses: number;
  /** Time spent resolving variables */
  variableResolutionTime: number;
  /** Time spent building translation templates */
  templateBuildTime: number;
  /** Last time pattern was used */
  lastUsed: number | null;
  /** Average matching time */
  avgTime: number;
  /** Minimum matching time */
  minTime: number;
  /** Maximum matching time */
  maxTime: number;
}

/**
 * Pattern metadata
 */
export interface PatternMetadata {
  /** Pattern priority score */
  priority: number;
  /** Pattern complexity (number of variables) */
  complexity: number;
  /** Pattern length (number of tokens) */
  length: number;
  /** Allowed variable types */
  allowedVariableTypes?: Record<string, string[]> | null;
}

/**
 * Semantic pattern definition
 */
export interface SemanticPattern {
  /** Unique pattern identifier (pattern text) */
  id: string;
  /** Original pattern text (e.g., "这些X") */
  originalPattern: string;
  /** Translation template (e.g., "những X này") */
  template: string;
  /** Parsed pattern tokens */
  tokens: PatternToken[];
  /** Pattern variables (unique variable names) */
  variables: string[];
  /** First token in pattern */
  firstToken: PatternToken;
  /** Can be used as variable in hierarchical processing */
  allowAsPatternVariable: boolean;
  /** Pattern priority score */
  priority: number;
  /** Pattern metadata */
  metadata: PatternMetadata;
  /** Usage statistics */
  usage: PatternUsageStats;
  /** Whether pattern is eligible for composite matching */
  compositeEligible?: boolean;
}

// ============================================================================
// Pattern Matching Results
// ============================================================================

/**
 * Pattern match result
 */
export interface PatternMatchResult {
  /** Matched pattern object */
  pattern: SemanticPattern;
  /** Start index in semantic tokens */
  startIndex: number;
  /** End index in semantic tokens */
  endIndex: number;
  /** Start position in original tokens */
  startPosition: number;
  /** End position in original tokens */
  endPosition: number;
  /** Matched tokens text */
  matchedTokens: Token[];
  /** Original text that was matched */
  originalText: string;
  /** Translated result */
  translation: string;
  /** Result after template substitution */
  result: string;
  /** Resolved variables */
  variables: Record<string, PatternVariable>;
  /** Match confidence (0-1) */
  confidence: number;
  /** Variable values extracted from match */
  variableValues?: Record<string, string>;
  /** Match metadata */
  metadata?: {
    source?: string;
    phase?: 'A' | 'B';
    compositeEligible?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Phase A pattern result
 */
export interface PhaseAResult extends PatternMatchResult {
  /** Phase identifier */
  phase: 'A';
  /** Pattern marked as variable */
  allowAsPatternVariable: true;
  /** Can be absorbed into composite */
  absorbable: boolean;
}

// ============================================================================
// Pattern Processing Options
// ============================================================================

/**
 * Pattern processing options
 */
export interface PatternProcessingOptions {
  /** Prioritized patterns to apply first */
  prioritizedPatterns?: PatternMatchResult[];
  /** Active proper noun dictionaries */
  activeProperNouns?: string[];
  /** Dictionary manager instance (DictionaryManager type) */
  dictionaryManager?: unknown;
  /** Enable enhanced variable resolution (Phase B) */
  enableEnhancedVariableResolution?: boolean;
  /** Phase A results for enhanced resolution */
  phaseAResults?: PhaseAResult[];
  /** Enable string optimization */
  enableStringOptimization?: boolean;
  /** Maximum composite detection time */
  maxCompositeDetectionTime?: number;
  /** Enable composite detection */
  enableCompositeDetection?: boolean;
}

/**
 * Output shape returned by both PatternProcessor adapters.
 * Consumed by applyHierarchicalResults(); neither adapter mutates tokens directly.
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
 * Contract both PatternProcessor adapters satisfy.
 * Selection between WASM (TwoPhasePatternProcessor) and JS (SemanticPatternProcessor)
 * happens once in applyPatterns(); both return the same shape so applyHierarchicalResults()
 * applies either without branching.
 */
export interface PatternProcessorAdapter {
  processTokens(
    tokens: Token[],
    options: PatternProcessingOptions
  ): Promise<PatternProcessorResult[]>;
}
