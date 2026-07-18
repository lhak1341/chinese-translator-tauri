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
