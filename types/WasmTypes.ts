/**
 * WASM-JavaScript Type Contracts
 *
 * Critical: Rust Option<T> serializes to JavaScript undefined (not null).
 * These interfaces enforce explicit null handling at WASM boundaries.
 */

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
 */
export function copyWasmTokens(source: WasmToken[], target: any[]): void {
  if (source.length !== target.length) {
    throw new Error(
      `Token array length mismatch: source=${source.length}, target=${target.length}`
    );
  }

  // PHASE 1: Validate all tokens before modifying target
  // This prevents partial corruption if validation fails mid-array
  const validatedTokens: WasmToken[] = [];
  for (let i = 0; i < source.length; i++) {
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
