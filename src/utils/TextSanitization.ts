/**
 * Text Sanitization Utilities
 *
 * Sanitizes user input to prevent JSON corruption and security issues
 * in dictionary entries and other persisted text data.
 *
 * Critical for preventing:
 * - JSON serialization failures from null bytes, unpaired surrogates
 * - File corruption from control characters
 * - Display issues from malformed Unicode
 */

/**
 * Sanitize text for safe JSON storage
 *
 * Removes characters that could corrupt JSON files or cause display issues:
 * - Null bytes (\u0000) - break JSON.parse()
 * - Unpaired surrogates (\uD800-\uDFFF) - invalid Unicode
 * - Most control characters (except \n, \r, \t) - can break file parsing
 *
 * @param text - Input text to sanitize
 * @returns Sanitized text safe for JSON storage
 *
 * @example
 * ```ts
 * sanitizeForJson("Hello\u0000World") // → "HelloWorld"
 * sanitizeForJson("Test\uD800ing")    // → "Testing" (unpaired surrogate removed)
 * ```
 */
export function sanitizeForJson(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  return (
    text
      // Remove null bytes (U+0000) - breaks JSON parsing
      .replace(/\u0000/g, '')
      // Remove unpaired surrogates (U+D800 through U+DFFF)
      // These are invalid Unicode and cause serialization issues
      .replace(/[\uD800-\uDFFF]/g, '')
      // Remove other control characters except newline, carriage return, tab
      // Control chars: U+0000 to U+001F (except \n=0A, \r=0D, \t=09)
      // Also remove U+007F (DEL) and U+0080-009F (C1 control codes)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
  );
}

/**
 * Sanitize dictionary entry (source and translation pair)
 *
 * Applies JSON sanitization and additional cleanup:
 * - Trims leading/trailing whitespace
 * - Normalizes internal whitespace (preserves single spaces/newlines)
 *
 * @param source - Dictionary source text
 * @param translation - Dictionary translation text
 * @returns Sanitized { source, translation } pair
 *
 * @example
 * ```ts
 * sanitizeDictionaryEntry("  源文本  ", "  译文\u0000  ")
 * // → { source: "源文本", translation: "译文" }
 * ```
 */
export function sanitizeDictionaryEntry(
  source: string,
  translation: string
): { source: string; translation: string } {
  return {
    source: sanitizeForJson(source).trim(),
    translation: sanitizeForJson(translation).trim(),
  };
}

/**
 * Validate sanitized entry is not empty
 *
 * @param source - Sanitized source text
 * @param translation - Sanitized translation text
 * @returns Error message if invalid, null if valid
 */
export function validateSanitizedEntry(source: string, translation: string): string | null {
  if (!source || !source.trim()) {
    return 'Source text cannot be empty';
  }
  if (!translation || !translation.trim()) {
    return 'Translation cannot be empty';
  }
  return null;
}

/**
 * Sanitize and validate dictionary entry in one step
 *
 * @param source - Raw source text
 * @param translation - Raw translation text
 * @returns { sanitized: { source, translation }, error: string | null }
 *
 * @example
 * ```ts
 * const result = sanitizeAndValidate("  源  ", "译\u0000");
 * if (result.error) {
 *   console.error(result.error);
 * } else {
 *   saveDictionary(result.sanitized.source, result.sanitized.translation);
 * }
 * ```
 */
export function sanitizeAndValidate(
  source: string,
  translation: string
): {
  sanitized: { source: string; translation: string };
  error: string | null;
} {
  const sanitized = sanitizeDictionaryEntry(source, translation);
  const error = validateSanitizedEntry(sanitized.source, sanitized.translation);

  return { sanitized, error };
}
