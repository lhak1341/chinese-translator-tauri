/**
 * Text Normalization Helpers
 *
 * Shared utilities for normalizing Vietnamese text to NFC form.
 *
 * CRITICAL: Vietnamese diacritics can be represented in two forms:
 * - NFC (Normalized Form Composed): Precomposed characters (e.g., "à" = single char)
 * - NFD (Normalized Form Decomposed): Base + combining marks (e.g., "à" = "a" + combining grave)
 *
 * Example impact on text length:
 * - "màu" in NFC = 3 characters (m, à, u)
 * - "màu" in NFD = 4 characters (m, a, combining-grave, u)
 *
 * Normalizing to NFC ensures:
 * 1. Consistent .length calculations across all text
 * 2. Reliable position tracking in semantic arrays
 * 3. Correct substring matching in highlighting
 * 4. Consistent hash calculations in caching
 *
 * CODE REVIEW FIX (2026-02-07): Extracted from ClickableTranslationSemantic.tsx
 * and SegmentPrecomputer.ts to eliminate duplication.
 */

/**
 * Normalize Vietnamese text to NFC form (synchronous)
 *
 * Use this for highlighting, position tracking, and any operation requiring
 * consistent character counts.
 *
 * @param text - Text to normalize (can be null/undefined)
 * @returns NFC-normalized text, or null/undefined if input is null/undefined
 *
 * @example
 * ```typescript
 * // Before normalization
 * const text = "màu trắng"; // May be NFD (decomposed)
 * console.log(text.length); // Could be 11 or 9 depending on form
 *
 * // After normalization
 * const normalized = normalizeVietnameseText(text);
 * console.log(normalized.length); // Always 9 (NFC form)
 * ```
 */
export function normalizeVietnameseText(
  text: string | null | undefined
): string | null | undefined {
  if (text === null || text === undefined) {
    return text;
  }

  return text.normalize('NFC');
}

/**
 * Normalize an array of Vietnamese text strings to NFC form (synchronous)
 *
 * Efficiently normalizes multiple strings in a single operation.
 *
 * @param texts - Array of texts to normalize
 * @returns Array of NFC-normalized texts
 *
 * @example
 * ```typescript
 * const units = ["màu", "trắng", "đỏ"];
 * const normalized = normalizeVietnameseTexts(units);
 * // All units now in NFC form
 * ```
 */
export function normalizeVietnameseTexts(
  texts: (string | null | undefined)[]
): (string | null | undefined)[] {
  return texts.map((text) => normalizeVietnameseText(text));
}

/**
 * Check if text is already in NFC form (synchronous)
 *
 * Useful for validation and debugging.
 *
 * @param text - Text to check
 * @returns True if text is in NFC form, false otherwise
 *
 * @example
 * ```typescript
 * const text = "màu trắng";
 * if (!isNFC(text)) {
 *   console.warn("Text not normalized!");
 * }
 * ```
 */
export function isNFC(text: string): boolean {
  return text === text.normalize('NFC');
}

/**
 * Get normalization statistics for debugging
 *
 * Returns information about whether normalization changed the text.
 *
 * @param text - Text to analyze
 * @returns Object with original length, normalized length, and whether it changed
 *
 * @example
 * ```typescript
 * const stats = getNormalizationStats("màu trắng");
 * console.log(stats);
 * // { originalLength: 11, normalizedLength: 9, changed: true }
 * ```
 */
export function getNormalizationStats(text: string): {
  originalLength: number;
  normalizedLength: number;
  changed: boolean;
  form: 'NFC' | 'NFD' | 'unknown';
} {
  const normalized = text.normalize('NFC');
  return {
    originalLength: text.length,
    normalizedLength: normalized.length,
    changed: text !== normalized,
    form: text === normalized ? 'NFC' : text === text.normalize('NFD') ? 'NFD' : 'unknown',
  };
}
