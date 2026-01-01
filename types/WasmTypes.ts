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
 * Throws if WASM returned undefined instead of null,
 * preventing "undefined" from appearing as literal text in translations.
 */
export function validateWasmToken(token: unknown): WasmToken {
  const t = token as WasmToken;

  // Critical: undefined MUST be converted to null
  if (t.translated === undefined) {
    console.warn('⚠️ WASM token has undefined translated value, converting to null');
    t.translated = null;
  }

  if (t.translationSource === undefined) {
    t.translationSource = null;
  }

  return t;
}

/**
 * Safe copy of WASM tokens to JavaScript tokens
 * Handles Option::None → undefined → null conversion
 */
export function copyWasmTokens(source: WasmToken[], target: any[]): void {
  if (source.length !== target.length) {
    throw new Error(`Token array length mismatch: source=${source.length}, target=${target.length}`);
  }

  for (let i = 0; i < source.length; i++) {
    const processed = validateWasmToken(source[i]);

    // Only copy if WASM actually modified the token
    if (processed.translationSource !== undefined && processed.translationSource !== null) {
      target[i].translationSource = processed.translationSource;

      // Consumed tokens: explicit null
      if (processed.translationSource.includes('consumed')) {
        target[i].translated = null;
      }
      // Converted tokens: copy translation
      else if (processed.translated !== undefined) {
        target[i].translated = processed.translated;
      }
    }
  }
}
