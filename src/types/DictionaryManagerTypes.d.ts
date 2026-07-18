/**
 * DictionaryManagerTypes.d.ts
 *
 * TypeScript type definitions for the Dictionary Management system's trie layer.
 *
 * @module DictionaryManagerTypes
 */

// ============================================================================
// Core Trie Structures
// ============================================================================

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
