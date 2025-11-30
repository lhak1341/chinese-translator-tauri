/**
 * TypeScript type definitions for batch processing and text chunking
 *
 * Defines interfaces for adaptive chunking, text segmentation, punctuation handling,
 * and performance-based chunk size optimization used in translation processing.
 */

// ============================================================================
// Adaptive Chunker (performance-based chunk size optimization)
// ============================================================================

/**
 * Complexity thresholds for content categorization
 * Determines chunking strategy based on content complexity
 */
export interface ComplexityThresholds {
  /** Simple conversational text threshold */
  simple: number;

  /** Mixed content with some technical terms threshold */
  moderate: number;

  /** Dense technical/literary content threshold */
  complex: number;

  /** Academic/highly technical content threshold */
  veryComplex: number;
}

/**
 * Adaptive chunker configuration
 * Used by AdaptiveChunker constructor
 */
export interface AdaptiveChunkerOptions {
  /** Minimum chunk size (default: 8) */
  minChunkSize?: number;

  /** Maximum chunk size (default: 20) */
  maxChunkSize?: number;

  /** Number of batches to track for adaptation (default: 5) */
  performanceWindow?: number;

  /** Adaptation sensitivity 0-1 (default: 0.2, conservative) */
  adaptationSensitivity?: number;

  /** Complexity thresholds for strategy selection */
  complexityThresholds?: ComplexityThresholds;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Content complexity factors
 * Individual factors contributing to overall complexity score
 */
export interface ComplexityFactors {
  /** Vocabulary complexity from proper nouns and technical terms (0-1) */
  vocabularyComplexity: number;

  /** Sentence structure complexity based on length (0-2) */
  structuralComplexity: number;

  /** Punctuation density affecting chunking efficiency (0-1) */
  punctuationDensity: number;

  /** Chunk size variance indicating content heterogeneity (0-1) */
  chunkVariance: number;

  /** Estimated dictionary hit rate (0-1) */
  dictionaryHitRate: number;
}

/**
 * Chunking strategy type
 * Strategy for chunk size based on content complexity
 */
export type ChunkingStrategy = 'aggressive' | 'standard' | 'conservative' | 'careful';

/**
 * Optimization recommendations
 * Suggestions for improving chunking performance
 */
export interface OptimizationRecommendations {
  /** Recommended strategy */
  strategy?: ChunkingStrategy;

  /** Suggested chunk size */
  suggestedChunkSize?: number;

  /** Estimated performance improvement */
  estimatedImprovement?: number;

  /** Specific optimizations to apply */
  optimizations?: string[];

  /** Warnings about potential issues */
  warnings?: string[];
}

/**
 * Content characteristics analysis result
 * Complete analysis of content for adaptive chunking
 */
export interface ContentCharacteristics {
  /** Overall complexity score */
  complexity: number;

  /** Individual complexity factors */
  factors: ComplexityFactors;

  /** Optimization recommendations */
  recommendations: OptimizationRecommendations;

  /** Determined chunking strategy */
  chunkingStrategy: ChunkingStrategy;
}

/**
 * Device performance information
 * Device characteristics affecting chunking performance
 */
export interface DeviceInfo {
  /** Memory pressure level */
  memoryPressure?: 'low' | 'medium' | 'high';

  /** Number of CPU cores */
  cpuCores?: number;

  /** Available memory in MB */
  availableMemory?: number;

  /** Device type (mobile, tablet, desktop) */
  deviceType?: 'mobile' | 'tablet' | 'desktop';

  /** Browser performance tier */
  performanceTier?: 'low' | 'medium' | 'high';
}

/**
 * Performance data point
 * Single performance measurement
 */
export interface PerformanceDataPoint {
  /** Timestamp of measurement */
  timestamp: number;

  /** Chunk size used */
  chunkSize: number;

  /** Time taken for batch (ms) */
  batchTime: number;

  /** Memory used (MB) */
  memoryUsed: number;

  /** Number of chunks processed */
  chunksProcessed: number;

  /** Average time per chunk (ms) */
  avgTimePerChunk: number;

  /** Success rate (0-1) */
  successRate?: number;
}

/**
 * Performance trend analysis result
 * Analysis of performance over time
 */
export interface PerformanceTrend {
  /** Trend direction */
  direction: 'improving' | 'stable' | 'degrading';

  /** Confidence in trend assessment (0-1) */
  confidence: number;

  /** Suggested action */
  suggestedAction: 'increase' | 'maintain' | 'decrease' | 'none';

  /** Performance change rate */
  changeRate?: number;

  /** Trend strength */
  strength?: 'weak' | 'moderate' | 'strong';
}

/**
 * Adaptation statistics
 * Tracks adaptation performance over time
 */
export interface AdaptationStats {
  /** Total adaptations made */
  totalAdaptations: number;

  /** Performance improvement gains */
  improvementGains: number;

  /** Times degradation was prevented */
  degradationPrevented: number;

  /** Average chunk size over time */
  averageChunkSize?: number;

