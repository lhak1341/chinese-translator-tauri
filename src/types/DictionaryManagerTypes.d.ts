/**
 * DictionaryManagerTypes.d.ts
 *
 * Comprehensive TypeScript type definitions for the Dictionary Management system.
 *
 * Covers:
 * - Trie data structures (TrieNode, DictionaryTrie)
 * - Dictionary management (DictionaryManager base class)
 * - WASM acceleration (EnhancedDictionaryManager, WasmDictionaryManager)
 * - Performance tracking and optimization
 * - Validation and health monitoring
 * - Memory pool management
 *
 * @module DictionaryManagerTypes
 */

// ============================================================================
// Core Trie Structures
// ============================================================================

/**
 * Individual node in the trie data structure
 */
export interface TrieNode {
  /** Child nodes indexed by character */
  children: Map<string, TrieNode>;

  /** True if this node represents the end of a word */
  isEndOfWord: boolean;

  /** Translation for this word (if isEndOfWord is true) */
  translation: string | null;

  /** Additional metadata for this entry */
  metadata: DictionaryEntryMetadata | null;
}

/**
 * Metadata stored with each dictionary entry
 */
export interface DictionaryEntryMetadata {
  /** Name of the dictionary this entry belongs to */
  dictionary: string;

  /** Priority for conflict resolution (lower = higher priority) */
  priority: number;

  /** Estimated frequency score for sorting */
  frequency: number;

  /** Whether this entry can be used as a pattern variable */
  allowAsPatternVariable?: boolean;
}

/**
 * Match result from trie lookup
 */
export interface TrieMatch {
  /** Matched word from input text */
  word: string;

  /** Translation for the matched word */
  translation: string;

  /** End position in input text */
  endPos: number;

  /** Metadata for the matched entry */
  metadata: DictionaryEntryMetadata | null;
}

/**
 * Statistics about a trie structure
 */
export interface TrieStats {
  /** Total number of words stored in trie */
  size: number;

  /** Total number of nodes in trie */
  nodeCount: number;

  /** Maximum depth of the trie */
  maxDepth: number;

  /** Average depth across all words */
  averageDepth: number;

  /** Branching factor (average children per node) */
  branchingFactor: number;
}

/**
 * Validation error from trie integrity check
 */
export interface TrieValidationError {
  /** Type of error */
  type:
    | 'CIRCULAR_REFERENCE'
    | 'INVALID_NODE_STRUCTURE'
    | 'MISSING_TRANSLATION'
    | 'INVALID_CHARACTER'
    | 'INVALID_CHILD_NODE'
    | 'MISSING_ROOT'
    | 'VALIDATION_ERROR';

  /** Path to the problematic node */
  path?: string;

  /** Word that caused the error */
  word?: string;

  /** Invalid character (for INVALID_CHARACTER errors) */
  char?: string;

  /** Error message */
  message: string;

  /** Stack trace (for VALIDATION_ERROR) */
  stack?: string;
}

/**
 * Validation warning from trie integrity check
 */
export interface TrieValidationWarning {
  /** Type of warning */
  type: 'EMPTY_TRANSLATION' | 'DUPLICATE_ENTRY' | 'ORPHANED_NODE' | 'SIZE_MISMATCH';

  /** Path to the problematic node */
  path?: string;

  /** Word that caused the warning */
  word?: string;

  /** Existing translation (for DUPLICATE_ENTRY) */
  existing?: string;

  /** Current translation (for DUPLICATE_ENTRY) */
  current?: string;

  /** Expected size (for SIZE_MISMATCH) */
  expected?: number;

  /** Actual size (for SIZE_MISMATCH) */
  actual?: number;

  /** Warning message */
  message: string;
}

/**
 * Statistics from validation process
 */
export interface TrieValidationStatistics {
  /** Total nodes checked during validation */
  nodesChecked: number;

  /** Number of end-of-word nodes found */
  endOfWordNodes: number;

  /** Number of empty translations found */
  emptyTranslations: number;

  /** Number of orphaned nodes found */
  orphanedNodes: number;

  /** Number of circular references found */
  circularReferences: number;

