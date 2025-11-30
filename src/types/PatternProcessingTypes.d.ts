/**
 * Pattern Processing Type Definitions
 *
 * Comprehensive type definitions for pattern processing system including:
 * - SemanticPatternProcessor (unified pattern matching)
 * - TwoPhasePatternProcessor (hierarchical processing)
 * - CompositePatternDetector (composite pattern recognition)
 *
 * Part of Phase 6: JSDoc Integration & Extended Type Definitions
 *
 * @file PatternProcessingTypes.d.ts
 */

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
  /** Low priority flag for pattern competition */
  lowPriority: boolean;
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
  /** Low priority for pattern competition */
  lowPriority: boolean;
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
  matchedTokens: any[];
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
    [key: string]: any;
  };
}

/**
 * Variable resolution result
 */
export interface VariableResolutionResult {
  /** Variable name */
  variableName: string;
  /** Resolved translation */
  translation: string;
  /** Original text */
  originalText: string;
  /** Source dictionary */
  source: string;
  /** Resolution confidence (0-1) */
  confidence: number;
  /** Whether result came from cache */
  cached: boolean;
}

// ============================================================================
// Two-Phase Pattern Processing
// ============================================================================

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

/**
 * Phase B pattern result
 */
export interface PhaseBResult extends PatternMatchResult {
  /** Phase identifier */
  phase: 'B';
  /** Whether this uses Phase A results as variables */
  usesPhaseAVariables?: boolean;
  /** Phase A results used in variable resolution */
  phaseAVariablesUsed?: PhaseAResult[];
}

/**
 * Phase processing statistics
 */
export interface PhaseProcessingStats {
  /** Phase A processing time */
  phaseATime: number;
  /** Phase B processing time */
  phaseBTime: number;
  /** Composite detection time */
  compositeDetectionTime: number;
  /** Total processing time */
  totalTime: number;
  /** Number of Phase A results */
  phaseAResultCount: number;
  /** Number of Phase B results */
  phaseBResultCount: number;
  /** Number of composite patterns detected */
  compositeCount: number;
}

// ============================================================================
// Composite Pattern Detection
// ============================================================================

/**
 * Absorption pattern information
 */
export interface AbsorptionInfo {
  /** Phase A variable that can be absorbed */
  phaseAVariable: PatternVariable;
  /** Phase B variable that absorbs Phase A */
  phaseBVariable: PatternVariable;
  /** Type of absorption */
  absorptionType: 'variable_match' | 'containment' | 'overlap';
  /** Confidence in absorption (0-1) */
  confidence: number;
}

/**
 * Composite pattern result
 */
export interface CompositePatternResult {
  /** Composite identifier */
  id: string;
  /** Phase A result absorbed */
  phaseAResult: PhaseAResult;
  /** Phase B pattern that absorbed Phase A */
  phaseBPattern: PhaseBResult;
  /** Absorption information */
  absorption: AbsorptionInfo;
  /** Combined original text */
  originalText: string;
  /** Combined translation */
  translation: string;
  /** Start index in tokens */
  startIndex: number;
  /** End index in tokens */
  endIndex: number;
  /** Composite confidence (0-1) */
  confidence: number;
  /** Composite metadata */
  metadata: {
    phaseAPattern: string;
    phaseBPattern: string;
    absorptionType: string;
    [key: string]: any;
  };
}

/**
 * Composite detection configuration
 */
export interface CompositeDetectionConfig {
  /** Enable composite detection */
  enabled: boolean;
  /** Maximum token span for composites */
  maxCompositeSpan: number;
  /** Maximum time for detection in milliseconds */
  maxDetectionTime: number;
  /** Minimum confidence threshold */
  minConfidence: number;
}

// ============================================================================
// Variable Extraction and Caching
// ============================================================================

/**
 * Variable cache entry
 */
