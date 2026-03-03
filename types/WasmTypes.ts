/**
 * @file WasmTypes.ts
 * WASM-JavaScript Type Contracts (test-only types)
 *
 * Critical: Rust Option<T> serializes to JavaScript undefined (not null).
 * These interfaces enforce explicit null handling at WASM boundaries.
 */

// === PROD SIBLING: src/utils/wasm/WasmBoundaryValidation.ts — REVERSED param order ===
// CRITICAL: copyWasmTokens(param1, param2) has REVERSED parameter semantics vs the prod file:
//   This file (tests): param1 = WASM source, param2 = JS destination
//   src/utils/wasm/WasmBoundaryValidation.ts (prod): param1 = JS destination, param2 = WASM source
// Swapping causes silent data loss. Do NOT unify without testing both paths.

/**
 * Token structure returned by WASM processors
 *
 * IMPORTANT: When copying WASM tokens to JavaScript tokens:
 * - Rust None → JavaScript undefined (NOT null)
 * - Must explicitly convert undefined → null
 * - Consumed tokens MUST have translated: null (not undefined)
 */
export interface WasmToken {
  type: string;
  value: string;

  /**
   * Translated text or null for consumed tokens.
   * NEVER undefined - must be explicitly converted to null.
   */
  translated: string | null;

  /**
   * Source of translation (e.g., "number_conversion", "number_conversion_consumed")
   * null for untranslated tokens, never undefined.
   */
  translationSource: string | null;
}

/**
 * Number processor result from WASM
 */
export interface WasmNumberProcessorResult {
  /**
   * Array of processed tokens with WASM conversions applied
   * Length MUST match input token array
   */
  tokens: WasmToken[];
}

/**
 * =============================================================================
 * WASM PATTERN PROCESSOR CONTRACTS
 * =============================================================================
 * Two-phase hierarchical pattern matching (WASM-only, no JavaScript fallback)
 */

/**
 * Pattern match result from WASM pattern processor
 * Returned by process_tokens_wasm()
 */
export interface WasmPatternMatch {
  /** Original Chinese text matched */
  originalText: string;

  /** Vietnamese translation */
  translation: string;

  /** Start token index in semantic token array */
  startIndex: number;

  /** End token index (inclusive) */
  endIndex: number;

  /** Source identifier (e.g., "hierarchical_patterns") */
  translationSource: string;

  /** Match type: "simple" or "composite" */
  type?: 'simple' | 'composite';

  /** Pattern information */
  pattern?: {
    originalPattern: string;
    translatedPattern: string;
  };

  /** Composite pattern components (for debugging) */
  components?: string[];
}

/**
 * Validation for WASM pattern match results
 * Ensures all required fields are present and correctly typed
 */
export function validateWasmPatternMatch(match: unknown): WasmPatternMatch {
  const m = match as WasmPatternMatch;

  // Required fields
  if (typeof m.originalText !== 'string') {
    throw new Error('Pattern match missing originalText');
  }
  if (typeof m.translation !== 'string') {
    throw new Error('Pattern match missing translation');
  }
  if (typeof m.startIndex !== 'number') {
    throw new Error('Pattern match missing startIndex');
  }
  if (typeof m.endIndex !== 'number') {
    throw new Error('Pattern match missing endIndex');
  }

  // Convert undefined → null for optional fields
  const translationSource =
    m.translationSource === undefined ? 'hierarchical_patterns' : m.translationSource;

  return {
    ...m,
    translationSource,
  };
}

/**
 * =============================================================================
 * WASM DICTIONARY ENGINE CONTRACTS
 * =============================================================================
 * Trie-based dictionary lookups (O(k) complexity)
 */

/**
 * Dictionary match result from WASM dictionary engine
 * Returned by find_matches()
 */
export interface WasmDictionaryMatch {
  /** Matched source text */
  word: string;

  /** Translation */
  translation: string;

  /** Match length in characters */
  length: number;