  /** Number of duplicate entries found */
  duplicateEntries: number;
}

/**
 * Performance metrics from validation
 */
export interface TrieValidationPerformance {
  /** Time taken to validate (milliseconds) */
  validationTime: number;
}

/**
 * Result from trie integrity validation
 */
export interface TrieValidationResult {
  /** Timestamp of validation */
  timestamp: number;

  /** True if trie passed all validation checks */
  isValid: boolean;

  /** Critical errors found */
  errors: TrieValidationError[];

  /** Non-critical warnings */
  warnings: TrieValidationWarning[];

  /** Statistics from validation */
  statistics: TrieValidationStatistics;

  /** Performance metrics */
  performance: TrieValidationPerformance;
}

/**
 * Action taken during trie repair
 */
export interface TrieRepairAction {
  /** Type of repair action */
  type:
    | 'NO_REPAIR_NEEDED'
    | 'SIZE_CORRECTED'
    | 'ORPHANED_NODES_REMOVED'
    | 'REPAIR_FAILED'
    | 'REPAIR_ERROR';

  /** Count of items affected (for ORPHANED_NODES_REMOVED) */
  count?: number;

  /** Old size (for SIZE_CORRECTED) */
  oldSize?: number;

  /** New size (for SIZE_CORRECTED) */
  newSize?: number;

  /** Error type (for REPAIR_FAILED) */
  error?: string;

  /** Description of the repair action */
  message: string;
}

/**
 * Result from trie repair operation
 */
export interface TrieRepairResult {
  /** Timestamp of repair */
  timestamp: number;

  /** Number of repairs attempted */
  repairsAttempted: number;

  /** Number of successful repairs */
  repairsSuccessful: number;

  /** Number of failed repairs */
  repairsFailed: number;

  /** Actions taken during repair */
  actions: TrieRepairAction[];
}

/**
 * Health assessment issue
 */
export interface TrieHealthIssue {
  /** Description of the issue */
  message: string;
}

/**
 * Result from trie health assessment
 */
export interface TrieHealthScore {
  /** Health score (0-100) */
  score: number;

  /** Letter grade (A, B, C, D, F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';

  /** Issues affecting health score */
  issues: string[];

  /** Validation result used for assessment */
  validation: TrieValidationResult;

  /** Statistics used for assessment */
  statistics: TrieStats;

  /** Recommendations for improvement */
  recommendations: string[];
}

// ============================================================================
// Dictionary Management
// ============================================================================

/**
 * Dictionary entry in raw format
 */
export interface DictionaryEntry {
  /** Source text (Chinese) */
  chinese?: string;
  original?: string;
  word?: string;

  /** Target text (Vietnamese) */
  vietnamese?: string;
  translation?: string;

  /** Entry metadata */
  metadata?: DictionaryEntryMetadata | string | null;
}

/**
 * Dictionary object format (raw data)
 */
export interface DictionaryData {
  [source: string]:
    | string
    | {
        translation: string;
        allowAsPatternVariable?: boolean;
      };
}

/**
 * Dictionary priorities for conflict resolution
 */
export interface DictionaryPriorities {
  properNouns?: number;
  patterns?: number;
  phrases?: number;
  characters?: number;
  punctuation?: number;
  conversion?: number;
  [key: string]: number | undefined;
}

/**
 * Metadata about a loaded dictionary
 */
export interface DictionaryMetadata {
  /** Dictionary name */
  name: string;

  /** Number of entries in dictionary */
  entryCount: number;

  /** Priority for this dictionary */
  priority: number;

  /** Statistics about the trie structure */
  stats: TrieStats;
}

/**
 * Dictionary search order
 */
export type DictionarySearchOrder = string[];

/**
 * Translation result from dictionary lookup
 */
export interface TranslationResult {
  /** Matched word */
  word: string;

  /** Translation for the word */
  translation: string;

  /** Dictionary where match was found */
  dictionary: string;

  /** Entry metadata */
  metadata: DictionaryEntryMetadata | null;
}

/**
 * Match result from parallel lookup
 */
export interface DictionaryMatchResult extends TrieMatch {
  /** Dictionary where match was found */
  dictionary: string;