  /** Success rate of adaptations */
  adaptationSuccessRate?: number;
}

/**
 * Adaptive chunker interface
 * Dynamically adjusts chunk sizes based on performance
 */
export interface AdaptiveChunker {
  /** Configuration options */
  options: AdaptiveChunkerOptions;

  /** Performance history */
  performanceHistory: PerformanceDataPoint[];

  /** Current optimal size */
  currentOptimalSize: number;

  /** Adaptation statistics */
  adaptationStats: AdaptationStats;

  /**
   * Analyze content characteristics
   * @param text - Full text to analyze
   * @param chunks - Text chunks from TextChunker
   * @returns Content analysis
   */
  analyzeContentCharacteristics(text: string, chunks: any[]): ContentCharacteristics;

  /**
   * Calculate optimal chunk size
   * @param contentAnalysis - Content analysis results
   * @param deviceInfo - Device performance characteristics
   * @param totalChunks - Total number of chunks
   * @returns Optimal chunk size
   */
  calculateOptimalChunkSize(
    contentAnalysis: ContentCharacteristics,
    deviceInfo?: DeviceInfo,
    totalChunks?: number
  ): number;

  /**
   * Record performance data
   * @param dataPoint - Performance measurement
   */
  recordPerformance(dataPoint: PerformanceDataPoint): void;

  /**
   * Analyze performance trend
   * @returns Trend analysis
   */
  analyzePerformanceTrend(): PerformanceTrend;

  /**
   * Calculate proper noun density
   * @param text - Input text
   * @returns Proper noun density (0-1)
   */
  calculateProperNounDensity(text: string): number;

  /**
   * Calculate technical term density
   * @param text - Input text
   * @returns Technical term density (0-1)
   */
  calculateTechnicalTermDensity(text: string): number;

  /**
   * Calculate average sentence length
   * @param text - Input text
   * @returns Average sentence length in characters
   */
  calculateAverageSentenceLength(text: string): number;

  /**
   * Calculate punctuation density
   * @param text - Input text
   * @returns Punctuation density (0-1)
   */
  calculatePunctuationDensity(text: string): number;

  /**
   * Calculate chunk size variance
   * @param chunks - Text chunks
   * @returns Normalized variance (0-1)
   */
  calculateChunkVariance(chunks: any[]): number;

  /**
   * Estimate dictionary hit rate
   * @param text - Input text
   * @returns Estimated hit rate (0-1)
   */
  estimateDictionaryHitRate(text: string): number;

  /**
   * Determine chunking strategy
   * @param analysis - Content analysis results
   * @returns Chunking strategy
   */
  determineChunkingStrategy(analysis: ContentCharacteristics): ChunkingStrategy;

  /**
   * Generate optimization recommendations
   * @param analysis - Content analysis results
   * @returns Optimization recommendations
   */
  generateOptimizationRecommendations(analysis: ContentCharacteristics): OptimizationRecommendations;
}

// ============================================================================
// Text Chunker (punctuation-based text segmentation)
// ============================================================================

/**
 * Text chunk class
 * Represents a single chunk of text with metadata
 */
export interface TextChunk {
  /** Actual text content (trimmed) */
  content: string;

  /** Punctuation following this chunk */
  punctuation: string;

  /** Line breaks following this chunk */
  lineBreaks: string;

  /** Original position in text */
  startIndex: number;

  /** End position in text (before punctuation) */
  endIndex: number;

  /** What precedes this chunk (for capitalization) */
  startedBy: string;

  /** Translated result (set later) */
  translated: string | null;

  /** Translated punctuation (set later) */
  translatedPunctuation: string | null;

  /**
   * String representation
   * @returns String representation of chunk
   */
  toString(): string;
}

/**
 * Punctuation configuration
 * Configuration for punctuation detection
 */
export interface PunctuationConfig {
  /** Enabled Unicode punctuation categories */
  enabledCategories?: Record<string, boolean>;

  /** Custom separator characters */
  customSeparators?: string[];

  /** Excluded characters (not treated as separators) */
  excludedCharacters?: Set<string>;

  /** Included characters (always treated as separators) */
  includedCharacters?: Set<string>;

  /** Enable Unicode property escapes */
  useUnicodeProperties?: boolean;
}

/**
 * Separated punctuation result
 * Result from separating opening/closing punctuation
 */
export interface SeparatedPunctuation {
  /** Opening punctuation */
  opening: string;

  /** Remaining punctuation */
  remaining: string;
}

/**
 * Diagnostic information
 * Information about punctuation detection capabilities
 */
export interface ChunkerDiagnosticInfo {
  /** Whether Unicode properties are supported */
  supportsUnicodeProperties: boolean;

  /** Enabled punctuation categories */
  enabledCategories: Record<string, boolean>;

  /** Number of custom separators */
  customSeparatorCount: number;

  /** Excluded characters array */
  excludedCharacters: string[];

  /** Included characters array */
  includedCharacters: string[];

