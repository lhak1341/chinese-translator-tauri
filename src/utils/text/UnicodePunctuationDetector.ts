/**
 * Unicode-based Punctuation Detection System
 * Provides comprehensive punctuation category support beyond hardcoded lists
 * Enables user-configurable separator rules for better text chunking
 */

import { logger } from '../logger.js';

/**
 * Unicode punctuation category codes
 */
export type PunctuationCategory = 'Po' | 'Pe' | 'Ps' | 'Pi' | 'Pf' | 'Pd' | 'Pc';

/**
 * Configuration for Unicode punctuation detection
 */
export interface UnicodePunctuationConfig {
  /** Which Unicode punctuation categories to treat as separators */
  enabledCategories?: Record<PunctuationCategory, boolean>;

  /** Additional custom separators (fallback for browsers without Unicode property support) */
  customSeparators?: string[];

  /** Characters to exclude even if they're in enabled categories */
  excludedCharacters?: Set<string>;

  /** Characters to force include as separators */
  includedCharacters?: Set<string>;
}

/**
 * Complete configuration with defaults applied
 */
interface ResolvedConfig {
  enabledCategories: Record<PunctuationCategory, boolean>;
  customSeparators: string[];
  excludedCharacters: Set<string>;
  includedCharacters: Set<string>;
}

/**
 * Compiled regular expressions for punctuation detection
 */
interface CompiledRegexes {
  /** Regex to match all punctuation (Unicode properties) */
  allPunctuation?: RegExp;

  /** Regex to test single character (Unicode properties) */
  punctuationTest?: RegExp;

  /** Fallback regex to test single character */
  fallbackTest: RegExp;

  /** Fallback regex to match all punctuation */
  fallbackAll: RegExp;
}

/**
 * Information about a character's Unicode properties
 */
export interface CharacterInfo {
  /** The character itself */
  character: string;

  /** Unicode code point (decimal) */
  codePoint: number;

  /** Hexadecimal code */
  hexCode: string;

  /** Whether this character is treated as a separator */
  isSeparator: boolean;

  /** Unicode punctuation categories detected */
  detectedCategories: PunctuationCategory[];
}

/**
 * Information about a Unicode punctuation category
 */
export interface CategoryInfo {
  /** Category code (e.g., 'Po') */
  code: PunctuationCategory;

  /** Human-readable name */
  name: string;

  /** Detailed description */
  description: string;

  /** Whether enabled by default */
  default: boolean;
}

/**
 * Unicode-based punctuation detector with configurable categories
 */
export class UnicodePunctuationDetector {
  private config: ResolvedConfig;
  private supportsUnicodeProperties: boolean;
  private compiledRegexes: CompiledRegexes;

  /**
   * Create a new Unicode punctuation detector
   * @param config - Configuration options
   */
  constructor(config: UnicodePunctuationConfig = {}) {
    // Default configuration for which Unicode punctuation categories to treat as separators
    this.config = {
      // Core punctuation categories that should split chunks
      enabledCategories: {
        Po: true, // Other Punctuation (., !, ?, :, ;, etc.)
        Pe: true, // Close Punctuation (], ), }, 》, 】, etc.)
        Ps: true, // Open Punctuation ([, (, {, 《, 【, etc.)
        Pi: true, // Initial Punctuation (opening quotes)
        Pf: true, // Final Punctuation (closing quotes)
        Pd: false, // Dash Punctuation (-, —, etc.) - often part of words
        Pc: false, // Connector Punctuation (_) - often part of identifiers
      },

      // Additional custom separators (fallback for browsers without Unicode property support)
      customSeparators: [
        ',',
        '.',
        '!',
        '?',
        ';',
        ':',
        '，',
        '。',
        '．',
        '！',
        '？',
        '；',
        '：',
        '(',
        ')',
        '（',
        '）',
        '[',
        ']',
        '{',
        '}',
        '《',
        '》',
        '【',
        '】',
        '"',
        '\u201c',
        '\u201d',
        '\u2018',
        '\u2019',
        "'",
        '、',
        '…',
        '——',
        '－',
      ],

      // Allow users to disable specific characters even if they're in enabled categories
      excludedCharacters: new Set<string>(),

      // Allow users to force include specific characters
      includedCharacters: new Set<string>(),

      ...config,
    };

    // Test if browser supports Unicode property escapes
    this.supportsUnicodeProperties = this.testUnicodePropertySupport();

    // Pre-compile regexes for better performance
    this.compiledRegexes = this.compileRegexes();
  }

  /**
   * Test if the current JavaScript environment supports Unicode property escapes
   * @returns True if \p{...} syntax is supported
   */
  private testUnicodePropertySupport(): boolean {
    try {
      new RegExp('\\p{P}', 'u');
      return true;
    } catch (_e) {
      logger.warn('Unicode property escapes not supported, falling back to custom separator list');
      return false;
    }
  }