  /** Priority of the dictionary */
  priority: number;
}

/**
 * Debug levels for logging
 */
export type DebugLevel = 0 | 1 | 2 | 3;

export const DEBUG_LEVELS: {
  ERROR: 0;
  INFO: 1;
  DEBUG: 2;
  VERBOSE: 3;
};

/**
 * Cache configuration options
 */
export interface CacheConfiguration {
  /** Maximum size for character cache */
  characterCacheSize?: number;

  /** Maximum size for phrase cache */
  phraseCacheSize?: number;

  /** Maximum size for pattern cache */
  patternCacheSize?: number;

  /** Maximum size for lookup cache */
  lookupCacheSize?: number;

  /** Whether caching is enabled */
  enabled?: boolean;
}

/**
 * Options for DictionaryManager constructor
 */
export interface DictionaryManagerOptions extends CacheConfiguration {
  /** Enable parallel dictionary lookups */
  enableParallelLookups?: boolean;

  /** Maximum concurrent dictionary lookups */
  maxParallelDictionaries?: number;
}

/**
 * Options for dictionary loading
 */
export interface DictionaryLoadOptions {
  /** Debug level for logging */
  debugLevel?: DebugLevel;

  /** Dictionary priorities */
  priorities?: DictionaryPriorities;

  /** Active proper noun dictionaries */
  activeProperNouns?: string[];

  /** Enable cache pre-warming */
  preWarmCache?: boolean;
}

/**
 * Statistics for parallel lookup operations
 */
export interface ParallelLookupStats {
  /** Number of parallel lookups performed */
  parallelCalls: number;

  /** Number of sequential lookups performed */
  sequentialCalls: number;

  /** Average time for parallel lookups (ms) */
  averageParallelTime: number;

  /** Average time for sequential lookups (ms) */
  averageSequentialTime: number;

  /** Number of fallbacks to sequential */
  fallbackCount: number;
}

/**
 * Statistics for lookup indexing optimization
 */
export interface LookupIndexStats {
  /** Number of index builds */
  buildCalls: number;

  /** Average build time (ms) */
  avgBuildTime: number;

  /** Size of last index */
  lastIndexSize: number;

  /** Number of lookups saved by index */
  savedLookups: number;

  /** Total time saved by index (ms) */
  totalSavedTime: number;
}

/**
 * Global dictionary manager statistics
 */
export interface DictionaryManagerStats {
  /** Number of dictionaries loaded */
  dictionariesLoaded: number;

  /** Total entries across all dictionaries */
  totalEntries: number;

  /** Time taken to load dictionaries (ms) */
  loadTime: number;

  /** Whether manager is ready */
  ready: boolean;

  /** Parallel lookup statistics */
  parallelStats: ParallelLookupStats;

  /** Lookup index statistics */
  indexStats: LookupIndexStats;
}

/**
 * Result from filtering active dictionaries
 */
export interface FilteredDictionaries {
  /** Active dictionaries to load immediately */
  active: Record<string, DictionaryData>;

  /** Pending dictionaries for lazy loading */
  pending: Record<string, DictionaryData>;
}

// ============================================================================
// WASM Integration
// ============================================================================

/**
 * Options for EnhancedDictionaryManager
 */
export interface EnhancedDictionaryManagerOptions extends DictionaryManagerOptions {
  /** Enable WASM acceleration */
  enableWasm?: boolean;

  /** WASM memory limit (MB) */
  wasmMemoryLimit?: number;
}

/**
 * Performance comparison between WASM and JavaScript
 */
export interface PerformanceComparison {
  /** Number of WASM lookups */
  wasmLookups: number;

  /** Number of JavaScript lookups */
  jsLookups: number;

  /** Total WASM time (ms) */
  wasmTotalTime: number;

  /** Total JavaScript time (ms) */
  jsTotalTime: number;

  /** Average WASM time per lookup (ms) */
  wasmAverageTime: number;

  /** Average JavaScript time per lookup (ms) */
  jsAverageTime: number;

  /** Speedup ratio (JS time / WASM time) */
  speedupRatio: number;
}

/**
 * WASM dictionary entry format
 */
