/**
 * Unified Punctuation Sequence Processor
 * Replaces scattered spacing logic with systematic approach
 *
 * Handles all punctuation sequences by parsing them into components:
 * - Closing elements: ], ), }, 】, 》, ）
 * - Middle punctuation: ,, ., !, ?, :, ;, etc.
 * - Opening elements: [, (, {, ", ", etc.
 */

import { QuoteProcessor, QUOTE_CATEGORIES } from './QuoteProcessor';

/**
 * Special punctuation pattern replacement rule
 */
interface SpecialPattern {
  /** Regular expression to match */
  regex: RegExp;

  /** Replacement string (can include capture groups like $1, $2) */
  replacement: string;
}

/**
 * Punctuation sequence components
 * Represents parsed punctuation broken into closing/middle/opening parts
 */
export interface PunctuationComponents {
  /** Closing punctuation (brackets, parentheses, quotes) */
  closing: string[];

  /** Middle punctuation (periods, commas, etc.) */
  middle: string[];

  /** Opening punctuation (brackets, parentheses, quotes) */
  opening: string[];
}

/**
 * Debug information about punctuation processing
 */
export interface PunctuationDebugInfo {
  /** Original punctuation string */
  original: string;

  /** Parsed components */
  components: PunctuationComponents;

  /** Processed result with proper spacing */
  processed: string;

  /** Whether sequence contains opening elements */
  hasOpening: boolean;

  /** Whether sequence contains closing elements */
  hasClosing: boolean;

  /** Whether sequence was already properly spaced */
  alreadySpaced: boolean;
}

/**
 * Punctuation sequence processor
 * Handles systematic spacing of punctuation sequences
 */
export class PunctuationProcessor {
  private readonly CLOSING_PUNCT: readonly string[];
  private readonly MIDDLE_PUNCT: readonly string[];
  private readonly OPENING_PUNCT: readonly string[];
  private readonly OPENING_BRACKET_PATTERN: RegExp;
  private readonly SPECIAL_PATTERNS: SpecialPattern[];
  private readonly SPACED_CLOSE_MIDDLE_OPEN: RegExp;
  private readonly SPACED_MIDDLE_OPEN: RegExp;
  private readonly COMMA_OPENING_QUOTE: RegExp;