  /**
   * Compile regular expressions for efficient punctuation detection
   * @returns Compiled regex patterns
   */
  private compileRegexes(): CompiledRegexes {
    const regexes: Partial<CompiledRegexes> = {};

    if (this.supportsUnicodeProperties) {
      // Create Unicode property-based regexes for each enabled category
      const enabledCategories = (
        Object.keys(this.config.enabledCategories) as PunctuationCategory[]
      ).filter((cat) => this.config.enabledCategories[cat]);

      if (enabledCategories.length > 0) {
        const categoryPattern = enabledCategories.map((cat) => `\\p{${cat}}`).join('|');
        regexes.allPunctuation = new RegExp(`(${categoryPattern})`, 'gu');
        regexes.punctuationTest = new RegExp(`^(${categoryPattern})$`, 'u');
      }
    }

    // Always create fallback regex using custom separators
    const escapedSeparators = this.config.customSeparators.map((sep) =>
      sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    regexes.fallbackTest = new RegExp(`^[${escapedSeparators.join('')}]$`);
    regexes.fallbackAll = new RegExp(`([${escapedSeparators.join('')}])`, 'g');

    return regexes as CompiledRegexes;
  }

  /**
   * Check if a character is a punctuation separator according to current configuration
   * @param char - Single character to test
   * @returns True if character should be treated as a separator
   */
  isPunctuationSeparator(char: string): boolean {
    // Check user overrides first
    if (this.config.excludedCharacters.has(char)) {
      return false;
    }
    if (this.config.includedCharacters.has(char)) {
      return true;
    }

    // Use Unicode properties if available
    if (this.supportsUnicodeProperties && this.compiledRegexes.punctuationTest) {
      return this.compiledRegexes.punctuationTest.test(char);
    }

    // Fallback to custom separator list
    return this.compiledRegexes.fallbackTest.test(char);
  }

  /**
   * Get all punctuation separators from a text string
   * @param text - Text to analyze
   * @returns Array of separator characters found
   */
  findAllSeparators(text: string): string[] {
    if (this.supportsUnicodeProperties && this.compiledRegexes.allPunctuation) {
      const matches = text.match(this.compiledRegexes.allPunctuation) || [];
      return matches.filter((char) => !this.config.excludedCharacters.has(char));
    }

    // Fallback method
    const matches = text.match(this.compiledRegexes.fallbackAll) || [];
    return matches.filter((char) => !this.config.excludedCharacters.has(char));
  }

  /**
   * Get Unicode category information for a character (diagnostic)
   * @param char - Single character to analyze
   * @returns Information about the character's Unicode properties
   */
  getCharacterInfo(char: string): CharacterInfo {
    const codePoint = char.codePointAt(0) || 0;

    const info: CharacterInfo = {
      character: char,
      codePoint: codePoint,
      hexCode: '0x' + codePoint.toString(16).toUpperCase(),
      isSeparator: this.isPunctuationSeparator(char),
      detectedCategories: [],
    };

    if (this.supportsUnicodeProperties) {
      // Test each punctuation category
      const categories: PunctuationCategory[] = ['Po', 'Pe', 'Ps', 'Pi', 'Pf', 'Pd', 'Pc'];
      for (const cat of categories) {
        try {
          const regex = new RegExp(`\\p{${cat}}`, 'u');
          if (regex.test(char)) {
            info.detectedCategories.push(cat);
          }
        } catch (_e) {
          // Category not supported
        }
      }
    }

    return info;
  }

  /**
   * Update configuration and recompile regexes
   * @param newConfig - New configuration options
   */
  updateConfig(newConfig: Partial<UnicodePunctuationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.compiledRegexes = this.compileRegexes();
  }

  /**
   * Get current configuration for debugging/settings UI
   * @returns Current configuration (deep copy)
   */
  getConfig(): ResolvedConfig {
    return {
      ...this.config,
      excludedCharacters: new Set(this.config.excludedCharacters),
      includedCharacters: new Set(this.config.includedCharacters),
    };
  }

  /**
   * Get supported Unicode punctuation categories
   * @returns List of category information
   */
  static getSupportedCategories(): CategoryInfo[] {
    return [
      {
        code: 'Po',
        name: 'Other Punctuation',
        description: 'Period, comma, exclamation, question mark, etc.',
        default: true,
      },
      {
        code: 'Pe',
        name: 'Close Punctuation',
        description: 'Closing brackets, parentheses, etc.',
        default: true,
      },
      {
        code: 'Ps',
        name: 'Open Punctuation',
        description: 'Opening brackets, parentheses, etc.',
        default: true,
      },
      {
        code: 'Pi',
        name: 'Initial Punctuation',
        description: 'Opening quotation marks',
        default: true,
      },
      {
        code: 'Pf',
        name: 'Final Punctuation',
        description: 'Closing quotation marks',
        default: true,
      },
      {
        code: 'Pd',
        name: 'Dash Punctuation',
        description: 'Hyphens, dashes (often part of words)',
        default: false,
      },
      {
        code: 'Pc',
        name: 'Connector Punctuation',
        description: 'Underscore, etc. (often part of identifiers)',
        default: false,
      },
    ];
  }
}