export interface WasmDictionaryEntry {
  /** Chinese text */
  chinese: string;

  /** Vietnamese translation */
  vietnamese: string;

  /** Metadata as JSON string or null */
  metadata: string | null;
}

/**
 * Batch dictionary data for WASM loading
 */
export interface WasmBatchDictionary {
  /** Dictionary name */
  name: string;

  /** Dictionary entries */
  entries: WasmDictionaryEntry[];
}

/**
 * WASM match result (from Rust engine)
 */
export interface WasmMatchResult {
  /** Matched word */
  word: string;

  /** Translation */
  translation: string;

  /** Start position */
  start_pos: number;

  /** End position */
  end_pos: number;

  /** Metadata as JSON string or null */
  metadata: string | null;
}

/**
 * WASM performance statistics (from Rust engine)
 */
export interface WasmPerformanceStats {
  /** Total number of lookups */
  totalLookups?: number;

  /** Total time spent (ms) */
  totalTime?: number;

  /** Average lookup time (ms) */
  averageTime?: number;

  /** Cache hit rate (0-1) */
  cacheHitRate?: number;

  /** Memory usage (bytes) */
  memoryUsageBytes?: number;

  /** Number of dictionaries loaded */
  dictionariesLoaded?: number;

  /** Total entries across all dictionaries */
  totalEntries?: number;
}

/**
 * Options for WasmDictionaryManager
 */
export interface WasmDictionaryManagerOptions {
  /** Maximum consecutive failures before fallback */
  maxFailuresBeforeFallback?: number;
}

/**
 * WASM dictionary manager performance report
 */
export interface WasmPerformanceReport extends WasmPerformanceStats {
  /** Whether WASM is initialized */
  initialized: boolean;

  /** Whether in fallback mode */
  fallbackMode: boolean;

  /** Number of consecutive failures */
  consecutiveFailures?: number;

  /** Error message if not initialized */
  error?: string;
}

/**
 * Enhanced performance report with memory pool stats
 */
export interface WasmEnhancedPerformanceReport extends WasmPerformanceReport {
  /** Memory pool statistics */
  memoryPool: MemoryPoolStats;
}

/**
 * Memory pool statistics
 */
export interface MemoryPoolStats {
  /** Pool allocation statistics */
  allocations: number;

  /** Pool deallocation statistics */
  deallocations: number;

  /** Current pool size */
  currentSize: number;

  /** Peak pool size */
  peakSize: number;

  /** Recycling efficiency (0-1) */
  recyclingEfficiency: number;
}

/**
 * WASM validation difference
 */
export interface WasmValidationDifference {
  /** Test word */
  word: string;

  /** WASM result */
  wasm: {
    translation: string | null;
    dictionary: string | null;
    word: string | null;
  };

  /** JavaScript result */
  js: {
    translation: string | null;
    dictionary: string | null;
    word: string | null;
  };
}

/**
 * WASM validation error
 */
export interface WasmValidationError {
  /** Test word */
  word: string;

  /** Error type */
  type: 'WASM_ERROR' | 'JS_ERROR' | 'VALIDATION_ERROR';

  /** Error message */
  error: string;
}

/**
 * WASM validation performance metrics
 */
export interface WasmValidationPerformance {
  /** Total WASM time (ms) */
  wasmTotalTime: number;

  /** Total JavaScript time (ms) */
  jsTotalTime: number;

  /** Speedup ratio */
  speedupRatio: number;
}

/**
 * WASM validation results
 */
export interface WasmValidationResults {
  /** Number of identical results */
  identical: number;

  /** Number of different results */
  different: number;

  /** Number of WASM errors */
  wasmErrors: number;

  /** Number of JavaScript errors */
  jsErrors: number;
}

/**
 * Result from WASM fallback validation
 */
export interface WasmValidationResult {
  /** Timestamp of validation */
  timestamp: number;

  /** Whether WASM is available */
  wasmAvailable: boolean;

  /** Number of test words */
  testWordsCount: number;

  /** Validation status */
  status?: 'PASS' | 'FAIL_DIFFERENCES' | 'FAIL_ERRORS' | 'SKIPPED';