  constructor() {
    // Define punctuation categories for systematic processing
    this.CLOSING_PUNCT = [']', ')', '}', '】', '》', '）', ...QUOTE_CATEGORIES.CLOSING]; // Closing brackets + quotes
    this.MIDDLE_PUNCT = [
      ',',
      '.',
      '!',
      '?',
      ':',
      ';',
      '，',
      '。',
      '！',
      '？',
      '：',
      '；',
      '、',
      '…',
      '……',
      '－',
      '——',
    ]; // Sentence punctuation
    this.OPENING_PUNCT = ['[', '(', '{', '【', '《', '（', ...QUOTE_CATEGORIES.OPENING]; // Opening brackets + quotes

    // Common regex pattern for opening brackets (excluding quotes)
    this.OPENING_BRACKET_PATTERN = /[[(（【《{]/;

    // Special handling patterns (using centralized quote definitions)
    this.SPECIAL_PATTERNS = [
      // Colon + quote combinations: : " → : "
      { regex: QuoteProcessor.createColonQuoteRegex(), replacement: ': $1' },
      // Colon + opening bracket: :( → : ( (both Chinese and ASCII colons)
      { regex: /([：:])([[（【(])/g, replacement: '$1 $2' },
      // Period + opening quote: ." → . " (both Chinese and ASCII periods)
      { regex: QuoteProcessor.createPeriodQuoteRegex(), replacement: '$1 $2' },
      // Period + opening bracket: .[ → . [ (both Chinese and ASCII periods)
      { regex: /([.。])([[（【(])/g, replacement: '$1 $2' },
      // Question mark + opening bracket: ?[ → ? [ (both Chinese and ASCII question marks)
      { regex: /([?？])([[（【(])/g, replacement: '$1 $2' },
      // Exclamation mark + opening bracket: ![ → ! [ (both Chinese and ASCII exclamation marks)
      { regex: /([!！])([[（【(])/g, replacement: '$1 $2' },
    ];

    // Pre-compile spacing-check regexes (used in isAlreadyProperlySpaced hot path)
    const openingQuotePattern = QuoteProcessor.createOpeningQuoteRegex().source;
    this.SPACED_CLOSE_MIDDLE_OPEN = new RegExp(
      `[\\])\\}】》）][.,!?:;，。！？：；、]\\s+[\\[({【《（${openingQuotePattern}]`
    );
    this.SPACED_MIDDLE_OPEN = new RegExp(
      `[.,!?:;，。！？：；、]\\s+[\\[({【《（${openingQuotePattern}]`
    );
    this.COMMA_OPENING_QUOTE = new RegExp(`([,，])(${openingQuotePattern})`, 'g');
  }

  /**
   * Process a punctuation sequence and return properly spaced version
   * @param punctuation - Raw punctuation sequence (e.g., "],[")
   * @param hasNextChunk - Whether there's content after this punctuation
   * @returns Properly spaced punctuation
   */
  processSequence(punctuation: string, hasNextChunk: boolean = true): string {
    if (!punctuation) return '';

    // Quick check: if already properly spaced, return as-is
    if (this.isAlreadyProperlySpaced(punctuation)) {
      return punctuation;
    }

    // Handle special patterns first
    let processed = punctuation;
    for (const pattern of this.SPECIAL_PATTERNS) {
      processed = processed.replace(pattern.regex, pattern.replacement);
    }

    // If already handled by special pattern, return
    if (processed !== punctuation) {
      return processed;
    }

    // PRESERVE ORIGINAL ORDER with proper spacing for comma-quote sequences
    let result = punctuation;

    // Handle comma-quote combinations properly
    const hasComma = punctuation.includes(',') || punctuation.includes('，');
    const hasQuote = Array.from(punctuation).some((char) => QuoteProcessor.isQuote(char));

    if (hasComma && hasQuote) {
      // For comma + opening quote: add space between them (", ")
      this.COMMA_OPENING_QUOTE.lastIndex = 0;
      result = result.replace(this.COMMA_OPENING_QUOTE, '$1 $2');
    }

    // Special case: single opening quote should get space before it
    const isOnlyOpeningQuote =
      punctuation.length === 1 && QuoteProcessor.isOpeningQuote(punctuation);
    if (isOnlyOpeningQuote && hasNextChunk) {
      result = ' ' + result; // Space before the quote
    } else {
      // Add trailing space for normal punctuation (including closing quotes)
      // But not if we already have proper spacing or if it's comma+opening quote combo
      // But not for opening brackets/parentheses - they should be adjacent to content
      const isCommaOpeningQuoteCombo =
        hasComma &&
        hasQuote &&
        Array.from(punctuation).some((char) => QuoteProcessor.isOpeningQuote(char));
      const hasOpeningBracket = this.OPENING_BRACKET_PATTERN.test(punctuation);
      const isDivisionSlash = punctuation === '/'; // Don't add space after / (division operator)
      // Multi-char sequences ending with an opening quote (e.g. "«, '«) must not get trailing
      // space — the content that follows belongs inside the quote, not after a gap.
      const endsWithOpeningQuote = QuoteProcessor.isOpeningQuote(result[result.length - 1]);
      const needsTrailingSpace =
        hasNextChunk &&
        !result.endsWith(' ') &&
        !isOnlyOpeningQuote &&
        !endsWithOpeningQuote &&
        !isCommaOpeningQuoteCombo &&
        !hasOpeningBracket &&
        !isDivisionSlash;

      if (needsTrailingSpace) {
        result += ' ';
      }
    }

    return result;
  }

  /**
   * Parse punctuation sequence into closing, middle, and opening components
   * Natural order: closing elements first, then middle punctuation, then opening elements
   * @param punct - Punctuation sequence
   * @returns Components object with closing, middle, opening arrays
   */
  parseComponents(punct: string): PunctuationComponents {
    const chars = Array.from(punct);
    const components: PunctuationComponents = {
      closing: [],
      middle: [],
      opening: [],
    };

    // Parse in natural order: closing → middle → opening
    // This handles sequences like "],[" or "),"

    let index = 0;

    // 1. First, collect any closing punctuation
    while (index < chars.length && this.CLOSING_PUNCT.includes(chars[index])) {
      components.closing.push(chars[index]);
      index++;
    }

    // 2. Then, collect any middle punctuation (sentence punctuation)
    while (index < chars.length && this.MIDDLE_PUNCT.includes(chars[index])) {
      components.middle.push(chars[index]);
      index++;
    }

    // 3. Finally, collect any opening punctuation
    while (index < chars.length && this.OPENING_PUNCT.includes(chars[index])) {
      components.opening.push(chars[index]);
      index++;
    }

    // 4. Handle any remaining characters (treat as middle)
    while (index < chars.length) {
      components.middle.push(chars[index]);
      index++;
    }

    return components;
  }

  /**
   * Apply spacing rules to parsed components
   * @param components - Parsed components
   * @param hasNextChunk - Whether there's content after
   * @returns Properly spaced punctuation
   */
  applySpacingRules(components: PunctuationComponents, hasNextChunk: boolean): string {
    // Special case: if sequence starts with opening punctuation, preserve original order
    // This handles cases like ""……" where quote should come before ellipsis
    if (components.opening.length > 0 && components.closing.length === 0) {
      let result = '';

      // 1. Add opening punctuation first
      result += components.opening.join('');

      // 2. Add middle punctuation after opening
      if (components.middle.length > 0) {
        result += components.middle.join('');
      }

      // 3. Add space after if there's content following
      // BUT NOT for opening brackets/parentheses - they should be adjacent to content
      if (hasNextChunk) {
        const openingStr = components.opening.join('');
        const isOpeningBracket = this.OPENING_BRACKET_PATTERN.test(openingStr);

        if (!isOpeningBracket) {
          result += ' ';
        }
      }

      return result;
    }

    // Standard order: closing → middle → opening
    let result = '';

    // 1. Add closing punctuation (no space before)
    if (components.closing.length > 0) {
      result += components.closing.join('');

      // Add space after closing punctuation if there's content following
      // Exception: don't add space if there's opening punctuation coming (handled separately)
      if (hasNextChunk && components.opening.length === 0 && components.middle.length === 0) {
        result += ' ';
      }
    }

    // 2. Add middle punctuation with space after (if there's content following)
    if (components.middle.length > 0) {
      result += components.middle.join('');
      if (hasNextChunk && components.opening.length === 0) {
        result += ' ';
      }
    }

    // 3. Add opening punctuation with space before (unless at start or after ellipsis)
    if (components.opening.length > 0) {
      const openingStr = components.opening.join('');

      // Add space before opening punctuation if there's already content
      // Exception: no extra space after ellipsis (it already has space from middle punctuation)
      if (result.length > 0 && !result.endsWith(' ')) {
        result += ' ';
      }

      result += openingStr;
    }

    return result;
  }

  /**
   * Check if punctuation sequence contains opening elements
   * @param punctuation - Punctuation to check
   * @returns True if contains opening elements
   */
  hasOpeningElements(punctuation: string): boolean {
    return this.OPENING_PUNCT.some((punct) => punctuation.includes(punct));
  }

  /**
   * Check if punctuation sequence contains closing elements
   * @param punctuation - Punctuation to check
   * @returns True if contains closing elements
   */
  hasClosingElements(punctuation: string): boolean {
    return this.CLOSING_PUNCT.some((punct) => punctuation.includes(punct));
  }

  /**
   * Check if punctuation sequence is already properly spaced
   * @param punctuation - Punctuation to check
   * @returns True if already properly spaced
   */
  isAlreadyProperlySpaced(punctuation: string): boolean {
    // Pattern: closing + middle + space + opening (e.g., "], [")
    if (this.SPACED_CLOSE_MIDDLE_OPEN.test(punctuation)) {
      return true;
    }

    // Pattern: middle + space + opening (e.g., ". [", ", "")
    if (this.SPACED_MIDDLE_OPEN.test(punctuation)) {
      return true;
    }

    return false;
  }

  /**
   * Get debug information about how punctuation was parsed
   * @param punctuation - Original punctuation
   * @returns Debug information
   */
  getDebugInfo(punctuation: string): PunctuationDebugInfo {
    const components = this.parseComponents(punctuation);
    const processed = this.processSequence(punctuation);

    return {
      original: punctuation,
      components: components,
      processed: processed,
      hasOpening: this.hasOpeningElements(punctuation),
      hasClosing: this.hasClosingElements(punctuation),
      alreadySpaced: this.isAlreadyProperlySpaced(punctuation),
    };
  }
}
