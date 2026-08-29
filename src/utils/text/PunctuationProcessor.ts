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
 * Punctuation sequence processor
 * Handles systematic spacing of punctuation sequences
 */
export class PunctuationProcessor {
  private readonly OPENING_PUNCT: readonly string[];
  private readonly OPENING_BRACKET_PATTERN: RegExp;
  private readonly SPECIAL_PATTERNS: SpecialPattern[];
  private readonly SPACED_CLOSE_MIDDLE_OPEN: RegExp;
  private readonly SPACED_MIDDLE_OPEN: RegExp;
  private readonly COMMA_OPENING_QUOTE: RegExp;

  constructor() {
    // Define punctuation categories for systematic processing
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
      const isDivisionSlash = punctuation === '/' || punctuation === '~' || punctuation === '～'; // range/wave operators stay adjacent to content
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
      } else if (endsWithOpeningQuote) {
        // Anything (closing element, middle punctuation like "!", or both — e.g. »«, !"")
        // followed by a trailing opening-quote run → space BETWEEN the run and what precedes
        // it, not after. Was previously gated on `CLOSING_PUNCT.includes(result[0])`, which
        // only matched a bare closing-element prefix and missed sequences like "！”“" (a
        // sentence-ending "！" plus a closing quote plus the next dialogue's opening quote).
        let splitIdx = result.length;
        while (splitIdx > 0 && QuoteProcessor.isOpeningQuote(result[splitIdx - 1])) {
          splitIdx--;
        }
        const hasPrefixBeforeOpeningQuotes = splitIdx > 0 && result[splitIdx - 1] !== ' ';
        if (hasPrefixBeforeOpeningQuotes && !isCommaOpeningQuoteCombo) {
          result = result.slice(0, splitIdx) + ' ' + result.slice(splitIdx);
        }
      }
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
}
