/**
 * Unified Quote Type System
 * Centralizes all quote handling and Unicode definitions
 * Replaces scattered hardcoded Unicode values throughout the codebase
 */

/**
 * Quote type name enumeration
 */
export type QuoteTypeName =
  | 'straight_double'
  | 'straight_single'
  | 'curly_open_double'
  | 'curly_close_double'
  | 'curly_open_single'
  | 'curly_close_single'
  | 'angle_open_double'
  | 'angle_close_double'
  | 'angle_open_single'
  | 'angle_close_single'
  | 'not_quote';

/**
 * Normalization target type
 */
export type NormalizeTarget = 'curly' | 'straight';

/**
 * Quote type information for debugging
 */
export interface QuoteInfo {
  /** The quote character */
  character: string;

  /** Unicode code point (e.g., "U+201C") */
  unicode: string;

  /** Whether this is any type of quote */
  isQuote: boolean;

  /** Whether this is an opening quote */
  isOpening: boolean;

  /** Whether this is a closing quote */
  isClosing: boolean;

  /** Descriptive quote type name */
  type: QuoteTypeName;
}

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
   * Create regex pattern for closing quotes
   * @returns Regex matching closing quotes
   */
  static createClosingQuoteRegex(): RegExp {
    const escapedQuotes = QUOTE_CATEGORIES.CLOSING.map((q) =>
      q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    return new RegExp(`[${escapedQuotes.join('')}]`);
  }

  /**
   * Create regex pattern for all quotes
   * @returns Regex matching any quote type
   */
  static createAllQuotesRegex(): RegExp {
    const escapedQuotes = QUOTE_CATEGORIES.ALL.map((q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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

  /**
   * Get quote type information for debugging
   * @param char - Character to analyze
   * @returns Quote type information
   */
  static getQuoteInfo(char: string): QuoteInfo {
    return {
      character: char,
      unicode: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      isQuote: this.isQuote(char),
      isOpening: this.isOpeningQuote(char),
      isClosing: this.isClosingQuote(char),
      type: this.getQuoteType(char),
    };
  }

  /**
   * Get descriptive quote type name
   * @param char - Quote character
   * @returns Type description
   */
  static getQuoteType(char: string): QuoteTypeName {
    switch (char) {
      case QUOTE_TYPES.STRAIGHT_DOUBLE:
        return 'straight_double';
      case QUOTE_TYPES.STRAIGHT_SINGLE:
        return 'straight_single';
      case QUOTE_TYPES.CURLY_OPEN_DOUBLE:
        return 'curly_open_double';
      case QUOTE_TYPES.CURLY_CLOSE_DOUBLE:
        return 'curly_close_double';
      case QUOTE_TYPES.CURLY_OPEN_SINGLE:
        return 'curly_open_single';
      case QUOTE_TYPES.CURLY_CLOSE_SINGLE:
        return 'curly_close_single';
      case QUOTE_TYPES.ANGLE_OPEN_DOUBLE:
        return 'angle_open_double';
      case QUOTE_TYPES.ANGLE_CLOSE_DOUBLE:
        return 'angle_close_double';
      case QUOTE_TYPES.ANGLE_OPEN_SINGLE:
        return 'angle_open_single';
      case QUOTE_TYPES.ANGLE_CLOSE_SINGLE:
        return 'angle_close_single';
      default:
        return 'not_quote';
    }
  }

  /**
   * Normalize quotes to consistent type
   * @param text - Text with mixed quote types
   * @param targetType - Target quote type ('curly' or 'straight')
   * @returns Text with normalized quotes
   */
  static normalizeQuotes(text: string, targetType: NormalizeTarget = 'curly'): string {
    if (targetType === 'curly') {
      // Simple approach: replace all straight double quotes with curly opening quotes
      // More sophisticated logic would need context to determine opening vs closing
      return text
        .replace(/"/g, QUOTE_TYPES.CURLY_OPEN_DOUBLE)
        .replace(/'/g, QUOTE_TYPES.CURLY_OPEN_SINGLE);
    } else if (targetType === 'straight') {
      return text
        .replace(/[\u201c\u201d]/g, QUOTE_TYPES.STRAIGHT_DOUBLE)
        .replace(/[\u2018\u2019]/g, QUOTE_TYPES.STRAIGHT_SINGLE);
    }
    return text;
  }
}
