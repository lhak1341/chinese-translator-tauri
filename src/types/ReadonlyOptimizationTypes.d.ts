/**
 * ReadonlyArray Optimization Type Definitions
 *
 * Enables V8 optimizations through ReadonlyArray usage in translation phases.
 *
 * Performance Benefits:
 * - Escape analysis: V8 can prove arrays aren't mutated
 * - Skip bounds checks: More aggressive optimizations
 * - Better inlining: Array access functions can be inlined
 * - Cache locality: Separating reads from writes improves CPU cache usage
 *
 * Expected Impact: 5-10% reduction in token processing time
 *
 * @file ReadonlyOptimizationTypes.d.ts
 */

import { Token } from './SemanticTypes';

// ============================================================================
// Token Update Tracking
// ============================================================================

/**
 * Represents a pending modification to a token
 *
 * Used to separate read operations from write operations,
 * enabling V8 to optimize read-only array access.
 */
export interface TokenUpdate {
  /** Token index to update */
  index: number;

  /** New translation value (null = consumed) */
  translated: string | null;

  /** Translation source identifier */
  translationSource?: string;

  /** Metadata to attach */
  metadata?: {
    phase?: number;
    confidence?: number;
    pattern?: string;
    dictionary?: string;
  };
}

/**
 * Collection of pending token updates
 *
 * Accumulates modifications during read-only phase, then applies
 * them in a single batch write operation.
 */
export interface TokenUpdateBatch {
  /** Map of token index to update */
  updates: ReadonlyMap<number, TokenUpdate>;

  /** Phase that generated these updates */
  phase: number;

  /** Number of updates in this batch */
  count: number;
}

// ============================================================================
// Phase Processing Contexts
// ============================================================================

/**
 * Read-only context for token processing phases
 *
 * All token arrays are readonly to enable V8 optimizations.
 * Modifications are tracked separately and applied in batch.
 */
export interface PhaseProcessingContext {
  /** Read-only token array (enables V8 escape analysis) */
  readonly tokens: ReadonlyArray<Readonly<Token>>;

  /** Pending modifications to apply after phase */
  readonly updates: Map<number, TokenUpdate>;

  /** Current phase number (1-5) */
  readonly phase: number;

  /** Processing options */
  readonly options: Readonly<{
    debugLevel?: number;
    abortSignal?: AbortSignal;
  }>;
}

/**
 * Context for pattern processing (Phase 1)
 *
 * Pattern phase identifies structural patterns and extracts variables.
 */
export interface PatternPhaseContext extends PhaseProcessingContext {
  readonly phase: 1;

  /** Pattern definitions to match */
  readonly patterns: ReadonlyArray<
    Readonly<{
      pattern: string;
      template: string;
      priority: number;
    }>
  >;

  /** Variable cache for pattern substitution */
  readonly variableCache: ReadonlyMap<string, string>;
}

/**
 * Context for proper noun processing (Phase 2)
 *
 * Proper noun phase translates novel-specific terms.
 */
export interface ProperNounPhaseContext extends PhaseProcessingContext {
  readonly phase: 2;

  /** Active proper noun dictionaries */
  readonly activeDictionaries: ReadonlyArray<string>;

  /** Dictionary lookup function (read-only) */
  readonly lookupProperNoun: (text: string) => string | null;
}

/**
 * Context for number processing (Phase 3)
 *
 * Number phase converts Chinese numbers to Arabic numerals.
 */
export interface NumberPhaseContext extends PhaseProcessingContext {
  readonly phase: 3;

  /** WASM number processor (if available) */
  readonly wasmProcessor?: {
    processNumbers: (tokens: ReadonlyArray<Token>) => ReadonlyArray<Token>;
  };
}

/**
 * Context for phrase processing (Phase 4)
 *
 * Phrase phase translates common multi-character phrases.
 */
export interface PhrasePhaseContext extends PhaseProcessingContext {
  readonly phase: 4;

  /** Phrase dictionary lookup function */
  readonly lookupPhrase: (text: string) => string | null;

  /** Maximum phrase length to check */
  readonly maxPhraseLength: number;
}

/**
 * Context for character processing (Phase 5)
 *
 * Character phase provides fallback translations for individual characters.
 */
export interface CharacterPhaseContext extends PhaseProcessingContext {
  readonly phase: 5;

