/**
 * TypeScript type definitions for WASM boundary types
 *
 * Defines interfaces for WebAssembly integration, including Rust engine bindings,
 * dictionary loading, number processing, and memory management.
 *
 * IMPORTANT: These types represent the JavaScript-WASM boundary.
 * Type mismatches can cause serialization errors and memory safety violations.
 */

import type { TranslationSource } from './TranslationEngineTypes';

/**
 * A token at the WASM-JavaScript boundary
 * Used by validateWasmToken and copyWasmTokens
 */
export interface WasmToken {
  /** Token type (e.g., 'chinese_char', 'punctuation') */
  type: string;

  /** Source text value */
  value: string;

  /** Translation result, or null for consumed/untranslated tokens */
  translated: string | null;

  /**
   * Translation phase that produced this token, or null if untranslated.
   * Must be a valid TranslationSource — unknown strings cause getSourcePriority()
   * to return 999, silently deprioritizing below character-level fallback.
   */
  translationSource: TranslationSource | null;
}