export interface VariableCacheEntry {
  /** Variable name */
  variableName: string;
  /** Position in tokens */
  position: number;
  /** Span in tokens */
  span: number;
  /** Original text */
  originalText: string;
  /** Translation */
  translation: string;
  /** Source dictionary */
  source: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Variable cache statistics
 */
export interface VariableCacheStats {
  /** Total cache entries */
  totalEntries: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Average lookup time in milliseconds */
  avgLookupTime: number;
}

// ============================================================================
// String Optimization (PrecomputedTokenStrings)
// ============================================================================

/**
 * Precomputed string statistics
 */
export interface PrecomputedStringStats {
  /** Total precomputed strings */
  totalPrecomputed: number;
  /** Total lookups performed */
  totalLookups: number;
  /** Precomputation time in milliseconds */
  precomputeTime: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
}

/**
 * String optimization configuration
 */
export interface StringOptimizationConfig {
  /** Enable string optimization */
  enabled: boolean;
  /** Maximum span for precomputation */
  maxSpan: number;
  /** Minimum tokens for optimization */
  minTokens: number;
}

/**
 * String optimization statistics
 */
export interface StringOptimizationStats {
  /** Whether optimization is enabled */
  enabled: boolean;
  /** Precomputation time */
  precomputeTime: number;
  /** Dynamic string operations count */
  dynamicStringOps: number;
  /** Precomputed lookups count */
  precomputedLookups: number;
  /** Estimated speedup factor */
  speedupFactor: number;
}

// ============================================================================
// Pattern Processor Statistics
// ============================================================================

/**
 * Pattern processor statistics
 */
export interface PatternProcessorStats {
  /** Total matches found */
  totalMatches: number;
  /** Total processing time */
  totalTime: number;
  /** Total variable resolution time */
  totalVariableResolutionTime: number;
  /** Total template build time */
  totalTemplateBuildTime: number;
  /** Pattern usage by pattern ID */
  patternUsage: Map<string, number>;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Bottleneck patterns */
  bottleneckPatterns: Map<string, number>;
  /** Session start timestamp */
  sessionStart: number;
  /** Last reset timestamp */
  lastResetTime: number;
  /** String optimization stats */
  stringOptimization: StringOptimizationStats;
}

// ============================================================================
// Pattern Processing Options
// ============================================================================

/**
 * Pattern processing options
 */
export interface PatternProcessingOptions {
  /** Debug level for logging */
  debugLevel?: number;
  /** Prioritized patterns to apply first */
  prioritizedPatterns?: PatternMatchResult[];
  /** Active proper noun dictionaries */
  activeProperNouns?: string[];
  /** Dictionary manager instance */
  dictionaryManager?: any;
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
 * Pattern initialization options
 */
export interface PatternInitializationOptions {
  /** Debug level */
  debugLevel?: number;
  /** Enable string optimization */
  enableStringOptimization?: boolean;
  /** Composite detection configuration */
  compositeDetection?: CompositeDetectionConfig;
}

// ============================================================================
// Pattern Analysis
// ============================================================================

/**
 * Pattern analysis result
 */
export interface PatternAnalysisResult {
  /** Pattern object */
  pattern: SemanticPattern;
  /** Pattern category */
  category: 'simple' | 'complex' | 'composite_eligible' | 'variable';
  /** Pattern characteristics */
  characteristics: {
    hasVariables: boolean;
    variableCount: number;
    literalCount: number;
    startsWithLiteral: boolean;
    startsWithVariable: boolean;
    isCompositeEligible: boolean;
    canBePatternVariable: boolean;
  };
  /** Recommended processing phase */
  recommendedPhase: 'A' | 'B' | 'both';
}

/**
 * Pattern competition result
 */
export interface PatternCompetitionResult {
  /** Winning pattern */
  winner: PatternMatchResult;
  /** Competing patterns */
  competitors: PatternMatchResult[];
  /** Competition reason */
  reason: string;
  /** Priority scores */
  scores: Record<string, number>;
}

// ============================================================================
// Pattern Priority Calculation
// ============================================================================

/**
 * Pattern priority factors
 */
export interface PatternPriorityFactors {
  /** Number of variables (weight: 10) */
  variableCount: number;
  /** Pattern length (weight: 1) */
  length: number;
  /** Literal-starting bonus (weight: 5) */
  literalStartBonus: number;
  /** Low priority penalty (weight: -12) */
  lowPriorityPenalty: number;
  /** Total priority score */
  totalPriority: number;
}

// ============================================================================
// Two-Phase Pattern Processor Interface
// ============================================================================

/**
 * Two-phase pattern processor configuration
 */
export interface TwoPhasePatternProcessorConfig {
  /** Maximum composite detection time in milliseconds */
  maxCompositeDetectionTime: number;
  /** Enable fallback to single-phase on error */
  enableFallback: boolean;
  /** Debug mode */
  debugMode: boolean;
}

/**
 * Pattern categorization results
 */
export interface PatternCategorizationResult {
  /** Phase A patterns (can be used as variables) */
  variablePatterns: SemanticPattern[];
  /** Composite-eligible patterns (single-variable Phase B) */
  compositeEligiblePatterns: SemanticPattern[];
  /** All patterns */
  allPatterns: SemanticPattern[];
}

/**
 * Decision engine result
 */
export interface DecisionEngineResult {
  /** Selected optimal results */
  selectedResults: PatternMatchResult[];
  /** Rejected results */
  rejectedResults: PatternMatchResult[];
  /** Decision reasoning */
  reasoning: {
    [resultId: string]: string;
  };
  /** Decision statistics */
  stats: {
    totalCandidates: number;
    selectedCount: number;
    rejectedCount: number;
    decisionTime: number;
  };
}

// ============================================================================
// Composite Pattern Components
// ============================================================================

/**
 * Variable extractor configuration
 */
export interface VariableExtractorConfig {
  /** Debug mode */
  debugMode: boolean;
  /** Maximum variable span */
  maxVariableSpan: number;
}

/**
 * Composite generator configuration
 */
export interface CompositeGeneratorConfig {
  /** Debug mode */
  debugMode: boolean;
  /** Template merge strategy */
  mergeStrategy: 'concatenate' | 'substitute' | 'hybrid';
}

/**
 * Variable extraction result
 */
export interface VariableExtractionResult {
  /** Variable name */
  variableName: string;
  /** Extracted text */
  extractedText: string;
  /** Start index */
  startIndex: number;
  /** End index */
  endIndex: number;
  /** Confidence (0-1) */
  confidence: number;
}

// ============================================================================
// Pattern Matching Algorithms
// ============================================================================

/**
 * Pattern match candidate
 */
export interface PatternMatchCandidate {
  /** Pattern being tested */
  pattern: SemanticPattern;
  /** Start position in tokens */
  startPosition: number;
  /** Potential end position */
  potentialEndPosition: number;
  /** Preliminary match score */
  preliminaryScore: number;
}

/**
 * Template substitution result
 */
export interface TemplateSubstitutionResult {
  /** Final translation */
  translation: string;
  /** Substituted variables */
  substitutedVariables: Record<string, string>;
  /** Substitution confidence (0-1) */
  confidence: number;
  /** Substitution time in milliseconds */
  substitutionTime: number;
}

// ============================================================================
// Pattern Index
// ============================================================================

/**
 * Pattern index entry
 */
export interface PatternIndexEntry {
  /** Index key (first literal or '__VARIABLE__') */
  key: string;
  /** Patterns starting with this key */
  patterns: SemanticPattern[];
}

/**
 * Pattern index statistics
 */
export interface PatternIndexStats {
  /** Total index entries */
  totalEntries: number;
  /** Literal-starting patterns */
  literalStartingPatterns: number;
  /** Variable-starting patterns */
  variableStartingPatterns: number;
  /** Average patterns per entry */
  avgPatternsPerEntry: number;
}

// ============================================================================
// SemanticPatternProcessor Interface
// ============================================================================

/**
 * Semantic pattern processor interface
 */
export interface SemanticPatternProcessor {
  // Core pattern storage
  patterns: SemanticPattern[];
  patternIndex: Map<string, SemanticPattern[]>;
  variableCache: Map<string, VariableCacheEntry>;
  isInitialized: boolean;