  /** Dictionary type (e.g., "properNouns-NovelName", "phrases") */
  dictionary: string;

  /** Priority for conflict resolution */
  priority?: number;

  /** Metadata (parsed from JSON) */
  metadata?: {
    allowAsPatternVariable?: boolean;
    lowPriority?: boolean;
    [key: string]: any;
  };
}

/**
 * Validation for WASM dictionary match results
 */
export function validateWasmDictionaryMatch(match: unknown): WasmDictionaryMatch {
  const m = match as WasmDictionaryMatch;

  // Required fields
  if (typeof m.word !== 'string') {
    throw new Error('Dictionary match missing word');
  }
  if (typeof m.translation !== 'string') {
    throw new Error('Dictionary match missing translation');
  }
  if (typeof m.dictionary !== 'string') {
    throw new Error('Dictionary match missing dictionary');
  }

  // Convert undefined → null/default
  const length = m.length === undefined ? m.word.length : m.length;
  const priority = m.priority === undefined ? 0 : m.priority;

  return {
    ...m,
    length,
    priority,
  };
}

/**
 * Batch dictionary load response from WASM
 * Returned by load_dictionaries_parallel()
 */
export interface WasmBatchDictionaryResult {
  /** Dictionary ID (e.g., "properNouns-NovelName") */
  dictionary_id: string;

  /** Whether load succeeded */
  success: boolean;

  /** Entry count if successful */
  entry_count?: number;

  /** Error message if failed */
  error?: string;
}

/**
 * =============================================================================
 * RUST LOOKUP INDEX CONTRACTS
 * =============================================================================
 * Tauri backend trie indexing for character-only translation
 */

/**
 * Lookup index match result from Rust backend
 * Returned by lookup_characters() IPC call
 */
export interface RustLookupMatch {
  /** Matched character sequence */
  character: string;

  /** Translation */
  translation: string;

  /** Match length (usually 1 for characters) */
  length: number;

  /** Always "characters" for lookup index */
  dictionary: 'characters';
}

/**
 * Validation for Rust lookup index results
 */
export function validateRustLookupMatch(match: unknown): RustLookupMatch {
  const m = match as RustLookupMatch;

  // Required fields
  if (typeof m.character !== 'string') {
    throw new Error('Lookup match missing character');
  }
  if (typeof m.translation !== 'string') {
    throw new Error('Lookup match missing translation');
  }

  return {
    character: m.character,
    translation: m.translation,
    length: m.length === undefined ? m.character.length : m.length,
    dictionary: 'characters',
  };
}

/**
 * =============================================================================
 * WASM BOUNDARY SAFETY RULES
 * =============================================================================
 *
 * CRITICAL RULES FOR ALL WASM OPERATIONS:
 *
 * 1. **undefined → null Conversion**
 *    - Rust Option::None serializes to JavaScript undefined
 *    - MUST convert to null to prevent "undefined" appearing as literal text
 *    - Use validate* functions for all WASM responses
 *
 * 2. **Array Length Preservation**
 *    - Token processors MUST NOT insert/delete tokens
 *    - Input length MUST equal output length
 *    - Throw error if length mismatch detected
 *
 * 3. **In-Place Modification**
 *    - Modify existing token objects, don't replace array
 *    - Preserve object references for React state tracking
 *    - Only update translated/translationSource fields
 *
 * 4. **Consumed Token Pattern**
 *    - Consumed tokens: { translated: null, translationSource: "X_consumed" }
 *    - Converted tokens: { translated: string, translationSource: "X_conversion" }
 *    - Untouched tokens: { translated: null, translationSource: null }
 *
 * 5. **Two-Phase Validation**
 *    - Phase 1: Validate all tokens before modifying target
 *    - Phase 2: Copy only after all validations pass
 *    - Prevents partial corruption on validation failure
 *
 * 6. **Error Propagation**
 *    - WASM errors should trigger JavaScript fallback
 *    - Log errors but don't block translation
 *    - Return empty results (not null/undefined) for graceful degradation
 *
 * WHY THESE RULES EXIST:
 * - JavaScript-WASM boundary is NOT type-safe at runtime
 * - Rust serialization differs from JavaScript expectations
 * - Post-processing relies on exact token patterns
 * - Memory safety requires array length invariants
 * - User-facing errors must be prevented (not just logged)
 *
 * CONSEQUENCES OF VIOLATION:
 * - "undefined" appears as literal text in translations
 * - Post-processing skips wrong tokens (position mapping breaks)
 * - React state updates fail (object reference changes)
 * - Memory access violations in WASM
 * - Clickable highlighting precision lost
 * ============================================================================
 */

