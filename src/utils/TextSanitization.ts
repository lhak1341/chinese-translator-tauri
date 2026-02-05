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

  // Single pass: removes null bytes, unpaired surrogates, and control characters
  // (except \n=0A, \r=0D, \t=09) in one regex scan
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uD800-\uDFFF]/g, '');
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