  // String optimization
  precomputedStrings: any | null;
  enableStringOptimization: boolean;

  // Statistics
  stats: PatternProcessorStats;

  // Methods
  initializePatterns(patternsDict: Record<string, any>, options?: PatternInitializationOptions): void;
  parsePattern(patternText: string, template: string, allowedVariableTypes?: any, allowAsPatternVariable?: boolean, lowPriority?: boolean): SemanticPattern | null;
  indexPattern(pattern: SemanticPattern): void;
  calculatePriority(tokens: PatternToken[], variables: string[], lowPriority?: boolean): number;
  processTokens(tokens: any[], options?: PatternProcessingOptions): void;
  findBestPatternMatch(semanticTokens: any[], position: number, options?: PatternProcessingOptions): PatternMatchResult | null;
  applyPatternMatch(tokens: any[], matchResult: PatternMatchResult, options?: PatternProcessingOptions): void;
  buildVariableCache(tokens: any[], dictionaryTypes: string[], dictionaryManager: any): void;
}

/**
 * Two-phase pattern processor interface
 */
export interface TwoPhasePatternProcessor {
  // Configuration
  options: TwoPhasePatternProcessorConfig;

  // Pattern categorization
  variablePatterns: SemanticPattern[];
  compositeEligiblePatterns: SemanticPattern[];
  allPatterns: SemanticPattern[];
  processedPatterns: SemanticPattern[];

  // Analyzer
  analyzer: any;

  // Methods
  categorizePatterns(): void;
  processTokens(tokens: any[], options: PatternProcessingOptions): Promise<PatternMatchResult[]>;
  processPhaseA(tokens: any[], options: PatternProcessingOptions): Promise<PhaseAResult[]>;
  processPhaseB(tokens: any[], phaseAResults: PhaseAResult[], options: PatternProcessingOptions): Promise<PhaseBResult[]>;
  markTokensAsProtected(tokens: any[], phaseAResults: PhaseAResult[]): void;
  detectComposites(phaseAResults: PhaseAResult[], phaseBResults: PhaseBResult[], tokens: any[]): Promise<CompositePatternResult[]>;
  selectOptimalResults(phaseAResults: PhaseAResult[], phaseBResults: PhaseBResult[], compositeResults: CompositePatternResult[]): PatternMatchResult[];
  processSinglePhaseFallback(tokens: any[], options: PatternProcessingOptions): Promise<PatternMatchResult[]>;
}

/**
 * Composite pattern detector interface
 */
export interface CompositePatternDetector {
  // Configuration
  options: VariableExtractorConfig & CompositeGeneratorConfig;

  // Components
  variableExtractor: any;
  compositeGenerator: any;

  // Methods
  detectComposites(phaseAResults: PhaseAResult[], phaseBCandidates: PhaseBResult[], tokens: any[]): CompositePatternResult[];
  tryCreateComposite(phaseAResult: PhaseAResult, phaseBCandidate: PhaseBResult, tokens: any[]): CompositePatternResult | null;
  findAbsorptionPattern(phaseAResult: PhaseAResult, phaseBCandidate: PhaseBResult, tokens: any[]): AbsorptionInfo | null;
}