  /** Reason for skip */
  reason?: string;

  /** Validation results */
  results: WasmValidationResults;

  /** Differences found */
  differences: WasmValidationDifference[];

  /** Errors encountered */
  errors: WasmValidationError[];

  /** Performance comparison */
  performance: WasmValidationPerformance;
}

/**
 * Periodic WASM validation tracking
 */
export interface WasmValidationTracking {
  /** Total validations performed */
  totalValidations: number;

  /** Number of passed validations */
  passedValidations: number;

  /** Number of failed validations */
  failedValidations: number;

  /** Last validation result */
  lastValidation: WasmValidationResult | null;
}

/**
 * Enhanced performance report with WASM comparison
 */
export interface EnhancedPerformanceReport extends ParallelLookupStats, LookupIndexStats {
  /** WASM integration details */
  wasmIntegration: {
    /** Whether WASM is enabled */
    enabled: boolean;

    /** Whether WASM is initialized */
    initialized: boolean;

    /** Whether in fallback mode */
    fallbackMode: boolean;

    /** Performance comparison */
    wasmLookups: number;
    jsLookups: number;
    wasmTotalTime: number;
    jsTotalTime: number;
    wasmAverageTime: number;
    jsAverageTime: number;
    speedupRatio: number;

    /** WASM-specific metrics */
    wasmStats: WasmPerformanceReport | null;

    /** WASM validation results */
    validation: WasmValidationTracking;
  };
}

/**
 * Memory usage breakdown
 */
export interface MemoryUsage {
  /** JavaScript memory usage */
  javascript: {
    dictionariesLoaded: number;
    totalEntries: number;
  };

  /** WASM memory usage */
  wasm: {
    memoryUsageBytes: number;
    dictionariesLoaded: number;
    totalEntries: number;
  };

  /** Combined metrics */
  combined: {
    totalDictionaries: number;
    totalEntries: number;
    estimatedMemoryMB: number;
  };
}

// ============================================================================
// Type Guards and Utility Types
// ============================================================================

/**
 * Type guard for checking if target is object format
 */
export function isDictionaryObjectFormat(
  target: string | { translation: string; allowAsPatternVariable?: boolean }
): target is { translation: string; allowAsPatternVariable?: boolean };

/**
 * Type guard for checking if result is TranslationResult
 */
export function isTranslationResult(result: any): result is TranslationResult;

/**
 * Type guard for checking if entry is valid DictionaryEntry
 */
export function isDictionaryEntry(entry: any): entry is DictionaryEntry;

// ============================================================================
// Class Interfaces
// ============================================================================

/**
 * DictionaryTrie class interface
 */
export interface DictionaryTrieInterface {
  root: TrieNode;
  size: number;
  sharedMatchesArray: TrieMatch[];

  insert(word: string, translation: string, metadata?: DictionaryEntryMetadata | null): void;
  get(word: string): string | null;
  getWithMetadata(
    word: string
  ): { translation: string; metadata: DictionaryEntryMetadata | null } | null;
  has(word: string): boolean;
  findMatches(text: string, startPos?: number): TrieMatch[];
  findLongestMatch(text: string, startPos?: number): TrieMatch | null;
  getStats(): TrieStats;
  getNodeCount(): number;
  getMaxDepth(): number;
  getAverageDepth(): number;
  validateIntegrity(): TrieValidationResult;
  repair(validationResult?: TrieValidationResult | null): TrieRepairResult;
  getHealthScore(): TrieHealthScore;
}

/**
 * DictionaryManager class interface
 */
export interface DictionaryManagerInterface {
  dictionaries: Map<string, DictionaryTrieInterface>;
  metadata: Map<string, DictionaryMetadata>;
  pendingDictionaries: Record<string, DictionaryData> | null;
  loadTime: number;
  ready: boolean;
  debugLevel: DebugLevel;
  cache: any; // TranslationCache
  enableParallelLookups: boolean;
  maxParallelDictionaries: number;
  dictionaryParallelThreshold: number;
  parallelLookupStats: ParallelLookupStats;
  lookupIndexStats: LookupIndexStats;