  /** Active chunking regex pattern */
  chunkingPattern?: string;
}

/**
 * Chunk reconstruction segment
 * Segment information during reconstruction
 */
export interface ReconstructionSegment {
  /** Segment type */
  type: 'content' | 'punctuation' | 'linebreak';

  /** Start position in reconstructed text */
  start: number;

  /** End position in reconstructed text */
  end: number;

  /** Segment text */
  text: string;

  /** Original chunk index */
  chunkIndex?: number;

  /** Whether segment is clickable */
  isClickable?: boolean;

  /** Semantic unit index (if applicable) */
  unitIndex?: number;
}

/**
 * Text reconstruction result
 * Result from reconstructing text from chunks
 */
export interface TextReconstructionResult {
  /** Reconstructed text */
  text: string;

  /** Segment positions */
  segments: ReconstructionSegment[];

  /** Total length */
  length: number;

  /** Number of chunks processed */
  chunkCount?: number;
}

/**
 * Text chunker interface
 * Splits text into chunks by punctuation boundaries
 */
export interface TextChunker {
  /** Unicode punctuation detector */
  unicodePunctuationDetector: any;

  /** Legacy chunk separators */
  legacyChunkSeparators: string[];

  /** Chunking regex pattern */
  chunkRegex: RegExp;

  /** Punctuation processor */
  punctuationProcessor: any;

  /**
   * Build chunking regex patterns
   */
  buildChunkingRegex(): void;

  /**
   * Update punctuation configuration
   * @param newConfig - New configuration
   */
  updatePunctuationConfig(newConfig: PunctuationConfig): void;

  /**
   * Get current punctuation configuration
   * @returns Current configuration
   */
  getPunctuationConfig(): PunctuationConfig;

  /**
   * Test if character is punctuation separator
   * @param char - Character to test
   * @returns True if separator
   */
  isPunctuationSeparator(char: string): boolean;

  /**
   * Get diagnostic information
   * @returns Diagnostic info
   */
  getDiagnosticInfo(): ChunkerDiagnosticInfo;

  /**
   * Check if punctuation contains opening punctuation
   * @param punctuation - Punctuation string
   * @returns True if contains opening punctuation
   */
  hasOpeningPunctuation(punctuation: string): boolean;

  /**
   * Separate opening punctuation
   * @param punctuation - Full punctuation string
   * @returns Separated punctuation
   */
  separateOpeningPunctuation(punctuation: string): SeparatedPunctuation;

  /**
   * Chunk text by punctuation boundaries
   * @param text - Input text
   * @returns Array of text chunks
   */
  chunkText(text: string): TextChunk[];

  /**
   * Reconstruct text from chunks with segments
   * @param chunks - Translated chunks
   * @param semanticArrays - Optional semantic arrays
   * @returns Reconstruction result
   */
  reconstructTextWithSegments(
    chunks: TextChunk[],
    semanticArrays?: any
  ): TextReconstructionResult;

  /**
   * Merge adjacent chunks if beneficial
   * @param chunks - Chunks to merge
   * @returns Merged chunks
   */
  mergeAdjacentChunks?(chunks: TextChunk[]): TextChunk[];

  /**
   * Split long chunks for better parallelization
   * @param chunks - Chunks to split
   * @param maxLength - Maximum chunk length
   * @returns Split chunks
   */
  splitLongChunks?(chunks: TextChunk[], maxLength: number): TextChunk[];
}

// ============================================================================
// Batch Processing Integration
// ============================================================================

/**
 * Batch processing configuration
 * Configuration for batch translation processing
 */
export interface BatchProcessingConfig {
  /** Adaptive chunker options */
  adaptiveChunker?: AdaptiveChunkerOptions;

  /** Punctuation configuration */
  punctuationConfig?: PunctuationConfig;

  /** Enable adaptive sizing */
  enableAdaptiveSizing?: boolean;

  /** Enable parallel processing */
  enableParallelProcessing?: boolean;

  /** Maximum concurrent batches */
  maxConcurrentBatches?: number;

  /** Batch timeout (ms) */
  batchTimeout?: number;
}

/**
 * Batch processing statistics
 * Statistics from batch processing
 */
export interface BatchProcessingStats {
  /** Total chunks processed */
  totalChunks: number;

  /** Total batches executed */
  totalBatches: number;

  /** Average batch time (ms) */
  avgBatchTime: number;

  /** Total processing time (ms) */
  totalTime: number;

  /** Chunks per second */
  chunksPerSecond: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Memory usage (MB) */
  memoryUsage?: number;

  /** Adaptation statistics */
  adaptationStats?: AdaptationStats;
}

/**
 * Batch processing result
 * Result from batch processing operation
 */
export interface BatchProcessingResult {
  /** Processed chunks */
  chunks: TextChunk[];

  /** Processing statistics */
  stats: BatchProcessingStats;

  /** Reconstructed text */
  text?: string;

  /** Segments for UI */
  segments?: ReconstructionSegment[];

  /** Errors encountered */
  errors?: Array<{
    chunkIndex: number;
    error: string;
  }>;
}