/**
 * Runtime validation for WASM token responses
 *
 * Returns a new token object with undefined converted to null,
 * preventing "undefined" from appearing as literal text in translations.
 * Does NOT mutate the input token.
 */
export function validateWasmToken(token: unknown): WasmToken {
  const t = token as WasmToken;

  // Critical: undefined MUST be converted to null
  const translated = t.translated === undefined ? null : t.translated;
  const translationSource = t.translationSource === undefined ? null : t.translationSource;

  // Warn if conversion was needed
  if (t.translated === undefined) {
    console.warn('⚠️ WASM token has undefined translated value, converting to null');
  }

  // Return new object without mutating input
  return {
    ...t,
    translated,
    translationSource,
  };
}

/**
 * Safe copy of WASM tokens to JavaScript tokens
 * Handles Option::None → undefined → null conversion
 * Uses two-phase validation to prevent partial failures
 * CRITICAL: Validates array length invariance during copy to detect WASM corruption
 */
export function copyWasmTokens(source: WasmToken[], target: any[]): void {
  if (source.length !== target.length) {
    throw new Error(
      `Token array length mismatch: source=${source.length}, target=${target.length}`
    );
  }

  // CRITICAL: Track original lengths to detect corruption during copy
  const originalSourceLength = source.length;
  const originalTargetLength = target.length;

  // PHASE 1: Validate all tokens before modifying target
  // This prevents partial corruption if validation fails mid-array
  const validatedTokens: WasmToken[] = [];
  for (let i = 0; i < source.length; i++) {
    // CRITICAL: Revalidate array lengths haven't changed mid-validation
    // Detects WASM corruption that modifies arrays during processing
    if (source.length !== originalSourceLength || target.length !== originalTargetLength) {
      throw new Error(
        `🔴 Token array corrupted during validation at index ${i}: ` +
          `source ${originalSourceLength}→${source.length}, target ${originalTargetLength}→${target.length}`
      );
    }

    try {
      const processed = validateWasmToken(source[i]);
      validatedTokens.push(processed);
    } catch (error) {
      // If validation fails, throw with context but don't leave target partially modified
      throw new Error(
        `Token validation failed at index ${i}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // PHASE 2: Copy validated tokens to target (safe since all are validated)
  for (let i = 0; i < validatedTokens.length; i++) {
    // CRITICAL: Revalidate array lengths haven't changed mid-copy
    // Detects corruption during copy operation itself
    if (source.length !== originalSourceLength || target.length !== originalTargetLength) {
      throw new Error(
        `🔴 Token array corrupted during copy at index ${i}: ` +
          `source ${originalSourceLength}→${source.length}, target ${originalTargetLength}→${target.length}`
      );
    }

    const processed = validatedTokens[i];

    // Only copy if WASM actually modified the token
    // Check for null (not undefined) since validateWasmToken converts undefined → null
    if (processed.translationSource !== null) {
      target[i].translationSource = processed.translationSource;

      // Consumed tokens: explicit null
      if (processed.translationSource.includes('consumed')) {
        target[i].translated = null;
      }
      // Converted tokens: copy translation
      else if (processed.translated !== null) {
        target[i].translated = processed.translated;
      }
    }
  }
}