  /** Character dictionary lookup function */
  readonly lookupCharacter: (char: string) => string | null;

  /** Rust trie for fast lookups (if available) */
  readonly wasmTrie?: {
    findLongestMatch: (text: string, pos: number) => { translation: string } | null;
  };
}

// ============================================================================
// Batch Update Application
// ============================================================================

/**
 * Options for applying token updates
 */
export interface ApplyUpdatesOptions {
  /** Whether to validate updates before applying */
  validate?: boolean;

  /** Whether to preserve original values */
  preserveOriginal?: boolean;

  /** Debug logging level */
  debugLevel?: number;
}

/**
 * Result of applying token updates
 */
export interface ApplyUpdatesResult {
  /** Number of updates successfully applied */
  applied: number;

  /** Number of updates skipped (e.g., already translated) */
  skipped: number;

  /** Number of updates failed (validation errors) */
  failed: number;

  /** Processing time in milliseconds */
  duration: number;
}

// ============================================================================
// Scan Operations (Read-Only)
// ============================================================================

/**
 * Options for scanning tokens (read-only operation)
 */
export interface TokenScanOptions {
  /** Start index (inclusive) */
  startIndex?: number;

  /** End index (exclusive) */
  endIndex?: number;

  /** Filter predicate */
  filter?: (token: Readonly<Token>, index: number) => boolean;
}

/**
 * Result of scanning tokens
 */
export interface TokenScanResult {
  /** Indices of matching tokens */
  readonly indices: ReadonlyArray<number>;

  /** Number of tokens scanned */
  readonly scanned: number;

  /** Number of tokens matched */
  readonly matched: number;
}

// ============================================================================
// V8 Optimization Utilities
// ============================================================================

/**
 * Create read-only copy of tokens for phase processing
 *
 * This function creates a readonly view of tokens that enables
 * V8 to perform escape analysis and skip bounds checks.
 *
 * @param tokens - Mutable token array
 * @returns Readonly token array optimized for V8
 */
export declare function createReadonlyTokens(tokens: Token[]): ReadonlyArray<Readonly<Token>>;

/**
 * Apply pending updates to tokens in a single batch
 *
 * Performs all modifications in one pass for better cache locality
 * and to minimize V8 deoptimization.
 *
 * @param tokens - Mutable token array
 * @param updates - Map of pending updates
 * @param options - Application options
 * @returns Result of update operation
 */
export declare function applyTokenUpdates(
  tokens: Token[],
  updates: ReadonlyMap<number, TokenUpdate>,
  options?: ApplyUpdatesOptions
): ApplyUpdatesResult;

/**
 * Scan tokens for matches without modification
 *
 * Read-only scan operation that V8 can heavily optimize.
 *
 * @param tokens - Readonly token array
 * @param predicate - Match predicate
 * @param options - Scan options
 * @returns Scan result with matched indices
 */
export declare function scanTokens(
  tokens: ReadonlyArray<Readonly<Token>>,
  predicate: (token: Readonly<Token>, index: number) => boolean,
  options?: TokenScanOptions
): TokenScanResult;

/**
 * Create token update for batch application
 *
 * @param index - Token index
 * @param translated - New translation value
 * @param source - Translation source
 * @param metadata - Optional metadata
 * @returns Token update object
 */
export declare function createTokenUpdate(
  index: number,
  translated: string | null,
  source?: string,
  metadata?: TokenUpdate['metadata']
): TokenUpdate;

// ============================================================================
// Performance Monitoring
// ============================================================================

/**
 * Performance metrics for readonly optimizations
 */
export interface ReadonlyOptimizationMetrics {
  /** Number of read-only scans performed */
  readOnlyScans: number;

  /** Number of batch updates applied */
  batchUpdates: number;

  /** Average scan time (ms) */
  avgScanTime: number;

  /** Average update time (ms) */
  avgUpdateTime: number;

  /** Estimated time saved vs direct modification (ms) */
  estimatedSavings: number;

  /** V8 optimization tier (1=baseline, 2=optimized, 3=turbofan) */
  v8OptimizationTier?: number;
}

/**
 * Get performance metrics for readonly optimizations
 *
 * @returns Current metrics
 */
export declare function getReadonlyOptimizationMetrics(): ReadonlyOptimizationMetrics;

/**
 * Reset performance metrics
 */
export declare function resetReadonlyOptimizationMetrics(): void;