  log(level: DebugLevel, message: string, data?: any): void;
  loadDictionaries(
    dictionaryData: Record<string, DictionaryData>,
    options?: DictionaryLoadOptions
  ): Promise<void>;
  estimateFrequency(source: string, dictionaryName: string): number;
  translate(word: string, dictionaryOrder?: DictionarySearchOrder | null): TranslationResult | null;
  findMatchesThreadSafe(
    dictionary: DictionaryTrieInterface,
    text: string,
    startPos?: number
  ): TrieMatch[];
  findAllMatchesParallel(
    text: string,
    startPos?: number,
    dictionaryOrder?: DictionarySearchOrder | null
  ): Promise<DictionaryMatchResult[]>;
  getDefaultSearchOrder(): DictionarySearchOrder;
  getGlobalStats(): DictionaryManagerStats;
  filterActiveDictionaries(
    dictionaryData: Record<string, DictionaryData>,
    options: DictionaryLoadOptions
  ): Record<string, DictionaryData>;
  getPendingDictionaries(
    dictionaryData: Record<string, DictionaryData>,
    active: Record<string, DictionaryData>
  ): Record<string, DictionaryData>;
}

/**
 * EnhancedDictionaryManager class interface
 */
export interface EnhancedDictionaryManagerInterface extends DictionaryManagerInterface {
  enableWasm: boolean;
  wasmMemoryLimit: number;
  wasmManager: WasmDictionaryManagerInterface | null;
  wasmInitialized: boolean;
  wasmInitPromise: Promise<void> | null;
  performanceComparison: PerformanceComparison;
  wasmValidationCounter: number;
  wasmValidationResults: WasmValidationTracking;

  initializeWasm(): Promise<void>;
  syncDictionariesToWasm(): Promise<void>;
  extractTrieEntries(trie: DictionaryTrieInterface): DictionaryEntry[];
  translateJS(
    word: string,
    dictionaryOrder?: DictionarySearchOrder | null
  ): TranslationResult | null;
  translateWasm(
    word: string,
    dictionaryOrder?: DictionarySearchOrder | null
  ): TranslationResult | null;
  findAllMatchesWasm(
    text: string,
    startPos?: number,
    dictionaryOrder?: DictionarySearchOrder | null
  ): Promise<DictionaryMatchResult[]>;
  reloadDictionaries(
    dictionaryData: Record<string, DictionaryData>,
    options?: DictionaryLoadOptions
  ): Promise<void>;
  validateWasmFallback(
    testWords?: string[] | null,
    dictionaryOrder?: DictionarySearchOrder | null
  ): WasmValidationResult;
  periodicWasmValidation(currentWord: string, validationFrequency?: number): void;
  getPerformanceReport(): EnhancedPerformanceReport;
  isWasmBeneficial(): boolean;
  getMemoryUsage(): MemoryUsage;
}

/**
 * WasmDictionaryManager class interface
 */
export interface WasmDictionaryManagerInterface {
  engine: any | null;
  initialized: boolean;
  fallbackManager: any | null;
  performanceStats: WasmPerformanceStats;
  consecutiveFailures: number;
  maxFailuresBeforeFallback: number;
  fallbackMode: boolean;
  memoryPool: any; // wasmMemoryPoolManager

  initialize(): Promise<boolean>;
  loadDictionary(name: string, entries: DictionaryEntry[]): Promise<boolean>;
  loadDictionariesBatch(dictionaries: WasmBatchDictionary[]): Promise<boolean>;
  findMatches(dictionaryName: string, text: string, startPos?: number): TrieMatch[];
  findLongestMatch(dictionaryName: string, text: string, startPos?: number): TrieMatch | null;
  handleFailure(): void;
  getPerformanceReport(): WasmPerformanceReport;
  getDictionaryCount(): number;
  getTotalEntries(): number;
  hasDictionary(name: string): boolean;
  clearAllDictionaries(): void;
  isInitialized(): boolean;
  isInFallbackMode(): boolean;
  estimateBatchMemoryRequirement(dictionaries: WasmBatchDictionary[]): number;
  getEnhancedPerformanceReport(): WasmEnhancedPerformanceReport;
  cleanup(): void;
}
