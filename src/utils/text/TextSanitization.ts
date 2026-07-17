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
function sanitizeForJson(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  // Single pass: removes null bytes, control characters (except \n=0A, \r=0D, \t=09),
  // and UNPAIRED surrogates only. A lone \uD800-\uDBFF/\uDC00-\uDFFF character class match
  // (no pairing check) would also strip valid surrogate pairs — e.g. emoji and other
  // astral-plane chars (U+10000+) are two code units in a JS string, and stripping both
  // unconditionally silently deletes them. The lookahead/lookbehind below only match a
  // high surrogate NOT followed by a low one, or a low surrogate NOT preceded by a high one.
  return text.replace(
    /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ''
  );
}

/**
 * Sanitize dictionary entry (source and translation pair)
 *
 * Applies JSON sanitization and trims leading/trailing whitespace.
 * Does not touch internal whitespace — internal spaces/newlines pass through unchanged.
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
