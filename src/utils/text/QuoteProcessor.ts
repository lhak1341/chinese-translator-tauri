/**
 * Unified Quote Type System
 * Centralizes all quote handling and Unicode definitions
 * Replaces scattered hardcoded Unicode values throughout the codebase
 */

/**
 * All quote type definitions
 */
export const QUOTE_TYPES = {
  // Straight quotes (ASCII)
  STRAIGHT_DOUBLE: '"', // U+0022 - Standard double quote
  STRAIGHT_SINGLE: "'", // U+0027 - Standard apostrophe

  // Curly quotes (Unicode)
  CURLY_OPEN_DOUBLE: '\u201c', // U+201C - Left double quotation mark "
  CURLY_CLOSE_DOUBLE: '\u201d', // U+201D - Right double quotation mark "
  CURLY_OPEN_SINGLE: '\u2018', // U+2018 - Left single quotation mark '
  CURLY_CLOSE_SINGLE: '\u2019', // U+2019 - Right single quotation mark '

  // Angle quotes \u2014 converted from \u300a\u300b\u3008\u3009 by the Punctuation dictionary
  ANGLE_OPEN_DOUBLE: '\u00ab', // U+00AB - \u00ab Left-pointing double angle quotation mark
  ANGLE_CLOSE_DOUBLE: '\u00bb', // U+00BB - \u00bb Right-pointing double angle quotation mark
  ANGLE_OPEN_SINGLE: '<', // U+003C - < (from \u3008)
  ANGLE_CLOSE_SINGLE: '>', // U+003E - > (from \u3009)
} as const;

/**
 * Quote categories for different purposes
 */
export const QUOTE_CATEGORIES = {
  /** Opening quote characters */
  OPENING: [
    QUOTE_TYPES.STRAIGHT_DOUBLE,
    QUOTE_TYPES.CURLY_OPEN_DOUBLE,
    QUOTE_TYPES.CURLY_OPEN_SINGLE,
    QUOTE_TYPES.ANGLE_OPEN_DOUBLE,
    QUOTE_TYPES.ANGLE_OPEN_SINGLE,
  ] as const,

  /** Closing quote characters */
  CLOSING: [
    QUOTE_TYPES.CURLY_CLOSE_DOUBLE,
    QUOTE_TYPES.CURLY_CLOSE_SINGLE,
    QUOTE_TYPES.ANGLE_CLOSE_DOUBLE,
    QUOTE_TYPES.ANGLE_CLOSE_SINGLE,
  ] as const,

  /** All quote characters */
  ALL: [
    QUOTE_TYPES.STRAIGHT_DOUBLE,
    QUOTE_TYPES.STRAIGHT_SINGLE,
    QUOTE_TYPES.CURLY_OPEN_DOUBLE,
    QUOTE_TYPES.CURLY_CLOSE_DOUBLE,
    QUOTE_TYPES.CURLY_OPEN_SINGLE,
    QUOTE_TYPES.CURLY_CLOSE_SINGLE,
    QUOTE_TYPES.ANGLE_OPEN_DOUBLE,
    QUOTE_TYPES.ANGLE_CLOSE_DOUBLE,
    QUOTE_TYPES.ANGLE_OPEN_SINGLE,
    QUOTE_TYPES.ANGLE_CLOSE_SINGLE,
  ] as const,
};

/**
 * Quote processor utility class
 * All methods are static for convenient access
 */
export class QuoteProcessor {
  /**
   * Check if character is an opening quote
   * @param char - Character to check
   * @returns True if opening quote
   */
  static isOpeningQuote(char: string): boolean {
    return (QUOTE_CATEGORIES.OPENING as readonly string[]).includes(char);
  }

  /**
   * Check if character is a closing quote
   * @param char - Character to check
   * @returns True if closing quote
   */
  static isClosingQuote(char: string): boolean {
    return (QUOTE_CATEGORIES.CLOSING as readonly string[]).includes(char);
  }

  /**
   * Check if character is any type of quote
   * @param char - Character to check
   * @returns True if any quote type
   */
  static isQuote(char: string): boolean {
    return (QUOTE_CATEGORIES.ALL as readonly string[]).includes(char);
  }

  /**
   * Create regex pattern for opening quotes
   * @returns Regex matching opening quotes
   */
  static createOpeningQuoteRegex(): RegExp {
    const escapedQuotes = QUOTE_CATEGORIES.OPENING.map((q) =>
      q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return new RegExp(`[${escapedQuotes.join('')}]`);
  }

  /**
   * Create regex pattern for colon + quote combinations
   * @returns Regex matching colon followed by any quote
   */
  static createColonQuoteRegex(): RegExp {
    const escapedQuotes = QUOTE_CATEGORIES.ALL.map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`:([${escapedQuotes.join('')}])`, 'g');
  }

  /**
   * Create regex pattern for period + opening quote combinations
   * @returns Regex matching period followed by opening quote
   */
  static createPeriodQuoteRegex(): RegExp {
    const escapedOpeningQuotes = QUOTE_CATEGORIES.OPENING.map((q) =>
      q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return new RegExp(`([.。])([${escapedOpeningQuotes.join('')}])`, 'g');
  }
}
